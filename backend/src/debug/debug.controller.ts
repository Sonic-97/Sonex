import { Controller, Post, Body, Get, Logger, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { Public } from '../auth/decorators/public.decorator';
import { IsString, IsArray, ValidateNested, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

class DebugOrderItemDto {
  @IsString()
  name: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsNumber()
  unitPrice?: number;
}

class DebugOrderDto {
  @IsString()
  customerName: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  cafeId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DebugOrderItemDto)
  items: DebugOrderItemDto[];
}

@Controller('debug')
export class DebugController {
  private readonly logger = new Logger(DebugController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {}

  @Post('test-order')
  @Public()
  async createTestOrder(@Body() dto: DebugOrderDto) {
    const traceId = `DEBUG-${Date.now()}`;
    this.logger.log(`[${traceId}] Creating test order: ${dto.customerName} with ${dto.items.length} items`);

    const cafe = dto.cafeId
      ? await this.prisma.cafe.findUnique({ where: { id: dto.cafeId }, select: { id: true } })
      : await this.prisma.cafe.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } });
    if (!cafe) throw new Error('No cafe found');

    const branch = await this.prisma.branch.findFirst({
      where: { cafeId: cafe.id, slug: 'main-branch' },
      select: { id: true },
    });
    if (!branch) {
      const anyBranch = await this.prisma.branch.findFirst({
        where: { cafeId: cafe.id },
        select: { id: true },
      });
      if (!anyBranch) throw new Error(`No branch found for cafe ${cafe.id}`);
      return this.createOrderWithBranch(dto, traceId, cafe.id, anyBranch.id);
    }
    return this.createOrderWithBranch(dto, traceId, cafe.id, branch.id);
  }

  private async createOrderWithBranch(dto: DebugOrderDto, traceId: string, cafeId: string, branchId: string) {
    const phone = dto.customerPhone || `DEBUG-${Date.now()}`;

    const customer = await this.prisma.customer.upsert({
      where: {
        cafeId_branchId_phone: {
          cafeId,
          branchId,
          phone,
        },
      },
      update: { totalOrders: { increment: 1 }, name: dto.customerName },
      create: {
        cafeId,
        branchId,
        phone,
        name: dto.customerName,
        totalOrders: 1,
      },
    });

    const products = await this.prisma.product.findMany({
      where: { cafeId, active: true },
      select: { id: true, name: true, price: true },
    });

    const orderItems = dto.items.map(item => {
      const product = products.find(
        p => p.name.toLowerCase() === item.name.toLowerCase(),
      );
      return {
        productId: product?.id || products[0]?.id || '',
        quantity: item.quantity,
        unitPrice: item.unitPrice
          ? Number(item.unitPrice)
          : product
            ? parseFloat(String(product.price))
            : 0,
      };
    });

    const total = orderItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();
    const code = `DBG-${dateStr}-${suffix}`;

    const order = await this.prisma.order.create({
      data: {
        code,
        cafeId,
        branchId,
        customerId: customer.id,
        status: 'NEW',
        type: 'DINE_IN',
        total,
        source: 'DEBUG',
        version: 1,
        items: {
          create: orderItems.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        },
      },
      include: {
        customer: true,
        items: { include: { product: true } },
      },
    });

    await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        totalSpent: { increment: total },
        lastOrderDate: new Date(),
      },
    });

    this.eventsService.emit('order.created', {
      orderId: order.id,
      code: order.code,
      total: Number(order.total),
      customerId: order.customerId,
      customerPhone: customer.phone,
      type: order.type,
      status: order.status,
      source: order.source,
      branchId: order.branchId,
    }, cafeId);

    this.logger.log(`[${traceId}] Test order created: ${order.code} (${order.id})`);

    return {
      orderId: order.id,
      code: order.code,
      status: order.status,
      total: Number(order.total),
      customerName: customer.name,
      items: order.items.map(i => ({
        name: i.product?.name || i.productId,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
      })),
      websocket: {
        event: 'order.created',
        rooms: [`${cafeId}:barista`, `${cafeId}:owner`],
        payload: {
          orderId: order.id,
          code: order.code,
          total: Number(order.total),
          status: order.status,
          source: order.source,
        },
      },
    };
  }

  @Get('test-order')
  @Public()
  async getTestOrders() {
    const defaultCafe = await this.prisma.cafe.findFirst({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!defaultCafe) return [];

    return this.prisma.order.findMany({
      where: { cafeId: defaultCafe.id, code: { startsWith: 'DBG-' } },
      include: { customer: true, items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  @Get('cafe/:id')
  @Public()
  async getCafeDetails(@Param('id') id: string) {
    const cafe = await this.prisma.cafe.findUnique({
      where: { id },
      select: {
        id: true, name: true, cafeCode: true, phone: true, ownerCode: true,
        telegramEnabled: true, telegramBotToken: true, telegramBotUsername: true,
        telegramCafeToken: true, active: true,
        branches: { select: { id: true, name: true, slug: true, active: true } },
        products: { select: { id: true, name: true, category: true, price: true, cost: true, active: true } },
        staffs: { select: { id: true, name: true, role: true, loginCode: true, phone: true } },
      },
    });
    if (!cafe) return { error: 'Cafe not found' };
    return cafe;
  }

  @Get('test-order/health')
  @Public()
  async health() {
    const defaultCafe = await this.prisma.cafe.findFirst({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      status: 'ok',
      cafeId: defaultCafe?.id || null,
      endpoint: 'POST /debug/test-order',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('setup-telegram')
  @Public()
  async setupTelegram(@Body() body: { cafeId?: string; cafeToken: string; cafeName?: string }) {
    let cafe;
    if (body.cafeId) {
      cafe = await this.prisma.cafe.findUnique({
        where: { id: body.cafeId },
        select: { id: true, name: true },
      });
    } else {
      cafe = await this.prisma.cafe.findFirst({
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' },
      });
    }
    if (!cafe) throw new Error('No cafe found');

    const updateData: any = { telegramCafeToken: body.cafeToken };
    if (body.cafeName) updateData.name = body.cafeName;

    await this.prisma.cafe.update({
      where: { id: cafe.id },
      data: updateData,
    });

    return { success: true, cafeId: cafe.id, cafeName: body.cafeName || cafe.name, cafeToken: body.cafeToken };
  }

  @Get('cafes')
  @Public()
  async listCafes() {
    return this.prisma.cafe.findMany({
      select: { id: true, name: true, cafeCode: true, ownerCode: true, ownerPassword: true, phone: true },
    });
  }

  @Get('staff-by-email/:email')
  @Public()
  async findStaffByEmail(@Param('email') email: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, phone: true, role: true, loginCode: true, cafeId: true, cafe: { select: { id: true, name: true, cafeCode: true, ownerCode: true, ownerPassword: true } } },
    });
    if (staff) return staff;

    const allCafes = await this.prisma.cafe.findMany({
      select: { id: true, name: true, cafeCode: true, ownerCode: true, ownerPassword: true, phone: true },
    });

    return { error: 'Staff not found with this email', cafes: allCafes };
  }

  @Post('setup-cafe')
  @Public()
  async setupCafe(@Body() body: { name: string; cafeCode: string; phone?: string; ownerCode?: string; ownerPassword?: string }) {
    const existing = await this.prisma.cafe.findUnique({ where: { cafeCode: body.cafeCode } });
    if (existing) return { success: true, cafe: existing, message: 'Cafe already exists' };

    const cafe = await this.prisma.cafe.create({
      data: {
        name: body.name,
        cafeCode: body.cafeCode,
        phone: body.phone || `+20${Date.now().toString().slice(-10)}`,
        ownerCode: body.ownerCode || 'XD123456',
        ownerPassword: body.ownerPassword || 'XD12345',
        telegramCafeToken: body.cafeCode,
      },
    });

    const branch = await this.prisma.branch.create({
      data: {
        cafeId: cafe.id,
        name: 'Main Branch',
        slug: 'main-branch',
        location: 'Main Location',
      },
    });

    const categories = ['Hot Drinks', 'Cold Drinks', 'Desserts'];
    const products = [
      { name: 'Latte', category: 'Hot Drinks', price: 45, cost: 15 },
      { name: 'Cappuccino', category: 'Hot Drinks', price: 50, cost: 18 },
      { name: 'Americano', category: 'Hot Drinks', price: 35, cost: 10 },
      { name: 'Espresso', category: 'Hot Drinks', price: 25, cost: 8 },
      { name: 'Mocha', category: 'Hot Drinks', price: 55, cost: 20 },
      { name: 'Iced Latte', category: 'Cold Drinks', price: 50, cost: 18 },
      { name: 'Iced Americano', category: 'Cold Drinks', price: 40, cost: 12 },
      { name: 'Frappuccino', category: 'Cold Drinks', price: 60, cost: 22 },
      { name: 'Cold Brew', category: 'Cold Drinks', price: 45, cost: 15 },
      { name: 'Cheesecake', category: 'Desserts', price: 70, cost: 25 },
    ];

    for (const cat of categories) {
      await this.prisma.productCategory.create({
        data: { cafeId: cafe.id, branchId: branch.id, name: cat, active: true },
      });
    }

    for (const p of products) {
      await this.prisma.product.create({
        data: {
          cafeId: cafe.id,
          branchId: branch.id,
          name: p.name,
          category: p.category,
          price: p.price,
          cost: p.cost,
          active: true,
        },
      });
    }

    return {
      success: true,
      cafe: { id: cafe.id, name: cafe.name, cafeCode: cafe.cafeCode, ownerCode: cafe.ownerCode, telegramCafeToken: cafe.telegramCafeToken },
      branch: { id: branch.id, name: branch.name, slug: branch.slug },
      productsCount: products.length,
    };
  }
}
