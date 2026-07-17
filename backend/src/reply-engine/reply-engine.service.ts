import { Injectable, Logger } from '@nestjs/common';
import {
  ReplyMode, ReplyPurpose, ReplyContext, ReplyButton,
  StructuredReply, YesNoResult,
  EGYPTIAN_YES_PATTERNS, EGYPTIAN_NO_PATTERNS,
  URGENT_SIGNAL_PATTERNS, EGYPTIAN_ACKNOWLEDGMENTS,
  GREETING_RESPONSES, ORDER_CONFIRMED_RESPONSES, CLOSING_RESPONSES, CONFIRMATION_QUESTIONS,
} from './reply-engine.types';

@Injectable()
export class ReplyEngineService {
  private readonly logger = new Logger(ReplyEngineService.name);

  detectMode(ctx: ReplyContext): ReplyMode {
    if (ctx.hasUrgentSignal || ctx.customerMessage.match(new RegExp(URGENT_SIGNAL_PATTERNS.join('|'), 'i'))) {
      return 'FAST';
    }
    if (ctx.hasComplaint || ctx.customerMessage.match(/غ[لل]ط|خطأ|مشكله|مشكلة|ناقص|متأخر|حقك|تضايق/)) {
      return 'COMPLAINT';
    }
    if (ctx.errorMessage) return 'ERROR_RECOVERY';
    if (ctx.customerMessage.match(/عليا كام|كام عليا|عليا فلوس|الفلوس|الحساب|مديون|باقي/)) return 'ACCOUNT';
    if (ctx.customerMessage.match(/طلب فين|الطلب|تتبع|وصل|التوصيل|فين الطلب/)) return 'TRACKING';
    if (ctx.isNewCustomer || ctx.clarificationCount > 2) return 'GUIDED';
    if (ctx.customerMessage.match(/تقترح|عندك إيه|ايه المناسب|عايز حاجه|نوع|جديد/)) return 'EXPLORING';
    return 'NORMAL';
  }

  detectPurpose(ctx: ReplyContext): ReplyPurpose {
    if (ctx.hasUrgentSignal) return 'CLARIFY';
    if (ctx.hasComplaint || ctx.customerMessage.match(/غ[لل]ط|خطأ|مشكله|مشكلة/)) return 'APOLOGIZE';
    if (ctx.errorMessage) return 'SUPPORT';
    if (ctx.customerMessage.match(/عليا كام|كام عليا|عليا فلوس/)) return 'INFORM';
    if (ctx.customerMessage.match(/طلب فين|فين|تتبع|وصل/)) return 'TRACK';
    if (ctx.currentDraft && !ctx.lastBotPurpose) return 'CLARIFY';
    if (ctx.lastBotPurpose === 'CLARIFY' && !ctx.currentDraft) return 'UNDERSTAND';
    if (ctx.lastBotPurpose === 'CONFIRM') return 'CONFIRM';
    if (ctx.customerMessage.match(/تقترح|عندك|تعرف/)) return 'RECOMMEND';
    if (ctx.clarificationCount > 3) return 'SUPPORT';
    return 'UNDERSTAND';
  }

  interpretYesNo(input: string, lastBotQuestion?: string): YesNoResult {
    const clean = input.trim().toLowerCase();

    const strongYes = ['ايوه', 'أيوه', 'اه', 'آه', 'yeah', 'yes', 'yep'];
    const weakYes = ['طيب', 'ماشي', 'ok', 'okay', 'تمام', 'قصدى كده', 'قصدي كده'];
    const strongNo = ['لا', 'لأ', 'na', 'no', 'nope'];
    const weakNo = ['مش', 'مش كده', 'مش ده', 'غير', 'لا شكرا', 'لا مش عايز', 'متقترحليش'];

    if (strongYes.some(p => clean.startsWith(p))) return { isYes: true, isNo: false, confidence: 0.9, rawInput: input };
    if (strongNo.some(p => clean.startsWith(p))) return { isYes: false, isNo: true, confidence: 0.9, rawInput: input };
    if (weakYes.some(p => clean.startsWith(p))) return { isYes: true, isNo: false, confidence: 0.6, rawInput: input };
    if (weakNo.some(p => clean.startsWith(p))) return { isYes: false, isNo: true, confidence: 0.6, rawInput: input };

    if (lastBotQuestion) {
      if (lastBotQuestion.includes('أأكد') || lastBotQuestion.includes('أثبت') || lastBotQuestion.includes('نطلبه') || lastBotQuestion.includes('نأكد')) {
        if (clean.includes('a6') || clean.includes('ta')) {
          const hasNo = weakNo.some(p => clean.startsWith(p));
          return hasNo
            ? { isYes: false, isNo: true, confidence: 0.5, rawInput: input }
            : { isYes: true, isNo: false, confidence: 0.5, rawInput: input };
        }
      }
    }

    return { isYes: false, isNo: false, confidence: 0, rawInput: input };
  }

