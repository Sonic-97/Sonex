import { OrderStatus } from '../dto/update-order-status.dto';
import { CreateOrderInput, Order } from '../domain/order.aggregate';
import { OrderRepository } from '../domain/order.repository';
import { OrderTenantMismatchError } from '../domain/order.errors';

export interface OrderTransitionResult {
  order: Order;
  from: OrderStatus;
  to: OrderStatus;
  changed: boolean;
}

export interface OrderTenantContext {
  cafeId?: string;
  branchId?: string;
}

export class OrderApplicationService {
  constructor(private readonly repository: OrderRepository) {}

  async createOrder(input: CreateOrderInput, tx?: unknown): Promise<Order> {
    const order = Order.create(input);
    await this.repository.save(order, tx);
    return order;
  }

  async transitionStatus(
    orderId: string,
    target: OrderStatus,
    userRole?: string,
    tenant?: OrderTenantContext,
  ): Promise<OrderTransitionResult> {
    const order = await this.repository.findById(orderId);
    this.assertTenant(order, tenant);

    const from = order.status;
    if (from === target) {
      return { order, from, to: target, changed: false };
    }

    order.transitionTo(target, userRole);
    await this.repository.save(order);
    return { order, from, to: target, changed: true };
  }

  async cancel(orderId: string, tenant?: OrderTenantContext, tx?: unknown): Promise<Order> {
    const order = await this.repository.findById(orderId);
    this.assertTenant(order, tenant);

    if (order.status === OrderStatus.CANCELLED) {
      return order;
    }

    order.cancel();
    await this.repository.save(order, tx);
    return order;
  }

  private assertTenant(order: Order, tenant?: OrderTenantContext): void {
    if (tenant?.cafeId && order.cafeId !== tenant.cafeId) {
      throw new OrderTenantMismatchError(order.id, 'cafe');
    }
    if (tenant?.branchId && order.branchId !== tenant.branchId) {
      throw new OrderTenantMismatchError(order.id, 'branch');
    }
  }
}
