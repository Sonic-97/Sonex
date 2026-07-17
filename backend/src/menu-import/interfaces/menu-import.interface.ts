export type ImportFileType = 'image' | 'pdf' | 'excel' | 'csv';

export interface ParsedProduct {
  category: string;
  name: string;
  price: number;
  description?: string;
  sku?: string;
  imageUrl?: string;
  rowNumber?: number;
}

export interface ParsedCategory {
  name: string;
  productCount: number;
}

export interface ImportWarning {
  rowNumber?: number;
  field?: string;
  message: string;
  productName?: string;
}

export interface ImportError {
  rowNumber?: number;
  field?: string;
  message: string;
  productName?: string;
}

export interface ImportStats {
  totalRows: number;
  validProducts: number;
  invalidProducts: number;
  skippedRows: number;
  newCategories: number;
  existingCategories: number;
}

export interface ImportPreview {
  sessionId: string;
  fileName: string;
  fileType: ImportFileType;
  categories: ParsedCategory[];
  products: ParsedProduct[];
  warnings: ImportWarning[];
  errors: ImportError[];
  stats: ImportStats;
}

export interface ImportSession {
  id: string;
  status: 'pending' | 'confirmed' | 'importing' | 'completed' | 'failed';
  preview: ImportPreview;
  createdAt: Date;
  cafeId?: string;
  branchId?: string;
}

export interface ImportResult {
  sessionId: string;
  status: ImportSession['status'];
  importedCount: number;
  failedCount: number;
  errors: ImportError[];
  categoriesCreated: string[];
  productsCreated: string[];
}

export interface ImportEventPayload {
  sessionId: string;
  fileName: string;
  fileType: ImportFileType;
  totalProducts: number;
  validProducts: number;
  invalidProducts: number;
  cafeId?: string;
  timestamp: string;
}
