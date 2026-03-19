import type { ReactNode } from "react";
import { Container, Flex, Section } from "@radix-ui/themes";

interface PageShellProps {
  hero: ReactNode;
  children: ReactNode;
}

export function PageShell({ hero, children }: PageShellProps) {
  return (
    <main className="page-shell">
      <Container size="4">
        <Section size="2" className="page-shell-section">
          {hero}
        </Section>
        <Section size="1" pt="0" className="page-shell-section">
          <Flex direction="column" gap="5">
            {children}
          </Flex>
        </Section>
      </Container>
    </main>
  );
}
