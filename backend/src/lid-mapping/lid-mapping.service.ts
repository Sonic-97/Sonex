import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';

export interface LidMappingResult {
  lid: string;
  phone: string | null;
  phoneJid: string | null;
  displayName: string | null;
  source: string;
}

export interface LidResolveInput {
  lid: string;
  phone?: string;
  displayName?: string;
  phoneJid?: string;
  source?: string;
  cafeId: string;
}

@Injectable()
export class LidMappingService {
  private readonly logger = new Logger(LidMappingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async upsert(input: LidResolveInput): Promise<LidMappingResult> {
    if (!input.lid.includes('@lid')) {
      input.lid = `${input.lid.replace(/@.*$/, '')}@lid`;
    }

    let phone = input.phone || null;
    let phoneJid = input.phoneJid || null;

    if (phone && !phoneJid) {
      const digits = phone.replace(/\D/g, '');
      if (digits) phoneJid = `${digits}@c.us`;
    }

    if (!phone && phoneJid) {
      phone = phoneJid.replace(/@.*$/, '');
    }

    const mapping = await this.prisma.lidMapping.upsert({
      where: { cafeId_lid: { cafeId: input.cafeId, lid: input.lid } },
      create: {
        lid: input.lid,
        phone,
        phoneJid,
        displayName: input.displayName || null,
        source: input.source || 'message_incoming',
        cafeId: input.cafeId,
      },
      update: {
        phone: phone || undefined,
        phoneJid: phoneJid || undefined,
        displayName: input.displayName || undefined,
        source: input.source || undefined,
        cafeId: input.cafeId,
        lastSeenAt: new Date(),
      },
    });

    if (phone && phoneJid && input.cafeId) {
      const customer = await this.prisma.customer.findFirst({
        where: { cafeId: input.cafeId, phone },
      });
      if (customer) {
        await this.prisma.customer.update({
          where: { id: customer.id },
          data: { phoneJid },
        });
      }
    }

    this.eventEmitter.emit('audit.log', {
      cafeId: input.cafeId,
      action: 'LID_MAPPING_UPSERT',
      metadata: { lid: input.lid, phone, phoneJid, source: input.source },
    });

    return {
      lid: mapping.lid,
      phone: mapping.phone,
      phoneJid: mapping.phoneJid,
      displayName: mapping.displayName,
      source: mapping.source,
    };
  }

  async findByLid(lid: string, cafeId?: string): Promise<LidMappingResult | null> {
    const clean = lid.includes('@') ? lid : `${lid}@lid`;
    const where: any = { lid: clean };
    if (cafeId) where.cafeId = cafeId;

    const mapping = cafeId
      ? await this.prisma.lidMapping.findFirst({ where })
      : await this.prisma.lidMapping.findUnique({ where: { lid: clean } });

    if (!mapping) return null;
    return {
      lid: mapping.lid,
      phone: mapping.phone,
      phoneJid: mapping.phoneJid,
      displayName: mapping.displayName,
      source: mapping.source,
    };
  }

  async findByPhone(phone: string, cafeId?: string): Promise<LidMappingResult | null> {
    const digits = phone.replace(/\D/g, '');
    const where: any = {
      OR: [{ phone: digits }, { phoneJid: { startsWith: digits } }],
    };
    if (cafeId) where.cafeId = cafeId;

    const mapping = await this.prisma.lidMapping.findFirst({
      where,
      orderBy: { lastSeenAt: 'desc' },
    });
    if (!mapping) return null;
    return {
      lid: mapping.lid,
      phone: mapping.phone,
      phoneJid: mapping.phoneJid,
      displayName: mapping.displayName,
      source: mapping.source,
    };
  }

  async resolveToPhoneJid(lid: string): Promise<string | null> {
    const mapping = await this.findByLid(lid);
    if (mapping?.phoneJid) return mapping.phoneJid;
    if (mapping?.phone) return `${mapping.phone}@c.us`;
    return null;
  }

  resolveToJid(value: string): string {
    if (value.includes('@lid')) {
      return value;
    }
    const digits = value.replace(/\D/g, '');
    if (!digits) return value;
    if (value.includes('@c.us') || value.includes('@s.whatsapp.net')) return value;
    return `${digits}@c.us`;
  }

  isLid(value: string): boolean {
    return value.includes('@lid') || /^\d{15,}$/.test(value.replace(/@.*$/, ''));
  }
}
