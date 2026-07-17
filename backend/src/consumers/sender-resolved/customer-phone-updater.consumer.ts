import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ReplyRouterService } from '../../reply-router/reply-router.service';
import { AppEvent } from '../../events/events.service';

@Injectable()
export class CustomerPhoneUpdaterConsumer {
  private readonly logger = new Logger(CustomerPhoneUpdaterConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly replyRouter: ReplyRouterService,
  ) {}

  @OnEvent('sender.resolved')
  async handle(payload: AppEvent): Promise<void> {
    const p = payload.payload as any;
    const phone = p.phone as string;
    const phoneJid = p.phoneJid as string;
    const cafeId = p.cafeId as string;

    if (!cafeId) return;

    try {
      const branch = await this.prisma.branch.findFirst({ where: { cafeId } });
      if (!branch) return;

      const isLid = phoneJid?.includes('@lid');

      if (isLid) {
        this.replyRouter.lidMessagesTotal.inc({ cafe_id: cafeId });
        const lidJid = phoneJid;
        const lidUserpart = lidJid.split('@')[0];

        // RULE 2: When @lid, only store lidJid
        // RULE 3: LidMapping → leave unresolved (resolveSender already tried getContactPhone)

        // Step 1 — Try LidMapping table
        const lidMapping = await this.prisma.lidMapping.findUnique({ where: { lid: lidJid } });

        if (lidMapping?.phoneJid?.endsWith('@c.us')) {
          const actualPhoneJid = lidMapping.phoneJid;
          const actualPhone = lidMapping.phone || actualPhoneJid.split('@')[0];

          // Safety: reject if phoneJid is fabricated from LID userpart
          if (!actualPhoneJid.startsWith(lidUserpart)) {
            const existing = await this.prisma.customer.findUnique({
              where: { cafeId_branchId_phone: { cafeId, branchId: branch.id, phone: actualPhone } },
              select: { id: true },
            });

            if (existing) {
              await this.prisma.customer.update({
                where: { id: existing.id },
                data: { lidJid, phoneJid: actualPhoneJid, lastKnownJid: actualPhoneJid, lastResolvedAt: new Date() },
              });
              this.logger.log(`Linked customer ${existing.id} to lidJid=${lidJid} via LidMapping`);
            } else {
              await this.prisma.customer.create({
                data: {
                  cafeId, branchId: branch.id,
                  phone: actualPhone, phoneJid: actualPhoneJid,
                  lidJid, lastKnownJid: actualPhoneJid, lastResolvedAt: new Date(),
                },
              });
              this.replyRouter.phoneResolutionsTotal.inc({ cafe_id: cafeId });
              this.logger.log(`Created customer from LidMapping: ${lidJid} -> ${actualPhoneJid}`);
            }
            console.log(JSON.stringify({ event: 'TRACE_LID_RESOLVED', lid: lidJid, phone: actualPhone, phoneJid: actualPhoneJid, source: 'lid_mapping' }));
            return;
          }
        }

        // Step 2 — No valid LidMapping — store only lidJid (phone=placeholder, phoneJid=null)
        const placeholderPhone = `lid_${lidUserpart}`;
        const existing = await this.prisma.customer.findFirst({
          where: { cafeId, branchId: branch.id, lidJid },
        });

        if (existing) {
          // RULE 2: NEVER overwrite phone/phoneJid with fabricated values
          await this.prisma.customer.update({
            where: { id: existing.id },
            data: { lastResolvedAt: new Date() },
          });
          this.logger.log(`Updated unresolved lidJid=${lidJid} on customer ${existing.id}`);
        } else {
          await this.prisma.customer.create({
            data: {
              cafeId, branchId: branch.id,
              phone: placeholderPhone,
              lidJid, lastResolvedAt: new Date(),
            },
          });
          console.log(JSON.stringify({ event: 'TRACE_LID_RECEIVED', lidJid, cafeId }));
          this.logger.log(`Created unresolved LID customer: ${lidJid} (phone=placeholder)`);
        }

        this.replyRouter.phoneResolutionFailuresTotal.inc({ cafe_id: cafeId });
        return;
      }

      // RULE 1 — For @c.us JIDs (normal path, never from LID userpart)
      if (phoneJid?.endsWith('@c.us') || phoneJid?.endsWith('@s.whatsapp.net')) {
        const normalizedJid = phoneJid.replace('@s.whatsapp.net', '@c.us');
        const actualPhone = phone?.replace(/[^0-9]/g, '');
        if (!actualPhone) return;

        const existing = await this.prisma.customer.findUnique({
          where: { cafeId_branchId_phone: { cafeId, branchId: branch.id, phone: actualPhone } },
          select: { id: true, phoneJid: true, lidJid: true },
        });

        if (existing) {
          const updateData: any = { phoneJid: normalizedJid, lastKnownJid: normalizedJid, lastResolvedAt: new Date() };
          if (!existing.lidJid && existing.phoneJid !== normalizedJid) {
            updateData.phoneJid = normalizedJid;
          }
          await this.prisma.customer.update({ where: { id: existing.id }, data: updateData });
        } else {
          await this.prisma.customer.create({
            data: {
              cafeId, branchId: branch.id,
              phone: actualPhone, phoneJid: normalizedJid,
              lastKnownJid: normalizedJid, lastResolvedAt: new Date(),
            },
          });
        }
        this.logger.log(`Updated customer phoneJid=${normalizedJid}`);
        return;
      }

      this.logger.warn(`Unknown JID format: ${phoneJid} for phone=${phone}`);
    } catch (err) {
      this.logger.error(`Failed to update customer: ${(err as Error).message}`);
    }
  }
}
