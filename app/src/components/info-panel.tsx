import type { ReactNode } from "react";

interface InfoPanelProps {
  title: string;
  children: ReactNode;
}

export function InfoPanel({ title, children }: InfoPanelProps) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
