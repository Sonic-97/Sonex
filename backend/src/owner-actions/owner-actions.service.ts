import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ApproveOwnerActionDto,
  CreateOwnerActionProposalDto,
  EditOwnerActionDto,
  OwnerActionApprovalInput,
  TelegramOwnerApprovalDto,
} from './owner-action.dto';
import { OwnerActionExecutorService, OwnerActionStaleError } from './owner-action-executor.service';
import { OwnerActionPolicyService } from './owner-action-policy.service';
import { hashOwnerActionState, OwnerActionReaderService } from './owner-action-reader.service';
import { OwnerActionStoreService } from './owner-action-store.service';
import {
  NaturalActionPreparation,
  OwnerActionChannel,
  OwnerActionMetrics,
  OwnerActionProposal,
  OwnerActionType,
  OwnerActionUser,
} from './owner-action.types';

const BLOCKED_REQUEST = /(refund|settlement|payroll|permission|password|secret|token|sql|delete customer|delete transaction|رد\s*مبلغ|تسوي(?:ة|ه)|مرتبات|رواتب|صلاحيات|كلمة\s*مرور|توكن|احذف\s*(?:عميل|معاملة)|شطب\s*دين|رصيد\s*عميل)/i;
const PROMPT_INJECTION = /(ignore .*approval|bypass .*approval|arbitrary sql|any cafeid|اعتبرني المالك|تجاهل .*الموافق|نفذ .*فور|استخدم أي cafeid|غير صلاحيات|اطبع .*توكن)/i;
const AMBIGUOUS_APPROVAL = /^(تمام|ماشي|أوكي|اوكي|ok|okay|كمل|خلصها|اعمل اللي شايفه)$/i;

@Injectable()
export class OwnerActionsService {
  private readonly locks = new Set<string>();
  private readonly metrics: OwnerActionMetrics = {
    proposalsCreated: 0,
    proposalsApproved: 0,
    proposalsRejected: 0,
    proposalsCancelled: 0,
    proposalsExpired: 0,
    staleProposals: 0,
    executionSuccess: 0,
    executionFailure: 0,
    rollbacks: 0,
    duplicateAttempts: 0,
    permissionDenials: 0,
    ownerEdits: 0,
    blockedRequests: 0,
    telegramApprovalDenials: 0,
    measurableFinancialImpact: 0,
    customerRecordsAffected: 0,
    monitoringPlansCreated: 0,
    totalApprovalTimeMs: 0,
    approvalCount: 0,
    byActionType: {},
    byRiskLevel: {},
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: OwnerActionPolicyService,
    private readonly reader: OwnerActionReaderService,
    private readonly store: OwnerActionStoreService,
    private readonly executor: OwnerActionExecutorService,
    private readonly audit: AuditService,
  ) {}

  async prepare(
    rawUser: OwnerActionUser | null | undefined,
    dto: CreateOwnerActionProposalDto,
    source: OwnerActionChannel = 'API',
  ): Promise<OwnerActionProposal> {
    return this.prepareInternal(this.requireUser(rawUser), dto, source, 1);
  }

  list(rawUser: OwnerActionUser | null | undefined): OwnerActionProposal[] {
    const user = this.requireUser(rawUser);
    return this.store.list(user.cafeId!).filter((proposal) => proposal.createdBy === user.id);
  }

  get(rawUser: OwnerActionUser | null | undefined, proposalId: string): OwnerActionProposal {
    const user = this.requireUser(rawUser);
    const proposal = this.store.get(user.cafeId!, proposalId);
    this.assertSameOwner(user, proposal);
    return proposal;
  }

