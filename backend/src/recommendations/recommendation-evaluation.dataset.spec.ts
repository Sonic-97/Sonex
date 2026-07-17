import { RECOMMENDATION_EVALUATION_DATASET } from './recommendation-evaluation.dataset';

describe('Egyptian Arabic recommendation evaluation dataset', () => {
  it('covers every required high-risk scenario', () => {
    expect(RECOMMENDATION_EVALUATION_DATASET).toHaveLength(17);
    expect(RECOMMENDATION_EVALUATION_DATASET.map((item) => item.id)).toEqual(expect.arrayContaining([
      'size-upgrade-accepted',
      'size-upgrade-rejected',
      'customer-opt-out',
      'price-sensitive',
      'favorite-unavailable',
      'complaint-state',
      'foreign-cafe-product',
      'repeated-suggestion',
      'multi-item-order',
      'contextual-no',
      'reject-and-modify',
    ]));
  });

  it('provides deterministic allowed and forbidden candidate sets', () => {
    for (const item of RECOMMENDATION_EVALUATION_DATASET) {
      expect(Array.isArray(item.allowedCandidates)).toBe(true);
      expect(Array.isArray(item.forbiddenCandidates)).toBe(true);
      expect(item.expectedStateAfter).toBeTruthy();
    }
  });

  it('uses real Egyptian Arabic customer messages', () => {
    const messages = RECOMMENDATION_EVALUATION_DATASET.map((item) => item.customerMessage).join(' ');
    expect(messages).toContain('اقترحلي');
    expect(messages).toContain('لا');
    expect(messages).toContain('من غير اقتراحات');
  });
});
