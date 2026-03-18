FROM node:22-alpine AS builder

WORKDIR /app
RUN corepack enable

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy workspace package manifests
COPY automation/package.json ./automation/
COPY packages/domain/package.json ./packages/domain/

# Install all dependencies (need devDeps for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/domain/ ./packages/domain/
COPY automation/ ./automation/

# Build domain first, then automation
RUN pnpm domain:build && pnpm --filter @meridian/automation build

# ─── Production image ───────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app
RUN corepack enable

# Copy workspace config
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/automation/package.json ./automation/
COPY --from=builder /app/packages/domain/package.json ./packages/domain/

# Install production deps only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=builder /app/packages/domain/dist/ ./packages/domain/dist/
COPY --from=builder /app/automation/dist/ ./automation/dist/

# Command overridden per Cloud Run Job (morning, afternoon, etc.)
ENTRYPOINT ["node", "automation/dist/cli.js"]
