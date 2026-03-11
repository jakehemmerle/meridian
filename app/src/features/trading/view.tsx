import { InfoPanel } from "../../components/info-panel";

import { tradingIntentDescriptors } from "./model";

export function TradingOverviewPanel() {
  return (
    <InfoPanel title="Trading Surface">
      <p className="sectionCopy">
        Meridian keeps one Phoenix Yes/USDC order book per strike and lets the frontend expose
        four user intents over that single venue.
      </p>
      <ul>
        {tradingIntentDescriptors.map((descriptor) => (
          <li key={descriptor.intent}>
            <span>{descriptor.label}</span>
            <strong>{descriptor.bookSide === "ask" ? "Buy Yes Book Flow" : "Sell Yes Book Flow"}</strong>
          </li>
        ))}
      </ul>
    </InfoPanel>
  );
}