  buildReply(mode: ReplyMode, purpose: ReplyPurpose, ctx: ReplyContext): StructuredReply {
    switch (mode) {
      case 'FAST': return this.fastReply(ctx);
      case 'COMPLAINT': return this.complaintReply(ctx);
      case 'ERROR_RECOVERY': return this.errorRecoveryReply(ctx);
      case 'ACCOUNT': return this.accountReply(ctx);
      case 'TRACKING': return this.trackingReply(ctx);
      case 'GUIDED': return this.guidedReply(ctx);
      case 'EXPLORING': return this.exploringReply(ctx);
      default: return this.normalReply(ctx);
    }
  }

  public fastReply(ctx: ReplyContext): StructuredReply {
    const { customerName, hasUsualOrder, currentDraft, deliveryEstimate } = ctx;

    let message: string;
    let buttons: ReplyButton[][] = [];
    let purpose: ReplyPurpose = 'CLARIFY';

    if (hasUsualOrder && !currentDraft) {
      message = `أكرر المعتاد؟ ${deliveryEstimate ? `التوصيل ${deliveryEstimate}.` : ''}`.trim();
      buttons = [[{ label: 'تأكيد', action: 'CONFIRM_REPEAT' }, { label: 'طلب جديد', action: 'NEW_ORDER' }]];
      purpose = 'CONFIRM';
    } else if (currentDraft) {
      message = 'نأكد الطلب كده؟';
      buttons = [[{ label: 'تأكيد الطلب', action: 'CONFIRM_DRAFT' }, { label: 'تعديل', action: 'EDIT_DRAFT' }]];
      purpose = 'CONFIRM';
    } else {
      message = 'تحب إيه؟ ☕';
      purpose = 'CLARIFY';
    }

    return {
      mode: 'FAST', purpose, message, buttons: buttons.length > 0 ? buttons : undefined,
      factsUsed: ['usualOrder', 'deliveryEstimate'], requiresHuman: false, contextPreserved: true,
    };
  }

  public complaintReply(ctx: ReplyContext): StructuredReply {
    const msg = ctx.customerMessage.toLowerCase();

    let message: string;
    let buttons: ReplyButton[][];

    if (msg.includes('ناقص')) {
      message = 'حقك علينا. إيه الناقص في الطلب؟';
      buttons = [[{ label: 'مشروب ناقص', action: 'COMPLAINT_MISSING_DRINK' }, { label: 'إضافة ناقصة', action: 'COMPLAINT_MISSING_ADDON' }]];
    } else     if (msg.includes('غلط') || msg.includes('غlt') || msg.includes('مش ده')) {
      message = 'حقك علينا. الغلط في المشروب أو في الإضافات؟';
      buttons = [[{ label: 'المشروب', action: 'COMPLAINT_WRONG_DRINK' }, { label: 'الإضافات', action: 'COMPLAINT_WRONG_ADDON' }]];
    } else if (msg.includes('تأخر') || msg.includes('delay') || msg.includes('بطء')) {
      message = 'آسفين على التأخير. هيوصللك خلال 5–8 دقايق إن شاء الله.';
      buttons = [[{ label: 'تمام', action: 'ACKNOWLEDGE' }, { label: 'كلم حد', action: 'REQUEST_HUMAN' }]];
    } else if (msg.includes('جودة') || msg.includes('quality') || msg.includes('مش حلو')) {
      message = 'آسفين إن الطلب مش على مستوى. هنوصلك بحد من الكافيه يتابع معاك.';
      buttons = [[{ label: 'كلم حد', action: 'REQUEST_HUMAN' }]];
    } else {
      message = 'حقك علينا. خليني أحل المشكلة على الطلب الحالي.';
      buttons = [[{ label: 'فيه مشكلة', action: 'COMPLAINT_DETAIL' }, { label: 'كلم حد', action: 'REQUEST_HUMAN' }]];
    }

    return {
      mode: 'COMPLAINT', purpose: 'APOLOGIZE', message, buttons,
      factsUsed: [], requiresHuman: msg.includes('جودة'), contextPreserved: true,
    };
  }

