import { Injectable } from '@nestjs/common';
import {
  CommerceContext, AiCommerceDecision, CommerceIntent, NextAction,
  MissingField, Recommendation, ReasoningCode,
} from './commerce-brain.types';

@Injectable()
export class LocalDecisionEngine {
  decide(message: string, context: CommerceContext): AiCommerceDecision {
    const text = message.toLowerCase().trim();
    const { business, catalog, customer, activeOrder } = context;
    const matchedProducts = catalog.products.filter(p => text.includes(p.name.toLowerCase()));

    if (!business.workingNow) {
      return this.decision('SMALL_TALK', 'NO_ACTION', 'BUSINESS_CLOSED', 0.95, {
        bodyKey: 'business.closed',
        variables: { businessName: business.name },
      });
    }

    if (this.isGreeting(text)) {
      return this.decision('SMALL_TALK', 'NO_ACTION', 'CONTINUE_CONVERSATION', 0.9, {
        bodyKey: 'greeting.response',
        variables: { customerName: customer?.firstName || '' },
      });
    }

    if (this.isFarewell(text)) {
      return this.decision('SMALL_TALK', 'NO_ACTION', 'NO_ACTION_NEEDED', 0.9, {
        bodyKey: 'farewell.response',
      });
    }

    if (this.isHoursQuery(text)) {
      return this.decision('ASK_HOURS', 'ANSWER_INFORMATION', 'HOURS_KNOWN', 0.95, {
        bodyKey: 'hours.response',
        variables: { businessName: business.name },
      });
    }

    if (this.isDeliveryQuery(text)) {
      const available = business.deliveryAvailable || business.pickupAvailable;
      return this.decision('ASK_DELIVERY', 'ANSWER_INFORMATION', available ? 'CONTINUE_CONVERSATION' : 'DELIVERY_UNAVAILABLE', 0.9, {
        bodyKey: available ? 'delivery.available' : 'delivery.unavailable',
      });
    }

    if (this.isPaymentQuery(text)) {
      return this.decision('ASK_PAYMENT', 'ANSWER_INFORMATION', 'CONTINUE_CONVERSATION', 0.85, {
        bodyKey: 'payment.response',
      });
    }

    if (this.isPromotionQuery(text)) {
      if (business.promotionEnabled) {
        return this.decision('ASK_PROMOTION', 'SHOW_RECOMMENDATIONS', 'PROMOTION_AVAILABLE', 0.9, {
          bodyKey: 'promotion.response',
        });
      }
      return this.decision('ASK_PROMOTION', 'ANSWER_INFORMATION', 'NO_ACTION_NEEDED', 0.9, {
        bodyKey: 'promotion.none',
      });
    }

    if (this.isPriceQuery(text)) {
      if (matchedProducts.length === 1) {
        return this.decision('ASK_PRICE', 'ANSWER_INFORMATION', 'CONTINUE_CONVERSATION', 0.85, {
          bodyKey: 'price.response',
          variables: { productName: matchedProducts[0].name },
        });
      }
      if (matchedProducts.length > 1) {
        return this.decision('ASK_PRICE', 'SHOW_PRODUCTS', 'MULTIPLE_MATCHES', 0.7, {
          bodyKey: 'price.which_product',
        });
      }
      return this.decision('ASK_PRICE', 'ANSWER_INFORMATION', 'PRICE_NOT_FOUND', 0.6, {
        bodyKey: 'price.not_found',
      });
    }

    if (this.isProductQuery(text, catalog)) {
      if (matchedProducts.length === 0) {
        return this.decision('ASK_PRODUCT', 'SHOW_PRODUCTS', 'PRODUCT_NOT_FOUND', 0.7, {
          bodyKey: 'product.not_found',
        });
      }
      const missingOptions = this.findRequiredOptions(matchedProducts);
      const nextAction: NextAction = missingOptions.length > 0 ? 'ASK_OPTION' : 'ASK_QUANTITY';
      const code: ReasoningCode = missingOptions.length > 0 ? 'OPTION_REQUIRED' : 'CONTINUE_CONVERSATION';

      return {
        intent: 'ORDER',
        confidence: 0.75,
        requiredConfirmation: false,
        missingInformation: missingOptions,
        recommendations: [],
        nextAction,
        structuredReplyData: {
          bodyKey: missingOptions.length > 0 ? 'order.choose_options' : 'order.how_many',
          variables: { productName: matchedProducts[0].name },
        },
        extractedEntities: {
          productNames: matchedProducts.map(p => p.name),
        },
        reasoningCode: code,
      };
    }

    if (this.isCancelQuery(text, activeOrder)) {
      if (activeOrder && activeOrder.items.length > 0) {
        return this.decision('CANCEL_ORDER', 'CONFIRM_ORDER', 'ORDER_READY', 0.85, {
          bodyKey: 'cancel.confirm',
          requiredConfirmation: true,
        });
      }
      return this.decision('CANCEL_ORDER', 'NO_ACTION', 'NO_ACTION_NEEDED', 0.9, {
        bodyKey: 'cancel.no_order',
      });
    }

    if (this.isModifyQuery(text, activeOrder)) {
      if (activeOrder && activeOrder.items.length > 0) {
        return this.decision('MODIFY_ORDER', 'MODIFY_ORDER', 'CONTINUE_CONVERSATION', 0.8, {
          bodyKey: 'modify.how',
          requiredConfirmation: true,
        });
      }
      return this.decision('MODIFY_ORDER', 'NO_ACTION', 'NO_ACTION_NEEDED', 0.8, {
        bodyKey: 'modify.no_order',
      });
    }

    if (this.isReorderQuery(text)) {
      if (customer && customer.recentOrders.length > 0) {
        const recent = customer.recentOrders[0];
        return {
          intent: 'REORDER',
          confidence: 0.85,
          requiredConfirmation: true,
          missingInformation: [],
          recommendations: [],
          nextAction: 'CONFIRM_ORDER',
          structuredReplyData: {
            bodyKey: 'reorder.confirm',
            variables: { items: recent.items.join(', ') },
          },
          extractedEntities: {
            productNames: recent.items,
          },
          reasoningCode: 'REORDER_FOUND',
        };
      }
      return this.decision('REORDER', 'NO_ACTION', 'CUSTOMER_NOT_FOUND', 0.7, {
        bodyKey: 'reorder.no_history',
      });
    }

    if (matchedProducts.length > 0 && this.isDirectProductQuery(text)) {
      const missingOptions = this.findRequiredOptions(matchedProducts);
      return {
        intent: 'ORDER',
        confidence: 0.75,
        requiredConfirmation: false,
        missingInformation: missingOptions,
        recommendations: [],
        nextAction: missingOptions.length > 0 ? 'ASK_OPTION' : 'ASK_QUANTITY',
        structuredReplyData: {
          bodyKey: missingOptions.length > 0 ? 'order.choose_options' : 'order.how_many',
          variables: { productName: matchedProducts[0].name },
        },
        extractedEntities: { productNames: matchedProducts.map(p => p.name) },
        reasoningCode: missingOptions.length > 0 ? 'OPTION_REQUIRED' : 'CONTINUE_CONVERSATION',
      };
    }

    if (this.isMissingProductQuery(text, matchedProducts)) {
      return this.decision('ASK_PRODUCT', 'SHOW_PRODUCTS', 'PRODUCT_NOT_FOUND', 0.65, {
        bodyKey: 'product.not_found',
      });
    }

    if (this.isOrderQuery(text)) {
      const recommendations = this.generateRecommendations(catalog, customer);
      const missingOptions = this.findRequiredOptions(matchedProducts);
      const nextAction: NextAction = missingOptions.length > 0 ? 'ASK_OPTION' : 'ASK_QUANTITY';
      const code: ReasoningCode = missingOptions.length > 0 ? 'OPTION_REQUIRED' : 'CONTINUE_CONVERSATION';
      const confidence = matchedProducts.length > 0 ? 0.7 : 0.5;

      return {
        intent: 'ORDER',
        confidence,
        requiredConfirmation: false,
        missingInformation: missingOptions,
        recommendations,
        nextAction,
        structuredReplyData: {
          bodyKey: matchedProducts.length > 0 ? 'order.choose_options' : 'order.what_product',
        },
        extractedEntities: {
          productNames: matchedProducts.map(p => p.name),
        },
        reasoningCode: matchedProducts.length > 1 ? 'MULTIPLE_MATCHES' : code,
      };
    }

    return this.decision('UNKNOWN', 'NO_ACTION', 'AMBIGUOUS_INTENT', 0.4, {
      bodyKey: 'unknown.response',
    });
  }

