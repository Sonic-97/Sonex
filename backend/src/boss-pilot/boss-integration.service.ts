import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UnifiedOrdersService } from '../unified-orders/unified-orders.service';
import { RunningAccountService } from '../running-account/application/running-account.service';
import { RecipeBOMService } from '../recipe-bom/application/recipe-bom.service';
import { ZoneResolverService } from '../delivery-management/application/services/zone-resolver.service';
import { DriverAssignmentService } from '../delivery-management/application/services/driver-assignment.service';
import { BossCafeOrderDto, BossPaymentMethod, BossOrderType } from './dto/boss-cafe-order.dto';
import { Result } from '../common/result';

export interface BossOrderExecutionResult {
  orderId: string;
  orderCode: string;
  subtotal: number;
  deliveryFee: number;
  grandTotal: number;
  paymentMethod: string;
  recipeDeductionsCount: number;
  driverPayload?: any;
}

@Injectable()
export class BossIntegrationService {
  private readonly logger = new Logger(BossIntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly unifiedOrdersService: UnifiedOrdersService,
    private readonly runningAccountService: RunningAccountService,
    private readonly recipeBOMService: RecipeBOMService,
    private readonly zoneResolver: ZoneResolverService,
    private readonly driverAssignment: DriverAssignmentService,
  ) {}

  async placeBossCafeOrder(dto: BossCafeOrderDto): Promise<Result<BossOrderExecutionResult>> {
    try {
      // Step 1: Calculate Totals
      const subtotal = dto.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      let deliveryFee = 0;
      let resolvedZone: any = null;

      // Resolve Delivery Zone & Fee if Delivery order
      if (dto.orderType === BossOrderType.DELIVERY) {
        if (dto.latitude && dto.longitude) {
          const zoneRes = await this.zoneResolver.resolveByGpsCoordinates(
            dto.branchId,
            dto.latitude,
            dto.longitude,
          );
          if (zoneRes.isSupported && zoneRes.zone) {
            deliveryFee = zoneRes.deliveryFee;
            resolvedZone = zoneRes.zone;
          }
        } else if (dto.streetName) {
          const zoneRes = await this.zoneResolver.resolveByStreetName(dto.branchId, dto.streetName);
          if (zoneRes.isSupported && zoneRes.zone) {
            deliveryFee = zoneRes.deliveryFee;
            resolvedZone = zoneRes.zone;
          }
        }
      }

      const grandTotal = subtotal + deliveryFee;

      // Step 2: Validate Credit Limit if payment method is RUNNING_ACCOUNT
      if (dto.paymentMethod === BossPaymentMethod.RUNNING_ACCOUNT) {
        const creditCheck = await this.runningAccountService.validateOrderCredit(
          dto.customerId,
          dto.branchId,
          grandTotal,
        );
        if (!creditCheck.isSuccess) {
          return Result.fail(`Credit validation failed: ${creditCheck.error}`);
        }
      }

      // Step 3: Place Order via Unified Order Engine
      const unifiedOrderRes = await this.unifiedOrdersService.create(
        {
          items: dto.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
          customerId: dto.customerId,
          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
          channel: dto.orderType === BossOrderType.WHATSAPP ? ('WHATSAPP' as any) : ('IN_CAFE' as any),
          source: ('POS_TERMINAL' as any),
          orderType: dto.orderType as any,
          paymentStatus: dto.paymentMethod === BossPaymentMethod.RUNNING_ACCOUNT ? ('UNPAID' as any) : ('PAID' as any),
          idempotencyKey: dto.idempotencyKey,
        },
        dto.cafeId,
        dto.branchId,
      );

      const orderData = (unifiedOrderRes as any).data || unifiedOrderRes;

      // Step 4: Process Recipe BOM Raw Material Deductions
      const bomItems = dto.items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
      }));

      const deductionRes = await this.recipeBOMService.processOrderRecipeDeductions(
        dto.cafeId,
        dto.branchId,
        orderData.id,
        bomItems,
      );

      // Step 5: Charge Credit if RUNNING_ACCOUNT
      if (dto.paymentMethod === BossPaymentMethod.RUNNING_ACCOUNT) {
        await this.runningAccountService.recordCreditCharge(dto.customerId, dto.branchId, grandTotal);
      }

      // Step 6: Generate Driver Payload if Delivery
      let driverPayload: any = null;
      if (dto.orderType === BossOrderType.DELIVERY && resolvedZone) {
        const mockLocation: any = {
          mainStreet: dto.streetName || resolvedZone.mainStreet,
          latitude: dto.latitude || 30.05,
          longitude: dto.longitude || 31.33,
          getGoogleMapsDeepLink: () => `https://www.google.com/maps/search/?api=1&query=${dto.latitude || 30.05},${dto.longitude || 31.33}`,
          toFormattedAddress: () => `${dto.streetName || resolvedZone.mainStreet}, Cairo`,
        };

        driverPayload = this.driverAssignment.generateDriverPayload(
          orderData.id,
          dto.customerName || 'Boss Customer',
          dto.customerPhone || '+201000000000',
          mockLocation,
          resolvedZone,
        );
      }

      this.logger.log(`Boss Cafe Order ${orderData.code || orderData.id} executed successfully.`);

      return Result.ok({
        orderId: orderData.id,
        orderCode: orderData.code || 'ORD-BOSS',
        subtotal,
        deliveryFee,
        grandTotal,
        paymentMethod: dto.paymentMethod,
        recipeDeductionsCount: deductionRes.isSuccess ? deductionRes.value.length : 0,
        driverPayload,
      });
    } catch (err: any) {
      this.logger.error(`Failed to execute Boss Cafe Order: ${err.message}`, err.stack);
      return Result.fail(`Order execution failed: ${err.message}`);
    }
  }
}
