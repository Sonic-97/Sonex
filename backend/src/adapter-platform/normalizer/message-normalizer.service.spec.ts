import { Test, TestingModule } from '@nestjs/testing';
import { MessageNormalizer } from './message-normalizer.service';

describe('MessageNormalizer', () => {
  let service: MessageNormalizer;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MessageNormalizer],
    }).compile();
    service = module.get<MessageNormalizer>(MessageNormalizer);
  });

  describe('WhatsApp normalization', () => {
    it('normalizes text message', () => {
      const raw = {
        entry: [{
          changes: [{
            value: {
              messages: [{ id: 'msg1', from: '1234', type: 'text', text: { body: 'Hello' }, timestamp: '1700000000' }],
              contacts: [{ profile: { name: 'John' } }],
            },
          }],
        }],
      };
      const result = service.normalize(raw as any, 'whatsapp', 'cafe-1');
      expect(result.channelType).toBe('whatsapp');
      expect(result.text).toBe('Hello');
      expect(result.sessionId).toBe('wa-1234-cafe-1');
      expect(result.externalId).toBe('msg1');
    });

    it('normalizes location message', () => {
      const raw = {
        entry: [{
          changes: [{
            value: {
              messages: [{ id: 'msg2', from: '1234', type: 'location', location: { latitude: 24.7, longitude: 46.7 }, timestamp: '1700000000' }],
              contacts: [],
            },
          }],
        }],
      };
      const result = service.normalize(raw as any, 'whatsapp', 'cafe-1');
      expect(result.location).toBeDefined();
      expect(result.location!.latitude).toBe(24.7);
      expect(result.location!.longitude).toBe(46.7);
    });

    it('normalizes interactive button response', () => {
      const raw = {
        entry: [{
          changes: [{
            value: {
              messages: [{ id: 'msg3', from: '1234', type: 'interactive', interactive: { button_reply: { id: 'btn1', title: 'Yes' } }, timestamp: '1700000000' }],
              contacts: [],
            },
          }],
        }],
      };
      const result = service.normalize(raw as any, 'whatsapp', 'cafe-1');
      expect(result.buttonResponse).toBeDefined();
      expect(result.buttonResponse!.buttonId).toBe('btn1');
      expect(result.buttonResponse!.buttonText).toBe('Yes');
    });

    it('normalizes image attachment', () => {
      const raw = {
        entry: [{
          changes: [{
            value: {
              messages: [{ id: 'msg4', from: '1234', type: 'image', image: { id: 'img1', mime_type: 'image/jpeg' }, timestamp: '1700000000' }],
              contacts: [],
            },
          }],
        }],
      };
      const result = service.normalize(raw as any, 'whatsapp', 'cafe-1');
      expect(result.attachments).toBeDefined();
      expect(result.attachments!.length).toBe(1);
      expect(result.attachments![0].type).toBe('image');
      expect(result.attachments![0].id).toBe('img1');
    });

    it('normalizes message without entries gracefully', () => {
      const result = service.normalize({} as any, 'whatsapp', 'cafe-1');
      expect(result.channelType).toBe('whatsapp');
      expect(result.text).toBe('');
      expect(result.sessionId).toBe('wa-unknown-cafe-1');
    });
  });

  describe('Web Chat normalization', () => {
    it('normalizes web chat message', () => {
      const raw = { messageId: 'wc1', sessionId: 'sess1', userId: 'user1', text: 'Hello from web', timestamp: '2024-01-01T00:00:00Z' };
      const result = service.normalize(raw as any, 'web_chat', 'cafe-1');
      expect(result.channelType).toBe('web_chat');
      expect(result.text).toBe('Hello from web');
      expect(result.sessionId).toBe('sess1');
      expect(result.customerId).toBe('user1');
    });

    it('generates session id when missing', () => {
      const raw = { messageId: 'wc2', text: 'Hi', userId: 'anon' };
      const result = service.normalize(raw as any, 'web_chat', 'cafe-1');
      expect(result.sessionId).toBe('wc-anon-cafe-1');
    });
  });

  describe('Mobile normalization', () => {
    it('normalizes mobile text message', () => {
      const raw = { messageId: 'mob1', sessionId: 'ms1', userId: 'u1', text: 'Hello from app' };
      const result = service.normalize(raw as any, 'mobile', 'cafe-1');
      expect(result.channelType).toBe('mobile');
      expect(result.text).toBe('Hello from app');
      expect(result.sessionId).toBe('ms1');
    });

    it('normalizes mobile message with location', () => {
      const raw = { messageId: 'mob2', userId: 'u1', latitude: 24.7, longitude: 46.7, locationLabel: 'Riyadh' };
      const result = service.normalize(raw as any, 'mobile', 'cafe-1');
      expect(result.location).toBeDefined();
      expect(result.location!.latitude).toBe(24.7);
      expect(result.location!.longitude).toBe(46.7);
      expect(result.location!.label).toBe('Riyadh');
    });

    it('generates session id when missing', () => {
      const raw = { messageId: 'mob3', text: 'Hi' };
      const result = service.normalize(raw as any, 'mobile', 'cafe-1');
      expect(result.sessionId).toBe('mob-anon-cafe-1');
    });
  });

  describe('generic normalization', () => {
    it('normalizes unknown channel type', () => {
      const raw = { messageId: 'gen1', userId: 'u1', text: 'Hello' };
      const result = service.normalize(raw as any, 'instagram' as any, 'cafe-1');
      expect(result.channelType).toBe('instagram');
      expect(result.text).toBe('Hello');
      expect(result.sessionId).toBe('instagram-u1-cafe-1');
    });
  });
});
