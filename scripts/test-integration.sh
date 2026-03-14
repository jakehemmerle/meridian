#!/usr/bin/env bash
set -euo pipefail

# Integration test runner for Meridian program tests.
# Each test file gets a fresh solana-test-validator on its own port,
# running in parallel for faster execution.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_DIR="$PROJECT_DIR/tests/integration/program"

DEVNET_URL="https://api.devnet.solana.com"
PHOENIX_PROGRAM="PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY"
PHOENIX_PSM="PSMxQbAoDWDbvd9ezQJgARyq6R9L5kJAasaLDVcZwf1"
MERIDIAN_PROGRAM_ID="$(solana-keygen pubkey "$PROJECT_DIR/keys/meridian-program.json")"
MERIDIAN_SO="$PROJECT_DIR/target/deploy/meridian.so"

export ANCHOR_WALLET="${HOME}/.config/solana/id.json"

# Temp directory for per-suite results and ledgers
RESULTS_DIR="$(mktemp -d)"
declare -a VALIDATOR_PIDS=()
declare -a LEDGER_DIRS=()

cleanup() {
  echo ""
  echo "Cleaning up validators and temp files..."
  for pid in "${VALIDATOR_PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
  for dir in "${LEDGER_DIRS[@]}"; do
    rm -rf "$dir"
  done
  rm -rf "$RESULTS_DIR"
}
trap cleanup EXIT

# Build dependencies first
echo "=== Building domain and testkit ==="
cd "$PROJECT_DIR"
pnpm domain:build
pnpm testkit:build

# Verify the .so exists (anchor build must have been run first)
if [[ ! -f "$MERIDIAN_SO" ]]; then
  echo "ERROR: $MERIDIAN_SO not found. Run 'anchor build' first."
  exit 1
fi

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

# Run a single test suite with its own validator on a given port
run_suite() {
  local test_file="$1"
  local port="$2"
  local suite_name="$(basename "$test_file")"
  local validator_url="http://127.0.0.1:${port}"
  local ledger_dir="/tmp/test-ledger-${port}"
  local result_file="${RESULTS_DIR}/${suite_name}.result"
  local log_file="${RESULTS_DIR}/${suite_name}.log"

  {
    echo "=== Starting: $suite_name (port $port) ==="

    # Start fresh validator with isolated ledger
    solana-test-validator \
      --reset \
      --bind-address 127.0.0.1 \
      --rpc-port "$port" \
      --ledger "$ledger_dir" \
      --url "$DEVNET_URL" \
      --clone-upgradeable-program "$PHOENIX_PROGRAM" \
      --clone-upgradeable-program "$PHOENIX_PSM" \
      --bpf-program "$MERIDIAN_PROGRAM_ID" "$MERIDIAN_SO" \
      --quiet &

    local val_pid=$!

    # Wait for validator to be ready
    local ready=false
    for i in $(seq 1 30); do
      if solana cluster-version -u "$validator_url" &>/dev/null; then
        ready=true
        break
      fi
      if ! kill -0 "$val_pid" 2>/dev/null; then
        echo "Validator process died for $suite_name"
        echo "FAIL" > "$result_file"
        return
      fi
      sleep 1
    done

    if [[ "$ready" != "true" ]]; then
      echo "Validator failed to start after 30s for $suite_name"
      kill "$val_pid" 2>/dev/null || true
      wait "$val_pid" 2>/dev/null || true
      echo "FAIL" > "$result_file"
      return
    fi

    # Run the test with suite-specific provider URL
    if ANCHOR_PROVIDER_URL="$validator_url" pnpm exec tsx --test "$test_file"; then
      echo "PASSED: $suite_name"
      echo "PASS" > "$result_file"
    else
      echo "FAILED: $suite_name"
      echo "FAIL" > "$result_file"
    fi

    # Kill this suite's validator
    kill "$val_pid" 2>/dev/null || true
    wait "$val_pid" 2>/dev/null || true
  } > "$log_file" 2>&1
}

# Launch all suites in parallel, each on its own port
BASE_PORT=$((10000 + RANDOM % 5000))
declare -a SUITE_PIDS=()
declare -a SUITE_NAMES=()
declare -a SUITE_LOGS=()

echo "=== Launching ${#TEST_FILES[@]} suites in parallel ==="

for i in "${!TEST_FILES[@]}"; do
  TEST_FILE="${TEST_FILES[$i]}"
  SUITE_NAME="$(basename "$TEST_FILE")"
  PORT=$((BASE_PORT + i * 10))  # Space ports by 10 to avoid fencepost collisions
  LEDGER_DIR="/tmp/test-ledger-${PORT}"

  LEDGER_DIRS+=("$LEDGER_DIR")
  SUITE_NAMES+=("$SUITE_NAME")
  SUITE_LOGS+=("${RESULTS_DIR}/${SUITE_NAME}.log")

  echo "  $SUITE_NAME -> port $PORT"

  run_suite "$TEST_FILE" "$PORT" &
  SUITE_PIDS+=($!)
  # The validator PID is inside the subshell; track the subshell PID for cleanup
  VALIDATOR_PIDS+=($!)
done

echo ""
echo "=== Waiting for all suites to complete ==="

# Wait for all background jobs
for pid in "${SUITE_PIDS[@]}"; do
  wait "$pid" 2>/dev/null || true
done

echo ""

# Print per-suite logs in order
for i in "${!SUITE_NAMES[@]}"; do
  echo "========================================"
  echo "=== Output: ${SUITE_NAMES[$i]}"
  echo "========================================"
  if [[ -f "${SUITE_LOGS[$i]}" ]]; then
    cat "${SUITE_LOGS[$i]}"
  else
    echo "(no output captured)"
  fi
  echo ""
done

# Aggregate results
declare -a PASSED=()
declare -a FAILED=()

for i in "${!SUITE_NAMES[@]}"; do
  result_file="${RESULTS_DIR}/${SUITE_NAMES[$i]}.result"
  if [[ -f "$result_file" ]] && [[ "$(cat "$result_file")" == "PASS" ]]; then
    PASSED+=("${SUITE_NAMES[$i]}")
  else
    FAILED+=("${SUITE_NAMES[$i]}")
  fi
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
