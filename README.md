# Staking Indexer

A Subsquid indexer for Substrate chains with ParachainStaking pallet. Tracks delegator stakes, collator self-bonds, and global staking statistics. Compatible with Moonbeam and similar networks.

## What It Tracks

- **Stakers**: Current staked amount, lifetime delegations
- **Collators**: Self-bond amounts, lifetime bonds
- **Global Stats**: Total staked, % of supply, staker/collator counts

## Setup

### Requirements

- Node.js 24+
- Docker & Docker Compose
- Subsquid CLI: `npm install -g @subsquid/cli`

### Installation

```bash
npm install
cp env.example .env
# Edit .env with your chain configuration
```

### Configuration

Required `.env` variables:

```bash
CHAIN=moonbeam
CHAIN_RPC_ENDPOINT=https://rpc.api.moonbeam.network
TOTAL_SUPPLY=1200000000000000000000000000
SS58_PREFIX=1284
```

See `env.example` for other networks (Moonriver, Moonbase Alpha).

## Running

```bash
sqd up                    # Start PostgreSQL
sqd build                 # Build project
sqd migration:generate    # Generate migration
sqd serve                 # Start processor + API
```

GraphiQL interface: http://localhost:4350/graphiql

## Commands

| Command          | Description                     |
| ---------------- | ------------------------------- |
| `sqd serve`      | Start processor + API           |
| `sqd reset`      | Full reset from block 0         |
| `sqd load-state` | Manually load chain state to DB |
| `sqd compare`    | Compare DB with chain state     |
| `sqd open`       | Open GraphiQL interface         |

See `commands.json` for all available commands.

## Example Query

```graphql
query {
  totalStakes {
    nodes {
      totalStakedAmount
      stakedPercentage
      stakerCount
      collatorCount
    }
  }
  stakers(first: 10, orderBy: STAKED_AMOUNT_DESC) {
    nodes {
      id
      stakedAmount
      totalDelegated
    }
  }
}
```

## Switching to Another Chain

To index a different Moonbeam-forked chain:

1. Update `.env`:

   ```bash
   CHAIN=my-chain
   CHAIN_RPC_ENDPOINT=https://my-chain-rpc.com
   TOTAL_SUPPLY=...
   SS58_PREFIX=...
   ```

2. Update `typegen.json`:

   ```json
   "specVersions": "https://my-chain-rpc.com"
   ```

3. Regenerate types and reset:
   ```bash
   sqd typegen
   sqd reset
   ```

## License

MIT
