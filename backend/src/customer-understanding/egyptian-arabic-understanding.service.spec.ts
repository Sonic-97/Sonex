import { EgyptianArabicUnderstandingService } from './egyptian-arabic-understanding.service';

describe('EgyptianArabicUnderstandingService', () => {
  const service = new EgyptianArabicUnderstandingService();
  const morning = new Date('2026-07-13T08:00:00+02:00');

  it.each([
    ['عايز حاجة تفوقني', 'ENERGY_REQUEST'],
    ['عايز حاجة تروقني', 'MOOD_IMPROVEMENT_REQUEST'],
    ['عايز حاجة ساقعة ومش مسكرة', 'COLD_DRINK_REQUEST'],
    ['هات المعتاد', 'REPEAT_USUAL_ORDER'],
    ['عايز حاجة جديدة', 'NEW_PRODUCT_REQUEST'],
    ['عايز فطار خفيف', 'BREAKFAST_REQUEST'],
    ['عايز حاجة حلوة', 'SWEET_REQUEST'],
    ['عايز مشروب تقيل', 'STRONG_DRINK_REQUEST'],
    ['رشحلي حاجة', 'EXPLORATION_REQUEST'],
    ['مش عارف اختار', 'HELP_ME_CHOOSE'],
    ['الطلب يوصل حالا', 'URGENT_DELIVERY_REQUEST'],
    ['عايز حد من الكافيه', 'HUMAN_ASSISTANCE'],
    ['الطلب غلط وانا زعلان', 'COMPLAINT'],
    ['بكره الساعة 9', 'SCHEDULED_ORDER'],
    ['لينا كلنا في المكتب', 'GROUP_ORDER_REQUEST'],
  ])('classifies %s', (message, intent) => {
    expect(service.extract(message).primaryIntent).toBe(intent);
  });

  it('extracts cold and low sugar together', () => {
    expect(service.extract('عايز حاجة ساقعة ومش مسكرة')).toMatchObject({ temperature: 'COLD', sweetness: 'LOW' });
  });

  it.each([
    ['تحت 100', 100],
    ['معايا 70 جنيه', 70],
    ['في حدود خمسين', 50],
    ['budget under 200', 200],
  ])('extracts budget from %s', (message, budgetMax) => {
    expect(service.extract(message).budgetMax).toBe(budgetMax);
  });

  it('detects urgency and fast style', () => {
    expect(service.extract('عايز حاجة على السريع')).toMatchObject({ urgency: 'HIGH', conversationStyle: 'FAST' });
  });

  it('uses the last question for a short temperature answer', () => {
    expect(service.extract('ساقعة', { lastBotQuestion: 'temperature' })).toMatchObject({ temperature: 'COLD' });
  });

  it('does not infer breakfast from morning time alone', () => {
    expect(service.extract('رشحلي مشروب', { now: morning }).food).toBe('NONE');
  });

  it('activates morning fast mode for an explicit energy need', () => {
    expect(service.extract('عايز حاجة تفوقني', { now: morning }).morningFastMode).toBe(true);
  });

  it('normalizes Arabic digits and spelling variants', () => {
    expect(service.extract('عايز حاجة ساقعة تحت ١٠٠')).toMatchObject({ temperature: 'COLD', budgetMax: 100 });
  });

  it('understands mixed Arabic and English', () => {
    expect(service.extract('عايز cold drink low sugar under 100')).toMatchObject({ temperature: 'COLD', sweetness: 'LOW', budgetMax: 100 });
  });

  it('keeps an unclear phrase low confidence', () => {
    const result = service.extract('الحكاية اللي في دماغي');
    expect(result.primaryIntent).toBe('UNKNOWN_NEED');
    expect(result.confidenceLevel).toBe('LOW');
  });

  it('treats shop text as neither customer identity nor a deep need', () => {
    expect(service.extract('وصل عند كافيه النور').primaryIntent).toBe('UNKNOWN_NEED');
  });
});
