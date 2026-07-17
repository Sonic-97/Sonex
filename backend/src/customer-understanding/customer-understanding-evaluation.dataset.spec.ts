import { CUSTOMER_UNDERSTANDING_EVALUATION_DATASET } from './customer-understanding-evaluation.dataset';
import { EgyptianArabicUnderstandingService } from './egyptian-arabic-understanding.service';

describe('Stage 7 Egyptian Arabic evaluation dataset', () => {
  const service = new EgyptianArabicUnderstandingService();

  it('contains all required realistic scenarios', () => {
    expect(CUSTOMER_UNDERSTANDING_EVALUATION_DATASET).toHaveLength(17);
    expect(new Set(CUSTOMER_UNDERSTANDING_EVALUATION_DATASET.map((item) => item.id)).size).toBe(17);
  });

  it.each(CUSTOMER_UNDERSTANDING_EVALUATION_DATASET)(
    '$id extracts the expected primary intent and need',
    (testCase) => {
      const result = service.extract(testCase.message, { now: new Date('2026-07-13T08:00:00+02:00') });
      expect(result.primaryIntent).toBe(testCase.expectedPrimaryIntent);
      expect(result).toMatchObject(testCase.expectedNeed);
      expect(testCase.forbiddenActions.length).toBeGreaterThan(0);
      expect(testCase.acceptableReplyCharacteristics.length).toBeGreaterThan(0);
    },
  );
});
