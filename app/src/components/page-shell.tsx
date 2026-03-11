import type { ReactNode } from "react";

interface PageShellProps {
  hero: ReactNode;
  children: ReactNode;
}

export function PageShell({ hero, children }: PageShellProps) {
  return (
    <main className="shell">
      {hero}
      <div className="featureStack">{children}</div>
    </main>
  );
}
