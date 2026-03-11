import {
  DEFAULT_PUBLIC_SOLANA_CLUSTER,
  DEVNET_USDC_MINT,
  MERIDIAN_PROGRAM_ID,
} from "@meridian/domain";

const stack = [
  { label: "Chain", value: "Solana devnet" },
  { label: "Program", value: "Anchor 0.32.1" },
  { label: "Order Book", value: "Phoenix DEX" },
  { label: "Oracle", value: "Pyth pull feeds" },
];

const commands = [
  "pnpm build",
  "pnpm test",
  "pnpm dev:web",
  "pnpm dev:automation",
  "pnpm deploy:devnet",
];

const env = [
  ["Cluster", process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? DEFAULT_PUBLIC_SOLANA_CLUSTER],
  ["RPC", process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "unset"],
  ["Program", process.env.NEXT_PUBLIC_MERIDIAN_PROGRAM_ID ?? MERIDIAN_PROGRAM_ID],
  ["USDC", process.env.NEXT_PUBLIC_MERIDIAN_USDC_MINT ?? DEVNET_USDC_MINT],
];

export default function Page() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Meridian Workspace</p>
        <h1>One repo for the program, trading UI, and lifecycle automation.</h1>
        <p className="lede">
          This scaffold is intentionally narrow: a real Anchor program id, a frontend shell that
          reads shared environment state, and an automation package ready for daily market jobs.
        </p>
      </section>

      <section className="grid">
        <div className="panel">
          <h2>Stack</h2>
          <ul>
            {stack.map((item) => (
              <li key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <h2>Core Commands</h2>
          <ul>
            {commands.map((command) => (
              <li key={command}>
                <code>{command}</code>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel">
        <h2>Environment Snapshot</h2>
        <div className="envGrid">
          {env.map(([label, value]) => (
            <article key={label} className="envCard">
              <p>{label}</p>
              <code>{value}</code>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
