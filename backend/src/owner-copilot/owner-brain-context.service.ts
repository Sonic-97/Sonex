import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SupplierTransaction {
  id?: string;
  date: string;
  item: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalAmount: number;
  paymentMethod?: string;
  status: 'PROPOSED' | 'COMPLETED' | 'CANCELLED';
}

export interface SupplierProfile {
  name: string;
  category?: string;
  items: string[];
  isPreferred?: boolean;
  isBlocked?: boolean;
  phone?: string;
  lastPrice?: number;
  unit?: string;
  lastPurchasedAt?: string;
  explicitPreference?: boolean;
  sentimentNotes?: string[];
  recentTransactions?: SupplierTransaction[];
}

export interface BusinessFactItem {
  key: string;
  value: any;
  confidence: number;
  source: 'OWNER_EXPLICIT' | 'INFERRED_OPERATION';
  timestamp: string;
}

export interface ActiveSessionContext {
  lastPurchaseDraft?: {
    item: string;
    quantity: number;
    unit: string;
    supplier?: string;
    totalAmount?: number;
    unitPrice?: number;
    paymentMethod?: 'CASH' | 'CARD' | 'DEFERRED';
    stage?: 'ACCUMULATING' | 'DRAFT' | 'PROPOSED' | 'EXECUTED';
    missingFields?: string[];
    proposalId?: string;
    timestamp: string;
    rawUtterance?: string;
  };
  lastMenuDraft?: {
    category?: string;
    products?: Array<{
      name: string;
      sizes?: string[];
      prices?: Record<string, number>;
      recipes?: Record<string, Array<{ name: string; quantity: number; unit: string }>>;
    }>;
  };
  pendingDisambiguation?: {
    action: string;
    targetTerm: string;
    candidates: Array<{ id: string; name: string; price?: number; cost?: number }>;
    selectedCandidate?: { id: string; name: string; price?: number };
    timestamp: string;
  };
  pendingShock?: {
    ingredient: string;
    status: 'AWAITING_PRICE' | 'CALCULATED';
    oldPrice?: number;
    newPrice?: number;
    timestamp: string;
  };
  lastTopic?: 'PURCHASE' | 'MENU_PRICING' | 'COMMODITY_SHOCK' | 'OPERATIONS' | 'GENERAL';
  contextHistory?: Array<{ topic: string; entity?: string; timestamp: string }>;
  recentProposedHashes?: string[];
  lastInteractionAt?: string;
}

export interface OwnerBrainState {
  cafeDiscovery: {
    cafeType?: 'SPECIALTY_COFFEE' | 'COMMERCIAL_CAFE' | 'KIOSK' | 'LOUNGE_RESTAURANT' | 'BAKERY_CAFE' | 'GENERAL';
    serviceModel?: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | 'MIXED';
    onboardingStep?: 'NOT_STARTED' | 'CATEGORIES_DISCOVERY' | 'PRODUCTS_DISCOVERY' | 'SIZES_RECIPES' | 'COSTING_PRICING' | 'COMPLETED';
    targetCategories?: string[];
    hasSizes?: boolean;
    sizesList?: string[];
  };
  ownerPreferences: {
    targetGrossMarginPercent: number;
    pricingStrategy: 'FIXED_MARGIN' | 'COMPETITOR_BASED' | 'PSYCHOLOGICAL_ROUNDING';
    roundingRule: 'ROUND_TO_5' | 'ROUND_TO_10' | 'EXACT';
    askBeforePriceChange: boolean;
    askBeforeExpense: boolean;
    askBeforeInventoryChange: boolean;
    askBeforeProductCreate: boolean;
    autoDetectLowMargin: boolean;
  };
  operationalFacts: {
    knownSuppliers: Array<{ name: string; items: string[]; phone?: string }>;
    notes: string[];
    supplierProfiles?: SupplierProfile[];
    businessFacts?: BusinessFactItem[];
  };
  activeSession?: ActiveSessionContext;
}

export const DEFAULT_BRAIN_STATE: OwnerBrainState = {
  cafeDiscovery: {
    cafeType: 'GENERAL',
    serviceModel: 'MIXED',
    onboardingStep: 'NOT_STARTED',
    targetCategories: [],
    hasSizes: false,
    sizesList: ['عادي', 'كبير'],
  },
  ownerPreferences: {
    targetGrossMarginPercent: 70,
    pricingStrategy: 'PSYCHOLOGICAL_ROUNDING',
    roundingRule: 'ROUND_TO_5',
    askBeforePriceChange: true,
    askBeforeExpense: true,
    askBeforeInventoryChange: true,
    askBeforeProductCreate: true,
    autoDetectLowMargin: true,
  },
  operationalFacts: {
    knownSuppliers: [],
    notes: [],
    supplierProfiles: [],
    businessFacts: [],
  },
  activeSession: {},
};

