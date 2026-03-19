"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge, Box, Container, Flex, TabNav, Text } from "@radix-ui/themes";

import { WalletButton } from "./wallet-button";

const NAV_ITEMS = [
  { href: "/", label: "Markets" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/history", label: "History" },
] as const;

export function NavBar() {
  const pathname = usePathname();

  return (
    <header className="app-header" data-testid="nav-bar">
      <Container size="4">
        <Flex
          align="center"
          justify="between"
          gap="4"
          wrap="wrap"
          className="app-header-inner"
        >
          <Flex align="center" gap="3">
            <Link href="/" className="app-brand">
              <Text as="span" className="app-brand-wordmark">
                Meridian
              </Text>
            </Link>
            <Badge color="gray" variant="soft">
              Devnet
            </Badge>
          </Flex>

          <Flex align="center" gap="4" wrap="wrap">
            <TabNav.Root>
              {NAV_ITEMS.map(({ href, label }) => {
                const isActive =
                  href === "/"
                    ? pathname === "/" ||
                      pathname.startsWith("/markets/") ||
                      pathname.startsWith("/trade/")
                    : pathname.startsWith(href);

                return (
                  <TabNav.Link key={href} asChild active={isActive}>
                    <Link href={href} aria-current={isActive ? "page" : undefined}>
                      {label}
                    </Link>
                  </TabNav.Link>
                );
              })}
            </TabNav.Root>
            <Box className="wallet-button-wrap">
              <WalletButton />
            </Box>
          </Flex>
        </Flex>
      </Container>
    </header>
  );
}
