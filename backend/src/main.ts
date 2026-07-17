import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { PinoLoggerService } from './observability/logger/pino-logger.service';
import { ConfigurationService } from './observability/configuration/configuration.service';

(BigInt.prototype as any).toJSON = function () { return Number(this); };

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(PinoLoggerService));

  // Configuration validation - fail fast
  const configService = app.get(ConfigurationService);
  configService.validateOrThrow();

  // Security middleware
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  }));
  app.use(compression());
  app.use(rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { statusCode: 429, message: 'Too many requests, please try again later' },
  }));

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });
  const httpAdapter = app.getHttpAdapter();
  const expressApp = httpAdapter.getInstance() as any;
  expressApp.set('trust proxy', 1);
  app.use(cookieParser());
  app.use(require('body-parser').json({ limit: '10mb' }));
  app.use(require('body-parser').urlencoded({ limit: '10mb', extended: true }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  app.enableShutdownHooks();

  const port = process.env.PORT || 5000;
  await app.listen(port);
  const logger = app.get(PinoLoggerService);
  logger.log(`Sonic Coffee Backend is running on http://localhost:${port}`);
}
bootstrap();



