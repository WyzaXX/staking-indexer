import * as dotenv from 'dotenv';

dotenv.config();

export function getEnv(key: string, required: boolean = true): string | undefined {
  const value = process.env[key];

  if (required && !value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export function getEnvNumber(key: string, defaultValue?: number): number {
  const value = process.env[key];

  if (!value) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Missing required environment variable: ${key}`);
  }

  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number`);
  }

  return parsed;
}

export const config = {
  db: {
    name: getEnv('DB_NAME')!,
    port: getEnvNumber('DB_PORT', 5432),
    host: getEnv('DB_HOST', false) || 'localhost',
    user: getEnv('DB_USER', false) || 'postgres',
    pass: getEnv('DB_PASS', false) || 'postgres',
  },

  chain: {
    name: getEnv('CHAIN')!,
    rpcEndpoint: getEnv('CHAIN_RPC_ENDPOINT')!,
    archiveGateway: getEnv('ARCHIVE_GATEWAY', false),
    ss58Prefix: getEnvNumber('SS58_PREFIX'),
    totalSupply: BigInt((getEnv('TOTAL_SUPPLY', false) || '0').toString()),
  },

  blockRange: {
    from: getEnvNumber('START_BLOCK', 0),
    to: process.env.END_BLOCK ? getEnvNumber('END_BLOCK') : undefined,
  },
};
