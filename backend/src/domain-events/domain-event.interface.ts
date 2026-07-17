export interface DomainEvent<TPayload = Record<string, unknown>> {
  eventId: string;
  eventType: string;
  eventVersion: number;
  timestamp: string;
  source: string;
  correlationId: string;
  causationId: string;
  traceId: string;
  cafeId: string;
  branchId: string;
  orderId: string;
  userId: string;
  payload: TPayload;
}

export interface DomainEventHandler<T = any> {
  handle(event: DomainEvent<T>): Promise<void>;
  supports(eventType: string): boolean;
}
