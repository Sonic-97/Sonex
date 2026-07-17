import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { hashOwnerActionState, OwnerActionReaderService } from './owner-action-reader.service';
import { OwnerActionExecution, OwnerActionProposal } from './owner-action.types';

export class OwnerActionStaleError extends Error {
  constructor(public readonly actualState: Record<string, unknown>) {
    super('Current data no longer matches the approved proposal.');
  }
}

@Injectable()
export class OwnerActionExecutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reader: OwnerActionReaderService,
    private readonly audit: AuditService,
  ) {}

  async execute(proposal: OwnerActionProposal, idempotencyKey: string): Promise<OwnerActionExecution> {
    return this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.processedMessage.findFirst({
        where: { source: 'OWNER_ACTION', idempotencyKey, cafeId: proposal.cafeId },
        select: { entityId: true, status: true },
      });
      if (duplicate?.status === 'completed') {
        return {
          executionId: duplicate.entityId || proposal.proposalId,
          idempotencyKey,
          tool: this.toolName(proposal),
          result: { proposalId: proposal.proposalId, duplicate: true },
          affectedRecordIds: [],
          verified: true,
          duplicate: true,
          executedAt: new Date().toISOString(),
        };
      }

      const fresh = await this.reader.snapshot(
        proposal.actionType,
        proposal.cafeId,
        proposal.branchIds,
        proposal.resource.id,
        proposal.proposedState,
        tx as any,
      );
      if (hashOwnerActionState(fresh.currentState) !== proposal.expectedStateHash) {
        throw new OwnerActionStaleError(fresh.currentState);
      }

      const actionResult = await this.runTypedTool(tx, proposal);
      const executionId = randomUUID();
      const executedAt = new Date().toISOString();

      await this.audit.logTransactional(tx, {
        cafeId: proposal.cafeId,
        action: 'OWNER_ACTION_EXECUTED',
        entityType: proposal.resource.type,
        entityId: actionResult.affectedRecordIds[0] ?? proposal.resource.id,
        actorId: proposal.createdBy,
        actorRole: proposal.createdByRole as any,
        beforeState: proposal.currentState,
        afterState: actionResult.verifiedState,
        idempotencyKey,
        metadata: {
          proposalId: proposal.proposalId,
          proposalVersion: proposal.version,
          actionType: proposal.actionType,
          branchIds: proposal.branchIds,
          riskLevel: proposal.riskLevel,
          approvalText: proposal.approvalText,
          approvalTime: proposal.approvedAt,
          approvalChannel: proposal.approvalChannel,
          permissionResult: 'ALLOWED',
          staleDataResult: 'CURRENT',
          executionTool: this.toolName(proposal),
          affectedRecordIds: actionResult.affectedRecordIds,
          modelVersion: 'sonex-owner-actions-v1',
          promptVersion: 'stage-6-v1',
        },
      });

      await tx.processedMessage.create({
        data: {
          cafeId: proposal.cafeId,
          source: 'OWNER_ACTION',
          idempotencyKey,
          entityType: proposal.actionType,
          entityId: executionId,
          status: 'completed',
          requestHash: hashOwnerActionState(proposal.proposedState),
          completedAt: new Date(executedAt),
        } as any,
      });

      return {
        executionId,
        idempotencyKey,
        tool: this.toolName(proposal),
        result: actionResult.verifiedState,
        affectedRecordIds: actionResult.affectedRecordIds,
        verified: true,
        duplicate: false,
        executedAt,
        rollback: actionResult.rollback,
        monitoring: this.monitoringPlan(proposal, executedAt),
      };
    });
  }

  private async runTypedTool(tx: Prisma.TransactionClient, proposal: OwnerActionProposal): Promise<{
    verifiedState: Record<string, unknown>;
    affectedRecordIds: string[];
    rollback: { supported: boolean; metadata?: Record<string, unknown> };
  }> {
    const productId = proposal.resource.id;
    switch (proposal.actionType) {
      case 'UPDATE_PRODUCT_PRICE': {
        const price = new Prisma.Decimal(Number(proposal.proposedState.price));
        if (proposal.currentState.scope === 'BRANCH') {
          const branchId = proposal.branchIds[0];
          const existingId = proposal.currentState.branchProductId as string | null;
          const branchProduct = existingId
            ? await tx.branchProduct.update({ where: { id: existingId }, data: { price: Number(price) } })
            : await tx.branchProduct.create({
              data: {
                cafeId: proposal.cafeId,
                branchId,
                productId: productId!,
                price: Number(price),
                isAvailable: proposal.currentState.branchProductAvailable ?? true,
              } as any,
            });
          await tx.priceChangeLog.create({
            data: {
              cafeId: proposal.cafeId,
              productId: productId!,
              oldPrice: new Prisma.Decimal(Number(proposal.currentState.price)),
              newPrice: price,
              reason: `Approved branch price change ${proposal.proposalId}`,
            } as any,
          });
          const verified = await tx.branchProduct.findFirst({ where: { id: branchProduct.id, cafeId: proposal.cafeId, branchId } });
          if (!verified || Number(verified.price) !== Number(price)) throw new Error('Price verification failed.');
          return {
            verifiedState: { price: Number(verified.price), scope: 'BRANCH', branchId },
            affectedRecordIds: [branchProduct.id],
            rollback: { supported: true, metadata: { price: proposal.currentState.price, branchProductId: branchProduct.id } },
          };
        }
        await tx.product.update({ where: { id: productId! }, data: { price } });
        await tx.priceChangeLog.create({
          data: {
            cafeId: proposal.cafeId,
            productId: productId!,
            oldPrice: new Prisma.Decimal(Number(proposal.currentState.price)),
            newPrice: price,
            reason: `Approved price change ${proposal.proposalId}`,
          } as any,
        });
        const verified = await tx.product.findFirst({ where: { id: productId, cafeId: proposal.cafeId }, select: { id: true, price: true } });
        if (!verified || Number(verified.price) !== Number(price)) throw new Error('Price verification failed.');
        return {
          verifiedState: { price: Number(verified.price), scope: 'GLOBAL' },
          affectedRecordIds: [verified.id],
          rollback: { supported: true, metadata: { price: proposal.currentState.price } },
        };
      }
      case 'UPDATE_PRODUCT_AVAILABILITY': {
        const branchId = proposal.branchIds[0];
        const isAvailable = Boolean(proposal.proposedState.isAvailable);
        const existingId = proposal.currentState.branchProductId as string | null;
        const record = existingId
          ? await tx.branchProduct.update({ where: { id: existingId }, data: { isAvailable } })
          : await tx.branchProduct.create({
            data: {
              cafeId: proposal.cafeId,
              branchId,
              productId: productId!,
              price: Number(proposal.currentState.branchPrice),
              isAvailable,
            } as any,
          });
        const verified = await tx.branchProduct.findFirst({ where: { id: record.id, cafeId: proposal.cafeId, branchId } });
        if (!verified || verified.isAvailable !== isAvailable) throw new Error('Availability verification failed.');
        return {
          verifiedState: { isAvailable: verified.isAvailable, branchId },
          affectedRecordIds: [verified.id],
          rollback: { supported: true, metadata: { isAvailable: proposal.currentState.isAvailable } },
        };
      }
      case 'DISABLE_PRODUCT':
      case 'ENABLE_PRODUCT': {
        const active = proposal.actionType === 'ENABLE_PRODUCT';
        await tx.product.update({ where: { id: productId! }, data: { active } });
        const verified = await tx.product.findFirst({ where: { id: productId, cafeId: proposal.cafeId }, select: { id: true, active: true } });
        if (!verified || verified.active !== active) throw new Error('Product status verification failed.');
        return {
          verifiedState: { active: verified.active },
          affectedRecordIds: [verified.id],
          rollback: { supported: true, metadata: { active: proposal.currentState.active } },
        };
      }
      case 'UPDATE_MINIMUM_STOCK_LEVEL': {
        const minThreshold = new Prisma.Decimal(Number(proposal.proposedState.minThreshold));
        await tx.inventory.update({
          where: { id: proposal.resource.id! },
          data: { minThreshold, version: { increment: 1 } },
        });
        const verified = await tx.inventory.findFirst({
          where: { id: proposal.resource.id, cafeId: proposal.cafeId, branchId: proposal.branchIds[0] },
          select: { id: true, minThreshold: true, currentQty: true, version: true },
        });
        if (!verified || Number(verified.minThreshold) !== Number(minThreshold)) throw new Error('Inventory threshold verification failed.');
        return {
          verifiedState: { minThreshold: Number(verified.minThreshold), currentQty: Number(verified.currentQty), version: verified.version },
          affectedRecordIds: [verified.id],
          rollback: { supported: true, metadata: { minThreshold: proposal.currentState.minThreshold } },
        };
      }
      case 'CREATE_APPROVED_EXPENSE': {
        const expense = await tx.expense.create({
          data: {
            cafeId: proposal.cafeId,
            branchId: proposal.branchIds[0],
            category: String(proposal.proposedState.category),
            amount: new Prisma.Decimal(Number(proposal.proposedState.amount)),
            description: String(proposal.proposedState.description),
            expenseDate: new Date(String(proposal.proposedState.expenseDate)),
            expenseType: String(proposal.proposedState.paymentMethod),
          } as any,
        });
        const verified = await tx.expense.findFirst({ where: { id: expense.id, cafeId: proposal.cafeId, branchId: proposal.branchIds[0] } });
        if (!verified || Number(verified.amount) !== Number(proposal.proposedState.amount)) throw new Error('Expense verification failed.');
        return {
          verifiedState: { id: verified.id, amount: Number(verified.amount), category: verified.category, expenseDate: verified.expenseDate },
          affectedRecordIds: [verified.id],
          rollback: { supported: false, metadata: { correctionRequired: true } },
        };
      }
      default:
        throw new Error(`No approved typed execution tool for ${proposal.actionType}.`);
    }
  }

  private toolName(proposal: OwnerActionProposal): string {
    return {
      UPDATE_PRODUCT_PRICE: 'updateApprovedProductPrice',
      UPDATE_PRODUCT_AVAILABILITY: 'updateApprovedProductAvailability',
      DISABLE_PRODUCT: 'disableApprovedProduct',
      ENABLE_PRODUCT: 'enableApprovedProduct',
      UPDATE_MINIMUM_STOCK_LEVEL: 'updateApprovedMinimumStockLevel',
      CREATE_APPROVED_EXPENSE: 'createApprovedExpense',
    }[proposal.actionType] || 'unsupported';
  }

  private monitoringPlan(proposal: OwnerActionProposal, executedAt: string) {
    const metrics = proposal.actionType === 'UPDATE_PRODUCT_PRICE'
      ? ['units sold', 'revenue', 'gross profit', 'complaints']
      : proposal.actionType === 'UPDATE_PRODUCT_AVAILABILITY'
        ? ['menu visibility', 'unavailable-item attempts', 'active order exceptions']
        : proposal.actionType === 'UPDATE_MINIMUM_STOCK_LEVEL'
          ? ['low-stock alerts', 'stockouts', 'waste']
          : ['expense reporting consistency'];
    return {
      metrics,
      reviewAfter: new Date(Date.parse(executedAt) + 7 * 24 * 60 * 60 * 1000).toISOString(),
      caveat: 'Compare with the Stage 5 baseline; do not claim causal impact without sufficient evidence.',
    };
  }
}

