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

## How It Works

### First Run (Fresh Start)

When starting with an empty database from block 0, the indexer performs a **fully automatic initialization**:

1. **⏸️ Waits** - The indexer pauses before starting event processing
2. **📡 Loads Chain State** - Fetches current staking data directly from RPC (~14,000 delegators + collators)
3. **🔄 Auto-Retry** - If RPC fails, it retries automatically with exponential backoff (up to 30s between attempts)
4. **💾 Saves to Database** - Stores the current accurate state
5. **✅ Starts Indexing** - Only after state is loaded successfully, begins processing events from block 0

**Why this matters:**

- ParachainStaking wasn't active at genesis on Moonbeam
- Early delegations (blocks 0-150,000) wouldn't be captured by events alone
- This ensures your totals match chain state from the start

**Time:**

- With private RPC: 1-2 minutes
- With public RPC: 2-10 minutes (due to retries)
- **It will keep trying until it succeeds** ✅

### Subsequent Runs

Normal incremental indexing - processes only new events from where it left off.

## Commands

| Command          | Description                     |
| ---------------- | ------------------------------- |
| `sqd serve`      | Start processor + API           |
| `sqd reset`      | Full reset from block 0         |
| `sqd load-state` | Manually load chain state to DB |
| `sqd compare`    | Compare DB with chain state     |
| `sqd open`       | Open GraphiQL interface         |

See `commands.json` for all available commands.

## Troubleshooting

### WebSocket Disconnections During State Loading

If you see repeated `API-WS: disconnected... 1006:: Abnormal Closure` errors:

**Cause**: Public RPCs have strict rate limits and connection timeouts. Loading ~14,000 delegator states can exceed these limits.

**Solutions**:

1. **Use a private/paid RPC endpoint** (recommended):

   - OnFinality: https://onfinality.io
   - Blast API: https://blastapi.io
   - Ankr: https://www.ankr.com/rpc/

   Update your `.env`:

   ```bash
   CHAIN_RPC_ENDPOINT=wss://YOUR_PRIVATE_RPC_ENDPOINT
   ```

2. **Skip initial state loading**: Start indexing from current block instead of block 0:

   - Comment out the state loading logic in `src/processor/index.ts`
   - Note: You'll miss historical data but avoid RPC issues

3. **Use archive-only mode**: Let the indexer run without initial state loading. It will catch up over time by processing events.

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