  public errorRecoveryReply(ctx: ReplyContext): StructuredReply {
    return {
      mode: 'ERROR_RECOVERY', purpose: 'SUPPORT',
      message: 'حصلت مشكلة بسيطة، وطلبك لسه محفوظ.\nتحب نحاول تاني؟',
      buttons: [
        [{ label: 'حاول تاني', action: 'RETRY' }],
        [{ label: 'كلم حد', action: 'REQUEST_HUMAN' }],
      ],
      factsUsed: [], requiresHuman: false, contextPreserved: true,
    };
  }

  public accountReply(ctx: ReplyContext): StructuredReply {
    const { balance, balanceDueDate } = ctx;
    if (balance === undefined) {
      return {
        mode: 'ACCOUNT', purpose: 'INFORM',
        message: 'مش عارف أجيب حسابك دلوقتي. تحب تكلم حد من الكافيه؟',
        buttons: [[{ label: 'كلم حد', action: 'REQUEST_HUMAN' }]],
        factsUsed: [], requiresHuman: false, contextPreserved: true,
      };
    }
    let message = `المتبقي عليك ${balance} جنيه.`;
    if (balanceDueDate) message += `\nموعد التسوية: ${balanceDueDate}.`;
    return {
      mode: 'ACCOUNT', purpose: 'INFORM',
      message,
      buttons: [[{ label: 'تفاصيل', action: 'VIEW_BALANCE_DETAILS' }, { label: 'رجوع للطلب', action: 'BACK_TO_ORDER' }]],
      factsUsed: ['balance', 'balanceDueDate'], requiresHuman: false, contextPreserved: true,
    };
  }

  public trackingReply(ctx: ReplyContext): StructuredReply {
    const { orderStatus, deliveryEstimate } = ctx;
    let message: string;
    if (orderStatus === 'preparing') {
      message = `طلبك بيتجهز دلوقتي${deliveryEstimate ? `، والتوصيل المتوقع خلال ${deliveryEstimate}.` : ''}`;
    } else if (orderStatus === 'delivered') {
      message = 'طلبك اتوصل. بالهنا والشفا 🎉';
    } else if (orderStatus === 'delayed') {
      message = `فيه تأخير بسيط. الوقت الجديد المتوقع ${deliveryEstimate || 'قريبًا'}.`;
    } else {
      message = `حالة الطلب: ${orderStatus || 'جاري التجهيز'}${deliveryEstimate ? `\nمتوسط التوصيل: ${deliveryEstimate}` : ''}`;
    }
    return {
      mode: 'TRACKING', purpose: 'TRACK', message,
      buttons: [[{ label: 'متابعة', action: 'TRACK_ORDER' }, { label: 'كلم حد', action: 'REQUEST_HUMAN' }]],
      factsUsed: ['orderStatus', 'deliveryEstimate'], requiresHuman: false, contextPreserved: true,
    };
  }

  public guidedReply(ctx: ReplyContext): StructuredReply {
    if (ctx.isNewCustomer) {
      return {
        mode: 'GUIDED', purpose: 'UNDERSTAND',
        message: 'تحب مشروب سخن ولا ساقع؟\nأو تحب تشوف القائمة كاملة؟',
        buttons: [
          [{ label: '☕ مشروب سخن', action: 'MENU_HOT' }],
          [{ label: '🧊 مشروب ساقع', action: 'MENU_COLD' }],
          [{ label: 'القائمة كاملة', action: 'FULL_MENU' }],
        ],
        factsUsed: [], requiresHuman: false, contextPreserved: true,
      };
    }
    return {
      mode: 'GUIDED', purpose: 'CLARIFY',
      message: 'مش متأكد إني فهمتك صح.\nتحب تختار من القهوة، المشروبات الباردة، ولا الفطار؟',
      buttons: [
        [{ label: '☕ قهوة', action: 'MENU_COFFEE' }],
        [{ label: '🧊 مشروبات باردة', action: 'MENU_COLD' }],
        [{ label: '🥐 فطار', action: 'MENU_BREAKFAST' }],
      ],
      factsUsed: [], requiresHuman: false, contextPreserved: true,
    };
  }

