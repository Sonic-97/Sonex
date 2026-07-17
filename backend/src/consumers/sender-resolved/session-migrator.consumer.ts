import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OrderFlowService } from '../../order-flow/order-flow.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LidMappingService } from '../../lid-mapping/lid-mapping.service';
import { AppEvent } from '../../events/events.service';
import { EventBusService } from '../../events/event-bus.service';

@Injectable()
export class SessionMigratorConsumer {
  private readonly logger = new Logger(SessionMigratorConsumer.name);

  constructor(
    private readonly orderFlowService: OrderFlowService,
    private readonly prisma: PrismaService,
    private readonly lidMappingService: LidMappingService,
    private readonly eventBus: EventBusService,
  ) {}

  @OnEvent('sender.resolved')
  async handle(payload: AppEvent): Promise<void> {
    const p = payload.payload as any;
    const phone = p.phone as string;
    const phoneJid = p.phoneJid as string;
    const cafeId = p.cafeId as string;
    const resolutionPath = p.resolutionPath as string;

    if (!resolutionPath?.includes('lid') || phone.startsWith('lid_')) {
      return;
    }

    const originalJid = p.remoteJid as string;
    const lidUserpart = originalJid.includes('@lid') ? originalJid.split('@')[0] : null;
    if (!lidUserpart) return;

    const tempPhone = `lid_${lidUserpart}`;
    this.logger.log(`Migrating session ${tempPhone} -> ${phone}`);

    try {
      const hasTempSession = await this.orderFlowService.hasSession(tempPhone);
      if (hasTempSession) {
        const sessionData = await this.orderFlowService.getSession(tempPhone);
        if (sessionData) {
          sessionData.phone = phone;
          await this.orderFlowService.saveSession(phone, sessionData);
          await this.orderFlowService.deleteSession(tempPhone);
          this.logger.log(`Session migrated: ${tempPhone} -> ${phone}`);
        }
      }

      const branches = await this.prisma.branch.findMany({
        where: cafeId ? { cafeId } : {},
      });

      for (const branch of branches) {
        const tempCustomer = await this.prisma.customer.findUnique({
          where: { cafeId_branchId_phone: { cafeId: branch.cafeId, branchId: branch.id, phone: tempPhone } },
        });

        if (!tempCustomer) continue;

        const realCustomer = await this.prisma.customer.findUnique({
          where: { cafeId_branchId_phone: { cafeId: branch.cafeId, branchId: branch.id, phone } },
        });

        if (realCustomer) {
          await this.prisma.order.updateMany({
            where: { customerId: tempCustomer.id },
            data: { customerId: realCustomer.id },
          });

          await this.prisma.debt.updateMany({
            where: { customerId: tempCustomer.id },
            data: { customerId: realCustomer.id },
          });

          await this.prisma.inCafeOrder.updateMany({
            where: { customerId: tempCustomer.id },
            data: { customerId: realCustomer.id },
          });

          await this.prisma.customer.update({
            where: { id: realCustomer.id },
            data: {
              totalOrders: { increment: tempCustomer.totalOrders },
              totalSpent: { increment: Number(tempCustomer.totalSpent) },
              unpaidBalance: { increment: Number(tempCustomer.unpaidBalance) },
            },
          });

          await this.prisma.customer.delete({ where: { id: tempCustomer.id } });
          this.logger.log(`Merged temp customer ${tempCustomer.id} into real customer ${realCustomer.id}`);
        } else {
          await this.prisma.customer.update({
            where: { id: tempCustomer.id },
            data: { phone },
          });
          this.logger.log(`Updated temp customer ${tempCustomer.id} phone to ${phone}`);
        }
      }
    } catch (err) {
      this.logger.error(`Session migration failed for ${tempPhone}: ${(err as Error).message}`);
    }
  }
}
