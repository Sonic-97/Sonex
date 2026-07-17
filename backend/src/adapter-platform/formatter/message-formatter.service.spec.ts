import { Test, TestingModule } from '@nestjs/testing';
import { MessageFormatter } from './message-formatter.service';
import { ChannelCapabilities, OutgoingMessage, ChannelType } from '../interfaces/types';

describe('MessageFormatter', () => {
  let service: MessageFormatter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MessageFormatter],
    }).compile();
    service = module.get<MessageFormatter>(MessageFormatter);
  });

  describe('format', () => {
    it('strips unsupported capabilities', () => {
      const message: OutgoingMessage = {
        text: 'Hello',
        buttons: [{ id: '1', text: 'Yes', type: 'callback' }],
        image: { url: 'http://example.com/img.jpg', mimeType: 'image/jpeg' },
        location: { latitude: 24.7, longitude: 46.7 },
        contacts: [{ name: 'John' }],
      };
      const capabilities: ChannelCapabilities = {
        channelType: 'web_chat',
        supportedCapabilities: ['text', 'buttons'],
      };
      const result = service.format(message, capabilities);
      expect(result.text).toBe('Hello');
      expect(result.buttons).toBeDefined();
      expect(result.image).toBeUndefined();
      expect(result.location).toBeUndefined();
      expect(result.contacts).toBeUndefined();
    });

    it('strips buttons when unsupported but keeps quickReplies', () => {
      const message: OutgoingMessage = {
        text: 'Hello',
        buttons: [{ id: '1', text: 'Yes', type: 'callback' }],
        quickReplies: [{ id: 'qr1', text: 'Option 1' }],
      };
      const capabilities: ChannelCapabilities = {
        channelType: 'web_chat',
        supportedCapabilities: ['text', 'quick_replies'],
      };
      const result = service.format(message, capabilities);
      expect(result.buttons).toBeUndefined();
      expect(result.quickReplies).toBeDefined();
    });

    it('truncates long messages', () => {
      const message: OutgoingMessage = { text: 'A'.repeat(500) };
      const capabilities: ChannelCapabilities = {
        channelType: 'whatsapp',
        supportedCapabilities: ['text'],
        maxMessageLength: 100,
      };
      const result = service.format(message, capabilities);
      expect(result.text!.length).toBeLessThanOrEqual(100);
      expect(result.text).toMatch(/\.\.\.$/);
    });

    it('passes through when all capabilities supported', () => {
      const message: OutgoingMessage = {
        text: 'Hello',
        buttons: [{ id: '1', text: 'Yes', type: 'callback' }],
        quickReplies: [{ id: 'qr1', text: 'Opt' }],
        image: { url: 'http://example.com/img.jpg', mimeType: 'image/jpeg' },
        document: { url: 'http://example.com/doc.pdf', mimeType: 'application/pdf' },
      };
      const capabilities: ChannelCapabilities = {
        channelType: 'whatsapp',
        supportedCapabilities: ['text', 'buttons', 'quick_replies', 'images', 'documents'],
      };
      const result = service.format(message, capabilities);
      expect(result.text).toBe('Hello');
      expect(result.buttons).toHaveLength(1);
      expect(result.quickReplies).toHaveLength(1);
      expect(result.image).toBeDefined();
      expect(result.document).toBeDefined();
    });
  });

  describe('formatForChannel', () => {
    it('preserves WhatsApp markdown syntax', () => {
      const message: OutgoingMessage = { text: '*Bold* and _italic_' };
      const result = service.formatForChannel(message, 'whatsapp');
      expect(result.text).toContain('*Bold*');
      expect(result.text).toContain('_italic_');
    });

    it('converts markdown to HTML for web chat', () => {
      const message: OutgoingMessage = { text: '*Bold* and _italic_' };
      const result = service.formatForChannel(message, 'web_chat');
      expect(result.text).toContain('<strong>Bold</strong>');
    });

    it('passes through for mobile', () => {
      const message: OutgoingMessage = { text: 'Plain text' };
      const result = service.formatForChannel(message, 'mobile');
      expect(result.text).toBe('Plain text');
    });

    it('returns message as-is for unknown channel', () => {
      const message: OutgoingMessage = { text: 'Test' };
      const result = service.formatForChannel(message, 'instagram' as ChannelType);
      expect(result.text).toBe('Test');
    });
  });
});
