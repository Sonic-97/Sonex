import { Injectable } from '@nestjs/common';
import {
  CustomerNeed,
  DeepCustomerIntent,
  NeedClarificationField,
  emptyCustomerNeed,
} from './customer-need.types';

type IntentPattern = { intent: DeepCustomerIntent; pattern: RegExp; evidence: string };

const INTENT_PATTERNS: IntentPattern[] = [
  { intent: 'HUMAN_ASSISTANCE', pattern: /(?:عايز|محتاج|هات|وصلني|كلمني).*(?:حد|بني ادم|شخص|موظف|مدير)|(?:خدمه العملاء|human|agent)/, evidence: 'human_assistance' },
  { intent: 'COMPLAINT', pattern: /(?:شكوى|مشكله|زعلان|متضايق|الطلب غلط|وصل بايظ|وحش|اتاخرتوا|متأخر جدا)/, evidence: 'complaint' },
  { intent: 'REPEAT_USUAL_ORDER', pattern: /(?:هات|عايز|اعمل|نفس).*(?:المعتاد|العادي|اللي فات|اخر طلب|زي امبارح|زي الصبح)|(?:كرر|تكرار).*(?:الطلب|اخر طلب)|(?:كمان واحد زي اللي فات)/, evidence: 'repeat_order' },
  { intent: 'ENERGY_REQUEST', pattern: /(?:تفوقني|تفوق ني|فوقني|اصحصح|اصحصحني|تصحصحني|تصحصهني|مصحصح|افوق|طاقه|تعبان.*(?:حاجه|اشرب)|عايز كافيين)/, evidence: 'energy_goal' },
  { intent: 'MOOD_IMPROVEMENT_REQUEST', pattern: /(?:تروقني|اروق|تظبط مزاجي|تحسن مزاجي|تعدل المود|مزاج|مخنوق.*(?:حاجه|اشرب)|comfort)/, evidence: 'comfort_goal' },
  { intent: 'BREAKFAST_REQUEST', pattern: /(?:فطار|افطر|breakfast)/, evidence: 'breakfast' },
  { intent: 'LIGHT_FOOD_REQUEST', pattern: /(?:اكل|فطار|سناك|حاجه).*(?:خفيف|بسيط)|(?:سناك خفيف)/, evidence: 'light_food' },
  { intent: 'FILLING_FOOD_REQUEST', pattern: /(?:اكل|حاجه).*(?:تشبع|مشبعه|تقيله)|(?:جعان اوي|هموت من الجوع)/, evidence: 'filling_food' },
  { intent: 'GROUP_ORDER_REQUEST', pattern: /(?:لينا كلنا|للمكتب|للشله|لجروب|لمجموعه|ل[ـ ]?\d+ افراد|احنا \d+|للناس كلها)/, evidence: 'group_order' },
  { intent: 'NEW_PRODUCT_REQUEST', pattern: /(?:حاجه جديده|اجرب جديد|منتج جديد|new product|new drink)/, evidence: 'wants_new' },
  { intent: 'SAFE_FAMILIAR_CHOICE', pattern: /(?:حاجه مضمونه|حاجه معروفه|مش عايز اجرب|اختيار امن|المعتاد|العادي)/, evidence: 'familiar_choice' },
  { intent: 'EXPLORATION_REQUEST', pattern: /(?:رشحلي|اقترحلي|وريني اختيارات|عايز اجرب|نجرب ايه|explore)/, evidence: 'exploration' },
  { intent: 'HELP_ME_CHOOSE', pattern: /(?:مش عارف اختار|اختارلي|ساعدني اختار|ايه الاحسن|عايز حاجه بس|اي حاجه حلوه)/, evidence: 'help_choose' },
  { intent: 'SCHEDULED_ORDER', pattern: /(?:بكره|بكره|غدا|بعد شويه|الساعة|الساعه|موعد|مجدول|schedule|later)/, evidence: 'scheduled' },
  { intent: 'URGENT_DELIVERY_REQUEST', pattern: /(?:التوصيل|الاوردر|الطلب).*(?:حالا|دلوقتي|فورا|ضروري|مستعجل)|(?:يوصل حالا|عايزه فوراً)/, evidence: 'urgent_delivery' },
  { intent: 'QUICK_ORDER', pattern: /(?:على السريع|علي السريع|عالسريع|بسرعه|مستعجل|وقت قليل|quick|asap)/, evidence: 'quick' },
  { intent: 'COLD_DRINK_REQUEST', pattern: /(?:ساقع|ساقعه|بارد|بارده|ايس|iced|cold)/, evidence: 'cold' },
  { intent: 'HOT_DRINK_REQUEST', pattern: /(?:سخن|سخنه|دافي|دافيه|ساخن|ساخنه|hot)/, evidence: 'hot' },
  { intent: 'LOW_SUGAR_REQUEST', pattern: /(?:مش مسكر|سكر قليل|سكر خفيف|من غير سكر|بدون سكر|قليل السكر|low sugar|no sugar)/, evidence: 'low_sugar' },
  { intent: 'SWEET_REQUEST', pattern: /(?:حاجه حلوه|حلو قوي|نفسي في حلو|(?:عايزها|خليها|تكون)\s+(?:مسكر|مسكره)|sweet)/, evidence: 'sweet' },
  { intent: 'LIGHT_DRINK_REQUEST', pattern: /(?:مشروب|حاجه).*(?:خفيف|بسيط)|(?:خفيف على المعده)/, evidence: 'light_drink' },
  { intent: 'STRONG_DRINK_REQUEST', pattern: /(?:مشروب|قهوه|حاجه).*(?:تقيل|قوي|سترونج)|(?:دبل شوت|strong)/, evidence: 'strong_drink' },
  { intent: 'BUDGET_REQUEST', pattern: /(?:تحت|حدود|معايا|ميزانيه|مايزدش عن|اقصى|ارخص|اقتصادي|budget|under)\s*(?:\d+|خمسين|سبعين|تمانين|تسعين|ميه|مائه)?/, evidence: 'budget' },
  { intent: 'CUSTOMIZATION_REQUEST', pattern: /(?:غير|بدل|زود|قلل|شيل|من غير|اضافه|عدل).*(?:سكر|لبن|شوت|حجم|تلج|مكون)|(?:customize|extra shot)/, evidence: 'customization' },
];

