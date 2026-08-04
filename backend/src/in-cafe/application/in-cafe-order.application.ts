import { CreateInCafeOrderInput, InCafeOrder, InCafeOrderItemInput, PaymentUpdateInput } from '../domain/in-cafe-order.aggregate';
import { InCafeOrderRepository } from '../domain/in-cafe-order.repository';
import { InCafeOrderTenantMismatchError } from '../domain/in-cafe-order.errors';
import { InCafeOrderItemSnapshot } from '../domain/in-cafe-order.snapshot';

export interface InCafeOrderTransitionResult {
  order: InCafeOrder;
  from: string;
  to: string;
  changed: boolean;
}

export interface InCafeOrderTenantContext {
  cafeId?: string;
  branchId?: string;
}

export interface AssignCustomerInput {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
}

export class InCafeOrderApplicationService {
  constructor(private readonly repository: InCafeOrderRepository) {}

  async createOrder(input: CreateInCafeOrderInput, tx?: unknown): Promise<InCafeOrder> {
    const order = InCafeOrder.create(input);
    await this.repository.save(order, tx);
    return order;
  }

  async transitionStatus(
    orderId: string,
    target: string,
    userRole?: string,
    tenant?: InCafeOrderTenantContext,
    tx?: unknown,
  ): Promise<InCafeOrderTransitionResult> {
    const order = await this.repository.findById(orderId);
    this.assertTenant(order, tenant);

    const from = order.status;
    if (from === target) {
      return { order, from, to: target, changed: false };
    }

    order.transitionTo(target, userRole);
    await this.repository.save(order, tx);
    return { order, from, to: target, changed: true };
  }

  async hold(orderId: string, tenant?: InCafeOrderTenantContext, tx?: unknown): Promise<InCafeOrder> {
    const order = await this.repository.findById(orderId);
    this.assertTenant(order, tenant);
    order.hold();
    await this.repository.save(order, tx);
    return order;
  }

  async resume(orderId: string, tenant?: InCafeOrderTenantContext, tx?: unknown): Promise<InCafeOrder> {
    const order = await this.repository.findById(orderId);
    this.assertTenant(order, tenant);
    order.resume();
    await this.repository.save(order, tx);
    return order;
  }

  async cancel(orderId: string, reason: string, tenant?: InCafeOrderTenantContext, tx?: unknown): Promise<InCafeOrder> {
    const order = await this.repository.findById(orderId);
    this.assertTenant(order, tenant);
    order.cancel(reason);
    await this.repository.save(order, tx);
    return order;
  }

  async void(orderId: string, reason: string, tenant?: InCafeOrderTenantContext, tx?: unknown): Promise<InCafeOrder> {
    const order = await this.repository.findById(orderId);
    this.assertTenant(order, tenant);
    order.void(reason);
    await this.repository.save(order, tx);
    return order;
  }

  async updatePayment(
    orderId: string,
    payment: PaymentUpdateInput,
    tenant?: InCafeOrderTenantContext,
    tx?: unknown,
  ): Promise<InCafeOrder> {
    const order = await this.repository.findById(orderId);
    this.assertTenant(order, tenant);
    order.updatePayment(payment);
    await this.repository.save(order, tx);
    return order;
  }

  async editOrder(
    orderId: string,
    items: InCafeOrderItemInput[],
    newTotal: string,
    currentPaidAmount: string,
    tenant?: InCafeOrderTenantContext,
    tx?: unknown,
  ): Promise<InCafeOrder> {
    const order = await this.repository.findById(orderId);
    this.assertTenant(order, tenant);
    const snapshotItems: InCafeOrderItemSnapshot[] = items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      notes: item.notes,
      selectedOptions: item.selectedOptions,
    }));
    order.editItems(snapshotItems, newTotal, currentPaidAmount);
    await this.repository.save(order, tx);
    return order;
  }

  async updateNote(
    orderId: string,
    notes: string | null,
    tenant?: InCafeOrderTenantContext,
    tx?: unknown,
  ): Promise<InCafeOrder> {
    const order = await this.repository.findById(orderId);
    this.assertTenant(order, tenant);
    order.updateNote(notes);
    await this.repository.save(order, tx);
    return order;
  }

  async assignCustomer(
    orderId: string,
    input: AssignCustomerInput,
    tenant?: InCafeOrderTenantContext,
    tx?: unknown,
  ): Promise<InCafeOrder> {
    const order = await this.repository.findById(orderId);
    this.assertTenant(order, tenant);
    order.assignCustomer(input);
    await this.repository.save(order, tx);
    return order;
  }

  async markStockDeducted(
    orderId: string,
    deducted: boolean,
    tenant?: InCafeOrderTenantContext,
    tx?: unknown,
  ): Promise<InCafeOrder> {
    const order = await this.repository.findById(orderId);
    this.assertTenant(order, tenant);
    order.markStockDeducted(deducted);
    await this.repository.save(order, tx);
    return order;
  }

  private assertTenant(order: InCafeOrder, tenant?: InCafeOrderTenantContext): void {
    if (tenant?.cafeId && order.cafeId !== tenant.cafeId) {
      throw new InCafeOrderTenantMismatchError(order.id, 'cafe');
    }
    if (tenant?.branchId && order.branchId !== tenant.branchId) {
      throw new InCafeOrderTenantMismatchError(order.id, 'branch');
    }
  }
}
