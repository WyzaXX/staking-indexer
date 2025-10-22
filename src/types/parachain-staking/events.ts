import {sts, Block, Bytes, Option, Result, EventType, RuntimeCtx} from '../support'
import * as v900 from '../v900'
import * as v1001 from '../v1001'
import * as v1201 from '../v1201'
import * as v1300 from '../v1300'
import * as v1901 from '../v1901'

export const joinedCollatorCandidates =  {
    name: 'ParachainStaking.JoinedCollatorCandidates',
    /**
     * Account, Amount Locked, New Total Amt Locked
     */
    v900: new EventType(
        'ParachainStaking.JoinedCollatorCandidates',
        sts.tuple([v900.H160, sts.bigint(), sts.bigint()])
    ),
    /**
     * Account joined the set of collator candidates.
     */
    v1300: new EventType(
        'ParachainStaking.JoinedCollatorCandidates',
        sts.struct({
            account: v1300.AccountId20,
            amountLocked: sts.bigint(),
            newTotalAmtLocked: sts.bigint(),
        })
    ),
}

export const candidateBondedMore =  {
    name: 'ParachainStaking.CandidateBondedMore',
    /**
     * Candidate, Amount, New Bond Total
     */
    v1001: new EventType(
        'ParachainStaking.CandidateBondedMore',
        sts.tuple([v1001.AccountId20, sts.bigint(), sts.bigint()])
    ),
    /**
     * Сandidate has increased a self bond.
     */
    v1300: new EventType(
        'ParachainStaking.CandidateBondedMore',
        sts.struct({
            candidate: v1300.AccountId20,
            amount: sts.bigint(),
            newTotalBond: sts.bigint(),
        })
    ),
}

export const candidateBondedLess =  {
    name: 'ParachainStaking.CandidateBondedLess',
    /**
     * Candidate, Amount, New Bond
     */
    v1001: new EventType(
        'ParachainStaking.CandidateBondedLess',
        sts.tuple([v1001.AccountId20, sts.bigint(), sts.bigint()])
    ),
    /**
     * Сandidate has decreased a self bond.
     */
    v1300: new EventType(
        'ParachainStaking.CandidateBondedLess',
        sts.struct({
            candidate: v1300.AccountId20,
            amount: sts.bigint(),
            newBond: sts.bigint(),
        })
    ),
}

export const candidateLeft =  {
    name: 'ParachainStaking.CandidateLeft',
    /**
     * Ex-Candidate, Amount Unlocked, New Total Amt Locked
     */
    v1001: new EventType(
        'ParachainStaking.CandidateLeft',
        sts.tuple([v1001.AccountId20, sts.bigint(), sts.bigint()])
    ),
    /**
     * Candidate has left the set of candidates.
     */
    v1300: new EventType(
        'ParachainStaking.CandidateLeft',
        sts.struct({
            exCandidate: v1300.AccountId20,
            unlockedAmount: sts.bigint(),
            newTotalAmtLocked: sts.bigint(),
        })
    ),
}

export const delegationIncreased =  {
    name: 'ParachainStaking.DelegationIncreased',
    v1001: new EventType(
        'ParachainStaking.DelegationIncreased',
        sts.tuple([v1001.AccountId20, v1001.AccountId20, sts.bigint(), sts.boolean()])
    ),
    v1300: new EventType(
        'ParachainStaking.DelegationIncreased',
        sts.struct({
            delegator: v1300.AccountId20,
            candidate: v1300.AccountId20,
            amount: sts.bigint(),
            inTop: sts.boolean(),
        })
    ),
}

export const delegationDecreased =  {
    name: 'ParachainStaking.DelegationDecreased',
    v1001: new EventType(
        'ParachainStaking.DelegationDecreased',
        sts.tuple([v1001.AccountId20, v1001.AccountId20, sts.bigint(), sts.boolean()])
    ),
    v1300: new EventType(
        'ParachainStaking.DelegationDecreased',
        sts.struct({
            delegator: v1300.AccountId20,
            candidate: v1300.AccountId20,
            amount: sts.bigint(),
            inTop: sts.boolean(),
        })
    ),
}

