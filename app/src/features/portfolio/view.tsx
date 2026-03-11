import { InfoPanel } from "../../components/info-panel";

const portfolioPrinciples = [
  "Users hold directional exposure through Yes or No, not both as a persistent UI state.",
  "Collateral and open-interest changes are enforced on-chain before portfolio balances update.",
  "Post-settlement redemption reduces winning exposure and vault liability together.",
];

export function PortfolioOverviewPanel() {
  return (
    <InfoPanel title="Portfolio Rules">
      <p className="sectionCopy">
        Portfolio-facing UI should stay aligned with the protocol invariants instead of inventing
        extra account semantics in the route layer.
      </p>
      <ul>
        {portfolioPrinciples.map((principle) => (
          <li key={principle}>
            <span>{principle}</span>
          </li>
        ))}
      </ul>
    </InfoPanel>
  );
}
