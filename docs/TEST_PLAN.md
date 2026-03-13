# Meridian Test Plan

## Test Matrix

| Story   | Test Name                                   | Layer            | File                           | Status   |
|---------|---------------------------------------------|------------------|--------------------------------|----------|
| br-36c  | create-market init & duplicate rejection    | integration      | `create-market.test.ts`        | done     |
| br-1xh  | mint/merge/pause invariants                 | integration      | `mint-merge-pause.test.ts`     | done     |
| br-1f4  | Phoenix bootstrap & seat workflow           | integration      | `phoenix-bootstrap.test.ts`    | done     |
| br-15f  | oracle validation                           | unit (Rust)      | `oracle_tests.rs`              | done     |
| br-3ic  | settlement transitions                      | unit (Rust)      | `settlement_tests.rs`          | done     |
| br-1ml  | redemption state transitions                | unit (Rust)      | `redemption_tests.rs`          | done     |
| —       | invariant adversarial tests                 | unit (Rust)      | `invariant_tests.rs`           | done     |
| —       | domain pyth validation                      | unit (TS)        | `pyth-validation.test.ts`      | done     |
| br-3dw  | Buy Yes / Sell Yes                          | integration      | `trade-yes.test.ts`            | in progress |
| br-27j  | Buy No / Sell No composition                | integration      | —                              | blocked  |
| br-zt7  | strike generation                           | unit (TS)        | `strikes.test.ts`              | in progress |
| br-2cf  | automation boundaries                       | unit (TS)        | —                              | in progress |
| br-399  | morning creation job                        | unit (TS)        | —                              | blocked  |
| br-2l5  | settlement job retry                        | unit (TS)        | —                              | blocked  |
| br-2yp  | E2E smoke paths                             | E2E              | —                              | blocked  |

## Quality Bar

- All unit tests pass in CI before merge.
- Integration tests require a local validator with deployed program.
- Coverage targets: every public method on `MeridianMarket` and `MeridianConfig` exercised by at least one happy-path and one error-path test.
- Invariant tests cover every branch of `assert_invariants()`.

## Milestones

1. **Unit coverage** (br-hv2): Redemption, invariant, and domain Pyth validation tests — establishes baseline.
2. **Trading flows** (br-3dw, br-27j): Integration tests for Phoenix CPI buy/sell paths.
3. **Automation** (br-2cf, br-399, br-2l5): Strike generation, morning job, settlement retry.
4. **E2E** (br-2yp): Full lifecycle smoke test from market creation to redemption.

## Testkit Extraction (br-1sb)

Shared fixtures (`makeHermesSnapshot`, `test_market`, `test_config`) live in `packages/testkit`. New helpers should be added there rather than duplicated across test files.
