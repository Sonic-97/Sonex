import { Test, TestingModule } from '@nestjs/testing';
import { MobileAdapter } from './mobile.adapter';
import { MessageNormalizer } from '../../normalizer/message-normalizer.service';
import { CapabilityProvider } from '../../capability/capability-provider.service';

describe('MobileAdapter', () => {
  let adapter: MobileAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileAdapter,
        MessageNormalizer,
        CapabilityProvider,
      ],
    }).compile();
    adapter = module.get<MobileAdapter>(MobileAdapter);
  });

  describe('normalize', () => {
    it('normalizes mobile message', () => {
      const raw = { messageId: 'mob-1', sessionId: 'ms-1', userId: 'u-1', text: 'Hello from app' };
      const result = adapter.normalize(raw as any, 'cafe-1');
      expect(result.channelType).toBe('mobile');
      expect(result.text).toBe('Hello from app');
    });

    it('normalizes mobile message with location', () => {
      const raw = { messageId: 'mob-2', userId: 'u-1', latitude: 24.7, longitude: 46.7, locationLabel: 'Office' };
      const result = adapter.normalize(raw as any, 'cafe-1');
      expect(result.location).toBeDefined();
      expect(result.location!.label).toBe('Office');
    });
  });

  describe('send', () => {
    it('sends message', async () => {
      const status = await adapter.send('ms-1', { text: 'Hello' });
      expect(status).toBe('sent');
    });
  });

  describe('getCapabilities', () => {
    it('returns mobile capabilities', () => {
      const caps = adapter.getCapabilities();
      expect(caps.channelType).toBe('mobile');
      expect(caps.maxAttachmentSize).toBe(20 * 1024 * 1024);
    });
  });
});
