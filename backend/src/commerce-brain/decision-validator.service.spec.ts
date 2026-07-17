import { DecisionValidatorService } from './decision-validator.service';
import { CommerceContext, AiCommerceDecision } from './commerce-brain.types';

function makeContext(overrides?: Partial<CommerceContext>): CommerceContext {
  return {
    business: {
      id: 'cafe-1', name: 'Test Cafe', businessType: 'cafe',
      language: 'ar-EG', timezone: 'Africa/Cairo',
      personality: 'friendly', greetingStyle: 'casual',
      workingNow: true, deliveryAvailable: true, pickupAvailable: true,
      promotionEnabled: true,
    },
    conversation: { currentStep: 'NEW', collectedInformation: {}, missingInformation: [] },
    catalog: {
      totalCount: 3,
      products: [
        { productId: 'p1', name: 'Cappuccino', category: 'coffee', available: true, variants: [], requiredOptions: [], optionalOptions: [] },
        { productId: 'p2', name: 'Latte', category: 'coffee', available: true, variants: [], requiredOptions: [], optionalOptions: [] },
        { productId: 'p3', name: 'Croissant', category: 'pastry', available: true, variants: [], requiredOptions: [], optionalOptions: [] },
      ],
    },
    ...overrides,
  };
}

function validDecision(): AiCommerceDecision {
  return {
    intent: 'ORDER', confidence: 0.95, requiredConfirmation: false,
    missingInformation: [],
    recommendations: [{ productId: 'p1', reason: 'Popular', priority: 1 }],
    nextAction: 'ASK_QUANTITY',
    structuredReplyData: { bodyKey: 'order.how_many', variables: { name: 'Cappuccino' } },
    extractedEntities: { productNames: ['Cappuccino'] },
    reasoningCode: 'CONTINUE_CONVERSATION',
  };
}

