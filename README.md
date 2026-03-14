# Meridian Workspace

This repository is the bootstrap workspace for Meridian, the Solana devnet implementation path
documented in `requirements.md`, `research-codex.md`, and `research-rubric.md`.

## Stack

- Anchor `0.32.1`
- Solana CLI `3.1.10`
- Rust `1.89+`
- Next.js `16`
- TypeScript `5.9`
- Node.js `18+` with `pnpm`

## Layout

- `programs/meridian`: Anchor program crate
- `app`: Next.js frontend shell
- `automation`: Node.js automation service shell
- `tests`: workspace smoke tests
- `keys/meridian-program.json`: Anchor program keypair for local and devnet deploys

## Current Protocol Model

The current program scaffold now treats the protocol boundary as two core accounts:

- `MeridianConfig`: global admin and operations authorities, paused flag, oracle thresholds,
  pinned USDC mint, pinned Pyth receiver program, and the fixed MAG7 ticker-to-feed mapping
- `MeridianMarket`: one stock/strike/day market with deterministic lifecycle state, Phoenix
  market reference, Yes/No mints, collateral vault, oracle feed id, and collateral/open-interest
  counters

Seed conventions are fixed in the program crate for the next implementation pass:

- `config`
- `market`
- `vault`
- `yes_mint`
- `no_mint`

The invariant model is intentionally explicit and testable:

- Before settlement, `yes_open_interest` must equal `no_open_interest`
- Vault collateral must equal outstanding claims at every step
- `mint` increases both sides and vault claim equally
- `merge` burns both sides equally and returns the same amount of USDC claim
- After settlement, only the winning side remains claimable and redemptions reduce both winning
  open interest and vault liability together

Protocol enforcement versus UI enforcement is also explicit:

- On-chain: collateral accounting, lifecycle transitions, oracle mapping, settlement, and
  redemption invariants
- Frontend only: preventing users from intentionally holding both Yes and No as a steady-state
  trading position

This is the implementation baseline for the next on-chain stories: config init, market creation,
mint/merge, and then settlement/redemption.

## Quick Start

1. Copy `.env.example` to `.env`.
2. Confirm `ANCHOR_WALLET` points to an existing Solana keypair and keep the shared and
   `NEXT_PUBLIC_*` values aligned.
3. Install JavaScript dependencies with `pnpm install`.
4. Run `pnpm bootstrap:check` to validate the devnet bootstrap configuration directly from source
   before builds or deploys.
5. Build the Solana program with `anchor build` (produces `target/deploy/meridian.so`).
6. Build the workspace with `pnpm build`.
7. Run unit tests with `pnpm test`.
8. Run on-chain integration tests with `pnpm test:integration:full`
   (requires step 5 — spins up a fresh `solana-test-validator` per suite).

## Local Validator

When running a local validator (`solana-test-validator` or `anchor localnet`), ensure the Solana CLI
config matches your Anchor setup:

```bash
solana config set --url http://127.0.0.1:8899 --keypair ~/.config/solana/id.json
```

Without this, CLI commands like `solana program show` and `solana airdrop` will fail with signer or
connection errors even though the validator is running correctly.

## Core Commands

- `pnpm bootstrap:check`: validate env, keypair paths, program IDs, and devnet targeting
- `pnpm build`: Anchor build, frontend build, automation build
- `pnpm test`: Rust unit tests and workspace smoke tests
- `pnpm test:unit`: domain and automation unit tests only
- `pnpm test:frontend`: frontend component tests (vitest)
- `pnpm test:integration:full`: **preferred way to run integration tests** — runs
  all program integration tests, each with a fresh local validator. Required
  because suites share a config PDA and cannot run in one process. Do not use
  `anchor test` or `pnpm test:integration` for the full suite.
- `pnpm typecheck`: frontend and automation type checks
- `pnpm dev:web`: start the Next.js frontend with root `.env`
- `pnpm dev:automation`: start the automation service with root `.env`
- `pnpm deploy:devnet`: deploy the Anchor program to Solana devnet with
  `keys/meridian-program.json`

## Notes

- The program id is pinned to `2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y`.
- The devnet USDC mint is pinned to Circle's devnet mint:
  `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.
- `pnpm bootstrap:check` fails early if required env vars are missing, if the frontend and shared
  program settings drift, if devnet is not selected, or if the wallet/keypair paths do not exist.

## Phoenix Integration Boundary

- Meridian owns the Yes/No token mints, collateral vault, lifecycle gates, settlement, `merge`,
  and redemption.
- Phoenix owns the Yes/USDC order book. The No-side trading experience is derived from the same
  Yes book rather than a separate No market.
- The automation layer is responsible for Phoenix market bootstrap and seat workflow on devnet.
- The current bootstrap contract assumes the Phoenix Seat Manager program
  `PSMxQbAoDWDbvd9ezQJgARyq6R9L5kJAasaLDVcZwf1`, zero Phoenix taker fees, and a market authority
  mode of `seat-manager`.
- All Phoenix orders for Meridian must expire at or before the Meridian market close. Post-close
  order entry and cancellation remain follow-on trading work, not bootstrap behavior.
- This scaffold remains intentionally narrow. The actual Phoenix trading flows and Pyth settlement
  transactions still land in follow-on issues.
