export interface UpdatePaymentConfigDto {
  instapayEnabled?: boolean;
  instapayAddress?: string;
  instapayAccountName?: string;

  vodafoneCashEnabled?: boolean;
  vodafoneCashNumber?: string;

  orangeCashEnabled?: boolean;
  orangeCashNumber?: string;

  etisalatCashEnabled?: boolean;
  etisalatCashNumber?: string;

  wePayEnabled?: boolean;
  wePayNumber?: string;

  onlineCardEnabled?: boolean;
  paymobApiKey?: string;
  paymobIntegrationId?: string;
  paymobIframeId?: string;
  paymobHmacSecret?: string;

  cashOnDeliveryEnabled?: boolean;
  instructionsArabic?: string;
}

export interface SubmitPaymentReferenceDto {
  provider: string; // 'INSTAPAY' | 'VODAFONE_CASH' | 'ORANGE_CASH' | 'ETISALAT_CASH' | 'WE_PAY' | 'PAYMOB'
  referenceNumber: string;
  customerPhone?: string;
  amount?: number;
  notes?: string;
}

export interface VerifyPaymentTransactionDto {
  action: 'APPROVE' | 'REJECT';
  notes?: string;
}
