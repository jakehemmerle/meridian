# ── Stage 1: Install dependencies ──
FROM node:24-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.25.0 --activate
WORKDIR /monorepo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/package.json ./app/
COPY packages/domain/package.json ./packages/domain/

RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ──
FROM node:24-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.25.0 --activate
WORKDIR /monorepo

COPY --from=deps /monorepo/node_modules ./node_modules
COPY --from=deps /monorepo/app/node_modules ./app/node_modules
COPY --from=deps /monorepo/packages/domain/node_modules ./packages/domain/node_modules

# Copy source
COPY tsconfig.base.json ./
COPY packages/domain/ ./packages/domain/
COPY app/ ./app/

# Build @meridian/domain first
RUN pnpm --filter @meridian/domain build

# NEXT_PUBLIC_ vars must be present at build time
ARG NEXT_PUBLIC_SOLANA_CLUSTER=devnet
ARG NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
ARG NEXT_PUBLIC_MERIDIAN_PROGRAM_ID=2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y
ARG NEXT_PUBLIC_MERIDIAN_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
ARG NEXT_PUBLIC_MERIDIAN_PHOENIX_PROGRAM_ID=PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY
ARG NEXT_PUBLIC_MERIDIAN_PYTH_RECEIVER_PROGRAM_ID=rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ

ENV NEXT_PUBLIC_SOLANA_CLUSTER=$NEXT_PUBLIC_SOLANA_CLUSTER
ENV NEXT_PUBLIC_SOLANA_RPC_URL=$NEXT_PUBLIC_SOLANA_RPC_URL
ENV NEXT_PUBLIC_MERIDIAN_PROGRAM_ID=$NEXT_PUBLIC_MERIDIAN_PROGRAM_ID
ENV NEXT_PUBLIC_MERIDIAN_USDC_MINT=$NEXT_PUBLIC_MERIDIAN_USDC_MINT
ENV NEXT_PUBLIC_MERIDIAN_PHOENIX_PROGRAM_ID=$NEXT_PUBLIC_MERIDIAN_PHOENIX_PROGRAM_ID
ENV NEXT_PUBLIC_MERIDIAN_PYTH_RECEIVER_PROGRAM_ID=$NEXT_PUBLIC_MERIDIAN_PYTH_RECEIVER_PROGRAM_ID

RUN pnpm --filter @meridian/app build

# ── Stage 3: Production runner ──
FROM node:24-alpine AS runner
WORKDIR /monorepo

ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output (mirrors monorepo structure due to outputFileTracingRoot)
COPY --from=builder --chown=nextjs:nodejs /monorepo/app/.next/standalone ./
# Copy static assets
COPY --from=builder --chown=nextjs:nodejs /monorepo/app/.next/static ./app/.next/static

USER nextjs
EXPOSE 8080

CMD ["node", "app/server.js"]
