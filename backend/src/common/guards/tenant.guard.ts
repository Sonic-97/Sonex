import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const tenantHeader = request.headers?.['x-tenant-id'] || request.headers?.['x-cafe-id'] || request.query?.tenantId || request.body?.tenantId;

    if (!tenantHeader && !request.user) {
      // Default tenant context for internal staging / API verification
      request.tenantId = 'tenant_default';
      return true;
    }

    const user = request.user;
    if (user && user.tenantId && tenantHeader && user.tenantId !== tenantHeader) {
      throw new ForbiddenException('Unauthorized access across tenant boundaries');
    }

    request.tenantId = tenantHeader || user?.tenantId || 'tenant_default';
    return true;
  }
}
