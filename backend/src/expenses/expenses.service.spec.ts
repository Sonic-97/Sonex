import { ExpensesService } from './expenses.service';

describe('ExpensesService', () => {
  let service: ExpensesService;

  beforeEach(() => {
    service = new ExpensesService({} as any, {} as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});




