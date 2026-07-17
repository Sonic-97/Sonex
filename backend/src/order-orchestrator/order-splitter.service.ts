import { Injectable } from '@nestjs/common';
import { OrderItemInput, SplitGroup } from './order-orchestrator.types';

@Injectable()
export class OrderSplitterService {
  split(items: OrderItemInput[]): SplitGroup[] {
    const groups = new Map<string, SplitGroup>();

    for (const item of items) {
      if (!item.cafeId || !item.productName || item.quantity < 1) {
        continue;
      }

      const existing = groups.get(item.cafeId);
      if (existing) {
        existing.items.push(item);
        existing.subtotal += item.unitPrice * item.quantity;
      } else {
        groups.set(item.cafeId, {
          cafeId: item.cafeId,
          businessName: item.businessName || 'Unknown',
          businessType: item.businessType || 'general',
          items: [item],
          subtotal: item.unitPrice * item.quantity,
        });
      }
    }

    return Array.from(groups.values());
  }
}
