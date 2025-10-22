FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src
COPY schema.graphql ./

# Build the project
RUN npm run build

# Production stage
FROM node:24-alpine

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --production

# Copy built files from builder
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/schema.graphql ./

# Copy migrations
COPY db/migrations ./db/migrations

EXPOSE 4000

CMD ["node", "lib/main.js"]

