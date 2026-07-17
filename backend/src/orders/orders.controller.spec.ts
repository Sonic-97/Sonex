import { OrdersController } from './orders.controller';

describe('OrdersController', () => {
  let controller: OrdersController;

  beforeEach(() => {
    controller = new OrdersController({} as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});




