import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiToolsService } from './tools/ai-tools.service';
import { AiToolContext, AiToolResult } from './tools/ai-tool.types';
import { AI_TOOL_DEFINITIONS } from './tools/ai-tool-definitions';
import axios from 'axios';

export interface GroundedChatInput {
  cafeId: string;
  phone: string;
  message: string;
  customerName?: string;
  isSimulation?: boolean;
}

export interface GroundedChatOutput {
  reply: string;
  toolsCalled: Array<{ tool: string; input: any; success: boolean }>;
  confidence: number;
  handoffTriggered: boolean;
  debugTrace?: any;
}

@Injectable()
export class GroundedAiEngineService {
  private readonly logger = new Logger(GroundedAiEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly toolsService: AiToolsService,
  ) {}

  /**
   * Main entry point for customer message processing
   */
  async processCustomerMessage(input: GroundedChatInput): Promise<GroundedChatOutput> {
    const { cafeId, phone, message, isSimulation } = input;
    const toolsCalled: Array<{ tool: string; input: any; success: boolean }> = [];

    // 1. Resolve Tenant Config & Boundaries (Rules #18, #36, #38)
    const cafe = await this.prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { name: true, active: true },
    });

    const aiConfig = await this.prisma.cafeAiConfig.findUnique({
      where: { cafeId },
    });

    // 2. Fetch Customer Context (Rules #10, #11, #13, #14 - Compact & Non-Intrusive)
    const customerHabit = await this.prisma.customerHabit.findFirst({
      where: { cafeId, customer: { phone } },
      select: {
        favoriteProductName: true,
        usualTime: true,
        totalOrders: true,
      },
    });

    const context: AiToolContext = {
      cafeId,
      phone,
      isSimulation: Boolean(isSimulation),
      channel: isSimulation ? 'SIMULATOR' : 'WHATSAPP',
    };

    // 3. Build Modular Prompt (Rule #38)
    const systemPrompt = this.buildModularPrompt(cafe?.name || 'الكافيه', aiConfig, customerHabit);

    // 4. Check for Fallback or Direct Intent
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return this.handleFallbackOffline(input, context);
    }

    try {
      // 5. Query LLM with Tool Calling (Function Calling)
      const completion = await axios.post(
        'https://api.deepseek.com/chat/completions',
        {
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message },
          ],
          tools: AI_TOOL_DEFINITIONS.map((t) => ({
            type: 'function',
            function: t,
          })),
          tool_choice: 'auto',
          temperature: 0.3,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );

      const choice = completion.data?.choices?.[0]?.message;
      let finalReply = choice?.content || '';
      let handoffTriggered = false;

      // 6. Execute Tool Calls against Database Grounding (Rules #2, #5, #6)
      if (choice?.tool_calls && choice.tool_calls.length > 0) {
        const toolMessages: any[] = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
          choice,
        ];

        for (const tc of choice.tool_calls) {
          const fnName = tc.function?.name;
          let fnArgs: any = {};
          try {
            fnArgs = JSON.parse(tc.function?.arguments || '{}');
          } catch {
            fnArgs = {};
          }

          let toolRes: AiToolResult = { success: false, error: 'Unknown tool' };

          if (fnName === 'search_menu') {
            toolRes = await this.toolsService.searchMenu(context, fnArgs);
          } else if (fnName === 'get_product_details') {
            toolRes = await this.toolsService.getProductDetails(context, fnArgs);
          } else if (fnName === 'get_cafe_operational_status') {
            toolRes = await this.toolsService.getCafeOperationalStatus(context);
          } else if (fnName === 'check_delivery_quote') {
            toolRes = await this.toolsService.checkDeliveryQuote(context, fnArgs);
          } else if (fnName === 'calculate_order_quote') {
            toolRes = await this.toolsService.calculateOrderQuote(context, fnArgs);
          } else if (fnName === 'create_order_transaction') {
            toolRes = await this.toolsService.createOrderTransaction(context, fnArgs);
          } else if (fnName === 'handoff_to_human') {
            toolRes = await this.toolsService.handoffToHuman(context, fnArgs);
            handoffTriggered = true;
          } else if (fnName === 'get_payment_instructions') {
            toolRes = await this.toolsService.getPaymentInstructions(context, fnArgs);
          } else if (fnName === 'submit_payment_reference') {
            toolRes = await this.toolsService.submitPaymentReference(context, fnArgs);
          } else if (fnName === 'check_playstation_availability') {
            toolRes = await this.toolsService.checkPlayStationAvailability(context, fnArgs);
          } else if (fnName === 'check_inventory_and_costing') {
            toolRes = await this.toolsService.checkInventoryAndCosting(context, fnArgs);
          }

          toolsCalled.push({
            tool: fnName,
            input: fnArgs,
            success: toolRes.success,
          });

          toolMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: fnName,
            content: JSON.stringify(toolRes),
          });
        }

        // Generate natural grounded response using tool results
        const secondCall = await axios.post(
          'https://api.deepseek.com/chat/completions',
          {
            model: 'deepseek-chat',
            messages: toolMessages,
            temperature: 0.3,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          },
        );

        finalReply = secondCall.data?.choices?.[0]?.message?.content || finalReply;
      }

      // If no reply or empty, fallback
      if (!finalReply) {
        finalReply = 'أهلاً بك! تفضل باختيار طلبك من المنيو أو اكتب اسم المشروب اللي تحبه ☕';
      }

      // 7. Audit Log (Rule #40)
      if (!isSimulation) {
        await this.prisma.aILog.create({
          data: {
            cafeId,
            userRole: 'CUSTOMER',
            message,
            detectedIntent: toolsCalled[0]?.tool || 'CONVERSATION',
            action: toolsCalled.map((t) => t.tool).join(', ') || 'REPLY',
          },
        }).catch(() => undefined);
      }

      return {
        reply: finalReply,
        toolsCalled,
        confidence: 0.95,
        handoffTriggered,
        debugTrace: {
          promptPersona: aiConfig?.tone || 'EGYPTIAN_CASUAL',
          toolsExecuted: toolsCalled,
          customerMemoryUsed: Boolean(customerHabit?.favoriteProductName),
        },
      };
    } catch (err: any) {
      this.logger.error(`AI Grounded Engine failure: ${err?.message}`);
      return this.handleFallbackOffline(input, context);
    }
  }

  private buildModularPrompt(cafeName: string, aiConfig: any, customerHabit: any): string {
    const tone = aiConfig?.tone || 'EGYPTIAN_CASUAL';
    const botName = aiConfig?.botName || 'مساعد الكافيه الذكي';

    let toneDirective = 'تحدث باللهجة المصرية العامية الودودة والمهذبة، إجاباتك قصيرة وموجزة تناسب محادثات واتساب.';
    if (tone === 'PROFESSIONAL') {
      toneDirective = 'تحدث باللغة العربية الفصحى الراقية والمهنية، بأسلوب رسمي ومهذب.';
    } else if (tone === 'FAST_CONCISE') {
      toneDirective = 'تحدث بأسلوب سريع ومختصر جداً، ادخل في صلب الموضوع بدون مقدمات طويلة.';
    }

    const customInstructions = aiConfig?.customInstructions
      ? `\nتعليمات إضافية خاصة بالكافيه:\n${aiConfig.customInstructions}`
      : '';

    const customerDirective = customerHabit?.favoriteProductName
      ? `\nبيانات الزبون: الزبون ده معتاد يطلب (${customerHabit.favoriteProductName}). إذا طلب المعتاد، اقترحه عليه بلطف، لكن إذا طلب صنف مختلف لا تجبره عليه.`
      : '';

    const upsellDirective = aiConfig?.enableRecommendations
      ? `\nالبيع الإضافي: يمكنك اقتراح عدد أقصى ${Number(aiConfig?.maxUpsellsPerSession) > 0 ? aiConfig.maxUpsellsPerSession : 1} عنصر إضافي مناسب فقط، بدون تكرار أو إلحاح.`
      : '\nالبيع الإضافي: ممنوع اقتراح أي إضافات أو ترقيات.';

    return `
أنت ${botName}، المساعد الذكي الرسمي لكافيه "${cafeName}".
أسلوب الرد: ${toneDirective}
${customInstructions}
${customerDirective}
${upsellDirective}

القواعد الصارمة غير القابلة للنقاش:
1. ممنوع منعاً باتاً تخمين أو اختراع أي منتج أو سعر من عندك. كل المعلومات تأتي من استدعاء الأدوات فقط.
2. إذا سأل العميل عن منتج غير متاح في أداة search_menu، قل بوضوح وبكل أدب أنه غير متوفر.
3. لا تحسب الأسعار أو الخصومات بنفسك، استعن دائماً بأداة calculate_order_quote.
4. إجاباتك قصيرة (سطر أو سطرين) متبوعة بسؤال بسيط لتأكيد الطلب.
5. عند الشكاوى أو طلب التحدث مع شخص، استخدم أداة handoff_to_human فوراً.
`.trim();
  }

  private async handleFallbackOffline(input: GroundedChatInput, context: AiToolContext): Promise<GroundedChatOutput> {
    // Rule #46: Defined fallback behavior when LLM is unavailable
    const menu = await this.toolsService.searchMenu(context, { limit: 5 });
    const items = menu.data || [];
    const menuPreview = items.map((p: any) => `• ${p.name} (${p.basePrice} ج)`).join('\n');

    return {
      reply: `أهلاً بيك في كافيهنا ☕\nأبرز المشروبات المتاحة حالياً:\n${menuPreview}\n\nتحب تطلب إيه؟`,
      toolsCalled: [{ tool: 'search_menu_fallback', input: {}, success: true }],
      confidence: 0.7,
      handoffTriggered: false,
    };
  }
}
