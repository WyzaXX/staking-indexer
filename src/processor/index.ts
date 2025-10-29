import { SubstrateBatchProcessor } from '@subsquid/substrate-processor';
import { TypeormDatabase } from '@subsquid/typeorm-store';
import { config } from '../utils';
import { fieldSelection, ProcessorContext } from './types';
import { handleEvent } from '../handlers';
import { EntityCache } from '../actions';
import { loadCurrentChainState } from '../state-loader';

const ARCHIVE_GATEWAYS: Record<string, string> = {
  moonbeam: 'https://v2.archive.subsquid.io/network/moonbeam-substrate',
};

let archiveFailureCount = 0;
let useArchive = true;
let lastArchiveRetryTime = 0;
const ARCHIVE_FAILURE_THRESHOLD = 3;
const ARCHIVE_RETRY_INTERVAL = 5 * 60 * 1000;
const HISTORICAL_BLOCK_THRESHOLD = 100;
const LIVE_MODE_THRESHOLD = 50;
let stateMerged = false;
let lastChainHeightCheck = 0;
const CHAIN_HEIGHT_CHECK_INTERVAL = 60 * 1000;

function createProcessor(withArchive: boolean): SubstrateBatchProcessor {
  const proc = new SubstrateBatchProcessor()
    .setFields(fieldSelection)
    .setRpcEndpoint({
      url: config.chain.rpcEndpoint,
      rateLimit: 20,
      requestTimeout: 60000,
      maxBatchCallSize: 100,
    })
    .setBlockRange({
      from: config.blockRange.from,
      to: config.blockRange.to,
    });

  if (withArchive) {
    const chainName = config.chain.name;
    if (config.chain.archiveGateway) {
      proc.setGateway(config.chain.archiveGateway);
      console.log(`Archive enabled: ${config.chain.archiveGateway}`);
    } else if (chainName && ARCHIVE_GATEWAYS[chainName]) {
      proc.setGateway(ARCHIVE_GATEWAYS[chainName]);
      console.log(`Archive enabled: ${ARCHIVE_GATEWAYS[chainName]}`);
    }
  } else {
    console.warn(`Archive disabled - using RPC only mode`);
  }

  proc.addEvent({
    name: [
      'ParachainStaking.Delegation',
      'ParachainStaking.DelegationRevoked',
      'ParachainStaking.DelegationRevocationScheduled',
      'ParachainStaking.DelegationIncreased',
      'ParachainStaking.DelegationDecreased',
      'ParachainStaking.DelegationDecreaseScheduled',
      'ParachainStaking.DelegationKicked',
      'ParachainStaking.Compounded',
      'ParachainStaking.DelegatorLeft',
      'ParachainStaking.DelegatorLeftCandidate',
      'ParachainStaking.CancelledDelegationRequest',
      'ParachainStaking.JoinedCollatorCandidates',
      'ParachainStaking.CandidateBondedMore',
      'ParachainStaking.CandidateBondedLess',
      'ParachainStaking.CandidateLeft',
      'ParachainStaking.CandidateBondLessScheduled',
      'ParachainStaking.CancelledCandidateBondLess',
    ],
    extrinsic: true,
  });

  return proc;
}

let processor = createProcessor(useArchive);

async function runWithArchiveFallback() {
  const database = new TypeormDatabase({
    supportHotBlocks: true,
    stateSchema: 'staking_processor',
  });

  try {
    await processor.run(database, async (ctx: ProcessorContext) => {
      const firstBlock = ctx.blocks[0]?.header.height;
      const lastBlock = ctx.blocks[ctx.blocks.length - 1]?.header.height;
      const blockRange = lastBlock - firstBlock + 1;

      if (!useArchive && blockRange > HISTORICAL_BLOCK_THRESHOLD) {
        const now = Date.now();
        if (now - lastArchiveRetryTime > ARCHIVE_RETRY_INTERVAL) {
          console.log(`Attempting to re-enable archive (processing historical blocks)...`);
          lastArchiveRetryTime = now;
          archiveFailureCount = 0;
          useArchive = true;
          processor = createProcessor(true);
          throw new Error('RESTART_WITH_ARCHIVE');
        }
      }

      if (!stateMerged && blockRange <= LIVE_MODE_THRESHOLD) {
        const now = Date.now();
        if (now - lastChainHeightCheck > CHAIN_HEIGHT_CHECK_INTERVAL) {
          lastChainHeightCheck = now;

          console.log('');
          console.log(`Live mode detected (batch size: ${blockRange}), merging chain state...`);

          let wsEndpoint = config.chain.rpcEndpoint;
          if (wsEndpoint.startsWith('http://')) {
            wsEndpoint = wsEndpoint.replace('http://', 'ws://');
          } else if (wsEndpoint.startsWith('https://')) {
            wsEndpoint = wsEndpoint.replace('https://', 'wss://');
          }

          const totalSupply = BigInt(process.env.TOTAL_SUPPLY || '1200000000000000000000000000');
          const targetBlock = lastBlock;

          try {
            await loadCurrentChainState(wsEndpoint, totalSupply, targetBlock);
            stateMerged = true;
            console.log('Chain state merged successfully, continuing indexing...');
            console.log('');
          } catch (error: any) {
            console.error('Failed to merge chain state:', error.message);
            console.error('Continuing without merge...');
          }
        }
      }

      const cache = new EntityCache(ctx);

      for (const block of ctx.blocks) {
        for (const event of block.events) {
          await handleEvent(cache, {
            event,
            block,
          });
        }
      }

      await cache.flush();

      if (archiveFailureCount > 0) {
        archiveFailureCount = 0;
      }
    });
  } catch (error: any) {
    if (error.message === 'RESTART_WITH_ARCHIVE') {
      console.log(`Restarting processor with archive enabled...`);
      return runWithArchiveFallback();
    }

    const isArchiveError =
      error.message?.includes('archive') ||
      error.message?.includes('timeout') ||
      error.message?.includes('ECONNRESET') ||
      error.message?.includes('fetch');

    if (isArchiveError && useArchive) {
      archiveFailureCount++;
      console.error(`Archive error (${archiveFailureCount}/${ARCHIVE_FAILURE_THRESHOLD}): ${error.message}`);

      if (archiveFailureCount >= ARCHIVE_FAILURE_THRESHOLD) {
        console.warn(`Archive failed ${ARCHIVE_FAILURE_THRESHOLD} times, switching to RPC-only mode...`);
        useArchive = false;
        archiveFailureCount = 0;
        lastArchiveRetryTime = Date.now();
        processor = createProcessor(false);
        return runWithArchiveFallback();
      } else {
        console.log(`Retrying with archive (attempt ${archiveFailureCount}/${ARCHIVE_FAILURE_THRESHOLD})...`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return runWithArchiveFallback();
      }
    }

    throw error;
  }
}

export function startProcessor() {
  runWithArchiveFallback().catch((error) => {
    console.error('Fatal processor error:', error);
    process.exit(1);
  });
}