  async approve(
    rawUser: OwnerActionUser | null | undefined,
    proposalId: string,
    dto: ApproveOwnerActionDto,
    channel: OwnerActionChannel = 'UI',
  ): Promise<OwnerActionProposal> {
    const user = this.requireUser(rawUser);
    const lockKey = `${user.cafeId}:${proposalId.toUpperCase()}`;
    if (this.locks.has(lockKey)) throw new ConflictException('This exact proposal is already being processed.');
    this.locks.add(lockKey);
    try {
      let proposal = this.store.get(user.cafeId!, proposalId);
      this.assertSameOwner(user, proposal);
      this.assertExactApproval(proposal, dto);
      if (proposal.status === 'EXECUTED' && proposal.execution) {
        this.assertPolicy(user, proposal.actionType, proposal.branchIds, true);
        this.metrics.duplicateAttempts += 1;
        return proposal;
      }
      if (proposal.status === 'EXPIRED') {
        this.assertPolicy(user, proposal.actionType, proposal.branchIds, true);
        this.metrics.proposalsExpired += 1;
        const refreshedProposal = await this.refreshStaleProposal(user, proposal);
        throw new ConflictException({
          message: 'The proposal expired. Current data was re-read and a new proposal was prepared for review.',
          proposal,
          refreshedProposal,
        });
      }
      if (proposal.status !== 'AWAITING_APPROVAL') {
        throw new ConflictException(`Proposal in ${proposal.status} cannot execute.`);
      }
      this.assertPolicy(user, proposal.actionType, proposal.branchIds, true);

      const fresh = await this.reader.snapshot(
        proposal.actionType,
        proposal.cafeId,
        proposal.branchIds,
        proposal.resource.id,
        proposal.proposedState,
      );
      if (hashOwnerActionState(fresh.currentState) !== proposal.expectedStateHash) {
        proposal = this.store.transition(proposal.cafeId, proposal.proposalId, 'STALE', {
          failure: 'Current data changed after proposal creation.',
        });
        this.metrics.staleProposals += 1;
        await this.auditOutcome(proposal, 'OWNER_ACTION_STALE', user, { actualState: fresh.currentState });
        const refreshedProposal = await this.refreshStaleProposal(user, proposal);
        throw new ConflictException({
          message: 'Current data changed. No action was executed; a refreshed proposal was prepared.',
          proposal,
          actualState: fresh.currentState,
          refreshedProposal,
        });
      }

      const approvedAt = new Date().toISOString();
      proposal = this.store.transition(proposal.cafeId, proposal.proposalId, 'APPROVED', {
        approvedAt,
        approvedBy: user.id,
        approvalChannel: channel,
        approvalText: dto.approvalText.trim(),
      });
      this.metrics.proposalsApproved += 1;
      this.metrics.approvalCount += 1;
      this.metrics.totalApprovalTimeMs += Date.parse(approvedAt) - Date.parse(proposal.createdAt);
      await this.auditOutcome(proposal, 'OWNER_ACTION_APPROVED', user, {
        approvalText: dto.approvalText.trim(),
        approvalChannel: channel,
      });

      proposal = this.store.transition(proposal.cafeId, proposal.proposalId, 'EXECUTING');
      const idempotencyKey = this.idempotencyKey(proposal);
      try {
        const execution = await this.executor.execute(proposal, idempotencyKey);
        proposal = this.store.transition(proposal.cafeId, proposal.proposalId, 'EXECUTED', { execution });
        this.metrics.executionSuccess += 1;
        if (execution.duplicate) this.metrics.duplicateAttempts += 1;
        this.metrics.measurableFinancialImpact += this.financialImpact(proposal);
        this.metrics.customerRecordsAffected += proposal.impact.affectedRecords ?? 0;
        if (execution.monitoring) this.metrics.monitoringPlansCreated += 1;
        return proposal;
      } catch (error) {
        if (error instanceof OwnerActionStaleError) {
          proposal = this.store.transition(proposal.cafeId, proposal.proposalId, 'STALE', { failure: error.message });
          this.metrics.staleProposals += 1;
          await this.auditOutcome(proposal, 'OWNER_ACTION_STALE', user, { actualState: error.actualState });
          const refreshedProposal = await this.refreshStaleProposal(user, proposal);
          throw new ConflictException({
            message: 'Current data changed during final validation. No action was executed; a refreshed proposal was prepared.',
            proposal,
            actualState: error.actualState,
            refreshedProposal,
          });
        }
        const failure = this.safeError(error);
        proposal = this.store.transition(proposal.cafeId, proposal.proposalId, 'FAILED', { failure });
        this.metrics.executionFailure += 1;
        await this.auditOutcome(proposal, 'OWNER_ACTION_FAILED', user, { failure, transactionRolledBack: true });
        proposal = this.store.transition(proposal.cafeId, proposal.proposalId, 'ROLLED_BACK', { failure });
        this.metrics.rollbacks += 1;
        throw new UnprocessableEntityException({
          message: 'Execution failed and the database transaction was rolled back. No partial success is claimed.',
          proposal,
        });
      }
    } finally {
      this.locks.delete(lockKey);
    }
  }

