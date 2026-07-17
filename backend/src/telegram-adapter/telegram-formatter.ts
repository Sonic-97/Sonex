import { Injectable } from '@nestjs/common';
import { AiCommerceDecision } from '../commerce-brain/commerce-brain.types';
import { ActionPlan } from '../action-planner/action-planner.types';
import { ExecutionResult } from '../action-executor/action-executor.types';
import { TelegramResponse, TelegramKeyboard, InlineKeyboardRow } from './telegram-adapter.types';

@Injectable()
export class TelegramFormatter {
  formatDecision(decision: AiCommerceDecision, plan: ActionPlan, result: ExecutionResult | null, chatId: string): TelegramResponse {
    if (result && result.success) {
      return this.formatSuccess(decision, plan, result, chatId);
    }
    if (plan.blockingReasons.length > 0) {
      return this.formatBlocked(plan, chatId);
    }
    return this.formatInfo(decision, chatId);
  }

  formatSuccess(decision: AiCommerceDecision, plan: ActionPlan, result: ExecutionResult, chatId: string): TelegramResponse {
    const lines: string[] = [];
    const actionName = this.actionLabel(plan.intent);
    lines.push(`✅ ${actionName}`);
    lines.push('');

    for (const step of result.steps) {
      const icon = step.status === 'SUCCEEDED' ? '✅' : step.status === 'SKIPPED' ? '⏭️' : '❌';
      lines.push(`${icon} ${this.stepLabel(step.action)}`);
    }

    if (plan.blockingReasons.length > 0) {
      lines.push('');
      lines.push('⚠️ ملاحظات:');
      for (const b of plan.blockingReasons) {
        lines.push(`• ${b.reason}`);
      }
    }

    return {
      chatId,
      text: lines.join('\n'),
      parseMode: 'HTML',
    };
  }

  formatBlocked(plan: ActionPlan, chatId: string): TelegramResponse {
    const lines: string[] = ['⚠️ لا يمكن تنفيذ الطلب حالياً:', ''];
    for (const b of plan.blockingReasons) {
      const icon = b.severity === 'hard' ? '🔴' : '🟡';
      lines.push(`${icon} ${b.reason}`);
    }

    const keyboard: TelegramKeyboard = {
      inlineKeyboard: [{ buttons: [{ text: '🔄 محاولة مرة أخرى', callbackData: 'menu:start' }] }],
    };

    return { chatId, text: lines.join('\n'), parseMode: 'HTML', replyMarkup: keyboard };
  }

  formatInfo(decision: AiCommerceDecision, chatId: string): TelegramResponse {
    return {
      chatId,
      text: decision.structuredReplyData.bodyKey ? `ℹ️ ${decision.structuredReplyData.bodyKey}` : '👍',
      parseMode: 'HTML',
    };
  }

  formatError(chatId: string, error: string): TelegramResponse {
    return {
      chatId,
      text: `❌ حدث خطأ: ${error}\n\nيرجى المحاولة مرة أخرى لاحقاً.`,
      parseMode: 'HTML',
    };
  }

  formatClarification(decision: AiCommerceDecision, chatId: string): TelegramResponse {
    const lines: string[] = ['🤔 هل تقصد:'];

    for (const mf of decision.missingInformation) {
      const choices = mf.choices?.length ? ` (${mf.choices.join(', ')})` : '';
      lines.push(`• ${mf.reason || mf.field}${choices}`);
    }

    const keyboard = this.buildClarificationKeyboard(decision);
    return { chatId, text: lines.join('\n'), parseMode: 'HTML', replyMarkup: keyboard };
  }

  formatConfirmation(plan: ActionPlan, chatId: string): TelegramResponse {
    const lines: string[] = ['📋 تأكيد الطلب:', ''];
    for (const step of plan.steps) {
      lines.push(`• ${this.stepLabel(step.action)}`);
    }
    lines.push('');
    lines.push('هل تريد المتابعة؟');

    return {
      chatId,
      text: lines.join('\n'),
      parseMode: 'HTML',
      replyMarkup: {
        inlineKeyboard: [{ buttons: [{ text: '✅ تأكيد', callbackData: 'adapter:confirm' }, { text: '❌ إلغاء', callbackData: 'adapter:cancel' }] }],
      },
    };
  }

  buildClarificationKeyboard(decision: AiCommerceDecision): TelegramKeyboard | undefined {
    const fields = decision.missingInformation.filter(m => m.choices && m.choices.length > 0);
    if (fields.length === 0) return undefined;

    const rows: InlineKeyboardRow[] = [];
    for (const field of fields) {
      if (field.choices) {
        for (let i = 0; i < field.choices.length; i += 2) {
          const pair = field.choices.slice(i, i + 2);
          rows.push({ buttons: pair.map(c => ({ text: c, callbackData: `adapter:choose:${field.field}:${c}` })) });
        }
      }
    }
    return { inlineKeyboard: rows };
  }

  actionLabel(intent: string): string {
    const labels: Record<string, string> = {
      ORDER: 'تم إنشاء الطلب',
      MODIFY_ORDER: 'تم تعديل الطلب',
      CANCEL_ORDER: 'تم إلغاء الطلب',
      REORDER: 'تم إعادة الطلب',
    };
    return labels[intent] || 'تمت المعالجة';
  }

  stepLabel(action: string): string {
    const labels: Record<string, string> = {
      CreateOrder: 'إنشاء الطلب',
      ModifyOrder: 'تعديل الطلب',
      CancelOrder: 'إلغاء الطلب',
      ReserveInventory: 'حجز المخزون',
      NotifyMerchant: 'إشعار التاجر',
      NotifyDriverDispatcher: 'تحديد السائق',
      RequestPayment: 'الدفع',
      ShowProducts: 'عرض المنتجات',
      AskForQuantity: 'طلب الكمية',
      AskForOption: 'طلب الخيارات',
      AskForAddress: 'طلب العنوان',
      AnswerInformation: 'معلومات',
    };
    return labels[action] || action;
  }
}
