import { ProcessorContext } from '../processor/types';
import { Staker, Collator, TotalStake } from '../model';
import { encodeAddressToSS58, calculatePercentage, config } from '../utils';

const TOTAL_STAKE_ID = 'total';

export class EntityCache {
  private stakers = new Map<string, Staker>();
  private collators = new Map<string, Collator>();
  private totalStake: TotalStake | null = null;
  private totalScheduledUnbonds: bigint = 0n;
  private scheduledUnbondsLoaded: boolean = false;
  private ctx: ProcessorContext;

  constructor(ctx: ProcessorContext) {
    this.ctx = ctx;
  }

  async getStaker(addressBytes: Uint8Array, blockNumber: number): Promise<Staker> {
    const address = encodeAddressToSS58(addressBytes);

    if (this.stakers.has(address)) {
      return this.stakers.get(address)!;
    }

    let staker = await this.ctx.store.get(Staker, address);

    if (!staker) {
      staker = new Staker({
        id: address,
        stakedAmount: 0n,
        scheduledUnbonds: 0n,
        totalDelegated: 0n,
        totalUndelegated: 0n,
        lastUpdatedBlock: blockNumber,
      });
    }

    this.stakers.set(address, staker);
    return staker;
  }

  async getCollator(addressBytes: Uint8Array, blockNumber: number): Promise<Collator> {
    const address = encodeAddressToSS58(addressBytes);

    if (this.collators.has(address)) {
      return this.collators.get(address)!;
    }

    let collator = await this.ctx.store.get(Collator, address);

    if (!collator) {
      collator = new Collator({
        id: address,
        selfBond: 0n,
        scheduledUnbonds: 0n,
        totalBonded: 0n,
        totalUnbonded: 0n,
        lastUpdatedBlock: blockNumber,
      });
    }

    this.collators.set(address, collator);
    return collator;
  }

  async getTotalStake(blockNumber: number): Promise<TotalStake> {
    if (this.totalStake) {
      return this.totalStake;
    }

    let totalStake = await this.ctx.store.get(TotalStake, TOTAL_STAKE_ID);

    if (!totalStake) {
      const totalSupply = config.chain.totalSupply;
      totalStake = new TotalStake({
        id: TOTAL_STAKE_ID,
        totalStaked: 0n,
        totalBonded: 0n,
        totalDelegatorStake: 0n,
        totalCollatorBond: 0n,
        totalSupply: totalSupply,
        stakedPercentage: 0,
        bondedPercentage: 0,
        activeStakerCount: 0,
        activeCollatorCount: 0,
        lastUpdatedBlock: blockNumber,
      });
    }

    this.totalStake = totalStake;
    return totalStake;
  }

  async flush(): Promise<void> {
    const stakers = Array.from(this.stakers.values());
    const collators = Array.from(this.collators.values());

    if (stakers.length > 0) {
      await this.ctx.store.upsert(stakers);
    }
    if (collators.length > 0) {
      await this.ctx.store.upsert(collators);
    }
    if (this.totalStake) {
      await this.ctx.store.upsert(this.totalStake);
    }
  }
}

async function updateStakerAmounts(
  cache: EntityCache,
  staker: Staker,
  amountChange: bigint,
  isIncrease: boolean,
  blockNumber: number
): Promise<void> {
  const oldStakedAmount = staker.stakedAmount;

  if (isIncrease) {
    staker.stakedAmount += amountChange;
    staker.totalDelegated += amountChange;
  } else {
    staker.stakedAmount -= amountChange;
    staker.totalUndelegated += amountChange;

    if (staker.stakedAmount < 0n) {
      staker.stakedAmount = 0n;
    }
  }

  staker.lastUpdatedBlock = blockNumber;
  await updateTotalStakeDelegator(cache, oldStakedAmount, staker.stakedAmount, blockNumber);
}

