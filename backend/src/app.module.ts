import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { OrdersModule } from './orders/orders.module';
import { ProductsModule } from './products/products.module';
import { InventoryModule } from './inventory/inventory.module';
import { ExpensesModule } from './expenses/expenses.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { CustomersModule } from './customers/customers.module';
import { AuditModule } from './audit/audit.module';
import { CommunicationModule } from './communication/communication.module';
import { AiModule } from './ai/ai.module';
import { MessagesModule } from './messages/messages.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrderFlowModule } from './order-flow/order-flow.module';
import { DriversModule } from './drivers/drivers.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { ReportsModule } from './reports/reports.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { RedisModule } from './redis/redis.module';
import { EventsModule } from './events/events.module';
import { WebSocketModule } from './websocket/websocket.module';
import { StaffModule } from './staff/staff.module';
import { FinancialModule } from './financial/financial.module';
import { StaffPerformanceModule } from './staff-performance/staff-performance.module';
import { QueueModule } from './queue/queue.module';
import { AiDecisionsModule } from './ai-decisions/ai-decisions.module';
import { InCafeModule } from './in-cafe/in-cafe.module';
import { StaffPurchaseModule } from './staff-purchase/staff-purchase.module';
import { SmartFollowupModule } from './smart-followup/smart-followup.module';
import { CustomerLearningModule } from './customer-learning/customer-learning.module';
import { AiWaiterModule } from './ai-waiter/ai-waiter.module';
import { PaymentModule } from './payment/payment.module';
import { ProductManagementModule } from './product-management/product-management.module';
import { PushNotificationModule } from './push/push-notification.module';
import { ClosingModule } from './closing/closing.module';
import { EmployeePaymentsModule } from './employee-payments/employee-payments.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { PlayStationModule } from './playstation/playstation.module';
import { InventoryPurchaseModule } from './inventory-purchase/inventory-purchase.module';
import { RefrigeratorModule } from './refrigerator/refrigerator.module';
import { AttendanceModule } from './attendance/attendance.module';
import { FinanceModule } from './finance/finance.module';
import { LidMappingModule } from './lid-mapping/lid-mapping.module';
import { LidResolverModule } from './lid-resolver/lid-resolver.module';
import { ReplyRouterModule } from './reply-router/reply-router.module';
import { PendingReplyModule } from './pending-reply/pending-reply.module';
import { ReliabilityModule } from './reliability/reliability.module';
import { RecoveryJobsModule } from './recovery-jobs/recovery-jobs.module';
import { ObservabilityModule } from './observability/observability.module';
import { LocalizationService } from './localization/localization.service';
import { OrderBuilderService } from './order-builder/order-builder.service';
import { MenuService } from './menu/menu.service';
import { TenantContextService } from './common/tenant-context.service';
import { CommonModule } from './common/common.module';
import { CrashRecoveryModule } from './crash-recovery/crash-recovery.module';
import { ConsumersModule } from './consumers/consumers.module';
import { MessagingModule } from './messaging/messaging.module';
import { TelegramModule } from './messaging/telegram/telegram.module';
import { DebugModule } from './debug/debug.module';
import { CoffeeOrderModule } from './coffee-order/coffee-order.module';
import { UnifiedOrdersModule } from './unified-orders/unified-orders.module';
import { InventoryPipelineModule } from './inventory-pipeline/inventory-pipeline.module';
import { FinancialEngineModule } from './financial-engine/financial-engine.module';
import { AnalyticsEngineModule } from './analytics-engine/analytics-engine.module';
import { DomainEventBusModule } from './domain-events/domain-event-bus.module';
import { OwnerCopilotModule } from './owner-copilot/owner-copilot.module';
import { ForecastingModule } from './forecasting/forecasting.module';
import { OwnerActionsModule } from './owner-actions/owner-actions.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { CustomerUnderstandingModule } from './customer-understanding/customer-understanding.module';
import { ContinuousLearningModule } from './continuous-learning/continuous-learning.module';
import { ReplyEngineModule } from './reply-engine/reply-engine.module';
import { CommerceBrainModule } from './commerce-brain/commerce-brain.module';
import { DriverDispatchModule } from './driver-dispatch/driver-dispatch.module';
import { DriverPresenceModule } from './driver-presence/driver-presence.module';
import { MerchantAvailabilityModule } from './merchant-availability/merchant-availability.module';
import { MerchantCommunicationModule } from './merchant-communication/merchant-communication.module';
import { TrustReputationModule } from './trust-reputation/trust-reputation.module';
import { ActionPlannerModule } from './action-planner/action-planner.module';
import { ActionExecutorModule } from './action-executor/action-executor.module';
import { TelegramAdapterModule } from './telegram-adapter/telegram-adapter.module';
import { MerchantPortalModule } from './merchant-portal/merchant-portal.module';
import { DriverApiModule } from './driver-api/driver-api.module';
import { CustomerApiModule } from './customer-api/customer-api.module';
import { InventoryIntegrityModule } from './inventory-integrity/inventory-integrity.module';
import { ReceiptModule } from './receipt/receipt.module';
import { MenuImportModule } from './menu-import/menu-import.module';
import { PricingModule } from './pricing/pricing.module';
import { AdapterPlatformModule } from './adapter-platform/adapter-platform.module';
import { ProductResolutionModule } from './product-resolution/product-resolution.module';
@Module({
  imports: [
    AuditModule,
    AuthModule,
    OrdersModule,
    ProductsModule,
    InventoryModule,
    ExpensesModule,
    WhatsappModule,
    CustomersModule,
    CommunicationModule,
    OrderFlowModule,
    CoffeeOrderModule,
    OwnerCopilotModule,
    ForecastingModule,
    OwnerActionsModule,
    CustomerUnderstandingModule,
    ContinuousLearningModule,
    AiModule,
    MessagesModule,
    NotificationsModule,
    DriversModule,
    AnalyticsModule,
    ReportsModule,
    DashboardModule,
    RedisModule,
    EventsModule,
    WebSocketModule,
    StaffModule,
    FinancialModule,
    StaffPerformanceModule,
    QueueModule.forRoot(),
    AiDecisionsModule,
    InCafeModule,
    StaffPurchaseModule,
    SmartFollowupModule,
    CustomerLearningModule,
    AiWaiterModule,
    PaymentModule,
    ProductManagementModule,
    PushNotificationModule,
    ClosingModule,
    EmployeePaymentsModule,
    SuperAdminModule,
    PlayStationModule,
    InventoryPurchaseModule,
    RefrigeratorModule,
    AttendanceModule,
    FinanceModule,
    LidMappingModule,
    LidResolverModule,
    ReplyRouterModule,
    PendingReplyModule,
    ReliabilityModule,
    RecoveryJobsModule,
    CrashRecoveryModule,
    ConsumersModule,
    CommonModule,
    ReplyEngineModule,
    ObservabilityModule,
    MessagingModule,
    TelegramModule,
    DebugModule,
    UnifiedOrdersModule,
    InventoryPipelineModule,
    FinancialEngineModule,
    AnalyticsEngineModule,
    DomainEventBusModule,
    OnboardingModule,
    CommerceBrainModule,
    DriverDispatchModule,
    DriverPresenceModule,
    MerchantAvailabilityModule,
    MerchantCommunicationModule,
    TrustReputationModule,
    ActionPlannerModule,
    ActionExecutorModule,
    TelegramAdapterModule,
    MerchantPortalModule,
    DriverApiModule,
    CustomerApiModule,
    InventoryIntegrityModule,
    ReceiptModule,
    MenuImportModule,
    PricingModule,
    AdapterPlatformModule,
    ProductResolutionModule,
  ],
  controllers: [AppController],
  providers: [AppService, OrderBuilderService, MenuService, LocalizationService, TenantContextService],
})
export class AppModule {}





