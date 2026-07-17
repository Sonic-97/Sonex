import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyService } from '../common/idempotency.service';
import { EventBusService } from '../events/event-bus.service';
import {
  PostOrderFeedback, ComplaintInput, CompensationInput,
  ComplaintCategory, CompensationType,
} from '../loyalty/loyalty.types';

@Injectable()
export class PostOrderService {
  private readonly logger = new Logger(PostOrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotencyService: IdempotencyService,
    private readonly eventBus: EventBusService,
  ) {}

  // ── Post-Order Feedback ──

  async submitFeedback(data: PostOrderFeedback): Promise<{ success: boolean; message: string }> {
    const idemKey = `feedback:${data.cafeId}:${data.customerId}:${data.orderId}`;
    const dup = await this.idempotencyService.isProcessed('feedback', idemKey, data.cafeId);
    if (dup.duplicated) {
      return { success: true, message: 'تمام، بالهنا والشفا.' };
    }

    await this.prisma.customerFeedback.create({
      data: {
        cafeId: data.cafeId,
        customerId: data.customerId,
        orderId: data.orderId,
        rating: data.satisfied ? 5 : 1,
        category: data.category || null,
        comment: data.comment || null,
        isComplaint: !data.satisfied,
      },
    });

    await this.prisma.processedMessage.create({
      data: {
        cafeId: data.cafeId,
        source: 'feedback',
        idempotencyKey: idemKey,
        entityType: 'feedback',
        entityId: data.orderId || null,
        status: 'completed',
        completedAt: new Date(),
      },
    }).catch(() => {});

    if (!data.satisfied && data.orderId) {
      await this.createComplaint({
        cafeId: data.cafeId,
        customerId: data.customerId,
        orderId: data.orderId,
        category: data.category as ComplaintCategory,
        description: data.comment,
      });
    }

    return { success: true, message: data.satisfied ? 'تمام، بالهنا والشفا.' : 'تم تسجيل ملاحظتك.' };
  }

  getFeedbackReply(satisfied: boolean): string {
    if (satisfied) return 'تمام، بالهنا والشفا.';
    return 'حقك علينا. المشكلة إيه بالضبط؟';
  }

  // ── Complaint Management ──

  async createComplaint(input: ComplaintInput): Promise<{ id: string; message: string }> {
    const idemKey = `complaint:${input.cafeId}:${input.customerId}:${input.orderId || 'no-order'}`;
    const dup = await this.idempotencyService.isProcessed('complaint', idemKey, input.cafeId);
    if (dup.duplicated) {
      return { id: dup.entityId || '', message: 'تم استلام شكوتك بالفعل.' };
    }

    const complaint = await this.prisma.complaint.create({
      data: {
        cafeId: input.cafeId,
        customerId: input.customerId,
        orderId: input.orderId || null,
        category: input.category || null,
        description: input.description || null,
        status: 'OPEN',
      },
    });

    await this.prisma.processedMessage.create({
      data: {
        cafeId: input.cafeId,
        source: 'complaint',
        idempotencyKey: idemKey,
        entityType: 'complaint',
        entityId: complaint.id,
        status: 'completed',
        completedAt: new Date(),
      },
    }).catch(() => {});

    (this.eventBus as any).publish('complaint.created', {
      complaintId: complaint.id,
      cafeId: input.cafeId,
      customerId: input.customerId,
      orderId: input.orderId,
      category: input.category,
    } as any, input.cafeId);

    return { id: complaint.id, message: 'تم تسجيل ملاحظتك. حقك علينا.' };
  }

  async getComplaint(complaintId: string, cafeId: string): Promise<any> {
    const complaint = await this.prisma.complaint.findUnique({ where: { id: complaintId } });
    if (!complaint || complaint.cafeId !== cafeId) throw new ForbiddenException('Complaint not found');
    return complaint;
  }

  async resolveComplaint(complaintId: string, cafeId: string, resolution: string): Promise<void> {
    const complaint = await this.prisma.complaint.findUnique({ where: { id: complaintId } });
    if (!complaint || complaint.cafeId !== cafeId) throw new ForbiddenException('Complaint not found');
    await this.prisma.complaint.update({
      where: { id: complaintId },
      data: { status: 'RESOLVED', resolution, resolvedAt: new Date() },
    });
  }

