#!/bin/bash
set -euo pipefail

PROGRAM_ID="2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y"
PROGRAM_KEYPAIR="keys/meridian-program.json"
IDL_PATH="target/idl/meridian.json"
FRONTEND_IDL_PATH="app/src/lib/solana/meridian-idl.json"

echo "=== Meridian Devnet Deployment ==="

# Verify keypair
DERIVED=$(solana-keygen pubkey "$PROGRAM_KEYPAIR")
if [ "$DERIVED" != "$PROGRAM_ID" ]; then
  echo "ERROR: keypair derives to $DERIVED, expected $PROGRAM_ID"
  exit 1
fi
echo "Keypair verified: $PROGRAM_ID"

# Set devnet
solana config set --url devnet > /dev/null
echo "Deployer: $(solana address)"

# Check balance
BALANCE=$(solana balance | awk '{print $1}')
echo "Balance: $BALANCE SOL"
if (( $(echo "$BALANCE < 3" | bc -l) )); then
  echo "WARNING: Balance below 3 SOL. Deploy may fail. Run: solana airdrop 2"
fi

# Build
echo ""
echo "Building program..."
anchor build
echo "Build complete."

# Deploy
echo ""
echo "Deploying to devnet..."
anchor deploy --provider.cluster devnet --program-name meridian --program-keypair "$PROGRAM_KEYPAIR"

# IDL — init or upgrade
echo ""
echo "Publishing IDL..."
if anchor idl init -f "$IDL_PATH" "$PROGRAM_ID" --provider.cluster devnet 2>/dev/null; then
  echo "IDL initialized."
else
  anchor idl upgrade "$PROGRAM_ID" -f "$IDL_PATH" --provider.cluster devnet
  echo "IDL upgraded."
fi

# Copy IDL for frontend
cp "$IDL_PATH" "$FRONTEND_IDL_PATH"
echo "IDL copied to $FRONTEND_IDL_PATH"

# Verify
echo ""
echo "=== Verification ==="
solana program show "$PROGRAM_ID" --url devnet
echo ""
echo "Remaining balance: $(solana balance)"
echo "=== Deploy complete ==="
