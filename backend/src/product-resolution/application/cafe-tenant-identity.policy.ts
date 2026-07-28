import { tenantId, TenantId } from '../../shared-kernel';

/** Temporary compatibility policy: one cafe is the tenant boundary until Tenant Management exists. */
export class CafeTenantIdentityPolicy {
  tenantForCafe(cafeId: string): TenantId {
    return tenantId(cafeId);
  }

  matches(cafeId: string, candidate: TenantId): boolean {
    return this.tenantForCafe(cafeId) === candidate;
  }
}
