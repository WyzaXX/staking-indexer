# Staking Indexer

A Subsquid indexer for Substrate chains with ParachainStaking pallet. Tracks delegator stakes, collator self-bonds, and global staking statistics.

## What It Tracks

- **Stakers**: Current stake, scheduled unbonds, lifetime totals
- **Collators**: Self-bond, scheduled unbonds, lifetime totals
- **Global**: Total staked/bonded, percentages, active counts

## Setup

### Requirements

- Node.js 24+
- Docker & Docker Compose
- Subsquid CLI: `npm install -g @subsquid/cli`

### Installation

```bash
npm install      # Install dependencies
npm run start    # Build, setup, and start indexer (default: Qustream)
```

GraphQL API: <http://localhost:4350/graphiql>

#### NOTE: you have to have a working zombienet/chain before starting the indexer

## Commands

```bash
sqd start        # Complete setup and start indexer
sqd reset        # Reset DB and restart from block 0
sqd serve        # Start processor + API (if already setup)
sqd open         # Open GraphiQL
sqd compare      # Compare DB with chain state
```

## Configuration

Edit `.env` file (auto-created by `sqd start`):

```bash
CHAIN=qustream
CHAIN_RPC_ENDPOINT=ws://127.0.0.1:8800
TOKEN_SYMBOL=QSTR
TOKEN_DECIMALS=18
SS58_PREFIX=1287
```

For custom chains, manually edit `.env` with your config.

## License

MIT