  async reject(rawUser: OwnerActionUser | null | undefined, proposalId: string, reason: string): Promise<OwnerActionProposal> {
    const user = this.requireUser(rawUser);
    const proposal = this.store.get(user.cafeId!, proposalId);
    this.assertSameOwner(user, proposal);
    const rejected = this.store.transition(proposal.cafeId, proposal.proposalId, 'REJECTED', {
      rejectedAt: new Date().toISOString(),
      rejectionReason: reason.trim(),
    });
    this.metrics.proposalsRejected += 1;
    await this.auditOutcome(rejected, 'OWNER_ACTION_REJECTED', user, { reason: reason.trim() });
    return rejected;
  }

  async cancel(rawUser: OwnerActionUser | null | undefined, proposalId: string): Promise<OwnerActionProposal> {
    const user = this.requireUser(rawUser);
    const proposal = this.store.get(user.cafeId!, proposalId);
    this.assertSameOwner(user, proposal);
    const cancelled = this.store.transition(proposal.cafeId, proposal.proposalId, 'CANCELLED', {
      cancelledAt: new Date().toISOString(),
    });
    this.metrics.proposalsCancelled += 1;
    await this.auditOutcome(cancelled, 'OWNER_ACTION_CANCELLED', user, {});
    return cancelled;
  }

  async edit(
    rawUser: OwnerActionUser | null | undefined,
    proposalId: string,
    dto: EditOwnerActionDto,
  ): Promise<OwnerActionProposal> {
    const user = this.requireUser(rawUser);
    const previous = this.store.get(user.cafeId!, proposalId);
    this.assertSameOwner(user, previous);
    if (!['DRAFT', 'AWAITING_APPROVAL'].includes(previous.status)) {
      throw new ConflictException('Only a draft or awaiting proposal can be edited. Create a new proposal instead.');
    }
    await this.cancel(user, previous.proposalId);
    this.metrics.ownerEdits += 1;
    return this.prepareInternal(user, {
      actionType: previous.actionType,
      branchId: previous.branchIds[0],
      resourceId: previous.resource.id,
      proposedState: dto.proposedState,
      reason: dto.reason,
      requestedText: previous.requestedText,
    }, previous.source, previous.version + 1, previous.proposalId);
  }

  async approveFromTrustedTelegram(
    rawUser: OwnerActionUser | null | undefined,
    input: TelegramOwnerApprovalDto,
  ): Promise<OwnerActionProposal> {
    const user = this.requireUser(rawUser);
    if (user.role !== 'OWNER' || !input.isLinkedOwner || input.isGroup || input.isForwarded) {
      this.metrics.telegramApprovalDenials += 1;
      throw new ForbiddenException('Telegram approval requires a linked owner in a private, non-forwarded chat.');
    }
    return this.approve(user, input.proposalId, {
      approvalText: input.approvalText,
      confirmationCode: input.proposalId,
      idempotencyKey: `telegram:${input.updateId}`,
    }, 'TELEGRAM');
  }

