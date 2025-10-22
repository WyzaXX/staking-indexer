import { ProcessorContext, Event, Block } from '../processor/types';
import {
  handleDelegation,
  handleDelegationRevoked,
  handleDelegationIncreased,
  handleDelegationDecreased,
  handleDelegationKicked,
  handleCompounded,
  handleCandidateBondedMore,
  handleCandidateBondedLess,
  handleJoinedCollatorCandidates,
  handleCandidateLeft,
} from '../actions';

interface EventItem {
  event: Event;
  block: Block;
}

function decodeDelegationEvent(event: Event): {
  delegator: Uint8Array;
  amount: bigint;
  candidate: Uint8Array;
} | null {
  if (!event.args) return null;

  try {
    const args = event.args as any;
    const delegator = args.delegator || args[0];
    const candidate = args.candidate || args[2];
    const amount = args.amount || args.lockedAmount || args[1];

    if (!delegator || !candidate || amount === undefined || amount === null) {
      console.warn(
        `Skipping Delegation event: missing required fields (block ${event.block?.height}, index ${event.index})`
      );
      return null;
    }

    return {
      delegator,
      amount: BigInt(amount),
      candidate,
    };
  } catch (e) {
    console.error(`Error decoding Delegation event (block ${event.block?.height}, index ${event.index}):`, e);
    return null;
  }
}

function decodeDelegationRevokedEvent(event: Event): {
  delegator: Uint8Array;
  candidate: Uint8Array;
  unstakedAmount: bigint;
} | null {
  if (!event.args) return null;

  try {
    const args = event.args as any;
    const delegator = args.delegator || args[0];
    const candidate = args.candidate || args[1];
    const amount = args.unstakedAmount || args.amount || args[2];

    if (!delegator || !candidate || amount === undefined || amount === null) {
      console.warn(
        `Skipping DelegationRevoked event: missing required fields (block ${event.block?.height}, index ${event.index})`
      );
      return null;
    }

    return {
      delegator,
      candidate,
      unstakedAmount: BigInt(amount),
    };
  } catch (e) {
    console.error(`Error decoding DelegationRevoked event (block ${event.block?.height}, index ${event.index}):`, e);
    return null;
  }
}

function decodeDelegationIncreasedEvent(event: Event): {
  delegator: Uint8Array;
  candidate: Uint8Array;
  amount: bigint;
} | null {
  if (!event.args) return null;

  try {
    const args = event.args as any;
    const delegator = args.delegator || args[0];
    const candidate = args.candidate || args[1];
    const amount = args.amount || args[2];

    if (!delegator || !candidate || amount === undefined || amount === null) {
      console.warn(
        `Skipping DelegationIncreased event: missing required fields (block ${event.block?.height}, index ${event.index})`
      );
      return null;
    }

    return {
      delegator,
      candidate,
      amount: BigInt(amount),
    };
  } catch (e) {
    console.error(`Error decoding DelegationIncreased event (block ${event.block?.height}, index ${event.index}):`, e);
    return null;
  }
}

function decodeDelegationDecreasedEvent(event: Event): {
  delegator: Uint8Array;
  candidate: Uint8Array;
  amount: bigint;
} | null {
  if (!event.args) return null;

  try {
    const args = event.args as any;
    const delegator = args.delegator || args[0];
    const candidate = args.candidate || args[1];
    const amount = args.amount || args[2];

    if (!delegator || !candidate || amount === undefined || amount === null) {
      console.warn(
        `Skipping DelegationDecreased event: missing required fields (block ${event.block?.height}, index ${event.index})`
      );
      return null;
    }

    return {
      delegator,
      candidate,
      amount: BigInt(amount),
    };
  } catch (e) {
    console.error(`Error decoding DelegationDecreased event (block ${event.block?.height}, index ${event.index}):`, e);
    return null;
  }
}

