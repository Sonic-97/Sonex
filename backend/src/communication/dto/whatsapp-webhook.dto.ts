export interface NormalizedWhatsAppMessage {
  messageId: string;
  from: string;
  to: string;
  body: string;
  timestamp: number;
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'contacts' | 'unknown';
  source: 'openwa' | 'meta_cloud_api' | 'mock';
  raw: Record<string, unknown>;
}

export function normalizeOpenWAPayload(payload: any): NormalizedWhatsAppMessage {
  const data = payload?.data || payload?.payload || payload;
  return {
    messageId: data?.id || payload?.messageId || '',
    from: data?.from || data?.chatId || payload?.remoteJid || '',
    to: data?.to || data?.participant || '',
    body: data?.body || payload?.message || data?.text || '',
    timestamp: data?.timestamp || payload?.timestamp || Date.now(),
    type: data?.type || payload?.type || 'text',
    source: 'openwa',
    raw: payload,
  };
}

export function normalizeMetaCloudAPIPayload(payload: any): NormalizedWhatsAppMessage | null {
  const entry = payload?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const msg = value?.messages?.[0];
  const metadata = value?.metadata;
  if (!msg) return null;

  return {
    messageId: msg.id || '',
    from: msg.from || '',
    to: metadata?.display_phone_number || metadata?.phone_number_id || '',
    body: msg.text?.body || msg.caption || '',
    timestamp: parseInt(msg.timestamp as string, 10) || Date.now(),
    type: msg.type || 'text',
    source: 'meta_cloud_api',
    raw: payload,
  };
}

export function normalizeWebhookPayload(body: any): NormalizedWhatsAppMessage | null {
  if (body?.data || body?.payload || body?.messageId) {
    return normalizeOpenWAPayload(body);
  }
  if (body?.object === 'whatsapp_business_account' || body?.entry) {
    return normalizeMetaCloudAPIPayload(body);
  }
  if (body?.message && !body?.data && !body?.object) {
    return {
      messageId: body.messageId || '',
      from: body.from || body.phone || '',
      to: body.to || '',
      body: body.message || body.text || '',
      timestamp: body.timestamp || Date.now(),
      type: body.type || 'text',
      source: 'mock',
      raw: body,
    };
  }
  return null;
}
