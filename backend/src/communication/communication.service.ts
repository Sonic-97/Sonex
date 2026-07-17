import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { MessagesService } from '../messages/messages.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrderFlowService } from '../order-flow/order-flow.service';
import { AiService } from '../ai/ai.service';
import { OrdersService } from '../orders/orders.service';
import { LidMappingService } from '../lid-mapping/lid-mapping.service';
import { LidResolverService } from '../lid-resolver/lid-resolver.service';
import { PendingReplyService } from '../pending-reply/pending-reply.service';
import { EventBusService } from '../events/event-bus.service';
import { NormalizedWhatsAppMessage } from './dto/whatsapp-webhook.dto';

@Injectable()
export class CommunicationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CommunicationService.name);
  private defaultCafeId: string | null = null;

  constructor(
    private readonly messagesService: MessagesService,
    private readonly whatsappService: WhatsappService,
    private readonly prisma: PrismaService,
    private readonly orderFlowService: OrderFlowService,
    private readonly aiService: AiService,
    private readonly ordersService: OrdersService,
    private readonly lidMappingService: LidMappingService,
    private readonly lidResolverService: LidResolverService,
    private readonly pendingReplyService: PendingReplyService,
    private readonly eventBus: EventBusService,
  ) {}

  async onApplicationBootstrap() {
    await this.whatsappService.registerWebhook();
    const allMappings = await this.prisma.lidMapping.findMany({
      where: { phoneJid: { not: null } },
      select: { lid: true, phoneJid: true },
    });
    this.whatsappService.setLidMappingCache(allMappings.map(m => ({ lid: m.lid, phoneJid: m.phoneJid })));

    const firstCafe = await this.prisma.cafe.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } });
    if (firstCafe) {
      this.defaultCafeId = firstCafe.id;
      this.logger.log(`[Init] Cached defaultCafeId=${this.defaultCafeId}`);
    }

    setInterval(() => {
      if (this.defaultCafeId) {
        this.scheduledRetryPendingReplies(this.defaultCafeId).catch(err =>
          this.logger.warn(`[PendingReply Scheduler] Retry failed: ${(err as Error).message}`),
        );
      }
    }, 300000).unref();
  }

  private async scheduledRetryPendingReplies(cafeId: string): Promise<void> {
    const pendingLids = await this.prisma.pendingReply.findMany({
      where: { status: 'pending', ...(cafeId ? { cafeId } : {}) },
      select: { lid: true },
      distinct: ['lid'],
    });

    for (const { lid } of pendingLids) {
      await this.retryPendingRepliesForLid(lid, cafeId);
    }
  }

  async handleNormalized(normalized: NormalizedWhatsAppMessage) {
    const traceId = `TRACE-${Date.now()}`;

    this.logger.log(`[${traceId}] Publishing normalized message.received: source=${normalized.source} msgId=${normalized.messageId} from=${normalized.from}`);

    await this.eventBus.publish('message.received', {
      messageId: normalized.messageId,
      remoteJid: normalized.from,
      message: normalized.body,
      participant: '',
      fromMe: false,
      timestamp: normalized.timestamp,
    }, this.defaultCafeId || '', { dedupKey: normalized.messageId || undefined });

    return { status: 'accepted', traceId };
  }

  async handleMessage(body: any) {
    const traceId = `TRACE-${Date.now()}`;
    const cafeId = body.cafeId || this.defaultCafeId;

    this.logger.log(`[${traceId}] Publishing message.received event via event bus`);

    const message = body?.data?.body || body?.payload?.body || body?.message || '';
    const messageId = body?.data?.id || body?.payload?.id || body?.messageId || '';
    const remoteJid = body?.data?.from || body?.payload?.from || body?.data?.chatId || body?.payload?.chatId || '';

    await this.eventBus.publish('message.received', {
      messageId,
      remoteJid,
      message,
      participant: body?.data?.author || body?.payload?.author || '',
      fromMe: false,
      timestamp: Date.now(),
    }, cafeId || '', { dedupKey: messageId || undefined });

    return { status: 'accepted', traceId };
  }

  async handleMessageLegacy(body: any) {
    this.logger.warn('handleMessageLegacy called — delegating to async handleMessage (legacy sync path removed)');
    return this.handleMessage(body);
  }

  async resolveSender(body: any, cafeId?: string): Promise<{ phone: string; senderJid: string; resolvedPath: string }> {
    const senderRemoteJid = body?.remoteJid || body?.phone || '';
    const isTelegram = /^\d+$/.test(senderRemoteJid) && !senderRemoteJid.includes('@') && !senderRemoteJid.startsWith('tg_');

    if (isTelegram) {
      return {
        phone: `tg_${senderRemoteJid}`,
        senderJid: senderRemoteJid,
        resolvedPath: 'TELEGRAM_CHAT_ID',
      };
    }

    if (body?.event !== 'message.received') {
      const p = body?.phone || body?.remoteJid || '';
      return {
        phone: p.split('@')[0],
        senderJid: p,
        resolvedPath: 'DIRECT_BODY_PAYLOAD',
      };
    }

    const dataObj = body.data || body.payload;
    if (!dataObj) {
      const p = body?.phone || body?.remoteJid || '';
      return {
        phone: p.split('@')[0],
        senderJid: p,
        resolvedPath: 'FALLBACK_NO_DATA_OBJECT',
      };
    }

    this.logger.log(`[Sender Resolution Trace]
      - key.remoteJid: ${dataObj.from || dataObj.chatId || 'N/A'}
      - key.participant: ${dataObj.author || dataObj.participant || 'N/A'}
      - pushName: ${dataObj.contact?.pushName || 'N/A'}
      - messageContextInfo: ${dataObj.messageContextInfo ? JSON.stringify(dataObj.messageContextInfo) : 'N/A'}
    `);

    // 1. Inspect dataObj.senderPhone (resolved from OpenWA/Baileys engine)
    if (dataObj.senderPhone) {
      const sp = dataObj.senderPhone;
      this.logger.log(`[Sender Resolution] Path: payload_senderPhone | Phone: ${sp}`);
      return {
        phone: sp,
        senderJid: `${sp}@c.us`,
        resolvedPath: 'payload_senderPhone',
      };
    }

    // 2. Inspect remoteJid (dataObj.from or dataObj.chatId)
    const remoteJid = dataObj.from || dataObj.chatId;
    if (remoteJid) {
      if (remoteJid.endsWith('@c.us') || remoteJid.endsWith('@s.whatsapp.net')) {
        const sp = remoteJid.split('@')[0];
        this.logger.log(`[Sender Resolution] Path: remoteJid_direct | JID: ${remoteJid}`);
        return {
          phone: sp,
          senderJid: `${sp}@c.us`,
          resolvedPath: 'remoteJid_direct',
        };
      }

      if (remoteJid.endsWith('@lid')) {
        const lidUserpart = remoteJid.split('@')[0];
        // Try to resolve through contacts store check
        let resolvedPhone = await this.whatsappService.getContactPhone(remoteJid);
        // RULE 1: NEVER treat LID userpart as a phone number
        if (resolvedPhone && resolvedPhone.replace(/[^0-9]/g, '') === lidUserpart) {
          this.logger.warn(`getContactPhone returned LID userpart for ${remoteJid} — ignoring`);
          resolvedPhone = null;
        }
        if (resolvedPhone) {
          this.logger.log(JSON.stringify({
            event: 'TRACE_LID_RESOLVED',
            traceId: 'resolution',
            cafeId,
            lid: remoteJid,
            phone: resolvedPhone,
          }));

          try {
            await this.prisma.$transaction(async (tx) => {
              // 1. Upsert LidMapping
              const cleanLid = remoteJid.includes('@') ? remoteJid : `${remoteJid}@lid`;
              const phoneJid = `${resolvedPhone}@c.us`;
              await tx.lidMapping.upsert({
                where: { cafeId_lid: { cafeId: cafeId || this.defaultCafeId || '', lid: cleanLid } },
                create: {
                  lid: cleanLid,
                  phone: resolvedPhone,
                  phoneJid,
                  source: 'message_incoming',
                  cafeId: cafeId || this.defaultCafeId || '',
                },
                update: {
                  phone: resolvedPhone,
                  phoneJid,
                  source: 'message_incoming',
                  lastSeenAt: new Date(),
                },
              });

              this.logger.log(JSON.stringify({
                event: 'TRACE_LID_MAPPING_UPSERT',
                traceId: 'resolution',
                cafeId,
                lid: cleanLid,
                phone: resolvedPhone,
              }));

              // 2. Find and update customer
              const branch = await tx.branch.findFirst({
                where: cafeId ? { cafeId } : {},
              });
              if (branch) {
                const existingPhoneCustomer = await tx.customer.findUnique({
                  where: { cafeId_branchId_phone: { cafeId: cafeId || this.defaultCafeId || '', branchId: branch.id, phone: resolvedPhone } },
                });

                if (existingPhoneCustomer) {
                  await tx.customer.update({
                    where: { id: existingPhoneCustomer.id },
                    data: {
                      lidJid: cleanLid,
                      phoneJid,
                      lastKnownJid: phoneJid,
                      lastResolvedAt: new Date(),
                    },
                  });
                } else {
                  await tx.customer.create({
                    data: {
                      cafeId: cafeId || this.defaultCafeId || '',
                      branchId: branch.id,
                      phone: resolvedPhone,
                      phoneJid,
                      lidJid: cleanLid,
                      lastKnownJid: phoneJid,
                      lastResolvedAt: new Date(),
                    },
                  });
                }
              }
            });

            // Auto retry any pending replies
            this.retryPendingRepliesForLid(remoteJid, cafeId || this.defaultCafeId || '').catch(err =>
              this.logger.warn(`[AutoRetry] Failed for ${remoteJid}: ${(err as Error).message}`),
            );

          } catch (err) {
            this.logger.error(`[Sender Resolution] Transaction failed to persist LID mapping: ${(err as Error).message}`);
          }

          return {
            phone: resolvedPhone,
            senderJid: `${resolvedPhone}@c.us`,
            resolvedPath: 'remoteJid_lid_resolved_via_contacts_store',
          };
        }

        // Fallback: create temporary customer using lid_xxx
        this.logger.log(`[Sender Resolution] Path: remoteJid_lid_fallback_temp_identifier | LID: ${remoteJid}`);
        return {
          phone: `lid_${lidUserpart}`,
          senderJid: remoteJid,
          resolvedPath: 'remoteJid_lid_fallback_temp_identifier',
        };
      }
    }

    // 3. Inspect participant (dataObj.author or dataObj.participant)
    const participant = dataObj.author || dataObj.participant;
    if (participant) {
      if (participant.endsWith('@c.us') || participant.endsWith('@s.whatsapp.net')) {
        const sp = participant.split('@')[0];
        this.logger.log(`[Sender Resolution] Path: participant_direct | JID: ${participant}`);
        return {
          phone: sp,
          senderJid: `${sp}@c.us`,
          resolvedPath: 'participant_direct',
        };
      }

      if (participant.endsWith('@lid')) {
        const lidUserpart = participant.split('@')[0];
        let resolvedPhone = await this.whatsappService.getContactPhone(participant);
        // RULE 1: NEVER treat LID userpart as a phone number
        if (resolvedPhone && resolvedPhone.replace(/[^0-9]/g, '') === lidUserpart) {
          this.logger.warn(`getContactPhone returned LID userpart for ${participant} — ignoring`);
          resolvedPhone = null;
        }
        if (resolvedPhone) {
          this.logger.log(JSON.stringify({
            event: 'TRACE_LID_RESOLVED',
            traceId: 'resolution',
            cafeId,
            lid: participant,
            phone: resolvedPhone,
          }));

          try {
            await this.prisma.$transaction(async (tx) => {
              // 1. Upsert LidMapping
              const cleanLid = participant.includes('@') ? participant : `${participant}@lid`;
              const phoneJid = `${resolvedPhone}@c.us`;
              await tx.lidMapping.upsert({
                where: { cafeId_lid: { cafeId: cafeId || this.defaultCafeId || '', lid: cleanLid } },
                create: {
                  lid: cleanLid,
                  phone: resolvedPhone,
                  phoneJid,
                  source: 'message_incoming',
                  cafeId: cafeId || this.defaultCafeId || '',
                },
                update: {
                  phone: resolvedPhone,
                  phoneJid,
                  source: 'message_incoming',
                  lastSeenAt: new Date(),
                },
              });

              this.logger.log(JSON.stringify({
                event: 'TRACE_LID_MAPPING_UPSERT',
                traceId: 'resolution',
                cafeId,
                lid: cleanLid,
                phone: resolvedPhone,
              }));

              // 2. Find and update customer
              const branch = await tx.branch.findFirst({
                where: cafeId ? { cafeId } : {},
              });
              if (branch) {
                const existingPhoneCustomer = await tx.customer.findUnique({
                  where: { cafeId_branchId_phone: { cafeId: cafeId || this.defaultCafeId || '', branchId: branch.id, phone: resolvedPhone } },
                });

                if (existingPhoneCustomer) {
                  await tx.customer.update({
                    where: { id: existingPhoneCustomer.id },
                    data: {
                      lidJid: cleanLid,
                      phoneJid,
                      lastKnownJid: phoneJid,
                      lastResolvedAt: new Date(),
                    },
                  });
                } else {
                  await tx.customer.create({
                    data: {
                      cafeId: cafeId || this.defaultCafeId || '',
                      branchId: branch.id,
                      phone: resolvedPhone,
                      phoneJid,
                      lidJid: cleanLid,
                      lastKnownJid: phoneJid,
                      lastResolvedAt: new Date(),
                    },
                  });
                }
              }
            });

            // Auto retry any pending replies
            this.retryPendingRepliesForLid(participant, cafeId || this.defaultCafeId || '').catch(err =>
              this.logger.warn(`[AutoRetry] Failed for ${participant}: ${(err as Error).message}`),
            );

          } catch (err) {
            this.logger.error(`[Sender Resolution] Transaction failed to persist LID mapping for participant: ${(err as Error).message}`);
          }

          return {
            phone: resolvedPhone,
            senderJid: `${resolvedPhone}@c.us`,
            resolvedPath: 'participant_lid_resolved_via_contacts_store',
          };
        }

        this.logger.log(`[Sender Resolution] Path: participant_lid_fallback_temp_identifier | LID: ${participant}`);
        return {
          phone: `lid_${lidUserpart}`,
          senderJid: participant,
          resolvedPath: 'participant_lid_fallback_temp_identifier',
        };
      }
    }

    // 4. Fallback if absolutely everything is missing: use JID placeholder
    const fallbackId = `lid_unknown_${Date.now()}`;
    this.logger.log(`[Sender Resolution] Path: absolute_fallback_temp_identifier | ID: ${fallbackId}`);
    return {
      phone: fallbackId,
      senderJid: `${fallbackId}@lid`,
      resolvedPath: 'absolute_fallback_temp_identifier',
    };
  }

  async reconcileLidToPhone(lidUserpart: string, realPhone: string, cafeId: string): Promise<void> {
    const tempPhone = `lid_${lidUserpart}`;
    this.logger.log(`[Reconciliation] Attempting to reconcile temporary customer ${tempPhone} to real phone ${realPhone}...`);

    await this.prisma.$transaction(async (tx) => {
      await this.lidMappingService.upsert({
        lid: `${lidUserpart}@lid`,
        phone: realPhone,
        source: 'message_incoming',
        cafeId,
      });

      this.retryPendingRepliesForLid(`${lidUserpart}@lid`, cafeId).catch(err =>
        this.logger.warn(`[AutoRetry] Failed for lid_${lidUserpart}: ${(err as Error).message}`),
      );

      const branches = await tx.branch.findMany({
        where: cafeId ? { cafeId } : {},
      });

      for (const branch of branches) {
        const bid = branch.id;
        const cid = branch.cafeId;

        const tempCustomer = await tx.customer.findUnique({
          where: { cafeId_branchId_phone: { cafeId: cid, branchId: bid, phone: tempPhone } },
        });

        if (!tempCustomer) continue;

        const realCustomer = await tx.customer.findUnique({
          where: { cafeId_branchId_phone: { cafeId: cid, branchId: bid, phone: realPhone } },
        });

        if (realCustomer) {
          this.logger.log(`[Reconciliation] Merging temp customer ${tempCustomer.id} into existing real customer ${realCustomer.id}...`);

          await tx.order.updateMany({
            where: { customerId: tempCustomer.id },
            data: { customerId: realCustomer.id },
          });

          await tx.debt.updateMany({
            where: { customerId: tempCustomer.id },
            data: { customerId: realCustomer.id },
          });

          await tx.inCafeOrder.updateMany({
            where: { customerId: tempCustomer.id },
            data: { customerId: realCustomer.id },
          });

          await tx.customer.update({
            where: { id: realCustomer.id },
            data: {
              totalOrders: realCustomer.totalOrders + tempCustomer.totalOrders,
              totalSpent: Number(realCustomer.totalSpent) + Number(tempCustomer.totalSpent),
              unpaidBalance: Number(realCustomer.unpaidBalance) + Number(tempCustomer.unpaidBalance),
            },
          });

          await tx.customer.delete({
            where: { id: tempCustomer.id },
          });

        } else {
          this.logger.log(`[Reconciliation] Updating temp customer ${tempCustomer.id} phone number to ${realPhone} in-place...`);
          await tx.customer.update({
            where: { id: tempCustomer.id },
            data: { phone: realPhone },
          });
        }

        const hasTempSession = await this.orderFlowService.hasSession(tempPhone);
        if (hasTempSession) {
          this.logger.log(`[Reconciliation] Migrating order flow session from ${tempPhone} to ${realPhone}...`);
          const sessionData = await this.orderFlowService.getSession(tempPhone);
          if (sessionData) {
            sessionData.phone = realPhone;
            await this.orderFlowService.saveSession(realPhone, sessionData);
            await this.orderFlowService.deleteSession(tempPhone);
          }
        }
      }
    }).catch((err) => {
      this.logger.error(`[Reconciliation] Transaction FAILED for ${tempPhone} -> ${realPhone}: ${(err as Error).message}`, (err as Error).stack);
      throw err;
    });
  }

  async findSessionByLid(lid: string, traceId?: string): Promise<string | null> {
    const lidUserpart = lid.includes('@lid') ? lid.split('@')[0] : lid;
    const tempPhone = `lid_${lidUserpart}`;
    try {
      const session = await this.orderFlowService.getSession(tempPhone);
      if (session?.replyJid && !session.replyJid.includes('@lid')) {
        this.logger.log(`[XTRACE_${traceId}] Session cache resolved ${lid} -> ${session.replyJid}`);
        return session.replyJid;
      }
    } catch {
      // ignore
    }
    return null;
  }

  async findCustomerByLid(lid: string, cafeId?: string): Promise<string | null> {
    const lidUserpart = lid.includes('@lid') ? lid.split('@')[0] : lid;
    const tempPhone = `lid_${lidUserpart}`;
    try {
      if (cafeId) {
        const branch = await this.prisma.branch.findFirst({ where: { cafeId } });
        if (branch) {
          const customer = await this.prisma.customer.findFirst({
            where: {
              cafeId,
              branchId: branch.id,
              phone: tempPhone,
              phoneJid: { not: null },
            },
          });
          if (customer?.phoneJid) return customer.phoneJid;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  async retryPendingRepliesForLid(lid: string, cafeId: string): Promise<void> {
    const cleanLid = lid.includes('@lid') ? lid : `${lid}@lid`;
    const pending = await this.pendingReplyService.findPendingByLid(cleanLid, cafeId);
    if (pending.length === 0) return;

    this.logger.log(`[PendingReply Retry] ${pending.length} pending replies found for ${cleanLid} — attempting resolution`);

    const result = await this.lidResolverService.resolve(cleanLid, {
      findByLid: (l) => this.lidMappingService.findByLid(l),
      getContactPhone: (j) => this.whatsappService.getContactPhone(j),
      getContactDetails: (j) => this.whatsappService.getContactDetails(j),
      findSessionByLid: (l) => this.findSessionByLid(l),
      findCustomerByJid: (l, c) => this.findCustomerByLid(l, c),
    }, cafeId);

    if (result.phoneJid) {
      const resolved = await this.pendingReplyService.retryForLid(
        cleanLid,
        async (msg, _lid) => {
          await this.whatsappService.sendMessage(result.phoneJid, msg);
          return true;
        },
        cafeId,
      );
      this.logger.log(`[PendingReply Retry] Resolved ${resolved} pending replies for ${cleanLid} via step=${result.step}`);
    } else {
      this.logger.warn(`[PendingReply Retry] Still unresolved ${cleanLid} after waterfall — ${pending.length} replies remain pending`);
    }
  }
}




