import { Event, Block } from '../processor/types';
import {
  handleDelegation,
  handleDelegationRevoked,
  handleDelegationIncreased,
  handleDelegationDecreased,
  handleDelegationKicked,
  handleCompounded,
  handleCandidateBondedMore,
  handleCandidateBondedLess,
  handleDelegationRevocationScheduled,
  handleDelegationDecreaseScheduled,
  handleCancelledDelegationRequest,
  handleCandidateBondLessScheduled,
  handleCancelledCandidateBondLess,
} from '../actions';

interface EventItem {
  event: Event;
  block: Block;
}

function decodeScheduledEvent(event: Event): { delegator: Uint8Array; amount: bigint } | null {
  if (!event.args) return null;
  try {
    const args = event.args as any;
    const delegator = args.delegator || args[0];
    const amount = args.amount || args[1];
    if (!delegator || amount === undefined || amount === null) return null;
    if (!(delegator instanceof Uint8Array)) return null;
    return { delegator, amount: BigInt(amount) };
  } catch (e) {
    return null;
  }
}

function decodeCollatorScheduledEvent(event: Event): { candidate: Uint8Array; amount: bigint } | null {
  if (!event.args) return null;
  try {
    const args = event.args as any;
    const candidate = args.candidate || args[0];
    const amount = args.amount || args[1];
    if (!candidate || amount === undefined || amount === null) return null;
    if (!(candidate instanceof Uint8Array)) return null;
    return { candidate, amount: BigInt(amount) };
  } catch (e) {
    return null;
  }
}

function decodeDelegationEvent(event: Event): { delegator: Uint8Array; amount: bigint; candidate: Uint8Array } | null {
  if (!event.args) return null;
  try {
    const args = event.args as any;
    const delegator = args.delegator || args[0];
    const candidate = args.candidate || args[2];
    const amount = args.amount || args.lockedAmount || args[1];
    if (!delegator || !candidate || amount === undefined || amount === null) return null;
    return { delegator, amount: BigInt(amount), candidate };
  } catch (e) {
    return null;
  }
}

function decodeDelegationRevokedEvent(
  event: Event
): { delegator: Uint8Array; candidate: Uint8Array; unstakedAmount: bigint } | null {
  if (!event.args) return null;
  try {
    const args = event.args as any;
    const delegator = args.delegator || args[0];
    const candidate = args.candidate || args[1];
    const amount = args.unstakedAmount || args.amount || args[2];
    if (!delegator || !candidate || amount === undefined || amount === null) return null;
    return { delegator, candidate, unstakedAmount: BigInt(amount) };
  } catch (e) {
    return null;
  }
}

function decode3FieldEvent(event: Event): { delegator: Uint8Array; candidate: Uint8Array; amount: bigint } | null {
  if (!event.args) return null;
  try {
    const args = event.args as any;
    const delegator = args.delegator || args[0];
    const candidate = args.candidate || args[1];
    const amount = args.amount || args.unstakedAmount || args[2];
    if (!delegator || !candidate || amount === undefined || amount === null) return null;
    return { delegator, candidate, amount: BigInt(amount) };
  } catch (e) {
    return null;
  }
}

function decode2FieldDelegatorEvent(event: Event): { delegator: Uint8Array; unstakedAmount: bigint } | null {
  if (!event.args) return null;
  try {
    const args = event.args as any;
    const delegator = args.delegator || args[0];
    const amount = args.unstakedAmount || args[1];
    if (!delegator || amount === undefined || amount === null) return null;
    return { delegator, unstakedAmount: BigInt(amount) };
  } catch (e) {
    return null;
  }
}

function decode2FieldCandidateEvent(event: Event): { candidate: Uint8Array; amount: bigint } | null {
  if (!event.args) return null;
  try {
    const args = event.args as any;
    const candidate = args.candidate || args[0];
    const amount = args.amount || args[1];
    if (!candidate || amount === undefined || amount === null) return null;
    return { candidate, amount: BigInt(amount) };
  } catch (e) {
    return null;
  }
}

