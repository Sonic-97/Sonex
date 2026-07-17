import { CommunicationController } from './communication.controller';

describe('CommunicationController', () => {
  let controller: CommunicationController;

  beforeEach(() => {
    controller = new CommunicationController({} as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});




