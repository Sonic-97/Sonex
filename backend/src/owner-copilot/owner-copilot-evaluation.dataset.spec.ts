import { OWNER_COPILOT_EVALUATION_DATASET, OWNER_COPILOT_EVALUATION_DATASET_VERSION } from './owner-copilot-evaluation.dataset';
import { OwnerCopilotUnderstandingService } from './owner-copilot-understanding.service';
import { OwnerCopilotContextState } from './owner-copilot.types';

describe('Owner Copilot Stage 4 evaluation dataset', () => {
  const understanding = new OwnerCopilotUnderstandingService();
  const now = new Date('2026-07-13T09:00:00Z');

  it('is versioned and covers all required scenarios', () => {
    expect(OWNER_COPILOT_EVALUATION_DATASET_VERSION).toBe('owner-copilot-stage4-v1');
    const scenarios = OWNER_COPILOT_EVALUATION_DATASET.map((item) => item.scenario);
    expect(scenarios).toEqual(expect.arrayContaining([
      'today sales', 'net profit decline', 'branch comparison', 'insufficient finance permission',
      'foreign cafe request', 'write action request', 'ambiguous question', 'prompt injection',
      'provider failure fallback', 'unavailable data', 'follow-up changes branch',
    ]));
  });

  it.each(OWNER_COPILOT_EVALUATION_DATASET)('classifies $id as $expectedIntent', (testCase) => {
    let previous: OwnerCopilotContextState | undefined;
    if (testCase.previousIntent) {
      const first = understanding.classify('المبيعات الأسبوع ده؟', 'Africa/Cairo', now);
      previous = {
        cafeId: testCase.authenticatedContext.cafeId,
        userId: 'owner-1',
        intent: testCase.previousIntent,
        dateRange: first.dateRange,
        selectedBranchIds: [testCase.authenticatedContext.allowedBranchIds[0]],
        selectedBranchNames: ['الرئيسي'],
        comparison: 'NONE',
        updatedAt: Date.now(),
      };
    }
    const result = understanding.classify(testCase.question, 'Africa/Cairo', now, previous);
    expect(result.intent).toBe(testCase.expectedIntent);
    if (testCase.expectedDateRange.type) expect(result.dateRange.type).toBe(testCase.expectedDateRange.type);
    if (testCase.expectedOutcome === 'DENIED' && testCase.scenario !== 'insufficient finance permission') {
      expect(result.securityViolation || result.writeActionRequested).toBeTruthy();
    }
  });

  it('contains no write or arbitrary SQL tool in expected tool lists', () => {
    const tools = OWNER_COPILOT_EVALUATION_DATASET.flatMap((testCase) => testCase.expectedTools);
    expect(tools.some((tool) => /create|update|delete|execute|sql|send/i.test(tool))).toBe(false);
  });
});
