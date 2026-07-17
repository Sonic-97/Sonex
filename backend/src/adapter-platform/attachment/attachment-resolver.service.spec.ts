import { Test, TestingModule } from '@nestjs/testing';
import { AttachmentResolver } from './attachment-resolver.service';
import { Attachment } from '../interfaces/types';

describe('AttachmentResolver', () => {
  let service: AttachmentResolver;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AttachmentResolver],
    }).compile();
    service = module.get<AttachmentResolver>(AttachmentResolver);
  });

  describe('download', () => {
    it('returns buffer when data is present', async () => {
      const attachment: Attachment = {
        id: 'att1',
        type: 'image',
        data: Buffer.from('fake-image-data'),
        mimeType: 'image/jpeg',
      };
      const buffer = await service.download(attachment, 'whatsapp');
      expect(buffer).toEqual(Buffer.from('fake-image-data'));
    });

    it('throws when no data or url', async () => {
      const attachment: Attachment = { id: 'att2', type: 'document' };
      await expect(service.download(attachment, 'web_chat')).rejects.toThrow('Cannot download attachment att2');
    });
  });

  describe('getMetadata', () => {
    it('returns mimeType and size when buffer present', async () => {
      const attachment: Attachment = {
        id: 'att3',
        type: 'image',
        data: Buffer.from('data'),
        mimeType: 'image/png',
      };
      const meta = await service.getMetadata(attachment);
      expect(meta.mimeType).toBe('image/png');
      expect(meta.size).toBe(4);
    });

    it('returns default mimeType when not set', async () => {
      const attachment: Attachment = { id: 'att4', type: 'document' };
      const meta = await service.getMetadata(attachment);
      expect(meta.mimeType).toBe('application/octet-stream');
    });
  });

  describe('processAttachment', () => {
    it('returns buffer and text for text attachments', async () => {
      const attachment: Attachment = {
        id: 'att5',
        type: 'document',
        data: Buffer.from('text content'),
        mimeType: 'text/plain',
      };
      const result = await service.processAttachment(attachment, 'web_chat');
      expect(result.text).toBe('text content');
      expect(result.mimeType).toBe('text/plain');
    });

    it('returns buffer only for binary attachments', async () => {
      const attachment: Attachment = {
        id: 'att6',
        type: 'image',
        data: Buffer.from('binary'),
        mimeType: 'image/jpeg',
      };
      const result = await service.processAttachment(attachment, 'mobile');
      expect(result.text).toBeUndefined();
      expect(result.mimeType).toBe('image/jpeg');
    });
  });
});
