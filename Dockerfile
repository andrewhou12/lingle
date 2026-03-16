FROM node:22-slim

# Install pnpm
RUN npm install -g pnpm@9

WORKDIR /app

# Copy workspace manifests first (layer cache)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY apps/agent/package.json ./apps/agent/package.json

# Copy prisma schema (needed for @lingle/db build)
COPY prisma/ ./prisma/

# Install all deps (including devDeps for tsx)
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared/src/ ./packages/shared/src/
COPY packages/db/src/ ./packages/db/src/
COPY apps/agent/src/ ./apps/agent/src/
COPY apps/agent/tsconfig.json ./apps/agent/tsconfig.json

# Generate Prisma client for Linux
RUN pnpm --filter @lingle/db build

# Download turn-detector model files required by @livekit/agents-plugin-livekit
WORKDIR /app/apps/agent
RUN node --import tsx src/index.ts download-files

# Run as non-root (required by LiveKit Cloud)
RUN useradd -m -u 1001 lingle
USER lingle

WORKDIR /app/apps/agent

# Use tsx to run TypeScript directly (same as local dev)
ENTRYPOINT ["node", "--import", "tsx", "src/index.ts", "start"]
