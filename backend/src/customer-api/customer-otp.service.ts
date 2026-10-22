import { Injectable, Logger } from '@nestjs/common';

interface OtpRecord {
  code: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
}

export type IssueOtpResult =
  | { ok: true; code: string; expiresInSeconds: number }
  | { ok: false; retryAfterSeconds: number };

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_INTERVAL_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

@Injectable()
export class CustomerOtpService {
  private readonly logger = new Logger(CustomerOtpService.name);
  private readonly store = new Map<string, OtpRecord>();

  private key(cafeId: string, phone: string): string {
    return `${cafeId}:${phone}`;
  }

  issue(cafeId: string, phone: string): IssueOtpResult {
    const k = this.key(cafeId, phone);
    const now = Date.now();
    const existing = this.store.get(k);

    if (existing && now - existing.lastSentAt < OTP_RESEND_INTERVAL_MS) {
      const retryAfterSeconds = Math.ceil(
        (OTP_RESEND_INTERVAL_MS - (now - existing.lastSentAt)) / 1000,
      );
      return { ok: false, retryAfterSeconds };
    }

    const code = this.generateCode();
    this.store.set(k, {
      code,
      expiresAt: now + OTP_TTL_MS,
      attempts: 0,
      lastSentAt: now,
    });
    return { ok: true, code, expiresInSeconds: OTP_TTL_MS / 1000 };
  }

  verify(cafeId: string, phone: string, code: string): boolean {
    const k = this.key(cafeId, phone);
    const record = this.store.get(k);
    if (!record) return false;

    if (Date.now() > record.expiresAt || record.attempts >= MAX_ATTEMPTS) {
      this.store.delete(k);
      return false;
    }

    record.attempts += 1;
    if (record.code !== code) return false;

    this.store.delete(k);
    return true;
  }

  private generateCode(): string {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    const num =
      ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
    return (num % 1000000).toString().padStart(6, '0');
  }

  reset(): void {
    this.store.clear();
  }
}
