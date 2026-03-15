# Meridian Demo Procedure

Two demo modes: **CLI demo** (automated end-to-end lifecycle) and **live browser demo**
(interactive trading in the frontend with Phantom wallet).

Both modes can run against **devnet** or a **local validator**.

---

## Prerequisites

### Common (All Modes)

1. Dependencies installed:
   ```bash
   pnpm install
   ```
2. `.env` file present (copy from `.env.example` if needed for local, `.env.devnet` from `.env.devnet.example` for devnet)
3. Anchor program built:
   ```bash
   anchor build
   ```

### Devnet

4. Solana CLI configured for devnet:
   ```bash
   solana config set --url https://api.devnet.solana.com
   ```
5. Program deployed to devnet:
   ```bash
   pnpm deploy:devnet
   ```
6. Payer wallet (`~/.config/solana/id.json`) funded with >= 2 SOL and some devnet USDC

### Local Validator

4. Copy `.env.example` to `.env` (if not already present):
   ```bash
   cp .env.example .env
   ```
5. Start a local validator with Phoenix and Seat Manager cloned from devnet:
   ```bash
   solana-test-validator \
     --clone-upgradeable-program PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY \
     --clone-upgradeable-program PSMxQbAoDWDbvd9ezQJgARyq6R9L5kJAasaLDVcZwf1 \
     --url https://api.devnet.solana.com \
     --reset
   ```
6. In a second terminal, deploy the program locally:
   ```bash
   anchor deploy --provider.cluster localnet --program-keypair keys/meridian-program.json
   ```

> **No SOL airdrop or USDC funding needed locally** — the seed script handles
> both automatically. It airdrops SOL and creates a fresh USDC mint where the
> payer is the mint authority, so USDC is unlimited.

---

## Local vs Devnet — Side by Side

| | Devnet | Local Validator |
|---|---|---|
| **Env file** | `.env.devnet` | `.env` |
| **Seed** | `pnpm seed:devnet` | `pnpm seed` |
| **Reset** | `pnpm seed:devnet:reset` | `pnpm seed:reset` |
| **Frontend** | `pnpm dev:web:devnet` | `pnpm dev:web` |
| **SOL funding** | Manual airdrop or faucet | Auto-airdropped by seed script |
| **USDC** | Limited (devnet Circle mint) | Unlimited (seed creates mint, payer is authority) |
| **Confirmation speed** | ~400ms | ~50ms |
| **Phoenix/Pyth programs** | Already deployed on devnet | Cloned via `--clone-upgradeable-program` |
| **Program deploy** | `pnpm deploy:devnet` | `anchor deploy --provider.cluster localnet` |
| **Phantom network** | Solana Devnet | Custom RPC: `http://127.0.0.1:8899` |
| **Explorer links** | Work (devnet explorer) | Won't resolve (use `solana confirm <sig>`) |

> **When to use local**: Faster iteration, unlimited USDC, no rate limits, works
> offline after initial clone. Ideal for rehearsing the demo.
>
> **When to use devnet**: Proving deployment to a real network. Required for
> submission. Explorer links work for the audience.

---

## Mode 1: CLI Demo (Automated Lifecycle)

Runs the full market lifecycle in a single script — no browser needed. Good for
verifying the protocol end-to-end or as a first demo pass.

```bash
pnpm demo          # runs against local (.env)
pnpm demo:devnet   # runs against devnet (.env.devnet)
```

### What It Does

| Step | Action | Verifies |
|------|--------|----------|
| 1 | Validate env, RPC connection, SOL balance | Environment setup |
| 2 | Initialize config PDA (idempotent) | Config init |
| 3 | Create Meridian market (AAPL, $200 strike, 24h expiry) | Market creation |
| 4 | Create Phoenix order book (YES/USDC pair) | Phoenix integration |
| 5 | Request + approve Phoenix seat | Seat workflow |
| 6 | Mint 10 YES/NO pairs (deposits 10 USDC) | Mint pair, vault invariant |
| 7 | Place resting bids and asks on Phoenix | Order book liquidity |
| 8 | Buy 3 YES via `tradeYes(Buy)` IOC order | **Buy Yes** user story |
| 9 | Sell 2 YES via `tradeYes(Sell)` IOC order | **Sell Yes** user story |
| 10 | Buy No: `mintPair(2)` + `tradeYes(Sell)` | **Buy No** composition |
| 11 | Sell No: `tradeYes(Buy)` + `mergePair(1)` | **Sell No** composition |
| 12 | Close Phoenix + Meridian market | Market close lifecycle |
| 13 | Settle via `adminSettleOverride` ($210, YES wins) | Settlement |
| 14 | Redeem all winning YES tokens for USDC | **Redemption** |
| 15 | Verify vault state | Vault invariant |