function decodeDelegationKickedEvent(event: Event): {
  delegator: Uint8Array;
  candidate: Uint8Array;
  unstakedAmount: bigint;
} | null {
  if (!event.args) return null;

  try {
    const args = event.args as any;
    const delegator = args.delegator || args[0];
    const candidate = args.candidate || args[1];
    const amount = args.unstakedAmount || args.amount || args[2];

    // Some DelegationKicked events may not have all fields, so we skip them
    if (!delegator || !candidate || amount === undefined || amount === null) {
      console.warn(
        `Skipping DelegationKicked event: missing required fields (block ${event.block?.height}, index ${event.index})`
      );
      return null;
    }

    return {
      delegator,
      candidate,
      unstakedAmount: BigInt(amount),
    };
  } catch (e) {
    console.error(`Error decoding DelegationKicked event (block ${event.block?.height}, index ${event.index}):`, e);
    return null;
  }
}

function decodeCompoundedEvent(event: Event): {
  delegator: Uint8Array;
  candidate: Uint8Array;
  amount: bigint;
} | null {
  if (!event.args) return null;

  try {
    const args = event.args as any;
    const delegator = args.delegator || args[0];
    const candidate = args.candidate || args[1];
    const amount = args.amount || args[2];

    if (!delegator || !candidate || amount === undefined || amount === null) {
      console.warn(
        `Skipping Compounded event: missing required fields (block ${event.block?.height}, index ${event.index})`
      );
      return null;
    }

    return {
      delegator,
      candidate,
      amount: BigInt(amount),
    };
  } catch (e) {
    console.error(`Error decoding Compounded event (block ${event.block?.height}, index ${event.index}):`, e);
    return null;
  }
}

function decodeDelegatorLeftEvent(event: Event): {
  delegator: Uint8Array;
  unstakedAmount: bigint;
} | null {
  if (!event.args) return null;

  try {
    const args = event.args as any;
    const delegator = args.delegator || args[0];
    const amount = args.unstakedAmount || args[1];

    if (!delegator || amount === undefined || amount === null) {
      console.warn(
        `Skipping DelegatorLeft event: missing required fields (block ${event.block?.height}, index ${event.index})`
      );
      return null;
    }

    return {
      delegator,
      unstakedAmount: BigInt(amount),
    };
  } catch (e) {
    console.error(`Error decoding DelegatorLeft event (block ${event.block?.height}, index ${event.index}):`, e);
    return null;
  }
}

function decodeDelegatorLeftCandidateEvent(event: Event): {
  delegator: Uint8Array;
  candidate: Uint8Array;
  unstakedAmount: bigint;
} | null {
  if (!event.args) return null;

  try {
    const args = event.args as any;
    const delegator = args.delegator || args[0];
    const candidate = args.candidate || args[1];
    const amount = args.unstakedAmount || args[2];

    if (!delegator || !candidate || amount === undefined || amount === null) {
      console.warn(
        `Skipping DelegatorLeftCandidate event: missing required fields (block ${event.block?.height}, index ${event.index})`
      );
      return null;
    }

    return {
      delegator,
      candidate,
      unstakedAmount: BigInt(amount),
    };
  } catch (e) {
    console.error(
      `Error decoding DelegatorLeftCandidate event (block ${event.block?.height}, index ${event.index}):`,
      e
    );
    return null;
  }
}

function decodeCandidateBondedMoreEvent(event: Event): {
  candidate: Uint8Array;
  amount: bigint;
} | null {
  if (!event.args) return null;

  try {
    const args = event.args as any;
    const candidate = args.candidate || args[0];
    const amount = args.amount || args[1];

    if (!candidate || amount === undefined || amount === null) {
      console.warn(
        `Skipping CandidateBondedMore event: missing required fields (block ${event.block?.height}, index ${event.index})`
      );
      return null;
    }

    return {
      candidate,
      amount: BigInt(amount),
    };
  } catch (e) {
    console.error(`Error decoding CandidateBondedMore event (block ${event.block?.height}, index ${event.index}):`, e);
    return null;
  }
}

function decodeCandidateBondedLessEvent(event: Event): {
  candidate: Uint8Array;
  amount: bigint;
} | null {
  if (!event.args) return null;

  try {
    const args = event.args as any;
    const candidate = args.candidate || args[0];
    const amount = args.amount || args[1];

    if (!candidate || amount === undefined || amount === null) {
      console.warn(
        `Skipping CandidateBondedLess event: missing required fields (block ${event.block?.height}, index ${event.index})`
      );
      return null;
    }

    return {
      candidate,
      amount: BigInt(amount),
    };
  } catch (e) {
    console.error(`Error decoding CandidateBondedLess event (block ${event.block?.height}, index ${event.index}):`, e);
    return null;
  }
}


