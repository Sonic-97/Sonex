import { Injectable } from '@nestjs/common';
import { CustomerNeed, NeedClarification, NeedClarificationField } from './customer-need.types';

@Injectable()
export class ClarificationPolicyService {
  nextQuestion(
    need: CustomerNeed,
    clarificationCount = 0,
    lastQuestion?: NeedClarificationField,
  ): NeedClarification | null {
    if (clarificationCount >= 2) return null;
    if (['REPEAT_USUAL_ORDER', 'HUMAN_ASSISTANCE', 'COMPLAINT'].includes(need.primaryIntent)) return null;

    if (need.primaryIntent === 'SCHEDULED_ORDER' && !need.scheduledFor && lastQuestion !== 'scheduledFor') {
      return { field: 'scheduledFor', question: 'تحب الطلب إمتى بالضبط؟' };
    }
    if (need.primaryIntent === 'GROUP_ORDER_REQUEST' && !need.groupSize && lastQuestion !== 'groupSize') {
      return { field: 'groupSize', question: 'الطلب لكام شخص؟' };
    }

    const fastEnough = need.morningFastMode || need.urgency === 'HIGH' || need.urgency === 'IMMEDIATE';
    if (need.primaryIntent === 'ENERGY_REQUEST' && !need.temperature && !fastEnough && lastQuestion !== 'temperature') {
      return { field: 'temperature', question: 'تحبها سخنة ولا ساقعة؟' };
    }

    const foodIntent = ['BREAKFAST_REQUEST', 'LIGHT_FOOD_REQUEST', 'FILLING_FOOD_REQUEST'].includes(need.primaryIntent);
    if (foodIntent && !need.food && lastQuestion !== 'foodWeight') {
      return { field: 'foodWeight', question: 'تحب أكل خفيف ولا حاجة تشبع؟' };
    }

    const unknownType = ['UNKNOWN_NEED', 'HELP_ME_CHOOSE', 'BUDGET_REQUEST'].includes(need.primaryIntent);
    if (unknownType && need.food === null && lastQuestion !== 'requestType') {
      return { field: 'requestType', question: 'تحب مشروب ولا أكل؟' };
    }

    if (need.confidenceLevel === 'LOW' && lastQuestion !== 'goal') {
      return { field: 'goal', question: 'عايز حاجة تفوقك، تروقك، ولا تسد الجوع؟' };
    }
    return null;
  }
}
