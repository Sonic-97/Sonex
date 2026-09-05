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
      case 'CREATE_PRODUCT_WITH_RECIPE': {
        const branchId = proposal.branchIds[0];
        const name = String(proposal.proposedState.name);
        const price = new Prisma.Decimal(Number(proposal.proposedState.price || 0));
        const cost = new Prisma.Decimal(Number(proposal.proposedState.cost || 0));
        const categoryName = String(proposal.proposedState.categoryName || 'مشروبات');
        const ingredients = Array.isArray(proposal.proposedState.ingredients) ? proposal.proposedState.ingredients : [];

        let category = await tx.productCategory.findFirst({
          where: { cafeId: proposal.cafeId, name: { equals: categoryName, mode: 'insensitive' } },
        });
        if (!category) {
          category = await tx.productCategory.create({
            data: {
              cafeId: proposal.cafeId,
              name: categoryName,
              sortOrder: 0,
            },
          });
        }

        const product = await tx.product.create({
          data: {
            cafeId: proposal.cafeId,
            branchId: branchId || null,
            categoryId: category.id,
            name,
            price,
            cost,
            active: true,
          } as any,
        });

        const createdRecipeIngredientIds: string[] = [];
        for (const ing of ingredients) {
          let invItem = await tx.inventory.findFirst({
            where: {
              cafeId: proposal.cafeId,
              branchId: branchId || undefined,
              itemName: { equals: ing.name, mode: 'insensitive' },
            },
          });
          if (!invItem && branchId) {
            invItem = await tx.inventory.create({
              data: {
                cafeId: proposal.cafeId,
                branchId,
                itemName: ing.name,
                unit: ing.unit || 'g',
                currentQty: new Prisma.Decimal(0),
                minThreshold: new Prisma.Decimal(10),
                costPerUnit: new Prisma.Decimal(0),
              },
            });
          }

          if (invItem) {
            const recipeIng = await tx.recipeIngredient.create({
              data: {
                cafeId: proposal.cafeId,
                productId: product.id,
                inventoryId: invItem.id,
                quantity: new Prisma.Decimal(Number(ing.quantity || 1)),
                unit: ing.unit || invItem.unit || 'g',
              } as any,
            });
            createdRecipeIngredientIds.push(recipeIng.id);
          }
        }

        return {
          verifiedState: {
            productId: product.id,
            name: product.name,
            price: Number(product.price),
            cost: Number(product.cost),
            categoryId: category.id,
            categoryName: category.name,
            recipeIngredientsCount: createdRecipeIngredientIds.length,
          },
          affectedRecordIds: [product.id, ...createdRecipeIngredientIds],
          rollback: { supported: true, metadata: { productId: product.id } },
        };
      }
      case 'RECORD_INVENTORY_PURCHASE': {
        const branchId = proposal.branchIds[0];
        const items = Array.isArray(proposal.proposedState.items) ? proposal.proposedState.items : [];
        const totalAmount = new Prisma.Decimal(Number(proposal.proposedState.totalAmount || 0));
        const paymentMethod = String(proposal.proposedState.paymentMethod || 'CASH');
        const affectedRecordIds: string[] = [];

        for (const itm of items) {
          let invItem = await tx.inventory.findFirst({
            where: {
              cafeId: proposal.cafeId,
              branchId,
              itemName: { equals: itm.name, mode: 'insensitive' },
            },
          });
          const qty = Number(itm.quantity || 0);
          const unitPrice = Number(itm.unitPrice || 0);

          if (!invItem) {
            invItem = await tx.inventory.create({
              data: {
                cafeId: proposal.cafeId,
                branchId,
                itemName: itm.name,
                unit: itm.unit || 'piece',
                currentQty: new Prisma.Decimal(qty),
                minThreshold: new Prisma.Decimal(5),
                costPerUnit: new Prisma.Decimal(unitPrice),
              },
            });
          } else {
            invItem = await tx.inventory.update({
              where: { id: invItem.id },
              data: {
                currentQty: { increment: qty },
                costPerUnit: unitPrice > 0 ? new Prisma.Decimal(unitPrice) : undefined,
                version: { increment: 1 },
              },
            });
          }
          affectedRecordIds.push(invItem.id);

          const ledger = await tx.stockLedger.create({
            data: {
              cafeId: proposal.cafeId,
              inventoryId: invItem.id,
              change: new Prisma.Decimal(qty),
              balanceBefore: new Prisma.Decimal(Number(invItem.currentQty) - qty),
              balanceAfter: invItem.currentQty,
              reservedBefore: new Prisma.Decimal(0),
              reservedAfter: new Prisma.Decimal(0),
              reason: `AI Restock: ${itm.name} (+${qty} ${invItem.unit})`,
            } as any,
          });
          affectedRecordIds.push(ledger.id);
        }

        let expenseId: string | null = null;
        if (Number(totalAmount) > 0) {
          const expense = await tx.expense.create({
            data: {
              cafeId: proposal.cafeId,
              branchId,
              category: 'مشتريات مخزن وبضاعة',
              amount: totalAmount,
              description: `مشتريات مخزن: ${items.map((i: any) => `${i.name} (${i.quantity} ${i.unit || ''})`).join(', ')}`,
              expenseDate: new Date(),
              expenseType: paymentMethod,
            } as any,
          });
          expenseId = expense.id;
          affectedRecordIds.push(expense.id);
        }

        return {
          verifiedState: {
            itemsCount: items.length,
            totalAmount: Number(totalAmount),
            paymentMethod,
            expenseId,
          },
          affectedRecordIds,
          rollback: { supported: false, metadata: { correctionRequired: true } },
        };
      }
      case 'RECORD_STOCK_WASTE': {
        const branchId = proposal.branchIds[0];
        const itemName = String(proposal.proposedState.itemName || '').trim();
        const quantity = Number(proposal.proposedState.quantity || 0);
        const reason = String(proposal.proposedState.reason || 'هالك / عجز مخزون');
        const affectedRecordIds: string[] = [];

        let invItem = await tx.inventory.findFirst({
          where: {
            cafeId: proposal.cafeId,
            ...(branchId ? { branchId } : {}),
            itemName: { equals: itemName, mode: 'insensitive' },
          },
        });

        if (!invItem && proposal.resource.id) {
          invItem = await tx.inventory.findFirst({
            where: {
              id: proposal.resource.id,
              cafeId: proposal.cafeId,
            },
          });
        }

        if (!invItem && branchId) {
          invItem = await tx.inventory.create({
            data: {
              cafeId: proposal.cafeId,
              branchId,
              itemName,
              unit: String(proposal.proposedState.unit || 'piece'),
              currentQty: new Prisma.Decimal(0),
              minThreshold: new Prisma.Decimal(5),
              costPerUnit: new Prisma.Decimal(0),
            },
          });
        }

        if (!invItem) {
          throw new Error(`Inventory item "${itemName}" not found to record waste.`);
        }

        const balanceBefore = Number(invItem.currentQty);
        const balanceAfter = Math.max(0, balanceBefore - quantity);
        const actualDeduction = balanceBefore - balanceAfter;

        const updatedInv = await tx.inventory.update({
          where: { id: invItem.id },
          data: {
            currentQty: new Prisma.Decimal(balanceAfter),
            version: { increment: 1 },
          },
        });
        affectedRecordIds.push(updatedInv.id);

        const ledger = await tx.stockLedger.create({
          data: {
            cafeId: proposal.cafeId,
            inventoryId: invItem.id,
            change: new Prisma.Decimal(-quantity),
            balanceBefore: new Prisma.Decimal(balanceBefore),
            balanceAfter: new Prisma.Decimal(balanceAfter),
            reservedBefore: new Prisma.Decimal(0),
            reservedAfter: new Prisma.Decimal(0),
            reason: `AI Waste: ${reason} (-${quantity} ${invItem.unit})`,
          } as any,
        });
        affectedRecordIds.push(ledger.id);

        return {
          verifiedState: {
            inventoryId: invItem.id,
            itemName: invItem.itemName,
            quantityWasted: quantity,
            balanceBefore,
            balanceAfter,
            reason,
          },
          affectedRecordIds,
          rollback: { supported: true, metadata: { inventoryId: invItem.id, restoredQty: quantity } },
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
      CREATE_PRODUCT_WITH_RECIPE: 'createApprovedProductWithRecipe',
      RECORD_INVENTORY_PURCHASE: 'recordApprovedInventoryPurchase',
      RECORD_STOCK_WASTE: 'recordApprovedStockWaste',
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

