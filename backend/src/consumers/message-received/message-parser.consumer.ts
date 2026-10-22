import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AiService } from '../../ai/ai.service';
import { GroundedAiEngineService } from '../../ai/grounded-ai-engine.service';
import { OrdersService } from '../../orders/orders.service';
import { OrderFlowService } from '../../order-flow/order-flow.service';
import { MessagesService } from '../../messages/messages.service';
import { WhatsappService } from '../../whatsapp/whatsapp.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LidMappingService } from '../../lid-mapping/lid-mapping.service';
import { PendingReplyService } from '../../pending-reply/pending-reply.service';
import { ReplyRouterService, CustomerRoutingInfo } from '../../reply-router/reply-router.service';
import { AppEvent } from '../../events/events.service';
import { EventBusService } from '../../events/event-bus.service';

@Injectable()
export class MessageParserConsumer {
  private readonly logger = new Logger(MessageParserConsumer.name);

  constructor(
    private readonly aiService: AiService,
    private readonly groundedAi: GroundedAiEngineService,
    private readonly ordersService: OrdersService,
    private readonly orderFlowService: OrderFlowService,
    private readonly messagesService: MessagesService,
    private readonly whatsappService: WhatsappService,
    private readonly prisma: PrismaService,
    private readonly lidMappingService: LidMappingService,
    private readonly pendingReplyService: PendingReplyService,
    private readonly replyRouter: ReplyRouterService,
    private readonly eventBus: EventBusService,
  ) {}

