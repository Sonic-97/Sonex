import { Injectable, BadRequestException, NotFoundException, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  CreateDeviceDto,
  UpdateDeviceDto,
  UpdatePricingDto,
  StartSessionDto,
  AddSessionOrderDto,
  TransferSessionDto,
  SettleSessionDto,
} from './dto/playstation.dto';
import { EventsService } from '../events/events.service';
import { DigitalPaymentService } from '../payment/digital-payment.service';
import { InventoryPipelineService } from '../inventory-pipeline/inventory-pipeline.service';

@Injectable()
export class PlayStationService {
  private readonly logger = new Logger(PlayStationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
    private readonly digitalPaymentService: DigitalPaymentService,
    @Optional() private readonly inventoryPipeline?: InventoryPipelineService,
  ) {}

  // ── DEVICES & ROOMS ──

  async getDevices(cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    let devices = await this.prisma.playStationDevice.findMany({
      where: { cafeId },
      orderBy: { name: 'asc' },
    });

    // Auto-seed one default device if none exist
    if (devices.length === 0) {
      const defaultDevice = await this.prisma.playStationDevice.create({
        data: {
          cafeId,
          name: 'PS5 - جهاز 1',
          deviceType: 'PS5',
        },
      });
      devices = [defaultDevice];
    }

    return devices;
  }

