import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiToolContext, AiToolResult, CalculatedOrderQuote, OrderItemQuoteInput } from './ai-tool.types';

@Injectable()
export class AiToolsService {
  private readonly logger = new Logger(AiToolsService.name);

  private readonly recentQuotes = new Map<string, { quote: CalculatedOrderQuote; at: number }>();

  constructor(private readonly prisma: PrismaService) {}

  private quoteKey(cafeId: string, phone: string): string {
    return `${cafeId}:${phone}`;
  }

  private getRecentQuote(cafeId: string, phone: string): CalculatedOrderQuote | null {
    const key = this.quoteKey(cafeId, phone);
    const entry = this.recentQuotes.get(key);
    if (!entry) return null;
    if (Date.now() - entry.at > 30 * 60 * 1000) {
      this.recentQuotes.delete(key);
      return null;
    }
    return entry.quote;
  }

  /**
   * Tool 1: search_menu
   * Search only active products within the caller's verified cafeId.
   * AI CANNOT SUPPLY cafeId (Rule #4).
   */
  async searchMenu(
    ctx: AiToolContext,
    args: { query?: string; categoryId?: string; limit?: number },
  ): Promise<AiToolResult> {
    const { cafeId } = ctx;
    if (!cafeId) return { success: false, error: 'Missing tenant context' };

    try {
      const cleanQuery = (args.query || '').trim().toLowerCase();
      const where: any = {
        cafeId,
        active: true,
      };

      if (args.categoryId) {
        where.categoryId = args.categoryId;
      }

      const products = await this.prisma.product.findMany({
        where,
        take: args.limit || 15,
        orderBy: { name: 'asc' },
        include: {
          sizes: {
            where: { active: true },
            select: { id: true, name: true, priceAdjust: true },
          },
          options: {
            select: { id: true, name: true, required: true, choices: true },
          },
        },
      });

      const filtered = cleanQuery
        ? products.filter(
            (p) =>
              p.name.toLowerCase().includes(cleanQuery) ||
              (p.category && p.category.toLowerCase().includes(cleanQuery)) ||
              (p.description && p.description.toLowerCase().includes(cleanQuery)),
          )
        : products;

      return {
        success: true,
        data: filtered.map((p) => ({
          id: p.id,
          name: p.name,
          basePrice: Number(p.price),
          category: p.category,
          emoji: p.emoji,
          sizes: p.sizes.map((s) => ({ id: s.id, name: s.name, priceAdjust: Number(s.priceAdjust) })),
          options: p.options.map((o) => ({ id: o.id, name: o.name, required: o.required, choices: o.choices })),
        })),
      };
    } catch (err: any) {
      this.logger.error(`searchMenu failed for cafeId ${cafeId}: ${err?.message}`);
      return { success: false, error: 'Failed to search menu', userFriendlyMessage: 'مش قادر أوصل للمنيو حالياً.' };
    }
  }

  /**
   * Tool 2: get_product_details
   * Retrieve exact price and options for a specific product ID.
   */
  async getProductDetails(ctx: AiToolContext, args: { productId: string }): Promise<AiToolResult> {
    const { cafeId } = ctx;
    if (!cafeId) return { success: false, error: 'Missing tenant context' };

    try {
      const product = await this.prisma.product.findFirst({
        where: { id: args.productId, cafeId, active: true },
        include: {
          sizes: {
            where: { active: true },
            select: { id: true, name: true, priceAdjust: true },
          },
          options: {
            select: { id: true, name: true, required: true, choices: true },
          },
        },
      });

      if (!product) {
        return { success: false, error: 'Product not found', userFriendlyMessage: 'المنتج ده مش موجود في المنيو.' };
      }

      return {
        success: true,
        data: {
          id: product.id,
          name: product.name,
          basePrice: Number(product.price),
          category: product.category,
          emoji: product.emoji,
          sizes: product.sizes.map((s) => ({ id: s.id, name: s.name, priceAdjust: Number(s.priceAdjust) })),
          options: product.options.map((o) => ({ id: o.id, name: o.name, required: o.required, choices: o.choices })),
        },
      };
    } catch (err: any) {
      return { success: false, error: err?.message, userFriendlyMessage: 'مش قادر أتأكد من تفاصيل المنتج دلوقتي.' };
    }
  }

