export interface CustomerLocationProps {
  id: string;
  customerId: string;
  branchId: string;
  zoneId?: string | null;
  label?: string;
  mainStreet: string;
  subStreet?: string | null;
  buildingNumber?: string | null;
  floor?: string | null;
  apartment?: string | null;
  landmark?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  googlePlaceId?: string | null;
  isDefault?: boolean;
  lastUsedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class CustomerLocation {
  public readonly id: string;
  public readonly customerId: string;
  public branchId: string;
  public zoneId: string | null;
  public label: string;
  public mainStreet: string;
  public subStreet: string | null;
  public buildingNumber: string | null;
  public floor: string | null;
  public apartment: string | null;
  public landmark: string | null;
  public latitude: number | null;
  public longitude: number | null;
  public googlePlaceId: string | null;
  public isDefault: boolean;
  public lastUsedAt: Date | null;
  public readonly createdAt: Date;
  public updatedAt: Date;

  constructor(props: CustomerLocationProps) {
    this.id = props.id;
    this.customerId = props.customerId;
    this.branchId = props.branchId;
    this.zoneId = props.zoneId ?? null;
    this.label = props.label ?? 'Home';
    this.mainStreet = props.mainStreet;
    this.subStreet = props.subStreet ?? null;
    this.buildingNumber = props.buildingNumber ?? null;
    this.floor = props.floor ?? null;
    this.apartment = props.apartment ?? null;
    this.landmark = props.landmark ?? null;
    this.latitude = props.latitude ?? null;
    this.longitude = props.longitude ?? null;
    this.googlePlaceId = props.googlePlaceId ?? null;
    this.isDefault = props.isDefault ?? false;
    this.lastUsedAt = props.lastUsedAt ?? null;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
  }

  public markAsUsed(): void {
    this.lastUsedAt = new Date();
    this.updatedAt = new Date();
  }

  public setDefault(isDefault: boolean): void {
    this.isDefault = isDefault;
    this.updatedAt = new Date();
  }

  public getGoogleMapsDeepLink(): string {
    if (this.latitude !== null && this.longitude !== null) {
      return `https://www.google.com/maps/search/?api=1&query=${this.latitude},${this.longitude}`;
    }
    if (this.googlePlaceId) {
      return `https://www.google.com/maps/search/?api=1&query_place_id=${this.googlePlaceId}`;
    }
    const query = encodeURIComponent(`${this.mainStreet} ${this.subStreet ?? ''}`.trim());
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
  }

  public toFormattedAddressString(): string {
    const parts: string[] = [];
    if (this.label) parts.push(`[${this.label}]`);
    parts.push(this.mainStreet);
    if (this.subStreet) parts.push(`Sub-street: ${this.subStreet}`);
    if (this.buildingNumber) parts.push(`Bldg: ${this.buildingNumber}`);
    if (this.floor) parts.push(`Floor: ${this.floor}`);
    if (this.apartment) parts.push(`Apt: ${this.apartment}`);
    if (this.landmark) parts.push(`Near: ${this.landmark}`);
    return parts.join(', ');
  }

  public toWhatsAppSummary(language: 'ar' | 'en' = 'ar'): string {
    if (language === 'ar') {
      const details: string[] = [];
      details.push(`🏠 *${this.label}*`);
      details.push(`📍 ${this.mainStreet}`);
      if (this.subStreet) details.push(`🛣️ ${this.subStreet}`);
      if (this.buildingNumber) details.push(`🏢 مبنى ${this.buildingNumber}`);
      if (this.floor || this.apartment) details.push(`🚪 طابق ${this.floor ?? '-'} / شقة ${this.apartment ?? '-'}`);
      if (this.landmark) details.push(`📍 علامة مميزة: ${this.landmark}`);
      return details.join('\n');
    }

    const details: string[] = [];
    details.push(`🏠 *${this.label}*`);
    details.push(`📍 ${this.mainStreet}`);
    if (this.subStreet) details.push(`🛣️ ${this.subStreet}`);
    if (this.buildingNumber) details.push(`🏢 Building ${this.buildingNumber}`);
    if (this.floor || this.apartment) details.push(`🚪 Floor ${this.floor ?? '-'} / Apt ${this.apartment ?? '-'}`);
    if (this.landmark) details.push(`📍 Landmark: ${this.landmark}`);
    return details.join('\n');
  }
}
