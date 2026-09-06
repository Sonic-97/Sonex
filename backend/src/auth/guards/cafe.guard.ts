import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class CafeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Reject unauthenticated requests on non-public routes
    if (!user) throw new UnauthorizedException('Authentication required');

    // Super-admin operates across cafes — no cafe context needed
    if (user.role === 'SUPER_ADMIN') return true;

    const { cafeId: userCafeId } = user;
    if (!userCafeId) throw new ForbiddenException('No Cafe context');

    const resourceCafeId =
      request.params?.cafeId ||
      request.query?.cafeId ||
      request.body?.cafeId ||
      request.headers?.['x-cafe-id'];

    if (resourceCafeId && resourceCafeId !== userCafeId) {
      throw new ForbiddenException('Unauthorized access to this Cafe\'s data');
    }

    request.cafeId = userCafeId;
    return true;
  }
}