async function recalculateTotalStake(cache: EntityCache, blockNumber: number): Promise<void> {
  const totalStake = await cache.getTotalStake(blockNumber);
  totalStake.totalStaked = totalStake.totalDelegatorStake + totalStake.totalCollatorBond;

  if (!(cache as any).scheduledUnbondsLoaded) {
    let totalScheduledUnbonds = 0n;

    const stakerEntries = Array.from((cache as any).stakers.values()) as Staker[];
    for (const staker of stakerEntries) {
      totalScheduledUnbonds += staker.scheduledUnbonds;
    }

    const collatorEntries = Array.from((cache as any).collators.values()) as Collator[];
    for (const collator of collatorEntries) {
      totalScheduledUnbonds += collator.scheduledUnbonds;
    }

    const stakerIds = new Set(stakerEntries.map((s: Staker) => s.id));
    const collatorIds = new Set(collatorEntries.map((c: Collator) => c.id));

    const dbStakers = await (cache as any).ctx.store.find(Staker);
    for (const staker of dbStakers) {
      if (!stakerIds.has(staker.id)) {
        totalScheduledUnbonds += staker.scheduledUnbonds;
      }
    }

    const dbCollators = await (cache as any).ctx.store.find(Collator);
    for (const collator of dbCollators) {
      if (!collatorIds.has(collator.id)) {
        totalScheduledUnbonds += collator.scheduledUnbonds;
      }
    }

    (cache as any).totalScheduledUnbonds = totalScheduledUnbonds;
    (cache as any).scheduledUnbondsLoaded = true;
  }

  totalStake.totalBonded = totalStake.totalStaked + (cache as any).totalScheduledUnbonds;
  totalStake.stakedPercentage = calculatePercentage(totalStake.totalStaked, totalStake.totalSupply);
  totalStake.bondedPercentage = calculatePercentage(totalStake.totalBonded, totalStake.totalSupply);
  totalStake.lastUpdatedBlock = blockNumber;
}

async function updateTotalStakeDelegator(
  cache: EntityCache,
  oldStakedAmount: bigint,
  newStakedAmount: bigint,
  blockNumber: number
): Promise<void> {
  const totalStake = await cache.getTotalStake(blockNumber);
  const delta = newStakedAmount - oldStakedAmount;
  totalStake.totalDelegatorStake += delta;

  if (totalStake.totalDelegatorStake < 0n) {
    totalStake.totalDelegatorStake = 0n;
  }

  if (oldStakedAmount === 0n && newStakedAmount > 0n) {
    totalStake.activeStakerCount += 1;
  } else if (oldStakedAmount > 0n && newStakedAmount === 0n) {
    totalStake.activeStakerCount -= 1;
  }

  await recalculateTotalStake(cache, blockNumber);
}

async function updateCollatorAmounts(
  cache: EntityCache,
  collator: Collator,
  amountChange: bigint,
  isIncrease: boolean,
  blockNumber: number
): Promise<void> {
  const oldSelfBond = collator.selfBond;

  if (isIncrease) {
    collator.selfBond += amountChange;
    collator.totalBonded += amountChange;
  } else {
    collator.selfBond -= amountChange;
    collator.totalUnbonded += amountChange;

    if (collator.selfBond < 0n) {
      collator.selfBond = 0n;
    }
  }

  collator.lastUpdatedBlock = blockNumber;
  await updateTotalStakeCollator(cache, oldSelfBond, collator.selfBond, blockNumber);
}

async function updateTotalStakeCollator(
  cache: EntityCache,
  oldBondAmount: bigint,
  newBondAmount: bigint,
  blockNumber: number
): Promise<void> {
  const totalStake = await cache.getTotalStake(blockNumber);
  const delta = newBondAmount - oldBondAmount;
  totalStake.totalCollatorBond += delta;

  if (totalStake.totalCollatorBond < 0n) {
    totalStake.totalCollatorBond = 0n;
  }

  if (oldBondAmount === 0n && newBondAmount > 0n) {
    totalStake.activeCollatorCount += 1;
  } else if (oldBondAmount > 0n && newBondAmount === 0n) {
    totalStake.activeCollatorCount -= 1;
  }

  await recalculateTotalStake(cache, blockNumber);
}

export async function handleDelegation(
  cache: EntityCache,
  blockNumber: number,
  delegatorBytes: Uint8Array,
  _collatorBytes: Uint8Array,
  amount: bigint
): Promise<void> {
  const staker = await cache.getStaker(delegatorBytes, blockNumber);
  await updateStakerAmounts(cache, staker, amount, true, blockNumber);
}

