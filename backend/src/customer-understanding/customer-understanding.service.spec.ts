import { ClarificationPolicyService } from './clarification-policy.service';
import { CustomerUnderstandingService } from './customer-understanding.service';
import { EgyptianArabicUnderstandingService } from './egyptian-arabic-understanding.service';
import { NeedRecommendation, emptyCustomerNeed } from './customer-need.types';

describe('CustomerUnderstandingService', () => {
  const prisma: any = {
    staff: { findFirst: jest.fn() },
    notification: { create: jest.fn() },
  };
  const recommendation: NeedRecommendation = {
    productId: 'p1', productName: 'آيس أمريكانو', category: 'coffee', categoryId: 'cat-1', unitPrice: 60,
    deliveryFee: 0, finalPrice: 60, currency: 'EGP', tags: ['COLD', 'LOW_SUGAR'], matchedTags: ['COLD'],
    reason: 'ساقع', score: 10,
  };
  const mapper: any = { find: jest.fn(), revalidate: jest.fn() };
  let service: CustomerUnderstandingService;

  beforeEach(() => {
    jest.clearAllMocks();
    mapper.find.mockResolvedValue([recommendation]);
    mapper.revalidate.mockResolvedValue(recommendation);
    prisma.staff.findFirst.mockResolvedValue(null);
    prisma.notification.create.mockResolvedValue({ id: 'n1' });
    service = new CustomerUnderstandingService(
      prisma,
      new EgyptianArabicUnderstandingService(),
      new ClarificationPolicyService(),
      mapper,
    );
  });

  const input = (message: string, extra: Record<string, unknown> = {}) => ({
    cafeId: 'cafe-a', branchId: 'branch-a', customerId: 'customer-a', channel: 'TELEGRAM' as const,
    channelIdentity: 'tg_1', message, now: new Date('2026-07-13T08:00:00+02:00'), ...extra,
  });

  it('lets an explicit direct product request pass to the existing order logic', async () => {
    expect(await service.understand(input('لاتيه كبير'))).toMatchObject({ handled: false, action: 'PASS_THROUGH' });
  });

  it('asks one clarification for a vague low-confidence request', async () => {
    const result = await service.understand(input('هاتلي الحكاية اللي في دماغي'));
    expect(result).toMatchObject({ handled: true, action: 'ASK_CLARIFICATION' });
    expect(result.clarification?.field).toBe('requestType');
  });

  it('current request overrides conflicting memory', async () => {
    await service.understand(input('عايز حاجة ساقعة ومش مسكرة', {
      memory: { temperature: 'HOT', sweetness: 'HIGH' },
    }));
    expect(mapper.find).toHaveBeenCalledWith('cafe-a', 'branch-a', expect.objectContaining({
      temperature: 'COLD', sweetness: 'LOW', currentOverrides: expect.arrayContaining(['temperature', 'sweetness']),
    }), expect.any(Object));
  });

  it('morning energy mode reaches options without an optional question', async () => {
    const result = await service.understand(input('عايز حاجة تفوقني'));
    expect(result.action).toBe('SEARCH_RELEVANT_PRODUCTS');
    expect(result.need.morningFastMode).toBe(true);
  });

  it('a non-morning energy request asks temperature once', async () => {
    const result = await service.understand(input('عايز حاجة تفوقني', { now: new Date('2026-07-13T15:00:00+02:00') }));
    expect(result).toMatchObject({ action: 'ASK_CLARIFICATION', clarification: { field: 'temperature' } });
  });

  it('does not recommend or upsell during a complaint', async () => {
    const result = await service.understand(input('الطلب غلط وانا زعلان'));
    expect(result.action).toBe('ACKNOWLEDGE_COMPLAINT');
    expect(result.recommendations).toEqual([]);
    expect(mapper.find).not.toHaveBeenCalled();
  });

  it('creates a real handoff notification only when a barista is available', async () => {
    prisma.staff.findFirst.mockResolvedValue({ id: 'staff-1' });
    const result = await service.understand(input('عايز حد من الكافيه'));
    expect(result.action).toBe('HUMAN_HANDOFF_CREATED');
    expect(prisma.notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ cafeId: 'cafe-a', branchId: 'branch-a', roleTarget: 'BARISTA' }),
    }));
  });

  it('does not claim human availability when no barista is confirmed', async () => {
    const result = await service.understand(input('عايز حد من الكافيه'));
    expect(result.handoffAvailable).toBe(false);
    expect(result.reply).toContain('مفيش موظف متاح مؤكد');
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('stops clarifying after two questions and searches with known constraints', async () => {
    const draft = { ...emptyCustomerNeed(), primaryIntent: 'HELP_ME_CHOOSE' as const, intents: ['HELP_ME_CHOOSE' as const], confidence: 0.8, confidenceLevel: 'HIGH' as const };
    const result = await service.understand(input('مش فارقة', { draftNeed: draft, clarificationCount: 2 }));
    expect(result.action).toBe('SEARCH_RELEVANT_PRODUCTS');
    expect(mapper.find).toHaveBeenCalled();
  });

  it('never asks a known constraint again across turns', async () => {
    const draft = { ...emptyCustomerNeed(), primaryIntent: 'ENERGY_REQUEST' as const, intents: ['ENERGY_REQUEST' as const], temperature: 'COLD' as const, confidence: 0.9, confidenceLevel: 'HIGH' as const };
    const result = await service.understand(input('مش مسكرة', { draftNeed: draft, clarificationCount: 1, lastBotQuestion: 'temperature' }));
    expect(result.clarification?.field).not.toBe('temperature');
  });

  it('scopes product search to the current cafe and branch', async () => {
    await service.understand(input('عايز حاجة ساقعة'));
    expect(mapper.find).toHaveBeenCalledWith('cafe-a', 'branch-a', expect.any(Object), expect.any(Object));
  });

  it('revalidates price and availability before selection', async () => {
    await service.revalidateRecommendation('cafe-a', 'branch-a', recommendation, 100);
    expect(mapper.revalidate).toHaveBeenCalledWith('cafe-a', 'branch-a', recommendation, 100);
  });

  it('keeps metrics tenant scoped and privacy safe', () => {
    service.recordProductSelection('cafe-a', { ...emptyCustomerNeed(), urgency: 'HIGH' }, 2);
    expect(service.getMetrics('cafe-a')).toMatchObject({ productSelections: 1, tenantScope: 'cafe-a', urgencyResponseSuccess: 1 });
    expect(service.getMetrics('cafe-b')).toMatchObject({ productSelections: 0, tenantScope: 'cafe-b' });
  });

  it('records repeat-order success separately', () => {
    service.recordUsualOrderSuccess('cafe-a');
    const metrics = service.getMetrics('cafe-a');
    expect(metrics.tenantScope).toBe('cafe-a');
  });
});
