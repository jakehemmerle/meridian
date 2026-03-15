import { expect } from "@playwright/test";
import { marketDataTest as test } from "../fixtures/market-data";

const MSFT_FEED_ID = new Uint8Array(
  "d0ca23c1cc005e004ccf1db5bf76aeb6a49218f43dac3d4b275e92de12ded4d1"
    .match(/.{2}/g)!
    .map((b) => parseInt(b, 16)),
);
const TICKER_MSFT = 1;

test.describe("Market data hooks", () => {
  test("market list shows markets created on-chain", async ({
    page,
    browserWallet,
    marketData,
  }) => {
    await page.goto("/");

    // Connect wallet
    const connectButton = page.locator("button", {
      hasText: "Connect Wallet",
    });
    await connectButton.click();
    await expect(
      page.locator("[data-testid='wallet-address']"),
    ).toBeVisible({ timeout: 10_000 });

    // Assert AAPL market visible with correct strike
    const aaplItem = page.locator("[data-testid='market-item-AAPL']");
    await expect(aaplItem).toBeVisible({ timeout: 15_000 });
    await expect(aaplItem).toContainText("$200.00");
    await expect(aaplItem).toContainText("Trading");

    // Assert META market visible with correct strike
    const metaItem = page.locator("[data-testid='market-item-META']");
    await expect(metaItem).toBeVisible();
    await expect(metaItem).toContainText("$680.00");
    await expect(metaItem).toContainText("Trading");
  });

  test("market list updates when new market is created", async ({
    page,
    browserWallet,
    marketData,
  }) => {
    await page.goto("/");

    const connectButton = page.locator("button", {
      hasText: "Connect Wallet",
    });
    await connectButton.click();
    await expect(
      page.locator("[data-testid='wallet-address']"),
    ).toBeVisible({ timeout: 10_000 });

    // Initially 2 markets
    await expect(
      page.locator("[data-testid^='market-item-']"),
    ).toHaveCount(2, { timeout: 15_000 });

    // Create a third market (MSFT $400) via fixture's direct RPC call
    await marketData.createMarket(
      TICKER_MSFT,
      BigInt(400_000_000),
      MSFT_FEED_ID,
    );

    // Wait for UI to update (poll refresh)
    await expect(
      page.locator("[data-testid^='market-item-']"),
    ).toHaveCount(3, { timeout: 30_000 });

    const msftItem = page.locator("[data-testid='market-item-MSFT']");
    await expect(msftItem).toBeVisible();
    await expect(msftItem).toContainText("$400.00");
  });

  test("position display shows user's Yes/No token balances", async ({
    page,
    browserWallet,
    marketData,
  }) => {
    // Navigate to trade page for AAPL market
    const marketId = marketData.aaplMarket.marketPda.toBase58();
    await page.goto(`/trade/${marketId}`);

    const connectButton = page.locator("button", {
      hasText: "Connect Wallet",
    });
    await connectButton.click();
    await expect(
      page.locator("[data-testid='wallet-address']"),
    ).toBeVisible({ timeout: 10_000 });

    // Assert position shows 5 Yes and 5 No (from mint fixture)
    const yesPosition = page.locator("[data-testid='position-yes']");
    await expect(yesPosition).toBeVisible({ timeout: 15_000 });
    await expect(yesPosition).toContainText("5");

    const noPosition = page.locator("[data-testid='position-no']");
    await expect(noPosition).toBeVisible();
    await expect(noPosition).toContainText("5");
  });

  test("position updates after a trade", async ({
    page,
    browserWallet,
    marketData,
  }) => {
    const marketId = marketData.aaplMarket.marketPda.toBase58();
    await page.goto(`/trade/${marketId}`);

    const connectButton = page.locator("button", {
      hasText: "Connect Wallet",
    });
    await connectButton.click();
    await expect(
      page.locator("[data-testid='wallet-address']"),
    ).toBeVisible({ timeout: 10_000 });

    // Verify initial position (5 Yes, 5 No)
    const yesPosition = page.locator("[data-testid='position-yes']");
    await expect(yesPosition).toContainText("5", { timeout: 15_000 });

    // Transfer 2 Yes tokens away (simulates selling 2 Yes)
    await marketData.transferYesTokens(marketData.aaplMarket, 2_000_000);

    // Assert: position updates to show 3 Yes and 5 No
    await expect(yesPosition).toContainText("3", { timeout: 15_000 });

    const noPosition = page.locator("[data-testid='position-no']");
    await expect(noPosition).toContainText("5");
  });

  test("portfolio page shows positions across multiple markets", async ({
    page,
    browserWallet,
    marketData,
  }) => {
    // Mint 3 pairs on META so user has positions in both markets
    await marketData.mintPairs(marketData.metaMarket, 3_000_000);

    await page.goto("/portfolio");

    const connectButton = page.locator("button", {
      hasText: "Connect Wallet",
    });
    await connectButton.click();
    await expect(
      page.locator("[data-testid='wallet-address']"),
    ).toBeVisible({ timeout: 10_000 });

    // Assert both AAPL and META positions visible
    // Quantities are in micros (6 decimals): 5 tokens = 5000000
    const aaplPosition = page.locator("[data-testid='portfolio-item-AAPL']");
    await expect(aaplPosition).toBeVisible({ timeout: 15_000 });
    await expect(aaplPosition).toContainText("5000000");

    const metaPosition = page.locator("[data-testid='portfolio-item-META']");
    await expect(metaPosition).toBeVisible();
    await expect(metaPosition).toContainText("3000000");
  });

  test("market shows settlement info after settling", async ({
    page,
    browserWallet,
    marketData,
  }) => {
    // Create a new AAPL market with past close_time so it can be settled
    const settleableMarket = await marketData.createMarket(
      0, // AAPL
      BigInt(200_000_000),
      new Uint8Array([
        73, 246, 182, 92, 177, 222, 107, 16, 234, 247, 94, 124, 3, 202, 2,
        156, 48, 109, 3, 87, 233, 27, 83, 17, 177, 117, 8, 74, 90, 213, 86,
        136,
      ]),
      { pastCloseTime: true },
    );

    // Settle it (Yes wins at $210)
    await marketData.settleMarket(settleableMarket, BigInt(210_000_000));

    await page.goto("/");

    const connectButton = page.locator("button", {
      hasText: "Connect Wallet",
    });
    await connectButton.click();
    await expect(
      page.locator("[data-testid='wallet-address']"),
    ).toBeVisible({ timeout: 10_000 });

    // Assert the settled AAPL market shows settled state
    // There may be multiple AAPL items (one trading, one settled) - find the settled one
    const settledItem = page.locator(
      "[data-testid='market-item-AAPL']:has-text('Settled')",
    );
    await expect(settledItem).toBeVisible({ timeout: 15_000 });
    await expect(settledItem).toContainText("Yes");
  });
});
