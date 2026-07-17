import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  cafeId: string;
}

@Injectable()
export class TenantContextService {
  private static als = new AsyncLocalStorage<TenantContext>();
  private static enabled = true;

  static get cafeId(): string | undefined {
    return TenantContextService.als.getStore()?.cafeId;
  }

  static run<T>(cafeId: string, fn: () => T): T {
    return TenantContextService.als.run({ cafeId }, fn);
  }

  static setEnabled(v: boolean) { TenantContextService.enabled = v; }
  static isEnabled(): boolean { return TenantContextService.enabled; }
}
