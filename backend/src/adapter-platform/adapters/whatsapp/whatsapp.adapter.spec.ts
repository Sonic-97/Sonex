import { Test, TestingModule } from '@nestjs/testing';
import { WhatsAppAdapter } from './whatsapp.adapter';
import { MessageNormalizer } from '../../normalizer/message-normalizer.service';
import { SessionResolver } from '../../session/session-resolver.service';
import { CapabilityProvider } from '../../capability/capability-provider.service';

describe('WhatsAppAdapter', () => {
  let adapter: WhatsAppAdapter;

  let sessionResolver: SessionResolver;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppAdapter,
        MessageNormalizer,
        SessionResolver,
        CapabilityProvider,
      ],
    }).compile();
    adapter = module.get<WhatsAppAdapter>(WhatsAppAdapter);
    sessionResolver = module.get<SessionResolver>(SessionResolver);
  });

  describe('channelType', () => {
    it('returns whatsapp', () => {
      expect(adapter.channelType).toBe('whatsapp');
    });
  });

  describe('normalize', () => {
    it('normalizes incoming WhatsApp message', () => {
      const raw = {
        entry: [{
          changes: [{
            value: {
              messages: [{ id: 'wa-msg-1', from: '5551234', type: 'text', text: { body: 'Order coffee' }, timestamp: '1700000000' }],
              contacts: [{ profile: { name: 'Alice' } }],
            },
          }],
        }],
      };
      const result = adapter.normalize(raw as any, 'cafe-1');
      expect(result.text).toBe('Order coffee');
      expect(result.sessionId).toBe('wa-5551234-cafe-1');
    });
  });

  describe('send', () => {
    it('sends text message', async () => {
      sessionResolver.findOrCreate({ channelType: 'whatsapp', externalUserId: '5551234', cafeId: 'cafe-1' });
      const status = await adapter.send('whatsapp-5551234-cafe-1', { text: 'Hello' });
      expect(status).toBe('delivered');
    });

    it('returns failed for unknown session', async () => {
      const status = await adapter.send('nonexistent', { text: 'Hi' });
      expect(status).toBe('failed');
    });
  });

  describe('sendBulk', () => {
    it('sends to multiple sessions', async () => {
      const statuses = await adapter.sendBulk(['s1', 's2'], { text: 'Broadcast' });
      expect(statuses).toHaveLength(2);
      expect(statuses[0]).toBe('failed'); // no sessions exist
    });
  });

  describe('getCapabilities', () => {
    it('returns WhatsApp capabilities', () => {
      const caps = adapter.getCapabilities();
      expect(caps.channelType).toBe('whatsapp');
      expect(caps.supportedCapabilities).toContain('buttons');
      expect(caps.supportedCapabilities).toContain('images');
      expect(caps.supportedCapabilities).toContain('documents');
      expect(caps.supportedCapabilities).toContain('location');
      expect(caps.supportedCapabilities).toContain('contacts');
    });
  });
});
