import { RecipeBOM } from '../recipe-bom.entity';

export interface IRecipeBOMRepository {
  findByProductId(productId: string): Promise<RecipeBOM[]>;
  save(bom: RecipeBOM): Promise<RecipeBOM>;
  delete(id: string): Promise<void>;
}
