import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { PaymentService } from './payment.service';
import { UpdatePaymentConfigDto, SubmitPaymentReferenceDto, VerifyPaymentTransactionDto } from './dto/digital-payment.dto';
import * as QRCode from 'qrcode';

export interface PaymentOptionItem {
  id: string;
  provider: string;
  nameAr: string;
  nameEn: string;
  type: 'INSTAPAY' | 'SMART_WALLET' | 'CARD_GATEWAY';
  details: {
    addressOrNumber: string;
    accountName?: string;
    quickUssd?: string;
    qrData?: string;
    qrDataUrl?: string;
    checkoutUrl?: string;
  };
  instructionsAr: string;
}

export interface OrderPaymentOptionsResult {
  cafeId: string;
  cafeName: string;
  orderId: string;
  orderCode: string;
  amountDue: number;
  available: boolean;
  options: PaymentOptionItem[];
  formattedCustomerSummaryAr: string;
}

@Injectable()
export class DigitalPaymentService {
  private readonly logger = new Logger(DigitalPaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly eventsService: EventsService,
  ) {}

  /**
   * Retrieve or create default digital payment configuration for a specific cafe.
   */
  async getPaymentConfig(cafeId: string) {
    let config = await this.prisma.cafePaymentConfig.findUnique({
      where: { cafeId },
    });

    if (!config) {
      config = await this.prisma.cafePaymentConfig.create({
        data: {
          cafeId,
          instapayEnabled: false,
          vodafoneCashEnabled: false,
          orangeCashEnabled: false,
          etisalatCashEnabled: false,
          wePayEnabled: false,
          onlineCardEnabled: false,
          cashOnDeliveryEnabled: true,
        },
      });
    }

    return config;
  }

  /**
   * Update or upsert cafe payment configuration.
   */
  async updatePaymentConfig(cafeId: string, dto: UpdatePaymentConfigDto) {
    return this.prisma.cafePaymentConfig.upsert({
      where: { cafeId },
      update: {
        ...dto,
      },
      create: {
        cafeId,
        ...dto,
      },
    });
  }

  /**
   * Build dynamic payment options (InstaPay QR, Wallets, Gateways) for an order.
   */
  async getPaymentOptions(cafeId: string, orderId: string): Promise<OrderPaymentOptionsResult> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        cafe: { select: { id: true, name: true } },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    if (order.cafeId !== cafeId) {
      throw new BadRequestException('Order does not belong to the requested cafe');
    }

    const config = await this.getPaymentConfig(cafeId);
    const amountDue = Math.max(0, Number(order.total) - Number(order.amountPaid || 0));

    const options: PaymentOptionItem[] = [];

    // 1. InstaPay Dynamic Integration
    if (config.instapayEnabled && config.instapayAddress) {
      const ipa = config.instapayAddress.trim();
      const rawInstaPayUri = `instapay://pay?ipa=${encodeURIComponent(ipa)}&amount=${amountDue.toFixed(2)}&ref=${encodeURIComponent(order.code)}`;
      
      let qrDataUrl = '';
      try {
        qrDataUrl = await QRCode.toDataURL(rawInstaPayUri, {
          width: 256,
          margin: 1,
          color: { dark: '#000000', light: '#FFFFFF' },
        });
      } catch (err: any) {
        this.logger.error(`Failed to generate InstaPay QR: ${err?.message}`);
      }

      options.push({
        id: 'instapay',
        provider: 'INSTAPAY',
        nameAr: 'انستاباي (InstaPay)',
        nameEn: 'InstaPay',
        type: 'INSTAPAY',
        details: {
          addressOrNumber: ipa,
          accountName: config.instapayAccountName || undefined,
          qrData: rawInstaPayUri,
          qrDataUrl,
        },
        instructionsAr: `افتح تطبيق InstaPay وادفع لحساب: ${ipa} بمبلغ: ${amountDue} ج.م، واكتب كود الطلب (${order.code}) في الملاحظات، ثم ارسل رقم مرجع التحويل.`,
      });
    }