  private decision(
    intent: CommerceIntent,
    nextAction: NextAction,
    reasoningCode: ReasoningCode,
    confidence: number,
    replyData: { bodyKey: string; variables?: Record<string, string>; requiredConfirmation?: boolean; title?: string },
  ): AiCommerceDecision {
    return {
      intent,
      confidence,
      requiredConfirmation: replyData.requiredConfirmation ?? false,
      missingInformation: [],
      recommendations: [],
      nextAction,
      structuredReplyData: {
        title: replyData.title,
        bodyKey: replyData.bodyKey,
        variables: replyData.variables,
      },
      extractedEntities: {},
      reasoningCode,
    };
  }

  private findRequiredOptions(products: Array<{ requiredOptions: Array<{ name: string; choices: string[] }> }>): MissingField[] {
    const result: MissingField[] = [];
    for (const p of products) {
      for (const opt of p.requiredOptions) {
        result.push({
          field: `option_${opt.name}`,
          required: true,
          choices: opt.choices,
          reason: `Please choose ${opt.name}`,
        });
      }
    }
    return result;
  }

  private generateRecommendations(
    catalog: { products: Array<{ productId: string; name: string; category: string }> },
    customer?: { favoriteProducts: string[]; recentOrders: Array<{ items: string[] }> },
  ): Recommendation[] {
    const seen = new Set<string>();
    const result: Recommendation[] = [];

    if (customer) {
      for (const fav of customer.favoriteProducts) {
        const match = catalog.products.find(p => p.name.toLowerCase() === fav.toLowerCase());
        if (match && !seen.has(match.productId)) {
          seen.add(match.productId);
          result.push({ productId: match.productId, reason: 'You ordered this before', priority: 1 });
        }
      }
      for (const order of customer.recentOrders) {
        for (const itemName of order.items) {
          const match = catalog.products.find(p => p.name.toLowerCase() === itemName.toLowerCase());
          if (match && !seen.has(match.productId)) {
            seen.add(match.productId);
            result.push({ productId: match.productId, reason: 'From your recent orders', priority: 2 });
          }
        }
      }
    }

    if (result.length === 0 && catalog.products.length > 0) {
      result.push({ productId: catalog.products[0].productId, reason: 'Popular item', priority: 3 });
    }

    return result.slice(0, 5);
  }

