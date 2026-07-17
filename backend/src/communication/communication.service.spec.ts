import { CommunicationService } from './communication.service';

describe('CommunicationService', () => {
  let service: CommunicationService;

  beforeEach(() => {
    service = new CommunicationService(
      {} as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, {} as any,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});