  public exploringReply(ctx: ReplyContext): StructuredReply {
    return {
      mode: 'EXPLORING', purpose: 'RECOMMEND',
      message: 'عندك 3 اختيارات مناسبة:\n1. آيس أمريكانو\n2. آيس لاتيه\n3. كولد برو\n\nتحب أنهي؟',
      buttons: [
        [{ label: 'آيس أمريكانو', action: 'SELECT_PRODUCT', extra: 'iced-americano' }],
        [{ label: 'آيس لاتيه', action: 'SELECT_PRODUCT', extra: 'iced-latte' }],
        [{ label: 'كولد برو', action: 'SELECT_PRODUCT', extra: 'cold-brew' }],
      ],
      factsUsed: [], requiresHuman: false, contextPreserved: true,
    };
  }

  public normalReply(ctx: ReplyContext): StructuredReply {
    const purpose = this.detectPurpose(ctx);
    const { customerName, isReturningCustomer, isMorning, hasUsualOrder, currentDraft } = ctx;

    if (purpose === 'CONFIRM' && currentDraft) {
      return this.confirmReply(ctx);
    }

    if (isReturningCustomer && isMorning && hasUsualOrder && !currentDraft) {
      const greeting = this.pickOne(GREETING_RESPONSES.morningReturning).replace('{name}', customerName || '');
      return {
        mode: 'NORMAL', purpose: 'CONFIRM',
        message: `${greeting}`,
        buttons: [[{ label: 'كرر المعتاد', action: 'REPEAT_USUAL' }, { label: 'طلب جديد', action: 'NEW_ORDER' }]],
        factsUsed: ['usualOrder'], requiresHuman: false, contextPreserved: true,
      };
    }

    if (isReturningCustomer && hasUsualOrder && !currentDraft) {
      return {
        mode: 'NORMAL', purpose: 'CONFIRM',
        message: `${customerName ? `أهلًا يا ${customerName}` : 'أهلًا'}\نكرر المعتاد ولا حاجة جديدة؟`,
        buttons: [[{ label: 'كرر المعتاد', action: 'REPEAT_USUAL' }, { label: 'جديد', action: 'NEW_ORDER' }]],
        factsUsed: ['usualOrder'], requiresHuman: false, contextPreserved: true,
      };
    }

    return {
      mode: 'NORMAL', purpose: 'UNDERSTAND',
      message: 'تحب إيه؟ ☕',
      factsUsed: [], requiresHuman: false, contextPreserved: true,
    };
  }

  confirmReply(ctx: ReplyContext): StructuredReply {
    const { currentDraft } = ctx;
    if (!currentDraft) {
      return this.normalReply(ctx);
    }

    const items = currentDraft.items || [];
    const lines = items.map(i => `${i.quantity}× ${i.name}${i.price ? ` = ${i.price * i.quantity} ج` : ''}`);
    const parts = ['طلبك:'];
    if (lines.length > 0) parts.push(lines.join('\n'));

    if (currentDraft.total !== undefined) parts.push(`الإجمالي: ${currentDraft.total} جنيه`);
    if (currentDraft.deliveryLocation) parts.push(`التوصيل: ${currentDraft.deliveryLocation}`);
    if (currentDraft.paymentMethod) parts.push(`الدفع: ${currentDraft.paymentMethod}`);

    parts.push(`\n${this.pickOne(CONFIRMATION_QUESTIONS)}`);

    return {
      mode: 'NORMAL', purpose: 'CONFIRM',
      message: parts.join('\n'),
      buttons: [
        [{ label: 'تأكيد الطلب', action: 'CONFIRM_DRAFT' }],
        [{ label: 'تعديل', action: 'EDIT_DRAFT' }],
      ],
      factsUsed: ['currentDraft', 'total', 'deliveryLocation', 'paymentMethod'],
      requiresHuman: false, contextPreserved: true,
    };
  }

