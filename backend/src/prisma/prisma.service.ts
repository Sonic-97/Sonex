import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantContextService } from '../common/tenant-context.service';

const TENANT_MODELS = new Set([
  'Customer', 'Order', 'InCafeOrder', 'LidMapping', 'PendingReply',
  'Debt', 'Inventory', 'Expense', 'Payment', 'FinancialTransaction',
  'ReportJob', 'WhatsAppLog', 'InventoryConsumption', 'Staff', 'Driver',
  'Product', 'InventoryPurchase', 'StaffPurchase', 'Notification',
  'Message', 'Attendance', 'DailyRevenue', 'PaymentLog',
  'EmployeePayment', 'StaffPerformance', 'InCafeOrderItem', 'OrderItem',
  'Branch', 'ProductCategory', 'CashHandover', 'PriceOverride',
  'CustomerHabit', 'Suggestion', 'SuggestionFeedback',
  'DriverCashSettlement', 'DriverEarning', 'StaffEarning',
  'PushSubscription', 'BranchProduct', 'InventorySyncLog',
  'WhatsappCustomer', 'FraudAlert', 'AILog',
  'PlayStationDevice', 'PlayStationSession', 'DeadLetter',
  'ProductOption', 'RecipeIngredient', 'AddOnIngredient',
  'PackagingMaterial', 'CostSnapshot', 'PriceChangeLog',
  'CustomUnit', 'BillingSubscription', 'Invoice', 'InvoiceLineItem',
  'RefrigeratorCategory', 'ProcessedMessage',
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
      transactionOptions: {
        isolationLevel: 'ReadCommitted',
        maxWait: 5000,
        timeout: 15000,
      },
    });

    return this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const start = Date.now();
            const exec = async () => {
              const res = await query(args);
              const ms = Date.now() - start;
              if (ms > 100) console.warn(`[SLOW_QUERY] ${model}.${operation} took ${ms}ms`);
              return res;
            };

            if (!TenantContextService.isEnabled()) return exec();
            if (!TENANT_MODELS.has(model)) return exec();

            const cafeId = TenantContextService.cafeId;
            if (!cafeId) return exec();

            if (operation === 'create') {
              const data = args.data;
              if (data && !(data as any).cafeId && !(data as any).cafe_id) {
                (data as any).cafeId = cafeId;
              }
              return exec();
            }

            if (operation === 'createMany') {
              const data = args.data;
              if (Array.isArray(data)) {
                for (const item of data) {
                  if (item && !(item as any).cafeId && !(item as any).cafe_id) {
                    (item as any).cafeId = cafeId;
                  }
                }
              }
              return exec();
            }

            if (['findUnique', 'findFirst', 'findMany', 'update', 'updateMany',
                 'delete', 'deleteMany', 'count', 'aggregate', 'groupBy',
                 'upsert'].includes(operation)) {
              const where = (args as any)?.where as Record<string, unknown> | undefined;
              if (where) {
                if (where.id && !where.cafeId && !(where as any).cafe_id) {
                  console.warn(`[TENANT-WARN] ${model}.${operation}: missing cafeId for id=${where.id}`);
                }
              }
            }

            return exec();
          },
        },
      },
    }) as unknown as this;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
