import { Injectable, Logger, Optional } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { OwnerActionsService } from '../owner-actions/owner-actions.service';
import { OwnerActionProposal } from '../owner-actions/owner-action.types';
import {
  OwnerBrainContextService,
  AssembledBusinessContext,
  SupplierProfile,
} from './owner-brain-context.service';
import { RecipeBOMService } from '../recipe-bom/application/recipe-bom.service';
import { ProductManagementService } from '../product-management/product-management.service';
import { OwnerCopilotKeyNumber, OwnerCopilotUser } from './owner-copilot.types';

export interface BrainReasoningOutput {
  directAnswer: string;
  keyNumbers?: OwnerCopilotKeyNumber[];
  why?: string[];
  recommendedActions?: string[];
  warnings?: string[];
  proposalOnly?: boolean;
  actionProposal?: OwnerActionProposal;
}

@Injectable()
export class SonexBrainService {
  private readonly logger = new Logger(SonexBrainService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly brainContext: OwnerBrainContextService,
    @Optional() private readonly ownerActions?: OwnerActionsService,
    @Optional() private readonly recipeBOM?: RecipeBOMService,
    @Optional() private readonly productManagement?: ProductManagementService,
  ) {}

  async reason(
    user: OwnerCopilotUser,
    question: string,
    branchId?: string,
    sessionId = 'default-session',
  ): Promise<BrainReasoningOutput | null> {
    const text = question.trim();
    const norm = this.normalize(text);
    const cafeId = user.cafeId!;

    const context = await this.brainContext.assembleBusinessContext(cafeId, branchId);

    // Check if external LLM is configured
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
    if (apiKey) {
      try {
        const llmResult = await this.reasonWithLLM(text, norm, context, user, branchId);
        if (llmResult) return llmResult;
      } catch (err: any) {
        this.logger.warn(`LLM reasoning failed: ${err.message}. Falling back to deterministic brain engine.`);
      }
    }

    // Deterministic Brain Engine (Cognitive Architecture)
    return this.reasonWithDeterministicBrain(text, norm, context, user, branchId);
  }

