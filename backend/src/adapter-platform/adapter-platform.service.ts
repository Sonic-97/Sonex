import { Injectable } from '@nestjs/common';
import { ChannelAdapter } from './interfaces/channel-adapter.interface';
import { NormalizedMessage, OutgoingMessage, DeliveryStatus, ChannelType, ADAPTER_EVENTS } from './interfaces/types';
import { MessageNormalizer } from './normalizer/message-normalizer.service';
import { MessageFormatter } from './formatter/message-formatter.service';
import { SessionResolver } from './session/session-resolver.service';
import { AttachmentResolver } from './attachment/attachment-resolver.service';
import { CapabilityProvider } from './capability/capability-provider.service';

@Injectable()
export class AdapterPlatformService {
  private adapters = new Map<ChannelType, ChannelAdapter>();
  private eventListeners = new Map<string, Array<(payload: unknown) => void>>();

  constructor(
    private readonly normalizer: MessageNormalizer,
    private readonly formatter: MessageFormatter,
    private readonly sessionResolver: SessionResolver,
    private readonly attachmentResolver: AttachmentResolver,
    private readonly capabilityProvider: CapabilityProvider,
  ) {}

  registerAdapter(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.channelType, adapter);
  }

  getAdapter(channelType: ChannelType): ChannelAdapter | undefined {
    return this.adapters.get(channelType);
  }

  getRegisteredAdapters(): ChannelAdapter[] {
    return Array.from(this.adapters.values());
  }

  onEvent(event: string, listener: (payload: unknown) => void): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.push(listener);
    this.eventListeners.set(event, listeners);
  }

  private emitEvent(event: string, payload: unknown): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(fn => {
        try { fn(payload); } catch { }
      });
    }
  }

  async receiveMessage(raw: Record<string, unknown>, channelType: ChannelType, cafeId: string): Promise<OutgoingMessage> {
    const normalized = this.normalizer.normalize(raw, channelType, cafeId);

    this.sessionResolver.findOrCreate({
      channelType: normalized.channelType,
      externalUserId: normalized.sessionId,
      cafeId: normalized.cafeId,
      customerId: normalized.customerId,
    });

    this.emitEvent(ADAPTER_EVENTS.MESSAGE_RECEIVED, {
      channelType: normalized.channelType,
      sessionId: normalized.sessionId,
      externalId: normalized.externalId,
      cafeId: normalized.cafeId,
      messageType: normalized.attachments ? 'attachment' : (normalized.text ? 'text' : 'unknown'),
      timestamp: new Date().toISOString(),
    });

    return {
      text: `Received your message via ${channelType}. This channel is active.`,
    };
  }

  async sendMessage(
    sessionId: string,
    channelType: ChannelType,
    message: OutgoingMessage,
  ): Promise<DeliveryStatus> {
    const adapter = this.adapters.get(channelType);
    if (!adapter) {
      this.emitEvent(ADAPTER_EVENTS.DELIVERY_FAILED, {
        channelType,
        sessionId,
        error: 'No adapter registered',
        timestamp: new Date().toISOString(),
      });
      return 'failed';
    }

    const capabilities = this.capabilityProvider.getCapabilities(channelType);
    const formatted = this.formatter.formatForChannel(message, channelType);
    const adapted = this.formatter.format(formatted, capabilities);

    const status = await adapter.send(sessionId, adapted);

    if (status === 'failed') {
      this.emitEvent(ADAPTER_EVENTS.DELIVERY_FAILED, {
        channelType,
        sessionId,
        error: 'Send failed',
        timestamp: new Date().toISOString(),
      });
    } else {
      this.emitEvent(ADAPTER_EVENTS.MESSAGE_SENT, {
        channelType,
        sessionId,
        messageType: adapted.text ? 'text' : 'interactive',
        deliveryStatus: status,
        timestamp: new Date().toISOString(),
      });
    }

    return status;
  }

  async sendMessageToChannel(
    raw: Record<string, unknown>,
    channelType: ChannelType,
    cafeId: string,
    outgoing: OutgoingMessage,
  ): Promise<DeliveryStatus> {
    const normalized = this.normalizer.normalize(raw, channelType, cafeId);
    return this.sendMessage(normalized.sessionId, channelType, outgoing);
  }

  async handleAttachment(
    attachmentId: string,
    channelType: ChannelType,
  ): Promise<{ buffer: Buffer; mimeType: string; text?: string }> {
    const session = this.sessionResolver.getAll().find(s => s.channelType === channelType);
    if (!session) throw new Error(`No session found for channel ${channelType}`);

    const adapter = this.adapters.get(channelType);
    if (!adapter) throw new Error(`No adapter registered for ${channelType}`);

    const capabilities = adapter.getCapabilities();
    if (!capabilities.supportsAttachments) {
      throw new Error(`Channel ${channelType} does not support attachments`);
    }

    const attachment = { id: attachmentId, type: 'image' as const };
    return this.attachmentResolver.processAttachment(attachment, channelType);
  }

  async confirmDelivery(channelType: ChannelType, sessionId: string): Promise<void> {
    this.emitEvent(ADAPTER_EVENTS.DELIVERY_CONFIRMED, {
      channelType,
      sessionId,
      timestamp: new Date().toISOString(),
    });
  }
}
