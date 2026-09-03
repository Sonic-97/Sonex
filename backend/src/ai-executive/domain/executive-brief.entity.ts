export interface AIRecommendation {
  id: string;
  type: 'AUTO_PO' | 'CREDIT_LIMIT' | 'DELIVERY_FEE' | 'STAFF_TRAINING';
  title: string;
  explanation: string;
  evidence: string;
  actionPayload: any;
  estimatedImpact: string;
  isApproved: boolean;
}

export interface ExecutiveBriefProps {
  id: string;
  cafeId: string;
  branchId: string;
  briefDate: string;
  healthScore: number; // 0 - 100
  totalRevenue: number;
  netProfit: number;
  grossMarginPercentage: number;
  cashOnHand: number;
  runningAccountUnpaidBalance: number;
  shiftCashDiscrepancy: number;
  lowStockItemsCount: number;
  anomaliesCount: number;
  summaryNarrative: string;
  recommendations: AIRecommendation[];
  createdAt?: Date;
}

export class ExecutiveBrief {
  constructor(private readonly props: ExecutiveBriefProps) {}

  public get id(): string {
    return this.props.id;
  }

  public get cafeId(): string {
    return this.props.cafeId;
  }

  public get branchId(): string {
    return this.props.branchId;
  }

  public get healthScore(): number {
    return this.props.healthScore;
  }

  public get totalRevenue(): number {
    return this.props.totalRevenue;
  }

  public get netProfit(): number {
    return this.props.netProfit;
  }

  public get recommendations(): AIRecommendation[] {
    return this.props.recommendations;
  }

  public toJSON(): ExecutiveBriefProps {
    return { ...this.props };
  }
}