### Expected Output

Each step prints balances and transaction explorer links. Ends with:
```
DEMO COMPLETE: all invariants held
```

---

## Mode 2: Live Browser Demo (Interactive)

Walk through all user stories interactively in the browser. The seed script sets
up on-chain state, then you trade live in the frontend with Phantom.

### Overview

```
# Local (default)                     # Devnet
pnpm seed                             pnpm seed:devnet
pnpm dev:web                          pnpm dev:web:devnet
  ... trade in browser ...              ... trade in browser ...
pnpm seed:reset                       pnpm seed:devnet:reset
```

---

### Step 1: Seed On-Chain State

```bash
pnpm seed            # or: pnpm seed:devnet (devnet)
```

This creates:
- 1 AAPL market in Trading phase (24h expiry)
- Phoenix order book with resting bids (@45, @48, @50) and asks (@52, @55, @58)
- Phoenix seat for the payer wallet
- Token accounts (USDC, YES, NO)
- Mints pairs for order book liquidity (adapts to available USDC)

On local, the script also:
- Airdrops 5 SOL to the payer
- Creates a fresh USDC mint (payer is mint authority)
- Mints USDC freely as needed

Wait for `SEED COMPLETE` output. Note the strike price and wallet balances.

### Step 2: Import Wallet into Phantom

1. Open Phantom browser extension
2. Go to **Settings > Developer Settings** and enable **Testnet Mode**
3. Switch network:
   - **Devnet**: Select **Solana Devnet**
   - **Local**: Add custom RPC — name it "Local", URL `http://127.0.0.1:8899`
4. Go to **Settings > Manage Accounts > Import Private Key**
5. Name: `Meridian Demo`
6. Paste private key:
   ```
   5cc4AGWktBXEuz85Xz9eYkKpwKUF44p4xqTtXSppRJu3FTtsWYUYuhEJXySi2TBkgBDE4VT9KdfhSwG2p6h8pMXa
   ```
7. Verify the address shown is `HNTaM2M9pDiboXBwpjc27w5ys6q5M4jWNwtGFmz2WU6Y`

### Step 3: Start Frontend

```bash
pnpm dev:web          # local  (reads .env)
pnpm dev:web:devnet   # devnet (reads .env.devnet)
```

Open http://localhost:3000 in the browser where Phantom is installed.

### Step 4: Connect Wallet

1. Click the wallet connect button in the top-right
2. Select **Phantom** from the modal
3. Approve the connection in Phantom
4. Verify your USDC, YES, and NO balances appear in the UI

### Step 5: Demo Each User Story

Navigate to the AAPL market from the Markets page and click into the trading view.

#### 5a. Buy Yes (Bullish)

> *"I think AAPL will close above the strike today"*

1. Confirm the YES and NO order books are visible with resting orders
2. Enter quantity: **1**
3. Click **Buy Yes**
4. Approve the transaction in Phantom
5. **Verify:** YES balance increases by 1, USDC decreases

#### 5b. Sell Yes (Exit Bullish)

> *"I want to close my YES position"*

1. Click **Sell Yes**
2. Approve the transaction in Phantom
3. **Verify:** YES balance decreases, USDC increases

#### 5c. Position Constraint (Yes Blocks No)

> *"The UI prevents conflicting positions"*

1. Buy 1 YES token (repeat 5a)
2. Observe that **Buy No** is grayed out with guidance text:
   "Sell your Yes tokens first."
3. Sell the YES token to clear the position

#### 5d. Buy No (Bearish)

> *"I think AAPL will close below the strike today"*

1. With no YES tokens held, click **Buy No**
2. Approve the transaction in Phantom
3. **Verify:** NO balance increases
4. **Explain:** Under the hood, this executed `mintPair` + `tradeYes(Sell)` in one
   transaction — minted a YES/NO pair, immediately sold the YES on Phoenix, kept the NO

#### 5e. Position Constraint (No Blocks Yes)

1. With NO tokens held, observe **Buy Yes** is grayed out:
   "Sell your No tokens first."

#### 5f. Sell No (Exit Bearish)

> *"I want to close my NO position"*

1. Click **Sell No**
2. Approve the transaction in Phantom
3. **Verify:** NO balance decreases, USDC increases
4. **Explain:** Under the hood, this executed `tradeYes(Buy)` + `mergePair` — bought a
   YES token from Phoenix, merged the YES + NO pair back into $1.00 USDC

#### 5g. Order Book (Two Perspectives)

