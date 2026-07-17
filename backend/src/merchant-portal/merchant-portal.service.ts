import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { MerchantCommunicationService } from '../merchant-communication/merchant-communication.service';
import { MerchantAvailabilityService } from '../merchant-availability/merchant-availability.service';
import { TrustReputationService } from '../trust-reputation/trust-reputation.service';
import { MerchantPortalAuthGuard } from './merchant-portal-auth.guard';
import { LoginRequest, LoginResponse, AuthPayload, AvailabilityUpdateRequest } from './merchant-portal.types';

const VALID_API_KEYS = new Map<string, string>([['merchant-1', 'cafe-1']]);

let tokenCounter = 0;

@Injectable()
export class MerchantPortalService {
  private readonly logger = new Logger(MerchantPortalService.name);

  constructor(
    private readonly mcp: MerchantCommunicationService,
    private readonly availability: MerchantAvailabilityService,
    private readonly trust: TrustReputationService,
  ) {}

  async login(req: LoginRequest): Promise<LoginResponse> {
    const cafeId = VALID_API_KEYS.get(req.merchantId);
    if (!cafeId || cafeId !== req.apiKey) {
      throw new UnauthorizedException('Invalid merchant credentials');
    }

    const token = `mcp-${++tokenCounter}-${Date.now()}`;
    MerchantPortalAuthGuard.registerToken(token, { merchantId: req.merchantId, cafeId });

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    return { token, merchantId: req.merchantId, expiresAt };
  }

  getOrderHistory(merchantOrderId: string, merchantId: string) {
    return this.mcp.getOrderHistory(merchantOrderId, merchantId);
  }

  acceptOrder(merchantId: string, merchantOrderId: string, customerOrderId: string, cafeId: string) {
    return this.mcp.receiveResponse(merchantId, merchantOrderId, customerOrderId, 'ACCEPT', cafeId);
  }

  rejectOrder(merchantId: string, merchantOrderId: string, customerOrderId: string, cafeId: string, reason?: string) {
    return this.mcp.receiveResponse(merchantId, merchantOrderId, customerOrderId, 'REJECT', cafeId, reason ? { reason } : undefined);
  }

  async startPreparing(merchantId: string, merchantOrderId: string, customerOrderId: string, cafeId: string) {
    const now = new Date().toISOString();
    return this.mcp.receiveMessage({
      messageId: `prep-${Date.now()}`, merchantId, merchantOrderId, customerOrderId,
      messageType: 'PREPARATION_STARTED', timestamp: now, payload: {}, metadata: {}, version: 1,
    }, cafeId);
  }

  async markReady(merchantId: string, merchantOrderId: string, customerOrderId: string, cafeId: string) {
    const now = new Date().toISOString();
    return this.mcp.receiveMessage({
      messageId: `ready-${Date.now()}`, merchantId, merchantOrderId, customerOrderId,
      messageType: 'READY_FOR_PICKUP', timestamp: now, payload: {}, metadata: {}, version: 1,
    }, cafeId);
  }

  async delayOrder(merchantId: string, merchantOrderId: string, customerOrderId: string, cafeId: string, extraMinutes: number) {
    const now = new Date().toISOString();
    return this.mcp.receiveMessage({
      messageId: `delay-${Date.now()}`, merchantId, merchantOrderId, customerOrderId,
      messageType: 'DELAY_NOTICE', timestamp: now,
      payload: { extraMinutes }, metadata: {}, version: 1,
    }, cafeId);
  }

  async reportOutOfStock(merchantId: string, merchantOrderId: string, customerOrderId: string, cafeId: string, productName: string) {
    const now = new Date().toISOString();
    return this.mcp.receiveMessage({
      messageId: `oos-${Date.now()}`, merchantId, merchantOrderId, customerOrderId,
      messageType: 'OUT_OF_STOCK', timestamp: now,
      payload: { productName }, metadata: {}, version: 1,
    }, cafeId);
  }

  getAvailability(cafeId: string) {
    return this.availability.getAvailability(cafeId);
  }

  async updateAvailability(cafeId: string, req: AvailabilityUpdateRequest) {
    if (req.action === 'pause') return this.availability.pause(cafeId);
    return this.availability.resume(cafeId);
  }

  getReputation(merchantId: string) {
    return this.trust.getReputation(merchantId);
  }

  getBadges(merchantId: string) {
    return this.trust.getMerchantBadges(merchantId);
  }

  getQualityAlerts(merchantId: string) {
    return this.trust.getQualityAlerts(merchantId);
  }
}
