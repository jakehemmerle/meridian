# Integration Test Suite Performance Profiling Report

## Executive Summary

The full integration test suite (`pnpm test:integration:full`) takes **193 seconds** (3m13s) for 8 test suites. Target is under 60 seconds. The dominant bottleneck is **repeated program deployment** (58% of total time), followed by **repeated validator startup** (14%), and finally **test execution itself** (26%).

## Layer 1: Per-Suite Wall Clock Time

| Suite | Kill | Validator | Deploy | Test Exec | Total |
|-------|------|-----------|--------|-----------|-------|
| add-strike | 1.07s | 2.71s | 13.99s | 5.03s | 22.93s |
| create-market | 1.07s | 2.70s | 13.55s | 3.41s | 20.87s |
| mint-merge-pause | 1.07s | 2.71s | 13.64s | 8.31s | 25.88s |
| phoenix-bootstrap | 1.07s | 2.73s | 14.08s | 5.87s | 23.89s |
| redeem-multiuser | 1.07s | 2.70s | 14.15s | 10.97s | 29.02s |
| redeem | 1.06s | 1.55s | 13.95s | 7.92s | 24.62s |
| trade-no-comp* | 1.07s | 2.70s | 15.09s | 5.28s | 24.28s |
| trade-yes* | 1.07s | 1.55s | 13.48s | 4.00s | 20.25s |
| **TOTALS** | **8.54s** | **19.35s** | **111.93s** | **50.79s** | **191.74s** |
| **% of total** | **4.5%** | **10.1%** | **58.4%** | **26.5%** | |

*trade-no-composition and trade-yes fail due to TOKEN_PROGRAM_ID mismatch in Phoenix setup (pre-existing bug, not a perf issue)

Build step (domain + testkit): 1.4s one-time.

## Layer 2: Per-Phase Analysis

### Phase 1: Validator Kill + Restart (28s total, 14.5%)

Each suite cycles through: `pkill → sleep 1 → start validator → poll for ready`.

- **Kill**: Fixed 1.07s (1s sleep hardcoded)
- **Start + wait**: 1.5-2.7s depending on whether fee stabilization needs 1 or 2 iterations
- **Cloning from devnet**: Two programs cloned each restart (Phoenix + PSM via `--url devnet`)

### Phase 2: Program Deploy (112s total, 58%)

`anchor deploy` averages **14s per suite**. This is the single biggest bottleneck. Each deploy:
1. Writes the ~4MB meridian.so binary to a buffer account via multiple transactions (~3600 steps)
2. Creates the IDL account
3. Finalizes the deploy

The `anchor deploy` command writes the program bytecode in 10KB chunks via ~360 transactions, each requiring confirmation. This is inherently slow on a local validator.

### Phase 3: Test Execution (51s total, 26.5%)

| Suite | Setup | Actual Tests | Tests | Avg/Test |
|-------|-------|-------------|-------|----------|
| add-strike | 2.31s | 1.02s | 5 | 0.20s |
| create-market | 1.55s | 0.51s | 4 | 0.13s |
| mint-merge-pause | 4.40s | 2.95s | 7 | 0.42s |
| phoenix-bootstrap | 1.86s | 3.07s | 5 | 0.61s |
| redeem-multiuser | 8.29s | 1.47s | 7 | 0.21s |
| redeem | 5.67s | 0.99s | 5 | 0.20s |
| trade-no-comp | 2.36s | 1.04s | 8 | 0.13s |
| trade-yes | 2.21s | 0.47s | 6 | 0.08s |

**Key insight**: Setup dominates test execution. `redeem-multiuser` spends 8.3s in setup (multiple user funding + minting + settlement) vs 1.5s in actual tests.

## Layer 3: Within-Setup Bottleneck Analysis

Common setup operations and approximate costs (from test timing data):