  orderConfirmedReply(ctx: ReplyContext): StructuredReply {
    return {
      mode: 'NORMAL', purpose: 'CLOSE',
      message: `${this.pickOne(ORDER_CONFIRMED_RESPONSES)}\n\nالتوصيل المتوقع: ${ctx.deliveryEstimate || '10–14 دقيقة.'}`,
      buttons: [
        [{ label: 'متابعة الطلب', action: 'TRACK_ORDER' }],
        [{ label: '+ واحدة كمان', action: 'ORDER_ONE_MORE' }],
      ],
      factsUsed: ['deliveryEstimate'], requiresHuman: false, contextPreserved: true,
    };
  }

  closingReply(ctx: ReplyContext, type: 'afterConfirm' | 'afterDeliveryFeedback' | 'afterRejectedSuggestion' = 'afterConfirm'): StructuredReply {
    const messages = CLOSING_RESPONSES[type];
    return {
      mode: 'NORMAL', purpose: 'CLOSE',
      message: this.pickOne(messages),
      factsUsed: [], requiresHuman: false, contextPreserved: true,
    };
  }

  upsellReply(ctx: ReplyContext, productName: string, price: number): StructuredReply {
    let message: string;
    if (ctx.customerName) {
      message = `تحب تضيف ${productName} بـ${price} جنيه؟`;
    } else {
      message = `تحب تضيف ${productName} بـ${price} جنيه؟`;
    }
    return {
      mode: 'NORMAL', purpose: 'RECOMMEND',
      message,
      buttons: [[{ label: 'إضافة', action: 'ADD_UPSELL', extra: productName }, { label: 'لا شكرا', action: 'REJECT_UPSELL' }]],
      factsUsed: ['productPrice'], requiresHuman: false, contextPreserved: true,
    };
  }

  priceChangeReply(ctx: ReplyContext, product: string, oldPrice: number, newPrice: number): StructuredReply {
    return {
      mode: 'NORMAL', purpose: 'INFORM',
      message: `طلبك المعتاد بقى بـ${newPrice} جنيه بدل ${oldPrice}.\nأأكد؟`,
      buttons: [[{ label: 'تأكيد', action: 'CONFIRM_DRAFT' }, { label: 'تعديل', action: 'EDIT_DRAFT' }]],
      factsUsed: ['productPrice', 'priceChanged'], requiresHuman: false, contextPreserved: true,
    };
  }

  productUnavailableReply(ctx: ReplyContext, unavailableProduct: string, alternatives: string[]): StructuredReply {
    let message = `ال${unavailableProduct} مش متاح دلوقتي.`;
    if (alternatives.length > 0) {
      message += `\nأقرب اختيارين ليه: ${alternatives.join('، ')}.`;
    } else {
      message += '\nمش متاح حاليًا. تحب تشوف القائمة؟';
    }
    return {
      mode: 'NORMAL', purpose: 'INFORM',
      message,
      buttons: alternatives.length > 0
        ? alternatives.map(a => [{ label: a, action: 'SELECT_PRODUCT', extra: a }])
        : [[{ label: 'القائمة', action: 'FULL_MENU' }]],
      factsUsed: ['productAvailability'], requiresHuman: false, contextPreserved: true,
    };
  }

  budgetReply(ctx: ReplyContext, budget: number): StructuredReply {
    return {
      mode: 'EXPLORING', purpose: 'RECOMMEND',
      message: `عندك قهوة تركي مع باتيه بـ70، أو شاي مع كرواسون بـ75.\nتحب أنهي؟`,
      buttons: [
        [{ label: 'قهوة تركي + باتيه (70)', action: 'SELECT_PRODUCT', extra: 'turco-batate' }],
        [{ label: 'شاي + كرواسون (75)', action: 'SELECT_PRODUCT', extra: 'tea-croissant' }],
      ],
      factsUsed: ['productPrice'], requiresHuman: false, contextPreserved: true,
    };
  }

  recommendationReply(ctx: ReplyContext): StructuredReply {
    return {
      mode: 'EXPLORING', purpose: 'RECOMMEND',
      message: 'تحبها سخنة ولا ساقعة؟\n\nأو لو عايز اقتراح: قهوة تركي تقيلة أو آيس أمريكانو.',
      buttons: [
        [{ label: '☕ سخن', action: 'MENU_HOT' }],
        [{ label: '🧊 ساقع', action: 'MENU_COLD' }],
        [{ label: 'اقتراح', action: 'RECOMMEND_ME' }],
      ],
      factsUsed: [], requiresHuman: false, contextPreserved: true,
    };
  }

