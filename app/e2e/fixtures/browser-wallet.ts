import type { Page } from "@playwright/test";
import { Keypair, VersionedTransaction, Transaction } from "@solana/web3.js";
import { walletTest } from "./wallet";

const SIGN_ENDPOINT = "/_e2e_sign_transaction";

/**
 * Injects a mock Solana wallet into the browser that:
 * - Exposes the test keypair's public key
 * - Signs transactions by POSTing serialized tx to a Playwright-intercepted route
 * - Compatible with @solana/wallet-adapter-react's wallet detection
 */
async function injectWalletAdapter(page: Page, publicKeyBase58: string): Promise<void> {
  await page.addInitScript(
    ({ publicKey, signEndpoint }) => {
      // Minimal PublicKey-compatible object
      class MockPublicKey {
        private _bytes: Uint8Array;
        constructor(base58: string) {
          // Store the base58 string, decode lazily
          this._base58 = base58;
          // Simple base58 decode for the 32 bytes
          this._bytes = new Uint8Array(32);
        }
        private _base58: string;
        toBase58() {
          return this._base58;
        }
        toString() {
          return this._base58;
        }
        toBytes() {
          return this._bytes;
        }
        toJSON() {
          return this._base58;
        }
        equals(other: { toBase58(): string }) {
          return this._base58 === other.toBase58();
        }
      }

      const walletPublicKey = new MockPublicKey(publicKey);
      const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};

      async function signTransaction(txBase64: string): Promise<string> {
        const response = await fetch(signEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transaction: txBase64 }),
        });
        const data = await response.json();
        return data.signedTransaction;
      }

      const mockWallet = {
        // Standard wallet adapter interface
        publicKey: walletPublicKey,
        isConnected: false,

        connect: async () => {
          mockWallet.isConnected = true;
          const connectListeners = listeners["connect"] || [];
          for (const cb of connectListeners) {
            cb(walletPublicKey);
          }
          return { publicKey: walletPublicKey };
        },

        disconnect: async () => {
          mockWallet.isConnected = false;
          const disconnectListeners = listeners["disconnect"] || [];
          for (const cb of disconnectListeners) {
            cb();
          }
        },

        signTransaction: async (tx: { serialize(): Uint8Array }) => {
          const serialized = tx.serialize();
          const base64 = btoa(
            String.fromCharCode(...new Uint8Array(serialized)),
          );
          const signedBase64 = await signTransaction(base64);
          const signedBytes = Uint8Array.from(atob(signedBase64), (c) =>
            c.charCodeAt(0),
          );
          // Return an object that looks like a transaction with the signed bytes
          return { ...tx, serialize: () => signedBytes, _signedBytes: signedBytes };
        },

        signAllTransactions: async (txs: Array<{ serialize(): Uint8Array }>) => {
          const results = [];
          for (const tx of txs) {
            results.push(await mockWallet.signTransaction(tx));
          }
          return results;
        },

        signMessage: async (message: Uint8Array) => {
          // For e2e tests, return a dummy signature
          return new Uint8Array(64);
        },

        on: (event: string, cb: (...args: unknown[]) => void) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(cb);
        },

        off: (event: string, cb: (...args: unknown[]) => void) => {
          if (listeners[event]) {
            listeners[event] = listeners[event].filter((l) => l !== cb);
          }
        },

        // Wallet Standard detection fields
        name: "E2E Test Wallet",
        icon: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiLz4=",
      };

      // Register as a Phantom-compatible wallet (detected by wallet-adapter)
      (window as Record<string, unknown>).solana = mockWallet;

      // Also register via the Wallet Standard API
      (window as Record<string, unknown>).__e2eTestWallet = mockWallet;
    },
    { publicKey: publicKeyBase58, signEndpoint: SIGN_ENDPOINT },
  );
}

/**
 * Sets up a Playwright route to intercept signing requests from the browser
 * and sign them with the test keypair server-side.
 */
async function setupSigningRoute(page: Page, keypair: Keypair): Promise<void> {
  await page.route(`**${SIGN_ENDPOINT}`, async (route) => {
    try {
      const body = JSON.parse(route.request().postData() || "{}");
      const txBytes = Uint8Array.from(atob(body.transaction), (c) =>
        c.charCodeAt(0),
      );

      let signedBytes: Uint8Array;
      try {
        // Try as VersionedTransaction first
        const vtx = VersionedTransaction.deserialize(txBytes);
        vtx.sign([keypair]);
        signedBytes = vtx.serialize();
      } catch {
        // Fall back to legacy Transaction
        const tx = Transaction.from(txBytes);
        tx.partialSign(keypair);
        signedBytes = tx.serialize();
      }

      const signedBase64 = Buffer.from(signedBytes).toString("base64");

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ signedTransaction: signedBase64 }),
      });
    } catch (err) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: String(err) }),
      });
    }
  });
}

export interface BrowserWalletFixture {
  publicKeyBase58: string;
}

/**
 * Fixture that injects a mock wallet into the browser.
 * The wallet's public key matches the test keypair and transactions
 * are signed server-side via Playwright route interception.
 */
export const browserWalletTest = walletTest.extend<{
  browserWallet: BrowserWalletFixture;
}>({
  browserWallet: async ({ page, wallet }, use) => {
    const publicKeyBase58 = wallet.keypair.publicKey.toBase58();

    // Set up signing route before navigation
    await setupSigningRoute(page, wallet.keypair);

    // Inject wallet adapter before page loads
    await injectWalletAdapter(page, publicKeyBase58);

    await use({ publicKeyBase58 });
  },
});
