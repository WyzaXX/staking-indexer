import { startProcessor } from './processor';

console.log(
  `Processor started: Chain: ${process.env.CHAIN || 'unknown'}, RPC: ${process.env.CHAIN_RPC_ENDPOINT || 'not set'}`
);

startProcessor();
