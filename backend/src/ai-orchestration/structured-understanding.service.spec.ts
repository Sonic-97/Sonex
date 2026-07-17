import { CoffeeAttributeExtractor } from '../coffee-order/coffee-attribute-extractor';
import { StructuredUnderstandingService } from './structured-understanding.service';

describe('StructuredUnderstandingService', () => {
  const service = new StructuredUnderstandingService(new CoffeeAttributeExtractor());
  it('collects all coffee attributes before asking another question', () => {
    const result = service.analyze('قهوة فاتح سادة زيادة', 'AWAITING_ORDER');
    expect(result.entities.coffee).toMatchObject({ roast: 'LIGHT', blend: 'PLAIN', sugar: 'EXTRA_SUGAR' });
    expect(result.missingFields).toEqual([]);
  });
  it('interprets no contextually for blend and sugar', () => {
    expect(service.analyze('لا', 'AWAITING_COFFEE_BLEND').entities.coffee?.blend).toBe('PLAIN');
    expect(service.analyze('لا', 'AWAITING_SUGAR').entities.coffee?.sugar).toBe('NO_SUGAR');
  });
  it('does not treat no after confirmation as cancellation', () => {
    const result = service.analyze('لا', 'AWAITING_CONFIRMATION');
    expect(result.intent).toBe('REJECT_CONFIRMATION'); expect(result.cancellation).toBe(false);
  });
  it('requires an explicit cancellation phrase', () => expect(service.analyze('الغى الطلب', 'AWAITING_CONFIRMATION').intent).toBe('CANCEL_ORDER'));
});
