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
2. Install JavaScript dependencies with `pnpm install`.
3. Build the workspace with `pnpm build`.
4. Run smoke tests with `pnpm test`.

## Core Commands

- `pnpm build`: Anchor build, frontend build, automation build
- `pnpm test`: Rust unit tests and workspace smoke tests
- `pnpm typecheck`: frontend and automation type checks
- `pnpm dev:web`: start the Next.js frontend with root `.env`
- `pnpm dev:automation`: start the automation service with root `.env`
- `pnpm deploy:devnet`: deploy the Anchor program to Solana devnet with
  `keys/meridian-program.json`

## Notes

- The program id is pinned to `2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y`.
- The devnet USDC mint is pinned to Circle's devnet mint:
  `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.
- This scaffold is intentionally narrow. Protocol state modeling, Phoenix integration, and Pyth
  settlement logic belong in follow-on issues.
