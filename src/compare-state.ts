import { ApiPromise, WsProvider } from '@polkadot/api';
import { DataSource } from 'typeorm';
import { Staker, Collator } from './model';
import { encodeAddressToSS58, getTokenSymbol } from './utils';
import * as fs from 'fs';

interface ChainStaker {
  address: string;
  stakedAmount: string;
}

interface ChainCollator {
  address: string;
  selfBond: string;
}

interface ComparisonResult {
  chainState: {
    stakers: ChainStaker[];
    collators: ChainCollator[];
    totalDelegatorStake: string;
    totalCollatorBond: string;
    blockNumber: number;
  };
  indexerState: {
    stakers: Array<{ address: string; stakedAmount: string; totalDelegated: string; totalUndelegated: string }>;
    collators: Array<{ address: string; selfBond: string; totalBonded: string; totalUnbonded: string }>;
    totalDelegatorStake: string;
    totalCollatorBond: string;
  };
  differences: {
    stakersMissingInIndexer: ChainStaker[];
    stakersOnlyInIndexer: string[];
    stakerAmountDifferences: Array<{
      address: string;
      chainAmount: string;
      indexerAmount: string;
      difference: string;
    }>;
    collatorsMissingInIndexer: ChainCollator[];
    collatorsOnlyInIndexer: string[];
    collatorAmountDifferences: Array<{
      address: string;
      chainBond: string;
      indexerBond: string;
      difference: string;
    }>;
    totalDelegatorStakeDiff: string;
    totalCollatorBondDiff: string;
  };
}

