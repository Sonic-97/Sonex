import { Test, TestingModule } from '@nestjs/testing';
import { WebChatAdapter } from './web-chat.adapter';
import { MessageNormalizer } from '../../normalizer/message-normalizer.service';
import { CapabilityProvider } from '../../capability/capability-provider.service';

describe('WebChatAdapter', () => {
  let adapter: WebChatAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebChatAdapter,
        MessageNormalizer,
        CapabilityProvider,
      ],
    }).compile();
    adapter = module.get<WebChatAdapter>(WebChatAdapter);
  });

  describe('normalize', () => {
    it('normalizes web chat message', () => {
      const raw = { messageId: 'wc-1', sessionId: 'sess-1', userId: 'user-1', text: 'Hello from web' };
      const result = adapter.normalize(raw as any, 'cafe-1');
      expect(result.channelType).toBe('web_chat');
      expect(result.text).toBe('Hello from web');
      expect(result.sessionId).toBe('sess-1');
    });
  });

  describe('send', () => {
    it('sends message', async () => {
      const status = await adapter.send('sess-1', { text: 'Hello' });
      expect(status).toBe('delivered');
    });
  });

  describe('getCapabilities', () => {
    it('returns web chat capabilities', () => {
      const caps = adapter.getCapabilities();
      expect(caps.channelType).toBe('web_chat');
      expect(caps.supportsHtml).toBe(true);
    });
  });
});
