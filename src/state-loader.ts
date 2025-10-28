import { ApiPromise, WsProvider } from '@polkadot/api';
import { DataSource } from 'typeorm';
import { Staker, Collator, TotalStake } from './model';
import { calculatePercentage, encodeAddressToSS58 } from './utils';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 2000,
  maxDelay: number = 30000 // Cap at 30s between retries
): Promise<T> {
  let lastError: any;
  let attempt = 0;

  while (maxRetries === -1 || attempt < maxRetries) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      attempt++;

      // Calculate delay with exponential backoff, capped at maxDelay
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);

      if (maxRetries === -1) {
        console.log(`Attempt ${attempt} failed, retrying in ${delay / 1000}s...`);
      } else if (attempt < maxRetries) {
        console.log(`Attempt ${attempt}/${maxRetries} failed, retrying in ${delay / 1000}s...`);
      }

      await sleep(delay);
    }
  }

  throw lastError;
}

export async function loadCurrentChainState(rpcEndpoint: string, totalSupply: bigint): Promise<void> {
  console.log('Loading chain state from RPC...');
  console.log(`RPC: ${rpcEndpoint}`);

  if (process.env.CHAIN === 'moonbeam') {
    rpcEndpoint = 'wss://wss.api.moonbeam.network';
  }

  const provider = new WsProvider(rpcEndpoint, 2500, {}, 60000);
  let api: ApiPromise | null = null;

  try {
    api = await retryWithBackoff(
      async () => {
        console.log('Connecting to RPC...');
        const apiInstance = await ApiPromise.create({
          provider,
          noInitWarn: true,
        });
        console.log('Connected to RPC');
        return apiInstance;
      },
      -1,
      3000
    );

    const header = await retryWithBackoff(
      async () => {
        return await api!.rpc.chain.getHeader();
      },
      -1,
      3000
    );

    const blockNumber = header.number.toNumber();
    console.log(`Current block: ${blockNumber.toLocaleString()}`);

    console.log('Fetching delegator states...');
    const delegatorStates = await retryWithBackoff(
      async () => {
        const states = await api!.query.parachainStaking.delegatorState.entries();
        console.log(`Fetched ${states.length.toLocaleString()} delegators`);
        return states;
      },
      -1,
      5000
    );

    console.log('Fetching collator candidates...');
    const candidateInfos = await retryWithBackoff(
      async () => {
        const infos = await api!.query.parachainStaking.candidateInfo.entries();
        console.log(`Fetched ${infos.length.toLocaleString()} collators`);
        return infos;
      },
      -1,
      5000
    );

    console.log('Fetching delegation scheduled requests...');
    const delegationRequests = await retryWithBackoff(
      async () => {
        const requests = await api!.query.parachainStaking.delegationScheduledRequests.entries();
        console.log(`Fetched ${requests.length.toLocaleString()} scheduled delegation requests`);
        return requests;
      },
      -1,
      5000
    );

    const delegatorScheduledUnbonds = new Map<string, bigint>();
    for (const [key, value] of delegationRequests) {
      const requests = value.toJSON() as any[];
      if (requests && Array.isArray(requests)) {
        for (const request of requests) {
          if (request && request.delegator && request.action) {
            const delegatorAddress = request.delegator;
            let amount = 0n;

            if (request.action.revoke) {
              amount = BigInt(request.action.revoke);
            } else if (request.action.decrease) {
              amount = BigInt(request.action.decrease);
            }

            if (amount > 0n) {
              const current = delegatorScheduledUnbonds.get(delegatorAddress) || 0n;
              delegatorScheduledUnbonds.set(delegatorAddress, current + amount);
            }
          }
        }
      }
    }

    const collatorScheduledUnbonds = new Map<string, bigint>();

    const hasCandidateBondLessRequests =
      api!.query.parachainStaking?.candidateBondLessScheduledRequests !== undefined &&
      typeof api!.query.parachainStaking.candidateBondLessScheduledRequests === 'function';

    if (hasCandidateBondLessRequests) {
      try {
        console.log('Fetching candidate bond less requests...');
        const candidateBondRequests = await retryWithBackoff(
          async () => {
            const requests = await api!.query.parachainStaking.candidateBondLessScheduledRequests!.entries();
            console.log(`Fetched ${requests.length.toLocaleString()} candidate bond less requests`);
            return requests;
          },
          3,
          5000
        );

        for (const [key, value] of candidateBondRequests) {
          const candidateAddress = key.args[0].toU8a();
          const candidateId = encodeAddressToSS58(candidateAddress);
          const request = value.toJSON() as any;
          if (request && request.amount) {
            collatorScheduledUnbonds.set(candidateId, BigInt(request.amount));
          }
        }
      } catch (error: any) {
        console.log(`Could not fetch candidate bond less requests: ${error.message}`);
        console.log('Continuing without collator scheduled unbonds...');
      }
    }

    // Initialize database connection
    const dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'staking',
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASS || 'postgres',
      entities: [Staker, Collator, TotalStake],
      synchronize: false,
    });

    await dataSource.initialize();
    console.log('Database connected');

    let totalDelegatorStake = 0n;
    let totalCollatorBond = 0n;
    const stakers: Staker[] = [];
    const collators: Collator[] = [];

    for (const [key, value] of delegatorStates) {
      const delegatorAddress = key.args[0].toU8a();
      const state = value.toJSON() as any;

      if (state && state.delegations) {
        let totalStake = 0n;
        for (const delegation of state.delegations) {
          totalStake += BigInt(delegation.amount);
        }

        if (totalStake > 0n) {
          const staker = new Staker();
          const stakerId = encodeAddressToSS58(delegatorAddress);
          const scheduledUnbonds = delegatorScheduledUnbonds.get(stakerId) || 0n;
          staker.id = stakerId;
          staker.stakedAmount = totalStake;
          staker.scheduledUnbonds = scheduledUnbonds;
          staker.totalDelegated = totalStake;
          staker.totalUndelegated = 0n;
          staker.lastUpdatedBlock = blockNumber;

          stakers.push(staker);
          totalDelegatorStake += totalStake;
        }
      }
    }

    for (const [key, value] of candidateInfos) {
      const collatorAddress = key.args[0].toU8a();
      const info = value.toJSON() as any;

      if (info && info.bond) {
        const bond = BigInt(info.bond);

        if (bond > 0n) {
          const collator = new Collator();
          const collatorId = encodeAddressToSS58(collatorAddress);
          const scheduledUnbonds = collatorScheduledUnbonds.get(collatorId) || 0n;
          collator.id = collatorId;
          collator.selfBond = bond;
          collator.scheduledUnbonds = scheduledUnbonds;
          collator.totalBonded = bond;
          collator.totalUnbonded = 0n;
          collator.lastUpdatedBlock = blockNumber;

          collators.push(collator);
          totalCollatorBond += bond;
        }
      }
    }

    let totalScheduledUnbonds = 0n;
    for (const staker of stakers) {
      totalScheduledUnbonds += staker.scheduledUnbonds;
    }
    for (const collator of collators) {
      totalScheduledUnbonds += collator.scheduledUnbonds;
    }
    const totalStaked = totalDelegatorStake + totalCollatorBond;
    const totalBonded = totalStaked + totalScheduledUnbonds;

    const totalStake = new TotalStake();
    totalStake.id = 'total';
    totalStake.totalStaked = totalStaked;
    totalStake.totalBonded = totalBonded;
    totalStake.totalDelegatorStake = totalDelegatorStake;
    totalStake.totalCollatorBond = totalCollatorBond;
    totalStake.totalSupply = totalSupply;
    totalStake.stakedPercentage = calculatePercentage(totalStaked, totalSupply);
    totalStake.bondedPercentage = calculatePercentage(totalBonded, totalSupply);
    totalStake.activeStakerCount = stakers.length;
    totalStake.activeCollatorCount = collators.length;
    totalStake.lastUpdatedBlock = blockNumber;

    console.log('Writing to database...');

    if (stakers.length > 0) {
      console.log(`Saving ${stakers.length.toLocaleString()} stakers...`);
      const batchSize = 1000;
      for (let i = 0; i < stakers.length; i += batchSize) {
        const batch = stakers.slice(i, Math.min(i + batchSize, stakers.length));

        for (const staker of batch) {
          await dataSource.query(
            `INSERT INTO staker (id, staked_amount, scheduled_unbonds, total_delegated, total_undelegated, last_updated_block)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO UPDATE SET
              staked_amount = EXCLUDED.staked_amount,
              scheduled_unbonds = EXCLUDED.scheduled_unbonds,
              total_delegated = EXCLUDED.total_delegated,
              total_undelegated = EXCLUDED.total_undelegated,
              last_updated_block = EXCLUDED.last_updated_block`,
            [
              staker.id,
              staker.stakedAmount.toString(),
              staker.scheduledUnbonds.toString(),
              staker.totalDelegated.toString(),
              staker.totalUndelegated.toString(),
              staker.lastUpdatedBlock,
            ]
          );
        }

        const progress = Math.min(i + batchSize, stakers.length);
        console.log(`${progress.toLocaleString()} / ${stakers.length.toLocaleString()} stakers saved`);
      }
    }

    if (collators.length > 0) {
      console.log(`Saving ${collators.length.toLocaleString()} collators...`);
      for (const collator of collators) {
        await dataSource.query(
          `INSERT INTO collator (id, self_bond, scheduled_unbonds, total_bonded, total_unbonded, last_updated_block)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO UPDATE SET
            self_bond = EXCLUDED.self_bond,
            scheduled_unbonds = EXCLUDED.scheduled_unbonds,
            total_bonded = EXCLUDED.total_bonded,
            total_unbonded = EXCLUDED.total_unbonded,
            last_updated_block = EXCLUDED.last_updated_block`,
          [
            collator.id,
            collator.selfBond.toString(),
            collator.scheduledUnbonds.toString(),
            collator.totalBonded.toString(),
            collator.totalUnbonded.toString(),
            collator.lastUpdatedBlock,
          ]
        );
      }
      console.log(`All ${collators.length.toLocaleString()} collators saved`);
    }

    await dataSource.query(
      `INSERT INTO total_stake (id, total_staked, total_bonded, total_delegator_stake, total_collator_bond,
                               total_supply, staked_percentage, bonded_percentage, active_staker_count, active_collator_count, last_updated_block)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO UPDATE SET
        total_staked = EXCLUDED.total_staked,
        total_bonded = EXCLUDED.total_bonded,
        total_delegator_stake = EXCLUDED.total_delegator_stake,
        total_collator_bond = EXCLUDED.total_collator_bond,
        total_supply = EXCLUDED.total_supply,
        staked_percentage = EXCLUDED.staked_percentage,
        bonded_percentage = EXCLUDED.bonded_percentage,
        active_staker_count = EXCLUDED.active_staker_count,
        active_collator_count = EXCLUDED.active_collator_count,
        last_updated_block = EXCLUDED.last_updated_block`,
      [
        totalStake.id,
        totalStake.totalStaked.toString(),
        totalStake.totalBonded.toString(),
        totalStake.totalDelegatorStake.toString(),
        totalStake.totalCollatorBond.toString(),
        totalStake.totalSupply.toString(),
        totalStake.stakedPercentage,
        totalStake.bondedPercentage,
        totalStake.activeStakerCount,
        totalStake.activeCollatorCount,
        totalStake.lastUpdatedBlock,
      ]
    );

    console.log('Chain state loaded successfully');
    console.log(`Block: ${blockNumber.toLocaleString()}`);
    console.log(
      `Delegators: ${stakers.length.toLocaleString()} (${(Number(totalDelegatorStake) / 1e18).toLocaleString()} GLMR)`
    );
    console.log(
      `Collators: ${collators.length.toLocaleString()} (${(Number(totalCollatorBond) / 1e18).toLocaleString()} GLMR)`
    );
    console.log(`Total Staked: ${(Number(totalStake.totalStaked) / 1e18).toLocaleString()} GLMR`);
    console.log(`Total Bonded: ${(Number(totalStake.totalBonded) / 1e18).toLocaleString()} GLMR`);
    console.log(`Staked %: ${totalStake.stakedPercentage.toFixed(2)}%`);
    console.log(`Bonded %: ${totalStake.bondedPercentage.toFixed(2)}%`);

    await dataSource.destroy();
  } catch (error) {
    console.error('Error loading chain state:', error);
    throw error;
  } finally {
    if (api) {
      await api.disconnect();
    }
  }
}
