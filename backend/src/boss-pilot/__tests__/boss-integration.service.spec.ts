import { BossIntegrationService } from '../boss-integration.service';
import { BossOrderType, BossPaymentMethod } from '../dto/boss-cafe-order.dto';
import { Result } from '../../common/result';

describe('BossIntegrationService', () => {
  let service: BossIntegrationService;
  let mockPrisma: any;
  let mockUnifiedOrders: any;
  let mockRunningAccount: any;
  let mockRecipeBOM: any;
  let mockZoneResolver: any;
  let mockDriverAssignment: any;

  beforeEach(() => {
    mockPrisma = {};
    mockUnifiedOrders = {
      create: jest.fn().mockResolvedValue({ id: 'ord_boss_01', code: 'ORD-101' }),
    };

    mockRunningAccount = {
      validateOrderCredit: jest.fn().mockResolvedValue(Result.ok(true)),
      recordCreditCharge: jest.fn().mockResolvedValue(Result.ok({})),
    };

    mockRecipeBOM = {
      processOrderRecipeDeductions: jest.fn().mockResolvedValue(Result.ok([
        { inventoryId: 'inv_1', itemName: 'Coffee Beans', deductedQuantity: 0.02, unit: 'kg' },
        { inventoryId: 'inv_2', itemName: 'Milk', deductedQuantity: 0.2, unit: 'l' },
      ])),
    };

    mockZoneResolver = {
      resolveByGpsCoordinates: jest.fn().mockResolvedValue({
        isSupported: true,
        deliveryFee: 15,
        zone: { id: 'zone_1', name: 'Nasr City', mainStreet: 'Abbas El Akkad' },
      }),
      resolveByStreetName: jest.fn(),
    };

    mockDriverAssignment = {
      generateDriverPayload: jest.fn().mockReturnValue({
        orderId: 'ord_boss_01',
        customerName: 'Ahmed Mostafa',
        googleMapsDeepLink: 'https://www.google.com/maps/search/?api=1&query=30.05,31.33',
      }),
    };

    service = new BossIntegrationService(
      mockPrisma as any,
      mockUnifiedOrders as any,
      mockRunningAccount as any,
      mockRecipeBOM as any,
      mockZoneResolver as any,
      mockDriverAssignment as any,
    );
  });

  it('should execute live Boss Cafe order with running account credit charge & recipe deductions', async () => {
    const dto = {
      cafeId: 'cafe_01',
      branchId: 'branch_01',
      customerId: 'cust_01',
      customerName: 'Ahmed Mostafa',
      customerPhone: '+201000000000',
      orderType: BossOrderType.DELIVERY,
      paymentMethod: BossPaymentMethod.RUNNING_ACCOUNT,
      items: [
        { productId: 'prod_latte', productName: 'Caffe Latte', quantity: 2, unitPrice: 40 },
      ],
      latitude: 30.05,
      longitude: 31.33,
    };

    const res = await service.placeBossCafeOrder(dto);

    expect(res.isSuccess).toBe(true);
    expect(res.value.orderId).toBe('ord_boss_01');
    expect(res.value.subtotal).toBe(80);
    expect(res.value.deliveryFee).toBe(15);
    expect(res.value.grandTotal).toBe(95);
    expect(res.value.recipeDeductionsCount).toBe(2);
    expect(mockRunningAccount.validateOrderCredit).toHaveBeenCalledWith('cust_01', 'branch_01', 95);
    expect(mockRunningAccount.recordCreditCharge).toHaveBeenCalledWith('cust_01', 'branch_01', 95);
    expect(mockRecipeBOM.processOrderRecipeDeductions).toHaveBeenCalled();
    expect(mockDriverAssignment.generateDriverPayload).toHaveBeenCalled();
  });
});
