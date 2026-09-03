import { actorId, aggregateVersion, AuditMetadata, causationId, correlationId, DateRange, DomainError, Hash, instant, Measurement, Money, Percentage, Quantity, Unit } from './index';

describe('Shared Kernel behavioral value objects', () => {
  test('Money preserves exact minor-unit arithmetic and immutable equality', () => {
    const amount = Money.from('10.01', 'EGP');
    expect(amount.minorUnits()).toBe(1001n);
    expect(amount.add(Money.fromMinorUnits(99n, 'EGP')).toString()).toBe('11.00');
    expect(amount.negate().toString()).toBe('-10.01');
    expect(amount.isPositive()).toBe(true);
    expect(amount.equals(Money.from('10.010', 'egp'))).toBe(true);
    expect(Money.fromMinorUnits(-1n, 'KWD').toString()).toBe('-0.001');
  });

  test('Percentage validates inclusive boundaries and equality', () => {
    expect(Percentage.from('0').equals(Percentage.from('0.0'))).toBe(true);
    expect(Percentage.from('100').toString()).toBe('100');
    expect(() => Percentage.from('-0.001')).toThrow(DomainError);
    expect(() => Percentage.from('100.001')).toThrow(DomainError);
  });

  test('Measurement composes a compatible Quantity and Unit without conversion', () => {
    const measurement = Measurement.from(Quantity.from('180', 'ml'), Unit.from('ML'));
    expect(measurement.format()).toBe('180 ml');
    expect(measurement.equals(Measurement.from(Quantity.from('180.0', 'ml'), Unit.from('ml')))).toBe(true);
    expect(() => Measurement.from(Quantity.from('1', 'g'), Unit.from('ml'))).toThrow(DomainError);
  });

  test('Hash accepts only canonical SHA-256 values', () => {
    const upper = 'A'.repeat(64);
    expect(Hash.sha256(upper).value).toBe('a'.repeat(64));
    expect(Hash.sha256(upper).equals(Hash.sha256('a'.repeat(64)))).toBe(true);
    expect(() => Hash.sha256('abc')).toThrow(DomainError);
  });

  test('DateRange supports inclusive containment, overlap and duration', () => {
    const range = DateRange.from('2026-07-29T10:00:00.000Z', '2026-07-29T10:30:00.000Z');
    expect(range.contains('2026-07-29T10:30:00.000Z')).toBe(true);
    expect(range.overlaps(DateRange.from('2026-07-29T10:30:00.000Z', '2026-07-29T11:00:00.000Z'))).toBe(true);
    expect(range.duration()).toBe(1_800_000n);
    expect(() => DateRange.from('2026-07-29T10:30:00.000Z', '2026-07-29T10:00:00.000Z')).toThrow(DomainError);
  });

  test('AuditMetadata is immutable and preserves canonical audit evidence', () => {
    const metadata = AuditMetadata.from({
      createdAt: instant('2026-07-29T10:00:00.000Z'),
      createdBy: actorId('cashier-1'),
      lastModifiedAt: instant('2026-07-29T10:01:00.000Z'),
      lastModifiedBy: actorId('manager-1'),
      correlationId: correlationId('sale-1'),
      causationId: causationId('command-1'),
      version: aggregateVersion(2),
    });
    expect(Object.isFrozen(metadata)).toBe(true);
    expect(metadata.serialize().version).toBe(2);
    expect(() => AuditMetadata.from({ ...metadata.serialize(), lastModifiedAt: instant('2026-07-29T09:59:00.000Z') })).toThrow(DomainError);
  });
});
