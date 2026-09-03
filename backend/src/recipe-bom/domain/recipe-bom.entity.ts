export interface RecipeBOMProps {
  id: string;
  productId: string;
  inventoryId: string;
  quantity: number;
  unit: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class RecipeBOM {
  constructor(private readonly props: RecipeBOMProps) {}

  public get id(): string {
    return this.props.id;
  }

  public get productId(): string {
    return this.props.productId;
  }

  public get inventoryId(): string {
    return this.props.inventoryId;
  }

  public get quantity(): number {
    return this.props.quantity;
  }

  public get unit(): string {
    return this.props.unit;
  }

  public calculateDeduction(orderedQuantity: number): number {
    return this.props.quantity * orderedQuantity;
  }

  public toJSON(): RecipeBOMProps {
    return { ...this.props };
  }
}
