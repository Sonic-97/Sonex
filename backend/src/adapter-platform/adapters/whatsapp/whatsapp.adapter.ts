import { Injectable } from '@nestjs/common';
import { ChannelAdapter } from '../../interfaces/channel-adapter.interface';
import { NormalizedMessage, OutgoingMessage, DeliveryStatus, ChannelCapabilities, ChannelType } from '../../interfaces/types';
import { CapabilityProvider } from '../../capability/capability-provider.service';
import { MessageNormalizer } from '../../normalizer/message-normalizer.service';
import { SessionResolver } from '../../session/session-resolver.service';

@Injectable()
export class WhatsAppAdapter implements ChannelAdapter {
  readonly channelType: ChannelType = 'whatsapp';

  constructor(
    private readonly normalizer: MessageNormalizer,
    private readonly sessionResolver: SessionResolver,
    private readonly capabilityProvider: CapabilityProvider,
  ) {}

  normalize(raw: Record<string, unknown>, cafeId: string): NormalizedMessage {
    return this.normalizer.normalize(raw, 'whatsapp', cafeId);
  }

  async send(sessionId: string, message: OutgoingMessage): Promise<DeliveryStatus> {
    const session = this.sessionResolver.get(sessionId);
    if (!session) return 'failed';

    const response = await this.sendWhatsAppMessage(session.externalUserId, message);
    return response;
  }

  async sendBulk(sessionIds: string[], message: OutgoingMessage): Promise<DeliveryStatus[]> {
    return Promise.all(sessionIds.map(id => this.send(id, message)));
  }

  getCapabilities(): ChannelCapabilities {
    return this.capabilityProvider.getCapabilities('whatsapp');
  }

  private async sendWhatsAppMessage(to: string, message: OutgoingMessage): Promise<DeliveryStatus> {
    try {
      const capabilities = this.getCapabilities();
      const formatted = this.stripUnsupported(message, capabilities);
      const payload = this.buildPayload(to, formatted);
      return 'delivered';
    } catch {
      return 'failed';
    }
  }

  private buildPayload(to: string, message: OutgoingMessage): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
    };

    if (message.text) {
      payload.type = 'text';
      payload.text = { body: message.text, preview_url: false };
    } else if (message.buttons && message.buttons.length > 0) {
      payload.type = 'interactive';
      payload.interactive = {
        type: 'button',
        body: { text: message.text || '' },
        action: {
          buttons: message.buttons.map((b, i) => ({
            type: 'reply',
            reply: { id: b.id, title: b.text.substring(0, 20) },
          })),
        },
      };
    } else if (message.image) {
      payload.type = 'image';
      payload.image = { link: message.image.url, caption: message.image.caption };
    } else if (message.document) {
      payload.type = 'document';
      payload.document = { link: message.document.url, caption: message.document.caption, filename: message.document.fileName };
    } else if (message.location) {
      payload.type = 'location';
      payload.location = { latitude: message.location.latitude, longitude: message.location.longitude, name: message.location.label };
    } else if (message.contacts && message.contacts.length > 0) {
      payload.type = 'contacts';
      payload.contacts = message.contacts.map(c => ({
        name: { formatted_name: c.name },
        phones: c.phone ? [{ phone: c.phone, type: 'MOBILE' }] : undefined,
      }));
    }

    return payload;
  }

  private stripUnsupported(message: OutgoingMessage, capabilities: ChannelCapabilities): OutgoingMessage {
    const result: OutgoingMessage = { ...message };
    if (!capabilities.supportedCapabilities.includes('buttons')) delete result.buttons;
    if (!capabilities.supportedCapabilities.includes('quick_replies')) delete result.quickReplies;
    if (!capabilities.supportedCapabilities.includes('images')) delete result.image;
    if (!capabilities.supportedCapabilities.includes('documents')) delete result.document;
    if (!capabilities.supportedCapabilities.includes('location')) delete result.location;
    if (!capabilities.supportedCapabilities.includes('contacts')) delete result.contacts;

    if (capabilities.maxMessageLength && result.text && result.text.length > capabilities.maxMessageLength) {
      result.text = result.text.substring(0, capabilities.maxMessageLength - 3) + '...';
    }

    return result;
  }
}
