import assert from "node:assert/strict";
import test from "node:test";
import { Keypair, PublicKey } from "@solana/web3.js";

import {
  MERIDIAN_PROGRAM_ID,
  CLOSE_MARKET_DISCRIMINATOR,
  buildCloseMarketIx,
  deriveConfigPda,
  makeCloseMeridianMarket,
} from "../../../automation/src/clients/meridian.js";

const FAKE_MARKET = Keypair.generate().publicKey;
const FAKE_OPS_AUTHORITY = Keypair.generate();

test("CLOSE_MARKET_DISCRIMINATOR matches IDL", () => {
  // From IDL: [88, 154, 248, 186, 48, 14, 123, 244]
  const expected = Buffer.from([88, 154, 248, 186, 48, 14, 123, 244]);
  assert.deepEqual(CLOSE_MARKET_DISCRIMINATOR, expected);
});

test("deriveConfigPda: deterministic for program", () => {
  const [pda1, bump1] = deriveConfigPda();
  const [pda2, bump2] = deriveConfigPda();
  assert.equal(pda1.toBase58(), pda2.toBase58());
  assert.equal(bump1, bump2);
});

test("buildCloseMarketIx: instruction data is the 8-byte discriminator", () => {
  const ix = buildCloseMarketIx(FAKE_MARKET, FAKE_OPS_AUTHORITY.publicKey);
  assert.equal(ix.data.length, 8);
  assert.deepEqual(
    Buffer.from(ix.data),
    CLOSE_MARKET_DISCRIMINATOR,
  );
});

test("buildCloseMarketIx: accounts are [operations_authority (signer), config (PDA), market (writable)]", () => {
  const ix = buildCloseMarketIx(FAKE_MARKET, FAKE_OPS_AUTHORITY.publicKey);
  const [configPda] = deriveConfigPda();

  assert.equal(ix.keys.length, 3);

  // Account 0: operations_authority (signer, not writable)
  assert.equal(ix.keys[0].pubkey.toBase58(), FAKE_OPS_AUTHORITY.publicKey.toBase58());
  assert.equal(ix.keys[0].isSigner, true);
  assert.equal(ix.keys[0].isWritable, false);

  // Account 1: config PDA (not signer, not writable)
  assert.equal(ix.keys[1].pubkey.toBase58(), configPda.toBase58());
  assert.equal(ix.keys[1].isSigner, false);
  assert.equal(ix.keys[1].isWritable, false);

  // Account 2: market (writable, not signer)
  assert.equal(ix.keys[2].pubkey.toBase58(), FAKE_MARKET.toBase58());
  assert.equal(ix.keys[2].isSigner, false);
  assert.equal(ix.keys[2].isWritable, true);
});

test("buildCloseMarketIx: programId matches Meridian program", () => {
  const ix = buildCloseMarketIx(FAKE_MARKET, FAKE_OPS_AUTHORITY.publicKey);
  assert.equal(ix.programId.toBase58(), MERIDIAN_PROGRAM_ID.toBase58());
});

test("makeCloseMeridianMarket: factory returns a function", () => {
  const mockConnection = {} as any;
  const fn = makeCloseMeridianMarket(mockConnection, FAKE_OPS_AUTHORITY);
  assert.equal(typeof fn, "function");
});
