import {sts, Result, Option, Bytes, BitSequence} from './support'

export const CancelledScheduledRequest: sts.Type<CancelledScheduledRequest> = sts.struct(() => {
    return  {
        whenExecutable: sts.number(),
        action: DelegationAction,
    }
})

export const DelegationAction: sts.Type<DelegationAction> = sts.closedEnum(() => {
    return  {
        Decrease: sts.bigint(),
        Revoke: sts.bigint(),
    }
})

export type DelegationAction = DelegationAction_Decrease | DelegationAction_Revoke

export interface DelegationAction_Decrease {
    __kind: 'Decrease'
    value: bigint
}

export interface DelegationAction_Revoke {
    __kind: 'Revoke'
    value: bigint
}

export interface CancelledScheduledRequest {
    whenExecutable: number
    action: DelegationAction
}

export const AccountId20 = sts.bytes()