  oneMoreReply(ctx: ReplyContext): StructuredReply {
    let message: string;
    if (ctx.currentDraft && ctx.currentDraft.items && ctx.currentDraft.items.length === 1) {
      const item = ctx.currentDraft.items[0];
      message = `واحدة كمان من ${item.name} بنفس المواصفات؟`;
    } else if (ctx.currentDraft && ctx.currentDraft.items && ctx.currentDraft.items.length > 1) {
      message = 'تقصد القهوة ولا الكرواسون؟';
    } else {
      message = 'واحدة كمان من نفس الطلب؟';
    }
    return {
      mode: 'NORMAL', purpose: 'CLARIFY',
      message,
      buttons: [[{ label: 'أيوه', action: 'CONFIRM_ONE_MORE' }, { label: 'لا', action: 'REJECT_ONE_MORE' }]],
      factsUsed: ['currentDraft'], requiresHuman: false, contextPreserved: true,
    };
  }

  addressChangeReply(ctx: ReplyContext): StructuredReply {
    return {
      mode: 'NORMAL', purpose: 'CLARIFY',
      message: 'تمام، ابعت اسم المحل أو علامة قريبة.',
      factsUsed: [], requiresHuman: false, contextPreserved: true,
    };
  }

  addressConfirmReply(ctx: ReplyContext, address: string): StructuredReply {
    return {
      mode: 'NORMAL', purpose: 'CONFIRM',
      message: `أوصله هنا ${address} المرة دي بس، ولا نخليه العنوان الأساسي؟`,
      buttons: [
        [{ label: 'المرة دي بس', action: 'TEMP_ADDRESS' }],
        [{ label: 'خليه أساسي', action: 'SET_PERMANENT_ADDRESS' }],
      ],
      factsUsed: ['deliveryLocation'], requiresHuman: false, contextPreserved: true,
    };
  }

  paymentWeeklyEligibleReply(ctx: ReplyContext, remaining: number): StructuredReply {
    return {
      mode: 'NORMAL', purpose: 'CONFIRM',
      message: `تمام، على حسابك الأسبوعي. المتبقي بعد الطلب هيبقى ${remaining} جنيه.\nأأكد؟`,
      buttons: [[{ label: 'تأكيد', action: 'CONFIRM_DRAFT' }, { label: 'طريقة تانية', action: 'CHANGE_PAYMENT' }]],
      factsUsed: ['paymentMethod', 'balance'], requiresHuman: false, contextPreserved: true,
    };
  }

  paymentNotEligibleReply(ctx: ReplyContext): StructuredReply {
    return {
      mode: 'NORMAL', purpose: 'INFORM',
      message: 'الحساب الأسبوعي مش متاح حاليًا.\nتحب كاش ولا دفع فوري؟',
      buttons: [
        [{ label: '💵 كاش', action: 'SELECT_PAYMENT', extra: 'cash' }],
        [{ label: '📱 دفع فوري', action: 'SELECT_PAYMENT', extra: 'instant-pay' }],
      ],
      factsUsed: ['paymentMethod'], requiresHuman: false, contextPreserved: true,
    };
  }

  misunderstandingReply(ctx: ReplyContext): StructuredReply {
    return {
      mode: 'NORMAL', purpose: 'CORRECT',
      message: 'حقك عليا.\nتحب تعديل الطلب الحالي ولا تبدأ طلب جديد؟',
      buttons: [
        [{ label: 'تعديل الطلب', action: 'EDIT_DRAFT' }],
        [{ label: 'طلب جديد', action: 'NEW_ORDER' }],
      ],
      factsUsed: [], requiresHuman: false, contextPreserved: true,
    };
  }

  humanHandoffReply(ctx: ReplyContext): StructuredReply {
    return {
      mode: 'NORMAL', purpose: 'SUPPORT',
      message: 'هوصل بكلم حد من الكافيه.\nشوية صبر.',
      buttons: [[{ label: 'تمام', action: 'ACKNOWLEDGE' }]],
      factsUsed: [], requiresHuman: true, contextPreserved: true,
    };
  }

