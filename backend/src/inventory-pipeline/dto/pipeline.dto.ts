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
  /** Packaging mode: TAKEAWAY (uses paper cups, lids, sleeves) vs DINE_IN (uses reusable glassware/ceramic, 0 packaging) */
  packagingMode?: 'TAKEAWAY' | 'DINE_IN';
}

export interface ReserveParams {
  orderId: string;
  cafeId: string;
  branchId: string;
  items: PipelineItem[];
  orderType?: string;
  defaultPackagingMode?: 'TAKEAWAY' | 'DINE_IN';
}

export interface ReserveResult {
  inventoryReserved: Array<{
    inventoryId: string;
    itemName: string;
    quantity: string;
    materialType?: 'RECIPE_INGREDIENT' | 'PACKAGING_MATERIAL';
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
    materialType?: 'RECIPE_INGREDIENT' | 'PACKAGING_MATERIAL';
  }>;
}

export interface ReleaseResult {
  inventoryReleased: Array<{
    inventoryId: string;
    action: 'release_active' | 'restore_confirmed';
    quantity: string;
  }>;
}
