import { Test, TestingModule } from '@nestjs/testing';
import { TelegramAdapterService } from './telegram-adapter.service';
import { TelegramMessageNormalizer } from './telegram-message-normalizer';
import { TelegramSessionService } from './telegram-session.service';
import { TelegramFormatter } from './telegram-formatter';
import { CommerceBrainService } from '../commerce-brain/commerce-brain.service';
import { ContextBuilderService } from '../commerce-brain/context-builder.service';
import { ActionPlannerService } from '../action-planner/action-planner.service';
import { ActionExecutorService } from '../action-executor/action-executor.service';
import { RawTelegramUpdate } from './telegram-message-normalizer';

function plainTextMessage(text: string): RawTelegramUpdate {
  return { message: { message_id: 1, from: { id: 123 }, chat: { id: 456 }, text, date: Math.floor(Date.now() / 1000) } };
}

function callbackUpdate(data: string): RawTelegramUpdate {
  return { callback_query: { id: 'cb1', from: { id: 123 }, message: { message_id: 1, chat: { id: 456 } }, data } };
}

describe('TelegramAdapterService', () => {
  let service: TelegramAdapterService;
  let contextBuilder: Record<string, jest.Mock>;
  let commerceBrain: Record<string, jest.Mock>;
  let planner: Record<string, jest.Mock>;
  let executor: Record<string, jest.Mock>;

  beforeEach(async () => {
    contextBuilder = { build: jest.fn().mockResolvedValue({ business: { workingNow: true }, catalog: { products: [] }, customer: { customerId: 'c1' } }) };
    commerceBrain = { decide: jest.fn().mockResolvedValue({ intent: 'ORDER', confidence: 0.95, nextAction: 'CREATE_ORDER', missingInformation: [], structuredReplyData: { bodyKey: 'order.created' }, extractedEntities: {}, reasoningCode: 'CONTINUE_CONVERSATION' }) };
    planner = { createPlan: jest.fn().mockReturnValue({ steps: [{ action: 'CreateOrder' }], blockingReasons: [], requiredConfirmation: false, intent: 'ORDER', planId: 'p1', estimatedExecution: '15min', priority: 'high' }) };
    executor = { execute: jest.fn().mockResolvedValue({ success: true, status: 'COMPLETED', steps: [{ stepId: 's1', action: 'CreateOrder', status: 'SUCCEEDED' }], rollbackSteps: [], executedAt: new Date().toISOString(), completedAt: new Date().toISOString(), planId: 'p1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramAdapterService, TelegramMessageNormalizer, TelegramSessionService, TelegramFormatter,
        { provide: ContextBuilderService, useValue: contextBuilder },
        { provide: CommerceBrainService, useValue: commerceBrain },
        { provide: ActionPlannerService, useValue: planner },
        { provide: ActionExecutorService, useValue: executor },
      ],
    }).compile();

    service = module.get(TelegramAdapterService);
  });

  it('handles simple text message and creates order', async () => {
    const response = await service.handleUpdate(plainTextMessage('عايز كابتشينو'), 'cafe-1');
    expect(response.text).toContain('تم');
    expect(contextBuilder.build).toHaveBeenCalledWith(expect.objectContaining({ cafeId: 'cafe-1', message: 'عايز كابتشينو' }));
    expect(commerceBrain.decide).toHaveBeenCalled();
    expect(planner.createPlan).toHaveBeenCalled();
    expect(executor.execute).toHaveBeenCalled();
  });

  it('handles callback button data', async () => {
    const response = await service.handleUpdate(callbackUpdate('menu:start'), 'cafe-1');
    expect(response.text).toBeDefined();
    expect(contextBuilder.build).toHaveBeenCalledWith(expect.objectContaining({ message: 'menu:start' }));
  });

  it('handles full create order flow', async () => {
    const response = await service.handleUpdate(plainTextMessage('طلب'), 'cafe-1');
    expect(response.text).toContain('تم');
    expect(executor.execute).toHaveBeenCalled();
  });

  it('handles modify order flow', async () => {
    commerceBrain.decide.mockResolvedValue({ intent: 'MODIFY_ORDER', confidence: 0.95, nextAction: 'MODIFY_ORDER', missingInformation: [], structuredReplyData: { bodyKey: 'order.updated' }, extractedEntities: {}, reasoningCode: 'CONTINUE_CONVERSATION' });
    planner.createPlan.mockReturnValue({ steps: [{ action: 'ModifyOrder' }], blockingReasons: [], requiredConfirmation: false, intent: 'MODIFY_ORDER', planId: 'p2', estimatedExecution: '5min', priority: 'high' });

    const response = await service.handleUpdate(plainTextMessage('تعديل الطلب'), 'cafe-1');
    expect(response.text).toContain('تم');
    expect(executor.execute).toHaveBeenCalled();
  });

  it('handles cancel flow with confirmation', async () => {
    commerceBrain.decide.mockResolvedValue({ intent: 'CANCEL_ORDER', confidence: 0.95, nextAction: 'CANCEL_ORDER', missingInformation: [], structuredReplyData: { bodyKey: 'order.cancelled' }, extractedEntities: {}, reasoningCode: 'CONTINUE_CONVERSATION' });
    planner.createPlan.mockReturnValue({ steps: [{ action: 'CancelOrder' }], blockingReasons: [], requiredConfirmation: true, intent: 'CANCEL_ORDER', planId: 'p3', estimatedExecution: '1min', priority: 'high' });

    const response = await service.handleUpdate(plainTextMessage('إلغاء الطلب'), 'cafe-1');
    expect(response.text).toContain('تأكيد');
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('returns clarification when information is missing', async () => {
    commerceBrain.decide.mockResolvedValue({ intent: 'ORDER', confidence: 0.5, nextAction: 'ASK_OPTION', missingInformation: [{ field: 'option', required: true, reason: 'يجب اختيار الحجم', choices: ['Small', 'Large'] }], structuredReplyData: { bodyKey: 'clarify.option' }, extractedEntities: {}, reasoningCode: 'OPTION_REQUIRED' });
    planner.createPlan.mockReturnValue({ steps: [{ action: 'AskForOption' }], blockingReasons: [{ type: 'MissingOptions', reason: 'يجب اختيار الحجم', severity: 'hard' }], requiredConfirmation: false, intent: 'ORDER', planId: 'p5', estimatedExecution: '0s', priority: 'low' });

    const response = await service.handleUpdate(plainTextMessage('كابتشينو'), 'cafe-1');
    expect(response.text).toContain('لا يمكن');
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('handles unknown command gracefully', async () => {
    const response = await service.handleUpdate(plainTextMessage('/unknown'), 'cafe-1');
    expect(response.text).toBeDefined();
  });

  it('handles backend failure gracefully', async () => {
    contextBuilder.build.mockRejectedValue(new Error('Database connection failed'));
    const response = await service.handleUpdate(plainTextMessage('عايز كابتشينو'), 'cafe-1');
    expect(response.text).toContain('خطأ');
  });

  it('handles duplicate update without error', async () => {
    const update = plainTextMessage('عايز كابتشينو');
    await service.handleUpdate(update, 'cafe-1');
    const response = await service.handleUpdate(update, 'cafe-1');
    expect(response.text).toBeDefined();
    expect(contextBuilder.build).toHaveBeenCalledTimes(2);
  });

  it('handles expired callback gracefully', async () => {
    const response = await service.handleUpdate(callbackUpdate('adapter:cancel'), 'cafe-1');
    expect(response.text).toBeDefined();
  });

  it('blocks when merchant is closed', async () => {
    contextBuilder.build.mockResolvedValue({ business: { workingNow: false }, catalog: { products: [] } });
    commerceBrain.decide.mockResolvedValue({ intent: 'SMALL_TALK', confidence: 0.95, nextAction: 'NO_ACTION', missingInformation: [], structuredReplyData: { bodyKey: 'business.closed' }, extractedEntities: {}, reasoningCode: 'BUSINESS_CLOSED' });
    planner.createPlan.mockReturnValue({ steps: [], blockingReasons: [{ type: 'BusinessClosed', reason: 'Business is currently closed', severity: 'hard' }], requiredConfirmation: false, intent: 'SMALL_TALK', planId: 'p4', estimatedExecution: '0s', priority: 'low' });

    const response = await service.handleUpdate(plainTextMessage('عايز كابتشينو'), 'cafe-1');
    expect(response.text).toContain('لا يمكن');
    expect(executor.execute).not.toHaveBeenCalled();
  });
});