export const delegatorLeft =  {
    name: 'ParachainStaking.DelegatorLeft',
    /**
     * Delegator, Amount Unstaked
     */
    v1001: new EventType(
        'ParachainStaking.DelegatorLeft',
        sts.tuple([v1001.AccountId20, sts.bigint()])
    ),
    /**
     * Delegator has left the set of delegators.
     */
    v1300: new EventType(
        'ParachainStaking.DelegatorLeft',
        sts.struct({
            delegator: v1300.AccountId20,
            unstakedAmount: sts.bigint(),
        })
    ),
}

export const delegationRevoked =  {
    name: 'ParachainStaking.DelegationRevoked',
    /**
     * Delegator, Candidate, Amount Unstaked
     */
    v1001: new EventType(
        'ParachainStaking.DelegationRevoked',
        sts.tuple([v1001.AccountId20, v1001.AccountId20, sts.bigint()])
    ),
    /**
     * Delegation revoked.
     */
    v1300: new EventType(
        'ParachainStaking.DelegationRevoked',
        sts.struct({
            delegator: v1300.AccountId20,
            candidate: v1300.AccountId20,
            unstakedAmount: sts.bigint(),
        })
    ),
}

export const delegation =  {
    name: 'ParachainStaking.Delegation',
    /**
     * Delegator, Amount Locked, Candidate, Delegator Position with New Total Counted if in Top
     */
    v1001: new EventType(
        'ParachainStaking.Delegation',
        sts.tuple([v1001.AccountId20, sts.bigint(), v1001.AccountId20, v1001.DelegatorAdded])
    ),
    /**
     * New delegation (increase of the existing one).
     */
    v1300: new EventType(
        'ParachainStaking.Delegation',
        sts.struct({
            delegator: v1300.AccountId20,
            lockedAmount: sts.bigint(),
            candidate: v1300.AccountId20,
            delegatorPosition: v1300.DelegatorAdded,
        })
    ),
    /**
     * New delegation (increase of the existing one).
     */
    v1901: new EventType(
        'ParachainStaking.Delegation',
        sts.struct({
            delegator: v1901.AccountId20,
            lockedAmount: sts.bigint(),
            candidate: v1901.AccountId20,
            delegatorPosition: v1901.DelegatorAdded,
            autoCompound: v1901.Percent,
        })
    ),
}

export const delegatorLeftCandidate =  {
    name: 'ParachainStaking.DelegatorLeftCandidate',
    /**
     * Delegator, Candidate, Amount Unstaked, New Total Amt Staked for Candidate
     */
    v1001: new EventType(
        'ParachainStaking.DelegatorLeftCandidate',
        sts.tuple([v1001.AccountId20, v1001.AccountId20, sts.bigint(), sts.bigint()])
    ),
    /**
     * Delegation from candidate state has been remove.
     */
    v1300: new EventType(
        'ParachainStaking.DelegatorLeftCandidate',
        sts.struct({
            delegator: v1300.AccountId20,
            candidate: v1300.AccountId20,
            unstakedAmount: sts.bigint(),
            totalCandidateStaked: sts.bigint(),
        })
    ),
}

export const delegationKicked =  {
    name: 'ParachainStaking.DelegationKicked',
    /**
     * Delegator, Candidate, Amount Unstaked
     */
    v1201: new EventType(
        'ParachainStaking.DelegationKicked',
        sts.tuple([v1201.AccountId20, v1201.AccountId20, sts.bigint()])
    ),
    /**
     * Delegation kicked.
     */
    v1300: new EventType(
        'ParachainStaking.DelegationKicked',
        sts.struct({
            delegator: v1300.AccountId20,
            candidate: v1300.AccountId20,
            unstakedAmount: sts.bigint(),
        })
    ),
}

export const compounded =  {
    name: 'ParachainStaking.Compounded',
    /**
     * Compounded a portion of rewards towards the delegation.
     */
    v1901: new EventType(
        'ParachainStaking.Compounded',
        sts.struct({
            candidate: v1901.AccountId20,
            delegator: v1901.AccountId20,
            amount: sts.bigint(),
        })
    ),
}
