#!/usr/bin/env bash
set -euo pipefail

# Integration test runner for Meridian program tests.
# Each test file gets a fresh solana-test-validator because they all
# call initializeConfig to the same PDA and can't share a validator.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_DIR="$PROJECT_DIR/tests/integration/program"

VALIDATOR_URL="http://127.0.0.1:8899"
DEVNET_URL="https://api.devnet.solana.com"
PHOENIX_PROGRAM="PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY"
PHOENIX_PSM="PSMxQbAoDWDbvd9ezQJgARyq6R9L5kJAasaLDVcZwf1"

export ANCHOR_PROVIDER_URL="$VALIDATOR_URL"
export ANCHOR_WALLET="${HOME}/.config/solana/id.json"

# Track results
declare -a PASSED=()
declare -a FAILED=()

kill_validator() {
  pkill -f solana-test-validator 2>/dev/null || true
  # Give it a moment to release the port
  sleep 1
}

cleanup() {
  echo ""
  echo "Cleaning up: killing validator..."
  kill_validator
}
trap cleanup EXIT

# Build dependencies first
echo "=== Building domain and testkit ==="
cd "$PROJECT_DIR"
pnpm domain:build
pnpm testkit:build

# Collect test files (exclude program-id.test.ts)
TEST_FILES=()
for f in "$TEST_DIR"/*.test.ts; do
  basename="$(basename "$f")"
  if [[ "$basename" == "program-id.test.ts" ]]; then
    continue
  fi
  TEST_FILES+=("$f")
done

if [[ ${#TEST_FILES[@]} -eq 0 ]]; then
  echo "No test files found in $TEST_DIR"
  exit 1
fi

echo "=== Found ${#TEST_FILES[@]} test suites ==="
for f in "${TEST_FILES[@]}"; do
  echo "  - $(basename "$f")"
done
echo ""

for TEST_FILE in "${TEST_FILES[@]}"; do
  SUITE_NAME="$(basename "$TEST_FILE")"
  echo "========================================"
  echo "=== Running: $SUITE_NAME"
  echo "========================================"

  # Kill any existing validator
  kill_validator

  # Start fresh validator with --reset and cloned programs
  echo "Starting solana-test-validator..."
  solana-test-validator \
    --reset \
    --bind-address 127.0.0.1 \
    --url "$DEVNET_URL" \
    --clone "$PHOENIX_PROGRAM" \
    --clone "$PHOENIX_PSM" \
    --quiet &

  VALIDATOR_PID=$!

  # Wait for validator to be ready
  echo "Waiting for validator to be ready..."
  for i in $(seq 1 30); do
    if solana cluster-version -u "$VALIDATOR_URL" &>/dev/null; then
      break
    fi
    if ! kill -0 $VALIDATOR_PID 2>/dev/null; then
      echo "Validator process died"
      FAILED+=("$SUITE_NAME")
      continue 2
    fi
    sleep 1
  done

  if ! solana cluster-version -u "$VALIDATOR_URL" &>/dev/null; then
    echo "Validator failed to start after 30s"
    FAILED+=("$SUITE_NAME")
    continue
  fi
  echo "Validator ready."

  # Deploy Meridian program
  echo "Deploying Meridian program..."
  if ! anchor deploy \
    --provider.cluster localnet \
    --program-name meridian \
    --program-keypair keys/meridian-program.json; then
    echo "Deploy failed for $SUITE_NAME"
    FAILED+=("$SUITE_NAME")
    continue
  fi
  echo "Deploy complete."

  # Run the test
  echo "Running test..."
  if pnpm exec tsx --test "$TEST_FILE"; then
    echo "PASSED: $SUITE_NAME"
    PASSED+=("$SUITE_NAME")
  else
    echo "FAILED: $SUITE_NAME"
    FAILED+=("$SUITE_NAME")
  fi

  echo ""
done

# Summary
echo "========================================"
echo "=== Test Results ==="
echo "========================================"
echo ""

if [[ ${#PASSED[@]} -gt 0 ]]; then
  echo "PASSED (${#PASSED[@]}):"
  for s in "${PASSED[@]}"; do
    echo "  + $s"
  done
fi

if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo ""
  echo "FAILED (${#FAILED[@]}):"
  for s in "${FAILED[@]}"; do
    echo "  - $s"
  done
fi

echo ""
echo "Total: $((${#PASSED[@]} + ${#FAILED[@]}))  Passed: ${#PASSED[@]}  Failed: ${#FAILED[@]}"

if [[ ${#FAILED[@]} -gt 0 ]]; then
  exit 1
fi
