import { Injectable } from '@nestjs/common';
import { ChannelCapabilities, ChannelType, Capability } from '../interfaces/types';

@Injectable()
export class CapabilityProvider {
  private channelCapabilities = new Map<ChannelType, ChannelCapabilities>([
    ['whatsapp', {
      channelType: 'whatsapp',
      supportedCapabilities: ['text', 'buttons', 'quick_replies', 'images', 'documents', 'voice', 'location', 'contacts'],
      maxMessageLength: 4096,
      supportsMarkdown: true,
      supportsHtml: false,
      supportsAttachments: true,
      maxAttachmentSize: 16 * 1024 * 1024,
    }],
    ['web_chat', {
      channelType: 'web_chat',
      supportedCapabilities: ['text', 'buttons', 'quick_replies', 'images', 'documents', 'location'],
      maxMessageLength: 10000,
      supportsMarkdown: false,
      supportsHtml: true,
      supportsAttachments: true,
      maxAttachmentSize: 10 * 1024 * 1024,
    }],
    ['mobile', {
      channelType: 'mobile',
      supportedCapabilities: ['text', 'buttons', 'quick_replies', 'images', 'documents', 'location', 'contacts'],
      maxMessageLength: 5000,
      supportsMarkdown: false,
      supportsHtml: false,
      supportsAttachments: true,
      maxAttachmentSize: 20 * 1024 * 1024,
    }],
    ['instagram', {
      channelType: 'instagram',
      supportedCapabilities: ['text', 'images', 'voice', 'location'],
      maxMessageLength: 1000,
      supportsMarkdown: false,
      supportsHtml: false,
      supportsAttachments: true,
      maxAttachmentSize: 8 * 1024 * 1024,
    }],
    ['facebook_messenger', {
      channelType: 'facebook_messenger',
      supportedCapabilities: ['text', 'buttons', 'quick_replies', 'images', 'documents', 'location', 'contacts'],
      maxMessageLength: 2000,
      supportsMarkdown: false,
      supportsHtml: false,
      supportsAttachments: true,
      maxAttachmentSize: 25 * 1024 * 1024,
    }],
    ['voice', {
      channelType: 'voice',
      supportedCapabilities: ['text', 'voice'],
      maxMessageLength: 500,
      supportsMarkdown: false,
      supportsHtml: false,
      supportsAttachments: false,
    }],
  ]);

  getCapabilities(channelType: ChannelType): ChannelCapabilities {
    return this.channelCapabilities.get(channelType) || {
      channelType,
      supportedCapabilities: ['text'],
      supportsAttachments: false,
    };
  }

  supports(channelType: ChannelType, capability: Capability): boolean {
    const caps = this.getCapabilities(channelType);
    return caps.supportedCapabilities.includes(capability);
  }

  registerChannel(channelType: ChannelType, capabilities: ChannelCapabilities): void {
    this.channelCapabilities.set(channelType, capabilities);
  }
}
