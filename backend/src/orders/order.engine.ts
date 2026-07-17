import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type CreateOrderItem = {
  productId: string;
  quantity: number;
};

type CreateOrderInput = {
  customerId: string;
  staffId?: string;
  type: string;
  items: CreateOrderItem[];
  branchId?: string;
};

export class OrderEngine {
  
  // 🧾 Create Order (CORE FUNCTION)
  static async createOrder(data: CreateOrderInput) {
    return await prisma.$transaction(async (tx) => {
      let targetBranchId = data.branchId;
      if (!targetBranchId && data.staffId) {
        const staff = await tx.staff.findUnique({
          where: { id: data.staffId },
          select: { branchId: true },
        });
        targetBranchId = staff?.branchId;
      }
      if (!targetBranchId) {
        const defaultBranch = await tx.branch.findFirst({
          where: { slug: 'main-branch' },
          select: { id: true },
        });
        targetBranchId = defaultBranch?.id;
      }
      if (!targetBranchId) throw new Error('No active branch found');

      // 1) إنشاء الطلب الأساسي
      const Cafe = await tx.branch.findUnique({ where: { id: targetBranchId }, select: { cafeId: true } });
      const order = await tx.order.create({
        data: {
          cafeId: Cafe!.cafeId,
          branchId: targetBranchId,
          code: `ORD-${Date.now()}`,
          customerId: data.customerId,
          staffId: data.staffId,
          type: data.type,
          status: "NEW",
          total: 0,
        } as any,
      });

      let total = 0;

      // 2) إنشاء items + حساب total
      for (const item of data.items) {

        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });

        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }

        const itemTotal =
          Number(product.price) * item.quantity;

        total += itemTotal;

        await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: product.price,
          },
        });
      }

      // 3) تحديث total النهائي
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: { total },
      });

      return updatedOrder;
    });
  }

  // 🚦 Update Order Status (FLOW CONTROL)
  static async updateStatus(orderId: string, status: string) {

    const allowedFlow = [
      "NEW",
      "IN_PROGRESS",
      "READY",
      "DELIVERED",
      "CANCELED"
    ];

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new Error("Order not found");
    }

    const currentIndex = allowedFlow.indexOf(order.status);
    const newIndex = allowedFlow.indexOf(status);

    if (newIndex === -1) {
      throw new Error("Invalid status");
    }

    // منع القفز بين المراحل
    if (newIndex !== currentIndex + 1) {
      throw new Error("Invalid status transition");
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        status,
        deliveredAt: status === "DELIVERED" ? new Date() : undefined,
      },
    });

    return updated;
  }

  // 📦 جلب الطلبات للباريستا
  static async getActiveOrders() {
    return prisma.order.findMany({
      where: {
        status: {
          in: ["NEW", "IN_PROGRESS", "READY"]
        }
      },
      include: {
        items: true,
        customer: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  }
}



