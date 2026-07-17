import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContextBuilderService } from '../commerce-brain/context-builder.service';
import { CommerceBrainService } from '../commerce-brain/commerce-brain.service';
import { ActionPlannerService } from '../action-planner/action-planner.service';
import { ActionExecutorService } from '../action-executor/action-executor.service';
import { CustomerApiSessionService } from './customer-api-session.service';
import { CustomerApiAuthGuard } from './customer-api-auth.guard';
import { BuildContextInput } from '../commerce-brain/commerce-brain.types';
import {
  CustomerLoginRequest, CustomerLoginResponse,
  CustomerMessageRequest, CustomerConfirmRequest,
  CustomerApiResponse, CustomerOrderResponse, CustomerOrderItem,
  CustomerRecommendation, AuthPayload,
} from './customer-api.types';

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

@Injectable()
export class CustomerApiService {
  private readonly logger = new Logger(CustomerApiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contextBuilder: ContextBuilderService,
    private readonly commerceBrain: CommerceBrainService,
    private readonly planner: ActionPlannerService,
    private readonly executor: ActionExecutorService,
    private readonly session: CustomerApiSessionService,
  ) {}

  async login(body: CustomerLoginRequest): Promise<CustomerLoginResponse> {
    const customer = await this.prisma.customer.findFirst({
      where: { phone: body.phone, cafeId: body.cafeId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found for this cafe');
    }
    const token = generateToken();
    const payload: AuthPayload = { customerId: customer.id, cafeId: customer.cafeId };
    CustomerApiAuthGuard.registerToken(token, payload);
    const expiresAt = new Date(Date.now() + 86400000).toISOString();
    return { token, customerId: customer.id, name: customer.name || 'Customer', expiresAt };
  }

  async processMessage(payload: AuthPayload, body: CustomerMessageRequest): Promise<CustomerApiResponse> {
    const session = this.session.getOrCreate(payload.customerId, payload.cafeId, '');
    const message = body.message?.trim();
    if (!message) {
      throw new BadRequestException('Message is required');
    }

    return this.runPipeline(payload.cafeId, payload.customerId, message, session.currentStep,
      session.collectedInformation, session.missingInformation, session.currentIntent);
  }

  async confirm(payload: AuthPayload, body: CustomerConfirmRequest): Promise<CustomerApiResponse> {
    const session = this.session.find(payload.customerId);
    if (!session) {
      throw new BadRequestException('ConversationExpired');
    }

    if (!body.confirmed) {
      session.currentStep = 'NEW';
      session.collectedInformation = {};
      session.missingInformation = [];
      session.currentIntent = undefined;
      this.session.update(session);
      return { success: true, type: 'conversation', message: 'تم إلغاء الطلب.' };
    }

    return this.runPipeline(payload.cafeId, payload.customerId, '/confirm', 'confirming',
      session.collectedInformation, session.missingInformation, session.currentIntent);
  }

  async cancelOrder(payload: AuthPayload): Promise<CustomerApiResponse> {
    const session = this.session.getOrCreate(payload.customerId, payload.cafeId, '');
    return this.runPipeline(payload.cafeId, payload.customerId, 'cancel my order', session.currentStep,
      session.collectedInformation, session.missingInformation, 'CANCEL_ORDER');
  }

  async getOrders(payload: AuthPayload): Promise<CustomerOrderResponse[]> {
    const orders = await this.prisma.customerOrder.findMany({
      where: { customerId: payload.customerId },
      include: {
        merchantOrders: {
          select: { id: true, cafeId: true, businessName: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return orders.map(o => ({
      orderId: o.id,
      status: o.status,
      items: [],
      subtotal: Number(o.subtotal).toFixed(2),
      deliveryFee: Number(o.deliveryFee).toFixed(2),
      grandTotal: Number(o.grandTotal).toFixed(2),
      createdAt: o.createdAt.toISOString(),
      merchantOrders: o.merchantOrders.map(mo => ({
        merchantOrderId: mo.id,
        cafeId: mo.cafeId,
        businessName: mo.businessName || 'Unknown',
        status: mo.status,
      })),
    }));
  }

  async getOrder(payload: AuthPayload, orderId: string): Promise<CustomerOrderResponse> {
    const order = await this.prisma.customerOrder.findUnique({
      where: { id: orderId },
      include: {
        merchantOrders: {
          include: { items: true },
        },
      },
    });

    if (!order || order.customerId !== payload.customerId) {
      throw new NotFoundException('OrderNotFound');
    }

    const allItems: CustomerOrderItem[] = [];
    for (const mo of order.merchantOrders) {
      for (const item of mo.items) {
        allItems.push({
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice).toFixed(2),
          totalPrice: Number(item.totalPrice).toFixed(2),
        });
      }
    }

    return {
      orderId: order.id,
      status: order.status,
      items: allItems,
      subtotal: Number(order.subtotal).toFixed(2),
      deliveryFee: Number(order.deliveryFee).toFixed(2),
      grandTotal: Number(order.grandTotal).toFixed(2),
      createdAt: order.createdAt.toISOString(),
      merchantOrders: order.merchantOrders.map(mo => ({
        merchantOrderId: mo.id,
        cafeId: mo.cafeId,
        businessName: mo.businessName || 'Unknown',
        status: mo.status,
      })),
    };
  }

  async getHistory(payload: AuthPayload): Promise<CustomerOrderResponse[]> {
    return this.getOrders(payload);
  }

  async getRecommendations(payload: AuthPayload): Promise<CustomerRecommendation[]> {
    const recent = await this.prisma.customerOrder.findMany({
      where: { customerId: payload.customerId },
      select: { merchantOrders: { select: { items: { select: { productName: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const productNames = new Set<string>();
    for (const o of recent) {
      for (const mo of o.merchantOrders) {
        for (const item of mo.items) {
          productNames.add(item.productName);
        }
      }
    }

    const products = await this.prisma.product.findMany({
      where: { cafeId: payload.cafeId, active: true },
      select: { id: true, name: true, category: true },
      take: 20,
      orderBy: { name: 'asc' },
    });

    const scored = products.map(p => {
      const ordered = productNames.has(p.name);
      return {
        productId: p.id,
        name: p.name,
        reason: ordered ? 'مشروبك المفضل' : 'قد يعجبك هذا المشروب',
        priority: ordered ? 1 : 2,
      };
    });

    return scored.sort((a, b) => a.priority - b.priority).slice(0, 10);
  }

  private async runPipeline(
    cafeId: string,
    customerId: string,
    message: string,
    currentStep: string,
    collectedInformation: Record<string, unknown>,
    missingInformation: string[],
    currentIntent?: string,
  ): Promise<CustomerApiResponse> {
    const session = this.session.find(customerId);
    if (!session) {
      throw new BadRequestException('ConversationExpired');
    }

    try {
      const buildInput: BuildContextInput = {
        cafeId,
        customerId,
        message,
        currentStep,
        collectedInformation,
        missingInformation,
        currentIntent,
      };

      const context = await this.contextBuilder.build(buildInput);
      const decision = await this.commerceBrain.decide(message, context);
      const plan = this.planner.createPlan(decision, context);

      session.currentStep = context.conversation.currentStep;
      session.collectedInformation = context.conversation.collectedInformation;
      session.missingInformation = context.conversation.missingInformation;
      session.currentIntent = decision.intent;
      this.session.update(session);

      const hasHardBlockers = plan.blockingReasons.some(b => b.severity === 'hard');

      if (hasHardBlockers) {
        const reasons = plan.blockingReasons.map(b => b.reason).join('; ');
        return {
          success: true,
          type: 'clarification',
          message: reasons,
          data: { blockingReasons: plan.blockingReasons, missingInformation: decision.missingInformation },
        };
      }

      if (plan.requiredConfirmation) {
        return {
          success: true,
          type: 'confirmation',
          message: 'هل تريد تأكيد الطلب؟',
          requiresConfirmation: true,
          data: { plan: { intent: plan.intent, steps: plan.steps.map(s => s.action) } },
        };
      }

      const executionResult = await this.executor.execute(plan);

      return {
        success: true,
        type: 'execution',
        message: this.buildSuccessMessage(executionResult),
        data: { decision, plan: { steps: plan.steps.map(s => s.action) }, executionResult },
      };
    } catch (err) {
      this.logger.error(`Pipeline failed: ${(err as Error).message}`);
      return {
        success: false,
        type: 'error',
        message: 'حدث خطأ أثناء معالجة طلبك. حاول مرة أخرى.',
      };
    }
  }

  private buildSuccessMessage(result: { status?: string; message?: string }): string {
    if (result.status === 'FAILED') return 'فشل تنفيذ الطلب. حاول مرة أخرى.';
    if (result.status === 'ROLLED_BACK') return 'تم التراجع عن الطلب بسبب خطأ.';
    return 'تم بنجاح';
  }
}
