import { Injectable } from '@nestjs/common';
import { Attachment, ChannelType } from '../interfaces/types';

@Injectable()
export class AttachmentResolver {
  async download(attachment: Attachment, channelType: ChannelType): Promise<Buffer> {
    if (attachment.data) {
      return attachment.data;
    }

    if (attachment.url) {
      return this.downloadFromUrl(attachment.url);
    }

    throw new Error(`Cannot download attachment ${attachment.id}: no data or url available`);
  }

  private async downloadFromUrl(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download attachment: HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async getMetadata(attachment: Attachment): Promise<{ mimeType: string; size?: number }> {
    const result: { mimeType: string; size?: number } = {
      mimeType: attachment.mimeType || 'application/octet-stream',
    };

    if (attachment.data) {
      result.size = attachment.data.length;
    }

    return result;
  }

  async processAttachment(attachment: Attachment, channelType: ChannelType): Promise<{ buffer: Buffer; text?: string; mimeType: string }> {
    const buffer = await this.download(attachment, channelType);
    const mimeType = attachment.mimeType || 'application/octet-stream';

    if (mimeType.startsWith('text/') || mimeType === 'application/json') {
      return { buffer, text: buffer.toString('utf-8'), mimeType };
    }

    return { buffer, mimeType };
  }
}
