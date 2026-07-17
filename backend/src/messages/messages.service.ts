import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async logMessage(data: {
    phone: string;
    content: string;
    role: 'customer' | 'system';
    aiResponse?: any;
    intent?: string;
    cafeId?: string;
  }) {
    return this.prisma.message.create({
      data: {
        cafeId: data.cafeId ?? null,
        phone: data.phone,
        content: data.content,
        role: data.role,
        aiResponse: data.aiResponse ?? undefined,
        intent: data.intent ?? null,
      } as any,
    });
  }

  async getRecentByPhone(phone: string, limit = 5) {
    return this.prisma.message.findMany({
      where: { phone },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}