const PRIMARY_PRIORITY: DeepCustomerIntent[] = [
  'HUMAN_ASSISTANCE', 'COMPLAINT', 'REPEAT_USUAL_ORDER', 'ENERGY_REQUEST', 'MOOD_IMPROVEMENT_REQUEST',
  'BREAKFAST_REQUEST', 'LIGHT_FOOD_REQUEST', 'FILLING_FOOD_REQUEST', 'GROUP_ORDER_REQUEST',
  'NEW_PRODUCT_REQUEST', 'SAFE_FAMILIAR_CHOICE', 'EXPLORATION_REQUEST', 'HELP_ME_CHOOSE',
  'SCHEDULED_ORDER', 'URGENT_DELIVERY_REQUEST', 'QUICK_ORDER', 'LIGHT_DRINK_REQUEST',
  'STRONG_DRINK_REQUEST', 'COLD_DRINK_REQUEST', 'HOT_DRINK_REQUEST', 'LOW_SUGAR_REQUEST',
  'SWEET_REQUEST', 'BUDGET_REQUEST', 'CUSTOMIZATION_REQUEST', 'UNKNOWN_NEED',
];

@Injectable()
export class EgyptianArabicUnderstandingService {
  normalize(message: string): string {
    return message
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\u064b-\u065f\u0670]/g, '')
      .replace(/ـ/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
      .replace(/[^\p{L}\p{N}\s:@.-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  extract(message: string, context: { now?: Date; lastBotQuestion?: NeedClarificationField } = {}): CustomerNeed {
    const text = this.normalize(message);
    const need = emptyCustomerNeed();
    if (!text) return need;

    const intents: DeepCustomerIntent[] = [];
    for (const rule of INTENT_PATTERNS) {
      if (rule.pattern.test(text)) {
        intents.push(rule.intent);
        need.evidence.push(rule.evidence);
      }
    }

    this.applyContextualAnswer(text, context.lastBotQuestion, need, intents);
    this.applyDimensions(text, need, intents);

    need.intents = [...new Set(intents)];
    if (!need.intents.length) need.intents = ['UNKNOWN_NEED'];
    need.primaryIntent = PRIMARY_PRIORITY.find((intent) => need.intents.includes(intent)) || 'UNKNOWN_NEED';

    const strongSignals = need.evidence.length;
    need.confidence = need.primaryIntent === 'UNKNOWN_NEED'
      ? (strongSignals ? 0.52 : 0.25)
      : Math.min(0.98, 0.78 + strongSignals * 0.04);
    need.confidenceLevel = need.confidence >= 0.8 ? 'HIGH' : need.confidence >= 0.55 ? 'MEDIUM' : 'LOW';

    const now = context.now || new Date();
    const hour = now.getHours();
    need.morningFastMode = hour >= 6 && hour < 11 && (
      need.conversationStyle === 'FAST' ||
      need.urgency === 'HIGH' ||
      need.urgency === 'IMMEDIATE' ||
      need.primaryIntent === 'ENERGY_REQUEST'
    );
    return need;
  }

  private applyContextualAnswer(
    text: string,
    lastQuestion: NeedClarificationField | undefined,
    need: CustomerNeed,
    intents: DeepCustomerIntent[],
  ): void {
    if (lastQuestion === 'requestType') {
      if (/^(?:مشروب|شرب|drink)/.test(text)) {
        need.food = 'NONE';
        need.evidence.push('context_drink');
        intents.push('HELP_ME_CHOOSE');
      } else if (/^(?:اكل|طعام|food)/.test(text)) {
        need.desiredEffect = 'HUNGER_RELIEF';
        need.evidence.push('context_food');
        intents.push('HELP_ME_CHOOSE');
      }
    }
    if (lastQuestion === 'temperature') {
      if (/^(?:ساقع|بارد|ايس|cold)/.test(text)) intents.push('COLD_DRINK_REQUEST');
      if (/^(?:سخن|دافي|ساخن|hot)/.test(text)) intents.push('HOT_DRINK_REQUEST');
    }
    if (lastQuestion === 'foodWeight') {
      if (/خفيف/.test(text)) intents.push('LIGHT_FOOD_REQUEST');
      if (/تقيل|مشبع|يشبع/.test(text)) intents.push('FILLING_FOOD_REQUEST');
    }
  }

  private applyDimensions(text: string, need: CustomerNeed, intents: DeepCustomerIntent[]): void {
    const has = (intent: DeepCustomerIntent) => intents.includes(intent);
    if (has('ENERGY_REQUEST')) {
      need.desiredEffect = 'ENERGY';
      need.caffeine = /من غير كافيين|بدون كافيين/.test(text) ? 'NONE' : 'HIGH';
    }
    if (has('MOOD_IMPROVEMENT_REQUEST')) need.desiredEffect = 'RELAXATION';
    if (has('COLD_DRINK_REQUEST')) {
      need.temperature = 'COLD';
      if (!need.desiredEffect) need.desiredEffect = 'REFRESHMENT';
    }
    if (has('HOT_DRINK_REQUEST')) need.temperature = 'HOT';
    if (/مش فارقه.*(?:سخن|ساقع)|سخن او ساقع|any temperature/.test(text)) need.temperature = 'ANY';

    if (has('LOW_SUGAR_REQUEST')) need.sweetness = /من غير سكر|بدون سكر|no sugar/.test(text) ? 'NONE' : 'LOW';
    if (has('SWEET_REQUEST')) {
      need.sweetness = 'HIGH';
      if (!need.desiredEffect) need.desiredEffect = 'SWEET_CRAVING';
    }
    if (/سكر مظبوط|سكر وسط/.test(text)) need.sweetness = 'MEDIUM';

    if (has('STRONG_DRINK_REQUEST')) need.caffeine = 'HIGH';
    if (has('LIGHT_DRINK_REQUEST')) need.caffeine = need.caffeine || 'LOW';
    if (/من غير كافيين|بدون كافيين|decaf/.test(text)) need.caffeine = 'NONE';

    if (has('BREAKFAST_REQUEST')) {
      need.food = 'BREAKFAST';
      need.desiredEffect = need.desiredEffect || 'HUNGER_RELIEF';
    }
    if (has('LIGHT_FOOD_REQUEST')) {
      need.food = 'LIGHT';
      need.desiredEffect = 'HUNGER_RELIEF';
    }
    if (has('FILLING_FOOD_REQUEST')) {
      need.food = 'FILLING';
      need.desiredEffect = 'HUNGER_RELIEF';
    }
    if (/(?:مشروب|اشرب|drink)/.test(text) && !need.food) need.food = 'NONE';

    if (has('NEW_PRODUCT_REQUEST')) need.novelty = 'WANTS_NEW';
    else if (has('EXPLORATION_REQUEST')) need.novelty = 'OPEN_TO_NEW';
    else if (has('SAFE_FAMILIAR_CHOICE') || has('REPEAT_USUAL_ORDER')) need.novelty = 'FAMILIAR';

    const budget = this.extractBudget(text);
    if (budget !== null) {
      need.budgetMax = budget;
      need.budgetSensitivity = 'EXPLICIT_LIMIT';
      if (!has('BUDGET_REQUEST')) intents.push('BUDGET_REQUEST');
      need.evidence.push('explicit_budget');
    } else if (/ارخص|اقتصادي|على قد الايد/.test(text)) {
      need.budgetSensitivity = 'HIGH';
    }

    if (has('URGENT_DELIVERY_REQUEST')) {
      need.urgency = 'IMMEDIATE';
      need.timing = 'NOW';
      need.conversationStyle = 'FAST';
    } else if (has('QUICK_ORDER')) {
      need.urgency = 'HIGH';
      need.timing = 'NOW';
      need.conversationStyle = 'FAST';
      need.desiredEffect = need.desiredEffect || 'QUICK_BREAK';
    }
    if (has('EXPLORATION_REQUEST') || has('NEW_PRODUCT_REQUEST')) need.conversationStyle = need.conversationStyle || 'EXPLORING';
    if (has('HELP_ME_CHOOSE')) need.conversationStyle = need.conversationStyle || 'GUIDED';

    if (has('SCHEDULED_ORDER')) {
      need.timing = 'SCHEDULED';
      need.scheduledFor = this.extractSchedule(text);
    } else if (!need.timing && /دلوقتي|حالا|now/.test(text)) {
      need.timing = 'NOW';
    }

    if (has('GROUP_ORDER_REQUEST')) {
      need.desiredEffect = 'SOCIAL_SHARING';
      need.groupSize = this.extractGroupSize(text);
    }
    if (has('REPEAT_USUAL_ORDER')) need.desiredEffect = 'ROUTINE';
  }

  private extractBudget(text: string): number | null {
    if (!/(?:تحت|حدود|معايا|ميزانيه|مايزدش عن|اقصى|ارخص من|budget|under)/.test(text)) return null;
    const numeric = text.match(/(?:تحت|حدود|معايا|ميزانيه|مايزدش عن|اقصى|ارخص من|budget|under)\s*(\d{1,5})/);
    if (numeric) return Number(numeric[1]);
    const words: Record<string, number> = {
      خمسين: 50, ستين: 60, سبعين: 70, تمانين: 80, ثمانين: 80, تسعين: 90,
      ميه: 100, مائه: 100, ميتين: 200, مئتين: 200,
    };
    for (const [word, value] of Object.entries(words)) {
      if (text.includes(word)) return value;
    }
    return null;
  }

  private extractGroupSize(text: string): number | null {
    const match = text.match(/(?:احنا|لـ?|ل)\s*(\d{1,2})\s*(?:افراد|اشخاص|ناس)?/);
    return match ? Math.max(2, Number(match[1])) : null;
  }

  private extractSchedule(text: string): string | null {
    const time = text.match(/(?:الساعه|الساعة|at)\s*(\d{1,2})(?::(\d{2}))?/);
    const day = /بكره|غدا/.test(text) ? 'TOMORROW' : /النهارده|اليوم/.test(text) ? 'TODAY' : null;
    if (!time && !day) return null;
    return [day, time ? `${time[1].padStart(2, '0')}:${time[2] || '00'}` : null].filter(Boolean).join(' ');
  }
}
