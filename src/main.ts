import { startProcessor } from './processor';

const chainName = process.env.CHAIN || 'unknown';
const rpcEndpoint = process.env.CHAIN_RPC_ENDPOINT || 'not set';

console.log(`Processor started`);
console.log(`Chain: ${chainName}`);
console.log(`RPC: ${rpcEndpoint}`);

startProcessor();