export interface AssembledBusinessContext {
  cafeId: string;
  cafeName: string;
  currency: string;
  timezone: string;
  brainState: OwnerBrainState;
  menuSummary: {
    totalProducts: number;
    categories: Array<{ id: string; name: string; productCount: number }>;
    products: Array<{
      id: string;
      name: string;
      price: number;
      cost: number;
      categoryName: string;
      ingredients: Array<{
        name: string;
        quantity: number;
        unit: string;
        costPerUnit: number;
      }>;
    }>;
  };
  inventorySummary: {
    totalItems: number;
    lowStockCount: number;
    items: Array<{
      id: string;
      name: string;
      unit: string;
      currentQty: number;
      minThreshold: number;
      costPerUnit: number;
      isLowStock: boolean;
    }>;
  };
  suppliers: Array<{ id: string; name: string; phone?: string | null }>;
}

@Injectable()
export class OwnerBrainContextService {
  private readonly logger = new Logger(OwnerBrainContextService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getBrainState(cafeId: string): Promise<OwnerBrainState> {
    const cafe = await this.prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { configuration: true },
    });

    const config = (cafe?.configuration as Record<string, any>) || {};
    const brain = config.ownerBrain || {};

    return {
      cafeDiscovery: { ...DEFAULT_BRAIN_STATE.cafeDiscovery, ...(brain.cafeDiscovery || {}) },
      ownerPreferences: { ...DEFAULT_BRAIN_STATE.ownerPreferences, ...(brain.ownerPreferences || {}) },
      operationalFacts: {
        ...DEFAULT_BRAIN_STATE.operationalFacts,
        ...(brain.operationalFacts || {}),
        supplierProfiles: brain.operationalFacts?.supplierProfiles || [],
        businessFacts: brain.operationalFacts?.businessFacts || [],
      },
      activeSession: brain.activeSession || {},
    };
  }

  async updateBrainState(cafeId: string, partial: Partial<OwnerBrainState>): Promise<OwnerBrainState> {
    const current = await this.getBrainState(cafeId);
    const updated: OwnerBrainState = {
      cafeDiscovery: { ...current.cafeDiscovery, ...(partial.cafeDiscovery || {}) },
      ownerPreferences: { ...current.ownerPreferences, ...(partial.ownerPreferences || {}) },
      operationalFacts: {
        knownSuppliers: partial.operationalFacts?.knownSuppliers || current.operationalFacts.knownSuppliers,
        notes: partial.operationalFacts?.notes || current.operationalFacts.notes,
        supplierProfiles: partial.operationalFacts?.supplierProfiles || current.operationalFacts.supplierProfiles || [],
        businessFacts: partial.operationalFacts?.businessFacts || current.operationalFacts.businessFacts || [],
      },
      activeSession: { ...(current.activeSession || {}), ...(partial.activeSession || {}) },
    };

    const cafe = await this.prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { configuration: true },
    });

    const config = (cafe?.configuration as Record<string, any>) || {};
    config.ownerBrain = updated;

    await this.prisma.cafe.update({
      where: { id: cafeId },
      data: { configuration: config },
    });

    return updated;
  }

  async recordSupplierInteraction(
    cafeId: string,
    supplierData: {
      name: string;
      item?: string;
      price?: number;
      unit?: string;
      isPreferred?: boolean;
      explicitPreference?: boolean;
      quantity?: number;
      totalAmount?: number;
      paymentMethod?: string;
      isBlocked?: boolean;
    },
  ): Promise<void> {
    const state = await this.getBrainState(cafeId);
    const profiles = [...(state.operationalFacts.supplierProfiles || [])];
    const cleanName = supplierData.name.trim();
    let profile = profiles.find((p) => p.name.toLowerCase() === cleanName.toLowerCase());

    const now = new Date().toISOString();
    const newTx: SupplierTransaction | null =
      supplierData.quantity && supplierData.price !== undefined
        ? {
            id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            date: now,
            item: supplierData.item || 'خامات',
            quantity: supplierData.quantity,
            unit: supplierData.unit || 'kg',
            unitPrice: supplierData.price,
            totalAmount: supplierData.totalAmount || Math.round(supplierData.quantity * supplierData.price),
            paymentMethod: supplierData.paymentMethod || 'CASH',
            status: 'PROPOSED',
          }
        : null;

    if (!profile) {
      profile = {
        name: cleanName,
        items: supplierData.item ? [supplierData.item] : [],
        isPreferred: supplierData.isPreferred ?? false,
        isBlocked: supplierData.isBlocked ?? false,
        lastPrice: supplierData.price,
        unit: supplierData.unit,
        lastPurchasedAt: now,
        explicitPreference: supplierData.explicitPreference ?? false,
        sentimentNotes: [],
        recentTransactions: newTx ? [newTx] : [],
      };
      profiles.push(profile);
    } else {
      if (supplierData.item && !profile.items.includes(supplierData.item)) {
        profile.items.push(supplierData.item);
      }
      if (supplierData.price !== undefined) profile.lastPrice = supplierData.price;
      if (supplierData.unit) profile.unit = supplierData.unit;
      if (supplierData.isPreferred !== undefined) profile.isPreferred = supplierData.isPreferred;
      if (supplierData.explicitPreference !== undefined) profile.explicitPreference = supplierData.explicitPreference;
      if (supplierData.isBlocked !== undefined) profile.isBlocked = supplierData.isBlocked;
      profile.lastPurchasedAt = now;

      if (newTx) {
        profile.recentTransactions = [newTx, ...(profile.recentTransactions || [])].slice(0, 10);
      }
    }

    await this.updateBrainState(cafeId, {
      operationalFacts: {
        ...state.operationalFacts,
        supplierProfiles: profiles,
      },
    });
  }

  async recordSupplierSentiment(
    cafeId: string,
    supplierName: string,
    action: 'NOTE' | 'BLOCK' | 'UNBLOCK' | 'PREFER',
    note?: string,
  ): Promise<void> {
    const state = await this.getBrainState(cafeId);
    const profiles = [...(state.operationalFacts.supplierProfiles || [])];
    const cleanName = supplierName.trim();
    let profile = profiles.find((p) => p.name.toLowerCase() === cleanName.toLowerCase());

    if (!profile) {
      profile = {
        name: cleanName,
        items: [],
        isPreferred: action === 'PREFER',
        isBlocked: action === 'BLOCK',
        sentimentNotes: note ? [note] : [],
      };
      profiles.push(profile);
    } else {
      if (action === 'BLOCK') {
        profile.isBlocked = true;
        profile.isPreferred = false;
      } else if (action === 'UNBLOCK') {
        profile.isBlocked = false;
      } else if (action === 'PREFER') {
        profile.isPreferred = true;
        profile.isBlocked = false;
      }
      if (note) {
        profile.sentimentNotes = [note, ...(profile.sentimentNotes || [])].slice(0, 10);
      }
    }

    await this.updateBrainState(cafeId, {
      operationalFacts: {
        ...state.operationalFacts,
        supplierProfiles: profiles,
      },
    });
  }

  async syncDraftToSupplier(
    cafeId: string,
    draft: {
      item: string;
      quantity: number;
      unit: string;
      unitPrice?: number;
      totalAmount?: number;
      supplier?: string;
      paymentMethod?: string;
    },
  ): Promise<void> {
    if (!draft.supplier || draft.unitPrice === undefined) return;
    await this.recordSupplierInteraction(cafeId, {
      name: draft.supplier,
      item: draft.item,
      price: draft.unitPrice,
      unit: draft.unit,
      quantity: draft.quantity,
      totalAmount: draft.totalAmount,
      paymentMethod: draft.paymentMethod,
    });
  }

  async recordBusinessFact(cafeId: string, key: string, value: any, explicit = true): Promise<void> {
    const state = await this.getBrainState(cafeId);
    const facts = [...(state.operationalFacts.businessFacts || [])];
    const existingIdx = facts.findIndex((f) => f.key === key);
    const newFact: BusinessFactItem = {
      key,
      value,
      confidence: explicit ? 1.0 : 0.7,
      source: explicit ? 'OWNER_EXPLICIT' : 'INFERRED_OPERATION',
      timestamp: new Date().toISOString(),
    };
    if (existingIdx >= 0) {
      facts[existingIdx] = newFact;
    } else {
      facts.push(newFact);
    }
    await this.updateBrainState(cafeId, {
      operationalFacts: {
        ...state.operationalFacts,
        businessFacts: facts,
      },
    });
  }

  async updateActiveSession(cafeId: string, partialSession: Partial<ActiveSessionContext>): Promise<void> {
    const state = await this.getBrainState(cafeId);
    const updatedSession = {
      ...(state.activeSession || {}),
      ...partialSession,
      lastInteractionAt: new Date().toISOString(),
    };
    await this.updateBrainState(cafeId, {
      activeSession: updatedSession,
    });

    if (partialSession.lastPurchaseDraft?.supplier && partialSession.lastPurchaseDraft?.unitPrice !== undefined) {
      await this.syncDraftToSupplier(cafeId, partialSession.lastPurchaseDraft);
    }
  }

  async assembleBusinessContext(cafeId: string, branchId?: string): Promise<AssembledBusinessContext> {
    const [cafe, categories, products, inventoryItems, suppliers, brainState] = await Promise.all([
      this.prisma.cafe.findUnique({
        where: { id: cafeId },
        select: { id: true, name: true, currency: true, timezone: true },
      }),
      this.prisma.productCategory.findMany({
        where: { cafeId },
        select: { id: true, name: true },
      }),
      this.prisma.product.findMany({
        where: { cafeId, active: true },
        select: {
          id: true,
          name: true,
          price: true,
          cost: true,
          categoryId: true,
          categoryRel: { select: { name: true } },
          recipe: {
            select: {
              quantity: true,
              unit: true,
              inventory: { select: { itemName: true, costPerUnit: true } },
            },
          },
        },
        take: 100,
      }),
      this.prisma.inventory.findMany({
        where: { cafeId, ...(branchId ? { branchId } : {}) },
        select: {
          id: true,
          itemName: true,
          unit: true,
          currentQty: true,
          minThreshold: true,
          costPerUnit: true,
        },
        take: 100,
      }),
      this.prisma.supplier.findMany({
        where: { cafeId, active: true },
        select: { id: true, name: true, phone: true },
      }),
      this.getBrainState(cafeId),
    ]);

    const formattedProducts = products.map((p) => {
      const ingredients = (p.recipe || []).map((r) => ({
        name: r.inventory?.itemName || 'مكون',
        quantity: Number(r.quantity),
        unit: r.unit || 'g',
        costPerUnit: Number(r.inventory?.costPerUnit || 0),
      }));

      return {
        id: p.id,
        name: p.name,
        price: Number(p.price),
        cost: Number(p.cost),
        categoryName: p.categoryRel?.name || 'عام',
        ingredients,
      };
    });

    const categoryCounts = categories.map((c) => ({
      id: c.id,
      name: c.name,
      productCount: formattedProducts.filter((p) => p.categoryName === c.name).length,
    }));

    const formattedInventory = inventoryItems.map((item) => {
      const currentQty = Number(item.currentQty);
      const minThreshold = Number(item.minThreshold);
      return {
        id: item.id,
        name: item.itemName,
        unit: item.unit,
        currentQty,
        minThreshold,
        costPerUnit: Number(item.costPerUnit),
        isLowStock: currentQty <= minThreshold,
      };
    });

    return {
      cafeId,
      cafeName: cafe?.name || 'كافيه سونيك',
      currency: cafe?.currency || 'EGP',
      timezone: cafe?.timezone || 'Africa/Cairo',
      brainState,
      menuSummary: {
        totalProducts: formattedProducts.length,
        categories: categoryCounts,
        products: formattedProducts,
      },
      inventorySummary: {
        totalItems: formattedInventory.length,
        lowStockCount: formattedInventory.filter((i) => i.isLowStock).length,
        items: formattedInventory,
      },
      suppliers,
    };
  }

  calculateSmartPrice(unitCost: number, targetMarginPercent: number, rule: 'ROUND_TO_5' | 'ROUND_TO_10' | 'EXACT'): number {
    if (unitCost <= 0) return 0;
    const marginRatio = Math.max(0.05, Math.min(0.95, targetMarginPercent / 100));
    const rawPrice = unitCost / (1 - marginRatio);

    if (rule === 'EXACT') return Math.round(rawPrice);
    if (rule === 'ROUND_TO_5') return Math.max(5, Math.ceil(rawPrice / 5) * 5);
    if (rule === 'ROUND_TO_10') return Math.max(10, Math.ceil(rawPrice / 10) * 10);
    return Math.round(rawPrice);
  }
}
