import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthPayload } from './customer-api.types';

const API_TOKENS = new Map<string, AuthPayload>();

@Injectable()
export class CustomerApiAuthGuard implements CanActivate {
  static registerToken(token: string, payload: AuthPayload): void {
    API_TOKENS.set(token, payload);
  }

  static clearTokens(): void {
    API_TOKENS.clear();
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization as string | undefined;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const token = authHeader.slice(7);
    const payload = API_TOKENS.get(token);

    if (!payload) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    request.customerPayload = payload;
    return true;
  }
}