  async prepareFromNaturalLanguage(
    rawUser: OwnerActionUser | null | undefined,
    ownerMessage: string,
    requestBranchId?: string,
  ): Promise<NaturalActionPreparation> {
    const user = this.requireUser(rawUser);
    const text = this.normalizeText(ownerMessage);
    if (PROMPT_INJECTION.test(text) || BLOCKED_REQUEST.test(text)) {
      this.metrics.blockedRequests += 1;
      return { handled: true, blocked: true, message: 'This request is blocked by the Stage 6 action policy. No proposal or business write was created.', warnings: ['Critical financial, authentication, permission, secret, deletion, and arbitrary SQL actions remain unsupported.'] };
    }
    if (AMBIGUOUS_APPROVAL.test(text)) {
      this.metrics.blockedRequests += 1;
      return { handled: true, blocked: true, message: 'Ambiguous confirmation is not approval. Use the exact active proposal code.', warnings: ['No action was executed.'] };
    }

    const branchId = requestBranchId || user.branchId || undefined;
    if ((text.includes('سعر') || text.includes('price')) && /(زود|زيادة|غير|غيّر|اجعل|خفض|قلل|increase|raise|change|update|set)/i.test(text)) {
      const product = await this.findProduct(user.cafeId!, text);
      const amount = this.firstNumber(text);
      if (!product || amount == null) return this.clarification('Specify the existing product and the exact price or change amount.');
      const branchPrice = branchId ? await this.prisma.branchProduct.findFirst({ where: { cafeId: user.cafeId!, branchId, productId: product.id }, select: { price: true } }) : null;
      const currentPrice = branchPrice ? Number(branchPrice.price) : Number(product.price);
      const incremental = /(زود|زيادة|increase|raise)/i.test(text);
      const proposedPrice = incremental ? currentPrice + amount : amount;
      const proposal = await this.prepare(user, {
        actionType: 'UPDATE_PRODUCT_PRICE', branchId, resourceId: product.id,
        proposedState: { price: proposedPrice }, reason: ownerMessage, requestedText: ownerMessage,
      }, 'COPILOT');
      return this.prepared(proposal);
    }

    if (/(غير متاح|وقف|عطل|disable|unavailable|enable|متاح)/i.test(text) && /(منتج|product|متاح|available)/i.test(text)) {
      const product = await this.findProduct(user.cafeId!, text);
      if (!product || !branchId) return this.clarification('Specify the existing product and one trusted branch for availability.');
      const isAvailable = !/(غير متاح|وقف|عطل|disable|unavailable)/i.test(text);
      const proposal = await this.prepare(user, {
        actionType: 'UPDATE_PRODUCT_AVAILABILITY', branchId, resourceId: product.id,
        proposedState: { isAvailable }, reason: ownerMessage, requestedText: ownerMessage,
      }, 'COPILOT');
      return this.prepared(proposal);
    }

    if ((text.includes('حد المخزون') || text.includes('minimum stock') || text.includes('threshold')) && /(غير|اجعل|set|update)/i.test(text)) {
      const item = await this.findInventory(user.cafeId!, text, branchId);
      const minThreshold = this.firstNumber(text);
      if (!item || !branchId || minThreshold == null) return this.clarification('Specify the inventory item, branch, and exact minimum stock level.');
      const proposal = await this.prepare(user, {
        actionType: 'UPDATE_MINIMUM_STOCK_LEVEL', branchId, resourceId: item.id,
        proposedState: { minThreshold }, reason: ownerMessage, requestedText: ownerMessage,
      }, 'COPILOT');
      return this.prepared(proposal);
    }

    if (/(مصروف|expense)/i.test(text) && /(سجل|انشئ|create|record)/i.test(text)) {
      const amount = this.firstNumber(text);
      const paymentMethod = /(كاش|cash)/i.test(text) ? 'CASH' : /(بطاقة|كارت|card)/i.test(text) ? 'CARD' : null;
      const category = this.expenseCategory(text);
      if (!branchId || amount == null || !paymentMethod || !category || text.length < 12) {
        return this.clarification('Expense proposals need branch, amount, category, payment method, date, and a clear description.');
      }
      const proposal = await this.prepare(user, {
        actionType: 'CREATE_APPROVED_EXPENSE', branchId,
        proposedState: { amount, category, paymentMethod, expenseDate: new Date().toISOString(), description: ownerMessage.trim() },
        reason: ownerMessage, requestedText: ownerMessage,
      }, 'COPILOT');
      return this.prepared(proposal);
    }

    if (/(عرض|خصم|offer|combo)/i.test(text)) {
      const product = await this.findProduct(user.cafeId!, text);
      const discountPercent = this.firstNumber(text);
      if (!product || !branchId || discountPercent == null) return this.clarification('Specify a verified product, branch, and exact discount for the offer draft.');
      const proposedPrice = round(Number(product.price) * (1 - discountPercent / 100));
      const proposal = await this.prepare(user, {
        actionType: 'CREATE_OFFER_DRAFT', branchId, resourceId: product.id,
        proposedState: { name: `Offer for ${product.name}`, productIds: [product.id], discountPercent, proposedPrice },
        reason: ownerMessage, requestedText: ownerMessage,
      }, 'COPILOT');
      return this.prepared(proposal, 'A draft was prepared only. Offer activation remains unavailable.');
    }

    if (/(حملة|campaign)/i.test(text)) {
      if (!branchId) return this.clarification('Specify one trusted branch for the campaign draft.');
      const proposal = await this.prepare(user, {
        actionType: 'CREATE_CAMPAIGN_DRAFT', branchId,
        proposedState: { name: 'Campaign draft', messagePreview: ownerMessage.trim(), channel: 'TELEGRAM', consentVerified: false },
        reason: ownerMessage, requestedText: ownerMessage,
      }, 'COPILOT');
      return this.prepared(proposal, 'Campaign draft only. No customer message was sent.');
    }

    if (/(restock|اعادة تخزين|إعادة تخزين|اشتري للمخزون)/i.test(text)) {
      const item = await this.findInventory(user.cafeId!, text, branchId);
      const quantity = this.firstNumber(text);
      if (!item || !branchId || quantity == null) return this.clarification('Specify the inventory item, branch, and proposed reorder quantity.');
      const proposal = await this.prepare(user, {
        actionType: 'CREATE_RESTOCK_PROPOSAL', branchId, resourceId: item.id,
        proposedState: { quantity }, reason: ownerMessage, requestedText: ownerMessage,
      }, 'COPILOT');
      return this.prepared(proposal, 'Restock proposal only. Stock was not changed.');
    }

    this.metrics.blockedRequests += 1;
    return { handled: true, blocked: true, message: 'This write request is not in the current Stage 6 allowlist or needs more exact details.', warnings: ['No proposal and no business write were created.'] };
  }

