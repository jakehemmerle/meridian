import { InfoPanel } from "../../components/info-panel";
import { readPublicMeridianEnv } from "../../lib/env/public";

export function WalletStatusPanel() {
  const env = readPublicMeridianEnv();

  const envEntries = [
    ["Cluster", env.cluster],
    ["RPC", env.rpcUrl ?? "unset"],
    ["Program", env.programId],
    ["USDC", env.usdcMint],
  ] as const;

  return (
    <InfoPanel title="Wallet And Network">
      <p className="sectionCopy">
        The current shell is wired for shared devnet config so wallet connection and Solana
        session work can land without route-level env parsing.
      </p>
      <div className="envGrid">
        {envEntries.map(([label, value]) => (
          <article key={label} className="envCard">
            <p>{label}</p>
            <code>{value}</code>
          </article>
        ))}
      </div>
    </InfoPanel>
  );
}