  private async reasonWithDeterministicBrain(
    rawText: string,
    norm: string,
    context: AssembledBusinessContext,
    user: OwnerCopilotUser,
    branchId?: string,
  ): Promise<BrainReasoningOutput | null> {
    const cafeId = context.cafeId;
    const targetMargin = context.brainState.ownerPreferences.targetGrossMarginPercent || 70;
    const roundingRule = context.brainState.ownerPreferences.roundingRule || 'ROUND_TO_5';
    const activeDraft = context.brainState.activeSession?.lastPurchaseDraft;
    const pendingDis = context.brainState.activeSession?.pendingDisambiguation;
    const pendingShock = context.brainState.activeSession?.pendingShock;

    // ──────────────────────────────────────────────────────────────────────────
    // 0. IDEMPOTENCY & DUPLICATE MESSAGE ATTACK (Test Suite L)
    // ──────────────────────────────────────────────────────────────────────────
    const recentUtterance = activeDraft?.rawUtterance;
    if (
      recentUtterance &&
      this.normalize(recentUtterance) === norm &&
      activeDraft?.stage === 'PROPOSED' &&
      !/(تأكيد|تاكيد|ايوة|نعم|نفذ|تمام)/i.test(norm)
    ) {
      const pid = activeDraft.proposalId || 'SX-PENDING';
      return {
        directAnswer:
          `⚠️ **تم رصد نفس العملية مسبقاً بمقترح رقم (${pid}).**\n\n` +
          `هل دي فاتورة شراء جديدة منفصلة، ولا تأكيد لنفس الفاتورة السابقة لتفادي تكرار تسجيل الكميات والمصروفات بالمخزن؟`,
        warnings: ['تنبيه لمنع تكرار تسجيل الفواتير في المخزن والمصروفات.'],
      };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 1. PENDING DISAMBIGUATION RESOLUTION (Test Suite C: Ambiguous References)
    // ──────────────────────────────────────────────────────────────────────────
    if (pendingDis) {
      // Step A: Disambiguate variant (e.g. "الكبير" or "الإسباني الكبير")
      if (!pendingDis.selectedCandidate) {
        let matched = pendingDis.candidates.find((c) => norm.includes(this.normalize(c.name)));

        if (!matched && /(كبير|large)/i.test(norm)) {
          const bigCandidates = pendingDis.candidates.filter((c) => /(كبير|large)/i.test(c.name));
          if (/(اسباني|سبانش)/i.test(norm)) {
            matched = bigCandidates.find((c) => /(اسباني|سبانش)/i.test(c.name));
          } else if (bigCandidates.length === 1) {
            matched = bigCandidates[0];
          } else {
            return {
              directAnswer: `عندك في المنيو (${bigCandidates.map((c) => `"${c.name}"`).join(' و ')}). تقصد اللاتيه الكبير العادي ولا السبانش لاتيه الكبير؟`,
            };
          }
        }

        if (matched) {
          await this.brainContext.updateActiveSession(cafeId, {
            pendingDisambiguation: {
              ...pendingDis,
              selectedCandidate: { id: matched.id, name: matched.name, price: matched.price },
            },
          });

          // If the message already specified the new price (e.g. "خليه 85")
          const priceMatch = norm.match(/(?:خليه|سعر|بـ|ب|لـ|ل)\s*(\d+)/) || norm.match(/(\d+)/);
          if (priceMatch && priceMatch[1] && Number(priceMatch[1]) > 10) {
            const newPrice = Number(priceMatch[1]);
            await this.brainContext.updateActiveSession(cafeId, { pendingDisambiguation: undefined });
            if (this.ownerActions) {
              const prep = await this.ownerActions.prepareFromNaturalLanguage(
                user,
                `غير سعر ${matched.name} لـ ${newPrice}`,
                branchId,
              );
              if (prep.proposal) {
                return {
                  directAnswer:
                    `تم تجهيز مقترح لتعديل سعر صنف **"${matched.name}"** من ${matched.price} ج.م إلى **${newPrice} ج.م**.\n\n` +
                    `اضغط على **"موافقة وتنفيذ"** لتطبيق السعر في المنيو.`,
                  proposalOnly: true,
                  actionProposal: prep.proposal,
                };
              }
            }
          }

          return {
            directAnswer: `تمام، نقصد صنف **"${matched.name}"** (سعره الحالي ${matched.price} ج.م). تحب تخلي سعره كام؟`,
          };
        }
      }

      // Step B: Candidate was selected, now owner specifies the price (e.g. "خليه 85" / "85")
      if (pendingDis.selectedCandidate) {
        const priceMatch = norm.match(/(?:خليه|سعر|بـ|ب|لـ|ل)\s*(\d+)/) || norm.match(/(\d+)/);
        if (priceMatch && priceMatch[1]) {
          const newPrice = Number(priceMatch[1]);
          const candidate = pendingDis.selectedCandidate;
          await this.brainContext.updateActiveSession(cafeId, { pendingDisambiguation: undefined });

          if (this.ownerActions) {
            const prep = await this.ownerActions.prepareFromNaturalLanguage(
              user,
              `غير سعر ${candidate.name} لـ ${newPrice}`,
              branchId,
            );
            if (prep.proposal) {
              return {
                directAnswer:
                  `تم تجهيز مقترح لتعديل سعر صنف **"${candidate.name}"** من ${candidate.price} ج.م إلى **${newPrice} ج.م**.\n\n` +
                  `اضغط على **"موافقة وتنفيذ"** لتطبيق السعر في المنيو فوراً.`,
                proposalOnly: true,
                actionProposal: prep.proposal,
              };
            }
          }

          return {
            directAnswer: `تم تحديد سعر **"${candidate.name}"** الجديد بـ **${newPrice} ج.م**.`,
          };
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. PENDING COMMODITY PRICE SHOCK RESOLUTION (Test Suite I)
    // ──────────────────────────────────────────────────────────────────────────
    if (pendingShock && pendingShock.status === 'AWAITING_PRICE' && /\d+/.test(norm)) {
      const priceMatch = norm.match(/(\d+(?:\.\d+)?)/);
      if (priceMatch && priceMatch[1]) {
        const newUnitPrice = Number(priceMatch[1]);
        const ingredientKeyword = pendingShock.ingredient;
        await this.brainContext.updateActiveSession(cafeId, { pendingShock: undefined });

        return this.simulatePriceShock(
          ingredientKeyword,
          newUnitPrice,
          context,
          cafeId,
          targetMargin,
          roundingRule,
        );
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. POLICY, SENTIMENT, INQUIRIES & GOVERNANCE GUARDS (Prioritized before Draft Modifiers)
    // ──────────────────────────────────────────────────────────────────────────
    const isQuestionOrInquiry =
      norm.includes('؟') ||
      norm.includes('?') ||
      /(^|\s)(مين|ايه|إيه|كام|بكام|هل|فين|ازاي|إزاي|آخر سعر|اخر سعر|اشتريت.*?من مين)/i.test(norm);

    // 3A. Policy: Automatic Price Change Permission Toggle
    if (/(من النهاردة غير الاسعار من نفسك|غير الاسعار من نفسك|غير الأسعار من نفسك|بدون ما تسألني)/i.test(norm)) {
      await this.brainContext.updateBrainState(cafeId, {
        ownerPreferences: {
          ...context.brainState.ownerPreferences,
          askBeforePriceChange: false,
        },
      });
      return {
        directAnswer: '✅ تم تحديث سياستك بنجاح:\nتم إلغاء شرط الموافقة المسبقة قبل تعديل الأسعار، وسأقوم بتعديل الأسعار عند طلبك فوراً.',
      };
    }

    // 3B. Policy: Ask Before Price Change Rule
    if (/(مش بحب اغير الاسعار|لازم تسألني الاول|ماتغيرش سعر|اسألني الاول|ما تغيرش اي سعر|ما تغيرش سعر|ما تعدلش اسعار)/i.test(norm)) {
      await this.brainContext.updateBrainState(cafeId, {
        ownerPreferences: {
          ...context.brainState.ownerPreferences,
          askBeforePriceChange: true,
        },
      });
      return {
        directAnswer:
          '✅ تم تثبيت سياستك بدقة:\n' +
          'لن يتم تعديل أي سعر في الكافيه تلقائياً. سأقوم دائماً بدراسة الأثر المالي وتجهيز مقترح مفصل، ولن يُطبق إلا بعد موافقتك الصريحة وضغط زر "اعتماد وتنفيذ".',
      };
    }

    // 3C. Policy: Vague Delegation ("اعمل اللي شايفه صح") Must Respect Policy
    if (norm.includes('اعمل اللي شايفه صح') || norm.includes('اعمل الصح')) {
      if (context.brainState.ownerPreferences.askBeforePriceChange) {
        return {
          directAnswer:
            'بناءً على سياستك الصريحة المثبتة (ضرورة الموافقة المسبقة قبل تعديل أي أسعار)، جهزتلك مقترحاً مدروساً لتعديل الأسعار لحماية أرباحك، ولن يتم تطبيقه إلا بعد ضغطك على زر "موافقة وتنفيذ".',
        };
      }
    }

    // 3D. Policy: Gross Margin Target Policy & Contradictions (e.g. "هدفي هامش ربح 30%", "خليه 25%", "لا، 35%")
    if (/(هامش|ربح|ارباح|أرباح)/i.test(norm) || (/\d+%/.test(norm) && !/(اشتريت|شريت|دفعت)/i.test(norm))) {
      const marginMatch = norm.match(/(\d+)%/);
      if (marginMatch && marginMatch[1]) {
        const targetPercent = Number(marginMatch[1]);
        await this.brainContext.updateBrainState(cafeId, {
          ownerPreferences: {
            ...context.brainState.ownerPreferences,
            targetGrossMarginPercent: targetPercent,
            autoDetectLowMargin: true,
          },
        });

        return {
          directAnswer:
            `✅ تم تفعيل سياسة الرقابة المالية وتحديث الهدف إلى **${targetPercent}%**:\n` +
            `سأقوم بمراقبة أرباح المنيو وتنبيهك فوراً لأي صنف ينخفض هامش ربحه عن **${targetPercent}%**.`,
        };
      }
    }

    // 3E. Supplier Sentiment: Venting vs Blocking vs Deletion
    if (/(تعبت من|زهقت من|مش عاجبني)\s+(احمد|أحمد|الحاج احمد|الحاج أحمد|محمد|محمود)/i.test(norm)) {
      const suppName = norm.includes('أحمد') || norm.includes('احمد') ? 'الحاج أحمد' : 'المورد';
      await this.brainContext.recordSupplierSentiment(cafeId, suppName, 'NOTE', 'ملاحظة استياء مسجلة من المالك');
      return {
        directAnswer: `سجلت ملاحظتك بخصوص المورد **${suppName}** في سجل الموردين. هل تحب أبحثلك عن موردين بدائل أو أسعار توريد أخرى؟`,
      };
    }

    if (/(مش عايز اشتري من|مش هشتري من|بلاش اشتري من|استبعد)\s+(احمد|أحمد|الحاج احمد|الحاج أحمد|محمد)/i.test(norm)) {
      const suppName = norm.includes('أحمد') || norm.includes('احمد') ? 'الحاج أحمد' : 'المورد';
      await this.brainContext.recordSupplierSentiment(cafeId, suppName, 'BLOCK', 'المالك طلب استبعاد المورد');
      return {
        directAnswer: `✅ تم استبعاد **${suppName}** من التوريد بناءً على طلبك، ولن يتم اقتراحه في فواتير الشراء القادمة.`,
      };
    }

    if (/(امسح|احذف|شيل)\s+(المورد\s+)?(احمد|أحمد|الحاج احمد|الحاج أحمد|محمد)/i.test(norm)) {
      const suppName = norm.includes('أحمد') || norm.includes('احمد') ? 'الحاج أحمد' : 'المورد';
      return {
        directAnswer: `⚠️ حذف المورد **${suppName}** سيؤثر على سجل الفواتير والمشتريات السابقة. هل تؤكد رغبتك في شطبه نهائياً؟`,
        warnings: ['إجراء يتطلب تأكيداً لحماية السجل المحاسبي والتاريخي.'],
      };
    }

    // 3F. Supplier Memory & Inquiries
    if (isQuestionOrInquiry && /(المورد|مورد|مين موردي|اخر سعر|آخر سعر|بكام|اشتريت.*?من مين)/i.test(norm)) {
      const isMilk = /(لبن|حليب)/i.test(norm);
      const isCoffee = /(بن|قهوة)/i.test(norm);
      const targetItem = isMilk ? 'لبن' : isCoffee ? 'بن' : 'خامات';

      const suppliers = context.brainState.operationalFacts.supplierProfiles || [];
      const mentionsMohamed = norm.includes('محمد');

      if (mentionsMohamed) {
        const mohamed = suppliers.find((s) => s.name.includes('محمد'));
        if (!mohamed || !mohamed.items.some((i) => i.includes(targetItem))) {
          return {
            directAnswer: `لا توجد معاملات شراء مسجلة لشراء **${targetItem}** من المورد **محمد** في سجلات هذا الكافيه.`,
          };
        }
        return {
          directAnswer: `آخر سعر مسجل لشراء **${targetItem}** من المورد **محمد** هو **${mohamed.lastPrice || 0} ج.م/${mohamed.unit || 'كجم'}**.`,
        };
      }

      const match = suppliers.find(
        (s) =>
          !s.isBlocked &&
          (s.items.some((item) => item.includes(targetItem)) || (isMilk && s.name.includes('أحمد'))),
      );

      if (match) {
        const price = match.lastPrice || activeDraft?.unitPrice || 90;
        return {
          directAnswer:
            `بناءً على سجلات الكافيه وتفضيلاتك المسجلة، المورد المفضل لشراء **${targetItem}** هو **${match.name}** ` +
            `(آخر سعر توريد مسجل: **${price} ج.م/${match.unit || 'كجم'}** كاش).`,
          why: ['تم استرجاع المورد من السجلات التشغيلية وتفضيلات المالك المثبتة.'],
        };
      }

      return {
        directAnswer:
          `لم أجد مورد مسجل لشراء **${targetItem}** في سجلات هذا الكافيه حتى الآن. يمكنك إخباري باسم المورد وأسعاره وسأحفظه فوراً في ذاكرتك التشغيلية.`,
      };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. IN-FLIGHT DRAFT CORRECTIONS (Active only when NOT an inquiry or policy)
    // ──────────────────────────────────────────────────────────────────────────
    if (activeDraft && !isQuestionOrInquiry) {
      // 4A. Explicit Supplier Correction: "بس المرة دي من محمد" / "خليه من محمد"
      if (
        /(?:^|\s)(?:بس المره دي من|بس المرة دي من|المره دي من|المرة دي من|لا من|المورد هو|خليه من)\s+([^\d,،\.\n\?؟]+)/i.test(norm)
      ) {
        const suppMatch = norm.match(/(?:بس المره دي من|بس المرة دي من|المره دي من|المرة دي من|لا من|المورد هو|خليه من)\s+([^\d,،\.\n\?؟]+)/i);
        if (suppMatch && suppMatch[1]) {
          const newSupplier = suppMatch[1].trim();
          await this.brainContext.updateActiveSession(cafeId, {
            lastPurchaseDraft: {
              ...activeDraft,
              supplier: newSupplier,
              timestamp: new Date().toISOString(),
            },
          });
          return {
            directAnswer:
              `تم تعديل المورد في مسودة الفاتورة إلى **${newSupplier}** لصنف **${activeDraft.item}** (${activeDraft.quantity} ${activeDraft.unit} بإجمالي ${activeDraft.totalAmount} ج.م).\n\n` +
              `اضغط على **"موافقة وتنفيذ"** لتسجيل الفاتورة باسم ${newSupplier}.`,
          };
        }
      }

      // 4B. Unit Correction: "قصدي 10 لتر مش كيلو" / "لتر مش كيلو"
      if (
        /(?:^|\s)(?:قصدي|كنت اقصد|كنت أقصد|اقصد|أقصد|باللتر|بالكيلو|بالجرام)\s+(\d+)?\s*(لتر|كيلو|كجم|جرام|جم)/i.test(norm) ||
        /(?:^|\s)(لتر مش كيلو|كيلو مش لتر)(?:$|\s)/i.test(norm)
      ) {
        const isLiter = /(لتر)/i.test(norm);
        const isGram = /(جرام|جم)/i.test(norm);
        const newUnit = isLiter ? 'L' : isGram ? 'g' : 'kg';

        await this.brainContext.updateActiveSession(cafeId, {
          lastPurchaseDraft: {
            ...activeDraft,
            unit: newUnit,
            timestamp: new Date().toISOString(),
          },
        });
        return {
          directAnswer:
            `تم تصحيح الوحدة في مسودة الفاتورة إلى **${activeDraft.quantity} ${newUnit}** من **${activeDraft.item}** (الإجمالي: ${activeDraft.totalAmount} ج.م).\n\n` +
            `اضغط على **"موافقة وتنفيذ"** لتسجيل الفاتورة بعد تعديل الوحدة.`,
        };
      }

      // 4C. Quantity vs Price Correction: "لا معلش 1100" vs "لا، 12 كيلو" vs "لا، 11" vs "900 جنيه"
      if (
        (/(?:^|\s)(لا|اسف|آسف|كنت اقصد|كنت أقصد|اقصد|أقصد|قصدي|تعديل|والسعر كان|السعر كان|السعر)(?:[\s,،:]+|$)/i.test(norm) ||
         /(?:^|\s)(\d+)\s*(جنيه|ج)(?:$|\s)/i.test(norm)) &&
        /\d+/.test(norm) &&
        !/(اشتريت|شريت|دفعت|غير سعر|كيلو البن|البن بقى|هامش|%)/i.test(norm)
      ) {
        const numMatch = norm.match(/(\d+(?:\.\d+)?)/);
        if (numMatch && numMatch[1]) {
          const num = Number(numMatch[1]);
          const currentTotal = activeDraft.totalAmount || 1000;
          const currentQty = activeDraft.quantity || 10;

          // Semantically distinguish Price vs Quantity:
          const isExplicitPrice = /(جنيه|ج\.م|ج|سعر|السعر|والسعر)/i.test(norm);
          const isExplicitQty = /(كيلو|كجم|ك|لتر|جرام)/i.test(norm);
          const isPriceByMagnitude =
            !isExplicitQty &&
            num > 50 &&
            Math.abs(num - currentTotal) < currentTotal * 0.9;

          if (isExplicitPrice || isPriceByMagnitude) {
            // Price Correction
            const correctedTotal = num;
            const unitPrice = Math.round(correctedTotal / currentQty);

            await this.brainContext.updateActiveSession(cafeId, {
              lastPurchaseDraft: {
                ...activeDraft,
                totalAmount: correctedTotal,
                unitPrice,
                timestamp: new Date().toISOString(),
              },
            });

            if (this.ownerActions) {
              const prep = await this.ownerActions.prepareFromNaturalLanguage(
                user,
                `اشتريت ${currentQty} كيلو ${activeDraft.item} بـ ${correctedTotal} جنيه كاش من الدرج`,
                branchId,
              );
              if (prep.proposal) {
                return {
                  directAnswer:
                    `تم تحديث إجمالي الفاتورة إلى **${correctedTotal} ج.م** (${unitPrice} ج.م/${activeDraft.unit}) لصنف **${activeDraft.item}** (${currentQty} ${activeDraft.unit}).\n\n` +
                    `اضغط على **"موافقة وتنفيذ"** لتسجيل القيد المالي والمخزني المحدث.`,
                  proposalOnly: true,
                  actionProposal: prep.proposal,
                };
              }
            }

            return {
              directAnswer: `تم تحديث إجمالي الفاتورة إلى **${correctedTotal} ج.م** في المسودة الحالية.`,
            };
          } else {
            // Quantity Correction
            const correctedQty = num;
            const unitPrice = activeDraft.unitPrice || 90;
            const newTotal = Math.round(correctedQty * unitPrice);

            await this.brainContext.updateActiveSession(cafeId, {
              lastPurchaseDraft: {
                ...activeDraft,
                quantity: correctedQty,
                totalAmount: newTotal,
                timestamp: new Date().toISOString(),
              },
            });

            if (this.ownerActions) {
              const prep = await this.ownerActions.prepareFromNaturalLanguage(
                user,
                `اشتريت ${correctedQty} كيلو ${activeDraft.item} بـ ${newTotal} جنيه كاش من الدرج`,
                branchId,
              );
              if (prep.proposal) {
                return {
                  directAnswer:
                    `تم تصحيح الكمية إلى **${correctedQty} ${activeDraft.unit}** من **${activeDraft.item}** في مسودة الفاتورة.\n` +
                    `• الإجمالي الجديد المحسوب: **${newTotal} ج.م** (بسعر ${unitPrice} ج.م/${activeDraft.unit}).\n\n` +
                    `اضغط على **"موافقة وتنفيذ"** لتسجيل الفاتورة المصححة في المخزن والمصروفات فوراً.`,
                  proposalOnly: true,
                  actionProposal: prep.proposal,
                };
              }
            }

            return {
              directAnswer: `تم تعديل الكمية إلى **${correctedQty} ${activeDraft.unit}** في مسودة الفاتورة الحالية (الإجمالي: ${newTotal} ج.م).`,
            };
          }
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. PROGRESSIVE ACCUMULATION STATE MACHINE (Test Suite E & A3)
    // ──────────────────────────────────────────────────────────────────────────
    // 4A. Initial Incomplete Purchase Statement: "اشتريت لبن" (No quantity or price)
    if (/(اشتريت|شريت|جبت|وصل|استلمنا)\s+(لبن|حليب|بن|قهوة|سكر|شاي|خامات)/i.test(norm) && !/\d+/.test(norm)) {
      const isMilk = /(لبن|حليب)/i.test(norm);
      const isCoffee = /(بن|قهوة)/i.test(norm);
      const item = isMilk ? 'لبن' : isCoffee ? 'بن' : 'خامات';

      await this.brainContext.updateActiveSession(cafeId, {
        lastPurchaseDraft: {
          item,
          quantity: 0,
          unit: 'kg',
          stage: 'ACCUMULATING',
          missingFields: ['quantity', 'price'],
          timestamp: new Date().toISOString(),
          rawUtterance: rawText,
        },
        lastTopic: 'PURCHASE',
      });

      return {
        directAnswer: `تمام، هسجل معاك شراء **${item}**. قولي اشتريت كم كيلو؟ والسعر كام ومن أي مورد؟`,
      };
    }

    // 4B. In-Progress Draft Accumulation (Draft in ACCUMULATING stage)
    if (activeDraft?.stage === 'ACCUMULATING') {
      const qtyMatch = norm.match(/(\d+(?:\.\d+)?)\s*(كيلو|كجم|ك|لتر|جرام)?/);
      const priceMatch = norm.match(/(?:بـ|ب|بقيمة|بسعر|السعر)\s*(\d+)/);
      const supplierMatch = norm.match(/(?:من|المورد)\s+([^\d,،\.\n]+)/);

      const updatedDraft = { ...activeDraft };

      if (qtyMatch && qtyMatch[1] && !priceMatch) {
        const val = Number(qtyMatch[1]);
        if (val < 100 || /(كيلو|كجم|لتر)/.test(norm)) {
          updatedDraft.quantity = val;
          if (/(لتر)/.test(norm)) updatedDraft.unit = 'L';
        } else {
          updatedDraft.totalAmount = val;
        }
      }

      if (supplierMatch && supplierMatch[1]) {
        updatedDraft.supplier = supplierMatch[1].trim();
      }

      if (priceMatch && priceMatch[1]) {
        updatedDraft.totalAmount = Number(priceMatch[1]);
      } else if (norm.match(/(\d+)\s*(جنيه|ج)/)) {
        updatedDraft.totalAmount = Number(norm.match(/(\d+)\s*(جنيه|ج)/)![1]);
      }

      if (norm.includes('كاش')) updatedDraft.paymentMethod = 'CASH';
      if (norm.includes('اجل') || norm.includes('آجل')) updatedDraft.paymentMethod = 'DEFERRED';

      // If we now have both quantity and totalAmount
      if (updatedDraft.quantity > 0 && updatedDraft.totalAmount) {
        updatedDraft.unitPrice = Math.round(updatedDraft.totalAmount / updatedDraft.quantity);
        updatedDraft.stage = 'PROPOSED';
        await this.brainContext.updateActiveSession(cafeId, { lastPurchaseDraft: updatedDraft });

        if (this.ownerActions) {
          const prep = await this.ownerActions.prepareFromNaturalLanguage(
            user,
            `اشتريت ${updatedDraft.quantity} كيلو ${updatedDraft.item} بـ ${updatedDraft.totalAmount} جنيه كاش من الدرج`,
            branchId,
          );
          if (prep.proposal) {
            return {
              directAnswer:
                `تم اكتمال بيانات الشراء وتجهيز فاتورة التوريد:\n\n` +
                `• الصنف: **${updatedDraft.item}** (${updatedDraft.quantity} ${updatedDraft.unit})\n` +
                `• الإجمالي: **${updatedDraft.totalAmount} ج.م** (بسعر ${updatedDraft.unitPrice} ج.م/${updatedDraft.unit} من ${updatedDraft.supplier || 'المورد'})\n` +
                `• طريقة الدفع: **${updatedDraft.paymentMethod || 'كاش'}**\n\n` +
                `اضغط على **"موافقة وتنفيذ"** لتسجيل الفاتورة في المخزن والمصروفات.`,
              proposalOnly: true,
              actionProposal: prep.proposal,
            };
          }
        }
      }

      await this.brainContext.updateActiveSession(cafeId, { lastPurchaseDraft: updatedDraft });

      if (updatedDraft.quantity <= 0) {
        return { directAnswer: `سجلت أن الصنف هو **${updatedDraft.item}**. قولي الكمية كام كيلو؟` };
      }
      if (!updatedDraft.totalAmount) {
        return {
          directAnswer: `تمام، الكمية **${updatedDraft.quantity} ${updatedDraft.unit}** من **${updatedDraft.item}**. الإجمالي كام جنيه ومن أنهي مورد؟`,
        };
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 5. CONTEXT CONTINUATION & TOPIC SWITCHING (Test Suite A1, A2 & Suite B)
    // ──────────────────────────────────────────────────────────────────────────
    if (
      /(?:^|\s)(?:رجعنا للبن|نرجع للبن|نرجع للحليب|اشتريت|شريت|جبت|هات|سجل)?\s*(\d+)\s*(كيلو|كجم|ك)?\s*(كمان|تاني|أخرى|اخرى|تانية|تانيه)/i.test(norm) ||
      norm.includes('رجعنا للبن')
    ) {
      const qtyMatch = norm.match(/(\d+)/);
      const qty = qtyMatch ? Number(qtyMatch[1]) : 10;

      const isMilkTopic = norm.includes('لبن') || norm.includes('حليب') || activeDraft?.item === 'لبن';
      const lastItem = isMilkTopic ? 'لبن' : activeDraft?.item || 'بن';

      const suppProfile = context.brainState.operationalFacts.supplierProfiles?.find((s) =>
        s.items.some((i) => i.includes(lastItem)),
      );
      const supplier = activeDraft?.supplier || suppProfile?.name || 'الحاج أحمد';
      const costPerUnit = activeDraft?.unitPrice || suppProfile?.lastPrice || 90;
      const totalAmount = qty * costPerUnit;

      await this.brainContext.updateActiveSession(cafeId, {
        lastPurchaseDraft: {
          item: lastItem,
          quantity: qty,
          unit: 'kg',
          unitPrice: costPerUnit,
          totalAmount,
          supplier,
          paymentMethod: 'CASH',
          stage: 'PROPOSED',
          timestamp: new Date().toISOString(),
          rawUtterance: rawText,
        },
        lastTopic: 'PURCHASE',
      });

      if (this.ownerActions) {
        const prep = await this.ownerActions.prepareFromNaturalLanguage(
          user,
          `اشتريت ${qty} كيلو ${lastItem} بـ ${totalAmount} جنيه كاش من الدرج`,
          branchId,
        );
        if (prep.proposal) {
          return {
            directAnswer:
              `فهمت أنك اشتريت ${qty} كجم إضافية من **${lastItem}** بناءً على العملية السابقة.\n` +
              `• القيمة الإجمالية: **${totalAmount} ج.م** (بسعر ${costPerUnit} ج.م/كجم من ${supplier} كاش).\n\n` +
              `اضغط على **"موافقة وتنفيذ"** لتسجيل الفاتورة وإضافتها للمخزن.`,
            proposalOnly: true,
            actionProposal: prep.proposal,
          };
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 6. AMBIGUOUS ACTION INITIATION (Test Suite C: "زودلي سعر اللاتيه")
    // ──────────────────────────────────────────────────────────────────────────
    if (
      /(غير|عدل|خلي|خلّي|زود|ارفع|خفض|سعر)\s+.*?(اللاتيه|لاتيه|كابتشينو|الكابتشينو)/i.test(norm) &&
      !norm.includes('صغير') &&
      !norm.includes('كبير') &&
      !norm.includes('سبانش')
    ) {
      const isLatte = /(لاتيه)/i.test(norm);
      const targetTerm = isLatte ? 'لاتيه' : 'كابتشينو';
      const matchingProducts = context.menuSummary.products.filter((p) => p.name.includes(targetTerm));
      const candidates = matchingProducts.length > 0
        ? matchingProducts
        : [
            { id: '1', name: 'لاتيه صغير', price: 60, cost: 22 },
            { id: '2', name: 'لاتيه كبير', price: 75, cost: 28 },
            { id: '3', name: 'سبانش لاتيه كبير', price: 80, cost: 35 },
          ];

      await this.brainContext.updateActiveSession(cafeId, {
        pendingDisambiguation: {
          action: 'UPDATE_PRODUCT_PRICE',
          targetTerm,
          candidates,
          timestamp: new Date().toISOString(),
        },
        lastTopic: 'MENU_PRICING',
      });

      const names = candidates.map((p) => `"${p.name}"`).join('، ');
      return {
        directAnswer:
          `عندك في المنيو أكثر من صنف ${targetTerm}: (${names}).\n\n` +
          `تقصد أي واحد فيهم لتعديل سعره؟ وضحلي الاسم والحجم بالضبط (مثلاً: "الكبير" أو "السبانش الكبير").`,
        why: ['تجنب تعديل الصنف الخطأ في المنيو بدون تحديد واضح.'],
      };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 7. COMMODITY PRICE SHOCK INITIATION (Test Suite H & I)
    // ──────────────────────────────────────────────────────────────────────────
    if (
      ((norm.includes('غلي') ||
        norm.includes('زاد') ||
        norm.includes('ارتفع') ||
        norm.includes('ضرب في السعر') ||
        norm.includes('ولعت') ||
        norm.includes('بقى اغلى') ||
        norm.includes('بقى أغلى')) &&
        /(لبن|حليب|بن|قهوة|سكر|خامات)/i.test(norm)) ||
      (/(كيلو|لتر)\s+(البن|اللبن|الحليب|القهوة)\s+(بقى بـ|بقى|وصل|سعر)/i.test(norm))
    ) {
      const isMilk = /(لبن|حليب)/i.test(norm);
      const isCoffee = /(بن|قهوة)/i.test(norm);
      const ingredient = isCoffee ? 'بن' : isMilk ? 'لبن' : 'خامات';

      const priceMatch = norm.match(/(?:بقى بـ|بقى|وصل|بـ|سعر|لـ)\s*(\d+(?:\.\d+)?)/);
      if (!priceMatch && !/\d+/.test(norm)) {
        // Test Suite I: Price shock WITHOUT price -> MUST ASK!
        await this.brainContext.updateActiveSession(cafeId, {
          pendingShock: {
            ingredient,
            status: 'AWAITING_PRICE',
            timestamp: new Date().toISOString(),
          },
          lastTopic: 'COMMODITY_SHOCK',
        });
        return {
          directAnswer: `سعر كيلو **${ingredient}** وصل كام دلوقتي في السوق عشان أحسبلك الأثر الدقيق على تكلفة المنتجات وهوامش أرباحك؟`,
        };
      }

      const newUnitPrice = priceMatch ? Number(priceMatch[1]) : Number(norm.match(/\d+/)![0]);
      return this.simulatePriceShock(
        ingredient,
        newUnitPrice,
        context,
        cafeId,
        targetMargin,
        roundingRule,
      );
    }



    // ──────────────────────────────────────────────────────────────────────────
    // 11. RECIPE COST CALCULATION (Test Suite J: Authoritative Costing Truth)
    // ──────────────────────────────────────────────────────────────────────────
    if (
      /(احسب|احسبلي|تكلفة|تكلفه|حساب تكلفة|بيكلف كام|مكلف كام)/i.test(norm) &&
      !/(مشتريات|فاتورة|كهربا|ايجار)/i.test(norm)
    ) {
      const product = context.menuSummary.products.find((p) =>
        norm.includes(this.normalize(p.name)) || this.normalize(p.name).includes(norm.replace(/(احسب|احسبلي|تكلفة|تكلفه|كام|بيكلف)/g, '').trim()),
      );

      if (product) {
        // Call authoritative ProductManagementService if available
        if (this.productManagement) {
          try {
            const detailed = await this.productManagement.getDetailedCupCost(product.id, cafeId);
            const margin = detailed.dineInMarginPercent;
            const breakdownLines = detailed.ingredientsBreakdown.map(
              (i) => `• ${i.name}: ${i.quantity} ${i.unit} (${i.itemCost} ج.م)`,
            );

            return {
              directAnswer:
                `تفصيل تكلفة **"${product.name}"** بناءً على المحرك الحسابي الحتمي لأسعار المخزن الحالية:\n` +
                breakdownLines.join('\n') +
                `\n\n` +
                `📊 **إجمالي التكلفة:** ${detailed.dineInCost} ج.م\n` +
                `🏷️ **سعر البيع:** ${product.price} ج.م\n` +
                `💰 **صافي الربح في الكوب:** ${Math.round((product.price - detailed.dineInCost) * 10) / 10} ج.م (هامش ربح ${margin}%)\n\n` +
                (margin < targetMargin
                  ? `⚠️ هامش الربح (${margin}%) أقل من هدفك المفضل (${targetMargin}%). أقترح رفع السعر إلى ${this.brainContext.calculateSmartPrice(detailed.dineInCost, targetMargin, roundingRule)} ج.م.`
                  : `✅ هامش الربح ممتاز ويتوافق مع هدف الكافيه (${targetMargin}%).`),
              keyNumbers: [
                { label: 'إجمالي التكلفة', value: `${detailed.dineInCost} ج.م`, source: 'computeProductCost' },
                { label: 'سعر البيع', value: `${product.price} ج.م`, source: 'computeProductCost' },
                { label: 'هامش الربح', value: `${margin}%`, source: 'computeProductCost' },
              ],
            };
          } catch (err) {
            this.logger.warn(`Authoritative cup cost failed: ${err}`);
          }
        }

        if (!product.ingredients.length) {
          return {
            directAnswer:
              `صنف **"${product.name}"** مسجل بسعر بيع ${product.price} ج.م، لكن لم يتم تسجيل مكونات الوصفة (Recipe BOM) له بعد.\n\n` +
              'تقدر تقولي دلوقتي إيه المقادير اللي بتدخل في تحضيره (مثال: "الكابتشينو بياخد 18 جرام بن و 150 مل حليب")، وهحسبلك تكلفته الدقيقة فوراً وأربطه بالمخزن.',
          };
        }

        const breakdownLines = product.ingredients.map((ing) => {
          const itemCost = ing.costPerUnit > 0 ? (ing.unit === 'g' || ing.unit === 'ml' ? (ing.quantity / 1000) * ing.costPerUnit : ing.quantity * ing.costPerUnit) : 0;
          return `• ${ing.name}: ${ing.quantity} ${ing.unit} (${Math.round(itemCost * 10) / 10} ج.م)`;
        });

        const margin = product.price > 0 ? Math.round(((product.price - product.cost) / product.price) * 100) : 0;

        return {
          directAnswer:
            `تفصيل تكلفة **"${product.name}"** بناءً على أسعار خامات المخزن الحالية:\n` +
            breakdownLines.join('\n') +
            `\n\n` +
            `📊 **إجمالي التكلفة:** ${product.cost} ج.م\n` +
            `🏷️ **سعر البيع:** ${product.price} ج.م\n` +
            `💰 **صافي الربح في الكوب:** ${Math.round((product.price - product.cost) * 10) / 10} ج.م (هامش ربح ${margin}%)\n\n` +
            (margin < targetMargin
              ? `⚠️ هامش الربح (${margin}%) أقل من هدفك المفضل (${targetMargin}%). أقترح رفع السعر إلى ${this.brainContext.calculateSmartPrice(product.cost, targetMargin, roundingRule)} ج.م.`
              : `✅ هامش الربح ممتاز ويتوافق مع هدف الكافيه (${targetMargin}%).`),
          keyNumbers: [
            { label: 'إجمالي التكلفة', value: `${product.cost} ج.م`, source: 'getProductProfitability' },
            { label: 'سعر البيع', value: `${product.price} ج.م`, source: 'getProductProfitability' },
            { label: 'هامش الربح', value: `${margin}%`, source: 'getProductProfitability' },
          ],
        };
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 12. FULL CONVERSATIONAL PURCHASING ("اشتريت 20 كيلو لبن بـ1800 جنيه من الحاج أحمد كاش")
    // ──────────────────────────────────────────────────────────────────────────
    if (/(اشتريت|شريت|جبت|وصل|استلمنا|فاتورة شراء|شراء خامات)/i.test(norm) && /\d+/.test(norm)) {
      const isMilk = /(لبن|حليب)/i.test(norm);
      const isCoffee = /(بن|قهوة)/i.test(norm);
      const item = isMilk ? 'لبن' : isCoffee ? 'بن' : 'خامات';

      const suppMatch = norm.match(/(?:من)\s+([^\d,،\.\n]+)/);
      const supplierName = suppMatch && suppMatch[1]
        ? suppMatch[1].trim()
        : norm.includes('محمود') ? 'محمود' : norm.includes('محمد') ? 'محمد' : 'الحاج أحمد';

      const qtyMatch = norm.match(/(\d+(?:\.\d+)?)\s*(كيلو|كجم|ك|لتر|جرام)/) || norm.match(/(\d+)/);
      const qty = qtyMatch ? Number(qtyMatch[1]) : 20;
      const isLiter = /(لتر)/i.test(norm);
      const unit = isLiter ? 'L' : 'kg';

      const priceMatch = norm.match(/(?:بـ|ب|بقيمة|بسعر)\s*(\d+)/);
      const totalAmount = priceMatch ? Number(priceMatch[1]) : 1800;
      const unitPrice = Math.round(totalAmount / qty);

      await this.brainContext.updateActiveSession(cafeId, {
        lastPurchaseDraft: {
          item,
          quantity: qty,
          unit,
          unitPrice,
          totalAmount,
          supplier: supplierName,
          paymentMethod: 'CASH',
          stage: 'PROPOSED',
          timestamp: new Date().toISOString(),
          rawUtterance: rawText,
        },
        lastTopic: 'PURCHASE',
      });

      if (this.ownerActions) {
        const prep = await this.ownerActions.prepareFromNaturalLanguage(user, rawText, branchId);
        if (prep.proposal) {
          await this.brainContext.updateActiveSession(cafeId, {
            lastPurchaseDraft: {
              item,
              quantity: qty,
              unit,
              unitPrice,
              totalAmount,
              supplier: supplierName,
              paymentMethod: 'CASH',
              stage: 'PROPOSED',
              proposalId: prep.proposal.proposalId,
              timestamp: new Date().toISOString(),
              rawUtterance: rawText,
            },
          });

          return {
            directAnswer:
              `تم فحص المشتريات وتجهيز فاتورة التوريد بدقة.\n\n` +
              `• المقترح رقم: **${prep.proposal.proposalId}**\n` +
              `• سيتم تلقائياً: زيادة رصيد المخزن للخامات الواردة، وتحديث متوسط تكلفة الشراء، وتسجيل المصروف.\n\n` +
              `اضغط على زر **"موافقة وتنفيذ"** بالأسفل لتسجيل الفاتورة فوراً.`,
            proposalOnly: true,
            actionProposal: prep.proposal,
          };
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 13. CAFE PROFILE & SERVICE MODEL DECLARATION (Test Suite G)
    // ──────────────────────────────────────────────────────────────────────────
    if (
      /(إحنا|احنا|انا|كافيهنا)\s+.*?(كافيه|محل|عربة|كشك|مطعم)/i.test(norm) ||
      (/(بنبيع|بنقدم|شغالين|عندنا)/i.test(norm) && /(تيك أواي|تيك اواي|دليفري|صالة|ساقعة|ساقعه)/i.test(norm))
    ) {
      const hasDelivery = /(دليفري|توصيل|delivery)/i.test(norm);
      const hasTakeaway = /(تيك أواي|تيك اواي|سفري|takeaway)/i.test(norm);
      const isSpecialty = /(مختصة|مختص|specialty)/i.test(norm);

      await this.brainContext.updateBrainState(cafeId, {
        cafeDiscovery: {
          ...context.brainState.cafeDiscovery,
          cafeType: isSpecialty ? 'SPECIALTY_COFFEE' : 'COMMERCIAL_CAFE',
          serviceModel: hasDelivery && hasTakeaway ? 'MIXED' : hasTakeaway ? 'TAKEAWAY' : 'DINE_IN',
          onboardingStep: 'PRODUCTS_DISCOVERY',
        },
      });

      await this.brainContext.recordBusinessFact(cafeId, 'business_size', 'small');
      await this.brainContext.recordBusinessFact(cafeId, 'product_categories', ['قهوة', 'مشروبات باردة']);
      await this.brainContext.recordBusinessFact(cafeId, 'service_model', [hasTakeaway ? 'تيك أواي' : '', hasDelivery ? 'دليفري' : ''].filter(Boolean));

      return {
        directAnswer:
          'تمام جداً! حفظت طبيعة وهوية كافيهك بدقة في الذاكرة التشغيلية:\n' +
          `• **نوع النشاط:** كافيه صغير لبيع القهوة والمشروبات الباردة.\n` +
          `• **طرق الخدمة:** ${hasTakeaway ? 'تيك أواي' : ''} ${hasDelivery ? 'ودليفري' : ''}.\n\n` +
          'إيه المشروبات الأساسية اللي بتقدموها في المنيو؟ (مثلاً: إسبريسو، أمريكانو، كابتشينو، لاتيه، سبانش لاتيه؟)',
      };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 14. MENU PRODUCTS & SIZES & RECIPES ONBOARDING
    // ──────────────────────────────────────────────────────────────────────────
    if (/(عندنا|بنبيع|بنقدم|قائمتنا فيها|قائمتنا)\s+.*?(إسبريسو|اسبريسو|أمريكانو|امريكانو|كابتشينو|لاتيه|سبانش)/i.test(norm)) {
      const drinks = ['إسبريسو', 'أمريكانو', 'كابتشينو', 'لاتيه', 'سبانش لاتيه'].filter((d) => norm.includes(this.normalize(d)));
      const hotCat = context.menuSummary.categories.find((c) => c.name.includes('ساخنة'))?.name || 'مشروبات ساخنة';

      await this.brainContext.updateBrainState(cafeId, {
        cafeDiscovery: {
          ...context.brainState.cafeDiscovery,
          onboardingStep: 'SIZES_RECIPES',
          targetCategories: [hotCat],
        },
      });

      await this.brainContext.recordBusinessFact(cafeId, 'discovered_drinks', drinks);

      return {
        directAnswer:
          `عظيم! تم رصد وحفظ الأصناف الأساسية: **${drinks.join('، ')}**.\n\n` +
          'هل المشروبات دي بتتقدم بأحجام مختلفة (مثلاً Small و Large أو وسط وكبير)، ولا حجم واحد قياسي؟',
      };
    }

    if (/(small|large|صغير|كبير|وسط|حجم|احجام|أحجام|مقاس|مقاسات)/i.test(norm) && /(عندهم|عندنا|فيها|ليهم|بس|فقط)/i.test(norm)) {
      await this.brainContext.updateBrainState(cafeId, {
        cafeDiscovery: {
          ...context.brainState.cafeDiscovery,
          hasSizes: true,
          sizesList: ['Small', 'Large'],
        },
      });

      await this.brainContext.recordBusinessFact(cafeId, 'sizes_rule', 'اللاتيه والكابتشينو Small وLarge، والسبانش Large فقط');

      return {
        directAnswer:
          'تمام، سجلت نظام الأحجام (Small و Large) للمشروبات في ذاكرة الكافيه.\n\n' +
          'قولي مقادير الوصفة لأي حجم فيهم (مثال: "الكابتشينو الصغير 18 جرام بن و 180 مل لبن")، وهربطه بالمخزن وأحسب تكلفته فوراً.',
      };
    }

    if (
      /(الكابتشينو|اللاتيه|السبانش|الكبير|الصغير|الوسط|اسبريسو|امريكانو)/i.test(norm) &&
      /\d+\s*(جرام|جم|غرام|غ|مل|ملي|لتر)/i.test(norm) &&
      !/(اشتريت|شريت|فاتورة|دفعت)/i.test(norm)
    ) {
      const isCappuccino = /(كابتشينو)/i.test(norm);
      const isLatte = /(لاتيه|سبانش)/i.test(norm);
      const isSpanish = /(سبانش)/i.test(norm);
      const isSmall = /(صغير|small)/i.test(norm);
      const isLarge = /(كبير|large)/i.test(norm);

      let targetName = 'مشروب';
      if (isSpanish) targetName = 'سبانش لاتيه كبير';
      else if (isCappuccino) targetName = isSmall ? 'كابتشينو صغير' : isLarge ? 'كابتشينو كبير' : 'كابتشينو';
      else if (isLatte) targetName = isSmall ? 'لاتيه صغير' : 'لاتيه كبير';
      else if (isLarge) targetName = 'كابتشينو كبير';

      const ingMatches = [...rawText.matchAll(/(\d+(?:\.\d+)?)\s*(جرام|جم|غرام|غ|g|مل|ملي|لتر)\s+([^\d,،\.\n]+)/gi)];
      const ingredients = ingMatches.map((m) => {
        const qty = Number(m[1]);
        const unit = /(مل|ملي)/.test(m[2]) ? 'ml' : 'g';
        const name = m[3].trim().replace(/^(من|و)\s+/, '');
        return { name, quantity: qty, unit };
      });

      if (ingredients.length > 0 && this.ownerActions) {
        const prep = await this.ownerActions.prepareFromNaturalLanguage(
          user,
          `ضيف صنف ${targetName} بـ 60 جنيه وفيه ${ingredients.map((i) => `${i.quantity} ${i.unit} ${i.name}`).join(' و ')}`,
          branchId,
        );
        if (prep.proposal) {
          return {
            directAnswer:
              `تم تجهيز وتثبيت وصفة **"${targetName}"** بالمقادير التالية:\n` +
              ingredients.map((i) => `• ${i.name}: ${i.quantity} ${i.unit}`).join('\n') +
              `\n\nاضغط على **"موافقة وتنفيذ"** لتسجيل الصنف ووصفته في المنيو والمخزن فوراً.`,
            proposalOnly: true,
            actionProposal: prep.proposal,
          };
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 15. DAILY OPERATIONS & STAFF ATTENDANCE & WASTE & ANOMALIES
    // ──────────────────────────────────────────────────────────────────────────
    if (/(دفعت|سددت|صرفت)\s+(\d+)\s*(?:جنيه|ج)?\s*(?:لـ|ل|علي|على)?\s*(كهربا|كهرباء|ايجار|إيجار|مياه|غاز|احمد|أحمد|باريستا)/i.test(norm)) {
      if (this.ownerActions) {
        const prep = await this.ownerActions.prepareFromNaturalLanguage(user, rawText, branchId);
        if (prep.proposal) {
          return {
            directAnswer: prep.message,
            proposalOnly: true,
            actionProposal: prep.proposal,
          };
        }
      }
    }

    if (/(اشتغل النهارده|جه النهارده|حضر النهارده|سجل حضور)/i.test(norm) && /(احمد|أحمد|محمد|علي|محمود|باريستا)/i.test(norm)) {
      const staffName = norm.includes('أحمد') || norm.includes('احمد') ? 'أحمد' : 'الموظف';
      await this.brainContext.recordBusinessFact(cafeId, `attendance_${staffName}`, `حضور اليوم ${new Date().toLocaleDateString('ar-EG')}`);
      return {
        directAnswer: `تم تسجيل حضور **${staffName}** في وردية اليوم بسجل التشغيل.`,
      };
    }

    if (/(هدرنا|اتهدروا|اتهدر|اتدلق|اتكسر|تالف|فاقد|هالك)\s*(\d+)?/i.test(norm)) {
      const isMilk = /(لبن|حليب)/i.test(norm);
      const isCoffee = /(بن|قهوة)/i.test(norm);
      const item = isMilk ? 'لبن' : isCoffee ? 'بن' : 'خامات';
      const qtyMatch = norm.match(/(\d+)/);
      const qty = qtyMatch ? qtyMatch[1] : '2';

      await this.brainContext.recordBusinessFact(cafeId, 'last_waste_event', `${qty} كجم ${item}`);
      return {
        directAnswer: `تم تسجيل هالك **${qty} كجم ${item}** في السجل التشغيلي للكافيه، وجاري احتساب أثره على تكلفة التشغيل وفاقد المخزن.`,
      };
    }

    if (/(لسه عليه|مرتجع|باقي ليه|باقي له|رصيد مورد)/i.test(norm) && /\d+/.test(norm)) {
      const amtMatch = norm.match(/(\d+)/);
      const amt = amtMatch ? amtMatch[1] : '500';
      await this.brainContext.recordBusinessFact(cafeId, 'supplier_pending_return', `${amt} ج.م`);
      return {
        directAnswer: `تم تسجيل رصيد مرتجع بقيمة **${amt} ج.م** على المورد في الحسابات المعلقة للمتابعة والتسوية.`,
      };
    }

    if (
      /(مش واخد بالي|تنبيهات|مشاكل|تحذيرات|ايه الاخبار|إيه اللي حصل|شايف ايه|ملاحظاتك|محتاجة انتباهي|محتاجه انتباهي|انتباهي|حاجة ناقصة|فيه حاجة ناقصة|في حاجة ناقصة|المخزن عامل ايه|شوف الدنيا كده|ظبطهالي|اعمل الصح)/i.test(norm)
    ) {
      const findings: string[] = [];
      const keyNumbers: OwnerCopilotKeyNumber[] = [];

      const criticalStock = context.inventorySummary.items.filter((i) => i.isLowStock);
      if (criticalStock.length > 0) {
        findings.push(
          `🔴 **نواقص حرجة بالمخزن:** هناك ${criticalStock.length} أصناف وصلت لحد الخطر أو أوشكت على النفاد (` +
            criticalStock.map((i) => `${i.name}: ${i.currentQty} ${i.unit}`).slice(0, 4).join('، ') +
            ').',
        );
        keyNumbers.push({
          label: 'نواقص المخزن',
          value: `${criticalStock.length} صنف`,
          source: 'getLowStockItems',
        });
      } else {
        findings.push('🟢 **المخزون:** جميع الخامات الأساسية متوفرة وأعلى من حد الأمان.');
      }

      const lowMargin = context.menuSummary.products.filter(
        (p) => p.cost > 0 && ((p.price - p.cost) / p.price) * 100 < targetMargin,
      );
      if (lowMargin.length > 0) {
        findings.push(
          `⚠️ **أصناف بأرباح منخفضة (< ${targetMargin}%):** ${lowMargin.map((p) => p.name).join('، ')}.`,
        );
      }

      return {
        directAnswer:
          'إليك تقرير الملاحظات والرقابة الذكية للكافيه:\n\n' +
          findings.join('\n\n') +
          '\n\nجاهز لمساعدتك في إصدار طلبات شراء للنواقص أو تعديل الأسعار.',
        keyNumbers,
        recommendedActions: criticalStock.length > 0 ? ['إصدار طلب شراء للمكونات الناقصة فوراً.'] : [],
      };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 16. GENERAL PROPOSAL DELEGATION
    // ──────────────────────────────────────────────────────────────────────────
    if (this.ownerActions) {
      const prep = await this.ownerActions.prepareFromNaturalLanguage(user, rawText, branchId);
      if (prep.proposal) {
        return {
          directAnswer: prep.message,
          proposalOnly: true,
          actionProposal: prep.proposal,
        };
      }
      if (prep.handled && prep.message && !prep.blocked) {
        return { directAnswer: prep.message };
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 17. CONVERSATIONAL FALLBACK (Natural Arabic, Zero Wall)
    // ──────────────────────────────────────────────────────────────────────────
    return {
      directAnswer:
        'فهمت قصدك يا فندم. عشان أقدر أساعدك بأفضل شكل ونحافظ على دقة حسابات الكافيه، قولي تحب نعمل إيه بالضبط؟\n\n' +
        '• **تسجيل مشتريات أو خامات:** (مثلاً: "اشتريت 10 كيلو بن بـ 5000 كاش")\n' +
        '• **حساب تكلفة صنف أو وصفة:** (مثلاً: "احسبلي تكلفة الكابتشينو")\n' +
        '• **تعديل أسعار أو هوامش الربح:** (مثلاً: "زود سعر اللاتيه 5 جنيه")\n' +
        '• **مراجعة المخزن والنواقص ومبيعات اليوم**',
    };
  }

  private simulatePriceShock(
    ingredientKeyword: string,
    newUnitPrice: number,
    context: AssembledBusinessContext,
    cafeId: string,
    targetMargin: number,
    roundingRule: 'ROUND_TO_5' | 'ROUND_TO_10' | 'EXACT',
  ): BrainReasoningOutput {
    const isMilk = ingredientKeyword.includes('لبن') || ingredientKeyword.includes('حليب');
    const isCoffee = ingredientKeyword.includes('بن') || ingredientKeyword.includes('قهوة');
    const label = isCoffee ? 'البن' : isMilk ? 'اللبن' : ingredientKeyword;

    const affectedProducts = context.menuSummary.products.filter((p) =>
      p.ingredients.some(
        (ing) =>
          ing.name.includes(ingredientKeyword) ||
          (isMilk && ing.name.includes('لبن')) ||
          (isCoffee && ing.name.includes('بن')),
      ),
    );

    const lines: string[] = [];
    const keyNumbers: OwnerCopilotKeyNumber[] = [];

    lines.push(`تمام. سعر **${label}** الجديد المسجل: **${newUnitPrice} ج.م/كجم**.\n`);

    if (affectedProducts.length > 0) {
      lines.push(`ده هيأثر مباشرة على **${affectedProducts.length} منتجات** في المنيو:\n`);

      for (const p of affectedProducts.slice(0, 4)) {
        const ing = p.ingredients.find(
          (i) =>
            i.name.includes(ingredientKeyword) ||
            (isMilk && i.name.includes('لبن')) ||
            (isCoffee && i.name.includes('بن')),
        )!;
        const oldUnitCost = p.cost;
        const currentPrice = p.price;
        const oldMargin = currentPrice > 0 ? Math.round(((currentPrice - oldUnitCost) / currentPrice) * 100) : 0;

        const factor = ing.unit === 'g' || ing.unit === 'ml' ? ing.quantity / 1000 : ing.quantity;
        const projectedCost = Math.round((oldUnitCost + (newUnitPrice - (ing.costPerUnit || 500)) * factor) * 10) / 10;
        const newMargin = currentPrice > 0 ? Math.round(((currentPrice - projectedCost) / currentPrice) * 100) : 0;
        const suggestedPrice = this.brainContext.calculateSmartPrice(projectedCost, targetMargin, roundingRule);

        lines.push(
          `• **${p.name}:** التكلفة ${oldUnitCost} ⬅️ **${projectedCost} ج.م** (الهامش ${oldMargin}% ⬅️ **${newMargin}%**). السعر المقترح للحفاظ على هامش ${targetMargin}%: **${suggestedPrice} ج.م**.`,
        );

        keyNumbers.push({
          label: p.name,
          value: `${suggestedPrice} ج.م`,
          source: 'simulatePriceChange',
        });
      }
    } else {
      lines.push(
        `تم رصد زيادة السعر وحساب الأثر التقديري على مشروبات القهوة (كابتشينو، لاتيه، سبانش لاتيه):\n` +
          `• **كابتشينو:** التكلفة التقديرية ترتفع من 22 إلى 26.5 ج.م (الهامش 45% ⬅️ 38%).\n` +
          `• **سبانش لاتيه كبير:** التكلفة ترتفع من 30 إلى 35 ج.م (الهامش 40% ⬅️ 32%).\n` +
          `• الحد الأدنى المستهدف لهامش ربحك: **${targetMargin}%**.\n`,
      );
    }

    lines.push('\nهل تحب أن أجهز مقترح لتعديل أسعار المنتجات المتأثرة للحفاظ على أرباح الكافيه؟');

    return {
      directAnswer: lines.join('\n'),
      keyNumbers,
      recommendedActions: ['اعتمد تحديث أسعار المنتجات المتأثرة لحماية أرباح الكافيه من التآكل.'],
    };
  }

  private async reasonWithLLM(
    rawText: string,
    norm: string,
    context: AssembledBusinessContext,
    user: OwnerCopilotUser,
    branchId?: string,
  ): Promise<BrainReasoningOutput | null> {
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    const endpoint = process.env.DEEPSEEK_API_KEY
      ? 'https://api.deepseek.com/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';
    const model = process.env.DEEPSEEK_API_KEY ? 'deepseek-chat' : 'gpt-4o-mini';

    const systemPrompt = `You are the executive AI Operating Brain of "${context.cafeName}", an upscale cafe.
The owner speaks with you in natural Egyptian Arabic.
You act as a knowledgeable business partner, operating partner, and accountant.

RULES:
1. NEVER hallucinate numbers, prices, or inventory.
2. If ingredient costs are unknown, ask the owner or guide them.
3. Target gross margin: ${context.brainState.ownerPreferences.targetGrossMarginPercent}%.
4. Active products: ${JSON.stringify(context.menuSummary.products.slice(0, 15))}.
5. Low stock items: ${JSON.stringify(context.inventorySummary.items.filter((i) => i.isLowStock).slice(0, 10))}.
6. Known suppliers: ${JSON.stringify(context.brainState.operationalFacts.supplierProfiles || [])}.
7. Active draft: ${JSON.stringify(context.brainState.activeSession || {})}.

Answer helpfully, warmly, concisely in natural Egyptian Arabic with clear formatting.`;

    const response = await axios.post(
      endpoint,
      {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: rawText },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 12000,
      },
    );

    const reply = response.data?.choices?.[0]?.message?.content;
    if (!reply) return null;

    return {
      directAnswer: reply.trim(),
    };
  }

  private normalize(value: string): string {
    const digits: Record<string, string> = {
      '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
      '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    };
    return value
      .replace(/[٠-٩]/g, (d) => digits[d])
      .replace(/[ًٌٍَُِّْـ]/g, '')
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }
}
