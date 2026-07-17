import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PinoLoggerService } from './pino-logger.service';

const SLOW_REQUEST_THRESHOLD_MS = 1000;

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: PinoLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const { method, url } = req;
    const requestId = req['x-request-id'] || '-';
    const start = Date.now();
    const user = req.user as { id?: string; cafeId?: string } | undefined;

    return next.handle().pipe(
      tap(() => {
        const res = context.switchToHttp().getResponse();
        const duration = Date.now() - start;
        const logData: Record<string, unknown> = {
          msg: 'HTTP Request',
          requestId,
          method,
          url,
          status: res.statusCode,
          durationMs: duration,
        };

        if (user?.id) logData.userId = user.id;
        if (user?.cafeId) logData.cafeId = user.cafeId;

        if (duration > SLOW_REQUEST_THRESHOLD_MS) {
          logData.slow = true;
          logData.thresholdMs = SLOW_REQUEST_THRESHOLD_MS;
          this.logger.warn(logData);
        } else {
          this.logger.log(logData);
        }
      }),
    );
  }
}
