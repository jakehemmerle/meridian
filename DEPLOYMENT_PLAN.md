# Deployment Epic: Devnet Deploy → Verify → Host → Automate

## Context

The Meridian program has **never been deployed to devnet**. `solana program show` returns "not found". No build artifacts exist (`target/`, `dist/`, `.next/` all absent). Everything has been tested exclusively against local `solana-test-validator` instances. The requirements.md states:

> "Deployment to Solana devnet is required to pass. Include reproducible scripts to deploy and run the full lifecycle on devnet."

> "Clear README with one-command setup (e.g., `make dev` or equivalent)"

This plan takes us from zero to a fully demoable state where an evaluator can open a URL, connect Phantom (set to devnet), and execute all user stories.

---

## Epic Structure: 6 Beads

```
me-??? (EPIC) Deployment and devnet readiness
├── Bead 1: Build & deploy program to devnet
├── Bead 2: Devnet initialization & verification
├── Bead 3: Frontend deployment (Cloud Run)
├── Bead 4: Automation service CLI + deployment (Cloud Run Jobs)
├── Bead 5: CI/CD pipeline (GitHub Actions)
└── Bead 6: One-command setup & README
```

**Dependency chain:**
```
Bead 1 → Bead 2 → Bead 3 (can parallel with 4)
                 → Bead 4 (can parallel with 3)
                      → Bead 5 (after 3+4)
                      → Bead 6 (after all)
```

---

## Bead 1: Build & Deploy Program to Devnet

**Goal:** Compiled program live on Solana devnet, IDL published.

### Tasks

1. **Build the program**
   - `anchor build` → produces `target/deploy/meridian.so` + `target/idl/meridian.json`
   - Requires: Rust 1.85+, Solana CLI 2.1.15+, Anchor 0.32.1
   - Verify keypair: `solana-keygen pubkey keys/meridian-program.json` must equal `2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y`

2. **Fund the deployer wallet**
   - `solana config set --url devnet`
   - `solana airdrop 2` (repeat until ~5 SOL — program deploy needs ~2-3 SOL for rent)
   - Wallet: `~/.config/solana/id.json` (as configured in Anchor.toml)

3. **Deploy to devnet**
   - `pnpm deploy:devnet` (wraps `anchor deploy --provider.cluster devnet --program-name meridian --program-keypair keys/meridian-program.json`)

4. **Publish IDL on-chain**
   - `anchor idl init -f target/idl/meridian.json 2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y --provider.cluster devnet`

5. **Verify deployment**
   - `solana program show 2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y --url devnet` → shows program data, upgrade authority
   - `anchor idl fetch 2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y --provider.cluster devnet` → returns IDL JSON

### Verification
- [ ] `solana program show` returns valid program info
- [ ] `anchor idl fetch` returns the Meridian IDL
- [ ] Upgrade authority is the deployer wallet
- [ ] `target/deploy/meridian.so` committed to... NO — `.gitignore` excludes `target/`. IDL should be committed to `target/idl/meridian.json` or copied to `app/src/lib/solana/`

### Script to create
`scripts/deploy-devnet.sh`:
```bash
#!/bin/bash
set -euo pipefail
echo "=== Meridian Devnet Deployment ==="
solana config set --url devnet
echo "Deployer: $(solana address)"
echo "Balance: $(solana balance)"
echo "Building program..."
anchor build
echo "Deploying to devnet..."
pnpm deploy:devnet
echo "Publishing IDL..."
anchor idl init -f target/idl/meridian.json 2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y --provider.cluster devnet || \
  anchor idl upgrade 2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y -f target/idl/meridian.json --provider.cluster devnet
echo "Verifying..."
solana program show 2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y --url devnet
echo "=== Done ==="
```

---

## Bead 2: Devnet Initialization & Verification

**Goal:** Protocol initialized on devnet, test markets created, demo script passes against real devnet.

### Tasks

