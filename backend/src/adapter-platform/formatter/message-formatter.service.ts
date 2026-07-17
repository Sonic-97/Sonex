import { Injectable } from '@nestjs/common';
import { OutgoingMessage, ChannelCapabilities, ChannelType, Capability } from '../interfaces/types';

@Injectable()
export class MessageFormatter {
  format(message: OutgoingMessage, capabilities: ChannelCapabilities): OutgoingMessage {
    return this.stripUnsupported(message, capabilities);
  }

  formatForChannel(message: OutgoingMessage, channelType: ChannelType): OutgoingMessage {
    switch (channelType) {
      case 'whatsapp':
        return this.formatWhatsApp(message);
      case 'web_chat':
        return this.formatWebChat(message);
      case 'mobile':
        return this.formatMobile(message);
      default:
        return message;
    }
  }

  private formatWhatsApp(message: OutgoingMessage): OutgoingMessage {
    const formatted: OutgoingMessage = { ...message };
    if (formatted.text) {
      formatted.text = formatted.text
        .replace(/\*([^*]+)\*/g, '*$1*')
        .replace(/_([^_]+)_/g, '_$1_');
    }
    return formatted;
  }

  private formatWebChat(message: OutgoingMessage): OutgoingMessage {
    const formatted: OutgoingMessage = { ...message };
    if (formatted.text) {
      formatted.text = formatted.text.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
    }
    return formatted;
  }

  private formatMobile(message: OutgoingMessage): OutgoingMessage {
    return { ...message };
  }

  private stripUnsupported(message: OutgoingMessage, capabilities: ChannelCapabilities): OutgoingMessage {
    const result: OutgoingMessage = { ...message };
    const supported = new Set(capabilities.supportedCapabilities);

    if (!supported.has('buttons' as Capability)) {
      delete result.buttons;
    }
    if (!supported.has('quick_replies' as Capability)) {
      delete result.quickReplies;
    }
    if (!supported.has('images' as Capability)) {
      delete result.image;
    }
    if (!supported.has('documents' as Capability)) {
      delete result.document;
    }
    if (!supported.has('location' as Capability)) {
      delete result.location;
    }
    if (!supported.has('contacts' as Capability)) {
      delete result.contacts;
    }

    if (capabilities.maxMessageLength && result.text && result.text.length > capabilities.maxMessageLength) {
      result.text = result.text.substring(0, capabilities.maxMessageLength - 3) + '...';
    }

    return result;
  }
}
