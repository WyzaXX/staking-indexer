import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, FloatColumn as FloatColumn_, IntColumn as IntColumn_, Index as Index_} from "@subsquid/typeorm-store"

@Entity_()
export class TotalStake {
    constructor(props?: Partial<TotalStake>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    totalStaked!: bigint

    @BigIntColumn_({nullable: false})
    totalBonded!: bigint

    @BigIntColumn_({nullable: false})
    totalDelegatorStake!: bigint

    @BigIntColumn_({nullable: false})
    totalCollatorBond!: bigint

    @BigIntColumn_({nullable: false})
    totalSupply!: bigint

    @FloatColumn_({nullable: false})
    stakedPercentage!: number

    @FloatColumn_({nullable: false})
    bondedPercentage!: number

    @IntColumn_({nullable: false})
    activeStakerCount!: number

    @IntColumn_({nullable: false})
    activeCollatorCount!: number

    @Index_()
    @IntColumn_({nullable: false})
    lastUpdatedBlock!: number
}
