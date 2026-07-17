import { Global, Module } from '@nestjs/common';
import { LidResolverService } from './lid-resolver.service';

@Global()
@Module({
  providers: [LidResolverService],
  exports: [LidResolverService],
})
export class LidResolverModule {}
