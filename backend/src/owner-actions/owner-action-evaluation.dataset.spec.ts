import { OWNER_ACTION_EVALUATION_CASES, OWNER_ACTION_EVALUATION_DATASET_VERSION } from './owner-action-evaluation.dataset';
import { OwnerActionPolicyService } from './owner-action-policy.service';
import { OWNER_ACTION_TYPES } from './owner-action.types';

describe('Stage 6 versioned owner action evaluation dataset', () => {
  const policy = new OwnerActionPolicyService();

  it('has a stable version and the required domain scenarios', () => {
    expect(OWNER_ACTION_EVALUATION_DATASET_VERSION).toBe('stage-6-actions-v1');
    expect(OWNER_ACTION_EVALUATION_CASES).toHaveLength(35);
  });

  it('uses unique case ids', () => {
    expect(new Set(OWNER_ACTION_EVALUATION_CASES.map((testCase) => testCase.id)).size).toBe(35);
  });

  it.each(OWNER_ACTION_EVALUATION_CASES)('$id has deterministic safety metadata', (testCase) => {
    expect(testCase.ownerMessage.length).toBeGreaterThan(3);
    expect(testCase.expectedSafetyOutcome.length).toBeGreaterThan(4);
    expect(testCase.forbiddenToolsBeforeApproval).toEqual(expect.any(Array));
    if (OWNER_ACTION_TYPES.includes(testCase.expectedIntent as any) && testCase.expectedRiskLevel) {
      expect(policy.definition(testCase.expectedIntent as any).risk).toBe(testCase.expectedRiskLevel);
    }
    if (testCase.expectedExecutionAfterApproval) expect(testCase.approvalRequired).toBe(true);
  });
});

