import {sts, Result, Option, Bytes, BitSequence} from './support'

export const DelegatorAdded: sts.Type<DelegatorAdded> = sts.closedEnum(() => {
    return  {
        AddedToBottom: sts.unit(),
        AddedToTop: sts.enumStruct({
            newTotal: sts.bigint(),
        }),
    }
})

export type DelegatorAdded = DelegatorAdded_AddedToBottom | DelegatorAdded_AddedToTop

export interface DelegatorAdded_AddedToBottom {
    __kind: 'AddedToBottom'
}

export interface DelegatorAdded_AddedToTop {
    __kind: 'AddedToTop'
    newTotal: bigint
}

export const DelegationRequest: sts.Type<DelegationRequest> = sts.struct(() => {
    return  {
        collator: AccountId20,
        amount: sts.bigint(),
        whenExecutable: sts.number(),
        action: DelegationChange,
    }
})

export const DelegationChange: sts.Type<DelegationChange> = sts.closedEnum(() => {
    return  {
        Decrease: sts.unit(),
        Revoke: sts.unit(),
    }
})

export type DelegationChange = DelegationChange_Decrease | DelegationChange_Revoke

export interface DelegationChange_Decrease {
    __kind: 'Decrease'
}

export interface DelegationChange_Revoke {
    __kind: 'Revoke'
}

export interface DelegationRequest {
    collator: AccountId20
    amount: bigint
    whenExecutable: number
    action: DelegationChange
}

export type AccountId20 = Bytes

export const AccountId20 = sts.bytes()
