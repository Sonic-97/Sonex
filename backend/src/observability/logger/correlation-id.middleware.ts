import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

export const CORRELATION_ID_HEADER = 'x-request-id';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const id = (req.headers[CORRELATION_ID_HEADER] as string) || randomUUID();
    req[CORRELATION_ID_HEADER] = id;
    _res.setHeader(CORRELATION_ID_HEADER, id);
    next();
  }
}
