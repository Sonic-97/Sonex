export type UnitDef = {
  value: string;
  labelAr: string;
  category: 'weight' | 'volume' | 'count';
};

export const INVENTORY_UNITS: UnitDef[] = [
  // Weight
  { value: 'g', labelAr: 'جرام', category: 'weight' },
  { value: 'kg', labelAr: 'كيلوجرام', category: 'weight' },
  // Volume
  { value: 'ml', labelAr: 'مل', category: 'volume' },
  { value: 'L', labelAr: 'لتر', category: 'volume' },
  { value: 'liter', labelAr: 'لتر', category: 'volume' },
  // Count
  { value: 'pcs', labelAr: 'قطعة', category: 'count' },
  { value: 'piece', labelAr: 'قطعة', category: 'count' },
  { value: 'packet', labelAr: 'باكت', category: 'count' },
  { value: 'box', labelAr: 'علبة', category: 'count' },
  { value: 'carton', labelAr: 'كرتونة', category: 'count' },
  { value: 'bottle', labelAr: 'زجاجة', category: 'count' },
  { value: 'can', labelAr: 'كانز', category: 'count' },
  { value: 'cup', labelAr: 'كوب', category: 'count' },
  { value: 'cups', labelAr: 'كوب', category: 'count' },
  { value: 'bag', labelAr: 'كيس', category: 'count' },
  { value: 'envelope', labelAr: 'ظرف', category: 'count' },
  { value: 'jar', labelAr: 'برطمان', category: 'count' },
  { value: 'container', labelAr: 'عبوة', category: 'count' },
  { value: 'tray', labelAr: 'صينية', category: 'count' },
];

export function getUnitLabel(value: string): string {
  const found = INVENTORY_UNITS.find(u => u.value === value);
  return found?.labelAr ?? value;
}

export function getUnitCategory(value: string): string {
  const found = INVENTORY_UNITS.find(u => u.value === value);
  return found?.category ?? 'count';
}
