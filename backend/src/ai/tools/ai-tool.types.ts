export interface AiToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface AiToolContext {
  cafeId: string;
  branchId?: string;
  customerId?: string;
  phone?: string;
  channel?: 'WHATSAPP' | 'SIMULATOR';
  isSimulation?: boolean;
}

export interface AiToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  userFriendlyMessage?: string;
}

export interface OrderItemQuoteInput {
  productId: string;
  quantity: number;
  size?: 'S' | 'M' | 'L';
  selectedOptionIds?: string[];
  notes?: string;
}

export interface CalculatedOrderQuote {
  items: Array<{
    productId: string;
    productName: string;
    unitPrice: number;
    sizePrice: number;
    addonsTotal: number;
    quantity: number;
    subtotal: number;
    notes?: string;
  }>;
  itemsSubtotal: number;
  deliveryFee: number;
  discountAmount: number;
  appliedPromotion?: string;
  finalTotal: number;
  minimumOrderReached: boolean;
  minimumOrderRequired: number;
}
