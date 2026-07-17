import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface WaterfallResult {
  phoneJid: string | null;
  step: string;
  detail: string;
}

@Injectable()
export class LidResolverService {
  private readonly logger = new Logger(LidResolverService.name);

  private readonly WATERFALL_TIMEOUT_MS = 15000;

  async resolve(
    lid: string,
    providers: {
      findByLid: (lid: string) => Promise<{ phoneJid: string | null } | null>;
      getContactPhone: (jid: string) => Promise<string | null>;
      getContactDetails: (jid: string) => Promise<{ phone?: string; name?: string } | null>;
      findSessionByLid: (lid: string) => Promise<string | null>;
      findCustomerByJid: (lid: string, cafeId?: string) => Promise<string | null>;
    },
    cafeId?: string,
  ): Promise<WaterfallResult> {
    const cleanLid = lid.includes('@lid') ? lid : `${lid}@lid`;
    const lidUserpart = cleanLid.split('@')[0];

    const resolveImpl = async (): Promise<WaterfallResult> => {
      // Step 1: LidMapping lookup
      const mapping = await providers.findByLid(cleanLid);
      if (mapping?.phoneJid) {
        this.logger.log(`[Waterfall Step 1] LidMapping lookup SUCCESS for ${cleanLid} -> ${mapping.phoneJid}`);
        return { phoneJid: mapping.phoneJid, step: 'lid_mapping', detail: mapping.phoneJid };
      }

      // Step 2: Contacts Store lookup (OpenWA API)
      try {
        const contactsPhone = await providers.getContactPhone(cleanLid);
        if (contactsPhone) {
          const resolvedJid = `${contactsPhone.replace(/\D/g, '')}@c.us`;
          this.logger.log(`[Waterfall Step 2] Contacts store lookup SUCCESS for ${cleanLid} -> ${resolvedJid}`);
          return { phoneJid: resolvedJid, step: 'contacts_store', detail: resolvedJid };
        }
      } catch {
        this.logger.warn(`[Waterfall Step 2] Contacts store lookup FAILED for ${cleanLid}`);
      }

      // Step 3: Chats metadata lookup
      try {
        const contactDetails = await providers.getContactDetails(cleanLid);
        if (contactDetails?.phone) {
          const resolvedJid = `${contactDetails.phone.replace(/\D/g, '')}@c.us`;
          this.logger.log(`[Waterfall Step 3] Chats metadata lookup SUCCESS for ${cleanLid} -> ${resolvedJid}`);
          return { phoneJid: resolvedJid, step: 'chats_metadata', detail: resolvedJid };
        }
      } catch {
        this.logger.warn(`[Waterfall Step 3] Chats metadata lookup FAILED for ${cleanLid}`);
      }

      // Step 4: Session cache lookup
      try {
        const sessionJid = await providers.findSessionByLid(cleanLid);
        if (sessionJid) {
          this.logger.log(`[Waterfall Step 4] Session cache lookup SUCCESS for ${cleanLid} -> ${sessionJid}`);
          return { phoneJid: sessionJid, step: 'session_cache', detail: sessionJid };
        }
      } catch {
        this.logger.warn(`[Waterfall Step 4] Session cache lookup FAILED for ${cleanLid}`);
      }

      // Step 5: Previous customer mappings
      try {
        const customerJid = await providers.findCustomerByJid(cleanLid, cafeId);
        if (customerJid) {
          this.logger.log(`[Waterfall Step 5] Customer records lookup SUCCESS for ${cleanLid} -> ${customerJid}`);
          return { phoneJid: customerJid, step: 'customer_records', detail: customerJid };
        }
      } catch {
        this.logger.warn(`[Waterfall Step 5] Customer records lookup FAILED for ${cleanLid}`);
      }

      this.logger.warn(`[Waterfall] All 5 steps exhausted for ${cleanLid} — no phone JID found`);
      return { phoneJid: null, step: 'all_exhausted', detail: 'All 5 resolution steps returned no phone JID' };
    };

    const timeout = new Promise<WaterfallResult>((_, reject) =>
      setTimeout(() => reject(new Error(`Waterfall resolution timed out after ${this.WATERFALL_TIMEOUT_MS}ms for ${cleanLid}`)), this.WATERFALL_TIMEOUT_MS),
    );

    try {
      return await Promise.race([resolveImpl(), timeout]);
    } catch (err) {
      this.logger.warn(`[Waterfall] Timeout for ${cleanLid} after ${this.WATERFALL_TIMEOUT_MS}ms`);
      return { phoneJid: null, step: 'timeout', detail: (err as Error).message };
    }
  }
}
