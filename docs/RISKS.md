# Risks and Limitations

## Oracle Dependency

Meridian relies on Pyth Network price feeds for MAG7 stock settlement. If Pyth
feeds are unavailable, stale, or publish prices with wide confidence intervals at
settlement time, automated settlement will fail. The automation service retries
every 30 seconds for up to 15 minutes; beyond that, an admin override with a
one-hour enforced delay is required. A sustained oracle outage could delay
settlement indefinitely until admin intervention.

## Devnet vs Mainnet Differences

This implementation targets Solana devnet. Key differences from a mainnet
deployment:

- Devnet USDC is a Circle-issued test mint with no real value.
- Pyth devnet feeds may update less frequently or carry wider confidence bands
  than their mainnet equivalents.
- Phoenix devnet markets operate under test conditions — liquidity, fees, and
  seat management may not reflect mainnet behavior.
- Devnet validators may reset state, have different performance characteristics,
  or experience downtime outside Meridian's control.

No guarantees are made that the devnet implementation will function identically
on mainnet without additional hardening, auditing, and configuration changes.

## Position Constraint Is UI-Only

The restriction preventing users from holding both Yes and No tokens for the same
market is enforced only in the frontend. The on-chain program does not prevent a
wallet from holding both token types simultaneously. Users interacting directly
with the program (via CLI, scripts, or other clients) can bypass this constraint.
This is a deliberate design trade-off documented in the protocol model.

## Phoenix CLOB Dependency

Meridian delegates order book functionality to the Phoenix DEX. Meridian does not
operate its own matching engine. This means:

- Trading availability depends on Phoenix program uptime and correctness.
- Order matching, price-time priority, and fill semantics are governed by Phoenix,
  not Meridian.
- If the Phoenix program is upgraded, paused, or becomes incompatible, Meridian
  trading halts until the integration is updated.
- The current integration assumes the Phoenix Seat Manager program at a fixed
  address, zero taker fees, and seat-manager authority mode.

## Settlement Timing Approximation

Settlement targets ~4:05 PM ET using the last Pyth price update published at or
before 4:00 PM ET. The Pyth equities staleness threshold is 10 minutes. This
means:

- The settlement price may reflect a quote from up to 10 minutes before market
  close rather than the exact closing print.
- Pyth's "closing price" follows its own feed semantics, which may differ from
  the official exchange closing auction price.
- There is a known tension between the 10-minute settlement SLA and the
  15-minute oracle retry window — safety (waiting for a valid price) takes
  priority over the speed target.

## No Regulatory or Compliance Claims

This project is a technical demonstration. It does not constitute a financial
product, investment advice, or regulated securities offering. No claims are made
regarding regulatory compliance, licensing, or suitability for real-money trading.