  @OnEvent('sender.resolved')
  async handle(payload: AppEvent): Promise<void> {
    const p = payload.payload as any;
    const traceId = `TRACE-MP-${Date.now()}`;
    const phone = p.phone as string;
    const cafeId = p.cafeId as string;

    const incomingFrom = p.remoteJid || p.phoneJid || '';
    console.log(`[${traceId}] MessageParserConsumer START: phone="${phone}" incomingFrom="${incomingFrom}" messageId="${p.messageId}"`);
    this.logger.log(`[${traceId}] MessageParserConsumer START: phone="${phone}" incomingFrom="${incomingFrom}" messageId="${p.messageId}" message="${(p.messageBody || '').substring(0, 50)}"`);

    const message = p.messageBody || '';
    const messageId = p.messageId || '';
    if (!message) {
      this.logger.log(`[${traceId}] No message text, skipping parse`);
      return;
    }

    try {
      if (messageId) {
        const existing = await this.prisma.whatsAppLog.findUnique({ where: { messageId } });
        if (existing) {
          this.logger.log(`[${traceId}] Duplicate messageId ${messageId}, skipping parse`);
          return;
        }
      }
    } catch (err) {
      this.logger.error(`[${traceId}] Dedup check error: ${(err as Error).message}`);
    }

    try {
      await this.prisma.whatsAppLog.create({
        data: {
          messageId,
          phone,
          message,
          direction: 'INCOMING',
          cafeId: cafeId || null,
        } as any,
      });
    } catch (err) {
      this.logger.error(`[${traceId}] Message log error: ${(err as Error).message}`);
    }

    try {
      await this.messagesService.logMessage({
        phone,
        content: message,
        role: 'customer',
        cafeId,
      });
    } catch (err) {
      this.logger.error(`[${traceId}] MessagesService.logMessage error: ${(err as Error).message}`);
    }

    let customer: any = null;
    try {
      if (cafeId) {
        const branch = await this.prisma.branch.findFirst({ where: { cafeId } });
        if (branch) {
          customer = await this.prisma.customer.findUnique({
            where: { cafeId_branchId_phone: { cafeId, branchId: branch.id, phone } },
            select: { id: true, name: true, phone: true, totalOrders: true, phoneJid: true, lidJid: true, lastKnownJid: true },
          });

          if (!customer && incomingFrom.includes('@lid')) {
            customer = await this.prisma.customer.findFirst({
              where: { cafeId, branchId: branch.id, lidJid: incomingFrom },
              select: { id: true, name: true, phone: true, totalOrders: true, phoneJid: true, lidJid: true, lastKnownJid: true },
            });
          }
        }
      }
    } catch {
      // ignore
    }

    let existingSession: any = null;
    try {
      existingSession = await this.orderFlowService.getSession(phone, cafeId);
    } catch {
      // ignore
    }

    try {
      const productContext = cafeId ? await this.getProductContext(cafeId) : undefined;
      let aiData: any;
      try {
        aiData = await this.aiService.parseMessage(message, productContext);
      } catch {
        aiData = { intent: 'unknown', items: [] };
      }

      let reply: string;

      // WhatsApp messages go through GroundedAiEngineService for tool-grounded execution.
      if (existingSession) {
        try {
          reply = await this.orderFlowService.handleMessage(phone, message, cafeId, p.phoneJid || undefined);
        } catch (err) {
          this.logger.error(`[${traceId}] OrderFlow error: ${(err as Error).message}`);
          reply = 'عذراً، حدث خطأ. حاول مرة أخرى.';
        }
      } else if (cafeId) {
        try {
          const groundedResult = await this.groundedAi.processCustomerMessage({
            cafeId,
            phone,
            customerName: customer?.name,
            message,
            isSimulation: false,
          });
          reply = groundedResult.reply;
          this.logger.log(`[${traceId}] Grounded AI replied. Tools called: ${groundedResult.toolsCalled?.length || 0}`);
        } catch (err) {
          this.logger.warn(`[${traceId}] Grounded AI failed, falling back to legacy: ${(err as Error).message}`);
          if (aiData.intent === 'create_order' && aiData.items?.length > 0) {
            try {
              reply = await this.orderFlowService.handleAIMessage(phone, aiData, cafeId, p.phoneJid || undefined);
            } catch {
              reply = 'عذراً، حدث خطأ أثناء معالجة طلبك. تحب تطلب خطوة بخطوة؟ اكتب "نعم" للبدء.';
            }
          } else {
            try {
              reply = await this.orderFlowService.handleMessage(phone, message, cafeId, p.phoneJid || undefined);
            } catch {
              reply = 'عذراً، حدث خطأ. حاول مرة أخرى.';
            }
          }
        }
      } else {
        try {
          reply = await this.orderFlowService.handleMessage(phone, message, cafeId, p.phoneJid || undefined);
        } catch (err) {
          this.logger.error(`[${traceId}] OrderFlow error: ${(err as Error).message}`);
          reply = 'عذراً، حدث خطأ. حاول مرة أخرى.';
        }
      }

      if (reply) {
        const customerInfo: CustomerRoutingInfo = {
          phoneJid: customer?.phoneJid || null,
          lidJid: customer?.lidJid || null,
          lastKnownJid: customer?.lastKnownJid || null,
        };

        const routing = this.replyRouter.getReplyDestination(customerInfo, cafeId);
        const targetJid = routing.destination;

        console.log(JSON.stringify({
          event: 'TRACE_SEND_START',
          traceId,
          customerId: customer?.id || null,
          cafeId,
          incomingFrom,
          phone,
          phoneJid: customerInfo.phoneJid,
          lidJid: customerInfo.lidJid,
          lastKnownJid: customerInfo.lastKnownJid,
          destination: targetJid,
          routingStrategy: routing.strategy,
          message: reply.substring(0, 100),
          stack: new Error().stack?.split('\n').slice(1, 4).join(' | '),
        }));
        this.logger.log(`[TRACE_SEND_START] traceId=${traceId} destination=${targetJid} strategy=${routing.strategy}`);

        if (!targetJid) {
          const lidForPending = incomingFrom.includes('@lid') ? incomingFrom : (customerInfo.lidJid || phone);
          console.log(JSON.stringify({
            event: 'TRACE_PENDING_REPLY_CREATED',
            traceId,
            reason: routing.reason,
            lid: lidForPending,
            cafeId,
          }));
          this.logger.warn('pending_reply_created: ' + routing.reason);
          await this.pendingReplyService.create({ lid: lidForPending, message: reply, cafeId: cafeId || '' });
          return;
        }

        if (targetJid.endsWith('@lid')) {
          this.replyRouter.lidSendAttemptsTotal.inc({ cafe_id: cafeId || 'unknown' });
          console.log(JSON.stringify({
            event: 'TRACE_SEND_LID_UNSAFE',
            traceId,
            destination_jid: targetJid,
            cafeId,
          }));
          this.logger.warn('sending_to_lid_jid: ' + targetJid);
        }

        try {
          const result = await this.whatsappService.sendMessage(targetJid, reply, cafeId);
          console.log(JSON.stringify({
            event: 'TRACE_SEND_RESULT',
            traceId,
            success: result.success,
            provider: result.provider,
            destination: targetJid,
          }));
          this.logger.log(`[${traceId}] sendMessage: strategy=${routing.strategy} destination=${targetJid} success=${result.success}`);
        } catch (err) {
          console.log(JSON.stringify({
            event: 'TRACE_SEND_ERROR',
            traceId,
            exception: (err as Error).message,
            stack: (err as Error).stack?.split('\n').slice(1, 4).join(' | '),
            destination: targetJid,
          }));
          this.logger.error(`[${traceId}] sendMessage error: ${(err as Error).message}`);
        }

        try {
          await this.messagesService.logMessage({
            phone,
            content: reply,
            role: 'system',
            intent: 'order_flow',
            cafeId,
          });
        } catch {
          // ignore
        }

        try {
          await this.prisma.whatsAppLog.create({
            data: { phone, message: reply, direction: 'OUTGOING', cafeId: cafeId || null } as any,
          });
        } catch {
          // ignore
        }
      }
    } catch (err) {
      this.logger.error(`[${traceId}] Message parser fatal error: ${(err as Error).message}`);
    }
  }

  private async getProductContext(cafeId: string) {
    try {
      const products = await this.prisma.product.findMany({
        where: { cafeId, active: true },
        select: { id: true, name: true, category: true, price: true },
      });
      return products.map(p => ({ id: p.id, name: p.name, category: p.category, price: p.price }));
    } catch {
      return undefined;
    }
  }
}
