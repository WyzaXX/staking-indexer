import { loadCurrentChainState } from './state-loader';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const rpcEndpoint = process.env.CHAIN_RPC_ENDPOINT;
  const chainName = process.env.CHAIN || 'unknown';
  const tokenSymbol = process.env.TOKEN_SYMBOL || chainName.toUpperCase();

  if (!rpcEndpoint) {
    console.error('Error: CHAIN_RPC_ENDPOINT not set');
    console.error(`Set it to a WebSocket endpoint for ${chainName}`);
    process.exit(1);
  }

  if (!rpcEndpoint.startsWith('ws')) {
    console.error('Error: CHAIN_RPC_ENDPOINT must be a WebSocket URL (wss:// or ws://)');
    console.error('Current value:', rpcEndpoint);
    process.exit(1);
  }

  console.log('Loading current chain state into database...');
  console.log(`Chain: ${chainName}`);
  console.log(`RPC: ${rpcEndpoint}`);
  console.log('');
  console.log('Note: This will update stakedAmount for all accounts to match chain state');
  console.log('Historical totalDelegated/totalUndelegated will be preserved');
  console.log('');

  await loadCurrentChainState(rpcEndpoint);

  console.log('');
  console.log('State load complete!');
  console.log('Run your GraphQL query to verify the updated totals.');

  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
