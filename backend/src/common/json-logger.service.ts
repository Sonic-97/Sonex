import { ConsoleLogger, Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class JsonLogger extends ConsoleLogger {
  private toJson(level: string, message: any, context?: string, trace?: string): string {
    const entry: Record<string, any> = {
      level,
      timestamp: new Date().toISOString(),
      message: typeof message === 'string' ? message : JSON.stringify(message),
    };
    if (context) entry.context = context;
    if (trace) entry.trace = trace;
    return JSON.stringify(entry);
  }

  log(message: any, context?: string) {
    console.log(this.toJson('info', message, context));
  }

  warn(message: any, context?: string) {
    console.warn(this.toJson('warn', message, context));
  }

  error(message: any, trace?: string, context?: string) {
    console.error(this.toJson('error', message, context, trace));
  }

  debug(message: any, context?: string) {
    console.debug(this.toJson('debug', message, context));
  }

  verbose(message: any, context?: string) {
    console.log(this.toJson('verbose', message, context));
  }
}
