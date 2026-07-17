import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EventsService } from './events.service';
import { AudioService } from './audio.service';
import { EventBusService } from './event-bus.service';
import { EventDedupService } from './event-dedup.service';
import { SagaOrchestratorService } from './saga-orchestrator.service';

@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
    }),
  ],
  providers: [EventsService, AudioService, EventBusService, EventDedupService, SagaOrchestratorService],
  exports: [EventsService, EventBusService, EventDedupService, SagaOrchestratorService],
})
export class EventsModule {}