export async function handleEvent(cache: any, item: EventItem): Promise<void> {
  const { event, block } = item;
  const blockNumber = block.header.height;

  switch (event.name) {
    case 'ParachainStaking.Delegation': {
      const data = decodeDelegationEvent(event);
      if (data) {
        await handleDelegation(cache, blockNumber, data.delegator, data.candidate, data.amount);
      }
      break;
    }

    case 'ParachainStaking.DelegationRevoked': {
      const data = decodeDelegationRevokedEvent(event);
      if (data) {
        await handleDelegationRevoked(cache, blockNumber, data.delegator, data.candidate, data.unstakedAmount);
      }
      break;
    }

    case 'ParachainStaking.DelegationIncreased':
    case 'ParachainStaking.DelegationDecreased':
    case 'ParachainStaking.DelegationKicked':
    case 'ParachainStaking.Compounded': {
      const data = decode3FieldEvent(event);
      if (data) {
        if (event.name === 'ParachainStaking.DelegationIncreased') {
          await handleDelegationIncreased(cache, blockNumber, data.delegator, data.candidate, data.amount);
        } else if (event.name === 'ParachainStaking.DelegationDecreased') {
          await handleDelegationDecreased(cache, blockNumber, data.delegator, data.candidate, data.amount);
        } else if (event.name === 'ParachainStaking.DelegationKicked') {
          await handleDelegationKicked(cache, blockNumber, data.delegator, data.candidate, data.amount);
        } else {
          await handleCompounded(cache, blockNumber, data.delegator, data.candidate, data.amount);
        }
      }
      break;
    }

    case 'ParachainStaking.DelegatorLeft': {
      const data = decode2FieldDelegatorEvent(event);
      if (data) {
        await handleDelegationRevoked(cache, blockNumber, data.delegator, new Uint8Array(20), data.unstakedAmount);
      }
      break;
    }

    case 'ParachainStaking.DelegatorLeftCandidate': {
      const data = decode3FieldEvent(event);
      if (data) {
        await handleDelegationRevoked(cache, blockNumber, data.delegator, data.candidate, data.amount);
      }
      break;
    }

    case 'ParachainStaking.CandidateBondedMore':
    case 'ParachainStaking.CandidateBondedLess': {
      const data = decode2FieldCandidateEvent(event);
      if (data) {
        if (event.name === 'ParachainStaking.CandidateBondedMore') {
          await handleCandidateBondedMore(cache, blockNumber, data.candidate, data.amount);
        } else {
          await handleCandidateBondedLess(cache, blockNumber, data.candidate, data.amount);
        }
      }
      break;
    }

    case 'ParachainStaking.DelegationRevocationScheduled': {
      const data = decodeScheduledEvent(event);
      if (data) {
        await handleDelegationRevocationScheduled(cache, blockNumber, data.delegator, data.amount);
      }
      break;
    }

    case 'ParachainStaking.DelegationDecreaseScheduled': {
      const data = decodeScheduledEvent(event);
      if (data) {
        await handleDelegationDecreaseScheduled(cache, blockNumber, data.delegator, data.amount);
      }
      break;
    }

    case 'ParachainStaking.CancelledDelegationRequest': {
      const data = decodeScheduledEvent(event);
      if (data) {
        await handleCancelledDelegationRequest(cache, blockNumber, data.delegator, data.amount);
      }
      break;
    }

    case 'ParachainStaking.CandidateBondLessScheduled': {
      const data = decodeCollatorScheduledEvent(event);
      if (data) {
        await handleCandidateBondLessScheduled(cache, blockNumber, data.candidate, data.amount);
      }
      break;
    }

    case 'ParachainStaking.CancelledCandidateBondLess': {
      const data = decodeCollatorScheduledEvent(event);
      if (data) {
        await handleCancelledCandidateBondLess(cache, blockNumber, data.candidate, data.amount);
      }
      break;
    }

    default:
      break;
  }
}
