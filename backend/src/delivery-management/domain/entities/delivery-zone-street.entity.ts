export class DeliveryZoneStreet {
  constructor(
    public readonly id: string,
    public readonly zoneId: string,
    public readonly streetName: string,
    public readonly displayOrder: number = 0,
  ) {}

  public static normalizeStreetName(name: string): string {
    if (!name) return '';
    return name
      .trim()
      .replace(/[\u064B-\u0652]/g, '') // remove Arabic diacritics
      .replace(/أ|إ|آ/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .toLowerCase();
  }

  public matches(inputName: string): boolean {
    const normInput = DeliveryZoneStreet.normalizeStreetName(inputName);
    const normStreet = DeliveryZoneStreet.normalizeStreetName(this.streetName);
    return normInput.includes(normStreet) || normStreet.includes(normInput);
  }
}
