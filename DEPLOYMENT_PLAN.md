# Deployment Status & Plan

## What's Deployed

### Solana Devnet Program ✅
- Program ID: `2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y`
- Deploy script: `scripts/deploy-devnet.sh`
- IDL: `app/src/lib/solana/meridian-idl.json`

### Frontend (Cloud Run) ✅
- **Live URL:** `https://meridian-web-15372843900.us-central1.run.app`
- GCP project: `meridian-protocol` (us-central1)
- Image: `gcr.io/meridian-protocol/meridian-web` (~80 MB)
- Config: 1 vCPU, 512Mi, 0–3 instances, port 8080, unauthenticated
- Dockerfile: root-level, 3-stage (deps → builder → runner), node:24-alpine
- `NEXT_PUBLIC_*` vars baked at build time
- RPC: public devnet (`https://api.devnet.solana.com`)
- Redeploy: `gcloud run deploy meridian-web --source=. --region=us-central1 --allow-unauthenticated`

### Automation Scripts ✅
- `scripts/init.ts` — initialize protocol + create markets on devnet
- `scripts/reset.ts` — reset/recreate devnet state
- Run locally with deployer wallet — no cloud infra needed

---

## Remaining Work

### 1. Devnet Initialization & Verification

Protocol must be initialized on devnet with live markets for the frontend to show anything useful.

- [ ] Config PDA initialized (admin, ops authority, USDC mint, Pyth, ticker feeds)
- [ ] Demo wallet funded with SOL + devnet USDC
- [ ] Sample markets created for today's date
- [ ] Full lifecycle passes on devnet: create → mint → trade → settle → redeem

**Gotcha:** Pyth equity feeds only update during US market hours (9:30am–4pm ET). Outside those hours, use `adminSettleOverride` for settlement.

### 2. Live Frontend Verification

The evaluator experience: visit URL → connect Phantom (devnet) → trade.

- [ ] Page loads without errors at live URL
- [ ] Phantom wallet connects successfully
- [ ] Markets display with prices and order book
- [ ] Buy Yes / Buy No / Sell Yes / Sell No all work
- [ ] Portfolio shows positions and P&L
- [ ] Settlement outcomes display correctly
- [ ] Redeem flow works

### 3. One-Command Setup & README

- [ ] `make setup` or equivalent works from fresh clone
- [ ] `make demo` runs full lifecycle on devnet
- [ ] README documents: live URL, setup, architecture, env vars, trade-offs
- [ ] `.env.example` has all required vars with comments

---

## Descoped (Not Needed for Submission)

These were in the original plan but are production-ops concerns, not evaluation requirements:

| Item | Why descoped |
|------|-------------|
| Cloud Run Jobs (automation) | CLI scripts run locally — `scripts/init.ts`, `scripts/reset.ts` |
| Cloud Scheduler (cron) | Evaluator doesn't need auto-scheduled market creation |
| Secret Manager | Keypairs are local files for devnet |
| CI/CD (GitHub Actions) | Not in requirements |
| Helius RPC | Public devnet RPC sufficient for demo |
| Custom domain | Default Cloud Run URL is fine |
| Custom service accounts | Default compute SA works |

---

## Open Questions

1. **Helius RPC:** Switch to Helius free tier if public devnet rate-limiting causes visible failures during demo
2. **Devnet resets:** If devnet resets wipe the program, redeploy manually via `scripts/deploy-devnet.sh`
