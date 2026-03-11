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