  /**
   * Tool 3: get_cafe_operational_status (Rule #21, #22)
   */
  async getCafeOperationalStatus(ctx: AiToolContext): Promise<AiToolResult> {
    const { cafeId } = ctx;
    if (!cafeId) return { success: false, error: 'Missing tenant context' };

    try {
      const cafe = await this.prisma.cafe.findUnique({
        where: { id: cafeId },
        select: { name: true, active: true, timezone: true },
      });

      const config = await this.prisma.cafeAiConfig.findUnique({
        where: { cafeId },
        select: { openingHoursNotes: true, deliveryNotes: true, botName: true, tone: true },
      });

      return {
        success: true,
        data: {
          cafeName: cafe?.name,
          isOpen: cafe?.active ?? false,
          openingHoursNotes: config?.openingHoursNotes || 'مفتوح يومياً لاستقبال طلباتكم',
          deliveryNotes: config?.deliveryNotes || 'التوصيل متاح لجميع المناطق المحيطة',
        },
      };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  /**
   * Tool 4: check_delivery_quote (Rule #20)
   */
  async checkDeliveryQuote(
    ctx: AiToolContext,
    args: { areaName?: string; subtotal: number },
  ): Promise<AiToolResult> {
    const { cafeId } = ctx;
    if (!cafeId) return { success: false, error: 'Missing tenant context' };

    try {
      const zones = await this.prisma.deliveryZone.findMany({
        where: { cafeId, isActive: true },
        include: { streets: true },
      });

      if (!zones.length) {
        return {
          success: true,
          data: {
            deliveryEnabled: true,
            deliveryFee: 15,
            minimumOrder: 50,
            etaMinutes: 30,
            areaCovered: true,
            message: 'التوصيل متاح برسوم تقديرية 15 ج.',
          },
        };
      }

      const cleanArea = (args.areaName || '').trim().toLowerCase();
      let matchedZone = cleanArea
        ? zones.find(
            (z) =>
              z.name.toLowerCase().includes(cleanArea) ||
              z.mainStreet.toLowerCase().includes(cleanArea) ||
              z.streets.some((s) => s.streetName.toLowerCase().includes(cleanArea)),
          )
        : zones[0];

      if (!matchedZone && cleanArea) {
        return {
          success: true,
          data: {
            deliveryEnabled: false,
            areaCovered: false,
            message: `عذراً، منطقة "${args.areaName}" خارج نطاق التوصيل حالياً.`,
          },
        };
      }

      const zone = matchedZone || zones[0];
      const deliveryFee = Number(zone.deliveryFee);
      const minimumOrder = Number(zone.minimumOrder);

      return {
        success: true,
        data: {
          deliveryEnabled: true,
          areaCovered: true,
          zoneName: zone.name,
          deliveryFee,
          minimumOrder,
          etaMinutes: zone.etaMinutes,
          minimumReached: args.subtotal >= minimumOrder,
          message: `التوصيل لمنطقة ${zone.name}: ${deliveryFee} ج (الحد الأدنى ${minimumOrder} ج).`,
        },
      };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  /**
   * Tool 5: calculate_order_quote (Rule #6 - STRICT DETERMINISTIC MATH)
   * The LLM NEVER calculates totals or discounts. The backend calculates everything.
   */
  async calculateOrderQuote(
    ctx: AiToolContext,
    args: { items: OrderItemQuoteInput[]; deliveryArea?: string },
  ): Promise<AiToolResult<CalculatedOrderQuote>> {
    const { cafeId } = ctx;
    if (!cafeId) return { success: false, error: 'Missing tenant context' };
    if (!args.items || args.items.length === 0) {
      return { success: false, error: 'No items provided' };
    }

    try {
      const productIds = args.items.map((i) => i.productId);
      const dbProducts = await this.prisma.product.findMany({
        where: { id: { in: productIds }, cafeId, active: true },
        include: {
          sizes: { where: { active: true } },
          options: true,
        },
      });

      let itemsSubtotal = 0;
      const quotedItems: CalculatedOrderQuote['items'] = [];

      for (const itemInput of args.items) {
        const product = dbProducts.find((p) => p.id === itemInput.productId);
        if (!product) {
          return {
            success: false,
            error: `Product ${itemInput.productId} not available in this cafe`,
            userFriendlyMessage: 'أحد المنتجات المطلوبة غير متاح حالياً.',
          };
        }

        const basePrice = Number(product.price);
        let sizePrice = 0;
        if (itemInput.size) {
          const matchedSize = product.sizes.find((s) => s.name.toUpperCase() === itemInput.size);
          if (matchedSize) {
            sizePrice = Number(matchedSize.priceAdjust);
          }
        }

        let addonsTotal = 0;
        // In this schema, choices inside options can have prices or addOns
        const unitTotal = basePrice + Math.max(0, sizePrice) + addonsTotal;
        const lineSubtotal = unitTotal * Math.max(1, itemInput.quantity);
        itemsSubtotal += lineSubtotal;

        quotedItems.push({
          productId: product.id,
          productName: product.name,
          unitPrice: basePrice,
          sizePrice,
          addonsTotal,
          quantity: Math.max(1, itemInput.quantity),
          subtotal: lineSubtotal,
          notes: itemInput.notes,
        });
      }

      // Check Active Promotions (Rule #19)
      const now = new Date();
      const activePromos = await this.prisma.cafePromotion.findMany({
        where: {
          cafeId,
          enabled: true,
          startAt: { lte: now },
          OR: [{ endAt: null }, { endAt: { gte: now } }],
        },
        orderBy: { discountValue: 'desc' },
      });

      let discountAmount = 0;
      let appliedPromotion: string | undefined;

      for (const promo of activePromos) {
        const minOrder = Number(promo.minimumOrder);
        if (itemsSubtotal >= minOrder) {
          if (promo.discountType === 'PERCENTAGE') {
            discountAmount = itemsSubtotal * (Number(promo.discountValue) / 100);
            appliedPromotion = `${promo.name} (${Number(promo.discountValue)}%)`;
            break;
          } else if (promo.discountType === 'FIXED_AMOUNT') {
            discountAmount = Math.min(itemsSubtotal, Number(promo.discountValue));
            appliedPromotion = `${promo.name} (-${discountAmount} ج)`;
            break;
          }
        }
      }

      // Delivery calculation (Rule #20)
      const deliveryRes = await this.checkDeliveryQuote(ctx, {
        areaName: args.deliveryArea,
        subtotal: itemsSubtotal,
      });

      const deliveryFee = deliveryRes.data?.deliveryEnabled ? deliveryRes.data.deliveryFee : 0;
      const minRequired = deliveryRes.data?.minimumOrder || 0;
      const finalTotal = Math.max(0, itemsSubtotal - discountAmount) + deliveryFee;

      const quote: CalculatedOrderQuote = {
        items: quotedItems,
        itemsSubtotal,
        deliveryFee,
        discountAmount,
        appliedPromotion,
        finalTotal,
        minimumOrderReached: itemsSubtotal >= minRequired,
        minimumOrderRequired: minRequired,
      };

      if (ctx.phone) {
        this.recentQuotes.set(this.quoteKey(cafeId, ctx.phone), { quote, at: Date.now() });
      }

      return { success: true, data: quote };
    } catch (err: any) {
      this.logger.error(`calculateOrderQuote error: ${err?.message}`);
      return { success: false, error: 'Calculation failed', userFriendlyMessage: 'حدث خطأ في حساب إجمالي الطلب.' };
    }
  }

  /**
   * Tool 6: create_order_transaction (Rule #7, #8 - STRICT TRANSACTION + SNAPSHOTS)
   */
  async createOrderTransaction(
    ctx: AiToolContext,
    args: {
      quote?: CalculatedOrderQuote;
      deliveryAddress?: string;
      notes?: string;
      customerName?: string;
    },
  ): Promise<AiToolResult> {
    const { cafeId, phone, isSimulation } = ctx;
    if (!cafeId) return { success: false, error: 'Missing tenant context' };
    if (!phone) return { success: false, error: 'Missing customer phone' };

    const quote = args.quote || this.getRecentQuote(cafeId, phone);
    if (!quote) {
      return {
        success: false,
        error: 'No quote available',
        userFriendlyMessage: 'محتاج أحسب الطلب الأول قبل التأكيد. ابعتلي الأصناف والمقاسات من فضلك.',
      };
    }

    // In simulation mode, do NOT create real orders (Rule #32)
    if (isSimulation) {
      return {
        success: true,
        data: {
          orderId: 'SIMULATED-ORDER-ID',
          code: 'SIM-001',
          total: quote.finalTotal,
          isSimulation: true,
          message: 'تمت محاكاة الطلب بنجاح (وضع الاختبار للمالك).',
        },
      };
    }

    try {
      const order = await this.prisma.$transaction(async (tx) => {
        const branch = await tx.branch.findFirst({
          where: { cafeId },
          select: { id: true },
        });
        if (!branch) throw new Error('No branch found for cafe');

        // Find or create customer
        const customer = await tx.customer.upsert({
          where: {
            cafeId_branchId_phone: {
              cafeId,
              branchId: branch.id,
              phone,
            },
          },
          update: {
            totalOrders: { increment: 1 },
            totalSpent: { increment: quote.finalTotal },
            lastOrderDate: new Date(),
            name: args.customerName || undefined,
          },
          create: {
            cafeId,
            branchId: branch.id,
            phone,
            name: args.customerName || 'عميل واتساب',
            totalOrders: 1,
            totalSpent: quote.finalTotal,
            lastOrderDate: new Date(),
          },
        });

        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const count = await tx.order.count({ where: { cafeId } });
        const code = `AI-${dateStr}-${String(count + 1).padStart(4, '0')}`;

        // Create Order with item snapshots (Rule #8)
        const createdOrder = await tx.order.create({
          data: {
            cafeId,
            branchId: branch.id,
            code,
            customerId: customer.id,
            status: 'NEW',
            type: args.deliveryAddress ? 'DELIVERY' : 'TAKEAWAY',
            source: 'WHATSAPP_AI',
            total: quote.finalTotal,
            address: args.deliveryAddress || null,
            notes: args.notes || (args.deliveryAddress ? `العنوان: ${args.deliveryAddress}` : null),
            items: {
              create: quote.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                productNameSnapshot: item.productName,
                variantNameSnapshot: item.sizePrice ? 'Size Mod' : null,
                notes: item.notes,
              })),
            },
          },
        });

        return createdOrder;
      });

      this.recentQuotes.delete(this.quoteKey(cafeId, phone));

      return {
        success: true,
        data: {
          orderId: order.id,
          code: order.code,
          total: Number(order.total),
          status: order.status,
          userFriendlyMessage: `تم تأكيد طلبك بنجاح! رقم الطلب: #${order.code}`,
        },
      };
    } catch (err: any) {
      this.logger.error(`createOrderTransaction failed: ${err?.message}`);
      return { success: false, error: 'Transaction failed', userFriendlyMessage: 'تعذر إنشاء الطلب، يرجى المحاولة ثانية.' };
    }
  }

  /**
   * Tool 7: handoff_to_human (Rule #25)
   */
  async handoffToHuman(ctx: AiToolContext, args: { reason: string }): Promise<AiToolResult> {
    const { cafeId, phone } = ctx;
    this.logger.warn(`[HUMAN HANDOFF] Cafe: ${cafeId}, Customer: ${phone}, Reason: ${args.reason}`);

    return {
      success: true,
      data: {
        handoffActive: true,
        reason: args.reason,
        userFriendlyMessage: 'تمام يا فندم، هحول رسالتك حالياً لمسؤول الكافيه وهيتابع معاك فوراً.',
      },
    };
  }

  /**
   * Tool 8: get_payment_instructions
   * Fetch verified digital payment channels configured by cafe owner
   */
  async getPaymentInstructions(
    ctx: AiToolContext,
    args: { orderCode?: string },
  ): Promise<AiToolResult> {
    const { cafeId, phone } = ctx;
    if (!cafeId) return { success: false, error: 'Missing tenant context' };

    try {
      const config = await this.prisma.cafePaymentConfig.findUnique({
        where: { cafeId },
      });

      // Find relevant order for this customer if any
      let relevantOrder = null;
      if (args.orderCode) {
        relevantOrder = await this.prisma.order.findFirst({
          where: { cafeId, code: args.orderCode },
          select: { id: true, code: true, total: true, amountPaid: true, paymentStatus: true },
        });
      } else if (phone) {
        relevantOrder = await this.prisma.order.findFirst({
          where: {
            cafeId,
            customer: { phone },
            paymentStatus: { in: ['UNPAID', 'PENDING'] },
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true, code: true, total: true, amountPaid: true, paymentStatus: true },
        });
      }

      const amountDue = relevantOrder
        ? Math.max(0, Number(relevantOrder.total) - Number(relevantOrder.amountPaid || 0))
        : null;

      const methods: string[] = [];
      let detailsText = '';

      if (config?.instapayEnabled && config.instapayAddress) {
        methods.push('انستاباي (InstaPay)');
        detailsText += `🔹 *انستاباي (InstaPay)*:\n   - العنوان (IPA): \`${config.instapayAddress}\`\n`;
        if (config.instapayAccountName) {
          detailsText += `   - باسم: ${config.instapayAccountName}\n`;
        }
        if (relevantOrder) {
          detailsText += `   - المبلغ المطلوب: *${amountDue} ج.م*\n   - يرجى كتابة كود الطلب (\`${relevantOrder.code}\`) في خانة الملاحظات.\n`;
        }
        detailsText += '\n';
      }

      if (config?.vodafoneCashEnabled && config.vodafoneCashNumber) {
        methods.push('فودافون كاش');
        detailsText += `🔹 *فودافون كاش*:\n   - رقم المحفظة: \`${config.vodafoneCashNumber}\`\n`;
        if (amountDue) {
          detailsText += `   - كود التحويل السريع: \`*9*7*${config.vodafoneCashNumber}*${Math.round(amountDue)}#\`\n`;
        }
        detailsText += '\n';
      }

      if (config?.orangeCashEnabled && config.orangeCashNumber) {
        methods.push('أورنج كاش');
        detailsText += `🔹 *أورنج كاش*: رقم \`${config.orangeCashNumber}\`\n\n`;
      }

      if (config?.etisalatCashEnabled && config.etisalatCashNumber) {
        methods.push('اتصالات كاش');
        detailsText += `🔹 *اتصالات كاش*: رقم \`${config.etisalatCashNumber}\`\n\n`;
      }

      if (config?.wePayEnabled && config.wePayNumber) {
        methods.push('WE Pay');
        detailsText += `🔹 *محفظة WE Pay*: رقم \`${config.wePayNumber}\`\n\n`;
      }

      if (methods.length === 0) {
        return {
          success: true,
          data: {
            available: false,
            methods: [],
            userFriendlyMessage: 'الدفع الإلكتروني غير مفعل حالياً، المتاح الدفع نقداً (كاش) عند الاستلام ☕',
          },
        };
      }

      let message = `💳 *طرق الدفع الإلكتروني المتاحة:*\n\n${detailsText}`;
      if (relevantOrder) {
        message += `رقم طلبك: #${relevantOrder.code} - الإجمالي: ${amountDue} ج.م\n`;
      }
      message += `بعد إتمام التحويل، ارسل لي رقم العملية أو رقم المحفظة لتأكيد طلبك فوراً! ✨`;

      return {
        success: true,
        data: {
          available: true,
          methods,
          orderCode: relevantOrder?.code,
          amountDue,
          userFriendlyMessage: message,
        },
      };
    } catch (err: any) {
      this.logger.error(`getPaymentInstructions error: ${err?.message}`);
      return { success: false, error: 'Failed to fetch payment details' };
    }
  }

  /**
   * Tool 9: submit_payment_reference
   * Customer submits transfer reference or wallet number
   */
  async submitPaymentReference(
    ctx: AiToolContext,
    args: { referenceNumber: string; provider?: string; amount?: number; orderCode?: string },
  ): Promise<AiToolResult> {
    const { cafeId, phone } = ctx;
    if (!cafeId) return { success: false, error: 'Missing tenant context' };

    try {
      // Find order to associate with
      let order = null;
      if (args.orderCode) {
        order = await this.prisma.order.findFirst({
          where: { cafeId, code: args.orderCode },
        });
      } else if (phone) {
        order = await this.prisma.order.findFirst({
          where: { cafeId, customer: { phone } },
          orderBy: { createdAt: 'desc' },
        });
      }

      if (!order) {
        return {
          success: false,
          error: 'No order found for this customer',
          userFriendlyMessage: 'لم نتمكن من تحديد الطلب الخاص بك، يرجى كتابة كود الطلب مع رقم العملية.',
        };
      }

      const amount = args.amount ?? Math.max(0, Number(order.total) - Number(order.amountPaid || 0));

      const tx = await this.prisma.digitalPaymentTransaction.create({
        data: {
          cafe: { connect: { id: cafeId } },
          order: { connect: { id: order.id } },
          customerPhone: phone || '0000000000',
          provider: (args.provider || 'INSTAPAY').toUpperCase(),
          referenceNumber: args.referenceNumber.trim(),
          amount,
          status: 'VERIFYING',
          notes: `Submitted via WhatsApp AI bot for Order #${order.code}`,
        },
      });

      return {
        success: true,
        data: {
          transactionId: tx.id,
          orderCode: order.code,
          referenceNumber: tx.referenceNumber,
          userFriendlyMessage: `تم استلام رقم العملية (#${tx.referenceNumber}) لطلبك #${order.code} بنجاح! جاري مراجعة التحويل وتأكيد الدفع خلال لحظات ☕✨`,
        },
      };
    } catch (err: any) {
      this.logger.error(`submitPaymentReference error: ${err?.message}`);
      return { success: false, error: 'Failed to record payment reference' };
    }
  }

  /**
   * Tool 10: check_playstation_availability
   * Query free gaming devices, rooms, and hourly rates for WhatsApp AI
   */
  async checkPlayStationAvailability(
    ctx: AiToolContext,
    args: { deviceType?: string },
  ): Promise<AiToolResult> {
    const { cafeId } = ctx;
    if (!cafeId) return { success: false, error: 'Missing tenant context' };

    try {
      const devices = await this.prisma.playStationDevice.findMany({
        where: { cafeId, active: true },
        orderBy: { name: 'asc' },
      });

      if (devices.length === 0) {
        return {
          success: true,
          data: {
            hasPlayStation: false,
            userFriendlyMessage: 'خدمة البلايستيشن والغرف غير متوفرة في هذا الفرع حالياً ☕',
          },
        };
      }

      // Check active sessions
      const activeSessions = await this.prisma.playStationSession.findMany({
        where: {
          cafeId,
          status: { in: ['Pending Free Time', 'Running'] },
        },
        select: { deviceId: true },
      });

      const busyDeviceIds = new Set(activeSessions.map((s) => s.deviceId));
      const freeDevices = devices.filter((d) => !busyDeviceIds.has(d.id));

      const pricing = await this.prisma.playStationPricing.findUnique({
        where: { cafeId },
      });

      const singleRate = Number(pricing?.singlePlayerHourlyPrice || 25);
      const multiRate = Number(pricing?.twoPlayersHourlyPrice || 35);

      let msg = `🎮 *صالات وأجهزة البلايستيشن المتاحة:*\n\n`;
      if (freeDevices.length === 0) {
        msg += `جميع الأجهزة والغرف مشغولة حالياً بالكامل. يمكنك مراجعتنا بعد قليل لحجز دورك! ⏳\n\n`;
      } else {
        msg += `✅ متاح لدينا الآن (${freeDevices.length}) أجهزة/غرف شاغرة:\n`;
        freeDevices.forEach((dev) => {
          const rate = dev.hourlyRate ? `${Number(dev.hourlyRate)} ج.م/ساعة` : `${singleRate} ج.م/ساعة`;
          msg += `• *${dev.name}* (${dev.deviceType}) — السعر: ${rate}\n`;
        });
        msg += '\n';
      }

      msg += `💰 *قائمة الأسعار العامة للساعة:*\n`;
      msg += `• لعب فردي (Single): ${singleRate} ج.م/ساعة\n`;
      msg += `• لعب زوجي (Multi): ${multiRate} ج.م/ساعة\n`;
      msg += `(أول 10 دقائق من كل جلسة مجاناً للتحمية واختيار الفرق! ⚽✨)`;

      return {
        success: true,
        data: {
          hasPlayStation: true,
          totalDevices: devices.length,
          freeCount: freeDevices.length,
          freeDevices: freeDevices.map((d) => ({
            id: d.id,
            name: d.name,
            deviceType: d.deviceType,
            hourlyRate: d.hourlyRate ? Number(d.hourlyRate) : singleRate,
          })),
          pricing: {
            singlePlayerHourly: singleRate,
            twoPlayersHourly: multiRate,
          },
          userFriendlyMessage: msg,
        },
      };
    } catch (err: any) {
      this.logger.error(`checkPlayStationAvailability error: ${err?.message}`);
      return { success: false, error: 'Failed to check PlayStation status' };
    }
  }

  /**
   * Tool: check_inventory_and_costing
   * Real-time stock levels, low stock alerts, and recipe/cup costing (Dine-In vs Takeaway).
   */
  async checkInventoryAndCosting(
    ctx: AiToolContext,
    args: { productName?: string; category?: string },
  ): Promise<AiToolResult> {
    const { cafeId } = ctx;
    if (!cafeId) return { success: false, error: 'Missing tenant context' };

    try {
      // 1. Fetch inventory items
      const inventoryItems = await this.prisma.inventory.findMany({
        where: { cafeId },
        orderBy: { itemName: 'asc' },
      });

      const lowStock = inventoryItems.filter((i) => Number(i.currentQty) <= Number(i.minThreshold));
      const packagingItems = inventoryItems.filter((i) => /كوب|غطاء|ماسك|شاليموه|شنطة|علبة|cup|lid|sleeve|straw|box/i.test(i.itemName));
      const rawIngredients = inventoryItems.filter((i) => !/كوب|غطاء|ماسك|شاليموه|شنطة|علبة|cup|lid|sleeve|straw|box/i.test(i.itemName));

      let msg = `📦 *تقرير المخزون والمقادير وتكلفة الكوب:*\n\n`;

      // Low stock section
      if (lowStock.length > 0) {
        msg += `⚠️ *تنبيه نواقص المخزون (${lowStock.length} أصناف وصلت للحد الأدنى):*\n`;
        lowStock.forEach((i) => {
          msg += `• *${i.itemName}*: الرصيد الحالي ${Number(i.currentQty)} ${i.unit} (الحد الأدنى: ${Number(i.minThreshold)})\n`;
        });
        msg += '\n';
      } else {
        msg += `✅ جميع الخامات ومستلزمات التعبئة أعلى من الحد الأدنى للمخزون.\n\n`;
      }

      // If specific product requested for cup costing
      let productCosting: any = null;
      if (args.productName) {
        const cleanName = args.productName.trim().toLowerCase();
        const product = await this.prisma.product.findFirst({
          where: {
            cafeId,
            name: { contains: cleanName, mode: 'insensitive' },
          },
        });

        if (product) {
          const recipe = await this.prisma.recipeIngredient.findMany({
            where: { productId: product.id },
            include: { inventory: true },
          });

          const packaging = await this.prisma.packagingMaterial.findMany({
            where: { productId: product.id },
            include: { inventory: true },
          });

          const sellingPrice = Number(product.price);
          const ingredientsCost = recipe.reduce((sum, r) => {
            const qty = Number(r.quantity);
            const unitCost = Number(r.inventory?.costPerUnit ?? 0);
            return sum + qty * unitCost * (1 + Number(r.wastePercent ?? 0) / 100);
          }, 0);

          const packagingCost = packaging.reduce((sum, p) => {
            return sum + Number(p.quantity) * Number(p.inventory?.costPerUnit ?? 0);
          }, 0);

          const dineInCost = Math.round(ingredientsCost * 100) / 100;
          const takeawayCost = Math.round((ingredientsCost + packagingCost) * 100) / 100;

          const dineInProfit = Math.round((sellingPrice - dineInCost) * 100) / 100;
          const takeawayProfit = Math.round((sellingPrice - takeawayCost) * 100) / 100;

          const dineInMargin = sellingPrice > 0 ? Math.round((dineInProfit / sellingPrice) * 1000) / 10 : 0;
          const takeawayMargin = sellingPrice > 0 ? Math.round((takeawayProfit / sellingPrice) * 1000) / 10 : 0;

          productCosting = {
            productName: product.name,
            sellingPrice,
            dineInCost,
            takeawayCost,
            packagingCost,
            dineInProfit,
            takeawayProfit,
            dineInMargin,
            takeawayMargin,
          };

          msg += `☕ *تفصيل تكلفة وهامش ربح (${product.name}):*\n`;
          msg += `• سعر البيع: *${sellingPrice} ج.م*\n`;
          msg += `• *تقديم صالة (Dine-In)* (أكواب بورسلين/زجاج): التكلفة = *${dineInCost} ج.م* | صافي الربح = *${dineInProfit} ج.م* (${dineInMargin}%)\n`;
          msg += `• *تقديم تيك أواي (Takeaway)* (كوب كرتون + غطاء + ماسك): التكلفة = *${takeawayCost} ج.م* | صافي الربح = *${takeawayProfit} ج.م* (${takeawayMargin}%)\n`;
          msg += `(تكلفة مواد التعبئة والتغليف وحدها = ${packagingCost} ج.م)\n\n`;
        }
      }

      msg += `📊 *إجمالي المخزون*: ${inventoryItems.length} صنف مسجل (${rawIngredients.length} خامات أساسية، ${packagingItems.length} مواد تعبئة وتغليف).`;

      return {
        success: true,
        data: {
          totalItems: inventoryItems.length,
          lowStockCount: lowStock.length,
          lowStock: lowStock.map((i) => ({ id: i.id, name: i.itemName, currentQty: Number(i.currentQty), minThreshold: Number(i.minThreshold), unit: i.unit })),
          productCosting,
          userFriendlyMessage: msg,
        },
      };
    } catch (err: any) {
      this.logger.error(`checkInventoryAndCosting error: ${err?.message}`);
      return { success: false, error: 'Failed to inspect inventory and recipe costing' };
    }
  }
}


