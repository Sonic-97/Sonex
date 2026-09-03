import { aggregateVersion, AggregateRoot, andSpecification, BusinessRule, DomainError, DomainEvent, enforce, Entity, notSpecification, orSpecification, Specification, ValueObject } from './index';

class TestEntity extends Entity<string> {}

class TestValue extends ValueObject<{ readonly code: string; readonly flags: readonly string[] }> {
  constructor(code: string, flags: readonly string[]) {
    super({ code, flags: [...flags] });
    this.freezeValueObject();
  }

  get code(): string {
    return this.snapshot().code;
  }
}

interface TestEvent extends DomainEvent<'TEST_RECORDED', { readonly value: string }> {}

class TestAggregate extends AggregateRoot<string, TestEvent> {
  recordValue(value: string): void {
    this.record({ name: 'TEST_RECORDED', payload: { value } });
    this.incrementVersion();
  }
}

describe('Shared Kernel domain foundations', () => {
  test('entities compare immutable identity only', () => {
    expect(new TestEntity('same').sameIdentityAs(new TestEntity('same'))).toBe(true);
    expect(new TestEntity('one').sameIdentityAs(new TestEntity('two'))).toBe(false);
    expect(new TestEntity('one').sameIdentityAs(undefined)).toBe(false);
  });

  test('value objects compare canonical immutable properties', () => {
    const value = new TestValue('coffee', ['hot']);
    expect(value.equals(new TestValue('coffee', ['hot']))).toBe(true);
    expect(value.equals(new TestValue('coffee', ['cold']))).toBe(false);
    expect(Object.isFrozen(value)).toBe(true);
  });

  test('aggregate roots version state and release immutable uncommitted events once', () => {
    const aggregate = new TestAggregate('aggregate-1', aggregateVersion(4));
    aggregate.recordValue('first');

    expect(aggregate.version).toBe(5);
    const events = aggregate.pullDomainEvents();
    expect(events).toEqual([{ name: 'TEST_RECORDED', payload: { value: 'first' } }]);
    expect(Object.isFrozen(events)).toBe(true);
    expect(Object.isFrozen(events[0].payload)).toBe(true);
    expect(aggregate.pullDomainEvents()).toEqual([]);
  });

  test('business rules produce stable domain failures', () => {
    const failingRule: BusinessRule = { code: 'SHARED_RULE_VIOLATED', message: 'Rule was violated', isSatisfied: () => false };
    expect(() => enforce(failingRule)).toThrow(DomainError);
  });

  test('specifications remain composable and framework independent', () => {
    const positive: Specification<number> = { isSatisfiedBy: (value) => value > 0 };
    const even: Specification<number> = { isSatisfiedBy: (value) => value % 2 === 0 };
    expect(andSpecification(positive, even).isSatisfiedBy(2)).toBe(true);
    expect(andSpecification(positive, even).isSatisfiedBy(3)).toBe(false);
    expect(orSpecification(positive, even).isSatisfiedBy(-2)).toBe(true);
    expect(notSpecification(positive).isSatisfiedBy(-1)).toBe(true);
  });
});