describe('DecisionValidatorService', () => {
  let validator: DecisionValidatorService;

  beforeEach(() => {
    validator = new DecisionValidatorService();
  });

  // ── Schema validation ──

  describe('Schema validation', () => {
    it('returns safe fallback for null input', () => {
      const result = validator.validate(null, makeContext());
      expect(result.intent).toBe('UNKNOWN');
      expect(result.confidence).toBe(0);
    });

    it('returns safe fallback for undefined input', () => {
      const result = validator.validate(undefined, makeContext());
      expect(result.intent).toBe('UNKNOWN');
    });

    it('returns safe fallback for non-object input', () => {
      const result = validator.validate('garbage string', makeContext());
      expect(result.intent).toBe('UNKNOWN');
    });

    it('returns safe fallback for array input', () => {
      const result = validator.validate([], makeContext());
      expect(result.intent).toBe('UNKNOWN');
    });

    it('passes through a fully valid decision unchanged', () => {
      const input = validDecision();
      const result = validator.validate(input, makeContext());
      expect(result.intent).toBe('ORDER');
      expect(result.confidence).toBe(0.95);
      expect(result.reasoningCode).toBe('CONTINUE_CONVERSATION');
      expect(result.nextAction).toBe('ASK_QUANTITY');
      expect(result.recommendations).toHaveLength(1);
    });
  });

  // ── Enum validation ──

  describe('Enum validation', () => {
    it('falls back to UNKNOWN for invalid intent', () => {
      const result = validator.validate({ ...validDecision(), intent: 'FLY_TO_MOON' }, makeContext());
      expect(result.intent).toBe('UNKNOWN');
    });

    it('falls back to NO_ACTION for invalid nextAction', () => {
      const result = validator.validate({ ...validDecision(), nextAction: 'DO_SOMETHING_CRAZY' }, makeContext());
      expect(result.nextAction).toBe('NO_ACTION');
    });

    it('falls back to CONTINUE_CONVERSATION for invalid reasoningCode', () => {
      const result = validator.validate({ ...validDecision(), reasoningCode: 'ALIENS_INVADED' }, makeContext());
      expect(result.reasoningCode).toBe('CONTINUE_CONVERSATION');
    });

    it('accepts all valid intents with suitable context', () => {
      const ctx = makeContext({
        customer: { customerId: 'c1', firstName: 'A', preferredLanguage: 'ar', favoriteProducts: [], recentOrders: [], savedAddresses: [], loyaltySummary: { totalOrders: 0, totalSpent: '0' } },
        activeOrder: { items: [{ productName: 'Cappuccino', quantity: 1, selectedOptions: [], lineTotal: '35' }], runningTotal: '35', deliveryMethod: 'DELIVERY' },
      });
      const intents = ['ORDER', 'MODIFY_ORDER', 'CANCEL_ORDER', 'REORDER', 'ASK_PRODUCT', 'ASK_PRICE', 'ASK_HOURS', 'ASK_DELIVERY', 'ASK_PAYMENT', 'ASK_PROMOTION', 'SMALL_TALK', 'UNKNOWN'];
      for (const intent of intents) {
        const result = validator.validate({ ...validDecision(), intent, confidence: 0.95 }, ctx);
        expect(result.intent).toBe(intent);
      }
    });

    it('accepts all valid next actions', () => {
      const actions = ['ASK_OPTION', 'ASK_QUANTITY', 'CONFIRM_ORDER', 'CREATE_ORDER', 'MODIFY_ORDER', 'CANCEL_ORDER', 'SHOW_PRODUCTS', 'SHOW_RECOMMENDATIONS', 'ANSWER_INFORMATION', 'ESCALATE_TO_HUMAN', 'NO_ACTION'];
      for (const action of actions) {
        const result = validator.validate({ ...validDecision(), nextAction: action }, makeContext());
        expect(result.nextAction).toBe(action);
      }
    });
  });

  // ── Confidence validation ──

  describe('Confidence validation', () => {
    it('clamps confidence to 0.0–1.0 range', () => {
      expect(validator.validate({ ...validDecision(), confidence: 1.5 }, makeContext()).confidence).toBe(1);
      expect(validator.validate({ ...validDecision(), confidence: -0.5 }, makeContext()).confidence).toBe(0);
    });

    it('rounds confidence to 2 decimal places', () => {
      const result = validator.validate({ ...validDecision(), confidence: 0.666666 }, makeContext());
      expect(result.confidence).toBe(0.67);
    });

    it('defaults to 0.5 for missing confidence', () => {
      const result = validator.validate({ ...validDecision(), confidence: undefined }, makeContext());
      expect(result.confidence).toBe(0.5);
    });

    it('defaults to 0.5 for non-numeric confidence', () => {
      const result = validator.validate({ ...validDecision(), confidence: 'high' }, makeContext());
      expect(result.confidence).toBe(0.5);
    });

    it('defaults to 0.5 for NaN confidence', () => {
      const result = validator.validate({ ...validDecision(), confidence: NaN }, makeContext());
      expect(result.confidence).toBe(0.5);
    });
  });

  // ── Context consistency: recommendations ──

  describe('Recommendation validation', () => {
    it('removes recommendations with productId not in catalog', () => {
      const input = validDecision();
      input.recommendations = [
        { productId: 'p1', reason: 'Good', priority: 1 },
        { productId: 'nonexistent', reason: 'Fake', priority: 2 },
      ];
      const result = validator.validate(input, makeContext());
      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0].productId).toBe('p1');
    });

    it('deduplicates recommendations by productId', () => {
      const input = validDecision();
      input.recommendations = [
        { productId: 'p1', reason: 'First', priority: 1 },
        { productId: 'p1', reason: 'Duplicate', priority: 2 },
      ];
      const result = validator.validate(input, makeContext());
      expect(result.recommendations).toHaveLength(1);
    });

    it('fills missing reason with default', () => {
      const input = validDecision();
      input.recommendations = [{ productId: 'p1', reason: '', priority: 1 }];
      const result = validator.validate(input, makeContext());
      expect(result.recommendations[0].reason).toBe('Recommended');
    });

    it('clamps priority to non-negative integer', () => {
      const input = validDecision();
      input.recommendations = [{ productId: 'p1', reason: 'test', priority: -5 }];
      const result = validator.validate(input, makeContext());
      expect(result.recommendations[0].priority).toBe(0);
    });

    it('returns empty array for non-array recommendations', () => {
      const result = validator.validate({ ...validDecision(), recommendations: 'not-array' }, makeContext());
      expect(result.recommendations).toEqual([]);
    });
  });

  // ── MissingInformation validation ──

  describe('MissingInformation validation', () => {
    it('deduplicates by field name', () => {
      const input = validDecision();
      input.missingInformation = [
        { field: 'size', required: true },
        { field: 'size', required: true },
      ];
      const result = validator.validate(input, makeContext());
      expect(result.missingInformation).toHaveLength(1);
    });

    it('removes entries with empty field name', () => {
      const input = validDecision();
      input.missingInformation = [
        { field: '', required: true },
        { field: 'size', required: true },
      ];
      const result = validator.validate(input, makeContext());
      expect(result.missingInformation).toHaveLength(1);
      expect(result.missingInformation[0].field).toBe('size');
    });

    it('deduplicates choices', () => {
      const input = validDecision();
      input.missingInformation = [
        { field: 'size', required: true, choices: ['Small', 'Small', 'Large'] },
      ];
      const result = validator.validate(input, makeContext());
      expect(result.missingInformation[0].choices).toEqual(['Small', 'Large']);
    });

    it('removes choices if empty after dedup', () => {
      const input = validDecision();
      input.missingInformation = [
        { field: 'size', required: true, choices: [] },
      ];
      const result = validator.validate(input, makeContext());
      expect(result.missingInformation[0].choices).toBeUndefined();
    });

    it('defaults required to true when missing', () => {
      const input = validDecision();
      input.missingInformation = [{ field: 'size' } as any];
      const result = validator.validate(input, makeContext());
      expect(result.missingInformation[0].required).toBe(true);
    });

    it('returns empty array for non-array', () => {
      const result = validator.validate({ ...validDecision(), missingInformation: 'nope' }, makeContext());
      expect(result.missingInformation).toEqual([]);
    });
  });

  // ── StructuredReplyData validation ──

  describe('StructuredReplyData validation', () => {
    it('defaults bodyKey for missing reply data', () => {
      const result = validator.validate({ ...validDecision(), structuredReplyData: null }, makeContext());
      expect(result.structuredReplyData.bodyKey).toBe('general.response');
    });

    it('defaults bodyKey for non-object reply data', () => {
      const result = validator.validate({ ...validDecision(), structuredReplyData: 'string' }, makeContext());
      expect(result.structuredReplyData.bodyKey).toBe('general.response');
    });

    it('defaults bodyKey to general.response when bodyKey is empty', () => {
      const result = validator.validate({ ...validDecision(), structuredReplyData: { bodyKey: '' } }, makeContext());
      expect(result.structuredReplyData.bodyKey).toBe('general.response');
    });

    it('deduplicates buttonIds', () => {
      const result = validator.validate({
        ...validDecision(),
        structuredReplyData: { bodyKey: 'test', buttonIds: ['a', 'b', 'a'] },
      }, makeContext());
      expect(result.structuredReplyData.buttonIds).toEqual(['a', 'b']);
    });
  });

  // ── ExtractedEntities validation ──

  describe('ExtractedEntities validation', () => {
    it('deduplicates productNames', () => {
      const result = validator.validate({
        ...validDecision(),
        extractedEntities: { productNames: ['Cappuccino', 'Latte', 'Cappuccino'] },
      }, makeContext());
      expect(result.extractedEntities.productNames).toEqual(['Cappuccino', 'Latte']);
    });

    it('deduplicates quantities by productName', () => {
      const result = validator.validate({
        ...validDecision(),
        extractedEntities: {
          quantities: [
            { productName: 'Cappuccino', quantity: 2 },
            { productName: 'Cappuccino', quantity: 3 },
          ],
        },
      }, makeContext());
      expect(result.extractedEntities.quantities).toHaveLength(1);
      expect(result.extractedEntities.quantities![0].quantity).toBe(2);
    });

    it('clamps quantity to minimum 1', () => {
      const result = validator.validate({
        ...validDecision(),
        extractedEntities: { quantities: [{ productName: 'Cappuccino', quantity: 0 }] },
      }, makeContext());
      expect(result.extractedEntities.quantities![0].quantity).toBe(1);
    });

    it('handles non-object entities gracefully', () => {
      const result = validator.validate({ ...validDecision(), extractedEntities: 'bad' as any }, makeContext());
      expect(result.extractedEntities).toEqual({});
    });
  });

  // ── Business state overrides ──

  describe('Business state validation', () => {
    it('overrides everything to SMALL_TALK/BUSINESS_CLOSED when business is closed', () => {
      const ctx = makeContext({ business: { ...makeContext().business, workingNow: false } });
      const result = validator.validate({ ...validDecision(), intent: 'ORDER', nextAction: 'CREATE_ORDER' }, ctx);
      expect(result.intent).toBe('SMALL_TALK');
      expect(result.reasoningCode).toBe('BUSINESS_CLOSED');
      expect(result.nextAction).toBe('NO_ACTION');
      expect(result.recommendations).toEqual([]);
      expect(result.missingInformation).toEqual([]);
    });
  });

  // ── Customer state overrides ──

  describe('Customer state validation', () => {
    it('strips recommendations referencing non-existent products when no customer', () => {
      const ctx = makeContext({ customer: undefined });
      const input = validDecision();
      input.recommendations = [
        { productId: 'p1', reason: 'Popular', priority: 1 },
      ];
      const result = validator.validate(input, ctx);
      expect(result.recommendations).toHaveLength(1);
    });

    it('downgrades REORDER to UNKNOWN when no customer', () => {
      const ctx = makeContext({ customer: undefined });
      const result = validator.validate({ ...validDecision(), intent: 'REORDER' }, ctx);
      expect(result.intent).toBe('UNKNOWN');
      expect(result.reasoningCode).toBe('CUSTOMER_NOT_FOUND');
    });
  });

  // ── Active order state overrides ──

  describe('Active order state validation', () => {
    it('downgrades CANCEL_ORDER when no active order', () => {
      const ctx = makeContext({ activeOrder: undefined });
      const result = validator.validate({ ...validDecision(), intent: 'CANCEL_ORDER', nextAction: 'CONFIRM_ORDER', requiredConfirmation: true }, ctx);
      expect(result.intent).toBe('UNKNOWN');
      expect(result.nextAction).toBe('NO_ACTION');
      expect(result.requiredConfirmation).toBe(false);
    });

    it('downgrades MODIFY_ORDER to ORDER when no active order', () => {
      const ctx = makeContext({ activeOrder: undefined });
      const result = validator.validate({ ...validDecision(), intent: 'MODIFY_ORDER', nextAction: 'MODIFY_ORDER' }, ctx);
      expect(result.intent).toBe('ORDER');
      expect(result.nextAction).toBe('ASK_QUANTITY');
    });
  });

  // ── Low confidence overrides ──

  describe('Low confidence override', () => {
    it('forces UNKNOWN when confidence < 0.6', () => {
      const result = validator.validate({ ...validDecision(), confidence: 0.3, intent: 'ORDER' }, makeContext());
      expect(result.intent).toBe('UNKNOWN');
      expect(result.reasoningCode).toBe('LOW_CONFIDENCE');
    });

    it('keeps UNKNOWN intent when already UNKNOWN and low confidence', () => {
      const result = validator.validate({ ...validDecision(), confidence: 0.3, intent: 'UNKNOWN' }, makeContext());
      expect(result.intent).toBe('UNKNOWN');
    });
  });

  // ── Integration-level test: guards that no raw AI output leaks ──

  describe('Safety guard', () => {
    it('never returns raw AI with missing fields', () => {
      const dangerouslyMinimal = { intent: 'ORDER' };
      const result = validator.validate(dangerouslyMinimal, makeContext());
      expect(result.confidence).toBeDefined();
      expect(result.requiredConfirmation).toBeDefined();
      expect(result.missingInformation).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.nextAction).toBeDefined();
      expect(result.structuredReplyData).toBeDefined();
      expect(result.extractedEntities).toBeDefined();
      expect(result.reasoningCode).toBeDefined();
    });

    it('never throws regardless of input shape', () => {
      const inputs = [null, undefined, '', 0, false, {}, { intent: null }, { intent: 'BAD' }, { confidence: 'NaN' }, { recommendations: 'string' }, { missingInformation: 'string' }, { structuredReplyData: 42 }, { extractedEntities: true }];
      const ctx = makeContext();
      for (const input of inputs) {
        expect(() => validator.validate(input, ctx)).not.toThrow();
      }
    });
  });

  // ── Full pipeline from commerce-brain.service ──

  describe('Full pipeline with CommerceBrainService', () => {
    it('routes through validator (integration test with mocked deps)', async () => {
      const { CommerceBrainService } = await import('./commerce-brain.service');
      const { DeepSeekIntegrationService } = await import('./deepseek-integration.service');
      const { LocalDecisionEngine } = await import('./local-decision-engine');
      const { Test } = await import('@nestjs/testing');

      const deepSeek = { decide: jest.fn().mockResolvedValue(null) };
      const localEngine = { decide: jest.fn().mockReturnValue(validDecision()) };

      const module = await Test.createTestingModule({
        providers: [
          CommerceBrainService,
          DecisionValidatorService,
          { provide: DeepSeekIntegrationService, useValue: deepSeek },
          { provide: LocalDecisionEngine, useValue: localEngine },
        ],
      }).compile();

      const brain = module.get(CommerceBrainService);
      const result = await brain.decide('Cappuccino', makeContext());
      expect(result.intent).toBe('ORDER');
      expect(result.confidence).toBe(0.95);
      expect(result.recommendations).toHaveLength(1);
    });
  });
});
