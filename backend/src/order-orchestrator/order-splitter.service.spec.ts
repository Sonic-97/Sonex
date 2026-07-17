import { OrderSplitterService } from './order-splitter.service';
import { OrderItemInput } from './order-orchestrator.types';

describe('OrderSplitterService', () => {
  let service: OrderSplitterService;

  beforeEach(() => { service = new OrderSplitterService(); });

  it('splits items from a single merchant into one group', () => {
    const items: OrderItemInput[] = [
      { productName: 'Cappuccino', quantity: 2, unitPrice: 3.5, cafeId: 'cafe-1', businessName: 'Cafe 1', businessType: 'cafe' },
      { productName: 'Latte', quantity: 1, unitPrice: 4.0, cafeId: 'cafe-1', businessName: 'Cafe 1', businessType: 'cafe' },
    ];
    const groups = service.split(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].cafeId).toBe('cafe-1');
    expect(groups[0].subtotal).toBeCloseTo(11.0);
    expect(groups[0].items).toHaveLength(2);
  });

  it('splits items from two merchants into two groups', () => {
    const items: OrderItemInput[] = [
      { productName: 'Cappuccino', quantity: 2, unitPrice: 3.5, cafeId: 'cafe-1', businessName: 'Cafe', businessType: 'cafe' },
      { productName: 'Tomatoes', quantity: 1, unitPrice: 2.0, cafeId: 'cafe-2', businessName: 'Fruit Shop', businessType: 'grocery' },
    ];
    const groups = service.split(items);
    expect(groups).toHaveLength(2);
    expect(groups.map(g => g.cafeId)).toEqual(['cafe-1', 'cafe-2']);
  });

  it('splits items from five merchants into five groups', () => {
    const items: OrderItemInput[] = [
      { productName: 'Cappuccino', quantity: 1, unitPrice: 3.5, cafeId: 'cafe-1', businessName: 'Cafe' },
      { productName: 'Bread', quantity: 2, unitPrice: 1.0, cafeId: 'cafe-2', businessName: 'Bakery' },
      { productName: 'Tomatoes', quantity: 1, unitPrice: 2.0, cafeId: 'cafe-3', businessName: 'Fruit Shop' },
      { productName: 'Panadol', quantity: 1, unitPrice: 5.0, cafeId: 'cafe-4', businessName: 'Pharmacy' },
      { productName: 'Rice', quantity: 1, unitPrice: 3.0, cafeId: 'cafe-5', businessName: 'Grocery' },
    ];
    const groups = service.split(items);
    expect(groups).toHaveLength(5);
  });

  it('skips items with missing cafeId', () => {
    const items: OrderItemInput[] = [
      { productName: 'Valid', quantity: 1, unitPrice: 1.0, cafeId: 'cafe-1' },
      { productName: 'Invalid', quantity: 1, unitPrice: 1.0, cafeId: '' },
      { productName: 'NoCafeId', quantity: 1, unitPrice: 1.0, cafeId: '' },
    ];
    const groups = service.split(items);
    expect(groups).toHaveLength(1);
  });

  it('groups items from same merchant together', () => {
    const items: OrderItemInput[] = [
      { productName: 'A', quantity: 1, unitPrice: 1.0, cafeId: 'cafe-1' },
      { productName: 'B', quantity: 1, unitPrice: 2.0, cafeId: 'cafe-2' },
      { productName: 'C', quantity: 1, unitPrice: 3.0, cafeId: 'cafe-1' },
    ];
    const groups = service.split(items);
    const cafe1 = groups.find(g => g.cafeId === 'cafe-1')!;
    expect(cafe1.items).toHaveLength(2);
    expect(cafe1.subtotal).toBeCloseTo(4.0);
  });

  it('returns empty array for empty input', () => {
    expect(service.split([])).toEqual([]);
  });
});
