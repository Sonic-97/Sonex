import { Injectable } from '@nestjs/common';
import { ChannelType, NormalizedMessage, Attachment } from '../interfaces/types';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class MessageNormalizer {
  normalize(raw: Record<string, unknown>, channelType: ChannelType, cafeId: string): NormalizedMessage {
    switch (channelType) {
      case 'whatsapp':
        return this.normalizeWhatsApp(raw, cafeId);
      case 'web_chat':
        return this.normalizeWebChat(raw, cafeId);
      case 'mobile':
        return this.normalizeMobile(raw, cafeId);
      default:
        return this.normalizeGeneric(raw, channelType, cafeId);
    }
  }

  private normalizeWhatsApp(raw: Record<string, unknown>, cafeId: string): NormalizedMessage {
    const entry = (raw.entry as Record<string, unknown>[])?.[0];
    const change = (entry?.changes as Record<string, unknown>[])?.[0];
    const value = change?.value as Record<string, unknown> | undefined;
    const message = (value?.messages as Record<string, unknown>[])?.[0];
    const contact = (value?.contacts as Record<string, unknown>[])?.[0];
    const profile = contact?.profile as Record<string, unknown> | undefined;
    const from = message?.from as string || 'unknown';
    const msgType = message?.type as string || 'text';

    return {
      channelType: 'whatsapp',
      externalId: message?.id as string || uuidv4(),
      sessionId: `wa-${from}-${cafeId}`,
      customerId: profile?.name as string | undefined,
      cafeId,
      text: msgType === 'text' ? (message?.text as Record<string, string>)?.body || '' : undefined,
      attachments: this.extractWhatsAppAttachments(message, msgType),
      location: msgType === 'location' ? {
        latitude: (message?.location as Record<string, number>)?.latitude || 0,
        longitude: (message?.location as Record<string, number>)?.longitude || 0,
      } : undefined,
      buttonResponse: msgType === 'button' ? {
        buttonId: (message?.button as Record<string, string>)?.payload || '',
        buttonText: (message?.button as Record<string, string>)?.text || '',
      } : msgType === 'interactive' ? {
        buttonId: ((message?.interactive as Record<string, unknown>)?.button_reply as Record<string, string>)?.id || '',
        buttonText: ((message?.interactive as Record<string, unknown>)?.button_reply as Record<string, string>)?.title || '',
      } : undefined,
      timestamp: new Date((message?.timestamp as string) ? parseInt(message?.timestamp as string) * 1000 : Date.now()),
      raw,
    };
  }

  private extractWhatsAppAttachments(message: Record<string, unknown> | undefined, msgType: string): Attachment[] | undefined {
    const mediaTypes = ['image', 'document', 'voice', 'video'];
    if (!message || !mediaTypes.includes(msgType)) return undefined;
    const media = message[msgType] as Record<string, unknown> | undefined;
    if (!media) return undefined;
    return [{
      id: media?.id as string || uuidv4(),
      type: msgType as 'image' | 'document' | 'voice' | 'video',
      url: media?.link as string || undefined,
      mimeType: media?.mime_type as string || undefined,
      fileName: media?.filename as string || undefined,
    }];
  }

  private normalizeWebChat(raw: Record<string, unknown>, cafeId: string): NormalizedMessage {
    return {
      channelType: 'web_chat',
      externalId: raw.messageId as string || uuidv4(),
      sessionId: raw.sessionId as string || `wc-${raw.userId || 'anon'}-${cafeId}`,
      customerId: raw.userId as string | undefined,
      cafeId,
      text: raw.text as string || undefined,
      attachments: undefined,
      timestamp: raw.timestamp ? new Date(raw.timestamp as string) : new Date(),
      raw,
    };
  }

  private normalizeMobile(raw: Record<string, unknown>, cafeId: string): NormalizedMessage {
    return {
      channelType: 'mobile',
      externalId: raw.messageId as string || uuidv4(),
      sessionId: raw.sessionId as string || `mob-${raw.userId || 'anon'}-${cafeId}`,
      customerId: raw.userId as string | undefined,
      cafeId,
      text: raw.text as string || undefined,
      attachments: undefined,
      location: raw.latitude && raw.longitude ? {
        latitude: raw.latitude as number,
        longitude: raw.longitude as number,
        label: raw.locationLabel as string | undefined,
      } : undefined,
      timestamp: raw.timestamp ? new Date(raw.timestamp as string) : new Date(),
      raw,
    };
  }

  private normalizeGeneric(raw: Record<string, unknown>, channelType: ChannelType, cafeId: string): NormalizedMessage {
    return {
      channelType,
      externalId: raw.messageId as string || uuidv4(),
      sessionId: raw.sessionId as string || `${channelType}-${raw.userId || 'anon'}-${cafeId}`,
      cafeId,
      text: raw.text as string || undefined,
      timestamp: new Date(),
      raw,
    };
  }
}
