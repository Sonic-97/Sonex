import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  let service: InventoryService;

  beforeEach(() => {
    service = new InventoryService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});