export async function handleDelegationRevoked(
  cache: EntityCache,
  blockNumber: number,
  delegatorBytes: Uint8Array,
  _collatorBytes: Uint8Array,
  amount: bigint
): Promise<void> {
  const staker = await cache.getStaker(delegatorBytes, blockNumber);

  if (staker.scheduledUnbonds >= amount) {
    staker.scheduledUnbonds -= amount;
    (cache as any).totalScheduledUnbonds -= amount;
    if ((cache as any).totalScheduledUnbonds < 0n) {
      (cache as any).totalScheduledUnbonds = 0n;
    }
  } else {
    await updateStakerAmounts(cache, staker, amount, false, blockNumber);
  }

  staker.totalUndelegated += amount;
  staker.lastUpdatedBlock = blockNumber;
  await recalculateTotalStake(cache, blockNumber);
}

export async function handleDelegationIncreased(
  cache: EntityCache,
  blockNumber: number,
  delegatorBytes: Uint8Array,
  _collatorBytes: Uint8Array,
  amount: bigint
): Promise<void> {
  const staker = await cache.getStaker(delegatorBytes, blockNumber);
  await updateStakerAmounts(cache, staker, amount, true, blockNumber);
}

export async function handleDelegationDecreased(
  cache: EntityCache,
  blockNumber: number,
  delegatorBytes: Uint8Array,
  _collatorBytes: Uint8Array,
  amount: bigint
): Promise<void> {
  const staker = await cache.getStaker(delegatorBytes, blockNumber);
  await updateStakerAmounts(cache, staker, amount, false, blockNumber);
}

export async function handleDelegationKicked(
  cache: EntityCache,
  blockNumber: number,
  delegatorBytes: Uint8Array,
  _collatorBytes: Uint8Array,
  amount: bigint
): Promise<void> {
  const staker = await cache.getStaker(delegatorBytes, blockNumber);
  await updateStakerAmounts(cache, staker, amount, false, blockNumber);
}

export async function handleCompounded(
  cache: EntityCache,
  blockNumber: number,
  delegatorBytes: Uint8Array,
  _candidateBytes: Uint8Array,
  amount: bigint
): Promise<void> {
  const staker = await cache.getStaker(delegatorBytes, blockNumber);
  await updateStakerAmounts(cache, staker, amount, true, blockNumber);
}

export async function handleCandidateBondedMore(
  cache: EntityCache,
  blockNumber: number,
  candidateBytes: Uint8Array,
  amount: bigint
): Promise<void> {
  const collator = await cache.getCollator(candidateBytes, blockNumber);
  await updateCollatorAmounts(cache, collator, amount, true, blockNumber);
}

export async function handleCandidateBondedLess(
  cache: EntityCache,
  blockNumber: number,
  candidateBytes: Uint8Array,
  amount: bigint
): Promise<void> {
  const collator = await cache.getCollator(candidateBytes, blockNumber);

  if (collator.scheduledUnbonds >= amount) {
    collator.scheduledUnbonds -= amount;
    (cache as any).totalScheduledUnbonds -= amount;
    if ((cache as any).totalScheduledUnbonds < 0n) {
      (cache as any).totalScheduledUnbonds = 0n;
    }
  } else {
    await updateCollatorAmounts(cache, collator, amount, false, blockNumber);
  }

  collator.totalUnbonded += amount;
  collator.lastUpdatedBlock = blockNumber;
  await recalculateTotalStake(cache, blockNumber);
}

export async function handleJoinedCollatorCandidates(
  cache: EntityCache,
  blockNumber: number,
  accountBytes: Uint8Array,
  amountLocked: bigint
): Promise<void> {
  const collator = await cache.getCollator(accountBytes, blockNumber);
  await updateCollatorAmounts(cache, collator, amountLocked, true, blockNumber);
}

export async function handleCandidateLeft(
  cache: EntityCache,
  blockNumber: number,
  candidateBytes: Uint8Array,
  unlockedAmount: bigint
): Promise<void> {
  const collator = await cache.getCollator(candidateBytes, blockNumber);
  await updateCollatorAmounts(cache, collator, unlockedAmount, false, blockNumber);
}