| Operation | Cost | Frequency per suite |
|-----------|------|-------------------|
| Airdrop + 1s wait | ~1.0-1.5s | 1x per suite |
| initializeConfig | ~0.5s | 1x per suite |
| createMint (USDC mock) | ~0.5s | 1x per suite |
| createMarket | ~0.5s | 1-2x per suite |
| createAssociatedTokenAccount | ~0.5s | 2-6x per suite |
| mintTo (fund users) | ~0.5s | 2-4x per suite |
| mintPair (Yes+No) | ~0.5s | 1-3x per suite |
| createPhoenixMarket | ~1.0s | 0-1x per suite |
| Seat request + approval | ~1.0s | 0-2x per suite |

Each on-chain operation takes ~0.5s due to `sendAndConfirmTransaction` confirmation waits.

## Layer 4: Network/Confirmation Latency

On local validator, each `sendAndConfirmTransaction` incurs:
- Transaction simulation: ~1-5ms
- Send + slot confirmation: ~400-500ms
- The default `confirmed` commitment level waits for the slot to advance

The 1000-1500ms explicit `sleep()` after airdrops is the primary wait, but individual transaction confirmations (~0.5s each) accumulate across the 5-20 transactions in each setup.

## Bottleneck Ranking

| Rank | Bottleneck | Time | % Total | Impact |
|------|-----------|------|---------|--------|
| 1 | **Repeated `anchor deploy` x8** | 112s | 58% | Critical |
| 2 | **Repeated validator restart x8** | 28s | 14.5% | High |
| 3 | **Per-test setup (airdrop, createMint, etc.)** | 35s | 18% | Medium |
| 4 | **Transaction confirmation waits** | ~15s | 8% | Medium |
| 5 | **Explicit sleep() calls** | ~8s | 4% | Low |

## Optimization Plan

### Tier 1: Shared Validator + Single Deploy (Target: 60s → ~45-55s)

**Impact: Eliminates 140s of overhead (validator restart + deploy per suite)**

Instead of 8 × (restart + deploy), start ONE validator and deploy ONCE:

```bash
# Start validator once
solana-test-validator --reset --clone-upgradeable-program ... --quiet &
# Wait for ready
# Deploy once
anchor deploy ...
# Run all 8 suites sequentially
for f in tests/integration/program/*.test.ts; do
  pnpm exec tsx --test "$f"
done
```

**Challenge**: Tests call `initializeConfig` to the same PDA. Solutions:
1. **Per-suite config PDA**: Add a `suite_id` seed to the config PDA so each suite gets its own namespace
2. **Reset between suites**: Use `solana-test-validator --reset` but pre-load the program via `--bpf-program` flag (loads .so from disk in <1s vs 14s deploy)
3. **Unique markets**: Each suite already uses unique market parameters — the conflict is only the global config PDA

**Recommended**: Use `--bpf-program` to load the .so directly:
```bash
solana-test-validator \
  --reset \
  --bpf-program <PROGRAM_ID> target/deploy/meridian.so \
  --clone-upgradeable-program PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY \
  ...
```
This eliminates the 14s `anchor deploy` step entirely. Each validator restart with `--bpf-program` takes ~2-3s total.

**Estimated time**: 8 suites × (2.5s restart + 0s deploy + 6.3s test) = ~70s + 1.4s build = ~72s

### Tier 2: Parallel Suite Execution (Target: ~20-30s)

**Impact: 3-4x speedup by running suites concurrently**

Since each suite needs its own validator (config PDA conflict), run multiple validators on different ports in parallel:

```bash
# Run 4 validators on ports 8899, 8901, 8903, 8905
parallel -j4 'PORT=$((8899 + ({#}-1)*2)); run_suite {} $PORT' ::: tests/integration/program/*.test.ts
```

Each suite sets `ANCHOR_PROVIDER_URL=http://127.0.0.1:$PORT`.

**Estimated time**: max(suite times) + startup = ~29s + 3s = ~32s

### Tier 3: Reduce Per-Transaction Confirmation Time (Target: ~15-20s)

**Impact: 30-50% reduction in test execution time**