    // 2. Vodafone Cash
    if (config.vodafoneCashEnabled && config.vodafoneCashNumber) {
      const phone = config.vodafoneCashNumber.trim();
      options.push({
        id: 'vodafone_cash',
        provider: 'VODAFONE_CASH',
        nameAr: 'فودافون كاش (Vodafone Cash)',
        nameEn: 'Vodafone Cash',
        type: 'SMART_WALLET',
        details: {
          addressOrNumber: phone,
          quickUssd: `*9*7*${phone}*${Math.round(amountDue)}#`,
        },
        instructionsAr: `حول ${amountDue} ج.م إلى محفظة فودافون كاش رقم: ${phone} (أو اطلب كود التحويل السريع *9*7*${phone}*${Math.round(amountDue)}#)، ثم شارك رقم المحفظة المحول منها.`,
      });
    }

    // 3. Orange Cash
    if (config.orangeCashEnabled && config.orangeCashNumber) {
      const phone = config.orangeCashNumber.trim();
      options.push({
        id: 'orange_cash',
        provider: 'ORANGE_CASH',
        nameAr: 'أورنج كاش (Orange Cash)',
        nameEn: 'Orange Cash',
        type: 'SMART_WALLET',
        details: {
          addressOrNumber: phone,
          quickUssd: `*115*1*${phone}*${Math.round(amountDue)}#`,
        },
        instructionsAr: `حول ${amountDue} ج.م إلى محفظة أورنج كاش رقم: ${phone}، ثم شارك رسالة تأكيد التحويل.`,
      });
    }

    // 4. Etisalat Cash
    if (config.etisalatCashEnabled && config.etisalatCashNumber) {
      const phone = config.etisalatCashNumber.trim();
      options.push({
        id: 'etisalat_cash',
        provider: 'ETISALAT_CASH',
        nameAr: 'اتصالات كاش (Etisalat Cash)',
        nameEn: 'Etisalat Cash',
        type: 'SMART_WALLET',
        details: {
          addressOrNumber: phone,
          quickUssd: `*777*${phone}*${Math.round(amountDue)}#`,
        },
        instructionsAr: `حول ${amountDue} ج.م إلى محفظة اتصالات كاش رقم: ${phone}، ثم ارسل رقم العملية.`,
      });
    }

    // 5. WE Pay
    if (config.wePayEnabled && config.wePayNumber) {
      const phone = config.wePayNumber.trim();
      options.push({
        id: 'we_pay',
        provider: 'WE_PAY',
        nameAr: 'وي باي (WE Pay)',
        nameEn: 'WE Pay',
        type: 'SMART_WALLET',
        details: {
          addressOrNumber: phone,
        },
        instructionsAr: `حول ${amountDue} ج.م إلى محفظة WE Pay رقم: ${phone}.`,
      });
    }

    // 6. Paymob Gateway
    if (config.onlineCardEnabled && config.paymobIframeId) {
      options.push({
        id: 'paymob_card',
        provider: 'PAYMOB',
        nameAr: 'بطاقة بنكية / فيزا وماستركارد (Paymob)',
        nameEn: 'Paymob Card Checkout',
        type: 'CARD_GATEWAY',
        details: {
          addressOrNumber: 'Online Card Payment',
          checkoutUrl: `https://accept.paymob.com/api/acceptance/iframes/${config.paymobIframeId}`,
        },
        instructionsAr: `ادفع إلكترونياً بأمان عبر بطاقتك البنكية.`,
      });
    }

    // Build customer-friendly WhatsApp summary
    let summaryAr = `💳 *طرق الدفع الإلكتروني المتاحة لكافيه ${order.cafe?.name || ''}*:\n`;
    summaryAr += `رقم الطلب: #${order.code}\n`;
    summaryAr += `المبلغ المطلوب: *${amountDue} ج.م*\n\n`;