  getMetricsSnapshot() {
    return {
      ...this.metrics,
      averageApprovalTimeMs: this.metrics.approvalCount ? Math.round(this.metrics.totalApprovalTimeMs / this.metrics.approvalCount) : 0,
    };
  }

  private async prepareInternal(
    user: OwnerActionUser,
    dto: CreateOwnerActionProposalDto,
    source: OwnerActionChannel,
    version: number,
    revisionOf?: string,
  ): Promise<OwnerActionProposal> {
    const branchIds = dto.branchId ? [dto.branchId] : [];
    this.assertPolicy(user, dto.actionType, branchIds, false);
    const definition = this.policy.definition(dto.actionType);
    if (definition.unsupportedReason) throw new UnprocessableEntityException(definition.unsupportedReason);
    const proposedState = this.normalizeProposedState(dto.actionType, dto.proposedState);
    const snapshot = await this.reader.snapshot(dto.actionType, user.cafeId!, branchIds, dto.resourceId, proposedState);
    this.assertMeaningfulChange(dto.actionType, snapshot.currentState, proposedState);
    const createdAt = Date.now();
    const proposal = this.store.create({
      revisionOf,
      version,
      actionType: dto.actionType,
      status: definition.executable ? 'AWAITING_APPROVAL' : 'DRAFT',
      riskLevel: definition.risk,
      reversibility: definition.reversibility,
      cafeId: user.cafeId!,
      branchIds,
      branchNames: snapshot.branchNames,
      createdBy: user.id,
      createdByRole: user.role,
      resource: snapshot.resource,
      currentState: snapshot.currentState,
      proposedState,
      expectedStateHash: hashOwnerActionState(snapshot.currentState),
      impact: snapshot.impact,
      warnings: snapshot.warnings,
      reason: dto.reason.trim(),
      requestedText: this.sanitizeRequestedText(dto.requestedText),
      source,
      expiresAt: new Date(createdAt + this.policy.expiryMs(definition.risk)).toISOString(),
    });
    this.metrics.proposalsCreated += 1;
    this.metrics.byActionType[dto.actionType] = (this.metrics.byActionType[dto.actionType] ?? 0) + 1;
    this.metrics.byRiskLevel[definition.risk] = (this.metrics.byRiskLevel[definition.risk] ?? 0) + 1;
    await this.audit.log({
      cafeId: proposal.cafeId,
      action: 'OWNER_ACTION_PROPOSED',
      entityType: proposal.resource.type,
      entityId: proposal.resource.id,
      actorId: user.id,
      actorRole: user.role as any,
      beforeState: proposal.currentState,
      afterState: proposal.proposedState,
      metadata: this.auditMetadata(proposal, {
        permissionResult: 'ALLOWED',
        executionTool: definition.tool ?? 'DRAFT_ONLY',
        dryRun: true,
      }),
    });
    return proposal;
  }