  loyaltyRewardReply(ctx: ReplyContext, points: number): StructuredReply {
    return {
      mode: 'NORMAL', purpose: 'INFORM',
      message: `عندك ${points} نقطة ولاء! 🎉\nتحب تستبدلها بخصم على الطلب؟`,
      buttons: [
        [{ label: 'استبدل النقاط', action: 'REDEEM_LOYALTY' }],
        [{ label: 'لا شكرا', action: 'REJECT_LOYALTY' }],
      ],
      factsUsed: ['loyaltyPoints'], requiresHuman: false, contextPreserved: true,
    };
  }

  simpleReply(ctx: ReplyContext, message: string): StructuredReply {
    return {
      mode: 'NORMAL', purpose: 'INFORM',
      message, factsUsed: [], requiresHuman: false, contextPreserved: true,
    };
  }

  greetingReply(ctx: ReplyContext): StructuredReply {
    const { isNewCustomer, isReturningCustomer, isMorning, customerName, hasUsualOrder, hasActiveOrder } = ctx;

    if (hasActiveOrder) {
      return {
        mode: 'NORMAL', purpose: 'TRACK',
        message: this.pickOne(GREETING_RESPONSES.activeOrder),
        buttons: [[{ label: 'متابعة الطلب', action: 'TRACK_ORDER' }, { label: 'طلب جديد', action: 'NEW_ORDER' }]],
        factsUsed: ['orderStatus'], requiresHuman: false, contextPreserved: true,
      };
    }

    if (isReturningCustomer && isMorning) {
      const greeting = this.pickOne(GREETING_RESPONSES.morningReturning).replace('{name}', customerName || '');
      return {
        mode: 'NORMAL', purpose: 'CLARIFY',
        message: greeting,
        buttons: hasUsualOrder
          ? [[{ label: 'كرر المعتاد', action: 'REPEAT_USUAL' }, { label: 'جديد', action: 'NEW_ORDER' }]]
          : [[{ label: '☕ اطلب دلوقتي', action: 'NEW_ORDER' }]],
        factsUsed: ['usualOrder'], requiresHuman: false, contextPreserved: true,
      };
    }

    if (isReturningCustomer) {
      return {
        mode: 'NORMAL', purpose: 'CLARIFY',
        message: `أهلًا يا ${customerName || 'حبيب'} ☕\نورتنا مرة تانية.`,
        buttons: hasUsualOrder
          ? [[{ label: 'كرر المعتاد', action: 'REPEAT_USUAL' }, { label: 'جديد', action: 'NEW_ORDER' }]]
          : [[{ label: '☕ اطلب دلوقتي', action: 'NEW_ORDER' }]],
        factsUsed: [], requiresHuman: false, contextPreserved: true,
      };
    }

    return {
      mode: 'GUIDED', purpose: 'UNDERSTAND',
      message: this.pickOne(GREETING_RESPONSES.firstTime),
      buttons: [[{ label: '☕ مشروب', action: 'MENU_DRINKS' }, { label: '🥐 فطار', action: 'MENU_BREAKFAST' }]],
      factsUsed: [], requiresHuman: false, contextPreserved: true,
    };
  }

