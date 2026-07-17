export interface IngredientImpact {
  inventoryId: string;
  quantity: number;
  unit: string;
}

export interface PipelineItem {
  productId: string;
  productName: string;
  quantity: number;
  isRefrigerated: boolean;
  refrigeratorInventoryId?: string | null;
  /** Extra ingredients from option choices (e.g. extra milk for "Large" size) */
  extraIngredients?: IngredientImpact[];
}

export interface ReserveParams {
  orderId: string;
  cafeId: string;
  branchId: string;
  items: PipelineItem[];
}

export interface ReserveResult {
  inventoryReserved: Array<{
    inventoryId: string;
    itemName: string;
    quantity: string;
  }>;
  refrigeratorDeducted: Array<{
    productId: string;
    productName: string;
    quantity: number;
  }>;
}

export interface ConfirmResult {
  inventoryConfirmed: Array<{
    inventoryId: string;
    itemName: string;
    deducted: string;
    remaining: string;
  }>;
}

export interface ReleaseResult {
  inventoryReleased: Array<{
    inventoryId: string;
    action: 'release_active' | 'restore_confirmed';
    quantity: string;
  }>;
}