function decodeJoinedCollatorCandidatesEvent(event: Event): {
  account: Uint8Array;
  amountLocked: bigint;
} | null {
  if (!event.args) return null;

  try {
    const args = event.args as any;
    const account = args.account || args[0];
    const amountLocked = args.amountLocked || args[1];

    if (!account || amountLocked === undefined || amountLocked === null) {
      console.warn(
        `Skipping JoinedCollatorCandidates event: missing required fields (block ${event.block?.height}, index ${event.index})`
      );
      return null;
    }

    return {
      account,
      amountLocked: BigInt(amountLocked),
    };
  } catch (e) {
    console.error(
      `Error decoding JoinedCollatorCandidates event (block ${event.block?.height}, index ${event.index}):`,
      e
    );
    return null;
  }
}

function decodeCandidateLeftEvent(event: Event): {
  exCandidate: Uint8Array;
  unlockedAmount: bigint;
} | null {
  if (!event.args) return null;

  try {
    const args = event.args as any;
    const exCandidate = args.exCandidate || args[0];
    const unlockedAmount = args.unlockedAmount || args[1];

    if (!exCandidate || unlockedAmount === undefined || unlockedAmount === null) {
      console.warn(
        `Skipping CandidateLeft event: missing required fields (block ${event.block?.height}, index ${event.index})`
      );
      return null;
    }

    return {
      exCandidate,
      unlockedAmount: BigInt(unlockedAmount),
    };
  } catch (e) {
    console.error(`Error decoding CandidateLeft event (block ${event.block?.height}, index ${event.index}):`, e);
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

    case 'ParachainStaking.DelegationIncreased': {
      const data = decodeDelegationIncreasedEvent(event);
      if (data) {
        await handleDelegationIncreased(cache, blockNumber, data.delegator, data.candidate, data.amount);
      }
      break;
    }

    case 'ParachainStaking.DelegationDecreased': {
      const data = decodeDelegationDecreasedEvent(event);
      if (data) {
        await handleDelegationDecreased(cache, blockNumber, data.delegator, data.candidate, data.amount);
      }
      break;
    }

    case 'ParachainStaking.DelegationKicked': {
      const data = decodeDelegationKickedEvent(event);
      if (data) {
        await handleDelegationKicked(cache, blockNumber, data.delegator, data.candidate, data.unstakedAmount);
      }
      break;
    }

    case 'ParachainStaking.Compounded': {
      const data = decodeCompoundedEvent(event);
      if (data) {
        await handleCompounded(cache, blockNumber, data.delegator, data.candidate, data.amount);
      }
      break;
    }

    case 'ParachainStaking.DelegatorLeft': {
      const data = decodeDelegatorLeftEvent(event);
      if (data) {
        await handleDelegationRevoked(cache, blockNumber, data.delegator, new Uint8Array(20), data.unstakedAmount);
      }
      break;
    }

    case 'ParachainStaking.DelegatorLeftCandidate': {
      const data = decodeDelegatorLeftCandidateEvent(event);
      if (data) {
        await handleDelegationRevoked(cache, blockNumber, data.delegator, data.candidate, data.unstakedAmount);
      }
      break;
    }

    case 'ParachainStaking.JoinedCollatorCandidates': {
      const data = decodeJoinedCollatorCandidatesEvent(event);
      if (data) {
        await handleJoinedCollatorCandidates(cache, blockNumber, data.account, data.amountLocked);
      }
      break;
    }

    case 'ParachainStaking.CandidateBondedMore': {
      const data = decodeCandidateBondedMoreEvent(event);
      if (data) {
        await handleCandidateBondedMore(cache, blockNumber, data.candidate, data.amount);
      }
      break;
    }

    case 'ParachainStaking.CandidateBondedLess': {
      const data = decodeCandidateBondedLessEvent(event);
      if (data) {
        await handleCandidateBondedLess(cache, blockNumber, data.candidate, data.amount);
      }
      break;
    }

    case 'ParachainStaking.CandidateLeft': {
      const data = decodeCandidateLeftEvent(event);
      if (data) {
        await handleCandidateLeft(cache, blockNumber, data.exCandidate, data.unlockedAmount);
      }
      break;
    }

    default:
      break;
  }
}
