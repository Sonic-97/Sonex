import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';
import { NotificationQueryDto } from './dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async getAll(
    @Req() req: Request,
    @Query() query: NotificationQueryDto,
  ) {
    const userId = (req.user as any)?.sub || (req.user as any)?.id || (req.user as any)?.employeeId;
    return this.notificationService.getNotifications(userId, query);
  }

  @Get('unread-count')
  async getUnreadCount(@Req() req: Request) {
    const userId = (req.user as any)?.sub || (req.user as any)?.id || (req.user as any)?.employeeId;
    return this.notificationService.getUnreadCount(userId);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  async markAsRead(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const userId = (req.user as any)?.sub || (req.user as any)?.id || (req.user as any)?.employeeId;
    const notification = await this.notificationService.markAsRead(id, userId);
    return { success: true, notification };
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllAsRead(@Req() req: Request) {
    const userId = (req.user as any)?.sub || (req.user as any)?.id || (req.user as any)?.employeeId;
    return this.notificationService.markAllAsRead(userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const userId = (req.user as any)?.sub || (req.user as any)?.id || (req.user as any)?.employeeId;
    return this.notificationService.deleteNotification(id, userId);
  }
}




