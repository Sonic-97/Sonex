import { Injectable } from '@nestjs/common';
import { ChannelAdapter } from '../../interfaces/channel-adapter.interface';
import { NormalizedMessage, OutgoingMessage, DeliveryStatus, ChannelCapabilities, ChannelType } from '../../interfaces/types';
import { CapabilityProvider } from '../../capability/capability-provider.service';
import { MessageNormalizer } from '../../normalizer/message-normalizer.service';

@Injectable()
export class MobileAdapter implements ChannelAdapter {
  readonly channelType: ChannelType = 'mobile';

  constructor(
    private readonly normalizer: MessageNormalizer,
    private readonly capabilityProvider: CapabilityProvider,
  ) {}

  normalize(raw: Record<string, unknown>, cafeId: string): NormalizedMessage {
    return this.normalizer.normalize(raw, 'mobile', cafeId);
  }

  async send(sessionId: string, message: OutgoingMessage): Promise<DeliveryStatus> {
    try {
      return 'sent';
    } catch {
      return 'failed';
    }
  }

  async sendBulk(sessionIds: string[], message: OutgoingMessage): Promise<DeliveryStatus[]> {
    return Promise.all(sessionIds.map(id => this.send(id, message)));
  }

  getCapabilities(): ChannelCapabilities {
    return this.capabilityProvider.getCapabilities('mobile');
  }
}
