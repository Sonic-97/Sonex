import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { OwnerActionProposal, OwnerActionStatus } from './owner-action.types';

const MAX_PROPOSALS_PER_CAFE = 500;
const TERMINAL_STATUSES = new Set<OwnerActionStatus>(['REJECTED', 'EXPIRED', 'STALE', 'EXECUTED', 'FAILED', 'ROLLED_BACK', 'CANCELLED']);

const VALID_TRANSITIONS: Record<OwnerActionStatus, OwnerActionStatus[]> = {
  DRAFT: ['AWAITING_APPROVAL', 'CANCELLED'],
  AWAITING_APPROVAL: ['APPROVED', 'REJECTED', 'EXPIRED', 'STALE', 'CANCELLED'],
  APPROVED: ['EXECUTING', 'STALE', 'EXPIRED', 'CANCELLED'],
  REJECTED: [],
  EXPIRED: [],
  STALE: [],
  EXECUTING: ['EXECUTED', 'FAILED', 'ROLLED_BACK', 'STALE'],
  EXECUTED: [],
  FAILED: ['ROLLED_BACK'],
  ROLLED_BACK: [],
  CANCELLED: [],
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

@Injectable()
export class OwnerActionStoreService {
  private readonly proposals = new Map<string, Map<string, OwnerActionProposal>>();

  create(input: Omit<OwnerActionProposal, 'proposalId' | 'createdAt' | 'updatedAt' | 'approvalPhrase'>): OwnerActionProposal {
    const now = new Date().toISOString();
    const proposalId = this.uniqueCode(input.cafeId);
    const proposal: OwnerActionProposal = {
      ...clone(input),
      proposalId,
      approvalPhrase: `APPROVE ${proposalId}`,
      createdAt: now,
      updatedAt: now,
    };
    const cafeStore = this.cafeStore(input.cafeId);
    cafeStore.set(proposalId, proposal);
    this.prune(cafeStore);
    return clone(proposal);
  }

  get(cafeId: string, proposalId: string): OwnerActionProposal {
    const proposal = this.cafeStore(cafeId).get(proposalId.toUpperCase());
    if (!proposal) throw new NotFoundException('Action proposal not found in this cafe.');
    return clone(this.expireIfNeeded(proposal));
  }

  list(cafeId: string): OwnerActionProposal[] {
    return [...this.cafeStore(cafeId).values()]
      .map((proposal) => clone(this.expireIfNeeded(proposal)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  transition(
    cafeId: string,
    proposalId: string,
    nextStatus: OwnerActionStatus,
    patch: Partial<OwnerActionProposal> = {},
  ): OwnerActionProposal {
    const cafeStore = this.cafeStore(cafeId);
    const current = cafeStore.get(proposalId.toUpperCase());
    if (!current) throw new NotFoundException('Action proposal not found in this cafe.');
    const refreshed = this.expireIfNeeded(current);
    if (!VALID_TRANSITIONS[refreshed.status].includes(nextStatus)) {
      throw new ConflictException(`Invalid proposal transition: ${refreshed.status} -> ${nextStatus}`);
    }
    const next = { ...refreshed, ...clone(patch), status: nextStatus, updatedAt: new Date().toISOString() };
    cafeStore.set(next.proposalId, next);
    return clone(next);
  }

  replaceTerminalDetails(cafeId: string, proposalId: string, patch: Partial<OwnerActionProposal>): OwnerActionProposal {
    const cafeStore = this.cafeStore(cafeId);
    const current = cafeStore.get(proposalId.toUpperCase());
    if (!current) throw new NotFoundException('Action proposal not found in this cafe.');
    const next = { ...current, ...clone(patch), updatedAt: new Date().toISOString() };
    cafeStore.set(next.proposalId, next);
    return clone(next);
  }

  clearForTests(): void {
    this.proposals.clear();
  }

  private expireIfNeeded(proposal: OwnerActionProposal): OwnerActionProposal {
    if (['DRAFT', 'AWAITING_APPROVAL', 'APPROVED'].includes(proposal.status) && Date.parse(proposal.expiresAt) <= Date.now()) {
      const expired = { ...proposal, status: 'EXPIRED' as const, updatedAt: new Date().toISOString() };
      this.cafeStore(proposal.cafeId).set(proposal.proposalId, expired);
      return expired;
    }
    return proposal;
  }

  private cafeStore(cafeId: string): Map<string, OwnerActionProposal> {
    let store = this.proposals.get(cafeId);
    if (!store) {
      store = new Map();
      this.proposals.set(cafeId, store);
    }
    return store;
  }

  private uniqueCode(cafeId: string): string {
    const store = this.cafeStore(cafeId);
    let code = '';
    do code = `SX-${randomBytes(3).toString('hex').toUpperCase()}`; while (store.has(code));
    return code;
  }

  private prune(store: Map<string, OwnerActionProposal>): void {
    if (store.size <= MAX_PROPOSALS_PER_CAFE) return;
    const removable = [...store.values()]
      .filter((proposal) => TERMINAL_STATUSES.has(proposal.status))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    while (store.size > MAX_PROPOSALS_PER_CAFE && removable.length) {
      store.delete(removable.shift()!.proposalId);
    }
  }
}
