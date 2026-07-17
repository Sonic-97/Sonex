import { Test, TestingModule } from '@nestjs/testing';
import { CapabilityProvider } from './capability-provider.service';

describe('CapabilityProvider', () => {
  let service: CapabilityProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CapabilityProvider],
    }).compile();
    service = module.get<CapabilityProvider>(CapabilityProvider);
  });

  describe('getCapabilities', () => {
    it('returns WhatsApp capabilities', () => {
      const caps = service.getCapabilities('whatsapp');
      expect(caps.channelType).toBe('whatsapp');
      expect(caps.supportedCapabilities).toContain('text');
      expect(caps.supportedCapabilities).toContain('buttons');
      expect(caps.supportedCapabilities).toContain('images');
      expect(caps.supportedCapabilities).toContain('documents');
      expect(caps.supportedCapabilities).toContain('voice');
      expect(caps.supportedCapabilities).toContain('location');
      expect(caps.supportedCapabilities).toContain('contacts');
      expect(caps.maxMessageLength).toBe(4096);
    });

    it('returns Web Chat capabilities', () => {
      const caps = service.getCapabilities('web_chat');
      expect(caps.supportedCapabilities).toContain('text');
      expect(caps.supportedCapabilities).toContain('buttons');
      expect(caps.supportedCapabilities).toContain('images');
      expect(caps.supportsHtml).toBe(true);
      expect(caps.supportsMarkdown).toBe(false);
    });

    it('returns Mobile capabilities', () => {
      const caps = service.getCapabilities('mobile');
      expect(caps.supportedCapabilities).toContain('text');
      expect(caps.supportedCapabilities).toContain('contacts');
      expect(caps.maxAttachmentSize).toBe(20 * 1024 * 1024);
    });

    it('returns Instagram capabilities', () => {
      const caps = service.getCapabilities('instagram');
      expect(caps.supportedCapabilities).toContain('text');
      expect(caps.supportedCapabilities).toContain('images');
      expect(caps.supportedCapabilities).toContain('voice');
      expect(caps.supportedCapabilities).not.toContain('buttons');
      expect(caps.maxMessageLength).toBe(1000);
    });

    it('returns Facebook Messenger capabilities', () => {
      const caps = service.getCapabilities('facebook_messenger');
      expect(caps.supportedCapabilities).toContain('buttons');
      expect(caps.supportedCapabilities).toContain('quick_replies');
    });

    it('returns Voice capabilities', () => {
      const caps = service.getCapabilities('voice');
      expect(caps.supportedCapabilities).toEqual(['text', 'voice']);
      expect(caps.supportsAttachments).toBe(false);
    });

    it('returns text-only capabilities for unknown channel', () => {
      const caps = service.getCapabilities('unknown' as any);
      expect(caps.supportedCapabilities).toEqual(['text']);
    });
  });

  describe('supports', () => {
    it('returns true when capability is supported', () => {
      expect(service.supports('whatsapp', 'buttons')).toBe(true);
      expect(service.supports('whatsapp', 'images')).toBe(true);
    });

    it('returns false when capability is not supported', () => {
      expect(service.supports('instagram', 'buttons')).toBe(false);
      expect(service.supports('whatsapp', 'voice' as any)).toBe(true);
    });

    it('returns false for unknown channel', () => {
      expect(service.supports('unknown' as any, 'images')).toBe(false);
    });
  });

  describe('registerChannel', () => {
    it('registers a new channel', () => {
      service.registerChannel('voice' as any, {
        channelType: 'voice',
        supportedCapabilities: ['text', 'voice'],
        maxMessageLength: 500,
      });
      const caps = service.getCapabilities('voice');
      expect(caps.supportedCapabilities).toContain('voice');
    });
  });
});