  private normalizeProposedState(actionType: OwnerActionType, input: Record<string, unknown>): Record<string, unknown> {
    switch (actionType) {
      case 'UPDATE_PRODUCT_PRICE': {
        const price = this.finiteNumber(input.price, 'price');
        if (price <= 0 || price > 1_000_000) throw new BadRequestException('Price is outside the supported range.');
        return { price: round(price) };
      }
      case 'UPDATE_PRODUCT_AVAILABILITY':
        if (typeof input.isAvailable !== 'boolean') throw new BadRequestException('isAvailable must be boolean.');
        return { isAvailable: input.isAvailable };
      case 'DISABLE_PRODUCT': return { active: false };
      case 'ENABLE_PRODUCT': return { active: true };
      case 'UPDATE_MINIMUM_STOCK_LEVEL': {
        const minThreshold = this.finiteNumber(input.minThreshold, 'minThreshold');
        if (minThreshold < 0 || minThreshold > 10_000_000) throw new BadRequestException('Minimum stock level is outside the supported range.');
        return { minThreshold: round(minThreshold) };
      }
      case 'CREATE_APPROVED_EXPENSE':
      case 'CREATE_EXPENSE_DRAFT': {
        const amount = this.finiteNumber(input.amount, 'amount');
        const category = String(input.category || '').trim();
        const description = String(input.description || '').trim();
        const paymentMethod = String(input.paymentMethod || '').trim().toUpperCase();
        const expenseDate = new Date(String(input.expenseDate || ''));
        if (amount <= 0 || !category || description.length < 4 || !['CASH', 'CARD', 'BANK_TRANSFER'].includes(paymentMethod) || Number.isNaN(expenseDate.getTime())) {
          throw new BadRequestException('Expense requires a positive amount, category, description, valid date, and payment method.');
        }
        return { amount: round(amount), category, description, paymentMethod, expenseDate: expenseDate.toISOString(), reference: input.reference ? String(input.reference).slice(0, 120) : undefined };
      }
      case 'CREATE_RESTOCK_PROPOSAL':
      case 'CREATE_PURCHASE_ORDER_DRAFT': {
        const quantity = this.finiteNumber(input.quantity, 'quantity');
        if (quantity <= 0) throw new BadRequestException('Proposed quantity must be positive.');
        return { ...input, quantity: round(quantity) };
      }
      case 'CREATE_OFFER_DRAFT': {
        const discountPercent = this.finiteNumber(input.discountPercent, 'discountPercent');
        const proposedPrice = this.finiteNumber(input.proposedPrice, 'proposedPrice');
        if (!Array.isArray(input.productIds) || !input.productIds.length || discountPercent <= 0 || discountPercent >= 100 || proposedPrice <= 0) {
          throw new BadRequestException('Offer draft requires verified products, a valid discount, and positive proposed price.');
        }
        return { name: String(input.name || 'Offer draft').slice(0, 120), productIds: input.productIds.map(String), discountPercent: round(discountPercent), proposedPrice: round(proposedPrice) };
      }
      default:
        return JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
    }
  }