1. Point out the **YES ladder** and **NO ladder** side by side
2. **Explain:** Both views are derived from the same Phoenix order book. The NO ladder
   is the inverse of the YES ladder ($1.00 - YES price = NO price)
3. Show that bid/ask levels update in real time via WebSocket

### Step 6: Demo Settlement and Redemption

This step uses the CLI to settle the market, then demonstrates redemption in the browser.

1. **Ensure the user holds some tokens** (buy YES or NO if needed so you have a position)
2. In the terminal, run the reset which will settle the market:
   ```bash
   pnpm seed:reset    # or: pnpm seed:devnet:reset (devnet)
   ```
   This closes the market, settles it (YES wins), and recovers any remaining
   liquidity provider tokens.
3. **Back in the browser**, refresh the page
4. Navigate to the **Portfolio** page
5. The settled market shows the outcome (YES or NO won)
6. If holding winning tokens, click **Redeem**
7. Approve the transaction in Phantom
8. **Verify:** Winning tokens burned, USDC received ($1.00 per winning token)

### Step 7: Clean Up

If the reset wasn't already run in step 6:
```bash
pnpm seed:reset    # or: pnpm seed:devnet:reset (devnet)
```

This settles all open markets, cancels orders, withdraws Phoenix funds, merges
remaining pairs, redeems winning tokens, and reports final USDC balance.

---

## Demo Talking Points

### Architecture Highlights

- **Non-custodial**: All funds in program-owned PDAs. Users sign every transaction
  with their own wallet. No intermediary.
- **$1.00 invariant**: `YES payout + NO payout = $1.00 USDC`, always. Enforced
  on-chain via vault collateral accounting.
- **One book, four actions**: Single YES/USDC order book on Phoenix serves all
  four trade intents. NO perspective is mathematically derived.
- **Oracle settlement**: Pyth V2 price feeds determine outcomes. Admin override
  as fallback with 1-hour delay.

### What to Emphasize Per Story

| User Story | Key Point |
|------------|-----------|
| Buy Yes | Simple IOC order against Phoenix ask side |
| Buy No | Atomic `mintPair + sellYes` in one transaction — user never sees the intermediate state |
| Sell Yes | Straightforward sell on Phoenix bid side |
| Sell No | Atomic `buyYes + mergePair` — inverse of Buy No |
| Position constraints | Frontend prevents holding both sides simultaneously |
| Settlement | Oracle-driven, immutable outcome written on-chain |
| Redemption | Burn winning tokens, receive USDC from vault proportionally |

### If Asked About...

- **Latency**: Phoenix CLOB on Solana gives sub-second fills. Devnet is slower
  (~400ms confirmation). Local is ~50ms.
- **Oracle reliability**: Pyth V2 with staleness + confidence checks. Admin
  override after 1 hour as emergency fallback.
- **Market maker**: The seed script acts as the MM — minting pairs and posting
  resting orders. In production, this would be the automation service.
- **Position constraints**: Enforced in the frontend, not on-chain. On-chain
  allows holding both (needed for transient mint/merge states). The UI guides
  users to close one side before opening the other.
- **Why not a separate NO order book?**: Because YES + NO = $1.00, every NO
  trade maps directly to a YES trade. Two books would fragment liquidity.

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `pnpm demo` | CLI-only full lifecycle demo (local) |
| `pnpm demo:devnet` | CLI-only full lifecycle demo (devnet) |
| `pnpm seed` | Seed local validator for browser demo |
| `pnpm seed:reset` | Settle + clean up local markets |
| `pnpm seed:devnet` | Seed devnet for browser demo |
| `pnpm seed:devnet:reset` | Settle + clean up devnet markets |
| `pnpm dev:web` | Start frontend against local validator |
| `pnpm dev:web:devnet` | Start frontend against devnet |
| `pnpm deploy:devnet` | Deploy program to devnet |

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "insufficient funds" on mint | Run `--reset` to recover USDC, or use local (unlimited USDC) |
| "Phoenix market is closed" | Run `--reset`, then re-seed (picks a fresh strike) |
| Phantom shows wrong network | Devnet: select Solana Devnet. Local: add custom RPC `http://127.0.0.1:8899` |
| Wallet shows 0 USDC | Confirm Phantom network matches the env (devnet vs local) |
| Order book empty in UI | Ensure seed completed successfully with resting orders |
| Trade fails with "seat" error | Seed creates the seat — re-run seed |
| "all candidates occupied" | Too many stale markets — run `--reset` first |
| Local validator missing Phoenix | Start with `--clone-upgradeable-program` flags (see prerequisites) |
| `.env` not found error | Run `cp .env.example .env` — local commands require it |
