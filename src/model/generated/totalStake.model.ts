import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, FloatColumn as FloatColumn_, IntColumn as IntColumn_, Index as Index_} from "@subsquid/typeorm-store"

@Entity_()
export class TotalStake {
    constructor(props?: Partial<TotalStake>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    totalDelegatorStake!: bigint

    @BigIntColumn_({nullable: false})
    totalCollatorBond!: bigint

    @BigIntColumn_({nullable: false})
    totalStakedAmount!: bigint

    @BigIntColumn_({nullable: false})
    totalSupply!: bigint

    @FloatColumn_({nullable: false})
    stakedPercentage!: number

    @IntColumn_({nullable: false})
    stakerCount!: number

    @IntColumn_({nullable: false})
    collatorCount!: number

    @Index_()
    @IntColumn_({nullable: false})
    lastUpdatedBlock!: number
}
