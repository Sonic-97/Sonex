import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEventTypes } from '../domain-event.registry';
import { DomainEvent, DomainEventHandler } from '../domain-event.interface';
import { InventoryService } from '../../inventory/inventory.service';
import { InventoryPipelineService } from '../../inventory-pipeline/inventory-pipeline.service';

@Injectable()
export class InventorySubscriber implements DomainEventHandler {
  private readonly logger = new Logger(InventorySubscriber.name);

  constructor(
    private readonly inventoryService: InventoryService,
    private readonly inventoryPipeline: InventoryPipelineService,
  ) {}

  supports(eventType: string): boolean {
    return [
      DomainEventTypes.ORDER_CREATED,
      DomainEventTypes.ORDER_CONFIRMED,
      DomainEventTypes.ORDER_CANCELLED,
      DomainEventTypes.ORDER_REFUNDED,
      DomainEventTypes.INVENTORY_REFILLED,
      DomainEventTypes.INVENTORY_LOW_STOCK,
      DomainEventTypes.RECIPE_UPDATED,
    ].includes(eventType as any);
  }

  async handle(event: DomainEvent): Promise<void> {
    this.logger.debug(`InventorySubscriber handling ${event.eventType}`);
  }

  @OnEvent(DomainEventTypes.ORDER_CONFIRMED)
  async onOrderConfirmed(event: DomainEvent<any>): Promise<void> {
    const { orderId, cafeId, branchId } = event.payload;
    this.logger.log(`Order ${orderId} confirmed — inventory deduction triggered at cafe ${cafeId}`);
  }

  @OnEvent(DomainEventTypes.ORDER_CANCELLED)
  async onOrderCancelled(event: DomainEvent<any>): Promise<void> {
    const { orderId, cafeId } = event.payload;
    this.logger.log(`Order ${orderId} cancelled — releasing inventory at cafe ${cafeId}`);
  }

  @OnEvent(DomainEventTypes.INVENTORY_REFILLED)
  async onInventoryRefilled(event: DomainEvent<any>): Promise<void> {
    const { inventoryId, itemName, cafeId, quantityAdded, newQuantity } = event.payload;
    this.logger.log(`Inventory ${itemName} refilled (+${quantityAdded}, now ${newQuantity}) at cafe ${cafeId}`);
  }

  @OnEvent(DomainEventTypes.INVENTORY_LOW_STOCK)
  async onLowStock(event: DomainEvent<any>): Promise<void> {
    const { itemName, cafeId, currentQty, threshold } = event.payload;
    this.logger.warn(`LOW STOCK: ${itemName} at cafe ${cafeId} (${currentQty}/${threshold})`);
  }

  @OnEvent(DomainEventTypes.RECIPE_UPDATED)
  async onRecipeUpdated(event: DomainEvent<any>): Promise<void> {
    const { productId, productName, cafeId } = event.payload;
    this.logger.log(`Recipe updated for ${productName} (${productId}) at cafe ${cafeId}`);
  }
}
