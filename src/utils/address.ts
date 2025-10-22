import { encode } from '@subsquid/ss58';
import { config } from './config';

export function encodeAddressToSS58(address: string | Uint8Array | undefined | null): string {
  if (address === undefined || address === null) {
    throw new Error('Cannot encode undefined or null address');
  }

  try {
    if (typeof address === 'string') {
      if (address.startsWith('0x')) {
        return address.toLowerCase();
      }
      return address;
    }

    if (!(address instanceof Uint8Array) || address.length === 0) {
      throw new Error(`Invalid address format: expected Uint8Array, got ${typeof address}`);
    }

    if (address.length === 20) {
      return '0x' + Buffer.from(address).toString('hex').toLowerCase();
    }

    if (address.length === 32) {
      return encode({ prefix: config.chain.ss58Prefix, bytes: address });
    }

    throw new Error(`Invalid address length: expected 20 or 32 bytes, got ${address.length}`);
  } catch (e) {
    console.error('Error encoding address:', address, e);
    throw e;
  }
}

export function addressToHex(address: Uint8Array): string {
  return '0x' + Buffer.from(address).toString('hex');
}
