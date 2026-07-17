import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class BranchContextGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // User not yet authenticated — let JwtAuthGuard handle it
    if (!user) return true;

    // Super-admin operates across cafes — no cafe/branch context needed
    if (user.role === 'SUPER_ADMIN') return true;

    const { role, branchId: userBranchId, cafeId: usercafeId } = user;

    if (!usercafeId) throw new ForbiddenException('No Cafe context in token');

    request.cafeId = usercafeId;

    if (role === 'Cafe' || role === 'OWNER') {
      const headerBranchId = request.headers?.['x-branch-id'];
      if (headerBranchId === 'all') {
        request.branchId = undefined;
      } else {
        request.branchId = request.query?.branchId || headerBranchId || request.body?.branchId || userBranchId;
      }
      return true;
    }

    if (!userBranchId) throw new ForbiddenException('User is not assigned to any branch');

    const reqBranchId = request.query?.branchId || request.headers?.['x-branch-id'] || request.body?.branchId || request.params?.branchId;
    if (reqBranchId && reqBranchId !== userBranchId) {
      throw new ForbiddenException('Access denied: Unauthorized branch');
    }

    request.branchId = userBranchId;
    return true;
  }
}




