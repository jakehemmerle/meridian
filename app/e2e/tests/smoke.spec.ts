import { expect } from "@playwright/test";
import { browserWalletTest as test } from "../fixtures/browser-wallet";

test.describe("Smoke test", () => {
  test("page loads and wallet can connect", async ({ page, browserWallet, validator }) => {
    // Set the RPC URL to point at our test validator
    // The app reads NEXT_PUBLIC_SOLANA_RPC_URL from the environment
    // We need to navigate with the correct env — the webServer config handles this
    // For the browser, the app will use whatever endpoint is configured

    // Navigate to the app
    await page.goto("/");

    // Assert page loads with title containing "Meridian"
    await expect(page).toHaveTitle(/Meridian/);

    // Verify the landing page content is visible
    await expect(page.locator("text=Binary outcome markets on Solana.")).toBeVisible();

    // The mock wallet is injected via addInitScript — it should be detected
    // Look for a "Connect Wallet" button
    const connectButton = page.locator("button", { hasText: "Connect Wallet" });
    await expect(connectButton).toBeVisible();

    // Click connect — the mock wallet should auto-connect without popup
    await connectButton.click();

    // After connecting, the wallet address should appear in the UI
    // The WalletStatusPanel shows truncated address with data-testid="wallet-address"
    const walletAddress = page.locator("[data-testid='wallet-address']");
    await expect(walletAddress).toBeVisible({ timeout: 10_000 });

    // Verify the displayed address matches our test wallet
    const displayedAddress = await walletAddress.textContent();
    const expectedPrefix = browserWallet.publicKeyBase58.slice(0, 4);
    const expectedSuffix = browserWallet.publicKeyBase58.slice(-4);
    expect(displayedAddress).toContain(expectedPrefix);
    expect(displayedAddress).toContain(expectedSuffix);
  });
});
