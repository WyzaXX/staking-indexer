import { loadCurrentChainState } from './state-loader';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const rpcEndpoint = process.env.CHAIN_RPC_ENDPOINT;
  const totalSupply = BigInt(process.env.TOTAL_SUPPLY || '1200000000000000000000000000');

  if (!rpcEndpoint) {
    console.error('❌ CHAIN_RPC_ENDPOINT not set');
    console.error('   Set it to a WebSocket endpoint (e.g., wss://wss.api.moonbeam.network)');
    process.exit(1);
  }

  if (!rpcEndpoint.startsWith('ws')) {
    console.error('❌ CHAIN_RPC_ENDPOINT must be a WebSocket URL (wss:// or ws://)');
    console.error('   Current value:', rpcEndpoint);
    process.exit(1);
  }

  console.log('🚀 Loading current chain state into database...');
  console.log(`   RPC: ${rpcEndpoint}`);
  console.log(`   Total Supply: ${(Number(totalSupply) / 1e18).toLocaleString()} GLMR`);
  console.log('');
  console.log('⚠️  This will update stakedAmount for all accounts to match chain state');
  console.log('   Historical totalDelegated/totalUndelegated will be preserved');
  console.log('');

  await loadCurrentChainState(rpcEndpoint, totalSupply);

  console.log('');
  console.log('✅ State load complete!');
  console.log('   Run your GraphQL query to verify the updated totals.');

  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
