import { Test, TestingModule } from '@nestjs/testing';
import { SessionResolver } from './session-resolver.service';

describe('SessionResolver', () => {
  let service: SessionResolver;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SessionResolver],
    }).compile();
    service = module.get<SessionResolver>(SessionResolver);
  });

  describe('findOrCreate', () => {
    it('creates a new session', () => {
      const session = service.findOrCreate({
        channelType: 'whatsapp',
        externalUserId: '1234',
        cafeId: 'cafe-1',
      });
      expect(session.sessionId).toBe('whatsapp-1234-cafe-1');
      expect(session.channelType).toBe('whatsapp');
      expect(session.cafeId).toBe('cafe-1');
      expect(session.createdAt).toBeDefined();
    });

    it('returns existing session', () => {
      const s1 = service.findOrCreate({
        channelType: 'whatsapp',
        externalUserId: '1234',
        cafeId: 'cafe-1',
      });
      const s2 = service.findOrCreate({
        channelType: 'whatsapp',
        externalUserId: '1234',
        cafeId: 'cafe-1',
      });
      expect(s2.sessionId).toBe(s1.sessionId);
      expect(s2.createdAt).toEqual(s1.createdAt);
    });

    it('sets customerId when provided', () => {
      const session = service.findOrCreate({
        channelType: 'mobile',
        externalUserId: 'u1',
        cafeId: 'cafe-1',
        customerId: 'cust-1',
      });
      expect(session.customerId).toBe('cust-1');
    });

    it('does not overwrite existing customerId', () => {
      const s1 = service.findOrCreate({
        channelType: 'mobile',
        externalUserId: 'u1',
        cafeId: 'cafe-1',
        customerId: 'cust-1',
      });
      const s2 = service.findOrCreate({
        channelType: 'mobile',
        externalUserId: 'u1',
        cafeId: 'cafe-1',
        customerId: 'cust-2',
      });
      expect(s2.customerId).toBe('cust-1');
    });
  });

  describe('get', () => {
    it('returns session by id', () => {
      service.findOrCreate({ channelType: 'web_chat', externalUserId: 'u1', cafeId: 'cafe-1' });
      const session = service.get('web_chat-u1-cafe-1');
      expect(session).toBeDefined();
      expect(session!.channelType).toBe('web_chat');
    });

    it('returns undefined for missing session', () => {
      const session = service.get('nonexistent');
      expect(session).toBeUndefined();
    });
  });

  describe('update', () => {
    it('updates session fields', () => {
      service.findOrCreate({ channelType: 'web_chat', externalUserId: 'u1', cafeId: 'cafe-1' });
      const updated = service.update('web_chat-u1-cafe-1', { currentStep: 'ordering' });
      expect(updated).toBeDefined();
      expect(updated!.currentStep).toBe('ordering');
    });

    it('returns undefined for missing session', () => {
      const updated = service.update('nonexistent', { currentStep: 'test' });
      expect(updated).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('deletes session', () => {
      service.findOrCreate({ channelType: 'mobile', externalUserId: 'u1', cafeId: 'cafe-1' });
      expect(service.delete('mobile-u1-cafe-1')).toBe(true);
      expect(service.get('mobile-u1-cafe-1')).toBeUndefined();
    });

    it('returns false for missing session', () => {
      expect(service.delete('nonexistent')).toBe(false);
    });
  });

  describe('findByCustomer', () => {
    it('finds sessions by customer', () => {
      service.findOrCreate({ channelType: 'whatsapp', externalUserId: 'u1', cafeId: 'cafe-1', customerId: 'cust-1' });
      service.findOrCreate({ channelType: 'mobile', externalUserId: 'u2', cafeId: 'cafe-1', customerId: 'cust-1' });
      service.findOrCreate({ channelType: 'web_chat', externalUserId: 'u3', cafeId: 'cafe-1', customerId: 'cust-2' });

      const sessions = service.findByCustomer('cafe-1', 'cust-1');
      expect(sessions).toHaveLength(2);
    });
  });

  describe('findByCafe', () => {
    it('finds sessions by cafe', () => {
      service.findOrCreate({ channelType: 'whatsapp', externalUserId: 'u1', cafeId: 'cafe-1' });
      service.findOrCreate({ channelType: 'mobile', externalUserId: 'u2', cafeId: 'cafe-2' });
      service.findOrCreate({ channelType: 'web_chat', externalUserId: 'u3', cafeId: 'cafe-1' });

      const sessions = service.findByCafe('cafe-1');
      expect(sessions).toHaveLength(2);
    });
  });
});
