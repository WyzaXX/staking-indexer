export function calculatePercentage(part: bigint, total: bigint): number {
  // Returns the percentage of the staked amount part out of the total staked amount
  if (total === 0n) return 0;
  const percentageScaled = Number((part * 10000n) / total);
  return percentageScaled / 100;
}

export function getTokenSymbol(): string {
  return process.env.TOKEN_SYMBOL || process.env.CHAIN?.toUpperCase() || 'TOKEN';
}

export function getTokenDecimals(): number {
  return process.env.TOKEN_DECIMALS ? parseInt(process.env.TOKEN_DECIMALS) : 18;
}
