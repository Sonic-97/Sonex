import { FORECAST_EVALUATION_DATASET, FORECAST_EVALUATION_DATASET_VERSION } from './forecasting-evaluation.dataset';

describe('Stage 5 versioned forecasting evaluation dataset', () => {
  it('has an explicit version', () => expect(FORECAST_EVALUATION_DATASET_VERSION).toBe('stage5-eval-v1'));
  it('contains at least fifteen required cases', () => expect(FORECAST_EVALUATION_DATASET.length).toBeGreaterThanOrEqual(15));

  it.each(FORECAST_EVALUATION_DATASET)('$id has tenant context and uncertainty policy', (testCase) => {
    expect(testCase.authenticatedContext.cafeId).toBeTruthy();
    expect(testCase.authenticatedContext.allowedBranchIds.length).toBeGreaterThan(0);
    expect(testCase.forbiddenClaims).toContain('guaranteed outcome');
    expect(testCase.acceptableResponseCharacteristics).toContain('read-only');
  });

  it('covers every mandatory edge scenario', () => {
    const ids = new Set(FORECAST_EVALUATION_DATASET.map((row) => row.id));
    ['sufficient-daily-sales', 'insufficient-daily-sales', 'missing-days', 'closed-branch', 'partial-current-day', 'stockout-distortion', 'new-product', 'price-change', 'discount-period', 'unusual-event', 'branch-comparison', 'cross-tenant-attempt', 'low-confidence', 'provider-failure', 'candidate-worse-than-baseline'].forEach((id) => expect(ids.has(id)).toBe(true));
  });
});

