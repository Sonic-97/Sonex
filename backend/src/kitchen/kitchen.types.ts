import { domainId, type AggregateId } from '../shared-kernel';
export type KitchenTicketId = AggregateId<'KitchenTicketId'>; export type ProductionJobId = AggregateId<'ProductionJobId'>; export type PreparationTaskId = AggregateId<'PreparationTaskId'>;
export const kitchenTicketId = (value: string): KitchenTicketId => domainId('KitchenTicketId', value); export const productionJobId = (value: string): ProductionJobId => domainId('ProductionJobId', value); export const preparationTaskId = (value: string): PreparationTaskId => domainId('PreparationTaskId', value);