1. **Use `skipPreflight: true`** for trusted transactions (setup operations that are deterministic)
2. **Batch transactions**: Combine multiple instructions into single transactions where possible:
   - `createMint + createATA + mintTo` → single transaction
   - Multiple `airdrop` calls → single transaction
3. **Remove explicit sleep() calls**: Replace `await sleep(1000)` after airdrops with polling confirmation:
   ```typescript
   await connection.confirmTransaction(sig, 'confirmed');
   // No sleep needed
   ```
4. **Use `processed` commitment** for read-after-write in tests (faster than `confirmed`)

### Tier 4: Shared Setup State (Target: ~10-15s)

**Impact: Eliminates redundant setup across suites**

Group suites by setup requirements and share state:

| Group | Suites | Shared Setup |
|-------|--------|-------------|
| Basic | create-market, add-strike | config + USDC mint |
| Mint/Merge | mint-merge-pause | config + market + user ATAs |
| Redeem | redeem, redeem-multiuser | config + market + minted pairs + settlement |
| Phoenix | phoenix-bootstrap, trade-yes, trade-no-comp | config + market + Phoenix market + seats |

Use test fixtures with snapshot/restore:
```typescript
// Create validator snapshot after common setup
const snapshot = await validator.snapshot();
// Before each test: restore to snapshot
await validator.restore(snapshot);
```

### Tier 5: Use `bankrun` for Unit-Style Integration Tests (Target: ~5-10s)

**Impact: Eliminates validator entirely for most tests**

[solana-bankrun](https://github.com/kevinheavey/solana-bankrun) runs a lightweight BanksServer in-process — no validator, no RPC overhead. Tests use BanksClient instead of Connection.

```typescript
import { start } from 'solana-bankrun';

const context = await start(
  [{ name: 'meridian', programId: PROGRAM_ID }],
  []
);
// context.banksClient replaces connection
// context.payer replaces airdrop
```

This eliminates ALL validator/deploy/RPC overhead. Test execution becomes pure compute.

**Caveat**: bankrun doesn't support cloning from devnet (Phoenix programs). You'd need to provide the program .so files locally or mock Phoenix interactions for non-Phoenix suites.

## Recommended Implementation Order

1. **Quick win — `--bpf-program` flag** (Tier 1 partial): Change `test-integration.sh` to use `--bpf-program` instead of `anchor deploy`. Saves ~100s immediately. **Effort: 1 hour.**

2. **Parallel execution** (Tier 2): Run suites on separate ports concurrently. Saves another ~40s. **Effort: 2-4 hours.**

3. **Transaction batching + remove sleeps** (Tier 3): Refactor test setup to batch operations. Saves ~15-20s. **Effort: 4-8 hours.**

4. **bankrun migration** (Tier 5): Long-term goal for non-Phoenix suites. Greatest architectural improvement. **Effort: 1-2 days.**

## Quick Win Implementation Sketch

Replace `anchor deploy` in `test-integration.sh` with `--bpf-program`:

```bash
MERIDIAN_PROGRAM_ID=$(solana-keygen pubkey keys/meridian-program.json)

solana-test-validator \
  --reset \
  --bind-address 127.0.0.1 \
  --url "$DEVNET_URL" \
  --bpf-program "$MERIDIAN_PROGRAM_ID" target/deploy/meridian.so \
  --clone-upgradeable-program "$PHOENIX_PROGRAM" \
  --clone-upgradeable-program "$PHOENIX_PSM" \
  --quiet &
```

This loads the program from the local .so file at validator genesis — no multi-step deploy needed.

## Existing Test Failures (Not Performance-Related)

Two suites fail due to `TOKEN_PROGRAM_ID` mismatch in `createPhoenixMarket`:
- `trade-yes.test.ts`: "Mint account must be owned by the Token Program"
- `trade-no-composition.test.ts`: Same error

This is because `createMint` in these tests uses Token-2022 program while Phoenix expects the legacy Token program. A fix was recently committed (3a570b0) for other tests but these two suites still have the bug.
