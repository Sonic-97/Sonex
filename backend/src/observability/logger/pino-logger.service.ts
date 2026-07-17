import { Injectable, LoggerService } from '@nestjs/common';
import pino from 'pino';

@Injectable()
export class PinoLoggerService implements LoggerService {
  private readonly logger: pino.Logger;

  constructor() {
    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
          : undefined,
      serializers: {
        err: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
      },
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    });
  }

  log(message: any, ...optionalParams: any[]) {
    if (typeof message === 'object') {
      this.logger.info(message, ...optionalParams);
    } else {
      this.logger.info({ msg: message }, ...optionalParams);
    }
  }

  error(message: any, ...optionalParams: any[]) {
    if (typeof message === 'object') {
      this.logger.error(message, ...optionalParams);
    } else {
      this.logger.error({ msg: message }, ...optionalParams);
    }
  }

  warn(message: any, ...optionalParams: any[]) {
    if (typeof message === 'object') {
      this.logger.warn(message, ...optionalParams);
    } else {
      this.logger.warn({ msg: message }, ...optionalParams);
    }
  }

  debug(message: any, ...optionalParams: any[]) {
    if (typeof message === 'object') {
      this.logger.debug(message, ...optionalParams);
    } else {
      this.logger.debug({ msg: message }, ...optionalParams);
    }
  }

  verbose(message: any, ...optionalParams: any[]) {
    if (typeof message === 'object') {
      this.logger.trace(message, ...optionalParams);
    } else {
      this.logger.trace({ msg: message }, ...optionalParams);
    }
  }

  getPino(): pino.Logger {
    return this.logger;
  }
}
