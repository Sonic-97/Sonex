import { Test, TestingModule } from '@nestjs/testing';
import { AdapterPlatformService } from './adapter-platform.service';
import { MessageNormalizer } from './normalizer/message-normalizer.service';
import { MessageFormatter } from './formatter/message-formatter.service';
import { SessionResolver } from './session/session-resolver.service';
import { AttachmentResolver } from './attachment/attachment-resolver.service';
import { CapabilityProvider } from './capability/capability-provider.service';
import { WhatsAppAdapter } from './adapters/whatsapp/whatsapp.adapter';
import { WebChatAdapter } from './adapters/web-chat/web-chat.adapter';
import { MobileAdapter } from './adapters/mobile/mobile.adapter';
import { ADAPTER_EVENTS } from './interfaces/types';

describe('AdapterPlatformService', () => {
  let service: AdapterPlatformService;
  let whatsapp: WhatsAppAdapter;
  let webChat: WebChatAdapter;
  let mobile: MobileAdapter;
  let sessionResolver: SessionResolver;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdapterPlatformService,
        MessageNormalizer,
        MessageFormatter,
        SessionResolver,
        AttachmentResolver,
        CapabilityProvider,
        WhatsAppAdapter,
        WebChatAdapter,
        MobileAdapter,
      ],
    }).compile();

    service = module.get<AdapterPlatformService>(AdapterPlatformService);
    whatsapp = module.get<WhatsAppAdapter>(WhatsAppAdapter);
    webChat = module.get<WebChatAdapter>(WebChatAdapter);
    mobile = module.get<MobileAdapter>(MobileAdapter);
    sessionResolver = module.get<SessionResolver>(SessionResolver);

    service.registerAdapter(whatsapp);
    service.registerAdapter(webChat);
    service.registerAdapter(mobile);
  });

  describe('adapter registration', () => {
    it('registers adapters', () => {
      const adapters = service.getRegisteredAdapters();
      expect(adapters).toHaveLength(3);
    });

    it('gets adapter by channel type', () => {
      const adapter = service.getAdapter('whatsapp');
      expect(adapter).toBeDefined();
      expect(adapter!.channelType).toBe('whatsapp');
    });

    it('returns undefined for unregistered channel', () => {
      const adapter = service.getAdapter('instagram' as any);
      expect(adapter).toBeUndefined();
    });
  });

  describe('receiveMessage', () => {
    it('receives and normalizes WhatsApp message', async () => {
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
      const response = await service.receiveMessage(raw as any, 'whatsapp', 'cafe-1');
      expect(response.text).toContain('Received your message via whatsapp');
    });

    it('receives web chat message', async () => {
      const raw = { messageId: 'wc1', sessionId: 'sess1', userId: 'u1', text: 'Hi' };
      const response = await service.receiveMessage(raw as any, 'web_chat', 'cafe-1');
      expect(response.text).toContain('web_chat');
    });

    it('receives mobile message', async () => {
      const raw = { messageId: 'mob1', sessionId: 'ms1', userId: 'u1', text: 'Hey' };
      const response = await service.receiveMessage(raw as any, 'mobile', 'cafe-1');
      expect(response.text).toContain('mobile');
    });

    it('creates session on receive', async () => {
      const raw = { messageId: 'wc2', sessionId: 'sess2', userId: 'u2', text: 'Hi' };
      await service.receiveMessage(raw as any, 'web_chat', 'cafe-1');
      const session = sessionResolver.get('web_chat-sess2-cafe-1');
      expect(session).toBeDefined();
      expect(session!.cafeId).toBe('cafe-1');
    });
  });

  describe('sendMessage', () => {
    it('sends message through adapter', async () => {
      sessionResolver.findOrCreate({ channelType: 'web_chat', externalUserId: 'u1', cafeId: 'cafe-1' });
      const status = await service.sendMessage('web_chat-u1-cafe-1', 'web_chat', { text: 'Hello' });
      expect(status).toBe('delivered');
    });

    it('returns failed for unregistered adapter', async () => {
      const status = await service.sendMessage('sess1', 'instagram' as any, { text: 'Hi' });
      expect(status).toBe('failed');
    });
  });

  describe('sendMessageToChannel', () => {
    it('normalizes and sends', async () => {
      const raw = { messageId: 'm1', sessionId: 's1', userId: 'u1', text: 'Hi' };
      const status = await service.sendMessageToChannel(raw as any, 'web_chat', 'cafe-1', { text: 'Response' });
      expect(status).toBe('delivered');
    });
  });

  describe('handleAttachment', () => {
    it('throws when no session found', async () => {
      await expect(service.handleAttachment('att1', 'whatsapp')).rejects.toThrow('No session found');
    });

    it('throws when no session found for channel', async () => {
      await expect(service.handleAttachment('att1', 'voice' as any)).rejects.toThrow('No session found for channel voice');
    });
  });

  describe('events', () => {
    it('emits message received event', async () => {
      const events: any[] = [];
      service.onEvent(ADAPTER_EVENTS.MESSAGE_RECEIVED, (p) => events.push(p));

      const raw = { messageId: 'wc3', sessionId: 'sess3', userId: 'u3', text: 'Hi' };
      await service.receiveMessage(raw as any, 'web_chat', 'cafe-1');

      expect(events).toHaveLength(1);
      expect(events[0].channelType).toBe('web_chat');
      expect(events[0].cafeId).toBe('cafe-1');
    });

    it('emits message sent event on successful send', async () => {
      const events: any[] = [];
      service.onEvent(ADAPTER_EVENTS.MESSAGE_SENT, (p) => events.push(p));

      sessionResolver.findOrCreate({ channelType: 'web_chat', externalUserId: 'u1', cafeId: 'cafe-1' });
      await service.sendMessage('web_chat-u1-cafe-1', 'web_chat', { text: 'Hello' });

      expect(events).toHaveLength(1);
      expect(events[0].deliveryStatus).toBe('delivered');
    });

    it('emits delivery failed event on failed send', async () => {
      const events: any[] = [];
      service.onEvent(ADAPTER_EVENTS.DELIVERY_FAILED, (p) => events.push(p));

      await service.sendMessage('unknown-session', 'instagram' as any, { text: 'Hello' });

      expect(events).toHaveLength(1);
    });

    it('emits delivery confirmed event', async () => {
      const events: any[] = [];
      service.onEvent(ADAPTER_EVENTS.DELIVERY_CONFIRMED, (p) => events.push(p));

      await service.confirmDelivery('web_chat', 'sess1');

      expect(events).toHaveLength(1);
      expect(events[0].channelType).toBe('web_chat');
    });
  });

  describe('unsupported capability fallback', () => {
    it('strips unsupported capabilities when sending', async () => {
      sessionResolver.findOrCreate({ channelType: 'web_chat', externalUserId: 'u1', cafeId: 'cafe-1' });
      const status = await service.sendMessage('web_chat-u1-cafe-1', 'web_chat', {
        text: 'Hello',
        image: { url: 'http://example.com/img.jpg', mimeType: 'image/jpeg' },
        document: { url: 'http://example.com/doc.pdf', mimeType: 'application/pdf' },
      });
      expect(status).toBe('delivered');
    });
  });

  describe('session mapping', () => {
    it('maps session across channels', async () => {
      const raw1 = { messageId: 'm1', sessionId: 's1', userId: 'u1', text: 'Hi' };
      const raw2 = { entry: [{ changes: [{ value: { messages: [{ id: 'm2', from: '5551234', type: 'text', text: { body: 'Hello' }, timestamp: '1700000000' }], contacts: [] } }] }] };

      await service.receiveMessage(raw1 as any, 'web_chat', 'cafe-1');
      await service.receiveMessage(raw2 as any, 'whatsapp', 'cafe-1');

      const webSession = sessionResolver.get('web_chat-s1-cafe-1');
      const waSession = sessionResolver.get('whatsapp-wa-5551234-cafe-1-cafe-1');
      expect(webSession).toBeDefined();
      expect(waSession).toBeDefined();
      expect(webSession!.cafeId).toBe('cafe-1');
      expect(waSession!.cafeId).toBe('cafe-1');
    });
  });
});