  private isGreeting(text: string): boolean {
    return /^(hi|hello|hey|مرحبا|السلام|اهلين|hi there|good morning|good evening|مساء|صباح)/i.test(text.trim());
  }

  private isFarewell(text: string): boolean {
    return /^(bye|goodbye|شكرا|مع السلامة|thank|thanks|^ok|^okay)\b/i.test(text.trim());
  }

  private isHoursQuery(text: string): boolean {
    return /(ساعات|مواعيد|افتتاح|hours|office hours|working hours|open now|open till|open$|open\?|what time|when.*open|when.*close)/i.test(text);
  }

  private isDeliveryQuery(text: string): boolean {
    return /(deliver|delivery|دليفري|توصيل|pickup|استلام|takeaway|take away|سفري|تيك اواي)/i.test(text);
  }

  private isPaymentQuery(text: string): boolean {
    return /(payment|pay|دفع|credit card|cash|كاش|فيزا|method|how.*pay|means of payment)/i.test(text);
  }

  private isPromotionQuery(text: string): boolean {
    return /(offer|promo|discount|خصم|عرض|تخفيض|coupon|deal|صفقة|هدية|free|مجانا|sale)/i.test(text);
  }

  private isPriceQuery(text: string): boolean {
    return /(price|سعر|كم.*?|cost|how much|what.*cost|what.*price|بكام|bi kame|bi kam)/i.test(text);
  }

  private isProductQuery(text: string, catalog: { products: Array<{ name: string }> }): boolean {
    if (/(what.*have|menu|قائمة|list|products|show|عندك|products|offer|تقدم)/i.test(text)) return true;
    for (const p of catalog.products) {
      if (text.includes(p.name.toLowerCase())) return true;
    }
    return false;
  }

  private isCancelQuery(text: string, activeOrder?: { items: Array<unknown> }): boolean {
    const cancelWords = /(cancel|الغاء|يلغي|إلغاء|remove order|delete order|rscind|cancle)/i.test(text);
    if (!cancelWords) return false;
    if (activeOrder && activeOrder.items.length > 0) return true;
    if (/cancel.*order|إلغاء.*طلب/i.test(text)) return true;
    return false;
  }

  private isModifyQuery(text: string, activeOrder?: { items: Array<unknown> }): boolean {
    const modifyWords = /(modify|change|update|edit|تعديل|غيير|change.*order|modify.*order|add.*order|remove.*item)/i.test(text);
    if (!modifyWords) return false;
    if (activeOrder && activeOrder.items.length > 0) return true;
    return false;
  }

  private isReorderQuery(text: string): boolean {
    return /(reorder|repeat|again|same order|same as before|كرر|نفس الطلب|اعادة|re-order|order same)/i.test(text);
  }

  private isDirectProductQuery(text: string): boolean {
    return /(do you have|do you sell|do you serve|هل عندك|هل يوجد|عندك)/i.test(text);
  }

  private isMissingProductQuery(text: string, matchedProducts: Array<unknown>): boolean {
    if (matchedProducts.length > 0) return false;
    if (this.isDirectProductQuery(text)) return true;
    const match = text.match(/(?:i want|i need|i would like|عايز|عاوز)\s+(?:a\s+|an\s+|the\s+)?(\S+)/i);
    if (match) {
      const noun = match[1].toLowerCase().replace(/[^a-z\u0600-\u06FF]/g, '');
      const vagueWords = ['something', 'anything', 'nothing', 'everything', 'it', 'this', 'that', 'please', 'now', 'some'];
      if (!vagueWords.includes(noun)) return true;
    }
    return false;
  }

  private isOrderQuery(text: string): boolean {
    return /(order|طلب|اorder|give me|send|i want|i need|i would like|عايز|عاوز)/i.test(text);
  }
}
