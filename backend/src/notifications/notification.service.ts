import { Injectable, Logger, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateNotificationDto, NotificationQueryDto } from './dto';

const NOTIFICATION_ROUTING: Record<string, string[]> = {
  NEW_ORDER: ['Cafe', 'BARISTA'],
  ORDER_UPDATED: ['Cafe', 'BARISTA', 'DRIVER'],
  ORDER_DELIVERED: ['Cafe', 'DRIVER'],
  LOW_STOCK: ['Cafe'],
  PAYMENT_RECEIVED: ['Cafe', 'BARISTA'],
  PAYMENT_FAILED: ['Cafe', 'BARISTA'],
  DRIVER_ASSIGNED: ['DRIVER'],
  DRIVER_SETTLEMENT: ['Cafe'],
  SYSTEM_ALERT: ['Cafe', 'BARISTA', 'DRIVER'],
  INVENTORY_UPDATED: ['Cafe'],
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createNotification(dto: CreateNotificationDto & { branchId?: string }) {
    let targetBranchId = dto.branchId;
    if (!targetBranchId && dto.userId) {
      const staff = await this.prisma.staff.findUnique({
        where: { id: dto.userId },
        select: { branchId: true },
      });
      targetBranchId = staff?.branchId;
    }
    if (!targetBranchId) {
      const defaultBranch = await this.prisma.branch.findFirst({
        where: { slug: 'main-branch' },
        select: { id: true },
      });
      targetBranchId = defaultBranch?.id;
    }
    if (!targetBranchId) throw new BadRequestException('No active branch found');

    const notification = await this.prisma.notification.create({
      data: {
        cafeId: dto.cafeId!,
        branchId: targetBranchId,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        data: (dto.data as any) ?? undefined,
        userId: dto.userId || null,
        roleTarget: dto.roleTarget,
        isRead: false,
      } as any,
    });

    this.eventEmitter.emit('notification.created', {
      eventType: 'notification.created',
      timestamp: new Date().toISOString(),
      payload: notification,
    });

    this.logger.debug(`Notification created: ${notification.id} (${dto.type})`);
    return notification;
  }

  async sendToUser(userId: string, type: string, title: string, message: string, data?: Record<string, unknown>) {
    let role: string | undefined;
    let branchId: string | undefined;
    const staff = await this.prisma.staff.findUnique({ where: { id: userId }, select: { role: true, branchId: true } });
    if (staff) {
      role = staff.role;
      branchId = staff.branchId ?? undefined;
    } else {
      const cafe = await this.prisma.cafe.findUnique({ where: { id: userId }, select: { id: true } });
      if (cafe) role = 'OWNER';
    }
    if (!role) {
      this.logger.warn(`Cannot send notification: user ${userId} not found`);
      return null;
    }
    return this.createNotification({ type, title, message, data, userId, roleTarget: role, branchId });
  }

  async sendToRole(role: string, type: string, title: string, message: string, data?: Record<string, unknown>, branchId?: string) {
    return this.createNotification({ type, title, message, data, roleTarget: role, branchId });
  }

  async sendToMultipleRoles(roles: string[], type: string, title: string, message: string, data?: Record<string, unknown>, branchId?: string) {
    const results = [];
    for (const role of roles) {
      const n = await this.sendToRole(role, type, title, message, data, branchId);
      results.push(n);
    }
    return results;
  }

  async sendByType(type: string, title: string, message: string, data?: Record<string, unknown>, userId?: string, branchId?: string) {
    const targetRoles = NOTIFICATION_ROUTING[type] || ['Cafe'];
    if (userId && type === 'DRIVER_ASSIGNED') {
      return this.sendToUser(userId, type, title, message, data);
    }
    return this.sendToMultipleRoles(targetRoles, type, title, message, data, branchId);
  }

  private async resolveUserRole(userId: string): Promise<{ role: string; }> {
    const staff = await this.prisma.staff.findUnique({ where: { id: userId }, select: { role: true } });
    if (staff) return { role: staff.role };
    const cafe = await this.prisma.cafe.findUnique({ where: { id: userId }, select: { id: true } });
    if (cafe) return { role: 'OWNER' };
    throw new NotFoundException('User not found');
  }

  async getNotifications(userId: string, query: NotificationQueryDto) {
    const { page = 1, limit = 20, type, isRead, sortBy = 'createdAt', sortOrder = 'desc' } = query;

    const user = await this.resolveUserRole(userId);

    const where: Record<string, unknown> = {
      OR: [
        { userId },
        { roleTarget: user.role },
        { roleTarget: 'ALL' },
      ],
    };

    if (type) where['type'] = type;
    if (isRead !== undefined) where['isRead'] = isRead;

    const orderBy: Record<string, string> = {};
    orderBy[sortBy] = sortOrder;

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: where as any,
        orderBy: orderBy as any,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          data: true,
          isRead: true,
          readAt: true,
          roleTarget: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.notification.count({ where: where as any }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async markAsRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification) throw new NotFoundException('Notification not found');

    if (notification.userId && notification.userId !== userId) {
      throw new ForbiddenException('Cannot mark another user\'s notification as read');
    }

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });

    this.eventEmitter.emit('notification.read', {
      eventType: 'notification.read',
      timestamp: new Date().toISOString(),
      payload: { notificationId, userId },
    });

    return updated;
  }

  async markAllAsRead(userId: string) {
    const user = await this.resolveUserRole(userId);

    const result = await this.prisma.notification.updateMany({
      where: {
        isRead: false,
        OR: [
          { userId },
          { roleTarget: user.role },
          { roleTarget: 'ALL' },
        ],
      },
      data: { isRead: true, readAt: new Date() },
    });

    this.eventEmitter.emit('notification.read-all', {
      eventType: 'notification.read-all',
      timestamp: new Date().toISOString(),
      payload: { userId, count: result.count },
    });

    return { updatedCount: result.count };
  }

  async getUnreadCount(userId: string) {
    const user = await this.resolveUserRole(userId);

    const count = await this.prisma.notification.count({
      where: {
        isRead: false,
        OR: [
          { userId },
          { roleTarget: user.role },
          { roleTarget: 'ALL' },
        ],
      },
    });

    return { unreadCount: count };
  }

  async deleteNotification(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification) throw new NotFoundException('Notification not found');

    if (notification.userId && notification.userId !== userId) {
      throw new ForbiddenException('Cannot delete another user\'s notification');
    }

    await this.prisma.notification.delete({ where: { id: notificationId } });

    this.eventEmitter.emit('notification.deleted', {
      eventType: 'notification.deleted',
      timestamp: new Date().toISOString(),
      payload: { notificationId, userId },
    });

    return { success: true };
  }

  async deleteAllNotifications(userId: string) {
    const result = await this.prisma.notification.deleteMany({
      where: { userId },
    });

    return { deletedCount: result.count };
  }
}




