import { Test, TestingModule } from '@nestjs/testing';
import { CommerceBrainService } from './commerce-brain.service';
import { DeepSeekIntegrationService } from './deepseek-integration.service';
import { LocalDecisionEngine } from './local-decision-engine';
import { DecisionValidatorService } from './decision-validator.service';
import { CommerceContext } from './commerce-brain.types';

const mockBusinessContext = {
  id: 'cafe-1', name: 'Test Cafe', businessType: 'cafe',
  language: 'ar-EG', timezone: 'Africa/Cairo',
  personality: 'friendly', greetingStyle: 'casual',
  workingNow: true, deliveryAvailable: true, pickupAvailable: true,
  promotionEnabled: true,
};

const mockContext: CommerceContext = {
  business: mockBusinessContext,
  conversation: { currentStep: 'NEW', collectedInformation: {}, missingInformation: [] },
  catalog: {
    totalCount: 3,
    products: [
      { productId: 'p1', name: 'Cappuccino', category: 'coffee', available: true, variants: [{ name: 'Small', type: 'size' }], requiredOptions: [], optionalOptions: [] },
      { productId: 'p2', name: 'Latte', category: 'coffee', available: true, variants: [{ name: 'Large', type: 'size' }], requiredOptions: [{ name: 'Sugar Level', choices: ['No', 'Medium', 'Extra'] }], optionalOptions: [] },
      { productId: 'p3', name: 'Croissant', category: 'pastry', available: true, variants: [], requiredOptions: [], optionalOptions: [] },
    ],
  },
};

function createDeepSeekMock() {
  return { decide: jest.fn() };
}

function createLocalMock() {
  return { decide: jest.fn() };
}

function createValidatorMock() {
  return { validate: jest.fn((d: any) => d) };
}

