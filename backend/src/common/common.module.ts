import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { IdempotencyService } from './idempotency.service';
import { TenantInterceptor } from './tenant.interceptor';
import { TenantContextService } from './tenant-context.service';

@Global()
@Module({
  providers: [
    IdempotencyService,
    TenantContextService,
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
  exports: [IdempotencyService, TenantContextService],
})
export class CommonModule {}
