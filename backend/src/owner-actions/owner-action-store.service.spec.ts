import { ConflictException } from '@nestjs/common';
import { OwnerActionStoreService } from './owner-action-store.service';
import { OwnerActionProposal } from './owner-action.types';

function proposalInput(overrides: Partial<OwnerActionProposal> = {}): Omit<OwnerActionProposal, 'proposalId' | 'createdAt' | 'updatedAt' | 'approvalPhrase'> {
  return {
    version: 1,
    actionType: 'UPDATE_PRODUCT_PRICE',
    status: 'AWAITING_APPROVAL',
    riskLevel: 'HIGH',
    reversibility: 'PARTIALLY_REVERSIBLE',
    cafeId: 'cafe-1',
    branchIds: [],
    branchNames: ['All branches'],
    createdBy: 'owner-1',
    createdByRole: 'OWNER',
    resource: { type: 'Product', id: 'product-1', name: 'Latte' },
    currentState: { price: 50 },
    proposedState: { price: 55 },
    expectedStateHash: 'hash',
    impact: { whatWillNotChange: [] },
    warnings: [],
    reason: 'test',
    source: 'UI',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  } as any;
}

describe('OwnerActionStoreService state machine', () => {
  let store: OwnerActionStoreService;

  beforeEach(() => { store = new OwnerActionStoreService(); });

  it('creates a scoped SX code and exact phrase', () => {
    const proposal = store.create(proposalInput());
    expect(proposal.proposalId).toMatch(/^SX-[A-F0-9]{6}$/);
    expect(proposal.approvalPhrase).toBe(`APPROVE ${proposal.proposalId}`);
  });

  it('returns defensive clones', () => {
    const proposal = store.create(proposalInput());
    proposal.proposedState.price = 1;
    expect(store.get('cafe-1', proposal.proposalId).proposedState.price).toBe(55);
  });

  it('isolates proposals by cafe', () => {
    const proposal = store.create(proposalInput());
    expect(() => store.get('cafe-2', proposal.proposalId)).toThrow();
  });

  it.each([
    ['APPROVED'], ['REJECTED'], ['EXPIRED'], ['STALE'], ['CANCELLED'],
  ] as const)('allows awaiting approval to transition to %s', (status) => {
    const proposal = store.create(proposalInput());
    expect(store.transition('cafe-1', proposal.proposalId, status).status).toBe(status);
  });

  it('rejects draft to executed', () => {
    const proposal = store.create(proposalInput({ status: 'DRAFT' }));
    expect(() => store.transition('cafe-1', proposal.proposalId, 'EXECUTED')).toThrow(ConflictException);
  });

  it('rejects rejected to approved', () => {
    const proposal = store.create(proposalInput());
    store.transition('cafe-1', proposal.proposalId, 'REJECTED');
    expect(() => store.transition('cafe-1', proposal.proposalId, 'APPROVED')).toThrow(ConflictException);
  });

  it('rejects stale to executing', () => {
    const proposal = store.create(proposalInput());
    store.transition('cafe-1', proposal.proposalId, 'STALE');
    expect(() => store.transition('cafe-1', proposal.proposalId, 'EXECUTING')).toThrow(ConflictException);
  });

  it('supports approved through executing to executed', () => {
    const proposal = store.create(proposalInput());
    store.transition('cafe-1', proposal.proposalId, 'APPROVED');
    store.transition('cafe-1', proposal.proposalId, 'EXECUTING');
    expect(store.transition('cafe-1', proposal.proposalId, 'EXECUTED').status).toBe('EXECUTED');
  });

  it('supports failed transaction to rolled back', () => {
    const proposal = store.create(proposalInput());
    store.transition('cafe-1', proposal.proposalId, 'APPROVED');
    store.transition('cafe-1', proposal.proposalId, 'EXECUTING');
    store.transition('cafe-1', proposal.proposalId, 'FAILED');
    expect(store.transition('cafe-1', proposal.proposalId, 'ROLLED_BACK').status).toBe('ROLLED_BACK');
  });

  it('expires active proposals on read', () => {
    const proposal = store.create(proposalInput({ expiresAt: new Date(Date.now() - 1).toISOString() }));
    expect(store.get('cafe-1', proposal.proposalId).status).toBe('EXPIRED');
  });

  it('does not expire terminal proposals again', () => {
    const proposal = store.create(proposalInput({ expiresAt: new Date(Date.now() - 1).toISOString(), status: 'REJECTED' }));
    expect(store.get('cafe-1', proposal.proposalId).status).toBe('REJECTED');
  });

  it('sorts newest proposals first', async () => {
    const first = store.create(proposalInput());
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = store.create(proposalInput());
    expect(store.list('cafe-1').map((item) => item.proposalId)).toEqual([second.proposalId, first.proposalId]);
  });
});