  private assertMeaningfulChange(actionType: OwnerActionType, current: Record<string, unknown>, proposed: Record<string, unknown>): void {
    const keys: Partial<Record<OwnerActionType, string>> = {
      UPDATE_PRODUCT_PRICE: 'price',
      UPDATE_PRODUCT_AVAILABILITY: 'isAvailable',
      DISABLE_PRODUCT: 'active',
      ENABLE_PRODUCT: 'active',
      UPDATE_MINIMUM_STOCK_LEVEL: 'minThreshold',
    };
    const key = keys[actionType];
    if (key && current[key] === proposed[key]) throw new BadRequestException('The proposal would not change the current value.');
    if (actionType === 'CREATE_APPROVED_EXPENSE' && current.duplicateExpenseId) {
      throw new ConflictException('A matching expense already exists. Create a reviewed correction instead of a duplicate.');
    }
  }

  private assertExactApproval(proposal: OwnerActionProposal, dto: ApproveOwnerActionDto): void {
    const text = dto.approvalText.trim().replace(/\s+/g, ' ');
    const code = escapeRegExp(proposal.proposalId);
    const exact = new RegExp(`^(?:APPROVE ${code}|EXECUTE ${code}|نفذ ${code}|أوافق على (?:المقترح )?${code})$`, 'i');
    if (!exact.test(text)) throw new BadRequestException(`Explicit approval must reference exactly ${proposal.proposalId}.`);
    if (proposal.riskLevel === 'HIGH' && dto.confirmationCode?.trim().toUpperCase() !== proposal.proposalId) {
      throw new BadRequestException(`High-risk approval requires typing proposal code ${proposal.proposalId}.`);
    }
  }

  private assertPolicy(user: OwnerActionUser, actionType: OwnerActionType, branchIds: string[], executable: boolean): void {
    try {
      this.policy.assertCanPrepare(user, actionType, branchIds);
      if (executable) this.policy.assertExecutable(actionType);
    } catch (error) {
      this.metrics.permissionDenials += 1;
      throw error;
    }
  }

  private assertSameOwner(user: OwnerActionUser, proposal: OwnerActionProposal): void {
    if (proposal.createdBy !== user.id) {
      this.metrics.permissionDenials += 1;
      throw new ForbiddenException('Only the authenticated owner who created this proposal may decide it.');
    }
  }

  private requireUser(user: OwnerActionUser | null | undefined): OwnerActionUser {
    if (!user?.id || !user.cafeId) throw new UnauthorizedException('Authenticated cafe user required.');
    if (!['OWNER', 'MANAGER'].includes(user.role)) throw new ForbiddenException('Owner action access is restricted to owner and assigned manager roles.');
    return user;
  }

  private async auditOutcome(proposal: OwnerActionProposal, action: any, user: OwnerActionUser, extra: Record<string, unknown>): Promise<void> {
    await this.audit.log({
      cafeId: proposal.cafeId,
      action,
      entityType: proposal.resource.type,
      entityId: proposal.resource.id,
      actorId: user.id,
      actorRole: user.role as any,
      beforeState: proposal.currentState,
      afterState: proposal.proposedState,
      metadata: this.auditMetadata(proposal, extra),
    });
  }

  private auditMetadata(proposal: OwnerActionProposal, extra: Record<string, unknown>): Record<string, unknown> {
    return {
      proposalId: proposal.proposalId,
      proposalVersion: proposal.version,
      actionType: proposal.actionType,
      ownerUserId: proposal.createdBy,
      role: proposal.createdByRole,
      cafeId: proposal.cafeId,
      branchIds: proposal.branchIds,
      requestedIntent: proposal.requestedText,
      riskLevel: proposal.riskLevel,
      approvalTime: proposal.approvedAt,
      approvalChannel: proposal.approvalChannel,
      expiresAt: proposal.expiresAt,
      modelVersion: 'sonex-owner-actions-v1',
      promptVersion: 'stage-6-v1',
      ...extra,
    };
  }