describe('CommerceBrainService', () => {
  let service: CommerceBrainService;
  let deepSeek: ReturnType<typeof createDeepSeekMock>;
  let localEngine: ReturnType<typeof createLocalMock>;
  let validator: ReturnType<typeof createValidatorMock>;

  async function buildService() {
    deepSeek = createDeepSeekMock();
    localEngine = createLocalMock();
    validator = createValidatorMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommerceBrainService,
        { provide: DeepSeekIntegrationService, useValue: deepSeek },
        { provide: LocalDecisionEngine, useValue: localEngine },
        { provide: DecisionValidatorService, useValue: validator },
      ],
    }).compile();
    return module.get<CommerceBrainService>(CommerceBrainService);
  }

  describe('Empty message', () => {
    beforeEach(async () => { service = await buildService(); });

    it('returns UNKNOWN with 0 confidence for empty message', async () => {
      const result = await service.decide('', mockContext);
      expect(result.intent).toBe('UNKNOWN');
      expect(result.confidence).toBe(0);
      expect(result.reasoningCode).toBe('AMBIGUOUS_INTENT');
    });

    it('returns UNKNOWN for whitespace-only message', async () => {
      const result = await service.decide('   ', mockContext);
      expect(result.intent).toBe('UNKNOWN');
      expect(result.confidence).toBe(0);
    });
  });

  describe('Business closed', () => {
    beforeEach(async () => {
      deepSeek = createDeepSeekMock();
      localEngine = createLocalMock();
      validator = createValidatorMock();
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CommerceBrainService,
          { provide: DeepSeekIntegrationService, useValue: deepSeek },
          { provide: LocalDecisionEngine, useValue: localEngine },
          { provide: DecisionValidatorService, useValue: validator },
        ],
      }).compile();
      service = module.get<CommerceBrainService>(CommerceBrainService);
    });

    it('returns BUSINESS_CLOSED without calling DeepSeek or local', async () => {
      const result = await service.decide('Cappuccino', { ...mockContext, business: { ...mockBusinessContext, workingNow: false } });
      expect(result.reasoningCode).toBe('BUSINESS_CLOSED');
      expect(result.confidence).toBe(0.95);
      expect(deepSeek.decide).not.toHaveBeenCalled();
      expect(localEngine.decide).not.toHaveBeenCalled();
    });
  });

  describe('High confidence AI decision', () => {
    beforeEach(async () => {
      service = await buildService();
      deepSeek.decide.mockResolvedValue({
        intent: 'ORDER', confidence: 0.95, requiredConfirmation: false,
        missingInformation: [], recommendations: [],
        nextAction: 'ASK_QUANTITY',
        structuredReplyData: { bodyKey: 'order.how_many', variables: { productName: 'Cappuccino' } },
        extractedEntities: { productNames: ['Cappuccino'] },
        reasoningCode: 'CONTINUE_CONVERSATION',
      });
    });

    it('returns AI decision when confidence >= 0.90', async () => {
      const result = await service.decide('I want a Cappuccino', mockContext);
      expect(result.intent).toBe('ORDER');
      expect(result.confidence).toBe(0.95);
      expect(result.nextAction).toBe('ASK_QUANTITY');
      expect(deepSeek.decide).toHaveBeenCalledTimes(1);
      expect(localEngine.decide).not.toHaveBeenCalled();
    });
  });

  describe('Medium confidence AI decision', () => {
    beforeEach(async () => {
      deepSeek = createDeepSeekMock();
      localEngine = createLocalMock();
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CommerceBrainService,
          { provide: DeepSeekIntegrationService, useValue: deepSeek },
          { provide: LocalDecisionEngine, useValue: localEngine },
          DecisionValidatorService,
        ],
      }).compile();
      service = module.get<CommerceBrainService>(CommerceBrainService);
      deepSeek.decide.mockResolvedValue({
        intent: 'ORDER', confidence: 0.75, requiredConfirmation: false,
        missingInformation: [{ field: 'size', required: true, choices: ['Small', 'Large'] }],
        recommendations: [],
        nextAction: 'ASK_OPTION',
        structuredReplyData: { bodyKey: 'order.choose_size' },
        extractedEntities: { productNames: ['Cappuccino'] },
        reasoningCode: 'OPTION_REQUIRED',
      });
    });

    it('returns AI decision with clarify button when confidence 0.60-0.89', async () => {
      const result = await service.decide('I want a drink', mockContext);
      expect(result.intent).toBe('ORDER');
      expect(result.confidence).toBe(0.75);
      expect(result.structuredReplyData.buttonIds).toContain('clarify_more');
      expect(localEngine.decide).not.toHaveBeenCalled();
    });
  });

  describe('AI failure fallback', () => {
    beforeEach(async () => {
      service = await buildService();
      deepSeek.decide.mockResolvedValue(null);
      localEngine.decide.mockReturnValue({
        intent: 'SMALL_TALK', confidence: 0.9, requiredConfirmation: false,
        missingInformation: [], recommendations: [],
        nextAction: 'NO_ACTION',
        structuredReplyData: { bodyKey: 'greeting.response' },
        extractedEntities: {},
        reasoningCode: 'CONTINUE_CONVERSATION',
      });
    });

    it('falls back to LocalDecisionEngine when DeepSeek returns null', async () => {
      const result = await service.decide('Hello', mockContext);
      expect(result.intent).toBe('SMALL_TALK');
      expect(localEngine.decide).toHaveBeenCalledTimes(1);
    });
  });

  describe('Low confidence AI decision fallback', () => {
    beforeEach(async () => {
      service = await buildService();
      deepSeek.decide.mockResolvedValue({
        intent: 'UNKNOWN', confidence: 0.4, requiredConfirmation: false,
        missingInformation: [], recommendations: [],
        nextAction: 'NO_ACTION',
        structuredReplyData: { bodyKey: 'unknown.response' },
        extractedEntities: {},
        reasoningCode: 'AMBIGUOUS_INTENT',
      });
      localEngine.decide.mockReturnValue({
        intent: 'ORDER', confidence: 0.7, requiredConfirmation: false,
        missingInformation: [],
        recommendations: [{ productId: 'p1', reason: 'Popular', priority: 1 }],
        nextAction: 'ASK_QUANTITY',
        structuredReplyData: { bodyKey: 'order.how_many' },
        extractedEntities: { productNames: ['Cappuccino'] },
        reasoningCode: 'CONTINUE_CONVERSATION',
      });
    });

    it('uses local engine when AI confidence < 0.60', async () => {
      const result = await service.decide('I want coffee', mockContext);
      expect(result.intent).toBe('ORDER');
      expect(localEngine.decide).toHaveBeenCalledTimes(1);
    });
  });
});
