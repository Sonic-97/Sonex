import { DeliveryZoneStreet } from '../entities/delivery-zone-street.entity';

export interface DeliveryZoneProps {
  id: string;
  branchId: string;
  cafeId?: string | null;
  name: string;
  mainStreet: string;
  deliveryFee: number;
  minimumOrder: number;
  etaMinutes: number;
  isActive: boolean;
  streets?: DeliveryZoneStreet[];
  createdAt?: Date;
  updatedAt?: Date;
}

export class DeliveryZone {
  public readonly id: string;
  public readonly branchId: string;
  public readonly cafeId?: string | null;
  public name: string;
  public mainStreet: string;
  public deliveryFee: number;
  public minimumOrder: number;
  public etaMinutes: number;
  public isActive: boolean;
  private _streets: DeliveryZoneStreet[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  constructor(props: DeliveryZoneProps) {
    this.id = props.id;
    this.branchId = props.branchId;
    this.cafeId = props.cafeId ?? null;
    this.name = props.name;
    this.mainStreet = props.mainStreet;
    this.deliveryFee = props.deliveryFee >= 0 ? props.deliveryFee : 0;
    this.minimumOrder = props.minimumOrder >= 0 ? props.minimumOrder : 0;
    this.etaMinutes = props.etaMinutes > 0 ? props.etaMinutes : 30;
    this.isActive = props.isActive ?? true;
    this._streets = props.streets ?? [];
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
  }

  public get streets(): readonly DeliveryZoneStreet[] {
    return [...this._streets];
  }

  public addStreet(street: DeliveryZoneStreet): void {
    const exists = this._streets.some((s) => s.id === street.id || s.streetName.toLowerCase() === street.streetName.toLowerCase());
    if (!exists) {
      this._streets.push(street);
      this.touch();
    }
  }

  public removeStreet(streetId: string): void {
    this._streets = this._streets.filter((s) => s.id !== streetId);
    this.touch();
  }

  public matchesStreet(streetName: string): boolean {
    if (!streetName) return false;
    const normalizedInput = DeliveryZoneStreet.normalizeStreetName(streetName);
    const normalizedMain = DeliveryZoneStreet.normalizeStreetName(this.mainStreet);
    if (normalizedInput.includes(normalizedMain) || normalizedMain.includes(normalizedInput)) {
      return true;
    }
    return this._streets.some((s) => s.matches(streetName));
  }

  public validateMinimumOrder(orderSubtotal: number): { isSatisfied: boolean; shortfall: number } {
    if (orderSubtotal >= this.minimumOrder) {
      return { isSatisfied: true, shortfall: 0 };
    }
    return {
      isSatisfied: false,
      shortfall: Number((this.minimumOrder - orderSubtotal).toFixed(2)),
    };
  }

  public updatePolicy(details: Partial<Pick<DeliveryZoneProps, 'name' | 'mainStreet' | 'deliveryFee' | 'minimumOrder' | 'etaMinutes' | 'isActive'>>): void {
    if (details.name !== undefined) this.name = details.name;
    if (details.mainStreet !== undefined) this.mainStreet = details.mainStreet;
    if (details.deliveryFee !== undefined && details.deliveryFee >= 0) this.deliveryFee = details.deliveryFee;
    if (details.minimumOrder !== undefined && details.minimumOrder >= 0) this.minimumOrder = details.minimumOrder;
    if (details.etaMinutes !== undefined && details.etaMinutes > 0) this.etaMinutes = details.etaMinutes;
    if (details.isActive !== undefined) this.isActive = details.isActive;
    this.touch();
  }

  private touch(): void {
    this.updatedAt = new Date();
  }
}