export async function handleDelegationRevocationScheduled(
  cache: EntityCache,
  blockNumber: number,
  delegatorBytes: Uint8Array,
  amount: bigint
): Promise<void> {
  const staker = await cache.getStaker(delegatorBytes, blockNumber);
  staker.scheduledUnbonds += amount;
  staker.stakedAmount -= amount;
  if (staker.stakedAmount < 0n) {
    staker.stakedAmount = 0n;
  }
  staker.lastUpdatedBlock = blockNumber;
  const totalStake = await cache.getTotalStake(blockNumber);
  totalStake.totalDelegatorStake -= amount;
  if (totalStake.totalDelegatorStake < 0n) {
    totalStake.totalDelegatorStake = 0n;
  }
  (cache as any).totalScheduledUnbonds += amount;
  await recalculateTotalStake(cache, blockNumber);
}

export async function handleDelegationDecreaseScheduled(
  cache: EntityCache,
  blockNumber: number,
  delegatorBytes: Uint8Array,
  amount: bigint
): Promise<void> {
  const staker = await cache.getStaker(delegatorBytes, blockNumber);
  staker.scheduledUnbonds += amount;
  staker.stakedAmount -= amount;
  if (staker.stakedAmount < 0n) {
    staker.stakedAmount = 0n;
  }
  staker.lastUpdatedBlock = blockNumber;
  const totalStake = await cache.getTotalStake(blockNumber);
  totalStake.totalDelegatorStake -= amount;
  if (totalStake.totalDelegatorStake < 0n) {
    totalStake.totalDelegatorStake = 0n;
  }
  await recalculateTotalStake(cache, blockNumber);
}

export async function handleCancelledDelegationRequest(
  cache: EntityCache,
  blockNumber: number,
  delegatorBytes: Uint8Array,
  amount: bigint
): Promise<void> {
  const staker = await cache.getStaker(delegatorBytes, blockNumber);
  staker.scheduledUnbonds -= amount;
  if (staker.scheduledUnbonds < 0n) {
    staker.scheduledUnbonds = 0n;
  }
  staker.stakedAmount += amount;
  staker.lastUpdatedBlock = blockNumber;
  const totalStake = await cache.getTotalStake(blockNumber);
  totalStake.totalDelegatorStake += amount;
  (cache as any).totalScheduledUnbonds -= amount;
  if ((cache as any).totalScheduledUnbonds < 0n) {
    (cache as any).totalScheduledUnbonds = 0n;
  }
  await recalculateTotalStake(cache, blockNumber);
}

export async function handleCandidateBondLessScheduled(
  cache: EntityCache,
  blockNumber: number,
  candidateBytes: Uint8Array,
  amount: bigint
): Promise<void> {
  const collator = await cache.getCollator(candidateBytes, blockNumber);
  collator.scheduledUnbonds += amount;
  collator.selfBond -= amount;
  if (collator.selfBond < 0n) {
    collator.selfBond = 0n;
  }
  collator.lastUpdatedBlock = blockNumber;
  const totalStake = await cache.getTotalStake(blockNumber);
  totalStake.totalCollatorBond -= amount;
  if (totalStake.totalCollatorBond < 0n) {
    totalStake.totalCollatorBond = 0n;
  }
  (cache as any).totalScheduledUnbonds += amount;
  await recalculateTotalStake(cache, blockNumber);
}

export async function handleCancelledCandidateBondLess(
  cache: EntityCache,
  blockNumber: number,
  candidateBytes: Uint8Array,
  amount: bigint
): Promise<void> {
  const collator = await cache.getCollator(candidateBytes, blockNumber);
  collator.scheduledUnbonds -= amount;
  if (collator.scheduledUnbonds < 0n) {
    collator.scheduledUnbonds = 0n;
  }
  collator.selfBond += amount;
  collator.lastUpdatedBlock = blockNumber;
  const totalStake = await cache.getTotalStake(blockNumber);
  totalStake.totalCollatorBond += amount;
  (cache as any).totalScheduledUnbonds -= amount;
  if ((cache as any).totalScheduledUnbonds < 0n) {
    (cache as any).totalScheduledUnbonds = 0n;
  }
  await recalculateTotalStake(cache, blockNumber);
}
