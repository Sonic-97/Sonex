import { ExpensesController } from './expenses.controller';

describe('ExpensesController', () => {
  let controller: ExpensesController;

  beforeEach(() => {
    controller = new ExpensesController({} as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});




