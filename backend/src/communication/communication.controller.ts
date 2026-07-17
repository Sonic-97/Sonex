import { Controller, Post, Body, Logger, BadRequestException } from '@nestjs/common';
import { CommunicationService } from './communication.service';
import { Public } from '../auth/decorators';
import { normalizeWebhookPayload, NormalizedWhatsAppMessage } from './dto/whatsapp-webhook.dto';

@Controller('communication')
export class CommunicationController {
  private readonly logger = new Logger(CommunicationController.name);

  constructor(
    private readonly communicationService: CommunicationService
  ) {}

  @Public()
  @Post('webhook/whatsapp')
  receiveMessage(@Body() body: any) {
    const normalized = normalizeWebhookPayload(body);
    if (!normalized) {
      this.logger.warn('Unrecognized webhook payload format — processing raw');
      const useAsync = process.env.FEATURE_ASYNC === 'true';
      if (useAsync) return this.communicationService.handleMessage(body);
      return this.communicationService.handleMessageLegacy(body);
    }

    this.logger.log(`Webhook received: source=${normalized.source} msgId=${normalized.messageId} from=${normalized.from}`);
    return this.communicationService.handleNormalized(normalized);
  }

}




