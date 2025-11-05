import { ApiPromise, WsProvider } from '@polkadot/api';
import { DataSource } from 'typeorm';
import { getTokenSymbol } from './helpers';

export async function fetchAndUpdateTotalSupply(rpcEndpoint: string): Promise<void> {
  let wsEndpoint = rpcEndpoint;
  
  if (process.env.CHAIN === 'moonbeam' && rpcEndpoint.includes('rpc.api.moonbeam.network')) {
    wsEndpoint = 'wss://wss.api.moonbeam.network';
  } else if (wsEndpoint.startsWith('http://')) {
    wsEndpoint = wsEndpoint.replace('http://', 'ws://');
  } else if (wsEndpoint.startsWith('https://')) {
    wsEndpoint = wsEndpoint.replace('https://', 'wss://');
  }

  const provider = new WsProvider(wsEndpoint, 2500, {}, 30000);
  let api: ApiPromise | null = null;

  try {
    api = await ApiPromise.create({ provider, noInitWarn: true });
    const issuance = await api.query.balances.totalIssuance();
    const totalSupply = BigInt(issuance.toString());
    await api.disconnect();

    const ds = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'staking',
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASS || 'postgres',
      entities: [],
      synchronize: false,
    });

    await ds.initialize();
    await ds.query(
      `INSERT INTO total_stake (id, total_staked, total_bonded, total_delegator_stake, 
        total_collator_bond, total_supply, staked_percentage, bonded_percentage, 
        active_staker_count, active_collator_count, last_updated_block)
      VALUES ('total', 0, 0, 0, 0, $1, 0, 0, 0, 0, 0)
      ON CONFLICT (id) DO UPDATE SET total_supply = $1`,
      [totalSupply.toString()]
    );
    await ds.destroy();

    console.log(`Total supply: ${(Number(totalSupply) / 1e18).toLocaleString()} ${getTokenSymbol()}`);
  } catch (error: any) {
    if (api) await api.disconnect().catch(() => {});
    
    if (!rpcEndpoint.startsWith('ws')) {
      return fetchAndUpdateTotalSupply(rpcEndpoint);
    }
    
    console.error('Failed to fetch total supply:', error.message);
  }
}

