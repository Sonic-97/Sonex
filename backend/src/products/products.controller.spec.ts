import { ProductsController } from './products.controller';

describe('ProductsController', () => {
  let controller: ProductsController;

  beforeEach(() => {
    controller = new ProductsController({} as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});




