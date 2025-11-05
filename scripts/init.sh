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
if ! docker-compose ps 2>/dev/null | grep -q "postgres.*Up"; then
    docker-compose up -d && sleep 3
fi

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL..."
until docker-compose exec -T db pg_isready -U ${DB_USER:-postgres} &>/dev/null; do
    sleep 1
done

# Create database inside Docker container
DB_EXISTS=$(docker-compose exec -T db psql -U ${DB_USER:-postgres} -tc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME:-staking}'" | grep -c 1 || echo "0")
if [ "$DB_EXISTS" = "0" ]; then
    docker-compose exec -T db psql -U ${DB_USER:-postgres} -c "CREATE DATABASE ${DB_NAME:-staking}"
    echo "Database '${DB_NAME:-staking}' created"
fi

# Build, migrate, and start
rm -rf lib && tsc
sqd migration:generate 2>/dev/null || true
sqd migration:apply

echo ""
echo "Starting indexer..."
concurrently -n processor,api -c cyan,magenta 'node --require=dotenv/config lib/main.js' 'node --require=dotenv/config lib/api.js'
