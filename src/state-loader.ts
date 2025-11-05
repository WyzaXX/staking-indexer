import { ApiPromise, WsProvider } from '@polkadot/api';
import { DataSource } from 'typeorm';
import { Staker, Collator, TotalStake } from './model';
import { calculatePercentage, encodeAddressToSS58, getTokenSymbol } from './utils';

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

export async function loadCurrentChainState(rpcEndpoint: string, targetBlockNumber?: number): Promise<void> {
  const tokenSymbol = getTokenSymbol();
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

    let blockHash: string | undefined;
    let blockNumber: number;

    if (targetBlockNumber !== undefined) {
      blockHash = (await api.rpc.chain.getBlockHash(targetBlockNumber)).toString();
      blockNumber = targetBlockNumber;
      console.log(`Target block: ${blockNumber.toLocaleString()} (hash: ${blockHash.substring(0, 10)}...)`);
    } else {
      const header = await retryWithBackoff(
        async () => {
          return await api!.rpc.chain.getHeader();
        },
        -1,
        3000
      );
      blockNumber = header.number.toNumber();
      console.log(`Current block: ${blockNumber.toLocaleString()}`);
    }

    console.log('Fetching chain total...');
    const chainTotal = await retryWithBackoff(
      async () => {
        const total = blockHash
          ? await (await api!.at(blockHash)).query.parachainStaking.total()
          : await api!.query.parachainStaking.total();
        const totalBigInt = BigInt(total.toString());
        console.log(`Chain total: ${(Number(totalBigInt) / 1e18).toFixed(3)} ${tokenSymbol}`);
        return totalBigInt;
      },
      -1,
      5000
    );

    console.log('Fetching selected candidates...');
    const selectedCandidates = await retryWithBackoff(
      async () => {
        const selected = blockHash
          ? await (await api!.at(blockHash)).query.parachainStaking.selectedCandidates()
          : await api!.query.parachainStaking.selectedCandidates();
        const addresses = selected.toJSON() as string[];
        console.log(`Fetched ${addresses.length} selected candidates`);
        return addresses;
      },
      -1,
      5000
    );

    console.log('Fetching delegator states...');
    const delegatorStates = await retryWithBackoff(
      async () => {
        const states = blockHash
          ? await (await api!.at(blockHash)).query.parachainStaking.delegatorState.entries()
          : await api!.query.parachainStaking.delegatorState.entries();
        console.log(`Fetched ${states.length.toLocaleString()} delegators`);
        return states;
      },
      -1,
      5000
    );

    console.log('Fetching collator candidates...');
    const candidateInfos = await retryWithBackoff(
      async () => {
        const infos = blockHash
          ? await (await api!.at(blockHash)).query.parachainStaking.candidateInfo.entries()
          : await api!.query.parachainStaking.candidateInfo.entries();
        console.log(`Fetched ${infos.length.toLocaleString()} collators`);
        return infos;
      },
      -1,
      5000
    );

    console.log('Fetching delegation scheduled requests...');
    const delegationRequests = await retryWithBackoff(
      async () => {
        const requests = blockHash
          ? await (await api!.at(blockHash)).query.parachainStaking.delegationScheduledRequests.entries()
          : await api!.query.parachainStaking.delegationScheduledRequests.entries();
        console.log(`Fetched ${requests.length.toLocaleString()} scheduled delegation requests`);
        return requests;
      },
      -1,
      5000
    );

    const delegatorScheduledUnbonds = new Map<string, bigint>();
    let totalDelegatorScheduledAmount = 0n;
    for (const [key, value] of delegationRequests) {
      const collatorAddress = key.args[0].toU8a();
      const requests = value.toJSON() as any[];
      if (requests && Array.isArray(requests)) {
        for (const request of requests) {
          if (request && request.delegator && request.action) {
            const delegatorAddressHex = request.delegator;
            let delegatorId: string;

            if (typeof delegatorAddressHex === 'string' && delegatorAddressHex.startsWith('0x')) {
              const delegatorBytes = new Uint8Array(
                delegatorAddressHex
                  .slice(2)
                  .match(/.{1,2}/g)!
                  .map((byte: string) => parseInt(byte, 16))
              );
              delegatorId = encodeAddressToSS58(delegatorBytes);
            } else {
              delegatorId = delegatorAddressHex;
            }

            let amount = 0n;

            if (request.action.revoke) {
              amount = BigInt(request.action.revoke);
            } else if (request.action.decrease) {
              amount = BigInt(request.action.decrease);
            }

            if (amount > 0n) {
              const current = delegatorScheduledUnbonds.get(delegatorId) || 0n;
              delegatorScheduledUnbonds.set(delegatorId, current + amount);
              totalDelegatorScheduledAmount += amount;
            }
          }
        }
      }
    }
    console.log(
      `Total scheduled unbonds from delegators: ${(Number(totalDelegatorScheduledAmount) / 1e18).toFixed(
        3
      )} ${tokenSymbol} from ${delegatorScheduledUnbonds.size} delegators`
    );

    const collatorScheduledUnbonds = new Map<string, bigint>();

    const hasCandidateBondLessRequests =
      api!.query.parachainStaking?.candidateBondLessScheduledRequests !== undefined &&
      typeof api!.query.parachainStaking.candidateBondLessScheduledRequests === 'function';

    if (hasCandidateBondLessRequests) {
      try {
        console.log('Fetching candidate bond less requests...');
        const candidateBondRequests = await retryWithBackoff(
          async () => {
            const requests = blockHash
              ? await (await api!.at(blockHash)).query.parachainStaking.candidateBondLessScheduledRequests!.entries()
              : await api!.query.parachainStaking.candidateBondLessScheduledRequests!.entries();
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

    const existingTotalStake = await dataSource.query('SELECT total_supply FROM total_stake WHERE id = $1', ['total']);
    const totalSupply = existingTotalStake.length > 0 ? BigInt(existingTotalStake[0].total_supply) : 0n;
    console.log(`Using total supply from database: ${(Number(totalSupply) / 1e18).toFixed(3)} ${tokenSymbol}`);

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

    console.log('Calculating active stake from top delegations...');
    let activeStake = 0n;
    let activeCollatorBonds = 0n;

    for (const candidateAddress of selectedCandidates) {
      const topDelegations = blockHash
        ? await (await api!.at(blockHash)).query.parachainStaking.topDelegations(candidateAddress)
        : await api!.query.parachainStaking.topDelegations(candidateAddress);
      const topData = topDelegations.toJSON() as any;

      if (topData && topData.delegations) {
        for (const delegation of topData.delegations) {
          activeStake += BigInt(delegation.amount);
        }
      }

      const candidateInfo = blockHash
        ? await (await api!.at(blockHash)).query.parachainStaking.candidateInfo(candidateAddress)
        : await api!.query.parachainStaking.candidateInfo(candidateAddress);
      const info = candidateInfo.toJSON() as any;
      if (info && info.bond) {
        activeCollatorBonds += BigInt(info.bond);
      }
    }

    console.log(
      `Active stake (earning rewards): ${(Number(activeStake + activeCollatorBonds) / 1e18).toFixed(3)} ${tokenSymbol}`
    );
    console.log(`  - Delegations: ${(Number(activeStake) / 1e18).toFixed(3)} ${tokenSymbol}`);
    console.log(`  - Collator bonds: ${(Number(activeCollatorBonds) / 1e18).toFixed(3)} ${tokenSymbol}`);

    const totalStaked = activeStake + activeCollatorBonds;
    const totalBonded = chainTotal;

    const totalStake = new TotalStake();
    totalStake.id = 'total';
    totalStake.totalStaked = totalStaked;
    totalStake.totalBonded = totalBonded;
    totalStake.totalDelegatorStake = activeStake;
    totalStake.totalCollatorBond = activeCollatorBonds;
    totalStake.totalSupply = totalSupply;
    totalStake.stakedPercentage = calculatePercentage(totalStaked, totalSupply);
    totalStake.bondedPercentage = calculatePercentage(totalBonded, totalSupply);
    totalStake.activeStakerCount = stakers.length;
    totalStake.activeCollatorCount = selectedCandidates.length;
    totalStake.lastUpdatedBlock = blockNumber;

    console.log('Comparing with existing database...');

    const existingStakers = await dataSource.query(`SELECT id FROM staker`);
    const existingStakerIds = new Set<string>(existingStakers.map((row: any) => row.id));

    const stakersToInsert: Staker[] = [];
    const stakersToUpdate: Staker[] = [];

    for (const staker of stakers) {
      if (!existingStakerIds.has(staker.id)) {
        stakersToInsert.push(staker);
      } else {
        stakersToUpdate.push(staker);
      }
    }

    console.log(
      `Stakers: ${stakersToInsert.length} new (missing from event-driven data), ${stakersToUpdate.length} to update with scheduled unbonds`
    );

    if (stakersToInsert.length > 0) {
      console.log(`Inserting ${stakersToInsert.length.toLocaleString()} new stakers...`);
      const batchSize = 500;
      for (let i = 0; i < stakersToInsert.length; i += batchSize) {
        const batch = stakersToInsert.slice(i, Math.min(i + batchSize, stakersToInsert.length));

        const values: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        for (const staker of batch) {
          values.push(
            `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${
              paramIndex + 5
            })`
          );
          params.push(
            staker.id,
            staker.stakedAmount.toString(),
            staker.scheduledUnbonds.toString(),
            staker.totalDelegated.toString(),
            staker.totalUndelegated.toString(),
            staker.lastUpdatedBlock
          );
          paramIndex += 6;
        }

        await dataSource.query(
          `INSERT INTO staker (id, staked_amount, scheduled_unbonds, total_delegated, total_undelegated, last_updated_block)
          VALUES ${values.join(', ')}`,
          params
        );

        const progress = Math.min(i + batchSize, stakersToInsert.length);
        console.log(`${progress.toLocaleString()} / ${stakersToInsert.length.toLocaleString()} new stakers inserted`);
      }
    }

    if (stakersToUpdate.length > 0) {
      console.log(`Updating ${stakersToUpdate.length.toLocaleString()} existing stakers with scheduled unbonds...`);
      const batchSize = 500;
      for (let i = 0; i < stakersToUpdate.length; i += batchSize) {
        const batch = stakersToUpdate.slice(i, Math.min(i + batchSize, stakersToUpdate.length));

        for (const staker of batch) {
          await dataSource.query(`UPDATE staker SET scheduled_unbonds = $1 WHERE id = $2`, [
            staker.scheduledUnbonds.toString(),
            staker.id,
          ]);
        }

        const progress = Math.min(i + batchSize, stakersToUpdate.length);
        console.log(`${progress.toLocaleString()} / ${stakersToUpdate.length.toLocaleString()} stakers updated`);
      }
    }

    const existingCollators = await dataSource.query(`SELECT id FROM collator`);
    const existingCollatorIds = new Set<string>(existingCollators.map((row: any) => row.id));

    const collatorsToInsert: Collator[] = [];
    const collatorsToUpdate: Collator[] = [];

    for (const collator of collators) {
      if (!existingCollatorIds.has(collator.id)) {
        collatorsToInsert.push(collator);
      } else {
        collatorsToUpdate.push(collator);
      }
    }

    console.log(
      `Collators: ${collatorsToInsert.length} new (missing from event-driven data), ${collatorsToUpdate.length} to update with scheduled unbonds`
    );

    if (collatorsToInsert.length > 0) {
      console.log(`Inserting ${collatorsToInsert.length.toLocaleString()} new collators...`);

      const values: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      for (const collator of collatorsToInsert) {
        values.push(
          `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${
            paramIndex + 5
          })`
        );
        params.push(
          collator.id,
          collator.selfBond.toString(),
          collator.scheduledUnbonds.toString(),
          collator.totalBonded.toString(),
          collator.totalUnbonded.toString(),
          collator.lastUpdatedBlock
        );
        paramIndex += 6;
      }

      await dataSource.query(
        `INSERT INTO collator (id, self_bond, scheduled_unbonds, total_bonded, total_unbonded, last_updated_block)
        VALUES ${values.join(', ')}`,
        params
      );

      console.log(`All ${collatorsToInsert.length.toLocaleString()} new collators inserted`);
    }

    if (collatorsToUpdate.length > 0) {
      console.log(`Updating ${collatorsToUpdate.length.toLocaleString()} existing collators with scheduled unbonds...`);

      for (const collator of collatorsToUpdate) {
        await dataSource.query(`UPDATE collator SET scheduled_unbonds = $1 WHERE id = $2`, [
          collator.scheduledUnbonds.toString(),
          collator.id,
        ]);
      }

      console.log(`All ${collatorsToUpdate.length} collators updated`);
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

    console.log('\nChain state merge completed');
    console.log(`Block: ${blockNumber.toLocaleString()}`);
    console.log(`\nMissing data inserted: ${stakersToInsert.length} stakers, ${collatorsToInsert.length} collators`);
    console.log(
      `Event-driven data preserved: ${stakers.length - stakersToInsert.length} stakers, ${
        collators.length - collatorsToInsert.length
      } collators`
    );
    console.log(
      `\nTotal Staked: ${(
        Number(totalStake.totalStaked) / 1e18
      ).toLocaleString()} ${tokenSymbol} (${totalStake.stakedPercentage.toFixed(2)}%)`
    );
    console.log(
      `Total Bonded: ${(
        Number(totalStake.totalBonded) / 1e18
      ).toLocaleString()} ${tokenSymbol} (${totalStake.bondedPercentage.toFixed(2)}%)`
    );

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
