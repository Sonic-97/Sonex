export const RECOVERY_JOB_NAMES = {
  PENDING_REPLY: 'recovery:pending-reply',
  WEBHOOK_VERIFY: 'recovery:webhook-verify',
  SESSION_VERIFY: 'recovery:session-verify',
  CUSTOMER_MERGE: 'recovery:customer-merge',
  INVENTORY_RECONCILE: 'recovery:inventory-reconcile',
  DEAD_LETTER: 'recovery:dead-letter',
  LID_MAPPING_REPAIR: 'recovery:lid-mapping-repair',
} as const;

export const RECOVERY_QUEUE_NAMES = {
  PENDING_REPLY: 'recovery-pending-reply',
  WEBHOOK_VERIFY: 'recovery-webhook-verify',
  SESSION_VERIFY: 'recovery-session-verify',
  CUSTOMER_MERGE: 'recovery-customer-merge',
  INVENTORY_RECONCILE: 'recovery-inventory-reconcile',
  DEAD_LETTER: 'recovery-dead-letter',
  LID_MAPPING_REPAIR: 'recovery-lid-mapping-repair',
} as const;

export const RECOVERY_JOB_SCHEDULES: Record<string, number> = {
  [RECOVERY_JOB_NAMES.PENDING_REPLY]: 300_000,
  [RECOVERY_JOB_NAMES.WEBHOOK_VERIFY]: 120_000,
  [RECOVERY_JOB_NAMES.SESSION_VERIFY]: 30_000,
  [RECOVERY_JOB_NAMES.CUSTOMER_MERGE]: 3_600_000,
  [RECOVERY_JOB_NAMES.INVENTORY_RECONCILE]: 21_600_000,
  [RECOVERY_JOB_NAMES.DEAD_LETTER]: 900_000,
  [RECOVERY_JOB_NAMES.LID_MAPPING_REPAIR]: 1800_000, // Every 30 minutes
};

export const RECOVERY_JOB_RETRY_CONFIG: Record<string, { maxAttempts: number; baseDelayMs: number; strategy: 'exponential' | 'linear' }> = {
  [RECOVERY_JOB_NAMES.PENDING_REPLY]: { maxAttempts: 3, baseDelayMs: 30_000, strategy: 'exponential' },
  [RECOVERY_JOB_NAMES.WEBHOOK_VERIFY]: { maxAttempts: 5, baseDelayMs: 10_000, strategy: 'exponential' },
  [RECOVERY_JOB_NAMES.SESSION_VERIFY]: { maxAttempts: 3, baseDelayMs: 5_000, strategy: 'exponential' },
  [RECOVERY_JOB_NAMES.CUSTOMER_MERGE]: { maxAttempts: 2, baseDelayMs: 60_000, strategy: 'linear' },
  [RECOVERY_JOB_NAMES.INVENTORY_RECONCILE]: { maxAttempts: 3, baseDelayMs: 60_000, strategy: 'exponential' },
  [RECOVERY_JOB_NAMES.DEAD_LETTER]: { maxAttempts: 5, baseDelayMs: 30_000, strategy: 'exponential' },
  [RECOVERY_JOB_NAMES.LID_MAPPING_REPAIR]: { maxAttempts: 3, baseDelayMs: 5_000, strategy: 'exponential' },
};

export const RECOVERY_JOB_TIMEOUTS: Record<string, number> = {
  [RECOVERY_JOB_NAMES.PENDING_REPLY]: 60_000,
  [RECOVERY_JOB_NAMES.WEBHOOK_VERIFY]: 30_000,
  [RECOVERY_JOB_NAMES.SESSION_VERIFY]: 20_000,
  [RECOVERY_JOB_NAMES.CUSTOMER_MERGE]: 120_000,
  [RECOVERY_JOB_NAMES.INVENTORY_RECONCILE]: 300_000,
  [RECOVERY_JOB_NAMES.DEAD_LETTER]: 120_000,
  [RECOVERY_JOB_NAMES.LID_MAPPING_REPAIR]: 60_000,
};

export const RECOVERY_JOB_FLAGS: Record<string, string> = {
  [RECOVERY_JOB_NAMES.PENDING_REPLY]: 'RECOVERY_JOB_PENDING_REPLY_ENABLED',
  [RECOVERY_JOB_NAMES.WEBHOOK_VERIFY]: 'RECOVERY_JOB_WEBHOOK_VERIFY_ENABLED',
  [RECOVERY_JOB_NAMES.SESSION_VERIFY]: 'RECOVERY_JOB_SESSION_VERIFY_ENABLED',
  [RECOVERY_JOB_NAMES.CUSTOMER_MERGE]: 'RECOVERY_JOB_CUSTOMER_MERGE_ENABLED',
  [RECOVERY_JOB_NAMES.INVENTORY_RECONCILE]: 'RECOVERY_JOB_INVENTORY_RECONCILE_ENABLED',
  [RECOVERY_JOB_NAMES.DEAD_LETTER]: 'RECOVERY_JOB_DEAD_LETTER_ENABLED',
  [RECOVERY_JOB_NAMES.LID_MAPPING_REPAIR]: 'RECOVERY_JOB_LID_MAPPING_REPAIR_ENABLED',
};

export interface JobResult {
  ok: boolean;
  duration: number;
  error?: string;
  processed?: number;
}