1. **Initialize config PDA on devnet**
   - Run `initializeConfig` instruction with:
     - admin_authority = deployer wallet
     - operations_authority = deployer wallet
     - usdc_mint = `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (Circle devnet USDC)
     - pyth_receiver_program = `rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ`
     - Ticker feed IDs for all 7 MAG7 stocks

2. **Fund demo wallet with devnet USDC**
   - Circle faucet: `faucet.circle.com` → 20 USDC per request (max every 2 hours)
   - Need at least 50 USDC for meaningful demo (multiple rounds of faucet)
   - Alternative: create a script that automates faucet requests

3. **Run `pnpm demo` against real devnet**
   - Currently demo.ts is being built by polecat (me-7iu)
   - Must pass all 15 verification steps on real devnet (not local validator)
   - Settlement uses `adminSettleOverride` (acceptable for demo)

4. **Create a devnet setup script** (`scripts/setup-devnet.ts`)
   - Initialize config PDA (idempotent — skip if already initialized)
   - Verify USDC balance (warn if < 10 USDC)
   - Create a sample market for today's date
   - Print summary of all deployed state

### Verification
- [ ] Config PDA exists on devnet and is fetchable
- [ ] `pnpm demo` passes all 15 steps on devnet
- [ ] Demo wallet has SOL + USDC on devnet
- [ ] Setup script is idempotent (safe to re-run)

### Gotcha: Pyth equity feeds
Pyth equity feeds (AAPL, META, etc.) only update during US market hours (9:30am-4pm ET). Outside those hours, prices are stale and `settleMarket` will fail the staleness check. The demo must either:
- Run during market hours, OR
- Use `adminSettleOverride` (current approach in demo.ts)

---

## Bead 3: Frontend Deployment (Cloud Run)

**Goal:** Next.js app accessible at a public URL, connected to devnet.

### Why Cloud Run (not Firebase Hosting)
- `next.config.ts` uses default output mode (server rendering, not static export)
- Cloud Run supports Node.js containers natively
- Free tier: 2M requests/month, 360K vCPU-seconds
- Can use `output: "standalone"` for optimized Docker image

### Tasks

1. **Add `output: "standalone"` to next.config.ts**
   - Produces a self-contained build in `.next/standalone/`
   - Includes only necessary node_modules (smaller image)

2. **Create Dockerfile** (`app/Dockerfile`)
   ```dockerfile
   FROM node:22-alpine AS base

   FROM base AS deps
   WORKDIR /app
   COPY package.json pnpm-lock.yaml ./
   RUN corepack enable && pnpm install --frozen-lockfile --prod

   FROM base AS builder
   WORKDIR /app
   COPY --from=deps /app/node_modules ./node_modules
   COPY . .
   ENV NEXT_PUBLIC_SOLANA_CLUSTER=devnet
   # ... other NEXT_PUBLIC_ vars baked at build time
   RUN corepack enable && pnpm build

   FROM base AS runner
   WORKDIR /app
   ENV NODE_ENV=production
   COPY --from=builder /app/.next/standalone ./
   COPY --from=builder /app/.next/static ./.next/static
   COPY --from=builder /app/public ./public
   EXPOSE 3000
   CMD ["node", "server.js"]
   ```

   **Note:** This is a monorepo. The Dockerfile needs access to `packages/domain/` at build time. Two options:
   - Option A: Build domain first, copy `dist/` into Docker context
   - Option B: Use a root-level Dockerfile that builds everything
   - **Recommendation:** Option A — keep app Dockerfile self-contained, build domain in CI and copy artifact

3. **Create `app/cloudbuild.yaml`** or deploy script
   ```bash
   gcloud run deploy meridian-app \
     --source=. \
     --region=us-central1 \
     --allow-unauthenticated \
     --set-env-vars="NEXT_PUBLIC_SOLANA_CLUSTER=devnet,..."
   ```

4. **RPC endpoint strategy**
   - Public devnet RPC (`api.devnet.solana.com`) is rate-limited (100 req/10s)
   - Sign up for Helius free tier (1M credits/month, 10 RPS) for reliability
   - Use `NEXT_PUBLIC_SOLANA_RPC_URL` pointed at Helius devnet endpoint
   - Frontend makes RPC calls directly from browser (standard for Solana dApps)

5. **Register pnpm script**
   ```json
   "deploy:web": "cd app && gcloud run deploy meridian-app --source=. --region=us-central1 --allow-unauthenticated"
   ```

### Verification
- [ ] `docker build` succeeds from `app/` directory
- [ ] Container runs locally: `docker run -p 3000:3000 meridian-app`
- [ ] App loads at public Cloud Run URL
- [ ] Phantom wallet (devnet mode) can connect
- [ ] `pnpm deploy:web` deploys in one command

---

## Bead 4: Automation Service CLI + Deployment (Cloud Run Jobs)

**Goal:** Automation jobs runnable as CLI commands and deployed as Cloud Run Jobs on a schedule.

### Current problem
`automation/src/index.ts` only runs `runBootstrapCheck()`. The job functions (`runMorningJob`, `runAfternoonJob`, etc.) exist but have no CLI entry point. They require dependency injection objects.

### Tasks

1. **Add CLI dispatcher** (`automation/src/cli.ts`)
   ```typescript
   // Usage: node dist/cli.js morning | afternoon | close | settle | demo-setup
   const command = process.argv[2];
   switch (command) {
     case "morning": await runMorningJob(buildDeps(env)); break;
     case "afternoon": await runAfternoonJob(buildDeps(env)); break;
     case "close": await runCloseMarketsJob(buildDeps(env)); break;
     case "settle": await runSettleMarketsJob(buildDeps(env)); break;
     case "demo-setup": await runDemoSetup(buildDeps(env)); break;
   }
   ```

   Add `buildDeps()` helper that constructs the DI objects from env vars.

2. **Register CLI in package.json**
   ```json
   "automation:morning": "dotenv -e .env.devnet -- pnpm exec tsx automation/src/cli.ts morning",
   "automation:afternoon": "dotenv -e .env.devnet -- pnpm exec tsx automation/src/cli.ts afternoon",
   "automation:settle": "dotenv -e .env.devnet -- pnpm exec tsx automation/src/cli.ts settle"
   ```

3. **Create Dockerfile** (`automation/Dockerfile`)
   ```dockerfile
   FROM node:22-alpine
   WORKDIR /app
   COPY package.json pnpm-lock.yaml ./
   RUN corepack enable && pnpm install --frozen-lockfile --prod
   COPY dist/ ./dist/
   # Keypair injected via Secret Manager mount
   CMD ["node", "dist/cli.js"]
   ```

4. **Deploy as Cloud Run Jobs**
   - Morning job: `gcloud run jobs create meridian-morning --image=... --command="node,dist/cli.js,morning"`
   - Afternoon job: `gcloud run jobs create meridian-afternoon --image=... --command="node,dist/cli.js,afternoon"`
   - Secrets: keypair file via GCP Secret Manager, mounted at `/secrets/keypair.json`

5. **Schedule with Cloud Scheduler**
   - Morning: `0 8 * * 1-5` (8:00 AM ET, weekdays) → triggers morning Cloud Run Job
   - Afternoon: `5 16 * * 1-5` (4:05 PM ET, weekdays) → triggers afternoon Cloud Run Job
   - Timezone: `America/New_York`

6. **Keypair management**
   - Store `keys/meridian-program.json` and deployer wallet keypair in GCP Secret Manager
   - Mount as files in Cloud Run Jobs (not env vars — Solana expects file paths)
   - `ANCHOR_WALLET=/secrets/keypair.json`

### Verification
- [ ] `pnpm automation:morning` runs locally and creates markets on devnet
- [ ] `pnpm automation:afternoon` runs locally and settles markets on devnet
- [ ] Docker image builds and runs jobs
- [ ] Cloud Scheduler triggers jobs on schedule
- [ ] Secrets mounted correctly (keypair accessible)

---

## Bead 5: CI/CD Pipeline (GitHub Actions)

**Goal:** Push to main triggers: build → test → deploy.

### Tasks

1. **Create `.github/workflows/ci.yml`**
   ```yaml
   name: CI
   on: [push, pull_request]
   jobs:
     build-and-test:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: pnpm/action-setup@v4
         - uses: actions/setup-node@v4
           with: { node-version: 22, cache: pnpm }
         - uses: dtolnay/rust-toolchain@stable
           with: { toolchain: "1.89.0" }
         - name: Cache Cargo
           uses: actions/cache@v4
           with:
             path: |
               ~/.cargo/registry
               ~/.cargo/git
               target
             key: cargo-${{ hashFiles('**/Cargo.lock') }}
         - name: Install Solana CLI
           run: |
             sh -c "$(curl -sSfL https://release.anza.xyz/v2.1.15/install)"
             echo "$HOME/.local/share/solana/install/active_release/bin" >> $GITHUB_PATH
         - name: Install Anchor
           run: cargo install --git https://github.com/coral-xyz/anchor avm --locked && avm install 0.32.1 && avm use 0.32.1
         - run: pnpm install --frozen-lockfile
         - run: anchor build
         - run: pnpm build
         - run: pnpm test
         - run: pnpm test:integration:full
   ```

2. **Create `.github/workflows/deploy.yml`** (triggered on push to main, after CI passes)
   - Deploys frontend to Cloud Run
   - Deploys automation Docker image to Artifact Registry
   - Optionally upgrades program on devnet (manual trigger only — `workflow_dispatch`)

3. **Secrets to configure in GitHub:**
   - `GCP_SERVICE_ACCOUNT_KEY` — for Cloud Run deployment
   - `DEPLOY_KEYPAIR` — base64-encoded Solana keypair (for program upgrades)
   - `HELIUS_API_KEY` — RPC endpoint (if using paid provider)

### Verification
- [ ] CI passes on push to main
- [ ] Deploy workflow deploys frontend on merge
- [ ] Program upgrade is manual-only (workflow_dispatch)
- [ ] Cached builds take < 5 min

---

## Bead 6: One-Command Setup & README

**Goal:** Any developer can clone the repo and be running in one command.

### Tasks

1. **Create `Makefile`** (or `scripts/setup.sh`)
   ```makefile
   setup:
   	cp -n .env.example .env
   	pnpm install
   	anchor build
   	pnpm build
   	pnpm bootstrap:check

   dev:
   	pnpm dev:web

   demo:
   	pnpm demo

   deploy:
   	./scripts/deploy-devnet.sh
   	pnpm deploy:web
   ```

2. **Update README.md**
   - One-command quick start: `make setup && make demo`
   - Devnet deployment instructions
   - Architecture diagram showing deployed components
   - Link to live frontend URL
   - Troubleshooting: devnet SOL faucet, USDC faucet, common errors
   - Environment variable reference table

3. **Update .env.devnet.example**
   - Add comments explaining each variable
   - Add Helius RPC URL placeholder
   - Add Cloud Run URL placeholder for `NEXT_PUBLIC_SOLANA_RPC_URL`

### Verification
- [ ] Fresh clone → `make setup && make demo` works end-to-end
- [ ] README has live URL, architecture diagram, all env vars documented
- [ ] Evaluator can follow README and see the system running

---

## Parallelism & Dependencies

```
Bead 1 (build + deploy program)
  ↓
Bead 2 (initialize + verify on devnet)
  ↓
  ├── Bead 3 (frontend Cloud Run)  ← parallel
  └── Bead 4 (automation Cloud Run Jobs)  ← parallel
        ↓
      Bead 5 (CI/CD)
        ↓
      Bead 6 (one-command setup + README)
```

**Slingable immediately:** Bead 1 (no dependencies)
**After Bead 1:** Bead 2
**After Bead 2:** Beads 3 + 4 in parallel
**After 3+4:** Bead 5
**After all:** Bead 6

---

## Open Questions

1. **GCP project:** Do we have a GCP project set up? Need project ID for Cloud Run, Artifact Registry, Secret Manager, Cloud Scheduler.
2. **Helius API key:** Should we sign up for Helius free tier now, or use public devnet RPC for the initial deployment?
3. **Domain/URL:** Do we want a custom domain (e.g., `meridian.gauntlet.dev`) or is the default Cloud Run URL (`meridian-app-xxxxx.run.app`) fine?
4. **Devnet resets:** Devnet resets periodically and wipes all programs. Should CI/CD include automatic redeployment, or is manual redeployment acceptable?
5. **Automation keypair:** Use the same deployer wallet for automation, or create a dedicated ops wallet?
