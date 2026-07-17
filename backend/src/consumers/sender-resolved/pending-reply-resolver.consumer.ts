import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PendingReplyService } from '../../pending-reply/pending-reply.service';
import { LidResolverService } from '../../lid-resolver/lid-resolver.service';
import { LidMappingService } from '../../lid-mapping/lid-mapping.service';
import { WhatsappService } from '../../whatsapp/whatsapp.service';
import { OrderFlowService } from '../../order-flow/order-flow.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppEvent } from '../../events/events.service';
import { EventBusService } from '../../events/event-bus.service';

@Injectable()
export class PendingReplyResolverConsumer {
  private readonly logger = new Logger(PendingReplyResolverConsumer.name);

  constructor(
    private readonly pendingReplyService: PendingReplyService,
    private readonly lidResolverService: LidResolverService,
    private readonly lidMappingService: LidMappingService,
    private readonly whatsappService: WhatsappService,
    private readonly orderFlowService: OrderFlowService,
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  @OnEvent('lid-mapping.upserted')
  async handle(payload: AppEvent): Promise<void> {
    const p = payload.payload as any;
    const lid = p.lid as string;
    const cafeId = p.cafeId as string;

    this.logger.log(`Resolving pending replies for LID=${lid}`);

    try {
      const result = await this.lidResolverService.resolve(lid, {
        findByLid: (l) => this.lidMappingService.findByLid(l),
        getContactPhone: (j) => this.whatsappService.getContactPhone(j),
        getContactDetails: (j) => this.whatsappService.getContactDetails(j),
        findSessionByLid: (l) => this.findSessionByLid(l),
        findCustomerByJid: (l, c) => this.findCustomerByLid(l, c),
      }, cafeId);

      if (result.phoneJid) {
        const resolved = await this.pendingReplyService.retryForLid(
          lid,
          async (msg, _lid) => {
            await this.whatsappService.sendMessage(result.phoneJid, msg);
            return true;
          },
          cafeId,
        );
        this.logger.log(`Resolved ${resolved} pending replies for ${lid}`);
      } else {
        this.logger.warn(`Still unresolved ${lid} — pending replies remain`);
      }
    } catch (err) {
      this.logger.error(`Failed to resolve pending replies for ${lid}: ${(err as Error).message}`);
    }
  }

  private async findSessionByLid(lid: string): Promise<string | null> {
    const lidUserpart = lid.includes('@lid') ? lid.split('@')[0] : lid;
    const tempPhone = `lid_${lidUserpart}`;
    try {
      const session = await this.orderFlowService.getSession(tempPhone);
      if (session?.replyJid && !session.replyJid.includes('@lid')) {
        return session.replyJid;
      }
    } catch {
      // ignore
    }
    return null;
  }

  private async findCustomerByLid(lid: string, cafeId?: string): Promise<string | null> {
    const lidUserpart = lid.includes('@lid') ? lid.split('@')[0] : lid;
    const tempPhone = `lid_${lidUserpart}`;
    try {
      if (cafeId) {
        const branch = await this.prisma.branch.findFirst({ where: { cafeId } });
        if (branch) {
          const customer = await this.prisma.customer.findFirst({
            where: { cafeId, branchId: branch.id, phone: tempPhone, phoneJid: { not: null } },
          });
          if (customer?.phoneJid) return customer.phoneJid;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }
}
