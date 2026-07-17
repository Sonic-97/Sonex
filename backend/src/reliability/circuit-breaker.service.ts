import { Injectable, Logger } from '@nestjs/common';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number;
  successThreshold: number;
  openTimeoutMs: number;
  windowMs: number;
}

interface BreakerState {
  state: CircuitState;
  failures: number[];
  successes: number;
  openedAt: number | null;
  halfOpenProbes: number;
  halfOpenMaxProbes: number;
}

const DEFAULT_CONFIGS: Record<string, CircuitBreakerConfig> = {
  'openwa-api': {
    name: 'openwa-api',
    failureThreshold: 5,
    successThreshold: 2,
    openTimeoutMs: 30_000,
    windowMs: 30_000,
  },
  'deepseek-api': {
    name: 'deepseek-api',
    failureThreshold: 5,
    successThreshold: 2,
    openTimeoutMs: 60_000,
    windowMs: 60_000,
  },
  'whatsapp-send': {
    name: 'whatsapp-send',
    failureThreshold: 10,
    successThreshold: 3,
    openTimeoutMs: 15_000,
    windowMs: 60_000,
  },
};

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly breakers = new Map<string, BreakerState>();

  constructor() {
    for (const [name, config] of Object.entries(DEFAULT_CONFIGS)) {
      this.breakers.set(name, {
        state: CircuitState.CLOSED,
        failures: [],
        successes: 0,
        openedAt: null,
        halfOpenProbes: 0,
        halfOpenMaxProbes: 3,
      });
    }
  }

  async call<T>(breakerName: string, fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    const config = DEFAULT_CONFIGS[breakerName];
    if (!config) return fn();

    let state = this.breakers.get(breakerName);
    if (!state) {
      state = {
        state: CircuitState.CLOSED,
        failures: [],
        successes: 0,
        openedAt: null,
        halfOpenProbes: 0,
        halfOpenMaxProbes: 3,
      };
      this.breakers.set(breakerName, state);
    }

    if (state.state === CircuitState.OPEN) {
      const elapsed = Date.now() - (state.openedAt ?? Date.now());
      if (elapsed >= config.openTimeoutMs) {
        state.state = CircuitState.HALF_OPEN;
        state.halfOpenProbes = 0;
        this.logger.log(`[CircuitBreaker:${breakerName}] OPEN → HALF_OPEN after ${elapsed}ms`);
      } else {
        if (fallback) return fallback();
        throw new Error(`Circuit breaker ${breakerName} is OPEN (${elapsed}ms since open, timeout=${config.openTimeoutMs}ms)`);
      }
    }

    if (state.state === CircuitState.HALF_OPEN && state.halfOpenProbes >= state.halfOpenMaxProbes) {
      if (fallback) return fallback();
      throw new Error(`Circuit breaker ${breakerName} is HALF_OPEN and max probes (${state.halfOpenMaxProbes}) exhausted`);
    }

    try {
      const result = await fn();
      this.recordSuccess(breakerName, config);
      return result;
    } catch (err) {
      this.recordFailure(breakerName, config);
      if (fallback) return fallback();
      throw err;
    }
  }

  private recordSuccess(name: string, config: CircuitBreakerConfig) {
    const state = this.breakers.get(name);
    if (!state) return;

    if (state.state === CircuitState.HALF_OPEN) {
      state.halfOpenProbes++;
    }

    state.successes++;
    state.failures = [];

    if (state.state === CircuitState.HALF_OPEN && state.successes >= config.successThreshold) {
      state.state = CircuitState.CLOSED;
      state.successes = 0;
      state.openedAt = null;
      state.halfOpenProbes = 0;
      this.logger.log(`[CircuitBreaker:${name}] HALF_OPEN → CLOSED (${config.successThreshold} consecutive successes)`);
    }
  }

  private recordFailure(name: string, config: CircuitBreakerConfig) {
    const state = this.breakers.get(name);
    if (!state) return;

    const now = Date.now();
    state.failures.push(now);
    state.successes = 0;

    const cutoff = now - config.windowMs;
    state.failures = state.failures.filter(t => t > cutoff);

    if (state.state === CircuitState.HALF_OPEN) {
      state.state = CircuitState.OPEN;
      state.openedAt = now;
      this.logger.warn(`[CircuitBreaker:${name}] HALF_OPEN → OPEN (probe failed)`);
      return;
    }

    if (state.state === CircuitState.CLOSED && state.failures.length >= config.failureThreshold) {
      state.state = CircuitState.OPEN;
      state.openedAt = now;
      this.logger.warn(`[CircuitBreaker:${name}] CLOSED → OPEN (${state.failures.length} failures in ${config.windowMs}ms window)`);
    }
  }

  getState(name: string): CircuitState {
    return this.breakers.get(name)?.state ?? CircuitState.CLOSED;
  }

  reset(name: string) {
    const state = this.breakers.get(name);
    if (state) {
      state.state = CircuitState.CLOSED;
      state.failures = [];
      state.successes = 0;
      state.openedAt = null;
      state.halfOpenProbes = 0;
    }
  }

  getMetrics(): Array<{ name: string; state: CircuitState; failuresInWindow: number }> {
    const now = Date.now();
    return Array.from(this.breakers.entries()).map(([name, state]) => {
      const config = DEFAULT_CONFIGS[name];
      const cutoff = now - (config?.windowMs ?? 30_000);
      const recent = state.failures.filter(t => t > cutoff);
      return { name, state: state.state, failuresInWindow: recent.length };
    });
  }
}
