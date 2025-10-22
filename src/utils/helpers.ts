export function calculatePercentage(part: bigint, total: bigint): number {
  // Returns the percentage of the staked amount part out of the total staked amount
  if (total === 0n) return 0;
  const percentageScaled = Number((part * 10000n) / total);
  return percentageScaled / 100;
}