  async createDevice(dto: CreateDeviceDto, cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const existing = await this.prisma.playStationDevice.findFirst({
      where: { cafeId, name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (existing) {
      throw new BadRequestException('اسم الجهاز أو الغرفة مستخدم بالفعل في هذا الكافيه');
    }

    return this.prisma.playStationDevice.create({
      data: {
        cafeId,
        name: dto.name,
        deviceType: dto.deviceType || 'PS5',
        hourlyRate: dto.hourlyRate != null ? new Prisma.Decimal(dto.hourlyRate) : null,
        multiHourlyRate: dto.multiHourlyRate != null ? new Prisma.Decimal(dto.multiHourlyRate) : null,
        notes: dto.notes || null,
      },
    });
  }

  async updateDevice(id: string, dto: UpdateDeviceDto, cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const device = await this.prisma.playStationDevice.findFirst({
      where: { id, cafeId },
    });
    if (!device) {
      throw new NotFoundException('الجهاز غير موجود في هذا الكافيه');
    }

    if (dto.name) {
      const existing = await this.prisma.playStationDevice.findFirst({
        where: {
          cafeId,
          name: { equals: dto.name, mode: 'insensitive' },
          id: { not: id },
        },
      });
      if (existing) {
        throw new BadRequestException('اسم الجهاز أو الغرفة مستخدم بالفعل');
      }
    }

    return this.prisma.playStationDevice.update({
      where: { id },
      data: {
        name: dto.name,
        deviceType: dto.deviceType,
        hourlyRate: dto.hourlyRate != null ? new Prisma.Decimal(dto.hourlyRate) : undefined,
        multiHourlyRate: dto.multiHourlyRate != null ? new Prisma.Decimal(dto.multiHourlyRate) : undefined,
        notes: dto.notes,
        active: dto.active,
      },
    });
  }

  async deleteDevice(id: string, cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const device = await this.prisma.playStationDevice.findFirst({
      where: { id, cafeId },
    });
    if (!device) {
      throw new NotFoundException('الجهاز غير موجود');
    }

    const activeSession = await this.prisma.playStationSession.findFirst({
      where: { deviceId: id, endTime: null },
    });
    if (activeSession) {
      throw new BadRequestException('لا يمكن حذف الجهاز لوجود جلسة نشطة حالياً');
    }

    return this.prisma.playStationDevice.delete({
      where: { id },
    });
  }

  // ── PRICING ──

  async getPricing(cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    let pricing = await this.prisma.playStationPricing.findUnique({
      where: { cafeId },
    });

    if (!pricing) {
      pricing = await this.prisma.playStationPricing.create({
        data: {
          cafeId,
          singlePlayerHourlyPrice: new Prisma.Decimal(25.0),
          twoPlayersHourlyPrice: new Prisma.Decimal(35.0),
          threePlayersHourlyPrice: new Prisma.Decimal(45.0),
          fourPlayersHourlyPrice: new Prisma.Decimal(55.0),
        },
      });
    }

    return pricing;
  }

  async updatePricing(dto: UpdatePricingDto, cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    return this.prisma.playStationPricing.upsert({
      where: { cafeId },
      update: {
        singlePlayerHourlyPrice: new Prisma.Decimal(dto.singlePlayerHourlyPrice),
        twoPlayersHourlyPrice: new Prisma.Decimal(dto.twoPlayersHourlyPrice),
        threePlayersHourlyPrice: new Prisma.Decimal(dto.threePlayersHourlyPrice),
        fourPlayersHourlyPrice: new Prisma.Decimal(dto.fourPlayersHourlyPrice),
      },
      create: {
        cafeId,
        singlePlayerHourlyPrice: new Prisma.Decimal(dto.singlePlayerHourlyPrice),
        twoPlayersHourlyPrice: new Prisma.Decimal(dto.twoPlayersHourlyPrice),
        threePlayersHourlyPrice: new Prisma.Decimal(dto.threePlayersHourlyPrice),
        fourPlayersHourlyPrice: new Prisma.Decimal(dto.fourPlayersHourlyPrice),
      },
    });
  }

  // ── SESSIONS MANAGEMENT ──

  async getActiveSessions(cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const sessions = await this.prisma.playStationSession.findMany({
      where: {
        cafeId,
        status: { in: ['Pending Free Time', 'Running'] },
      },
      include: {
        device: true,
        openedBy: { select: { id: true, name: true } },
        orders: {
          select: {
            id: true,
            code: true,
            total: true,
            paymentStatus: true,
            items: {
              select: {
                id: true,
                quantity: true,
                unitPrice: true,
                productNameSnapshot: true,
              },
            },
          },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    const now = new Date();
    for (const session of sessions) {
      if (session.status === 'Pending Free Time' && !session.isPaused) {
        const freeEnd = session.freePeriodEndTime
          ? new Date(session.freePeriodEndTime)
          : new Date(session.startTime.getTime() + 600000);
        if (now >= freeEnd) {
          await this.prisma.playStationSession.update({
            where: { id: session.id },
            data: {
              status: 'Running',
              billableStartTime: session.billableStartTime ?? now,
            },
          });
          session.status = 'Running';
          session.billableStartTime = session.billableStartTime ?? now;
        }
      }
    }

    const serverTime = now.toISOString();
    return sessions.map((session) => {
      const ordersTotal = session.orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
      return {
        ...session,
        ordersTotal,
        serverTime,
      };
    });
  }

  async startSession(dto: StartSessionDto, employeeId: string, cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const device = await this.prisma.playStationDevice.findFirst({
      where: { id: dto.deviceId, cafeId },
    });
    if (!device) {
      throw new NotFoundException('الجهاز أو الغرفة غير موجودة');
    }
    if (!device.active) {
      throw new BadRequestException('هذا الجهاز غير مفعل حالياً');
    }

    const active = await this.prisma.playStationSession.findFirst({
      where: {
        deviceId: dto.deviceId,
        status: { in: ['Pending Free Time', 'Running'] },
      },
    });
    if (active) {
      throw new BadRequestException('هذا الجهاز قيد الاستخدام حالياً في جلسة أخرى');
    }

    const startTime = new Date();
    const freePeriodEndTime = new Date(startTime.getTime() + 10 * 60 * 1000); // 10 min free phase

    this.logger.log(
      `[SESSION START] Cafe: ${cafeId} | Device: ${device.name} | Customer: ${dto.customerName} | Type: ${dto.sessionType}`,
    );

    const session = await this.prisma.playStationSession.create({
      data: {
        cafeId,
        deviceId: dto.deviceId,
        customerName: dto.customerName,
        sessionType: dto.sessionType,
        employeeId,
        startTime,
        freePeriodEndTime,
        status: 'Pending Free Time',
        targetDurationMinutes: dto.targetDurationMinutes || null,
        notes: dto.notes || null,
        isPaused: false,
        totalPauseMinutes: 0,
      },
      include: {
        device: true,
        openedBy: { select: { id: true, name: true } },
        orders: true,
      },
    });

    this.eventsService.broadcast('playstation:session_started', {
      sessionId: session.id,
      deviceId: device.id,
      deviceName: device.name,
      customerName: session.customerName,
      sessionType: session.sessionType,
      startTime: session.startTime,
    }, cafeId);

    return session;
  }

  async pauseSession(id: string, cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const session = await this.prisma.playStationSession.findFirst({
      where: { id, cafeId },
      include: { device: true },
    });
    if (!session) throw new NotFoundException('الجلسة غير موجودة');
    if (session.status === 'Completed') throw new BadRequestException('الجلسة مغلقة بالفعل');
    if (session.isPaused) throw new BadRequestException('الجلسة متوقفة مؤقتاً بالفعل');

    const updated = await this.prisma.playStationSession.update({
      where: { id },
      data: {
        isPaused: true,
        lastPausedAt: new Date(),
      },
      include: { device: true },
    });

    this.eventsService.broadcast('playstation:session_paused', {
      sessionId: id,
      deviceName: session.device.name,
      lastPausedAt: updated.lastPausedAt,
    }, cafeId);

    return updated;
  }

  async resumeSession(id: string, cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const session = await this.prisma.playStationSession.findFirst({
      where: { id, cafeId },
      include: { device: true },
    });
    if (!session) throw new NotFoundException('الجلسة غير موجودة');
    if (!session.isPaused) throw new BadRequestException('الجلسة قيد التشغيل وليست متوقفة');

    const now = new Date();
    const pausedMs = session.lastPausedAt ? now.getTime() - session.lastPausedAt.getTime() : 0;
    const additionalPauseMinutes = Math.max(1, Math.round(pausedMs / 60000));

    const updated = await this.prisma.playStationSession.update({
      where: { id },
      data: {
        isPaused: false,
        lastPausedAt: null,
        totalPauseMinutes: (session.totalPauseMinutes || 0) + additionalPauseMinutes,
      },
      include: { device: true },
    });

    this.eventsService.broadcast('playstation:session_resumed', {
      sessionId: id,
      deviceName: session.device.name,
      totalPauseMinutes: updated.totalPauseMinutes,
    }, cafeId);

    return updated;
  }

  async transferSession(id: string, dto: TransferSessionDto, cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const session = await this.prisma.playStationSession.findFirst({
      where: { id, cafeId },
      include: { device: true },
    });
    if (!session) throw new NotFoundException('الجلسة غير موجودة');
    if (session.status === 'Completed') throw new BadRequestException('الجلسة مغلقة بالفعل');

    const targetDevice = await this.prisma.playStationDevice.findFirst({
      where: { id: dto.targetDeviceId, cafeId },
    });
    if (!targetDevice) throw new NotFoundException('الجهاز المراد النقل إليه غير موجود');
    if (!targetDevice.active) throw new BadRequestException('الجهاز المراد النقل إليه غير مفعل');

    const activeOnTarget = await this.prisma.playStationSession.findFirst({
      where: {
        deviceId: dto.targetDeviceId,
        status: { in: ['Pending Free Time', 'Running'] },
        id: { not: id },
      },
    });
    if (activeOnTarget) {
      throw new BadRequestException('الجهاز الجديد قيد الاستخدام حالياً في جلسة أخرى');
    }

    const previousDeviceName = session.device.name;
    const updated = await this.prisma.playStationSession.update({
      where: { id },
      data: {
        deviceId: dto.targetDeviceId,
        notes: dto.notes ? `${session.notes || ''} | نقل: ${dto.notes}` : session.notes,
      },
      include: { device: true },
    });

    this.eventsService.broadcast('playstation:session_transferred', {
      sessionId: id,
      previousDevice: previousDeviceName,
      newDevice: targetDevice.name,
    }, cafeId);

    return updated;
  }

  /**
   * Add drinks & snacks from cafe menu to the active PlayStation session.
   */
  async addSessionOrder(sessionId: string, dto: AddSessionOrderDto, employeeId: string, cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const session = await this.prisma.playStationSession.findFirst({
      where: { id: sessionId, cafeId },
      include: { device: true },
    });
    if (!session) throw new NotFoundException('الجلسة غير موجودة');
    if (session.status === 'Completed') throw new BadRequestException('الجلسة مغلقة بالفعل');

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('يجب إضافة منتج واحد على الأقل');
    }

    // Get branch for order
    const branch = await this.prisma.branch.findFirst({
      where: { cafeId, active: true },
    });
    if (!branch) throw new BadRequestException('لا يوجد فرع مفعل للكافيه');

    // Find or create customer
    let customer = await this.prisma.customer.findFirst({
      where: { cafeId, name: session.customerName },
    });
    if (!customer) {
      customer = await this.prisma.customer.create({
        data: {
          cafeId,
          branchId: branch.id,
          name: session.customerName,
          phone: `PS-${Date.now().toString().slice(-8)}`,
        },
      });
    }

    // Load products and calculate items
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, cafeId },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    let orderTotal = 0;
    const orderItemsData = dto.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) throw new NotFoundException(`المنتج ${item.productId} غير موجود`);
      const unitPrice = Number(product.price);
      const subtotal = unitPrice * item.quantity;
      orderTotal += subtotal;

      return {
        productId: product.id,
        quantity: item.quantity,
        unitPrice: new Prisma.Decimal(unitPrice),
        productNameSnapshot: product.name,
        notes: item.notes || null,
      };
    });

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.prisma.order.count({ where: { cafeId } });
    const code = `PS-${dateStr}-${String(count + 1).padStart(4, '0')}`;

    const createdOrder = await this.prisma.order.create({
      data: {
        cafeId,
        branchId: branch.id,
        code,
        customerId: customer.id,
        status: 'NEW',
        type: 'DINE_IN',
        source: 'PLAYSTATION_LOUNGE',
        total: new Prisma.Decimal(orderTotal),
        paymentStatus: 'UNPAID',
        notes: `طلب جلسة: ${session.device.name} (${session.customerName})${dto.notes ? ' - ' + dto.notes : ''}`,
        playStationSessionId: sessionId,
        items: {
          create: orderItemsData,
        },
      },
      include: {
        items: true,
      },
    });

    // Optional reservation of ingredients for PlayStation lounge orders
    if (this.inventoryPipeline) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await this.inventoryPipeline!.reserve({
            orderId: createdOrder.id,
            cafeId,
            branchId: branch.id,
            orderType: 'DINE_IN',
            defaultPackagingMode: 'DINE_IN',
            items: dto.items.map((i) => {
              const p = productMap.get(i.productId)!;
              let itemPackagingMode: 'TAKEAWAY' | 'DINE_IN' = 'DINE_IN';
              if (i.notes && /تيك\s*اواي|takeaway|سفري/i.test(i.notes)) {
                itemPackagingMode = 'TAKEAWAY';
              }
              return {
                productId: i.productId,
                productName: p.name,
                quantity: i.quantity,
                isRefrigerated: p.isRefrigerated || false,
                refrigeratorInventoryId: p.refrigeratorInventoryId,
                packagingMode: itemPackagingMode,
              };
            }),
          }, tx);
        });
      } catch (err) {
        this.logger.warn(`Inventory reservation skipped for session order: ${(err as Error).message}`);
      }
    }

    // Notify barista & kitchen screens
    this.eventsService.emitToBarista('kitchen:new_order', {
      orderId: createdOrder.id,
      code: createdOrder.code,
      source: 'PLAYSTATION_LOUNGE',
      deviceName: session.device.name,
      customerName: session.customerName,
      items: createdOrder.items,
    }, cafeId);

    return createdOrder;
  }

  /**
   * Authoritative calculation of live session state, duration, pricing, and attached orders.
   */
  async getSessionTimerState(id: string, cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const session = await this.prisma.playStationSession.findFirst({
      where: { id, cafeId },
      include: {
        device: true,
        openedBy: { select: { id: true, name: true } },
        orders: {
          include: {
            items: true,
          },
        },
      },
    });

    if (!session) throw new NotFoundException('الجلسة غير موجودة');

    const now = new Date();
    const serverTime = now.toISOString();
    const freePeriodEndTime = session.freePeriodEndTime
      ? new Date(session.freePeriodEndTime)
      : new Date(session.startTime.getTime() + 600000);

    const isFreePhase = now < freePeriodEndTime;

    // Remaining free time
    const freeRemainingMs = isFreePhase ? Math.max(0, freePeriodEndTime.getTime() - now.getTime()) : 0;
    const freeRemainingMinutes = Math.floor(freeRemainingMs / 60000);
    const freeRemainingSeconds = Math.floor((freeRemainingMs % 60000) / 1000);

    // Gross elapsed
    const grossElapsedMs = now.getTime() - session.startTime.getTime();
    const totalPausedMs = (session.totalPauseMinutes || 0) * 60000;
    const activeElapsedMs = Math.max(0, grossElapsedMs - totalPausedMs);

    const elapsedMinutes = Math.floor(activeElapsedMs / 60000);
    const elapsedSeconds = Math.floor((activeElapsedMs % 60000) / 1000);

    // Billable calculation
    let billableMinutes = 0;
    let billableSeconds = 0;
    if (!isFreePhase) {
      const billableMs = Math.max(0, activeElapsedMs - 600000);
      billableMinutes = Math.floor(billableMs / 60000);
      billableSeconds = Math.floor((billableMs % 60000) / 1000);
    }

    // Determine hourly rate: check device custom override first, then fallback to global pricing
    const pricing = await this.getPricing(cafeId);
    let hourlyPrice: Prisma.Decimal;

    const isMultiPlayer = session.sessionType !== 'Single Player';
    if (isMultiPlayer && session.device.multiHourlyRate) {
      hourlyPrice = session.device.multiHourlyRate;
    } else if (!isMultiPlayer && session.device.hourlyRate) {
      hourlyPrice = session.device.hourlyRate;
    } else {
      if (session.sessionType === 'Single Player') {
        hourlyPrice = pricing.singlePlayerHourlyPrice;
      } else if (session.sessionType === 'Two Players') {
        hourlyPrice = pricing.twoPlayersHourlyPrice;
      } else if (session.sessionType === 'Three Players') {
        hourlyPrice = pricing.threePlayersHourlyPrice;
      } else {
        hourlyPrice = pricing.fourPlayersHourlyPrice;
      }
    }

    const ratePerMinute = hourlyPrice.div(60);
    const timeCost = billableMinutes > 0
      ? Number(ratePerMinute.mul(billableMinutes + billableSeconds / 60))
      : 0;

    // Attached Cafe Orders
    const ordersTotal = session.orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const totalCost = Math.round((timeCost + ordersTotal) * 100) / 100;

    // Fixed time remaining (if targetDurationMinutes set)
    let targetRemainingMinutes: number | null = null;
    if (session.targetDurationMinutes) {
      targetRemainingMinutes = Math.max(0, session.targetDurationMinutes - elapsedMinutes);
    }

    return {
      sessionId: session.id,
      status: session.status,
      isPaused: session.isPaused,
      totalPauseMinutes: session.totalPauseMinutes,
      serverTime,
      startTime: session.startTime.toISOString(),
      freePeriodEndTime: freePeriodEndTime.toISOString(),
      freeRemainingMinutes,
      freeRemainingSeconds,
      elapsedMinutes,
      elapsedSeconds,
      billableMinutes,
      billableSeconds,
      isFreePhase,
      hourlyRate: Number(hourlyPrice),
      sessionType: session.sessionType,
      timeCost: Math.round(timeCost * 100) / 100,
      ordersTotal: Math.round(ordersTotal * 100) / 100,
      totalCost,
      deviceName: session.device?.name || 'Unknown',
      deviceType: session.device?.deviceType || 'PS5',
      customerName: session.customerName,
      employeeName: session.openedBy?.name || 'Unknown',
      ordersCount: session.orders.length,
      orders: session.orders,
      targetDurationMinutes: session.targetDurationMinutes,
      targetRemainingMinutes,
    };
  }

  /**
   * Unified Checkout & Settlement: closes session and settles all attached orders.
   */
  async settleAndCloseSession(
    sessionId: string,
    dto: SettleSessionDto,
    closedById: string,
    cafeId: string,
  ) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const session = await this.prisma.playStationSession.findFirst({
      where: { id: sessionId, cafeId },
      include: {
        device: true,
        orders: true,
      },
    });
    if (!session) throw new NotFoundException('الجلسة غير موجودة');
    if (session.status === 'Completed' || session.endTime) {
      throw new BadRequestException('هذه الجلسة مغلقة بالفعل');
    }

    const timerState = await this.getSessionTimerState(sessionId, cafeId);
    const timeCost = timerState.timeCost;
    const ordersTotal = timerState.ordersTotal;
    const discount = dto.discountAmount || 0;
    const grandTotal = Math.max(0, timeCost + ordersTotal - discount);

    const endTime = new Date();
    const duration = timerState.elapsedMinutes;
    const paidAt = dto.paymentStatus === 'PAID' ? new Date() : null;

    const splitCount = dto.splitCount && dto.splitCount > 1 ? dto.splitCount : 1;
    const perPlayerAmount = Math.round((grandTotal / splitCount) * 100) / 100;

    return this.prisma.$transaction(async (tx) => {
      // 1. Update session to Completed
      const updatedSession = await tx.playStationSession.update({
        where: { id: sessionId },
        data: {
          endTime,
          duration,
          cost: new Prisma.Decimal(timeCost),
          paymentStatus: dto.paymentStatus,
          status: 'Completed',
          closedById,
          paidAt,
          notes: dto.notes ? `${session.notes || ''} | ${dto.notes}` : session.notes,
        },
        include: { device: true },
      });

      // 2. Mark all attached orders as PAID
      if (session.orders.length > 0) {
        await tx.order.updateMany({
          where: { playStationSessionId: sessionId },
          data: {
            paymentStatus: dto.paymentStatus,
            paymentMethod: dto.paymentMethod,
            paid: dto.paymentStatus === 'PAID',
            paidAt,
            closedAt: endTime,
          },
        });
      }

      // 3. Register cash wallet increment & financial transaction if cash
      if (dto.paymentStatus === 'PAID' && grandTotal > 0) {
        if (dto.paymentMethod === 'CASH') {
          await tx.staff.update({
            where: { id: closedById },
            data: { currentCashWallet: { increment: grandTotal } },
          });
        }

        await tx.financialTransaction.create({
          data: {
            cafeId,
            amount: new Prisma.Decimal(grandTotal),
            type: 'income',
            source: 'ps_lounge',
            referenceId: updatedSession.id,
            employeeId: closedById,
          },
        });
      }

      this.eventsService.broadcast('playstation:session_settled', {
        sessionId,
        deviceName: session.device.name,
        customerName: session.customerName,
        timeCost,
        ordersTotal,
        grandTotal,
        splitCount,
        perPlayerAmount,
        paymentMethod: dto.paymentMethod,
        paymentStatus: dto.paymentStatus,
      }, cafeId);

      return {
        session: updatedSession,
        receipt: {
          sessionId,
          deviceName: session.device.name,
          customerName: session.customerName,
          durationMinutes: duration,
          timeCost,
          ordersTotal,
          discountAmount: discount,
          grandTotal,
          splitCount,
          perPlayerAmount,
          paymentMethod: dto.paymentMethod,
          paymentStatus: dto.paymentStatus,
          closedAt: endTime,
        },
      };
    });
  }

  // ── BACKWARD COMPATIBLE SESSION METHODS ──

  async closeSession(id: string, paymentStatus: string, closedById: string, cafeId: string) {
    return this.settleAndCloseSession(
      id,
      { paymentMethod: 'CASH', paymentStatus },
      closedById,
      cafeId,
    );
  }

  async collectPayment(id: string, employeeId: string, cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const session = await this.prisma.playStationSession.findFirst({
      where: { id, cafeId },
      include: { orders: true },
    });
    if (!session) throw new NotFoundException('الجلسة غير موجودة');
    if (session.paymentStatus === 'PAID') throw new BadRequestException('هذه الجلسة مدفوعة بالفعل');

    const cost = Number(session.cost || 0);
    const ordersTotal = session.orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const total = cost + ordersTotal;

    return this.prisma.$transaction(async (tx) => {
      const updatedSession = await tx.playStationSession.update({
        where: { id },
        data: {
          paymentStatus: 'PAID',
          paidAt: new Date(),
          closedById: employeeId,
        },
        include: { device: true },
      });

      await tx.order.updateMany({
        where: { playStationSessionId: id },
        data: {
          paymentStatus: 'PAID',
          paid: true,
          paidAt: new Date(),
        },
      });

      if (total > 0) {
        await tx.staff.update({
          where: { id: employeeId },
          data: { currentCashWallet: { increment: total } },
        });

        await tx.financialTransaction.create({
          data: {
            cafeId,
            amount: new Prisma.Decimal(total),
            type: 'income',
            source: 'ps_lounge',
            referenceId: updatedSession.id,
            employeeId,
          },
        });
      }

      return updatedSession;
    });
  }

  async getSessionHistory(
    cafeId: string,
    dateFrom?: string,
    dateTo?: string,
    deviceId?: string,
    status?: string,
  ) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const where: Prisma.PlayStationSessionWhereInput = {
      cafeId,
    };

    if (deviceId) where.deviceId = deviceId;
    if (status) {
      where.status = status;
    } else {
      where.status = 'Completed';
    }

    if (dateFrom || dateTo) {
      where.startTime = {};
      if (dateFrom) where.startTime.gte = new Date(dateFrom);
      if (dateTo) where.startTime.lte = new Date(dateTo);
    }

    return this.prisma.playStationSession.findMany({
      where,
      include: {
        device: true,
        openedBy: { select: { id: true, name: true } },
        orders: {
          select: {
            id: true,
            code: true,
            total: true,
          },
        },
      },
      orderBy: { startTime: 'desc' },
    });
  }

  async getOwnerReport(cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const allCompleted = await this.prisma.playStationSession.findMany({
      where: { cafeId, status: 'Completed', endTime: { not: null } },
      include: {
        device: true,
        openedBy: { select: { id: true, name: true } },
        orders: { select: { total: true } },
      },
    });

    const todayCompleted = allCompleted.filter((s) => s.endTime! >= todayStart);
    const monthCompleted = allCompleted.filter((s) => s.endTime! >= monthStart);

    const activeSessions = await this.prisma.playStationSession.findMany({
      where: { cafeId, status: { in: ['Pending Free Time', 'Running'] } },
      include: { device: true, openedBy: { select: { id: true, name: true } } },
    });

    const calcRev = (session: any) => {
      const ordersTotal = session.orders.reduce((sum: number, o: any) => sum + Number(o.total || 0), 0);
      return session.paymentStatus === 'PAID' ? Number(session.cost || 0) + ordersTotal : 0;
    };

    const totalRevenue = allCompleted.reduce((sum, s) => sum + calcRev(s), 0);
    const todayRevenue = todayCompleted.reduce((sum, s) => sum + calcRev(s), 0);
    const monthRevenue = monthCompleted.reduce((sum, s) => sum + calcRev(s), 0);

    const deviceRevenueMap = new Map<string, { deviceId: string; deviceName: string; revenue: number; sessions: number }>();
    for (const s of allCompleted) {
      const did = s.deviceId;
      const existing = deviceRevenueMap.get(did);
      const revenue = calcRev(s);
      if (existing) {
        existing.revenue += revenue;
        existing.sessions++;
      } else {
        deviceRevenueMap.set(did, {
          deviceId: did,
          deviceName: s.device?.name || 'Unknown',
          revenue,
          sessions: 1,
        });
      }
    }

    const employeeRevenueMap = new Map<string, { employeeId: string; employeeName: string; revenue: number; sessions: number }>();
    for (const s of allCompleted) {
      const eid = s.employeeId;
      const existing = employeeRevenueMap.get(eid);
      const revenue = calcRev(s);
      if (existing) {
        existing.revenue += revenue;
        existing.sessions++;
      } else {
        employeeRevenueMap.set(eid, {
          employeeId: eid,
          employeeName: s.openedBy?.name || 'Unknown',
          revenue,
          sessions: 1,
        });
      }
    }

    const unpaidSessions = allCompleted.filter((s) => s.paymentStatus === 'UNPAID');
    const unpaidRevenue = unpaidSessions.reduce((sum, s) => {
      const ordersTotal = s.orders.reduce((sm: number, o: any) => sm + Number(o.total || 0), 0);
      return sum + Number(s.cost || 0) + ordersTotal;
    }, 0);

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      todayRevenue: Math.round(todayRevenue * 100) / 100,
      monthRevenue: Math.round(monthRevenue * 100) / 100,
      revenuePerDevice: Array.from(deviceRevenueMap.values()).sort((a, b) => b.revenue - a.revenue),
      revenuePerEmployee: Array.from(employeeRevenueMap.values()).sort((a, b) => b.revenue - a.revenue),
      activeSessions: activeSessions.length,
      completedSessions: allCompleted.length,
      unpaidSessions: {
        count: unpaidSessions.length,
        totalUnpaidRevenue: Math.round(unpaidRevenue * 100) / 100,
      },
    };
  }

  async getEmployeeKpi(cafeId: string) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const sessions = await this.prisma.playStationSession.findMany({
      where: { cafeId, endTime: { not: null } },
      include: {
        openedBy: { select: { id: true, name: true } },
        orders: { select: { total: true } },
      },
    });

    const map = new Map<string, { employeeId: string; employeeName: string; totalSessions: number; revenue: number }>();

    for (const s of sessions) {
      const empId = s.employeeId;
      const empName = s.openedBy?.name || 'Unknown';
      const cost = Number(s.cost || 0);
      const ordersTotal = s.orders.reduce((sum: number, o: any) => sum + Number(o.total || 0), 0);

      const existing = map.get(empId);
      if (existing) {
        existing.totalSessions++;
        existing.revenue += cost + ordersTotal;
      } else {
        map.set(empId, {
          employeeId: empId,
          employeeName: empName,
          totalSessions: 1,
          revenue: cost + ordersTotal,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }

  async getKpiAggregations(
    cafeId: string,
    employeeId?: string,
    dateFrom?: string,
    dateTo?: string,
    deviceId?: string,
  ) {
    if (!cafeId) throw new BadRequestException('معرف الكافيه مطلوب');

    const where: Prisma.PlayStationSessionWhereInput = {
      cafeId,
      status: 'Completed',
    };

    if (employeeId) where.employeeId = employeeId;
    if (deviceId) where.deviceId = deviceId;

    if (dateFrom || dateTo) {
      where.startTime = {};
      if (dateFrom) where.startTime.gte = new Date(dateFrom);
      if (dateTo) where.startTime.lte = new Date(dateTo);
    }

    const sessions = await this.prisma.playStationSession.findMany({
      where,
      include: {
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
        orders: { select: { total: true } },
      },
    });

    const employeeMap = new Map<string, { employeeId: string; employeeName: string; totalSessions: number; revenue: number }>();

    let totalDuration = 0;
    let completedCount = 0;
    let paidCount = 0;
    let unpaidCount = 0;
    let paidRevenue = 0;
    let unpaidRevenue = 0;

    for (const s of sessions) {
      const empId = s.employeeId;
      const empName = s.openedBy?.name || 'Unknown';
      const cost = Number(s.cost || 0);
      const ordersTotal = s.orders.reduce((sum: number, o: any) => sum + Number(o.total || 0), 0);
      const totalSessionRev = cost + ordersTotal;
      const duration = s.duration || 0;

      const existing = employeeMap.get(empId);
      if (existing) {
        existing.totalSessions++;
        existing.revenue += totalSessionRev;
      } else {
        employeeMap.set(empId, {
          employeeId: empId,
          employeeName: empName,
          totalSessions: 1,
          revenue: totalSessionRev,
        });
      }

      totalDuration += duration;
      completedCount++;

      if (s.paymentStatus === 'PAID') {
        paidCount++;
        paidRevenue += totalSessionRev;
      } else {
        unpaidCount++;
        unpaidRevenue += totalSessionRev;
      }
    }

    const sessionsPerEmployee = Array.from(employeeMap.values()).map((e) => ({
      employeeId: e.employeeId,
      employeeName: e.employeeName,
      count: e.totalSessions,
    }));

    const revenuePerEmployee = Array.from(employeeMap.values()).map((e) => ({
      employeeId: e.employeeId,
      employeeName: e.employeeName,
      revenue: e.revenue,
    }));

    const avgDuration = completedCount > 0 ? Math.round(totalDuration / completedCount) : 0;

    return {
      sessionsPerEmployee,
      revenuePerEmployee,
      averageDuration: avgDuration,
      paymentBreakdown: {
        paidCount,
        unpaidCount,
        paidRevenue,
        unpaidRevenue,
      },
    };
  }
}
