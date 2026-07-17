import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  private lidMapping: Map<string, { phoneJid: string }> = new Map();

  setLidMappingCache(mappings: Array<{ lid: string; phoneJid: string | null }>): void {
    for (const m of mappings) {
      if (m.phoneJid) {
        this.lidMapping.set(m.lid, { phoneJid: m.phoneJid });
      }
    }
  }

  resolveLidToJid(value: string): string {
    if (!value) return value;
    if (value.includes('@c.us') || value.includes('@s.whatsapp.net')) return value;
    const lid = value.includes('@lid') ? value.split('@')[0] + '@lid' : null;
    if (!lid && value.startsWith('lid_')) {
      const cached = this.lidMapping.get(value);
      if (cached) return cached.phoneJid;
      return value;
    }
    if (lid) {
      const cached = this.lidMapping.get(lid);
      if (cached) return cached.phoneJid;
    }
    return value;
  }

  private cachedSessionUuid: string | null = null;

  async getSessionUuid(): Promise<string> {
    if (this.cachedSessionUuid) return this.cachedSessionUuid;

    const apiUrl = process.env.OPENWA_API_URL || 'http://localhost:2785/api';
    const sessionConfigId = process.env.OPENWA_SESSION_ID || 'sonic-coffee';
    const apiKey = process.env.OPENWA_API_KEY;

    // If it's already a UUID format, return it directly
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionConfigId)) {
      this.cachedSessionUuid = sessionConfigId;
      return sessionConfigId;
    }

    // Otherwise, it's a name, look it up in the session list
    try {
      const response = await axios.get(`${apiUrl}/sessions`, {
        headers: { 'X-API-Key': apiKey },
      });
      const session = response.data.find((s: any) => s.name === sessionConfigId);
      if (session) {
        this.cachedSessionUuid = session.id;
        return session.id;
      }
      throw new Error(`Session with name "${sessionConfigId}" not found in OpenWA`);
    } catch (err) {
      this.logger.error(`Failed to resolve session UUID for "${sessionConfigId}": ${(err as Error).message}`);
      throw err;
    }
  }

  async getContactDetails(contactId: string): Promise<{ phone?: string; name?: string } | null> {
    const apiUrl = process.env.OPENWA_API_URL || 'http://localhost:2785/api';
    const apiKey = process.env.OPENWA_API_KEY;
    try {
      const sessionId = await this.getSessionUuid();
      const response = await axios.get(`${apiUrl}/sessions/${sessionId}/contacts/${encodeURIComponent(contactId)}`, {
        headers: { 'X-API-Key': apiKey },
        timeout: 5000,
      });
      const data = response.data;
      if (data?.phone) return { phone: data.phone, name: data.name || data.pushName };
      if (data?.id && data.id.includes('@c.us')) {
        return { phone: data.id.split('@')[0], name: data.name || data.pushName };
      }
      return null;
    } catch (err) {
      this.logger.warn(`Failed to get contact details for ${contactId}: ${(err as Error).message}`);
      return null;
    }
  }

  async getContactPhone(contactId: string): Promise<string | null> {
    const apiUrl = process.env.OPENWA_API_URL || 'http://localhost:2785/api';
    const apiKey = process.env.OPENWA_API_KEY;
    try {
      const sessionId = await this.getSessionUuid();
      const response = await axios.get(`${apiUrl}/sessions/${sessionId}/contacts/${encodeURIComponent(contactId)}/phone`, {
        headers: { 'X-API-Key': apiKey },
        timeout: 5000,
      });
      return response.data?.phone || null;
    } catch (err) {
      this.logger.warn(`Failed to get contact phone for ${contactId}: ${(err as Error).message}`);
      return null;
    }
  }

  async registerWebhook(): Promise<boolean> {
    const provider = process.env.WHATSAPP_PROVIDER || 'mock';
    if (provider !== 'openwa') return false;

    const apiUrl = process.env.OPENWA_API_URL || 'http://localhost:2785/api';
    const apiKey = process.env.OPENWA_API_KEY;
    const webhookUrl = `${process.env.BACKEND_URL || 'http://localhost:5000'}/communication/webhook/whatsapp`;

    try {
      const sessionId = await this.getSessionUuid();
      await axios.post(
        `${apiUrl}/sessions/${sessionId}/webhooks`,
        { url: webhookUrl, events: ['*'] },
        { headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey } },
      );
      this.logger.log(`Webhook registered at ${webhookUrl} for session ${sessionId}`);
      return true;
    } catch (err) {
      this.logger.warn(`Webhook registration failed: ${(err as Error).message}`);
      return false;
    }
  }

  async sendMessage(
    phone: string,
    message: string,
  ): Promise<{ success: boolean; provider: string; blocked?: string }> {
    const provider = process.env.WHATSAPP_PROVIDER || 'mock';

    if (provider === 'mock') {
      this.logger.log(`[MOCK] Sending to ${phone}: ${message}`);
      return { success: true, provider: 'mock' };
    }

    if (provider === 'twilio') {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;

      if (!accountSid || !authToken || !fromNumber) {
        this.logger.error('Twilio credentials not configured');
        return { success: false, provider: 'twilio' };
      }

      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

      const payload = new URLSearchParams({
        From: `whatsapp:${fromNumber}`,
        To: `whatsapp:${phone}`,
        Body: message,
      });

      const doSend = () =>
        axios.post(url, payload.toString(), {
          auth: { username: accountSid, password: authToken },
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

      try {
        await doSend();
        this.logger.log(`Twilio message sent to ${phone}`);
        return { success: true, provider: 'twilio' };
      } catch (err) {
        this.logger.warn(`Twilio send failed, retrying once: ${(err as Error).message}`);
        try {
          await doSend();
          this.logger.log(`Twilio message sent to ${phone} on retry`);
          return { success: true, provider: 'twilio' };
        } catch (err2) {
          this.logger.error(`Twilio send failed after retry: ${(err2 as Error).message}`);
          return { success: false, provider: 'twilio' };
        }
      }
    }

    if (provider === 'openwa') {
      const apiUrl = process.env.OPENWA_API_URL || 'http://localhost:2785/api';
      const apiKey = process.env.OPENWA_API_KEY;

      let cleanPhone = this.resolveLidToJid(phone);

      console.log(JSON.stringify({
        event: 'TRACE_OPENWA_PRE_SEND',
        originalPhone: phone,
        afterLidResolve: cleanPhone,
        phoneHasAt: cleanPhone.includes('@'),
        isLid: cleanPhone.includes('@lid'),
        isCus: cleanPhone.includes('@c.us'),
      }));

      if (!cleanPhone.includes('@')) {
        cleanPhone = cleanPhone.replace(/\D/g, '');
        if (cleanPhone.startsWith('01') && cleanPhone.length === 11) {
          cleanPhone = '20' + cleanPhone.slice(1);
        } else if (cleanPhone.startsWith('1') && cleanPhone.length === 10) {
          cleanPhone = '20' + cleanPhone;
        }
        cleanPhone = `${cleanPhone}@c.us`;
      }

      if (cleanPhone.includes('@lid')) {
        console.log(JSON.stringify({
          event: 'TRACE_LID_ATTEMPT',
          cleanPhone,
          originalPhone: phone,
          stack: new Error().stack?.split('\n').slice(1, 4).join(' | '),
        }));
        this.logger.warn(`[LID_ATTEMPT] Attempting to send to @lid JID ${cleanPhone} — no phone mapping available, trying raw`);
      }

      try {
        const sessionId = await this.getSessionUuid();
        const url = `${apiUrl}/sessions/${sessionId}/messages/send-text`;
        console.log(JSON.stringify({
          event: 'TRACE_OPENWA_HTTP_CALL',
          sessionId,
          url,
          chatId: cleanPhone,
          textLen: message.length,
        }));
        this.logger.log(`[SEND_TRACE] OpenWA send - sessionId="${sessionId}" url="${url}" chatId="${cleanPhone}" textLen=${message.length}`);
        const response = await axios.post(
          url,
          {
            chatId: cleanPhone,
            text: message,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': apiKey,
            },
            timeout: 15000,
          },
        );

        console.log(JSON.stringify({
          event: 'TRACE_OPENWA_RESPONSE',
          status: response.status,
          data: response.data,
        }));
        this.logger.log(`[SEND_TRACE] OpenWA response status=${response.status} data=${JSON.stringify(response.data)}`);
        this.logger.log(`OpenWA message sent to ${cleanPhone}: ${response.data.messageId || 'Success'}`);
        return { success: true, provider: 'openwa' };
      } catch (err) {
        const errorInfo: any = {
          event: 'TRACE_OPENWA_ERROR',
          cleanPhone,
          errorMessage: (err as Error).message,
        };
        if (axios.isAxiosError(err)) {
          errorInfo.isAxiosError = true;
          errorInfo.status = err.response?.status;
          errorInfo.data = err.response?.data;
          errorInfo.code = err.code;
        }
        console.log(JSON.stringify(errorInfo));
        this.logger.error(`[SEND_TRACE] OpenWA send FAILED to ${cleanPhone}: ${(err as Error).message}`);
        this.logger.error(`OpenWA send failed to ${cleanPhone}: ${(err as Error).message}`);
        if (axios.isAxiosError(err) && err.response) {
          this.logger.error(`[SEND_TRACE] OpenWA error response status=${err.response.status} data=${JSON.stringify(err.response.data)}`);
          this.logger.error(`OpenWA error response: ${JSON.stringify(err.response.data)}`);
        }
        return { success: false, provider: 'openwa' };
      }
    }

    this.logger.warn(`Unknown WHATSAPP_PROVIDER: ${provider}`);
    return { success: false, provider };
  }

  async sendOrderConfirmation(order: any): Promise<string | null> {
    const phone = order.customer?.phone;
    if (!phone) {
      this.logger.warn('No customer phone on order, cannot send confirmation');
      return null;
    }

    const message = [
      '☕ تم استلام طلبك بنجاح',
      '',
      `رقم الطلب: ${order.code}`,
      `الإجمالي: ${Number(order.total).toFixed(2)}`,
      '',
      'جاري التحضير 🔥',
    ].join('\n');

    await this.sendMessage(phone, message);
    return message;
  }

  async sendStatusUpdate(order: any, status: string): Promise<string | null> {
    const phone = order.customer?.phone;
    if (!phone) {
      this.logger.warn('No customer phone on order, cannot send status update');
      return null;
    }

    const statusMessages: Record<string, string> = {
      NEW: 'تم استلام طلبك ☕',
      PREPARING: 'طلبك جاري التحضير 🔥',
      READY: 'طلبك جاهز للاستلام ✅',
      DELIVERED: 'تم تسليم الطلب، بالهناء ☕',
    };

    const message = statusMessages[status];
    if (!message) {
      this.logger.warn(`No template for status: ${status}`);
      return null;
    }

    await this.sendMessage(phone, message);
    return message;
  }
}




