export type ChannelType = 'whatsapp' | 'web_chat' | 'mobile' | 'instagram' | 'facebook_messenger' | 'voice';

export type Capability = 'text' | 'buttons' | 'quick_replies' | 'images' | 'documents' | 'voice' | 'location' | 'contacts';

export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';

export interface NormalizedMessage {
  channelType: ChannelType;
  externalId: string;
  sessionId: string;
  customerId?: string;
  cafeId: string;
  text?: string;
  attachments?: Attachment[];
  location?: LocationData;
  buttonResponse?: ButtonResponse;
  timestamp: Date;
  raw?: unknown;
}

export interface Attachment {
  id: string;
  type: 'image' | 'document' | 'voice' | 'video';
  url?: string;
  mimeType?: string;
  fileName?: string;
  data?: Buffer;
}

export interface LocationData {
  latitude: number;
  longitude: number;
  label?: string;
}

export interface ButtonResponse {
  buttonId: string;
  buttonText: string;
}

export interface OutgoingMessage {
  text?: string;
  buttons?: Button[];
  quickReplies?: QuickReply[];
  image?: MediaAttachment;
  document?: MediaAttachment;
  location?: LocationData;
  contacts?: ContactData[];
  metadata?: Record<string, unknown>;
}

export interface Button {
  id: string;
  text: string;
  type: 'callback' | 'url' | 'phone';
  url?: string;
}

export interface QuickReply {
  id: string;
  text: string;
}

export interface MediaAttachment {
  url?: string;
  data?: Buffer;
  mimeType: string;
  fileName?: string;
  caption?: string;
}

export interface ContactData {
  name: string;
  phone?: string;
  email?: string;
}

export interface ChannelCapabilities {
  channelType: ChannelType;
  supportedCapabilities: Capability[];
  maxMessageLength?: number;
  supportsMarkdown?: boolean;
  supportsHtml?: boolean;
  supportsAttachments?: boolean;
  maxAttachmentSize?: number;
}

export interface SessionContext {
  sessionId: string;
  channelType: ChannelType;
  externalUserId: string;
  cafeId: string;
  customerId?: string;
  branchId?: string;
  currentStep?: string;
  collectedInformation?: Record<string, unknown>;
  missingInformation?: string[];
  currentIntent?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export const ADAPTER_EVENTS = {
  MESSAGE_RECEIVED: 'adapter.message.received',
  MESSAGE_SENT: 'adapter.message.sent',
  DELIVERY_CONFIRMED: 'adapter.delivery.confirmed',
  DELIVERY_FAILED: 'adapter.delivery.failed',
} as const;
