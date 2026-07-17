import { Module } from '@nestjs/common';
import { AdapterPlatformService } from './adapter-platform.service';
import { AdapterPlatformController } from './adapter-platform.controller';
import { MessageNormalizer } from './normalizer/message-normalizer.service';
import { MessageFormatter } from './formatter/message-formatter.service';
import { SessionResolver } from './session/session-resolver.service';
import { AttachmentResolver } from './attachment/attachment-resolver.service';
import { CapabilityProvider } from './capability/capability-provider.service';
import { WhatsAppAdapter } from './adapters/whatsapp/whatsapp.adapter';
import { WebChatAdapter } from './adapters/web-chat/web-chat.adapter';
import { MobileAdapter } from './adapters/mobile/mobile.adapter';

@Module({
  imports: [],
  controllers: [AdapterPlatformController],
  providers: [
    AdapterPlatformService,
    MessageNormalizer,
    MessageFormatter,
    SessionResolver,
    AttachmentResolver,
    CapabilityProvider,
    WhatsAppAdapter,
    WebChatAdapter,
    MobileAdapter,
  ],
  exports: [
    AdapterPlatformService,
    MessageNormalizer,
    MessageFormatter,
    SessionResolver,
    AttachmentResolver,
    CapabilityProvider,
    WhatsAppAdapter,
    WebChatAdapter,
    MobileAdapter,
  ],
})
export class AdapterPlatformModule {
  constructor(
    private readonly platform: AdapterPlatformService,
    private readonly whatsapp: WhatsAppAdapter,
    private readonly webChat: WebChatAdapter,
    private readonly mobile: MobileAdapter,
  ) {
    this.platform.registerAdapter(this.whatsapp);
    this.platform.registerAdapter(this.webChat);
    this.platform.registerAdapter(this.mobile);
  }
}