    if (options.length === 0) {
      summaryAr += `الدفع متاح نقداً (كاش) فقط عند الاستلام.`;
    } else {
      options.forEach((opt, idx) => {
        summaryAr += `${idx + 1}. *${opt.nameAr}*\n`;
        summaryAr += `   ${opt.instructionsAr}\n\n`;
      });
      summaryAr += `بعد إتمام التحويل، يرجى الرد برقم العملية أو رقم المحفظة المحول منها لتأكيد طلبك مباشرة! ✨`;
    }

    return {
      cafeId,
      cafeName: order.cafe?.name || '',
      orderId: order.id,
      orderCode: order.code,
      amountDue,
      available: options.length > 0,
      options,
      formattedCustomerSummaryAr: summaryAr,
    };
  }

  /**
   * Submit transaction reference number from customer (via WhatsApp AI or web UI).
   */
  async submitPaymentReference(cafeId: string, orderId: string, dto: SubmitPaymentReferenceDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { phone: true } },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    if (order.cafeId !== cafeId) {
      throw new BadRequestException('Order does not belong to this cafe');
    }

    const amount = dto.amount ?? Math.max(0, Number(order.total) - Number(order.amountPaid || 0));
    const customerPhone = dto.customerPhone?.trim() || order.customer?.phone || '0000000000';

    // Create DigitalPaymentTransaction record in VERIFYING status
    const transaction = await this.prisma.digitalPaymentTransaction.create({
      data: {
        cafe: { connect: { id: cafeId } },
        order: { connect: { id: orderId } },
        branchId: order.branchId || null,
        customerPhone,
        provider: dto.provider.toUpperCase(),
        referenceNumber: dto.referenceNumber.trim(),
        amount,
        status: 'VERIFYING',
        notes: dto.notes || null,
      },
    });

    // Notify Owner and Barista via WebSocket/Events
    this.eventsService.broadcast('payment:transaction_submitted', {
      transactionId: transaction.id,
      orderId: order.id,
      orderCode: order.code,
      provider: transaction.provider,
      referenceNumber: transaction.referenceNumber,
      amount,
      customerPhone: transaction.customerPhone,
      createdAt: transaction.createdAt,
    }, cafeId);

    const userFriendlyMessage = `تم استلام بيانات التحويل بنجاح (رقم العملية: ${transaction.referenceNumber}) لمبلغ ${amount} ج.م. جاري التحقق الفوري وتأكيد الطلب خلال دقائق!`;

    return {
      success: true,
      transactionId: transaction.id,
      status: transaction.status,
      referenceNumber: transaction.referenceNumber,
      userFriendlyMessage,
    };
  }

  /**
   * Get transactions for owner dashboard (with filtering).
   */
  async getTransactions(cafeId: string, filter?: { status?: string; limit?: number }) {
    const where: any = { cafeId };
    if (filter?.status) {
      where.status = filter.status.toUpperCase();
    }

    const transactions = await this.prisma.digitalPaymentTransaction.findMany({
      where,
      take: filter?.limit || 50,
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: {
            id: true,
            code: true,
            total: true,
            paymentStatus: true,
            status: true,
            customer: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    return transactions;
  }

  /**
   * Verify a transaction (Approve or Reject by Owner/Cashier).
   */
  async verifyTransaction(
    cafeId: string,
    transactionId: string,
    staffId: string,
    dto: VerifyPaymentTransactionDto,
  ) {
    const transaction = await this.prisma.digitalPaymentTransaction.findUnique({
      where: { id: transactionId },
      include: {
        order: { select: { id: true, cafeId: true, total: true, code: true } },
      },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction ${transactionId} not found`);
    }

    if (transaction.cafeId !== cafeId) {
      throw new BadRequestException('Transaction does not belong to this cafe');
    }

    if (transaction.status === 'PAID') {
      return { success: true, message: 'Transaction is already approved and paid', transaction };
    }

    if (dto.action === 'APPROVE') {
      // 1. Mark transaction PAID
      const updatedTx = await this.prisma.digitalPaymentTransaction.update({
        where: { id: transactionId },
        data: {
          status: 'PAID',
          verifiedAt: new Date(),
          verifiedById: staffId,
          notes: dto.notes || transaction.notes,
        },
      });

      // 2. Settle Order Payment through PaymentService
      await this.paymentService.markOrderPayment(
        transaction.orderId,
        {
          paymentStatus: 'PAID',
          amountPaid: Number(transaction.amount),
          method: transaction.provider,
          collectedById: staffId,
          collectedRole: 'OWNER',
          notes: `تم التحقق من الدفع الإلكتروني (${transaction.provider}) - رقم المرجع: ${transaction.referenceNumber}`,
        },
        cafeId,
      );

      // 3. Emit real-time verified event
      this.eventsService.broadcast('payment:verified', {
        transactionId: updatedTx.id,
        orderId: transaction.orderId,
        orderCode: transaction.order.code,
        provider: updatedTx.provider,
        amount: Number(updatedTx.amount),
        verifiedAt: updatedTx.verifiedAt,
      }, cafeId);

      return {
        success: true,
        action: 'APPROVED',
        message: `تم اعتماد التحويل وتحديث حالة الطلب #${transaction.order.code} إلى مدفوع.`,
        transaction: updatedTx,
      };
    } else {
      // REJECT
      const updatedTx = await this.prisma.digitalPaymentTransaction.update({
        where: { id: transactionId },
        data: {
          status: 'FAILED',
          notes: dto.notes || 'رفض التحقق بواسطة الإدارة',
        },
      });

      this.eventsService.broadcast('payment:rejected', {
        transactionId: updatedTx.id,
        orderId: transaction.orderId,
        orderCode: transaction.order.code,
        reason: updatedTx.notes,
      }, cafeId);

      return {
        success: true,
        action: 'REJECTED',
        message: 'تم رفض التحويل.',
        transaction: updatedTx,
      };
    }
  }

  /**
   * Paymob Webhook Handler for automatic card payments.
   */
  async handlePaymobWebhook(payload: any) {
    try {
      const obj = payload?.obj;
      if (!obj) return { received: false };

      const orderCode = obj.order?.merchant_order_id || obj.merchant_order_id;
      const isSuccess = obj.success === true;
      const txnId = String(obj.id);
      const amountCents = obj.amount_cents || 0;
      const amount = amountCents / 100;

      this.logger.log(`Paymob Webhook received: Order=${orderCode}, Success=${isSuccess}, Txn=${txnId}`);

      if (!orderCode || !isSuccess) {
        return { received: true, success: false };
      }

      // Find order by code
      const order = await this.prisma.order.findFirst({
        where: { code: orderCode },
        include: { customer: { select: { phone: true } } },
      });

      if (!order) {
        this.logger.warn(`Paymob Webhook: Order ${orderCode} not found`);
        return { received: true, orderFound: false };
      }

      // Settle payment
      await this.prisma.digitalPaymentTransaction.create({
        data: {
          cafe: { connect: { id: order.cafeId } },
          order: { connect: { id: order.id } },
          branchId: order.branchId || null,
          customerPhone: order.customer?.phone || '0000000000',
          provider: 'PAYMOB',
          referenceNumber: txnId,
          amount,
          status: 'PAID',
          verifiedAt: new Date(),
          notes: 'Paymob Webhook Auto-Verified',
        },
      });

      await this.paymentService.markOrderPayment(
        order.id,
        {
          paymentStatus: 'PAID',
          amountPaid: amount,
          method: 'PAYMOB_CARD',
          notes: `Paymob Online Card - Txn ${txnId}`,
        },
        order.cafeId,
      );

      return { received: true, success: true };
    } catch (err: any) {
      this.logger.error(`Error processing Paymob webhook: ${err?.message}`);
      return { received: true, error: err?.message };
    }
  }
}
