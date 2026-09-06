import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface CachedTenant {
  cafeId: string;
  expiresAt: number;
}

@Injectable()
export class WhatsAppTenantResolverService {
  private readonly logger = new Logger(WhatsAppTenantResolverService.name);
  private readonly cache = new Map<string, CachedTenant>();
  private readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  constructor(private readonly prisma: PrismaService) {}

  async resolveTenantId(destination: string): Promise<string | null> {
    if (!destination) return null;

    const now = Date.now();
    const cached = this.cache.get(destination);
    if (cached && cached.expiresAt > now) {
      return cached.cafeId;
    }

    try {
      const cleanDest = destination.replace(/\D/g, '');

      const account = await this.prisma.cafeWhatsAppAccount.findFirst({
        where: {
          OR: [
            { phoneNumberId: destination },
            { displayPhoneNumber: destination },
            ...(cleanDest ? [{ displayPhoneNumber: { contains: cleanDest } }] : []),
          ],
          status: 'CONNECTED',
        },
        select: { cafeId: true },
      });

      if (account?.cafeId) {
        this.cache.set(destination, { cafeId: account.cafeId, expiresAt: now + this.CACHE_TTL_MS });
        return account.cafeId;
      }

      const cafe = await this.prisma.cafe.findFirst({
        where: {
          OR: [
            { phone: destination },
            { whatsappPhoneId: destination },
            ...(cleanDest ? [{ phone: { contains: cleanDest } }] : []),
          ],
          active: true,
        },
        select: { id: true },
      });

      if (cafe?.id) {
        this.cache.set(destination, { cafeId: cafe.id, expiresAt: now + this.CACHE_TTL_MS });
        return cafe.id;
      }
    } catch (err: any) {
      this.logger.error(`Error resolving tenant for WhatsApp destination ${destination}: ${err?.message || err}`);
    }

    return null;
  }

  setCache(identifier: string, cafeId: string) {
    this.cache.set(identifier, { cafeId, expiresAt: Date.now() + this.CACHE_TTL_MS });
  }

  clearCache(identifier?: string) {
    if (identifier) this.cache.delete(identifier);
    else this.cache.clear();
  }
}
