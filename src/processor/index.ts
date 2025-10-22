import { SubstrateBatchProcessor } from '@subsquid/substrate-processor';
import { TypeormDatabase } from '@subsquid/typeorm-store';
import { config } from '../utils';
import { fieldSelection, ProcessorContext } from './types';
import { handleEvent } from '../handlers';
import { EntityCache } from '../actions';

const ARCHIVE_GATEWAYS: Record<string, string> = {
  moonbeam: 'https://v2.archive.subsquid.io/network/moonbeam-substrate',
};

let archiveFailureCount = 0;
let useArchive = true;
let lastArchiveRetryTime = 0;
const ARCHIVE_FAILURE_THRESHOLD = 3;
const ARCHIVE_RETRY_INTERVAL = 5 * 60 * 1000; // 5 minutes
const HISTORICAL_BLOCK_THRESHOLD = 100; // Considered "historical" if more than 100 blocks behind

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
      'ParachainStaking.DelegationIncreased',
      'ParachainStaking.DelegationDecreased',
      'ParachainStaking.DelegationKicked',
      'ParachainStaking.Compounded',
      'ParachainStaking.DelegatorLeft',
      'ParachainStaking.DelegatorLeftCandidate',
      'ParachainStaking.JoinedCollatorCandidates',
      'ParachainStaking.CandidateBondedMore',
      'ParachainStaking.CandidateBondedLess',
      'ParachainStaking.CandidateLeft',
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
