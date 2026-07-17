type UnitCategory = 'weight' | 'volume' | 'count';

const UNIT_CATEGORY: Record<string, UnitCategory> = {
  'g': 'weight', 'kg': 'weight',
  'ml': 'volume', 'L': 'volume', 'liter': 'volume',
  'piece': 'count', 'pcs': 'count', 'packet': 'count',
  'box': 'count', 'carton': 'count', 'bottle': 'count',
  'can': 'count', 'cup': 'count', 'cups': 'count',
  'bag': 'count', 'envelope': 'count', 'jar': 'count',
  'container': 'count', 'tray': 'count',
};

const UNIT_TO_BASE_FACTOR: Record<string, number> = {
  'g': 1, 'kg': 1000,
  'ml': 1, 'L': 1000, 'liter': 1000,
  'piece': 1, 'pcs': 1, 'packet': 1,
  'box': 1, 'carton': 1, 'bottle': 1,
  'can': 1, 'cup': 1, 'cups': 1,
  'bag': 1, 'envelope': 1, 'jar': 1,
  'container': 1, 'tray': 1,
};

export function convertUnit(quantity: number, fromUnit: string, toUnit: string): number {
  if (!fromUnit || !toUnit || fromUnit === toUnit) return quantity;

  const fromCat = UNIT_CATEGORY[fromUnit];
  const toCat = UNIT_CATEGORY[toUnit];

  if (!fromCat || !toCat) {
    return quantity;
  }

  if (fromCat !== toCat) {
    throw new Error(
      `Cannot convert between different unit categories: ${fromUnit} (${fromCat}) → ${toUnit} (${toCat})`,
    );
  }

  const baseValue = quantity * (UNIT_TO_BASE_FACTOR[fromUnit] || 1);
  return baseValue / (UNIT_TO_BASE_FACTOR[toUnit] || 1);
}
