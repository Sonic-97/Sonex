import { aggregateVersion, AggregateVersion } from './versions';
import { DomainError } from './errors';
import { deepFreeze, DeepReadonly, JsonValue } from './immutable';
import { canonicalJson } from './serialization';

/** A fact raised by an aggregate before an application layer publishes it. */
export interface DomainEvent<TName extends string = string, TPayload extends JsonValue = JsonValue> {
  readonly name: TName;
  readonly payload: DeepReadonly<TPayload>;
}

/** A domain object identified solely by its immutable identity. */
export abstract class Entity<TId> {
  protected constructor(public readonly id: TId) {}

  sameIdentityAs(other: Entity<TId> | undefined | null): boolean {
    return other !== undefined && other !== null && this.id === other.id;
  }
}

/**
 * A value object is defined by its canonical immutable properties, not object identity.
 * Properties deliberately use the shared JSON subset so equality remains deterministic.
 */
export abstract class ValueObject<TProperties extends JsonValue> {
  protected readonly properties: DeepReadonly<TProperties>;

  protected constructor(properties: TProperties) {
    this.properties = deepFreeze(properties);
  }

  /** Subclasses call this after assigning their own immutable state. */
  protected freezeValueObject(): void {
    Object.freeze(this);
  }

  equals(other: ValueObject<TProperties> | undefined | null): boolean {
    return other !== undefined && other !== null && canonicalJson(this.properties) === canonicalJson(other.properties);
  }

  protected snapshot(): DeepReadonly<TProperties> {
    return this.properties;
  }
}

/** Aggregate base with optimistic version state and uncommitted domain-event collection. */
export abstract class AggregateRoot<TId, TEvent extends DomainEvent = DomainEvent> extends Entity<TId> {
  private versionValue: AggregateVersion;
  private readonly pendingEvents: TEvent[] = [];

  protected constructor(id: TId, version: AggregateVersion = aggregateVersion(0)) {
    super(id);
    this.versionValue = version;
  }

  get version(): AggregateVersion {
    return this.versionValue;
  }

  protected incrementVersion(): void {
    this.versionValue = aggregateVersion(this.versionValue + 1);
  }

  protected record(event: TEvent): void {
    this.pendingEvents.push(deepFreeze(event) as TEvent);
  }

  pullDomainEvents(): readonly TEvent[] {
    const events = Object.freeze([...this.pendingEvents]);
    this.pendingEvents.length = 0;
    return events;
  }
}

/** A named invariant that can be evaluated by aggregates and domain services. */
export interface BusinessRule {
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
  isSatisfied(): boolean;
}

export function enforce(rule: BusinessRule): void {
  if (!rule.isSatisfied()) {
    throw new DomainError(rule.code, rule.message, rule.details);
  }
}

/** Composable domain predicate with no infrastructure dependency. */
export interface Specification<T> {
  isSatisfiedBy(candidate: T): boolean;
}

export const andSpecification = <T>(...specifications: readonly Specification<T>[]): Specification<T> =>
  Object.freeze({ isSatisfiedBy: (candidate: T) => specifications.every((specification) => specification.isSatisfiedBy(candidate)) });

export const orSpecification = <T>(...specifications: readonly Specification<T>[]): Specification<T> =>
  Object.freeze({ isSatisfiedBy: (candidate: T) => specifications.some((specification) => specification.isSatisfiedBy(candidate)) });

export const notSpecification = <T>(specification: Specification<T>): Specification<T> =>
  Object.freeze({ isSatisfiedBy: (candidate: T) => !specification.isSatisfiedBy(candidate) });

/** Marker base for stateless domain services. */
export abstract class DomainService {
  protected constructor() {}
}