  // ── Compensation ──

  async createCompensation(input: CompensationInput): Promise<{ id: string; message: string; requiresApproval: boolean }> {
    const idemKey = `compensation:${input.cafeId}:${input.customerId}:${input.complaintId || 'direct'}`;
    const dup = await this.idempotencyService.isProcessed('compensation', idemKey, input.cafeId);
    if (dup.duplicated) {
      return { id: dup.entityId || '', message: 'تم التعويض بالفعل.', requiresApproval: false };
    }

    const requiresApproval = input.ownerApproved === false && (input.type === 'ACCOUNT_CREDIT' || (input.value ?? 0) > 50);
    const status = requiresApproval ? 'PENDING' : 'APPROVED';

    const compensation = await this.prisma.compensation.create({
      data: {
        cafeId: input.cafeId,
        customerId: input.customerId,
        complaintId: input.complaintId || null,
        orderId: input.orderId || null,
        type: input.type,
        productId: input.type === 'FREE_PRODUCT' ? input.productId : null,
        value: input.value || null,
        status,
        ownerApproved: !requiresApproval,
        idempotencyKey: idemKey,
      },
    });

    await this.prisma.processedMessage.create({
      data: {
        cafeId: input.cafeId,
        source: 'compensation',
        idempotencyKey: idemKey,
        entityType: 'compensation',
        entityId: compensation.id,
        status: 'completed',
        completedAt: new Date(),
      },
    }).catch(() => {});

    if (!requiresApproval) {
      await this.applyCompensation(compensation.id, input.cafeId);
    }

    return {
      id: compensation.id,
      message: requiresApproval
        ? 'تم إرسال طلب التعويض للمراجعة.'
        : 'تم تطبيق التعويض.',
      requiresApproval,
    };
  }

  private async applyCompensation(compId: string, cafeId: string): Promise<void> {
    const comp = await this.prisma.compensation.findUnique({ where: { id: compId } });
    if (!comp || comp.cafeId !== cafeId) return;

    await this.prisma.compensation.update({
      where: { id: compId },
      data: { status: 'APPLIED', appliedAt: new Date() },
    });

    if (comp.complaintId) {
      await this.prisma.complaint.update({
        where: { id: comp.complaintId },
        data: { status: 'RESOLVED', compensationId: comp.id, resolvedAt: new Date() },
      });
    }
  }

  async approveCompensation(compId: string, cafeId: string): Promise<{ success: boolean; message: string }> {
    const comp = await this.prisma.compensation.findUnique({ where: { id: compId } });
    if (!comp || comp.cafeId !== cafeId) throw new ForbiddenException('Compensation not found');
    if (comp.status !== 'PENDING') return { success: false, message: 'التعويض مش في انتظار الموافقة.' };

    await this.prisma.compensation.update({
      where: { id: compId },
      data: { status: 'APPROVED', ownerApproved: true },
    });

    await this.applyCompensation(compId, cafeId);
    return { success: true, message: 'تمت الموافقة على التعويض.' };
  }

  // ── Favorite Product Return ──

  async checkFavoriteProductReturn(cafeId: string, productId: string): Promise<string[]> {
    const customers = await this.prisma.customer.findMany({
      where: { cafeId },
      select: { id: true, preferredProducts: true },
    });

    const notified: string[] = [];
    for (const customer of customers) {
      const prefs = customer.preferredProducts as any;
      if (prefs && typeof prefs === 'object') {
        const productIds = Object.keys(prefs);
        if (productIds.includes(productId)) {
          notified.push(customer.id);
        }
      }
    }
    return notified;
  }

  // ── Support Case ──

  async createSupportCase(cafeId: string, customerId: string, orderId?: string, issue?: string): Promise<void> {
    const caseId = `SC-${Date.now().toString(36).toUpperCase()}`;
    this.logger.warn(`[SUPPORT_CASE] ${caseId}: customer=${customerId} cafe=${cafeId} order=${orderId || 'none'} issue=${issue || 'general'}`);
    (this.eventBus as any).publish('support.case.created', {
      caseId, cafeId, customerId, orderId, issue,
    } as any, cafeId);
  }
}
