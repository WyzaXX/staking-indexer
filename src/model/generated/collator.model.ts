import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, IntColumn as IntColumn_, Index as Index_} from "@subsquid/typeorm-store"

@Entity_()
export class Collator {
    constructor(props?: Partial<Collator>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    selfBond!: bigint

    @BigIntColumn_({nullable: false})
    scheduledUnbonds!: bigint

    @BigIntColumn_({nullable: false})
    totalBonded!: bigint

    @BigIntColumn_({nullable: false})
    totalUnbonded!: bigint

    @Index_()
    @IntColumn_({nullable: false})
    lastUpdatedBlock!: number
}
