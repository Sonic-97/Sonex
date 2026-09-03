export interface OutboxRecordProps {
  id: string;
  tenantId: string;
  branchId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, any>;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  retryCount: number;
  errorMessage?: string | null;
  createdAt?: Date;
  processedAt?: Date | null;
}

export class OutboxRecord {
  constructor(private readonly props: OutboxRecordProps) {}

  public get id(): string {
    return this.props.id;
  }

  public get tenantId(): string {
    return this.props.tenantId;
  }

  public get branchId(): string {
    return this.props.branchId;
  }

  public get eventType(): string {
    return this.props.eventType;
  }

  public get status(): string {
    return this.props.status;
  }

  public toJSON(): OutboxRecordProps {
    return { ...this.props };
  }
}
