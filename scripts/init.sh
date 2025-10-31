#!/bin/bash
set -e

echo "Staking Indexer - Setup & Start"

# Create .env from template
if [ ! -f ".env" ]; then
    [ -f ".env.example" ] || { echo "Error: .env.example not found"; exit 1; }
    cp .env.example .env
    echo "Created .env from .env.example"
fi

# Load config
[ -f ".env" ] && export $(grep -v '^#' .env | xargs)
echo "Chain: ${CHAIN:-unknown} | RPC: ${CHAIN_RPC_ENDPOINT:-not set}"

# Install dependencies
[ ! -d "node_modules" ] && npm install

# Start PostgreSQL if not running
if ! (docker-compose ps 2>/dev/null | grep -q "postgres.*Up" || pg_isready -h $DB_HOST -p $DB_PORT &>/dev/null); then
    docker-compose up -d && sleep 3
fi

# Create database using .env values
PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -c "CREATE DATABASE $DB_NAME"

# Build, migrate, and start
rm -rf lib && tsc
sqd migration:generate 2>/dev/null || true
sqd migration:apply

echo ""
echo "Starting indexer..."
concurrently -n processor,api -c cyan,magenta 'node --require=dotenv/config lib/main.js' 'node --require=dotenv/config lib/api.js'
