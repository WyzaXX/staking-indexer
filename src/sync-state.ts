import { compareChainStateWithIndexer } from './compare-state';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  let rpcEndpoint = process.env.CHAIN_RPC_ENDPOINT;

  if (!rpcEndpoint) {
    console.error('❌ CHAIN_RPC_ENDPOINT not set in .env');
    process.exit(1);
  }

  if (process.env.CHAIN === 'moonbeam') {
    // NOTE: the rpc for checking chain state on moonbeam is different from the rpc used for indexing
    rpcEndpoint = 'wss://wss.api.moonbeam.network';
  }

  await compareChainStateWithIndexer(rpcEndpoint);

  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
