import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { InventoryPipelineService } from '../inventory-pipeline/inventory-pipeline.service';
import { AuditService } from '../audit/audit.service';
import { EventsService } from '../events/events.service';
import { ProductManagementService } from '../product-management/product-management.service';
import { IdempotencyService } from '../common/idempotency.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto, OrderStatus } from './dto/update-order-status.dto';
import { OrderStatusService } from './order-status.service';
import { CustomerLearningService } from '../customer-learning/customer-learning.service';
import { AiOrderIntent } from '../ai/ai.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly inventoryPipeline: InventoryPipelineService,
    private readonly orderStatusService: OrderStatusService,
    private readonly auditService: AuditService,
    private readonly eventsService: EventsService,
    private readonly productManagementService: ProductManagementService,
    private readonly idempotencyService: IdempotencyService,
    private readonly customerLearningService: CustomerLearningService,
  ) {}

  // =========================
  // 🧾 NORMAL API ORDER (UNCHANGED)
  // =========================
  async create(createOrderDto: CreateOrderDto & { source?: string }, branchId?: string, cafeId?: string) {
    const {
      customerId,
      customerPhone,
      customerName,
      staffId,
      employeeId,
      createdById,
      type,
      sourceType,
      address,
      items,
      source,
      idempotencyKey,
      externalId,
    } = createOrderDto;

    if (!items?.length) {
      throw new BadRequestException('Order must contain at least one item');
    }

    if (!customerId && !customerPhone) {
      throw new BadRequestException('Either customerId or customerPhone must be provided');
    }

    if (idempotencyKey && cafeId) {
      const existing = await this.idempotencyService.isProcessed('http_api', idempotencyKey, cafeId);
      if (existing.duplicated && existing.entityId) {
        const replayedOrder = await this.prisma.order.findUnique({
          where: { id: existing.entityId },
          include: { customer: true, staff: true, items: { include: { product: true } } },
        });
        if (replayedOrder) {
          return { data: replayedOrder, replayed: true };
        }
      }
    }

    let targetBranchId = branchId;
    if (!targetBranchId) {
      const defaultBranch = await this.prisma.branch.findFirst({
        where: { slug: 'main-branch', cafeId: cafeId! },
        select: { id: true },
      });
      targetBranchId = defaultBranch?.id;
    }
    if (!targetBranchId) throw new BadRequestException('No active branch found');

    let createdOrder: any;
    const order = await this.prisma.$transaction(async (tx) => {
      const customer = customerId
        ? await tx.customer.findUnique({ where: { id: customerId } })
        : await tx.customer.upsert({
            where: {
              cafeId_branchId_phone: {
                cafeId: cafeId!,
                branchId: targetBranchId!,
                phone: customerPhone as string,
              },
            },
            update: {
              name: customerName || undefined,
            },
            create: {
              cafeId: cafeId!,
              branchId: targetBranchId!,
              phone: customerPhone as string,
              name: customerName || 'New Customer',
            },
          });

      if (!customer) {
        throw new NotFoundException(`Customer not found`);
      }

      const productIds = [...new Set(items.map((item) => item.productId))];
      const products = await tx.product.findMany({
        where: {
          id: { in: productIds },
          active: true,
          cafeId: cafeId!,
        },
      });

      if (products.length !== productIds.length) {
        throw new BadRequestException('Invalid products in order');
      }

      const productsById = new Map(products.map((p) => [p.id, p]));
      let total = new Prisma.Decimal(0);

      const orderItemsData = items.map((item) => {
        const product = productsById.get(item.productId);

        const unitPrice = item.price
          ? new Prisma.Decimal(item.price)
          : product!.price;

        total = total.plus(unitPrice.mul(item.quantity));

        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice,
          notes: item.notes ?? null,
        };
      });

      const code = await this.generateOrderCode(tx);

      const order = await tx.order.create({
        data: {
          code,
          cafeId: cafeId!,
          customerId: customer.id,
          staffId: staffId ?? null,
          employeeId: employeeId ?? null,
          createdById: createdById ?? null,
          externalId: externalId ?? null,
          version: 1,
          status: OrderStatus.NEW,
          type,
          sourceType: sourceType ?? 'INSIDE_CAFE',
          total,
          address: address ?? null,
          source: source ?? 'IN_CAFE',
          branchId: targetBranchId,
          items: {
            create: orderItemsData,
          },
        },
        include: {
          customer: true,
          staff: true,
          items: { include: { product: true } },
        },
      });

      // Inventory pipeline: reserve stock + deduct refrigerator stock
      const pipelineItems = items.map(item => {
        const product = productsById.get(item.productId)!;
        return {
          productId: item.productId,
          productName: product.name,
          quantity: item.quantity,
          isRefrigerated: product.isRefrigerated,
          refrigeratorInventoryId: product.refrigeratorInventoryId,
        };
      });
      const pipelineResult = await this.inventoryPipeline.reserve({
        orderId: order.id, cafeId: cafeId!, branchId: targetBranchId, items: pipelineItems,
      }, tx);

      if (pipelineResult.inventoryReserved.length > 0 || pipelineResult.refrigeratorDeducted.length > 0) {
        await tx.order.update({
          where: { id: order.id },
          data: { stockDeducted: true },
        });
      }

      await tx.customer.update({
        where: { id: customer.id },
        data: {
          totalSpent: { increment: total },
          lastOrderDate: new Date(),
        },
      });

      if (idempotencyKey) {
        await this.idempotencyService.record('http_api', idempotencyKey, 'Order', order.id, 'completed', cafeId!, tx);
      }

      return order;
    });

    // Emit product.updated events for real-time stock sync
    for (const item of items) {
      const product = await this.prisma.product.findUnique({ where: { id: item.productId } });
      if (product?.isRefrigerated) {
        this.eventsService.emit('product.updated', {
          productId: product.id,
          name: product.name,
          action: 'updated',
        });
      }
    }

    this.eventsService.emit('order.created', {
      orderId: order.id,
      code: order.code,
      total: Number(order.total),
      customerId: order.customerId,
      customerPhone: order.customer.phone,
      type: order.type,
      status: order.status,
      source: order.source,
      branchId: order.branchId,
    });

    if (idempotencyKey) {
      return { data: order, replayed: false };
    }

    // Trigger customer learning (non-blocking)
    if (cafeId && order.customerId) {
      this.customerLearningService.learn(cafeId, order.customerId).catch(err => {
        this.logger.error(`Customer learning failed: ${err.message}`);
      });
    }

    return order;
  }

  // =========================
  // 🗺️ AI → ORDER ITEMS MAPPER
  // =========================
  async mapAIToOrder(
    aiData: AiOrderIntent,
    products?: any[],
    cafeId?: string,
  ): Promise<{
    mappedItems: Array<{
      productId: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
      notes: string | null;
    }>;
    total: Prisma.Decimal;
  }> {
    const allProducts = products ?? await this.prisma.product.findMany({
      where: { active: true, ...(cafeId ? { cafeId } : {}) },
    });

    const mappedItems: Array<{
      productId: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
      notes: string | null;
    }> = [];

    let total = new Prisma.Decimal(0);

    for (const aiItem of aiData.items) {
      const matched = this.matchProduct(aiItem.productName, allProducts);
      if (!matched) continue;

      const quantity = Math.max(1, aiItem.quantity || 1);
      const unitPrice = new Prisma.Decimal(matched.price.toString());
      total = total.plus(unitPrice.mul(quantity));

      const notes = [
        aiItem.size && aiItem.size !== 'M' ? `Size: ${aiItem.size}` : null,
        aiItem.sugar && aiItem.sugar !== '50' ? `Sugar: ${aiItem.sugar}%` : null,
        ...(aiItem.extras?.length ? [`Extras: ${aiItem.extras.join(', ')}`] : []),
      ]
        .filter(Boolean)
        .join(' | ') || null;

      mappedItems.push({ productId: matched.id, quantity, unitPrice, notes });
    }

    return { mappedItems, total };
  }

  // =========================
  // 🛡️ AI ORDER VALIDATION (HARD GUARD)
  // =========================
  validateAIOrder(
    items: Array<{ productId: string }>,
    activeProducts: any[],
  ): void {
    const validProductIds = new Set(activeProducts.map((p) => p.id));

    for (const item of items) {
      if (!validProductIds.has(item.productId)) {
        throw new BadRequestException(
          `INVALID_PRODUCT_FROM_AI: Product ID ${item.productId} does not exist in database`,
        );
      }
    }
  }

  // =========================
  // 🤖 AI ENTRY POINT (DATABASE-GROUNDED)
  // =========================
  async createFromAI(dto: {
    customerPhone: string;
    aiData: AiOrderIntent;
    idempotencyKey?: string;
    externalId?: string;
    source?: string;
    sourceType?: string;
  }, cafeId?: string) {
    const { customerPhone, aiData, idempotencyKey, externalId, source, sourceType } = dto;

    if (!customerPhone) {
      throw new BadRequestException('customerPhone is required');
    }

    if (!aiData?.items?.length) {
      throw new BadRequestException('No items in AI order');
    }

    if (idempotencyKey && cafeId) {
      const existing = await this.idempotencyService.isProcessed('whatsapp_webhook', idempotencyKey, cafeId);
      if (existing.duplicated && existing.entityId) {
        const replayedOrder = await this.prisma.order.findUnique({
          where: { id: existing.entityId },
          include: { customer: true, items: { include: { product: true } } },
        });
        if (replayedOrder) {
          return { order: replayedOrder, replayed: true };
        }
      }
    }

    const activeProducts = await this.productManagementService.buildAIProductContext(cafeId);

    const { mappedItems, total } = await this.mapAIToOrder(aiData, activeProducts);

    if (!mappedItems.length) {
      throw new BadRequestException('No valid products matched from AI order');
    }

    this.validateAIOrder(mappedItems, activeProducts);

    const result = await this.prisma.$transaction(async (tx) => {
      const defaultBranch = await tx.branch.findFirst({
        where: { slug: 'main-branch', cafeId: cafeId! },
        select: { id: true },
      });
      const targetBranchId = defaultBranch?.id;
      if (!targetBranchId) throw new Error('Default branch not found');

      const customer = await tx.customer.upsert({
        where: {
          cafeId_branchId_phone: {
            cafeId: cafeId!,
            branchId: targetBranchId,
            phone: customerPhone,
          },
        },
        update: { totalOrders: { increment: 1 } },
        create: {
          cafeId: cafeId!,
          branchId: targetBranchId,
          phone: customerPhone,
          name: 'AI Customer',
          totalOrders: 1,
        },
      });

      const code = await this.generateOrderCode(tx);
      const orderType = ['DINE_IN', 'TAKEAWAY', 'DELIVERY'].includes(aiData.type)
        ? aiData.type
        : 'DINE_IN';

      const order = await tx.order.create({
        data: {
          code,
          cafeId: cafeId!,
          customerId: customer.id,
          externalId: externalId ?? null,
          version: 1,
          status: OrderStatus.NEW,
          type: orderType,
          total,
          address: orderType === 'DELIVERY' ? 'AI Order - Delivery' : null,
          source: source || 'WHATSAPP',
          sourceType: sourceType || 'WHATSAPP_ORDER',
          branchId: targetBranchId,
          items: { create: mappedItems },
        },
        include: {
          customer: true,
          items: { include: { product: true } },
        },
      });

      // Inventory pipeline: reserve stock + deduct refrigerator stock
      const pipelineItems = mappedItems.map((item: any) => {
        const product = activeProducts.find(p => p.id === item.productId)!;
        return {
          productId: item.productId,
          productName: product.name,
          quantity: item.quantity,
          isRefrigerated: product.isRefrigerated,
          refrigeratorInventoryId: product.refrigeratorInventoryId,
        };
      });
      const pipelineResult2 = await this.inventoryPipeline.reserve({
        orderId: order.id, cafeId: cafeId!, branchId: targetBranchId, items: pipelineItems,
      }, tx);

      if (pipelineResult2.inventoryReserved.length > 0 || pipelineResult2.refrigeratorDeducted.length > 0) {
        await tx.order.update({
          where: { id: order.id },
          data: { stockDeducted: true },
        });
      }

      await tx.customer.update({
        where: { id: customer.id },
        data: {
          totalSpent: { increment: total },
          lastOrderDate: new Date(),
        },
      });

      if (idempotencyKey) {
        await this.idempotencyService.record('whatsapp_webhook', idempotencyKey, 'Order', order.id, 'completed', cafeId!, tx);
      }

      return { order };
    });

    // Emit product.updated events for real-time stock sync
    for (const item of mappedItems) {
      const product = activeProducts.find(p => p.id === item.productId);
      if (product?.isRefrigerated) {
        this.eventsService.emit('product.updated', {
          productId: product.id,
          name: product.name,
          action: 'updated',
        });
      }
    }

    this.eventsService.emit('order.created', {
      orderId: result.order.id,
      code: result.order.code,
      total: Number(result.order.total),
      customerId: result.order.customerId,
      customerPhone: result.order.customer.phone,
      type: result.order.type,
      status: result.order.status,
      source: result.order.source,
      branchId: result.order.branchId,
    });

    if (idempotencyKey) {
      return { ...result, replayed: false };
    }
    return result;
  }

  // =========================
  // 🔗 AI PRODUCT MATCHER
  // =========================
  private matchProduct(aiProductName: string, products: any[]): any | null {
    const name = aiProductName?.toLowerCase().trim();
    if (!name) return null;

    const exact = products.find((p) => p.name.toLowerCase() === name);
    if (exact) return exact;

    const contains = products.find(
      (p) =>
        p.name.toLowerCase().includes(name) ||
        name.includes(p.name.toLowerCase()),
    );
    if (contains) return contains;

    const aliasMap: Record<string, string[]> = {
      'كابتشينو': ['cappuccino', 'كابتشينو', 'capuccino'],
      'لاتيه': ['latte', 'لاتيه', 'لاتي'],
      'اسبريسو': ['espresso', 'اسبريسو', 'إسبريسو'],
      'أمريكانو': ['americano', 'امريكانو', 'أمريكانو'],
      'موكا': ['mocha', 'موكا'],
      'قهوة تركية سادة': ['turkish coffee', 'turkish', 'قهوة سادة', 'قهوه ساده', 'قهوة', 'قهوه', 'سادة'],
      'قهوة تركية محوج': ['قهوة محوج', 'محوج', 'قهوه محوج'],
      'شاي سادة': ['tea', 'شاي', 'شاي سادة'],
      'شاي باللبن': ['tea with milk', 'شاي باللبن', 'شاي لبن'],
      'شاي بلبن': ['tea with milk', 'شاي باللبن', 'شاي لبن', 'شاي بلبن'],
      'عناب': ['عناب', 'karkadeh', 'كركديه', 'عصير عناب'],
      'قهوه تركي ': ['turkish coffee', 'turkish', 'قهوة سادة', 'قهوه ساده', 'قهوة تركي', 'قهوه تركي'],
      'قهوه فرنساوي ': ['french coffee', 'french', 'french coffee', 'قهوة فرنساوي', 'قهوه فرنساوي'],
      'شاي بالنعناع': ['mint tea', 'شاي بالنعناع', 'شاي نعناع'],
      'كرك': ['karak', 'كرك'],
      'سحلب': ['sahleb', 'سحلب'],
      'آيس لاتيه': ['iced latte', 'آيس لاتيه', 'ايس لاتيه', 'ice latte'],
      'آيس أمريكانو': ['iced americano', 'آيس أمريكانو', 'ايس امريكانو'],
      'فرابيه': ['frappe', 'فرابيه', 'فرابي'],
      'عصير برتقال': ['orange juice', 'عصير برتقال', 'برتقال'],
      'عصير مانجو': ['mango juice', 'عصير مانجو', 'مانجو'],
      'عصير فراولة': ['strawberry juice', 'عصير فراولة', 'فراولة'],
      'عصير ليمون بالنعناع': ['lemon mint', 'عصير ليمون', 'ليمون'],
      'مياه معدنية': ['water', 'مياه', 'معدنية', 'mineral water'],
      'بيبسي': ['pepsi', 'بيبسي'],
      'سبرايت': ['sprite', 'سبرايت'],
      'حواوشي لحمة': ['hawawshi', 'حواوشي'],
      'حواوشي فراخ': ['hawawshi chicken', 'حواوشي فراخ'],
      'سندوتش بطاطس': ['potato sandwich', 'بطاطس'],
      'سندوتش فول وطعمية': ['foul sandwich', 'فول', 'طعمية'],
      'كرواسون عادي': ['croissant', 'كرواسون'],
      'كرواسون شوكولاتة': ['chocolate croissant', 'كرواسون شوكولاتة'],
      'كرواسون جبنة': ['cheese croissant', 'كرواسون جبنة'],
      'فطير مشلتت': ['feteer', 'فطير', 'مشلتت'],
      'تشيز كيك': ['cheesecake', 'تشيز كيك'],
      'براونيز': ['brownie', 'براونيز'],
      'كب كيك فانيليا': ['vanilla cupcake', 'كب كيك'],
      'كب كيك شوكولاتة': ['chocolate cupcake', 'كب كيك شوكولاتة'],
    };

    // 1. Try exact matches first to prevent wrong substring matches (e.g. 'mint tea' matching 'tea')
    for (const [dbName, aliases] of Object.entries(aliasMap)) {
      if (aliases.some((a) => name === a.toLowerCase())) {
        const match = products.find((p) => p.name === dbName);
        if (match) return match;
      }
    }

    // 2. Fall back to partial matches
    for (const [dbName, aliases] of Object.entries(aliasMap)) {
      if (aliases.some((a) => name.includes(a.toLowerCase()) || a.toLowerCase().includes(name))) {
        const match = products.find((p) => p.name === dbName);
        if (match) return match;
      }
    }

    return null;
  }

  // =========================
  // 👤 FIND LAST ORDER BY PHONE
  // =========================
  async findLastByPhone(phone: string, branchId?: string, cafeId?: string) {
    let targetBranchId = branchId;
    if (!targetBranchId) {
      const defaultBranch = await this.prisma.branch.findFirst({
        where: { slug: 'main-branch', cafeId: cafeId! },
        select: { id: true },
      });
      targetBranchId = defaultBranch?.id;
    }
    if (!targetBranchId) return null;
    if (!cafeId) return null;

    const customer = await this.prisma.customer.findUnique({
      where: {
        cafeId_branchId_phone: {
          cafeId,
          branchId: targetBranchId,
          phone,
        },
      },
      include: {
        orders: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: { items: { include: { product: true } }, customer: true },
        },
      },
    });
    return (customer as any)?.orders?.[0] ?? null;
  }

  // =========================
  // 🔁 DUPLICATE LAST ORDER
  // =========================
  async createFromAIDuplicate(lastOrder: any, phone: string, cafeId?: string) {
    if (!lastOrder?.items?.length) {
      throw new BadRequestException('No items to duplicate');
    }

    return this.prisma.$transaction(async (tx) => {
      let targetBranchId = lastOrder.branchId;
      if (!targetBranchId) {
        const defaultBranch = await tx.branch.findFirst({
          where: { slug: 'main-branch', cafeId: cafeId! },
          select: { id: true },
        });
        targetBranchId = defaultBranch?.id;
      }
      if (!targetBranchId) throw new BadRequestException('No active branch found');

      const customer = await tx.customer.upsert({
        where: {
          cafeId_branchId_phone: {
            cafeId: cafeId!,
            branchId: targetBranchId,
            phone,
          },
        },
        update: {},
        create: {
          cafeId: cafeId!,
          branchId: targetBranchId,
          phone,
          name: 'AI Customer',
        },
      });

      const mappedItems = lastOrder.items.map((item: any) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        notes: item.notes,
      }));

      let total = new Prisma.Decimal(0);
      for (const item of mappedItems) {
        total = total.plus(item.unitPrice.mul(item.quantity));
      }

      const code = await this.generateOrderCode(tx);

      const order = await tx.order.create({
        data: {
          code,
          cafeId: cafeId!,
          customerId: customer.id,
          version: 1,
          status: OrderStatus.NEW,
          type: lastOrder.type || 'DINE_IN',
          total,
          branchId: targetBranchId,
          items: { create: mappedItems },
        },
        include: {
          customer: true,
          items: { include: { product: true } },
        },
      });

      // Inventory pipeline: reserve stock + deduct refrigerator stock
      const productIds = mappedItems.map((item: any) => item.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
      });
      const pipelineItems = mappedItems.map((item: any) => {
        const product = products.find(p => p.id === item.productId);
        return {
          productId: item.productId,
          productName: product?.name ?? 'Unknown',
          quantity: item.quantity,
          isRefrigerated: product?.isRefrigerated ?? false,
          refrigeratorInventoryId: product?.refrigeratorInventoryId,
        };
      });
      const pipelineResult3 = await this.inventoryPipeline.reserve({
        orderId: order.id, cafeId: cafeId!, branchId: targetBranchId, items: pipelineItems,
      }, tx);

      if (pipelineResult3.inventoryReserved.length > 0 || pipelineResult3.refrigeratorDeducted.length > 0) {
        await tx.order.update({
          where: { id: order.id },
          data: { stockDeducted: true },
        });
      }

      return { order, unmatched: [] };
    });

    // Emit product.updated events for real-time stock sync
    for (const item of lastOrder.items) {
      const product = await this.prisma.product.findUnique({ where: { id: item.productId } });
      if (product?.isRefrigerated) {
        this.eventsService.emit('product.updated', {
          productId: product.id,
          name: product.name,
          action: 'updated',
        });
      }
    }
  }

  // =========================
  // باقي الكود زي ما هو
  // =========================

  async findAll(filters: any, branchId?: string, cafeId?: string) {
    const where: Prisma.OrderWhereInput = {};
    if (cafeId) {
      where.cafeId = cafeId;
    }
    if (branchId) {
      where.branchId = branchId;
    }
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.sourceType) {
      where.sourceType = filters.sourceType;
    }
    if (filters?.employeeId) {
      where.employeeId = filters.employeeId;
    }
    if (filters?.customerId) {
      where.customerId = filters.customerId;
    }
    if (filters?.dateFrom || filters?.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) {
        where.createdAt.gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        where.createdAt.lte = new Date(filters.dateTo);
      }
    }

    return this.prisma.order.findMany({
      where,
      include: {
        customer: true,
        staff: true,
        employee: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        items: { include: { product: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, cafeId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        staff: true,
        items: { include: { product: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (cafeId && order.cafeId !== cafeId) {
      throw new ForbiddenException('Unauthorized cafe access for this order');
    }
    return order;
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto, userId?: string, role?: string, branchId?: string, cafeId?: string) {
    return this.orderStatusService.updateOrderStatus(id, dto.status, userId, role, branchId, cafeId);
  }

  async cancel(id: string, cafeId?: string, reason?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: { include: { product: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (cafeId && order.cafeId !== cafeId) {
      throw new ForbiddenException('Unauthorized cafe access for this order');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const cancelResult = await tx.order.updateMany({
        where: { id, version: order.version },
        data: { status: OrderStatus.CANCELLED, version: { increment: 1 } },
      });

      if (cancelResult.count === 0) {
        throw new BadRequestException('Order was modified concurrently. Please retry.');
      }

      // Release inventory pipeline (restores stock + releases reservations)
      await this.inventoryPipeline.release(id, tx);

      // Restore refrigerator stock
      for (const item of order.items) {
        if (item.product.isRefrigerated) {
          await tx.product.update({
            where: { id: item.productId },
            data: { refrigeratorStock: { increment: item.quantity } },
          });
        }
      }

      const res = await tx.order.findUnique({
        where: { id },
      });

      return res;
    });

    for (const item of order.items) {
      if (item.product.isRefrigerated) {
        this.eventsService.emit('product.updated', {
          productId: item.productId,
          name: item.product.name,
          action: 'updated',
        });
      }
    }

    return updated;
  }

  async getEmployeeKpi(cafeId?: string, branchId?: string, dateFrom?: string, dateTo?: string) {
    const where: Prisma.OrderWhereInput = {};
    if (cafeId) where.cafeId = cafeId;
    if (branchId) where.branchId = branchId;
    where.employeeId = { not: null };
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const inCafeWhere: Prisma.InCafeOrderWhereInput = {};
    if (cafeId) inCafeWhere.cafeId = cafeId;
    inCafeWhere.employeeId = { not: null };
    if (dateFrom || dateTo) {
      inCafeWhere.createdAt = {};
      if (dateFrom) inCafeWhere.createdAt.gte = new Date(dateFrom);
      if (dateTo) inCafeWhere.createdAt.lte = new Date(dateTo);
    }

    const [orders, inCafeOrders] = await Promise.all([
      this.prisma.order.findMany({
        where,
        select: {
          employeeId: true,
          employee: { select: { id: true, name: true } },
          total: true,
          paymentStatus: true,
          status: true,
        },
      }),
      this.prisma.inCafeOrder.findMany({
        where: inCafeWhere,
        select: {
          employeeId: true,
          employee: { select: { id: true, name: true } },
          total: true,
          paymentStatus: true,
          status: true,
        },
      }),
    ]);

    const map = new Map<string, {
      employeeId: string;
      employeeName: string;
      totalOrders: number;
      paidOrders: number;
      revenue: number;
    }>();

    for (const o of orders) {
      if (!o.employeeId) continue;
      const name = o.employee?.name || 'Unknown';
      const existing = map.get(o.employeeId);
      if (existing) {
        existing.totalOrders++;
        if (o.paymentStatus === 'PAID' || o.status === 'PAID' || o.status === 'CLOSED') {
          existing.paidOrders++;
          existing.revenue += Number(o.total);
        }
      } else {
        map.set(o.employeeId, {
          employeeId: o.employeeId,
          employeeName: name,
          totalOrders: 1,
          paidOrders: (o.paymentStatus === 'PAID' || o.status === 'PAID' || o.status === 'CLOSED') ? 1 : 0,
          revenue: (o.paymentStatus === 'PAID' || o.status === 'PAID' || o.status === 'CLOSED') ? Number(o.total) : 0,
        });
      }
    }

    for (const o of inCafeOrders) {
      if (!o.employeeId) continue;
      const name = o.employee?.name || 'Unknown';
      const existing = map.get(o.employeeId);
      if (existing) {
        existing.totalOrders++;
        if (o.paymentStatus === 'PAID') {
          existing.paidOrders++;
          existing.revenue += Number(o.total);
        }
      } else {
        map.set(o.employeeId, {
          employeeId: o.employeeId,
          employeeName: name,
          totalOrders: 1,
          paidOrders: o.paymentStatus === 'PAID' ? 1 : 0,
          revenue: o.paymentStatus === 'PAID' ? Number(o.total) : 0,
        });
      }
    }

    const results = Array.from(map.values());
    const maxRevenue = Math.max(...results.map(r => r.revenue), 1);
    const maxOrders = Math.max(...results.map(r => r.totalOrders), 1);

    return results.map(r => ({
      ...r,
      kpiScore: Math.round(
        ((r.paidOrders / Math.max(r.totalOrders, 1)) * 40) +
        ((r.revenue / maxRevenue) * 35) +
        ((r.totalOrders / maxOrders) * 25)
      ),
    })).sort((a, b) => b.kpiScore - a.kpiScore);
  }

  async getBaristaQueue(cafeId: string, branchId?: string) {
    return this.orderStatusService.getBaristaQueue(cafeId, branchId);
  }

  async getDriverQueue(cafeId: string, branchId?: string) {
    return this.orderStatusService.getDriverQueue(cafeId, branchId);
  }

  private async generateOrderCode(tx: Prisma.TransactionClient) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `CAF-${dateStr}`;
    const suffix = Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();
    return `${prefix}-${suffix}`;
  }
}




