# Meridian Research Rubric

Updated: 2026-03-10

This worksheet resolves requirement ambiguities before architecture, systems thinking,
and implementation planning.

## Decisions Made

- **Chain:** Solana (committed)
- **Smart contract framework:** Anchor v0.32.1 (Rust)
- **Order book:** Phoenix DEX (existing on-chain CLOB)
- **Oracle:** Pyth Network (pull oracle)
- **Token standard:** SPL Token Program (required by Phoenix — no Token-2022)
- **Devnet finality:** Acceptable for submission

---

## Status Legend

- `Resolved`: Answer confirmed with citations
- `Decided`: Stakeholder decision made
- `Assumption`: No explicit answer; proceeding with stated assumption
- `Open`: Still needs resolution

---

## Resolved Questions

### R1 — Chain and Execution Venue → RESOLVED

**Decision:** Solana devnet is the primary submission path. EVM and HyperLiquid are research-only.

**Evidence:** Phoenix is deployed on Solana devnet with program ID `PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY`. Pyth has all 7 MAG7 feeds available on Solana devnet. Toolchain is mature.

Sources:
- [phoenix-v1/src/lib.rs](https://github.com/Ellipsis-Labs/phoenix-v1/blob/master/src/lib.rs) — program ID
- [Pyth contract addresses](https://docs.pyth.network/price-feeds/contract-addresses/solana) — devnet deployment

### R2 — CLOB Approach → RESOLVED

**Decision:** Phoenix DEX. Market creation is permissionless. Custom SPL token pairs (Yes/USDC) are supported.

**Key findings:**
- `InitializeMarket` accepts arbitrary `base_mint` and `quote_mint` — no whitelist
- Devnet already has non-standard token markets (Bonk/USDC, wSOL/USDC-Drift)
- CPI from Anchor into Phoenix is proven by [phoenix-onchain-market-maker](https://github.com/Ellipsis-Labs/phoenix-onchain-market-maker)
- Phoenix crate has `cpi` feature flag for CPI usage
- Maker fees are zero; taker fees configurable per-market via `taker_fee_bps`

Sources:
- [initialize.rs](https://github.com/Ellipsis-Labs/phoenix-v1/blob/master/src/program/processor/initialize.rs) — market creation logic
- [devnet_markets.json](https://github.com/Ellipsis-Labs/phoenix-sdk/blob/master/devnet_markets.json) — custom pair proof
- [phoenix-onchain-market-maker](https://github.com/Ellipsis-Labs/phoenix-onchain-market-maker/blob/master/programs/phoenix-onchain-mm/src/lib.rs) — CPI reference
- [Cargo.toml](https://github.com/Ellipsis-Labs/phoenix-v1/blob/master/Cargo.toml) — `cpi` feature

### R3 — Oracle Availability → RESOLVED

**Decision:** Pyth Network. All 7 MAG7 feeds confirmed. Pull oracle required (no push/sponsored feeds for equities).

**Feed IDs (universal across mainnet and devnet):**

| Ticker | Feed ID |
|--------|---------|
| AAPL | `49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688` |
| MSFT | `d0ca23c1cc005e004ccf1db5bf76aeb6a49218f43dac3d4b275e92de12ded4d1` |
| GOOGL | `5a48c03e9b9cb337801073ed9d166817473697efff0d138874e0f6a33d6d5aa6` |
| AMZN | `b5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a` |
| NVDA | `b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593` |
| META | `78a3e3b8e676a8f73c439f5d749737034b139bbbe899ba5775216fba596607fe` |
| TSLA | `16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1` |

**Pyth program addresses (same on mainnet and devnet):**

| Program | Address |
|---------|---------|
| Solana Receiver | `rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ` |
| Price Feed | `pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT` |

**Crate:** `pyth-solana-receiver-sdk` (compatible with Anchor v0.28–v0.31; needs verification for v0.32)

Sources:
- [Hermes API](https://hermes.pyth.network/v2/price_feeds?query=AAPL&asset_type=equity) — feed discovery
- [Pyth contract addresses](https://docs.pyth.network/price-feeds/contract-addresses/solana) — program IDs
- [Pyth Solana integration](https://docs.pyth.network/price-feeds/use-real-time-data/solana) — on-chain usage
- [pyth-solana-receiver-sdk](https://github.com/pyth-network/pyth-crosschain/tree/main/target_chains/solana/pyth_solana_receiver_sdk)

### R4 — Settlement Source of Truth → RESOLVED

**Decision:** The last Pyth regular-session feed update before/at 4:00 PM ET is the settlement price.

**Key findings:**
- Pyth equity feeds have **no explicit "closing price" field** — the feed simply stops updating after market close
- Regular session feed (`Equity.US.XXX/USD`) publishes during 9:30 AM – 4:00 PM ET only, at **5-minute intervals**
- After 4 PM ET, the last published price (with `publish_time` near 4:00 PM) is the de facto close
- Separate feeds exist for pre-market (`.PRE`), post-market (`.POST`), and overnight (`.ON`) — we use only the regular session feed
- No `trading_status` field in the API — staleness determined by comparing `publish_time` vs current time

**Implication:** Settlement `maximum_age` must be generous (600 seconds / 10 minutes) since the feed only publishes every 5 minutes. The last update could be 4-5 minutes before the official close.

Sources:
- [Pyth market hours](https://docs.pyth.network/price-feeds/core/market-hours)
- [Pyth best practices](https://docs.pyth.network/price-feeds/best-practices)

### R5 — Market-State Transitions → ASSUMPTION

**Assumption:** Trading and minting halt at 4:00 PM ET. Resting orders on Phoenix should use `last_valid_unix_timestamp_in_seconds` set to market close time so they auto-expire.

**Phoenix primitives available:**
- Market status enum: `Active(1)`, `PostOnly(2)`, `Paused(3)`, `Closed(4)`, `Tombstoned(5)`
- Orders support TTL via `last_valid_slot` or `last_valid_unix_timestamp_in_seconds`
- Market authority can change market status

**Proposed lifecycle:**
1. Market created → status: Active
2. 4:00 PM ET → automation sets status to Closed (no new orders)
3. ~4:05 PM ET → settle market (read Pyth, write outcome)
4. Post-settlement → redemption enabled

Sources:
- [order_packet.rs](https://github.com/Ellipsis-Labs/phoenix-v1/blob/master/src/state/order_schema/order_packet.rs) — TTL fields
- [accounts.rs](https://github.com/Ellipsis-Labs/phoenix-v1/blob/master/src/program/accounts.rs) — market status enum

### R6 — Sell No and Pair Closing → RESOLVED

**Decision:** Implement a `merge` instruction in our Anchor program. Also, "Sell No" works via buying Yes on Phoenix (user already holds No; now holds Yes+No = $1 redeemable).

**Two paths for closing a No position:**

1. **Sell No (via order book):** User buys a Yes token from Phoenix ask side. Now holds Yes + No → calls `merge` to burn both and receive $1 USDC. Can be composed atomically: CPI buy-Yes on Phoenix + merge, all in one instruction.

2. **Merge instruction (standalone):** Any user holding 1 Yes + 1 No for the same strike can call `merge` to burn both and receive $1 USDC from the vault. This is economically clean and maintains the vault invariant.

**For "Buy No" (atomic mint-and-sell):** CPI is proven. Our program mints Yes+No pair, then CPIs into Phoenix to sell Yes at market/limit. User keeps No token. One transaction, one wallet approval.

Source: [phoenix-onchain-market-maker](https://github.com/Ellipsis-Labs/phoenix-onchain-market-maker) — proves multi-CPI atomic composition

### R7 — Position Constraints → DECIDED

**Decision:** UI-level enforcement only. Program offers `merge` for users who end up holding both.

**Rationale:**
- Phoenix requires SPL Token Program (not Token-2022), so no transfer hooks are available
- `NonTransferable` extension blocks ALL transfers including DEX — not suitable
- Holding both Yes + No is economically equivalent to holding $1 USDC — not harmful, just capital-inefficient
- Direct program callers can bypass UI constraints — this is acceptable

Sources:
- [token_checkers.rs](https://github.com/Ellipsis-Labs/phoenix-v1/blob/master/src/program/validation/checkers/token_checkers.rs) — Phoenix hardcodes `spl_token::id()`
- [NonTransferable docs](https://solana.com/developers/guides/token-extensions/non-transferable) — blocks all transfers
- [Transfer Hook docs](https://solana.com/developers/guides/token-extensions/transfer-hook) — Token-2022 only

---

## Toolchain Versions (Resolved)

| Tool | Version | Install | Source |
|------|---------|---------|--------|
| Anchor | v0.32.1 | `avm install 0.32.1 && avm use 0.32.1` | [GitHub releases](https://github.com/coral-xyz/anchor/releases) |
| Solana CLI (Agave) | v3.1.10 | `sh -c "$(curl -sSfL https://release.anza.xyz/v3.1.10/install)"` | [Anza docs](https://docs.anza.xyz/cli/install) |
| Rust | 1.89.0+ | `rustup update stable` | [Anchor 0.32 notes](https://www.anchor-lang.com/docs/updates/release-notes/0-32-0) |
| Node.js | 18+ LTS | — | [Anchor docs](https://www.anchor-lang.com/docs/installation) |
| AVM | latest | `cargo install --git https://github.com/coral-xyz/anchor avm --force` | [Anchor installation](https://www.anchor-lang.com/docs/installation) |

**Anchor 0.32 notable changes:**
- `solana-verify` replaces Docker-based `anchor verify`
- `solana-invoke` replaces `solana_cpi::invoke` (~5% CU savings)
- IDL building uses stable Rust (no nightly)
- Minimum Rust 1.89.0 (for `Span::local_file` stabilization)
- `bun` supported as package manager

Source: [Anchor 0.32 release notes](https://www.anchor-lang.com/docs/updates/release-notes/0-32-0)

**Devnet RPC:** `https://api.devnet.solana.com` — 100 req/10s, 40 concurrent connections. Not for production.

Source: [Solana clusters](https://solana.com/docs/references/clusters)

---

## Token Architecture (Resolved)

### Token Program

**SPL Token Program** (not Token-2022). Phoenix v1 hardcodes ownership checks against `spl_token::id()` and expects 165-byte token accounts. Token-2022 tokens will be rejected.

Source: [token_checkers.rs](https://github.com/Ellipsis-Labs/phoenix-v1/blob/master/src/program/validation/checkers/token_checkers.rs)

### Token Decimals

**6 decimals** for Yes/No tokens, matching USDC. 1 pair = 1,000,000 base units of each.

Source: [Circle USDC Solana](https://developers.circle.com/stablecoins/quickstart-transfer-10-usdc-on-solana)

### Devnet USDC

- **Mint:** `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- **Faucet:** [faucet.circle.com](https://faucet.circle.com) — 20 USDC per 2 hours per address

Source: [Circle Solana quickstart](https://developers.circle.com/stablecoins/quickstart-transfer-10-usdc-on-solana)

### Vault Pattern

Standard PDA-controlled token account:
```rust
#[account(
    init,
    payer = authority,
    token::mint = usdc_mint,
    token::authority = vault,
    seeds = [b"vault", market.key().as_ref()],
    bump,
)]
pub vault: Account<'info, TokenAccount>,
```

Sources:
- [Anchor token accounts](https://www.anchor-lang.com/docs/tokens/basics/create-token-account)
- [PDA sharing security](https://solana.com/developers/courses/program-security/pda-sharing)

---

## Phoenix Integration Details (Resolved)

### Order Types

| Type | Phoenix Variant | Details |
|------|-----------------|---------|
| Limit (GTC) | `Limit` | Crosses then rests. Optional TTL expiry |
| Post-Only | `PostOnly` | Never crosses. Reject or amend options |
| Market | `ImmediateOrCancel` + `price_in_ticks=None` | No price limit |
| IOC | `ImmediateOrCancel` | With price limit |
| FOK | `ImmediateOrCancel` + `min == max` | All-or-nothing |

Source: [order_packet.rs](https://github.com/Ellipsis-Labs/phoenix-v1/blob/master/src/state/order_schema/order_packet.rs)

### Account Layout

| Component | Structure |
|-----------|-----------|
| MarketHeader | 576 bytes: status, size params, token params, lot/tick sizes, authority, fee recipient |
| Market Data | taker_fee_bps, fee accumulators, bids/asks RedBlackTrees, traders tree |
| Seat PDA | seeds: `[b"seat", market, trader]` — approval_status: NotApproved/Approved/Retired |
| Vault PDAs | seeds: `[b"vault", market, mint]` — standard SPL token accounts |

Sources:
- [accounts.rs](https://github.com/Ellipsis-Labs/phoenix-v1/blob/master/src/program/accounts.rs)
- [fifo.rs](https://github.com/Ellipsis-Labs/phoenix-v1/blob/master/src/state/markets/fifo.rs)

### Seat Workflow

Trader calls `RequestSeat` (permissionless) → Market authority or Seat Manager (`PSMxQbAoDWDbvd9ezQJgARyq6R9L5kJAasaLDVcZwf1`) approves.

Source: [phoenix-seat-manager-v1](https://github.com/Ellipsis-Labs/phoenix-seat-manager-v1)

### Fees

- Maker: **zero**
- Taker: configurable via `taker_fee_bps` at market creation
- Formula: `(size * fee_bps + 9999) / 10000` (rounded up)

Source: [fifo.rs](https://github.com/Ellipsis-Labs/phoenix-v1/blob/master/src/state/markets/fifo.rs)

### Real-Time Data

- Solana account subscriptions: `connection.onAccountChange(marketAddress, callback)`
- Parse with `@ellipsis-labs/phoenix-sdk` → `getUiLadder()`
- Event decoding: `getPhoenixEventsFromTransactionSignature`

Sources:
- [watch.ts](https://github.com/Ellipsis-Labs/phoenix-sdk/blob/master/typescript/phoenix-sdk/examples/watch.ts)
- [grpc.rs](https://github.com/Ellipsis-Labs/phoenix-sdk/blob/master/rust/examples/src/bin/grpc.rs)

### SDKs

| SDK | Package | Source |
|-----|---------|--------|
| Rust on-chain (CPI) | `phoenix-v1` v0.2.4 | [GitHub](https://github.com/Ellipsis-Labs/phoenix-v1) |
| Rust off-chain | `phoenix-sdk` v0.8.0 | [GitHub](https://github.com/Ellipsis-Labs/phoenix-sdk/tree/master/rust) |
| TypeScript | `@ellipsis-labs/phoenix-sdk` | [GitHub](https://github.com/Ellipsis-Labs/phoenix-sdk/tree/master/typescript/phoenix-sdk) |
| CLI | `phoenix-cli` | [GitHub](https://github.com/Ellipsis-Labs/phoenix-cli) |
| Reference Anchor | `phoenix-onchain-market-maker` | [GitHub](https://github.com/Ellipsis-Labs/phoenix-onchain-market-maker) |

### Phoenix Status

- Actively maintained — latest commits Feb 4, 2026
- Rebranded to "Phoenix Legacy" (v2 likely in development)
- License: BUSL-1.1, Audited by OtterSec

---

## Pyth Integration Details (Resolved)

### On-Chain Pattern

```rust
use pyth_solana_receiver_sdk::price_update::{PriceUpdateV2, get_feed_id_from_hex};

#[derive(Accounts)]
pub struct SettleMarket<'info> {
    pub price_update: Account<'info, PriceUpdateV2>,
}

pub fn settle(ctx: Context<SettleMarket>) -> Result<()> {
    let price_update = &ctx.accounts.price_update;
    let feed_id = get_feed_id_from_hex("0x49f6b65...")?;
    let price = price_update.get_price_no_older_than(&Clock::get()?, 600, &feed_id)?;
    // price.price, price.conf, price.exponent
}
```

Source: [Pyth Solana integration](https://docs.pyth.network/price-feeds/use-real-time-data/solana)

### Pull Oracle Flow

Client fetches price from Hermes off-chain → posts on-chain via `PythSolanaReceiver` in same transaction → program reads `PriceUpdateV2` account.

Source: [Pyth pull updates](https://docs.pyth.network/price-feeds/pull-updates)

### Off-Chain API (Morning Strike Calculation)

```
GET https://hermes.pyth.network/v2/updates/price/latest?ids[]=<feed_id>
GET https://hermes.pyth.network/v2/updates/price/{publish_time}?ids[]=<feed_id>
```

TypeScript: `@pythnetwork/hermes-client` → `HermesClient`

Sources:
- [Hermes docs](https://hermes.pyth.network/docs/)
- [API reference](https://docs.pyth.network/price-feeds/api-reference)
- [Benchmarks API](https://benchmarks.pyth.network/docs)

### Confidence Check

Pyth provides `price`, `conf`, and `exponent` on every update:
- Reject settlement if `conf / price > 0.5%` (configurable threshold)
- Use `price ± conf` as 95% probability range

Source: [Pyth best practices](https://docs.pyth.network/price-feeds/best-practices)

### Known Limitations

1. Equity feeds update every **5 minutes** (not sub-second)
2. No push/sponsored feeds for equities — must use pull oracle
3. Weekend/holiday gaps — no updates published
4. No explicit `trading_status` field — infer from `publish_time` staleness
5. Pre/post/overnight are **separate feed IDs** per stock

Sources:
- [Market hours](https://docs.pyth.network/price-feeds/core/market-hours)
- [Push feeds](https://docs.pyth.network/price-feeds/core/push-feeds/solana)

---

## Remaining Decisions Needed

| ID | Area | Status | Question | Recommended Default |
|----|------|--------|----------|-------------------|
| R8 | Strike policy | Assumption | Is at-the-close strike mandatory? Rounding rule for `.5`? | Include rounded close. Round half-up. Deduplicate by final value. Add-only intraday. |
| R9 | Fee model | Assumption | Zero fees in V1? | Yes — zero protocol fees. Reserve fee vault architecture. Set Phoenix `taker_fee_bps=0`. |
| R11 | Admin authority | Assumption | Single signer or multisig? | Single admin keypair + separate automation signer. Same keypair acceptable for devnet demo. |
| R12 | Oracle failure SLA | Assumption | 10-min settlement target vs 15-min retry window? | Safety wins. Retry up to 15 min, then admin override with 1-hour delay from market close. 10-min target is aspirational. |
| R13 | P&L valuation | Assumption | Mark-to-market method? | Best executable price from order book. Client-side entry price tracking for MVP. |
| R14 | Automation scope | Assumption | Job runner + dashboards? | Minimal scheduled jobs with structured console logs. No dashboard for V1. |
| R15 | Demo scope | Assumption | All 7 tickers or 1 end-to-end? | All 7 tickers with full automation. Single-ticker is the fallback if time-constrained. |

---

## Architecture Gate Checklist

| Gate | Status |
|------|--------|
| R1 — Chain selection | ✅ Resolved: Solana |
| R2 — CLOB approach | ✅ Resolved: Phoenix |
| R3 — Oracle availability | ✅ Resolved: Pyth, all 7 feeds confirmed |
| R4 — Settlement source of truth | ✅ Resolved: Last Pyth regular-session update |
| R5 — Market-state transitions | ⚠️ Assumption: Halt at 4 PM, auto-expire orders |
| R6 — Sell No / pair closing | ✅ Resolved: Merge instruction + atomic CPI |

**All blocking gates are resolved or have documented assumptions. Architecture planning can proceed.**

---

## Key Architecture Implications

1. **Phoenix requires SPL Token (not Token-2022)** → No transfer hooks, no on-chain position constraints at token level
2. **Pyth uses pull oracle for equities** → Client must fetch from Hermes and post on-chain in same transaction
3. **Pyth equity feeds update every 5 minutes** → Settlement staleness check must be 600s
4. **No explicit closing price** → Last regular-session price before 4 PM is the de facto close
5. **Phoenix CPI is proven** → Atomic mint+sell for "Buy No" is feasible via [phoenix-onchain-market-maker](https://github.com/Ellipsis-Labs/phoenix-onchain-market-maker)
6. **Phoenix seat approval required** → Use Seat Manager program or our program as market authority
7. **Merge instruction needed** → Burn 1 Yes + 1 No → return $1 USDC
8. **~49 Phoenix markets daily** → Feasible on devnet; account rent is the main cost concern
9. **`pyth-solana-receiver-sdk` compatibility with Anchor 0.32 needs verification** → Known compatible through 0.31.1