export async function compareChainStateWithIndexer(rpcEndpoint: string): Promise<void> {
  const tokenSymbol = getTokenSymbol();
  console.log('Comparing chain state with indexer database...\n');

  console.log('Step 1: Querying chain state via RPC...');
  const provider = new WsProvider(rpcEndpoint);
  const api = await ApiPromise.create({ provider });

  const header = await api.rpc.chain.getHeader();
  const blockNumber = header.number.toNumber();
  console.log(`Current block: ${blockNumber.toLocaleString()}`);

  const delegatorStates = await api.query.parachainStaking.delegatorState.entries();
  console.log(`Found ${delegatorStates.length} delegators in chain`);

  const candidateInfos = await api.query.parachainStaking.candidateInfo.entries();
  console.log(`Found ${candidateInfos.length} collators in chain`);

  const chainStakers: ChainStaker[] = [];
  let chainTotalDelegatorStake = 0n;

  for (const [key, value] of delegatorStates) {
    const address = encodeAddressToSS58(key.args[0].toU8a());
    const state = value.toJSON() as any;

    if (state && state.delegations) {
      let totalStake = 0n;
      for (const delegation of state.delegations) {
        totalStake += BigInt(delegation.amount);
      }

      if (totalStake > 0n) {
        chainStakers.push({
          address,
          stakedAmount: totalStake.toString(),
        });
        chainTotalDelegatorStake += totalStake;
      }
    }
  }

  const chainCollators: ChainCollator[] = [];
  let chainTotalCollatorBond = 0n;

  for (const [key, value] of candidateInfos) {
    const address = encodeAddressToSS58(key.args[0].toU8a());
    const info = value.toJSON() as any;

    if (info && info.bond) {
      const bond = BigInt(info.bond);
      if (bond > 0n) {
        chainCollators.push({
          address,
          selfBond: bond.toString(),
        });
        chainTotalCollatorBond += bond;
      }
    }
  }

  await api.disconnect();
  console.log('Chain state loaded\n');

  console.log('Step 2: Querying indexer database...');
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'staking',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'postgres',
    entities: [Staker, Collator],
    synchronize: false,
  });

  await dataSource.initialize();

  // Query using raw SQL to avoid camelCase/snake_case issues
  const indexerStakersRaw = await dataSource.query(`
    SELECT id, staked_amount, total_delegated, total_undelegated 
    FROM staker
  `);

  const indexerCollatorsRaw = await dataSource.query(`
    SELECT id, self_bond, total_bonded, total_unbonded 
    FROM collator
  `);

  interface IndexerStaker {
    id: string;
    stakedAmount: bigint;
    totalDelegated: bigint;
    totalUndelegated: bigint;
  }

  interface IndexerCollator {
    id: string;
    selfBond: bigint;
    totalBonded: bigint;
    totalUnbonded: bigint;
  }

  const indexerStakers: IndexerStaker[] = indexerStakersRaw.map((row: any) => ({
    id: row.id,
    stakedAmount: BigInt(row.staked_amount),
    totalDelegated: BigInt(row.total_delegated),
    totalUndelegated: BigInt(row.total_undelegated),
  }));

  const indexerCollators: IndexerCollator[] = indexerCollatorsRaw.map((row: any) => ({
    id: row.id,
    selfBond: BigInt(row.self_bond),
    totalBonded: BigInt(row.total_bonded),
    totalUnbonded: BigInt(row.total_unbonded),
  }));

  const indexerTotalDelegatorStake = indexerStakers.reduce((sum: bigint, s: IndexerStaker) => sum + s.stakedAmount, 0n);
  const indexerTotalCollatorBond = indexerCollators.reduce((sum: bigint, c: IndexerCollator) => sum + c.selfBond, 0n);

  console.log(`Found ${indexerStakers.length} stakers in indexer`);
  console.log(`Found ${indexerCollators.length} collators in indexer`);
  console.log('Indexer data loaded\n');

  console.log('Step 3: Analyzing differences...\n');

  const chainStakerMap = new Map(chainStakers.map((s) => [s.address, s]));
  const indexerStakerMap = new Map(indexerStakers.map((s) => [s.id, s]));

  const stakersMissingInIndexer: ChainStaker[] = [];
  const stakersOnlyInIndexer: string[] = [];
  const stakerAmountDifferences: Array<{
    address: string;
    chainAmount: string;
    indexerAmount: string;
    difference: string;
  }> = [];

  // Find stakers in chain but not in indexer
  for (const chainStaker of chainStakers) {
    const indexerStaker = indexerStakerMap.get(chainStaker.address);
    if (!indexerStaker) {
      stakersMissingInIndexer.push(chainStaker);
    } else {
      const chainAmount = BigInt(chainStaker.stakedAmount);
      const indexerAmount = indexerStaker.stakedAmount;
      if (chainAmount !== indexerAmount) {
        const diff = chainAmount - indexerAmount;
        stakerAmountDifferences.push({
          address: chainStaker.address,
          chainAmount: chainAmount.toString(),
          indexerAmount: indexerAmount.toString(),
          difference: diff.toString(),
        });
      }
    }
  }

  // Find stakers in indexer but not in chain
  for (const indexerStaker of indexerStakers) {
    if (!chainStakerMap.has(indexerStaker.id) && indexerStaker.stakedAmount > 0n) {
      stakersOnlyInIndexer.push(indexerStaker.id);
    }
  }

  const chainCollatorMap = new Map(chainCollators.map((c) => [c.address, c]));
  const indexerCollatorMap = new Map(indexerCollators.map((c) => [c.id, c]));

  const collatorsMissingInIndexer: ChainCollator[] = [];
  const collatorsOnlyInIndexer: string[] = [];
  const collatorAmountDifferences: Array<{
    address: string;
    chainBond: string;
    indexerBond: string;
    difference: string;
  }> = [];

  // Find collators in chain but not in indexer
  for (const chainCollator of chainCollators) {
    const indexerCollator = indexerCollatorMap.get(chainCollator.address);
    if (!indexerCollator) {
      collatorsMissingInIndexer.push(chainCollator);
    } else {
      const chainBond = BigInt(chainCollator.selfBond);
      const indexerBond = indexerCollator.selfBond;
      if (chainBond !== indexerBond) {
        const diff = chainBond - indexerBond;
        collatorAmountDifferences.push({
          address: chainCollator.address,
          chainBond: chainBond.toString(),
          indexerBond: indexerBond.toString(),
          difference: diff.toString(),
        });
      }
    }
  }

  // Find collators in indexer but not in chain
  for (const indexerCollator of indexerCollators) {
    if (!chainCollatorMap.has(indexerCollator.id) && indexerCollator.selfBond > 0n) {
      collatorsOnlyInIndexer.push(indexerCollator.id);
    }
  }

  const result: ComparisonResult = {
    chainState: {
      stakers: chainStakers,
      collators: chainCollators,
      totalDelegatorStake: chainTotalDelegatorStake.toString(),
      totalCollatorBond: chainTotalCollatorBond.toString(),
      blockNumber,
    },
    indexerState: {
      stakers: indexerStakers.map((s) => ({
        address: s.id,
        stakedAmount: s.stakedAmount.toString(),
        totalDelegated: s.totalDelegated.toString(),
        totalUndelegated: s.totalUndelegated.toString(),
      })),
      collators: indexerCollators.map((c) => ({
        address: c.id,
        selfBond: c.selfBond.toString(),
        totalBonded: c.totalBonded.toString(),
        totalUnbonded: c.totalUnbonded.toString(),
      })),
      totalDelegatorStake: indexerTotalDelegatorStake.toString(),
      totalCollatorBond: indexerTotalCollatorBond.toString(),
    },
    differences: {
      stakersMissingInIndexer,
      stakersOnlyInIndexer,
      stakerAmountDifferences,
      collatorsMissingInIndexer,
      collatorsOnlyInIndexer,
      collatorAmountDifferences,
      totalDelegatorStakeDiff: (chainTotalDelegatorStake - indexerTotalDelegatorStake).toString(),
      totalCollatorBondDiff: (chainTotalCollatorBond - indexerTotalCollatorBond).toString(),
    },
  };

  const filename = `state-comparison-${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(result, null, 2));
  console.log(`Full comparison saved to: ${filename}\n`);

  console.log('COMPARISON SUMMARY:');
  console.log('================================================================\n');

  console.log('DELEGATORS:');
  console.log(
    `Chain:   ${chainStakers.length.toLocaleString()} stakers, ${(
      Number(chainTotalDelegatorStake) / 1e18
    ).toLocaleString()} ${tokenSymbol}`
  );
  console.log(
    `Indexer: ${indexerStakers.filter((s) => s.stakedAmount > 0n).length.toLocaleString()} stakers, ${(
      Number(indexerTotalDelegatorStake) / 1e18
    ).toLocaleString()} ${tokenSymbol}`
  );
  console.log(
    `Diff:    ${(
      Number(chainTotalDelegatorStake - indexerTotalDelegatorStake) / 1e18
    ).toLocaleString()} ${tokenSymbol}\n`
  );

  console.log(`Missing in indexer: ${stakersMissingInIndexer.length.toLocaleString()} accounts`);
  if (stakersMissingInIndexer.length > 0) {
    const missingStake = stakersMissingInIndexer.reduce((sum, s) => sum + BigInt(s.stakedAmount), 0n);
    console.log(`  Total missing stake: ${(Number(missingStake) / 1e18).toLocaleString()} ${tokenSymbol}`);
    console.log(`  Top 5 missing accounts:`);
    stakersMissingInIndexer
      .sort((a, b) => Number(BigInt(b.stakedAmount) - BigInt(a.stakedAmount)))
      .slice(0, 5)
      .forEach((s) => {
        console.log(`    ${s.address}: ${(Number(BigInt(s.stakedAmount)) / 1e18).toLocaleString()} ${tokenSymbol}`);
      });
  }

  console.log(`\nOnly in indexer: ${stakersOnlyInIndexer.length.toLocaleString()} accounts`);
  if (stakersOnlyInIndexer.length > 0 && stakersOnlyInIndexer.length <= 10) {
    stakersOnlyInIndexer.forEach((addr) => console.log(`  ${addr}`));
  }

  console.log(`\nAmount differences: ${stakerAmountDifferences.length.toLocaleString()} accounts`);
  if (stakerAmountDifferences.length > 0) {
    console.log(`  Top 5 by absolute difference:`);
    stakerAmountDifferences
      .sort((a, b) => {
        const absA = BigInt(a.difference) < 0n ? -BigInt(a.difference) : BigInt(a.difference);
        const absB = BigInt(b.difference) < 0n ? -BigInt(b.difference) : BigInt(b.difference);
        return Number(absB - absA);
      })
      .slice(0, 5)
      .forEach((d) => {
        const diffGlmr = Number(BigInt(d.difference)) / 1e18;
        console.log(`    ${d.address}: ${diffGlmr > 0 ? '+' : ''}${diffGlmr.toLocaleString()} ${tokenSymbol}`);
      });
  }

  console.log('\nCOLLATORS:');
  console.log(
    `Chain:   ${chainCollators.length.toLocaleString()} collators, ${(
      Number(chainTotalCollatorBond) / 1e18
    ).toLocaleString()} ${tokenSymbol}`
  );
  console.log(
    `Indexer: ${indexerCollators.filter((c) => c.selfBond > 0n).length.toLocaleString()} collators, ${(
      Number(indexerTotalCollatorBond) / 1e18
    ).toLocaleString()} ${tokenSymbol}`
  );
  console.log(
    `Diff:    ${(Number(chainTotalCollatorBond - indexerTotalCollatorBond) / 1e18).toLocaleString()} ${tokenSymbol}\n`
  );

  console.log(`Missing in indexer: ${collatorsMissingInIndexer.length.toLocaleString()} collators`);
  if (collatorsMissingInIndexer.length > 0) {
    const missingBond = collatorsMissingInIndexer.reduce((sum, c) => sum + BigInt(c.selfBond), 0n);
    console.log(`  Total missing bond: ${(Number(missingBond) / 1e18).toLocaleString()} ${tokenSymbol}`);
    collatorsMissingInIndexer.forEach((c) => {
      console.log(`    ${c.address}: ${(Number(BigInt(c.selfBond)) / 1e18).toLocaleString()} ${tokenSymbol}`);
    });
  }

  console.log(`\nOnly in indexer: ${collatorsOnlyInIndexer.length.toLocaleString()} collators`);
  if (collatorsOnlyInIndexer.length > 0) {
    collatorsOnlyInIndexer.forEach((addr) => {
      const collator = indexerCollatorMap.get(addr);
      console.log(`  ${addr}: ${(Number(collator!.selfBond) / 1e18).toLocaleString()} ${tokenSymbol}`);
    });
  }

  console.log(`\nAmount differences: ${collatorAmountDifferences.length.toLocaleString()} collators`);
  if (collatorAmountDifferences.length > 0) {
    collatorAmountDifferences.forEach((d) => {
      const diffGlmr = Number(BigInt(d.difference)) / 1e18;
      console.log(`  ${d.address}: ${diffGlmr > 0 ? '+' : ''}${diffGlmr.toLocaleString()} ${tokenSymbol}`);
    });
  }

  console.log('\n================================================================');

  await dataSource.destroy();
}
