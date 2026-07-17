import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TenantContextService } from '../common/tenant-context.service';

export interface AppEvent {
  eventType: string;
  timestamp: string;
  payload: Record<string, unknown>;
  cafeId?: string;
}

export type EventTarget = 'Cafe' | 'barista' | 'driver';

@Injectable()
export class EventsService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  private resolveCafeId(cafeId?: string): string | undefined {
    return cafeId || TenantContextService.cafeId;
  }

  normalize(eventType: string, payload: Record<string, unknown>, cafeId?: string): AppEvent {
    return {
      eventType,
      timestamp: new Date().toISOString(),
      payload,
      cafeId: cafeId || TenantContextService.cafeId,
    };
  }

  emit(eventType: string, payload: Record<string, unknown>, cafeId?: string): void {
    const event = this.normalize(eventType, payload, cafeId);
    this.eventEmitter.emit(eventType, event);
  }

  emitToOwner(eventType: string, payload: Record<string, unknown>, cafeId?: string): void {
    const event = this.normalize(eventType, payload, cafeId);
    this.eventEmitter.emit(`Cafe.${eventType}`, event);
    this.eventEmitter.emit(eventType, event);
  }

  emitToBarista(eventType: string, payload: Record<string, unknown>, cafeId?: string): void {
    const event = this.normalize(eventType, payload, cafeId);
    this.eventEmitter.emit(`barista.${eventType}`, event);
    this.eventEmitter.emit(eventType, event);
  }

  emitToDriver(eventType: string, payload: Record<string, unknown>, cafeId?: string): void {
    const event = this.normalize(eventType, payload, cafeId);
    this.eventEmitter.emit(`driver.${eventType}`, event);
    this.eventEmitter.emit(eventType, event);
  }

  broadcast(eventType: string, payload: Record<string, unknown>, cafeId?: string): void {
    const event = this.normalize(eventType, payload, cafeId);
    this.eventEmitter.emit(`Cafe.${eventType}`, event);
    this.eventEmitter.emit(`barista.${eventType}`, event);
    this.eventEmitter.emit(`driver.${eventType}`, event);
    this.eventEmitter.emit(eventType, event);
  }

  financeUpdated(payload: {
    totalRevenue?: number;
    orderCount?: number;
    pendingOrders?: number;
  }): void {
    this.broadcast('finance.updated', payload);
  }

  // ── FINANCE-SPECIFIC EVENTS ──

  financeRevenueUpdated(payload: {
    orderId: string;
    orderCode: string;
    totalRevenue: number;
    profit: number;
    timestamp: string;
  }): void {
    this.emitToOwner('finance.revenue.updated', payload);
  }

  financeCustomerUpdated(payload: {
    customerId: string;
    amount: number;
  }): void {
    this.emitToOwner('finance.customer.updated', payload);
  }

  financeStaffUpdated(payload: {
    staffId: string;
    orderId: string;
  }): void {
    this.emitToOwner('finance.staff.updated', payload);
  }

  financeDriverUpdated(payload: {
    driverId: string;
    earnings: number;
  }): void {
    this.emitToOwner('finance.driver.updated', payload);
  }

  financeDailySnapshot(payload: {
    totalRevenue: number;
    profit: number;
    ordersCount: number;
  }): void {
    this.emitToOwner('finance.daily.snapshot', payload);
  }

  inCafeOrderCreated(payload: { order: any }): void {
    this.emitToOwner('inCafe.order.created', payload);
    this.emitToBarista('inCafe.order.created', payload);
  }

  inCafePaymentUpdated(payload: { order: any }): void {
    this.emitToOwner('inCafe.payment.updated', payload);
    this.emitToBarista('inCafe.payment.updated', payload);
  }

  inCafeOrderUpdated(payload: { order: any }): void {
    this.emitToOwner('inCafe.order.updated', payload);
    this.emitToBarista('inCafe.order.updated', payload);
  }

  staffPurchaseCreated(payload: { purchase: any }): void {
    this.emitToOwner('staff.purchase.created', payload);
  }
}




