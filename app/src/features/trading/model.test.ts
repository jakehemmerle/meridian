import { describe, it, expect } from "vitest";
import {
  tradingIntentDescriptors,
  getIntentAction,
  getIntentInstructionPlan,
  computePayoff,
  getCountdownSeconds,
  getPositionConstraints,
  type TradeIntent,
  type UserPosition,
} from "./model";

describe("tradingIntentDescriptors", () => {
  it("maps Buy Yes to ask side of the Yes book", () => {
    const buyYes = tradingIntentDescriptors.find((d) => d.intent === "buy-yes");
    expect(buyYes).toBeDefined();
    expect(buyYes!.bookSide).toBe("ask");
  });

  it("maps Buy No to bid side of the Yes book (inverted)", () => {
    const buyNo = tradingIntentDescriptors.find((d) => d.intent === "buy-no");
    expect(buyNo).toBeDefined();
    expect(buyNo!.bookSide).toBe("bid");
  });

  it("maps Sell Yes to bid side of the Yes book", () => {
    const sellYes = tradingIntentDescriptors.find(
      (d) => d.intent === "sell-yes",
    );
    expect(sellYes).toBeDefined();
    expect(sellYes!.bookSide).toBe("bid");
  });

  it("maps Sell No to ask side of the Yes book", () => {
    const sellNo = tradingIntentDescriptors.find(
      (d) => d.intent === "sell-no",
    );
    expect(sellNo).toBeDefined();
    expect(sellNo!.bookSide).toBe("ask");
  });
});

describe("getIntentAction", () => {
  it("Buy Yes → place limit order on Yes ask", () => {
    const action = getIntentAction("buy-yes");
    expect(action.phoenixSide).toBe("ask");
    expect(action.direction).toBe("buy");
    expect(action.outcomeToken).toBe("yes");
  });

  it("Buy No → buy Yes then split (merge is hidden from user)", () => {
    const action = getIntentAction("buy-no");
    expect(action.phoenixSide).toBe("bid");
    expect(action.direction).toBe("buy");
    expect(action.outcomeToken).toBe("no");
  });

  it("Sell Yes → place limit order on Yes bid", () => {
    const action = getIntentAction("sell-yes");
    expect(action.phoenixSide).toBe("bid");
    expect(action.direction).toBe("sell");
    expect(action.outcomeToken).toBe("yes");
  });

  it("Sell No → buy Yes then merge (merge is hidden from user)", () => {
    const action = getIntentAction("sell-no");
    expect(action.phoenixSide).toBe("ask");
    expect(action.direction).toBe("sell");
    expect(action.outcomeToken).toBe("no");
  });
});

describe("getIntentInstructionPlan", () => {
  it("buy-yes → single trade_yes with Buy side", () => {
    const plan = getIntentInstructionPlan("buy-yes");
    expect(plan).toEqual([{ type: "trade_yes", side: "Buy" }]);
  });

  it("buy-no → mint_pair then trade_yes with Sell side", () => {
    const plan = getIntentInstructionPlan("buy-no");
    expect(plan).toEqual([
      { type: "mint_pair" },
      { type: "trade_yes", side: "Sell" },
    ]);
  });

  it("sell-yes → single trade_yes with Sell side", () => {
    const plan = getIntentInstructionPlan("sell-yes");
    expect(plan).toEqual([{ type: "trade_yes", side: "Sell" }]);
  });

  it("sell-no → trade_yes with Buy side then merge_pair", () => {
    const plan = getIntentInstructionPlan("sell-no");
    expect(plan).toEqual([
      { type: "trade_yes", side: "Buy" },
      { type: "merge_pair" },
    ]);
  });
});

