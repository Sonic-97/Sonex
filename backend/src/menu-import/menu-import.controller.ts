import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MenuImportService } from './menu-import.service';
import { PreviewService } from './preview.service';
import { ConfirmImportDto } from './dto/menu-import.dto';

interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@Controller('menu-import')
export class MenuImportController {
  constructor(
    private readonly importService: MenuImportService,
    private readonly previewService: PreviewService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: UploadedFile,
    @Query('cafeId') cafeId?: string,
    @Query('branchId') branchId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const preview = await this.importService.uploadAndPreview(
      file.buffer,
      file.originalname,
      file.mimetype,
      cafeId,
      branchId,
    );

    return preview;
  }

  @Post('confirm')
  async confirm(@Body() dto: ConfirmImportDto, @Query('cafeId') cafeId?: string, @Query('branchId') branchId?: string) {
    const result = await this.importService.confirmImport(dto.sessionId, cafeId, branchId);
    return result;
  }

  @Get('session/:sessionId')
  getSession(@Param('sessionId') sessionId: string) {
    const session = this.previewService.getSession(sessionId);
    if (!session) {
      throw new BadRequestException(`Session ${sessionId} not found`);
    }
    return session;
  }

  @Get('preview/:sessionId')
  getPreview(@Param('sessionId') sessionId: string) {
    const session = this.previewService.getSession(sessionId);
    if (!session) {
      throw new BadRequestException(`Session ${sessionId} not found`);
    }
    return session.preview;
  }
}
