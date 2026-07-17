import { Global, Module } from '@nestjs/common';
import { DomainEventBusService } from './domain-event-bus.service';
import { EventsModule } from '../events/events.module';
import { QueueModule } from '../queue/queue.module';
import { InventorySubscriber } from './subscribers/inventory.subscriber';
import { AnalyticsSubscriber } from './subscribers/analytics.subscriber';
import { AISubscriber } from './subscribers/ai.subscriber';
import { NotificationsSubscriber } from './subscribers/notifications.subscriber';
import { ReportsSubscriber } from './subscribers/reports.subscriber';
import { ForecastSubscriber } from './subscribers/forecast.subscriber';
import { OwnerCopilotSubscriber } from './subscribers/owner-copilot.subscriber';
import { DesktopSyncSubscriber } from './subscribers/desktop-sync.subscriber';

@Global()
@Module({
  imports: [EventsModule, QueueModule.forRoot()],
  providers: [
    DomainEventBusService,
    InventorySubscriber,
    AnalyticsSubscriber,
    AISubscriber,
    NotificationsSubscriber,
    ReportsSubscriber,
    ForecastSubscriber,
    OwnerCopilotSubscriber,
    DesktopSyncSubscriber,
  ],
  exports: [DomainEventBusService],
})
export class DomainEventBusModule {}
