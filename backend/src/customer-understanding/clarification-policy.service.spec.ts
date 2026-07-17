import { ClarificationPolicyService } from './clarification-policy.service';
import { emptyCustomerNeed } from './customer-need.types';

describe('ClarificationPolicyService', () => {
  const service = new ClarificationPolicyService();

  it('asks only one question at a time', () => {
    const question = service.nextQuestion(emptyCustomerNeed(), 0);
    expect(question).toEqual({ field: 'requestType', question: 'تحب مشروب ولا أكل؟' });
    expect((question!.question.match(/[?؟]/g) || []).length).toBe(1);
  });

  it('stops after two clarifications', () => {
    expect(service.nextQuestion(emptyCustomerNeed(), 2)).toBeNull();
  });

  it('does not ask a known temperature again', () => {
    const need = { ...emptyCustomerNeed(), primaryIntent: 'ENERGY_REQUEST' as const, temperature: 'COLD' as const, confidenceLevel: 'HIGH' as const };
    expect(service.nextQuestion(need, 0)?.field).not.toBe('temperature');
  });

  it('asks temperature for a guided energy request', () => {
    const need = { ...emptyCustomerNeed(), primaryIntent: 'ENERGY_REQUEST' as const, confidenceLevel: 'HIGH' as const };
    expect(service.nextQuestion(need, 0)?.field).toBe('temperature');
  });

  it('morning fast mode skips the temperature question', () => {
    const need = { ...emptyCustomerNeed(), primaryIntent: 'ENERGY_REQUEST' as const, confidenceLevel: 'HIGH' as const, morningFastMode: true };
    expect(service.nextQuestion(need, 0)).toBeNull();
  });

  it('urgent mode skips optional questions', () => {
    const need = { ...emptyCustomerNeed(), primaryIntent: 'ENERGY_REQUEST' as const, confidenceLevel: 'HIGH' as const, urgency: 'IMMEDIATE' as const };
    expect(service.nextQuestion(need, 0)).toBeNull();
  });

  it('asks for a scheduled time when missing', () => {
    const need = { ...emptyCustomerNeed(), primaryIntent: 'SCHEDULED_ORDER' as const, confidenceLevel: 'HIGH' as const };
    expect(service.nextQuestion(need, 0)?.field).toBe('scheduledFor');
  });

  it('asks for group size when missing', () => {
    const need = { ...emptyCustomerNeed(), primaryIntent: 'GROUP_ORDER_REQUEST' as const, confidenceLevel: 'HIGH' as const };
    expect(service.nextQuestion(need, 0)?.field).toBe('groupSize');
  });

  it('does not clarify a complaint into an upsell', () => {
    const need = { ...emptyCustomerNeed(), primaryIntent: 'COMPLAINT' as const };
    expect(service.nextQuestion(need, 0)).toBeNull();
  });
});