  private idempotencyKey(proposal: OwnerActionProposal): string {
    return `owner-action:${proposal.cafeId}:${proposal.proposalId}:${proposal.actionType}:v${proposal.version}`;
  }

  private refreshStaleProposal(user: OwnerActionUser, previous: OwnerActionProposal): Promise<OwnerActionProposal> {
    return this.prepareInternal(user, {
      actionType: previous.actionType,
      branchId: previous.branchIds[0],
      resourceId: previous.resource.id,
      proposedState: previous.proposedState,
      reason: `Refreshed after ${previous.status.toLowerCase()}: ${previous.reason}`.slice(0, 500),
      requestedText: previous.requestedText,
    }, previous.source, previous.version + 1, previous.proposalId);
  }

  private financialImpact(proposal: OwnerActionProposal): number {
    if (proposal.actionType === 'UPDATE_PRODUCT_PRICE') {
      return Math.abs(Number(proposal.proposedState.price) - Number(proposal.currentState.price));
    }
    if (proposal.actionType === 'CREATE_APPROVED_EXPENSE') return Number(proposal.proposedState.amount) || 0;
    return 0;
  }

  private sanitizeRequestedText(value?: string): string | undefined {
    if (!value) return undefined;
    return value.trim()
      .replace(/(bearer\s+)[\w.-]+/gi, '$1[REDACTED]')
      .replace(/((?:password|secret|token|كلمة مرور|توكن)\s*[:=]?\s*)\S+/gi, '$1[REDACTED]')
      .slice(0, 1000);
  }

  private async findProduct(cafeId: string, text: string): Promise<{ id: string; name: string; price: unknown } | null> {
    const products = await this.prisma.product.findMany({ where: { cafeId }, select: { id: true, name: true, price: true } });
    const normalized = this.normalizeText(text);
    return products
      .filter((product) => normalized.includes(this.normalizeText(product.name)))
      .sort((a, b) => b.name.length - a.name.length)[0] ?? null;
  }

  private async findInventory(cafeId: string, text: string, branchId?: string): Promise<{ id: string; itemName: string } | null> {
    const items = await this.prisma.inventory.findMany({
      where: { cafeId, ...(branchId ? { branchId } : {}) },
      select: { id: true, itemName: true },
    });
    const normalized = this.normalizeText(text);
    return items
      .filter((item) => normalized.includes(this.normalizeText(item.itemName)))
      .sort((a, b) => b.itemName.length - a.itemName.length)[0] ?? null;
  }

  private normalizeText(value: string): string {
    const digits: Record<string, string> = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
    return value.toLowerCase().replace(/[٠-٩]/g, (digit) => digits[digit]).replace(/[ًٌٍَُِّْـ]/g, '').replace(/\s+/g, ' ').trim();
  }

  private firstNumber(text: string): number | null {
    const match = this.normalizeText(text).match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  private expenseCategory(text: string): string | null {
    const categories = ['كهرباء', 'مياه', 'ايجار', 'إيجار', 'صيانة', 'نقل', 'تسويق', 'مواد خام', 'rent', 'utilities', 'maintenance', 'transport', 'marketing'];
    return categories.find((category) => text.includes(this.normalizeText(category))) ?? null;
  }

  private finiteNumber(value: unknown, field: string): number {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new BadRequestException(`${field} must be a finite number.`);
    return number;
  }

  private clarification(message: string): NaturalActionPreparation {
    return { handled: true, blocked: true, message, warnings: ['No proposal and no business write were created.'] };
  }

  private prepared(proposal: OwnerActionProposal, message?: string): NaturalActionPreparation {
    return {
      handled: true,
      blocked: false,
      message: message || `Prepared ${proposal.proposalId}. Review the exact changes and approve only this proposal. No business data changed yet.`,
      warnings: proposal.warnings,
      proposal,
    };
  }

  private safeError(error: unknown): string {
    return error instanceof Error ? error.message.slice(0, 500) : 'Unknown execution failure';
  }
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
