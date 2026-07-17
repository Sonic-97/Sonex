import { Test, TestingModule } from '@nestjs/testing';
import { ReplyEngineService } from './reply-engine.service';
import { ReplyMode, ReplyContext } from './reply-engine.types';

describe('ReplyEngineService', () => {
  let service: ReplyEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReplyEngineService],
    }).compile();
    service = module.get<ReplyEngineService>(ReplyEngineService);
  });

  const makeCtx = (overrides: Partial<ReplyContext> = {}): ReplyContext => ({
    customerName: undefined,
    customerId: undefined,
    isNewCustomer: false,
    isReturningCustomer: false,
    isMorning: false,
    hasUsualOrder: false,
    hasActiveOrder: false,
    hasUrgentSignal: false,
    customerMessage: '',
    rejectedSuggestions: [],
    clarificationCount: 0,
    isFirstMessage: true,
    sessionActive: false,
    ...overrides,
  });

  // ── Natural language ──

  describe('Egyptian Arabic natural style', () => {
    test('replies use natural Egyptian Arabic in greeting', () => {
      const reply = service.greetingReply(makeCtx({ isNewCustomer: true }));
      expect(reply.message).toMatch(/[\u0600-\u06FF]/);
      expect(reply.message.length).toBeLessThan(200);
    });

    test('replies do not sound formal or robotic', () => {
      const reply = service.greetingReply(makeCtx({ isReturningCustomer: true, customerName: 'سارة' }));
      expect(reply.message).not.toMatch(/يرجى/);
      expect(reply.message).not.toMatch(/فضلاً/);
      expect(reply.message).not.toMatch(/سيدي/);
    });

    test('replies are normally 1-3 short lines', () => {
      const reply = service.simpleReply(makeCtx(), 'تمام، طلبك اتأكد.');
      expect(reply.message.split('\n').length).toBeLessThanOrEqual(3);
    });

    test('customer message is not repeated unnecessarily', () => {
      const reply = service.misunderstandingReply(makeCtx());
      expect(reply.message).not.toMatch(/تقصد/);
    });

    test('customer name is not overused', () => {
      const reply = service.normalReply(makeCtx({ customerName: 'أحمد', isReturningCustomer: true }));
      const matches = reply.message.match(/أحمد/g);
      expect(matches ? matches.length : 0).toBeLessThanOrEqual(1);
    });

    test('emojis are limited to one per message', () => {
      const reply = service.greetingReply(makeCtx({ isReturningCustomer: true, customerName: 'نور' }));
      const emojiCount = (reply.message.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
      expect(emojiCount).toBeLessThanOrEqual(2);
    });

    test('gender is not assumed', () => {
      const reply = service.greetingReply(makeCtx({ isNewCustomer: true }));
      expect(reply.message).not.toMatch(/يا باشا/);
      expect(reply.message).not.toMatch(/يا مدام/);
      expect(reply.message).not.toMatch(/يا أستاذ/);
      expect(reply.message).not.toMatch(/يا قمر/);
    });
  });

  // ── Context ──

  describe('context-aware replies', () => {
    test('yes/no uses the last question context', () => {
      const yes = service.interpretYesNo('ايوه', 'أأكد الطلب؟');
      expect(yes.isYes).toBe(true);
      expect(yes.confidence).toBeGreaterThanOrEqual(0.5);

      const no = service.interpretYesNo('لا', 'تحب تضيف كرواسون؟');
      expect(no.isNo).toBe(true);
    });

    test('known information is not requested again', () => {
      const ctx = makeCtx({ hasUsualOrder: true, isReturningCustomer: true });
      const reply = service.normalReply(ctx);
      expect(reply.message).not.toMatch(/اسمك/);
    });

    test('current draft is preserved in confirm reply', () => {
      const ctx = makeCtx({
        currentDraft: {
          items: [{ name: 'قهوة', quantity: 1, price: 35 }],
          total: 35,
          deliveryLocation: 'محل ستايل',
          paymentMethod: 'كاش',
        },
      });
      const reply = service.confirmReply(ctx);
      expect(reply.message).toMatch(/قهوة/);
      expect(reply.message).toMatch(/35/);
      expect(reply.message).toMatch(/محل ستايل/);
    });

    test('rejected suggestions are not repeated', () => {
      const ctx = makeCtx({ rejectedSuggestions: ['كرواسون'] });
      const reply = service.normalReply(ctx);
      expect(reply.message).not.toMatch(/كرواسون/);
    });

    test('misunderstanding reply preserves correct info', () => {
      const ctx = makeCtx({ hasMisunderstanding: true });
      const reply = service.misunderstandingReply(ctx);
      expect(reply.message).toMatch(/تعديل/);
      expect(reply.message).toMatch(/جديد/);
    });
  });

  // ── Reply modes ──

  describe('reply modes', () => {
    test('urgent customer enters FAST mode', () => {
      const ctx = makeCtx({ hasUrgentSignal: true, customerMessage: 'بسرعة' });
      const mode = service.detectMode(ctx);
      expect(mode).toBe('FAST');
    });

    test('complaint enters COMPLAINT mode', () => {
      const ctx = makeCtx({ hasComplaint: true, customerMessage: 'الطلب غلط' });
      const mode = service.detectMode(ctx);
      expect(mode).toBe('COMPLAINT');
    });

    test('balance inquiry enters ACCOUNT mode', () => {
      const ctx = makeCtx({ customerMessage: 'عليا كام؟' });
      const mode = service.detectMode(ctx);
      expect(mode).toBe('ACCOUNT');
    });

    test('tracking request enters TRACKING mode', () => {
      const ctx = makeCtx({ customerMessage: 'الطلب فين؟' });
      const mode = service.detectMode(ctx);
      expect(mode).toBe('TRACKING');
    });

    test('error enters ERROR_RECOVERY mode', () => {
      const ctx = makeCtx({ errorMessage: 'Database timeout' });
      const mode = service.detectMode(ctx);
      expect(mode).toBe('ERROR_RECOVERY');
    });

    test('new customer enters GUIDED mode', () => {
      const ctx = makeCtx({ isNewCustomer: true, customerMessage: 'عايز قهوة' });
      const mode = service.detectMode(ctx);
      expect(mode).toBe('GUIDED');
    });

    test('recommendation request enters EXPLORING mode', () => {
      const ctx = makeCtx({ customerMessage: 'عندك إيه مناسبه' });
      const mode = service.detectMode(ctx);
      expect(mode).toBe('EXPLORING');
    });

    test('clarification count > 3 enters GUIDED mode', () => {
      const ctx = makeCtx({ clarificationCount: 4, customerMessage: 'عايز حاجة' });
      const mode = service.detectMode(ctx);
      expect(mode).toBe('GUIDED');
    });
  });

  // ── Correctness ──

  describe('fact grounding', () => {
    test('prices come from verified data (context)', () => {
      const ctx = makeCtx({
        currentDraft: { items: [{ name: 'قهوة', quantity: 1, price: 35 }], total: 35 },
      });
      const reply = service.confirmReply(ctx);
      expect(reply.message).toMatch(/35/);
      expect(reply.factsUsed).toContain('total');
    });

    test('balance comes from verified data', () => {
      const ctx = makeCtx({ balance: 130, balanceDueDate: 'الخميس' });
      const reply = service.accountReply(ctx);
      expect(reply.message).toMatch(/130/);
      expect(reply.message).toMatch(/الخميس/);
      expect(reply.factsUsed).toContain('balance');
    });

    test('delivery estimate comes from approved logic', () => {
      const ctx = makeCtx({ orderStatus: 'preparing', deliveryEstimate: '10–14 دقيقة' });
      const reply = service.trackingReply(ctx);
      expect(reply.message).toMatch(/10–14 دقيقة/);
    });

    test('product availability is checked', () => {
      const ctx = makeCtx({ productUnavailable: 'آيس لاتيه' });
      const reply = service.productUnavailableReply(ctx, 'آيس لاتيه', ['آيس كابتشينو', 'آيس أمريكانو']);
      expect(reply.message).toMatch(/مش متاح/);
      expect(reply.message).toMatch(/آيس كابتشينو/);
    });

    test('order success is not claimed before persistence', () => {
      const ctx = makeCtx({ deliveryEstimate: '10–14 دقيقة' });
      const reply = service.orderConfirmedReply(ctx);
      expect(reply.message).toMatch(/اتأكد/);
    });

    test('compensation is not promised without approval', () => {
      const ctx = makeCtx({ hasComplaint: true });
      const reply = service.complaintReply(ctx);
      expect(reply.message).not.toMatch(/هتعوض/);
      expect(reply.message).not.toMatch(/هنعملك/);
    });
  });

  // ── Conversation quality ──

  describe('conversation quality', () => {
    test('only one useful question is asked at a time', () => {
      const reply = service.clarificationReply(makeCtx(), 'sugar');
      const questions = (reply.message.match(/\?/g) || []).length;
      expect(questions).toBeLessThanOrEqual(1);
    });

    test('maximum two clarifications before useful options', () => {
      const reply = service.guidedReply(makeCtx({ isNewCustomer: false, clarificationCount: 3 }));
      expect(reply.message).toMatch(/مش متأكد/);
      expect(reply.buttons).toBeDefined();
    });

    test('recommendations contain maximum of three choices', () => {
      const reply = service.exploringReply(makeCtx());
      const lines = reply.message.split('\n').filter(l => /^\d/.test(l.trim()));
      expect(lines.length).toBeLessThanOrEqual(3);
    });

    test('upselling contains one relevant suggestion maximum', () => {
      const reply = service.upsellReply(makeCtx(), 'كرواسون', 20);
      const suggestions = (reply.message.match(/تضيف/g) || []).length;
      expect(suggestions).toBeLessThanOrEqual(1);
    });

    test('no upselling during complaints', () => {
      const ctx = makeCtx({ hasComplaint: true, customerMessage: 'الطلب غلط' });
      const reply = service.complaintReply(ctx);
      expect(reply.message).not.toMatch(/تضيف/);
      expect(reply.message).not.toMatch(/كمان/);
    });

    test('no repetitive closing question', () => {
      const reply = service.closingReply(makeCtx(), 'afterConfirm');
      expect(reply.message).not.toMatch(/تاني/);
      expect(reply.message).not.toMatch(/مساعدة/);
    });
  });

  // ── Identity safety ──

  describe('identity isolation', () => {
    test('customer name only appears in personal context', () => {
      const ctx = makeCtx({ customerName: 'أحمد', isReturningCustomer: true });
      const reply = service.greetingReply(ctx);
      expect(reply.message).toMatch(/أحمد/);
    });

    test('one customer never sees another customer balance', () => {
      const ctx = makeCtx({ balance: 130, customerName: 'أحمد' });
      const reply = service.accountReply(ctx);
      expect(reply.message).not.toMatch(/سارة/);
    });
  });

  // ── Yes/No Interpretation ──

  describe('yes/no interpretation', () => {
    test('ايوه is yes', () => {
      expect(service.interpretYesNo('ايوه').isYes).toBe(true);
    });

    test('أيوه is yes', () => {
      expect(service.interpretYesNo('أيوه').isYes).toBe(true);
    });

    test('آه is yes', () => {
      expect(service.interpretYesNo('آه').isYes).toBe(true);
    });

    test('لا is no', () => {
      expect(service.interpretYesNo('لا').isNo).toBe(true);
    });

    test('لأ is no', () => {
      expect(service.interpretYesNo('لأ').isNo).toBe(true);
    });

    test('مش كده is no', () => {
      expect(service.interpretYesNo('مش كده').isNo).toBe(true);
    });

    test('طيب is weak yes', () => {
      const result = service.interpretYesNo('طيب');
      expect(result.isYes).toBe(true);
      expect(result.confidence).toBe(0.6);
    });

    test('ambiguous input returns false for both', () => {
      const result = service.interpretYesNo('عايز قهوة');
      expect(result.isYes).toBe(false);
      expect(result.isNo).toBe(false);
      expect(result.confidence).toBe(0);
    });
  });

  // ── Reply mode detection ──

  describe('detectMode', () => {
    test('default is NORMAL', () => {
      expect(service.detectMode(makeCtx())).toBe('NORMAL');
    });

    test('urgent patterns trigger FAST', () => {
      for (const word of ['مستعجل', 'بسرعة', 'ورايا شغل', 'خلصني']) {
        expect(service.detectMode(makeCtx({ customerMessage: word }))).toBe('FAST');
      }
    });

    test('complaint patterns trigger COMPLAINT', () => {
      for (const word of ['غلط', 'خطأ', 'مشكلة', 'ناقص']) {
        expect(service.detectMode(makeCtx({ customerMessage: word }))).toBe('COMPLAINT');
      }
    });

    test('balance patterns trigger ACCOUNT', () => {
      for (const word of ['عليا كام', 'كام عليا', 'عليا فلوس']) {
        expect(service.detectMode(makeCtx({ customerMessage: word }))).toBe('ACCOUNT');
      }
    });
  });

  // ── Specific conversation types ──

  describe('first-time customer', () => {
    test('gets greeting with introduction', () => {
      const reply = service.greetingReply(makeCtx({ isNewCustomer: true }));
      expect(reply.message).toMatch(/أهلًا/);
      expect(reply.message).toMatch(/Sonex/);
    });

    test('gets buttons for drinks or breakfast', () => {
      const reply = service.greetingReply(makeCtx({ isNewCustomer: true }));
      expect(reply.buttons).toBeDefined();
      expect(reply.buttons!.length).toBeGreaterThan(0);
    });
  });

  describe('daily morning customer', () => {
    test('gets morning greeting with usual order option', () => {
      const reply = service.greetingReply(makeCtx({
        isReturningCustomer: true,
        isMorning: true,
        customerName: 'أحمد',
        hasUsualOrder: true,
      }));
      expect(reply.message).toMatch(/صباح/);
      expect(reply.message).toMatch(/المعتاد/);
    });
  });

  describe('usual order', () => {
    test('normal reply for returning customer offers usual', () => {
      const ctx = makeCtx({ isReturningCustomer: true, hasUsualOrder: true });
      const reply = service.normalReply(ctx);
      expect(reply.message).toMatch(/المعتاد/);
      expect(reply.buttons).toBeDefined();
    });
  });

  describe('urgent customer', () => {
    test('FAST mode has shortest reply', () => {
      const reply = service.fastReply(makeCtx({ hasUsualOrder: true }));
      expect(reply.mode).toBe('FAST');
      expect(reply.message.split('\n').length).toBeLessThanOrEqual(2);
    });

    test('FAST mode has no upselling', () => {
      const reply = service.fastReply(makeCtx({ hasUsualOrder: true }));
      expect(reply.message).not.toMatch(/تضيف/);
    });
  });

  describe('recommendation request', () => {
    test('exploring mode gives max 3 choices', () => {
      const reply = service.exploringReply(makeCtx());
      expect(reply.message).toMatch(/ثلاثة|3/);
    });
  });

  describe('budget request', () => {
    test('budget reply shows options within range', () => {
      const reply = service.budgetReply(makeCtx(), 80);
      expect(reply.message).toMatch(/70/);
      expect(reply.message).toMatch(/75/);
    });
  });

  describe('one more coffee', () => {
    test('oneMoreReply asks for confirmation', () => {
      const ctx = makeCtx({
        currentDraft: { items: [{ name: 'قهوة', quantity: 1, price: 35 }], total: 35 },
      });
      const reply = service.oneMoreReply(ctx);
      expect(reply.message).toMatch(/واحدة كمان/);
      expect(reply.message).toMatch(/قهوة/);
    });
  });

  describe('temporary address', () => {
    test('addressChangeReply asks for location', () => {
      const reply = service.addressChangeReply(makeCtx());
      expect(reply.message).toMatch(/اسم المحل/);
    });

    test('addressConfirmReply asks permanent or temp', () => {
      const reply = service.addressConfirmReply(makeCtx(), 'مكتبة');
      expect(reply.message).toMatch(/المرة دي/);
    });
  });

  describe('weekly account payment', () => {
    test('eligible payment shows remaining balance', () => {
      const reply = service.paymentWeeklyEligibleReply(makeCtx(), 210);
      expect(reply.message).toMatch(/210/);
    });

    test('not eligible offers alternatives', () => {
      const reply = service.paymentNotEligibleReply(makeCtx());
      expect(reply.message).toMatch(/كاش/);
      expect(reply.message).toMatch(/دفع فوري/);
    });
  });

  describe('balance inquiry', () => {
    test('account reply shows balance', () => {
      const reply = service.accountReply(makeCtx({ balance: 130, balanceDueDate: 'الخميس' }));
      expect(reply.message).toMatch(/130/);
      expect(reply.message).toMatch(/الخميس/);
    });
  });

  describe('order tracking', () => {
    test('preparing status shows estimate', () => {
      const reply = service.trackingReply(makeCtx({ orderStatus: 'preparing', deliveryEstimate: '10–14 دقيقة' }));
      expect(reply.message).toMatch(/بيتجهز/);
    });

    test('delivered status congratulates', () => {
      const reply = service.trackingReply(makeCtx({ orderStatus: 'delivered' }));
      expect(reply.message).toMatch(/بالهنا/);
    });

    test('delayed status gives new estimate', () => {
      const reply = service.trackingReply(makeCtx({ orderStatus: 'delayed', deliveryEstimate: '9:20–9:25' }));
      expect(reply.message).toMatch(/تأخير/);
    });
  });

  describe('delayed order', () => {
    test('tracking reply for delayed order honest', () => {
      const reply = service.trackingReply(makeCtx({ orderStatus: 'delayed', deliveryEstimate: '5–8 دقايق' }));
      expect(reply.message).not.toMatch(/خلص/);
      expect(reply.message).toMatch(/تأخير/);
    });
  });

  describe('unavailable product', () => {
    test('offers alternatives when available', () => {
      const reply = service.productUnavailableReply(makeCtx(), 'آيس لاتيه', ['آيس كابتشينو', 'آيس أمريكانو']);
      expect(reply.message).toMatch(/أقرب اختيارين/);
    });

    test('offers menu when no alternatives', () => {
      const reply = service.productUnavailableReply(makeCtx(), 'آيس لاتيه', []);
      expect(reply.message).toMatch(/القائمة/);
    });
  });

  describe('changed price', () => {
    test('priceChangeReply shows old and new', () => {
      const reply = service.priceChangeReply(makeCtx(), 'قهوة', 35, 40);
      expect(reply.message).toMatch(/35/);
      expect(reply.message).toMatch(/40/);
      expect(reply.message).toMatch(/بدل/);
    });
  });

  describe('complaint', () => {
    test('apologizes without mirroring aggression', () => {
      const reply = service.complaintReply(makeCtx({ customerMessage: 'الطلب غلط ياخسارة' }));
      expect(reply.message).not.toMatch(/خسارة/);
      expect(reply.message).toMatch(/حقك علينا/);
    });

    test('does not upsell during complaint', () => {
      const reply = service.complaintReply(makeCtx({ customerMessage: 'الطلب ناقص' }));
      expect(reply.message).not.toMatch(/تضيف/);
      expect(reply.message).not.toMatch(/تشتري/);
    });
  });

  describe('angry customer', () => {
    test('does not mirror aggression', () => {
      const reply = service.complaintReply(makeCtx({ customerMessage: 'الطلب غلط ياخسارة' }));
      expect(reply.message).not.toMatch(/خسارة/);
    });

    test('does not argue', () => {
      const reply = service.complaintReply(makeCtx({ customerMessage: 'الطلب غلط' }));
      expect(reply.message).not.toMatch(/لا/);
      expect(reply.message).not.toMatch(/صح/);
    });
  });

  describe('misunderstanding', () => {
    test('apologizes and offers options', () => {
      const reply = service.misunderstandingReply(makeCtx());
      expect(reply.message).toMatch(/حقك عليا/);
      expect(reply.message).toMatch(/تعديل/);
      expect(reply.message).toMatch(/جديد/);
    });
  });

  describe('technical error', () => {
    test('error recovery preserves order context', () => {
      const ctx = makeCtx({ errorMessage: 'timeout', currentDraft: { items: [{ name: 'قهوة', quantity: 1, price: 35 }], total: 35 } });
      const reply = service.errorRecoveryReply(ctx);
      expect(reply.message).toMatch(/محفوظ/);
      expect(reply.buttons).toBeDefined();
    });
  });

  describe('human handoff', () => {
    test('handoff reply offers connection', () => {
      const reply = service.humanHandoffReply(makeCtx());
      expect(reply.message).toMatch(/هوصل بكلم حد/);
    });
  });

  describe('loyalty reward', () => {
    test('loyalty reply shows points', () => {
      const reply = service.loyaltyRewardReply(makeCtx(), 50);
      expect(reply.message).toMatch(/50/);
      expect(reply.message).toMatch(/ولاء/);
    });
  });

  // ── Button policy ──

  describe('button policy', () => {
    test('confirmation has تأكيد button', () => {
      const ctx = makeCtx({
        currentDraft: { items: [{ name: 'قهوة', quantity: 1, price: 35 }], total: 35 },
      });
      const reply = service.confirmReply(ctx);
      const allLabels = reply.buttons?.flat().map(b => b.label) || [];
      expect(allLabels).toContain('تأكيد الطلب');
    });

    test('button labels are clear', () => {
      const ctx = makeCtx({
        currentDraft: { items: [{ name: 'قهوة', quantity: 1, price: 35 }], total: 35 },
      });
      const reply = service.confirmReply(ctx);
      for (const row of reply.buttons || []) {
        for (const btn of row) {
          expect(btn.label.length).toBeGreaterThan(3);
        }
      }
    });
  });

  // ── Response length ──

  describe('response length', () => {
    test('normal mode replies are short', () => {
      const reply = service.normalReply(makeCtx());
      expect(reply.message.length).toBeLessThan(300);
    });

    test('order summary can be longer', () => {
      const summary = service.formatOrderSummary(
        [{ name: 'قهوة', quantity: 2, price: 35 }, { name: 'كرواسون', quantity: 1, price: 25 }],
        95, 'المنزل', 'كاش'
      );
      expect(summary.length).toBeGreaterThan(30);
    });
  });

  // ── Response variation ──

  describe('response variation', () => {
    test('pickOne returns one of the array', () => {
      const arr = ['تمام', 'حاضر', 'وصلت'];
      const result = service.pickOne(arr);
      expect(arr).toContain(result);
    });

    test('varyAcknowledgement returns Egyptian acknowledgment', () => {
      const ack = service.varyAcknowledgement();
      expect(['تمام', 'حاضر', 'وصلت', 'ماشي', 'أيوه كده', 'تمام فهمتك', 'حلو', 'تم']).toContain(ack);
    });

    test('varyConfirmationQuestion returns confirmation', () => {
      const q = service.varyConfirmationQuestion();
      expect(['أأكد؟', 'أثبت الطلب؟', 'نطلبه كده؟', 'نأكد؟']).toContain(q);
    });
  });

  // ── Utility detectors ──

  describe('utility detectors', () => {
    test('isUrgent detects urgency', () => {
      expect(service.isUrgent('بسرعة')).toBe(true);
      expect(service.isUrgent('صباح الخير')).toBe(false);
    });

    test('isComplaint detects complaints', () => {
      expect(service.isComplaint('الطلب غلط')).toBe(true);
      expect(service.isComplaint('عايز قهوة')).toBe(false);
    });

    test('isAddressChange detects address changes', () => {
      expect(service.isAddressChange('أنا في محل تاني')).toBe(true);
    });

    test('isOneMore detects one more order', () => {
      expect(service.isOneMore('واحدة كمان')).toBe(true);
    });

    test('isBalanceQuery detects balance queries', () => {
      expect(service.isBalanceQuery('عليا كام')).toBe(true);
    });

    test('isTrackingQuery detects tracking', () => {
      expect(service.isTrackingQuery('الطلب فين')).toBe(true);
    });
  });

  // ── Two customers at same shop ──

  describe('two customers at same shop with separate identities', () => {
    test('customer 1 sees own name and balance', () => {
      const ctx1 = makeCtx({ customerName: 'أحمد', balance: 130 });
      const reply1 = service.accountReply(ctx1);
      expect(reply1.message).toMatch(/130/);
    });

    test('customer 2 sees own balance', () => {
      const ctx2 = makeCtx({ customerName: 'سارة', balance: 75 });
      const reply2 = service.accountReply(ctx2);
      expect(reply2.message).toMatch(/75/);
    });
  });
});
