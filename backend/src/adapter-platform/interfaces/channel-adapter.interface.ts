import { NormalizedMessage, OutgoingMessage, DeliveryStatus, ChannelCapabilities, ChannelType } from './types';

export interface ChannelAdapter {
  readonly channelType: ChannelType;
  send(sessionId: string, message: OutgoingMessage): Promise<DeliveryStatus>;
  sendBulk(sessionIds: string[], message: OutgoingMessage): Promise<DeliveryStatus[]>;
  getCapabilities(): ChannelCapabilities;
}