describe("computePayoff", () => {
  it("computes payoff for a Yes buy at $0.60", () => {
    const payoff = computePayoff("buy-yes", 600_000);
    expect(payoff.costMicros).toBe(600_000);
    expect(payoff.payoutMicros).toBe(1_000_000);
    expect(payoff.condition).toBe("above");
  });

  it("computes payoff for a No buy at $0.40 (derived from Yes at $0.60)", () => {
    const payoff = computePayoff("buy-no", 400_000);
    expect(payoff.costMicros).toBe(400_000);
    expect(payoff.payoutMicros).toBe(1_000_000);
    expect(payoff.condition).toBe("below");
  });

  it("formats the payoff display string with ticker and strike", () => {
    const payoff = computePayoff("buy-yes", 600_000);
    const display = payoff.formatDisplay("AAPL", 175_000_000);
    expect(display).toBe(
      "You pay $0.60. You win $1.00 if AAPL closes above $175.00.",
    );
  });

  it("formats the payoff display string for No side", () => {
    const payoff = computePayoff("buy-no", 400_000);
    const display = payoff.formatDisplay("TSLA", 250_000_000);
    expect(display).toBe(
      "You pay $0.40. You win $1.00 if TSLA closes below $250.00.",
    );
  });
});

describe("getCountdownSeconds", () => {
  it("returns positive seconds when before market close", () => {
    // Market close at 4:00 PM ET = 20:00 UTC (EDT offset=4)
    const closeUtc = 1710352800; // some close timestamp
    const nowUtc = closeUtc - 3600; // 1 hour before close
    expect(getCountdownSeconds(closeUtc, nowUtc)).toBe(3600);
  });

  it("returns 0 when at or past market close", () => {
    const closeUtc = 1710352800;
    expect(getCountdownSeconds(closeUtc, closeUtc)).toBe(0);
    expect(getCountdownSeconds(closeUtc, closeUtc + 100)).toBe(0);
  });
});

describe("getPositionConstraints", () => {
  it("allows all intents when user has no position", () => {
    const constraints = getPositionConstraints(null);
    expect(constraints.canBuyYes).toBe(true);
    expect(constraints.canBuyNo).toBe(true);
    expect(constraints.canSellYes).toBe(false);
    expect(constraints.canSellNo).toBe(false);
  });

  it("allows Sell Yes but blocks Buy No when user holds Yes tokens", () => {
    const position: UserPosition = {
      yesQuantity: 5n,
      noQuantity: 0n,
    };
    const constraints = getPositionConstraints(position);
    expect(constraints.canSellYes).toBe(true);
    expect(constraints.canSellNo).toBe(false);
    expect(constraints.canBuyYes).toBe(true);
    expect(constraints.canBuyNo).toBe(false);
  });

  it("allows Sell No but blocks Buy Yes when user holds No tokens", () => {
    const position: UserPosition = {
      yesQuantity: 0n,
      noQuantity: 3n,
    };
    const constraints = getPositionConstraints(position);
    expect(constraints.canSellYes).toBe(false);
    expect(constraints.canSellNo).toBe(true);
    expect(constraints.canBuyYes).toBe(false);
    expect(constraints.canBuyNo).toBe(true);
  });

  it("allows both sells and buys during mint-pair transient (dual holding)", () => {
    const position: UserPosition = {
      yesQuantity: 5n,
      noQuantity: 3n,
    };
    const constraints = getPositionConstraints(position);
    expect(constraints.canSellYes).toBe(true);
    expect(constraints.canSellNo).toBe(true);
    expect(constraints.canBuyYes).toBe(true);
    expect(constraints.canBuyNo).toBe(true);
  });

  it("provides guidance text for disabled sell intents", () => {
    const constraints = getPositionConstraints(null);
    expect(constraints.sellYesGuidance).toBe(
      "You need Yes tokens to sell.",
    );
    expect(constraints.sellNoGuidance).toBe(
      "You need No tokens to sell.",
    );
  });

  it("provides guidance text for disabled buy intents", () => {
    const holdingNo: UserPosition = { yesQuantity: 0n, noQuantity: 5n };
    const holdingYes: UserPosition = { yesQuantity: 5n, noQuantity: 0n };

    const noConstraints = getPositionConstraints(holdingNo);
    expect(noConstraints.buyYesGuidance).toBe("Sell your No tokens first.");

    const yesConstraints = getPositionConstraints(holdingYes);
    expect(yesConstraints.buyNoGuidance).toBe("Sell your Yes tokens first.");
  });

  it("zero balance allows all buys", () => {
    const position: UserPosition = { yesQuantity: 0n, noQuantity: 0n };
    const constraints = getPositionConstraints(position);
    expect(constraints.canBuyYes).toBe(true);
    expect(constraints.canBuyNo).toBe(true);
  });
});
