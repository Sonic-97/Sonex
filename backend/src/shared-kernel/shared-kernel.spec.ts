import { actorId, aggregateVersion, branchId, causationId, commandId, ContractError, correlationId, createSnapshot, Decimal, deepFreeze, DomainError, eventId, eventSequence, expectedVersion, failure, FixedClock, idempotencyKey, instant, Money, nextAggregateVersion, Quantity, schemaVersion, success, tenantId, validateSnapshot, ValidationResult } from './index';

describe('RFC-001 Shared Kernel', () => {
  test('creates strongly validated identifiers and versions', () => {
    expect(tenantId('tenant-1')).toBe('tenant-1'); expect(branchId('branch-1')).toBe('branch-1');
    expect(nextAggregateVersion(aggregateVersion(0))).toBe(1); expect(expectedVersion(0)).toBe(0); expect(eventSequence(1)).toBe(1);
    expect(() => tenantId(' invalid ')).toThrow(ContractError); expect(() => aggregateVersion(-1)).toThrow(ContractError);
  });

  test('uses deterministic decimal parsing and all rounding strategies', () => {
    expect(Decimal.from('1.005').toFixed(2, 'HALF_UP')).toBe('1.01'); expect(Decimal.from('1.005').toFixed(2, 'HALF_EVEN')).toBe('1.00');
    expect(Decimal.from('-1.005').toFixed(2, 'HALF_UP')).toBe('-1.01'); expect(Decimal.from('1.001').toFixed(2, 'UP')).toBe('1.01');
    expect(() => Decimal.from('1.0000001')).toThrow(DomainError); expect(() => Decimal.from('1000000000001')).toThrow(DomainError);
  });

  test('keeps money exact, currency-safe and compatible with pricing strings', () => {
    expect(Money.from('10.005', 'egp').toString()).toBe('10.01'); expect(Money.from('10', 'JPY').toString()).toBe('10');
    expect(Money.from('10.0005', 'KWD').toString()).toBe('10.001'); expect(Money.from('2.50', 'EGP').multiply(3n).toString()).toBe('7.50');
    expect(() => Money.from('1', 'EGP').add(Money.from('1', 'USD'))).toThrow(DomainError); expect(() => Money.from('1', 'XXX')).toThrow(DomainError);
  });

  test('validates quantities and units', () => {
    expect(Quantity.from('2.5', 'kg').scale(2n).serialize()).toEqual({ value: '5', unit: 'kg' });
    expect(() => Quantity.from('-1', 'kg')).toThrow(DomainError); expect(() => Quantity.from('1', 'kg').add(Quantity.from('1', 'g'))).toThrow(DomainError);
  });

  test('provides typed outcomes and deterministic validation order', () => {
    expect(success(4)).toEqual({ ok: true, value: 4 }); expect(failure('NO')).toEqual({ ok: false, error: 'NO' });
    const result = ValidationResult.invalid([{ code: 'B', path: 'z', message: 'z' }, { code: 'A', path: 'a', message: 'a' }]);
    expect(result.valid).toBe(false); expect(result.issues.map((issue) => issue.path)).toEqual(['a', 'z']);
  });

  test('deep-freezes snapshots and detects corruption', () => {
    const snapshot = createSnapshot('PricingSnapshot', schemaVersion(1), { total: '10.00', nested: { currency: 'EGP' } }); validateSnapshot(snapshot);
    expect(Object.isFrozen(snapshot.payload)).toBe(true); expect(Object.isFrozen(snapshot.payload.nested)).toBe(true);
    expect(() => validateSnapshot({ ...snapshot, payload: { total: '11.00', nested: { currency: 'EGP' } } })).toThrow(ContractError);
  });

  test('normalizes time and supports a deterministic clock', () => {
    const value = instant('2026-07-21T12:00:00+02:00'); expect(value).toBe('2026-07-21T10:00:00.000Z'); expect(new FixedClock(value).now()).toBe(value);
  });

  test('supports canonical envelope metadata without infrastructure dependencies', () => {
    const context = deepFreeze({ tenantId: tenantId('tenant-1'), branchId: branchId('branch-1'), actor: { actorId: actorId('actor-1'), actorType: 'STAFF' as const }, channel: 'POS' as const });
    const metadata = { commandId: commandId('cmd-1'), eventId: eventId('evt-1'), correlationId: correlationId('corr-1'), causationId: causationId('cause-1'), idempotencyKey: idempotencyKey('idem-1'), context };
    expect(metadata.context.tenantId).toBe('tenant-1');
  });
});