  clarificationReply(ctx: ReplyContext, field: string): StructuredReply {
    switch (field) {
      case 'type':
        return {
          mode: 'NORMAL', purpose: 'CLARIFY',
          message: 'تحب تركي ولا إسبريسو؟',
          buttons: [[{ label: 'تركي', action: 'SELECT_TYPE', extra: 'turco' }, { label: 'إسبريسو', action: 'SELECT_TYPE', extra: 'espresso' }]],
          factsUsed: [], requiresHuman: false, contextPreserved: true,
        };
      case 'sugar':
        return {
          mode: 'NORMAL', purpose: 'CLARIFY',
          message: 'السكر خفيف ولا مظبوط ولا زيادة؟',
          buttons: [[{ label: 'خفيف', action: 'SUGAR_LIGHT' }, { label: 'مظبوط', action: 'SUGAR_NORMAL' }, { label: 'زيادة', action: 'SUGAR_EXTRA' }]],
          factsUsed: [], requiresHuman: false, contextPreserved: true,
        };
      case 'blend':
        return {
          mode: 'NORMAL', purpose: 'CLARIFY',
          message: 'تحبها محوج ولا غير محوج؟',
          buttons: [[{ label: 'محوج', action: 'BLEND_MIXED' }, { label: 'غير محوج', action: 'BLEND_PURE' }]],
          factsUsed: [], requiresHuman: false, contextPreserved: true,
        };
      case 'roast':
        return {
          mode: 'NORMAL', purpose: 'CLARIFY',
          message: 'تحب القهوة فاتح، وسط، ولا غامق؟',
          buttons: [[{ label: 'فاتح', action: 'ROAST_LIGHT' }, { label: 'وسط', action: 'ROAST_MEDIUM' }, { label: 'غامق', action: 'ROAST_DARK' }]],
          factsUsed: [], requiresHuman: false, contextPreserved: true,
        };
      case 'temp':
        return {
          mode: 'NORMAL', purpose: 'CLARIFY',
          message: 'تحب مشروب سخن ولا ساقع؟',
          buttons: [[{ label: '☕ سخن', action: 'MENU_HOT' }, { label: '🧊 ساقع', action: 'MENU_COLD' }]],
          factsUsed: [], requiresHuman: false, contextPreserved: true,
        };
      case 'quantity':
        return {
          mode: 'NORMAL', purpose: 'CLARIFY',
          message: 'كم الكمية؟',
          buttons: [[{ label: '1', action: 'QTY_1' }, { label: '2', action: 'QTY_2' }, { label: '3', action: 'QTY_3' }]],
          factsUsed: [], requiresHuman: false, contextPreserved: true,
        };
      default:
        return {
          mode: 'NORMAL', purpose: 'CLARIFY',
          message: 'ممكن توضح طلبك بكلمتين؟',
          factsUsed: [], requiresHuman: false, contextPreserved: true,
        };
    }
  }

  formatOrderSummary(items: { name: string; quantity: number; price: number }[],
    total: number, deliveryLocation?: string, paymentMethod?: string): string {
    const lines = items.map(i =>
      `${i.quantity}× ${i.name}${i.price ? ` = ${i.price * i.quantity} ج` : ''}`
    );
    const parts = ['طلبك:'];
    if (lines.length > 0) parts.push(lines.join('\n'));
    parts.push(`\nالإجمالي: ${total} جنيه`);
    if (deliveryLocation) parts.push(`التوصيل: ${deliveryLocation}`);
    if (paymentMethod) parts.push(`الدفع: ${paymentMethod}`);
    return parts.join('\n');
  }

  formatBalance(balance: number, dueDate?: string): string {
    let msg = `المتبقي عليك ${balance} جنيه.`;
    if (dueDate) msg += `\nموعد التسوية: ${dueDate}.`;
    return msg;
  }

  formatDeliveryEstimate(minutes: number): string {
    return `التوصيل المتوقع: ${minutes}–${minutes + 4} دقيقة.`;
  }

  pickOne(arr: string[]): string {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  varyAcknowledgement(): string {
    return this.pickOne(EGYPTIAN_ACKNOWLEDGMENTS);
  }

  varyConfirmationQuestion(): string {
    return this.pickOne(CONFIRMATION_QUESTIONS);
  }

  isUrgent(text: string): boolean {
    return URGENT_SIGNAL_PATTERNS.some(p => text.includes(p));
  }

  isComplaint(text: string): boolean {
    return /غ[لل]ط|خطأ|مشكله|مشكلة|ناقص|متأخر|حقك|تضايق/.test(text);
  }

  isAddressChange(text: string): boolean {
    return /محل تاني|عنوان تاني|مكان تاني|فين|هنا/.test(text);
  }

  isOneMore(text: string): boolean {
    return /واحده كمان|واحدة كمان|كمان|زياده|اضافه|تاني/.test(text);
  }

  isBalanceQuery(text: string): boolean {
    return /عليا كام|كام عليا|عليا فلوس|مديون|باقي|حسابي/.test(text);
  }

  isTrackingQuery(text: string): boolean {
    return /طلب فين|فين الطلب|تتبع|وصل|جه|توصيل/.test(text);
  }

  isRecommendation(text: string): boolean {
    return /تقترح|عندك|ايه المناسب|عايز حاجه|نوع|جديد|تعرف/.test(text);
  }

  isBudgetQuery(text: string): boolean {
    return /تحت \d+|اقل من \d+|في حدود|ميزانيه|ميزانية/.test(text);
  }
}
