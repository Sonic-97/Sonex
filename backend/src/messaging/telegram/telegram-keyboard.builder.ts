import { Injectable } from '@nestjs/common';
import { InlineKeyboardMarkup, ReplyKeyboardMarkup } from '../interfaces/messaging-provider.interface';
import { QuickAction } from './quick-action.service';

@Injectable()
export class TelegramKeyboardBuilder {
  buildCallback(action: QuickAction, refId: string, extra?: string): string {
    return `${action}:1:${refId}${extra ? ':' + extra : ''}`;
  }

  mainMenu(refId?: string): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [{ text: '☕ اطلب دلوقتي', callback_data: refId ? this.buildCallback(QuickAction.NEW_ORDER, refId) : 'menu:start' }],
      ],
    };
  }

  usualOrderActions(refId: string): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          { text: 'تأكيد', callback_data: this.buildCallback(QuickAction.CONFIRM_DRAFT, refId) },
          { text: 'تعديل', callback_data: this.buildCallback(QuickAction.EDIT_DRAFT, refId) },
        ],
        [
          { text: 'طلب جديد', callback_data: this.buildCallback(QuickAction.NEW_ORDER, refId) },
        ],
      ],
    };
  }

  postOrderActions(refId: string): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          { text: 'متابعة الطلب', callback_data: this.buildCallback(QuickAction.TRACK_ORDER, refId) },
          { text: '+ واحدة كمان', callback_data: this.buildCallback(QuickAction.ORDER_ONE_MORE, refId) },
        ],
        [
          { text: 'مساعدة', callback_data: this.buildCallback(QuickAction.REQUEST_HUMAN, refId) },
        ],
      ],
    };
  }

  modificationMenu(refId: string, isCoffee: boolean): InlineKeyboardMarkup {
    const rows: InlineKeyboardMarkup['inline_keyboard'] = [
      [{ text: 'الكمية', callback_data: this.buildCallback(QuickAction.CHANGE_QTY, refId) }],
    ];
    if (isCoffee) {
      rows.push(
        [{ text: 'درجة القهوة', callback_data: this.buildCallback(QuickAction.CHANGE_ROAST, refId) }],
        [{ text: 'التحويج', callback_data: this.buildCallback(QuickAction.CHANGE_BLEND, refId) }],
        [{ text: 'السكر', callback_data: this.buildCallback(QuickAction.CHANGE_SUGAR, refId) }],
      );
    }
    rows.push(
      [{ text: 'العنوان', callback_data: this.buildCallback(QuickAction.CHANGE_LOCATION, refId) }],
      [{ text: 'الدفع', callback_data: this.buildCallback(QuickAction.CHANGE_PAYMENT, refId) }],
      [{ text: 'رجوع', callback_data: this.buildCallback(QuickAction.CONFIRM_DRAFT, refId) }],
    );
    return { inline_keyboard: rows };
  }

  quickActions(refId: string, hasActiveOrder: boolean): InlineKeyboardMarkup {
    const rows: InlineKeyboardMarkup['inline_keyboard'] = [
      [
        { text: 'كرر المعتاد', callback_data: this.buildCallback(QuickAction.REPEAT_USUAL, refId) },
        { text: 'كرر آخر طلب', callback_data: this.buildCallback(QuickAction.REPEAT_LAST, refId) },
      ],
      [
        { text: 'طلب جديد', callback_data: this.buildCallback(QuickAction.NEW_ORDER, refId) },
      ],
    ];
    if (hasActiveOrder) {
      rows.unshift([
        { text: 'متابعة الطلب', callback_data: this.buildCallback(QuickAction.TRACK_ORDER, refId) },
        { text: '+ واحدة كمان', callback_data: this.buildCallback(QuickAction.ORDER_ONE_MORE, refId) },
      ]);
    }
    rows.push([
      { text: 'حسابي', callback_data: this.buildCallback(QuickAction.VIEW_BALANCE, refId) },
      { text: 'طلباتي', callback_data: this.buildCallback(QuickAction.VIEW_RECENT, refId) },
    ]);
    rows.push([
      { text: 'مساعدة', callback_data: this.buildCallback(QuickAction.REQUEST_HUMAN, refId) },
    ]);
    return { inline_keyboard: rows };
  }

  morningQuickActions(refId: string): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          { text: 'كرر المعتاد', callback_data: this.buildCallback(QuickAction.REPEAT_USUAL, refId) },
          { text: 'طلب جديد', callback_data: this.buildCallback(QuickAction.NEW_ORDER, refId) },
        ],
        [
          { text: 'حسابي', callback_data: this.buildCallback(QuickAction.VIEW_BALANCE, refId) },
          { text: 'متابعة آخر طلب', callback_data: this.buildCallback(QuickAction.REPEAT_LAST, refId) },
        ],
      ],
    };
  }

  summaryActions(refId: string): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          { text: 'تأكيد', callback_data: this.buildCallback(QuickAction.CONFIRM_DRAFT, refId) },
          { text: 'تعديل', callback_data: this.buildCallback(QuickAction.EDIT_DRAFT, refId) },
          { text: 'إلغاء', callback_data: this.buildCallback(QuickAction.CANCEL_DRAFT, refId) },
        ],
      ],
    };
  }

  deliveryLocations(
    refId: string,
    locations: Array<{ id: string; name: string; isDefault: boolean }>,
  ): InlineKeyboardMarkup {
    const rows: InlineKeyboardMarkup['inline_keyboard'] = locations.map(loc => [{
      text: `${loc.isDefault ? '📍' : '📌'} ${loc.name}`,
      callback_data: this.buildCallback(QuickAction.SELECT_LOCATION, refId, loc.id),
    }]);
    rows.push([{ text: '🔙 رجوع', callback_data: this.buildCallback(QuickAction.EDIT_DRAFT, refId) }]);
    return { inline_keyboard: rows };
  }

  paymentMethods(refId: string, methods: string[]): InlineKeyboardMarkup {
    const rows: InlineKeyboardMarkup['inline_keyboard'] = methods.map(m => [{
      text: m === 'كاش' ? '💰 كاش' : m === 'الرصيد' ? '💳 الرصيد' : m,
      callback_data: this.buildCallback(QuickAction.SELECT_PAYMENT, refId, m),
    }]);
    rows.push([{ text: '🔙 رجوع', callback_data: this.buildCallback(QuickAction.EDIT_DRAFT, refId) }]);
    return { inline_keyboard: rows };
  }

  balanceActions(refId: string): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          { text: 'تفاصيل', callback_data: this.buildCallback(QuickAction.VIEW_RECENT, refId) },
          { text: 'رجوع للطلب', callback_data: this.buildCallback(QuickAction.NEW_ORDER, refId) },
        ],
      ],
    };
  }

  confirmCancelActions(refId: string): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          { text: 'إلغاء الطلب', callback_data: this.buildCallback(QuickAction.CANCEL_DRAFT, refId) },
          { text: 'رجوع', callback_data: this.buildCallback(QuickAction.CONFIRM_DRAFT, refId) },
        ],
      ],
    };
  }

  draftRecoveryActions(refId: string): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          { text: 'نكمل', callback_data: this.buildCallback(QuickAction.CONFIRM_DRAFT, refId) },
          { text: 'تعديل', callback_data: this.buildCallback(QuickAction.EDIT_DRAFT, refId) },
          { text: 'إلغاء', callback_data: this.buildCallback(QuickAction.CANCEL_DRAFT, refId) },
        ],
      ],
    };
  }

  complaintActions(refId: string): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          { text: 'تمام', callback_data: this.buildCallback(QuickAction.NEW_ORDER, refId) },
          { text: 'فيه مشكلة', callback_data: this.buildCallback(QuickAction.REQUEST_HUMAN, refId) },
        ],
      ],
    };
  }

  complaintReasonActions(refId: string): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          { text: 'الطلب ناقص', callback_data: this.buildCallback(QuickAction.REQUEST_HUMAN, refId, 'ناقص') },
          { text: 'الطلب غلط', callback_data: this.buildCallback(QuickAction.REQUEST_HUMAN, refId, 'غلط') },
        ],
        [
          { text: 'اتأخر', callback_data: this.buildCallback(QuickAction.REQUEST_HUMAN, refId, 'تأخير') },
          { text: 'الجودة', callback_data: this.buildCallback(QuickAction.REQUEST_HUMAN, refId, 'جودة') },
        ],
        [
          { text: 'مشكلة دفع', callback_data: this.buildCallback(QuickAction.REQUEST_HUMAN, refId, 'دفع') },
          { text: 'كلم حد', callback_data: this.buildCallback(QuickAction.REQUEST_HUMAN, refId, 'كلم') },
        ],
      ],
    };
  }

  errorRecoveryActions(refId: string): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          { text: 'حاول تاني', callback_data: this.buildCallback(QuickAction.NEW_ORDER, refId) },
          { text: 'كلم حد', callback_data: this.buildCallback(QuickAction.REQUEST_HUMAN, refId) },
          { text: 'إلغاء', callback_data: this.buildCallback(QuickAction.CANCEL_DRAFT, refId) },
        ],
      ],
    };
  }

  categories(categories: Array<{ id: string; name: string; emoji: string }>): InlineKeyboardMarkup {
    const rows: InlineKeyboardMarkup['inline_keyboard'] = [];
    for (let i = 0; i < categories.length; i += 2) {
      const row = categories.slice(i, i + 2).map(cat => ({
        text: `${cat.emoji} ${cat.name}`,
        callback_data: `menu:category:${cat.id}`,
      }));
      rows.push(row);
    }
    rows.push([{ text: '🔙 رجوع', callback_data: 'menu:main' }]);
    return { inline_keyboard: rows };
  }

  products(categoryId: string, products: Array<{ id: string; name: string; price: number }>): InlineKeyboardMarkup {
    const rows: InlineKeyboardMarkup['inline_keyboard'] = products.map(p => [{
      text: `${p.name} - ${p.price} ج.م`,
      callback_data: `order:product:${p.id}`,
    }]);
    rows.push([{ text: '🔙 رجوع', callback_data: 'menu:category:' + categoryId }]);
    return { inline_keyboard: rows };
  }

  allProducts(products: Array<{ id: string; name: string; price: number }>): InlineKeyboardMarkup {
    const rows: InlineKeyboardMarkup['inline_keyboard'] = products.map(p => [{
      text: `${p.name} - ${p.price} ج.م`,
      callback_data: `order:product:${p.id}`,
    }]);
    return { inline_keyboard: rows };
  }

  quantitySelector(productId: string, current: number, refId?: string): InlineKeyboardMarkup {
    const prefix = refId ? `${QuickAction.CHANGE_QTY}:1:${refId}:${productId}:` : `order:qty:${productId}:`;
    return {
      inline_keyboard: [
        [
          { text: '➖', callback_data: `${prefix}${Math.max(1, current - 1)}` },
          { text: ` ${current} `, callback_data: 'noop' },
          { text: '➕', callback_data: `${prefix}${current + 1}` },
        ],
        [{ text: refId ? '✅ موافق' : '✅ أضف للطلب', callback_data: refId
          ? this.buildCallback(QuickAction.CONFIRM_DRAFT, refId)
          : `order:add:${productId}:${current}` }],
        [{ text: '🔙 رجوع', callback_data: refId
          ? this.buildCallback(QuickAction.EDIT_DRAFT, refId)
          : 'menu:start' }],
      ],
    };
  }

  orderConfirmation(chatId: string): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          { text: '✅ تأكيد الطلب', callback_data: 'confirm:order' },
          { text: '❌ إلغاء', callback_data: 'cancel:order' },
        ],
      ],
    };
  }

  orderStatus(orderId: string): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [{ text: '📊 حالة الطلب', callback_data: `status:${orderId}` }],
      ],
    };
  }

  requestContactButton(): ReplyKeyboardMarkup {
    return {
      keyboard: [[{
        text: '📱 إرسال رقمي',
        request_contact: true,
      }]],
      one_time_keyboard: true,
      resize_keyboard: true,
    };
  }

  removeKeyboard(): ReplyKeyboardMarkup {
    return {
      keyboard: [],
      remove_keyboard: true,
    };
  }
}
