"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Badge, Button, Card, Flex, Heading, Separator, Tabs, Text } from "@radix-ui/themes";
import * as Accordion from "@radix-ui/react-accordion";
import { ArrowLeftIcon, ArrowRightIcon, ChevronDownIcon } from "@radix-ui/react-icons";
import { MERIDIAN_TICKERS, type MeridianTicker } from "@meridian/domain";

import { formatMicros } from "../../lib/format";
import { PageShell } from "../../components/page-shell";
import { WalletButton } from "../../components/wallet-button";
import type { MarketSummary } from "./model";
import { buildStockOverviews, getTopContracts, sortMarketsForTicker } from "./selectors";
import { getMarketQuote, useMarketQuotes, type MarketQuoteMap } from "./use-market-quotes";
import { getTickerSnapshot, useTickerSnapshots } from "./use-ticker-snapshots";
import { useMarketList } from "./use-market-list";

function formatTradingDay(tradingDay: number): string {
  const value = String(tradingDay);
  if (value.length !== 8) return String(tradingDay);

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6)) - 1;
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month, day));

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatQuote(value: number | null): string {
  return value == null ? "No quote" : formatMicros(value);
}

function formatProbability(value: number | null): string {
  return value == null ? "Unavailable" : `${(value / 10_000).toFixed(1)}%`;
}

function marketQuestion(market: Pick<MarketSummary, "ticker" | "strikePriceMicros">): string {
  return `Will ${market.ticker} close above ${formatMicros(market.strikePriceMicros)} today?`;
}

function marketActionLabel(market: MarketSummary): string {
  if (market.phase === "Settled") return "Review settlement";
  if (market.phase === "Closed") return "View closed market";
  return "Open trade workspace";
}

function MarketPhaseBadge({ phase }: { phase: MarketSummary["phase"] }) {
  const color =
    phase === "Trading" ? "green" : phase === "Closed" ? "orange" : "gray";

  return (
    <Badge color={color} variant="soft">
      {phase}
    </Badge>
  );
}

interface MarketDiscoveryListProps {
  markets: MarketSummary[];
  loading: boolean;
  quotes?: MarketQuoteMap;
  emptyMessage?: string;
  linkForMarket?: (market: MarketSummary) => string;
}

export function MarketDiscoveryList({
  markets,
  loading,
  quotes = {},
  emptyMessage = "No markets available.",
  linkForMarket = (market) => `/trade/${market.id}`,
}: MarketDiscoveryListProps) {
  if (loading) {
    return (
      <Card>
        <Flex direction="column" gap="2">
          <Text size="2" weight="bold">
            Markets
          </Text>
          <Text size="2" color="gray">
            Loading markets...
          </Text>
        </Flex>
      </Card>
    );
  }

  if (markets.length === 0) {
    return (
      <Card>
        <Flex direction="column" gap="2">
          <Text size="2" weight="bold">
            Markets
          </Text>
          <Text size="2" color="gray">
            {emptyMessage}
          </Text>
        </Flex>
      </Card>
    );
  }

  return (
    <div className="market-grid">
      {markets.map((market) => {
        const quote = getMarketQuote(quotes, market.id);

        return (
          <Link
            key={market.id}
            href={linkForMarket(market)}
            className="card-link"
            data-testid={`market-item-${market.ticker}`}
          >
            <Card className="market-card">
              <Flex direction="column" gap="4">
                <Flex justify="between" align="center" gap="3" wrap="wrap">
                  <MarketPhaseBadge phase={market.phase} />
                  <Text size="1" color="gray">
                    {formatTradingDay(market.tradingDay)}
                  </Text>
                </Flex>

                <Flex direction="column" gap="2">
                  <Heading as="h3" size="5" className="market-card-title">
                    {market.ticker}
                  </Heading>
                  <Text size="3" className="market-card-question">
                    {marketQuestion(market)}
                  </Text>
                </Flex>

                <div className="quote-grid">
                  <div className="quote-stat">
                    <Text size="1" color="gray">
                      Yes ask
                    </Text>
                    <Text className="metric-mono">{formatQuote(quote?.bestYesAskMicros ?? null)}</Text>
                  </div>
                  <div className="quote-stat">
                    <Text size="1" color="gray">
                      No ask
                    </Text>
                    <Text className="metric-mono">{formatQuote(quote?.bestNoAskMicros ?? null)}</Text>
                  </div>
                  <div className="quote-stat">
                    <Text size="1" color="gray">
                      Implied
                    </Text>
                    <Text className="metric-mono">
                      {formatProbability(quote?.impliedProbabilityMicros ?? null)}
                    </Text>
                  </div>
                  <div className="quote-stat">
                    <Text size="1" color="gray">
                      OI
                    </Text>
                    <Text className="metric-mono">
                      {(Number(market.yesOpenInterest) / 1_000_000).toFixed(2)}
                    </Text>
                  </div>
                </div>

                <Flex justify="between" align="center" gap="3" wrap="wrap">
                  <Text size="2" color="gray">
                    Closes 4:00 PM ET
                  </Text>
                  <Text size="2" weight="bold" className="cta-inline">
                    {marketActionLabel(market)}
                  </Text>
                </Flex>
              </Flex>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

function StockOverviewCard({
  ticker,
  livePriceMicros,
  activeContracts,
  totalContracts,
  featuredMarket,
  featuredQuote,
}: ReturnType<typeof buildStockOverviews>[number]) {
  return (
    <Link href={`/markets/${ticker}`} className="card-link">
      <Card className="stock-card">
        <Flex direction="column" gap="4">
          <Flex justify="between" align="start" gap="3">
            <div>
              <Heading as="h3" size="6">
                {ticker}
              </Heading>
              <Text size="2" color="gray">
                {livePriceMicros == null
                  ? "Live price unavailable"
                  : `Underlying ${formatMicros(livePriceMicros)}`}
              </Text>
            </div>
            <Badge color="gray" variant="soft">
              {activeContracts}/{totalContracts} active
            </Badge>
          </Flex>

          <Separator size="4" />

          {featuredMarket ? (
            <Flex direction="column" gap="2">
              <Text size="1" color="gray">
                Nearest active contract
              </Text>
              <Text size="3" weight="medium">
                Above {formatMicros(featuredMarket.strikePriceMicros)}
              </Text>
              <Text size="2" color="gray">
                Yes ask {formatQuote(featuredQuote?.bestYesAskMicros ?? null)}. No ask{" "}
                {formatQuote(featuredQuote?.bestNoAskMicros ?? null)}.
              </Text>
            </Flex>
          ) : (
            <Text size="2" color="gray">
              No contracts listed yet for this ticker.
            </Text>
          )}

          <Flex justify="between" align="center" gap="3">
            <Text size="2" color="gray">
              Browse strikes
            </Text>
            <ArrowRightIcon />
          </Flex>
        </Flex>
      </Card>
    </Link>
  );
}

export function MarketsLandingPage() {
  const { markets, loading, error } = useMarketList();
  const {
    snapshots,
    error: snapshotError,
  } = useTickerSnapshots();
  const tradeableMarkets = useMemo(() => getTopContracts(markets, 6), [markets]);
  const { quotes, loading: quotesLoading } = useMarketQuotes(tradeableMarkets);
  const stockOverviews = useMemo(
    () => buildStockOverviews(markets, snapshots, quotes),
    [markets, snapshots, quotes],
  );
  const featuredContract = tradeableMarkets[0] ?? null;
  const featuredSnapshot = featuredContract
    ? getTickerSnapshot(snapshots, featuredContract.ticker)
    : null;

  return (
    <PageShell
      hero={
        <Card className="hero-card">
          <Flex direction="column" gap="5">
            <Badge color="teal" variant="soft" className="eyebrow-badge">
              MERIDIAN MARKETS
            </Badge>

            <Flex direction="column" gap="3">
              <Heading as="h1" size="9" className="hero-heading">
                Binary outcome markets for the closing bell.
              </Heading>
              <Text size="4" color="gray" className="hero-copy">
                Browse binary outcome contracts tied to MAG7 equities. This is a
                public, read-only market hub until you connect a wallet. Yes pays
                $1.00 when the stock closes at or above the strike. No pays $1.00
                when it does not.
              </Text>
            </Flex>

            <div className="metric-grid">
              <Card className="metric-card">
                <Text size="1" color="gray">
                  Live universe
                </Text>
                <Heading as="h2" size="5">
                  {MERIDIAN_TICKERS.length} MAG7 names
                </Heading>
              </Card>
              <Card className="metric-card">
                <Text size="1" color="gray">
                  Featured contract
                </Text>
                <Heading as="h2" size="5">
                  {featuredContract
                    ? `${featuredContract.ticker} > ${formatMicros(featuredContract.strikePriceMicros)}`
                    : "Awaiting markets"}
                </Heading>
                <Text size="2" color="gray">
                  {featuredSnapshot?.priceMicros != null
                    ? `Underlying ${formatMicros(featuredSnapshot.priceMicros)}`
                    : "Live underlying price unavailable"}
                </Text>
              </Card>
              <Card className="metric-card">
                <Text size="1" color="gray">
                  Trading venue
                </Text>
                <Heading as="h2" size="5">
                  Phoenix order book
                </Heading>
                <Text size="2" color="gray">
                  One book. Two perspectives. Four trade intents.
                </Text>
              </Card>
            </div>

            <Flex gap="3" wrap="wrap" className="hero-actions">
              <WalletButton />
              <Button asChild variant="soft" color="gray">
                <Link href={featuredContract ? `/trade/${featuredContract.id}` : "/portfolio"}>
                  {featuredContract ? "Open featured market" : "View portfolio"}
                </Link>
              </Button>
            </Flex>
          </Flex>
        </Card>
      }
    >
      {(error || snapshotError) && (
        <Card>
          <Text size="2" color="gray">
            {error ?? snapshotError}
          </Text>
        </Card>
      )}

      <Card>
        <Flex direction="column" gap="4">
          <Flex justify="between" align="end" gap="4" wrap="wrap">
            <div>
              <Text size="1" color="gray">
                PUBLIC DISCOVERY
              </Text>
              <Heading as="h2" size="6">
                Browse by stock
              </Heading>
            </div>
            <Text size="2" color="gray">
              Live stock snapshots come from Pyth/Hermes. Trading still requires a
              wallet signature.
            </Text>
          </Flex>
          <div className="stock-grid">
            {stockOverviews.map((overview) => (
              <StockOverviewCard key={overview.ticker} {...overview} />
            ))}
          </div>
        </Flex>
      </Card>

      <Card>
        <Flex direction="column" gap="4">
          <Flex justify="between" align="end" gap="4" wrap="wrap">
            <div>
              <Text size="1" color="gray">
                ACTIVE CONTRACTS
              </Text>
              <Heading as="h2" size="6">
                Liquid markets
              </Heading>
            </div>
            <Text size="2" color="gray">
              Ranked by open interest and rendered with public top-of-book quotes.
            </Text>
          </Flex>
          <MarketDiscoveryList
            markets={tradeableMarkets}
            loading={loading || quotesLoading}
            quotes={quotes}
          />
        </Flex>
      </Card>
    </PageShell>
  );
}

function StrikeAccordionList({
  markets,
  quotes,
}: {
  markets: MarketSummary[];
  quotes: MarketQuoteMap;
}) {
  if (markets.length === 0) {
    return (
      <Card>
        <Text size="2" color="gray">
          No markets in this phase.
        </Text>
      </Card>
    );
  }

  return (
    <Accordion.Root type="multiple" className="strike-accordion">
      {markets.map((market) => {
        const quote = getMarketQuote(quotes, market.id);

        return (
          <Accordion.Item key={market.id} value={market.id} className="accordion-item">
            <Card className="accordion-card">
              <Accordion.Header>
                <Accordion.Trigger className="accordion-trigger">
                  <Flex justify="between" align="center" gap="4" className="accordion-trigger-row">
                    <Flex direction="column" gap="1">
                      <Flex align="center" gap="2" wrap="wrap">
                        <MarketPhaseBadge phase={market.phase} />
                        <Text size="1" color="gray">
                          {formatTradingDay(market.tradingDay)}
                        </Text>
                      </Flex>
                      <Text size="4" weight="medium" className="market-card-question">
                        {marketQuestion(market)}
                      </Text>
                    </Flex>

                    <Flex align="center" gap="4" className="accordion-summary">
                      <div className="quote-stat">
                        <Text size="1" color="gray">
                          Yes ask
                        </Text>
                        <Text className="metric-mono">
                          {formatQuote(quote?.bestYesAskMicros ?? null)}
                        </Text>
                      </div>
                      <div className="quote-stat">
                        <Text size="1" color="gray">
                          No ask
                        </Text>
                        <Text className="metric-mono">
                          {formatQuote(quote?.bestNoAskMicros ?? null)}
                        </Text>
                      </div>
                      <ChevronDownIcon className="accordion-chevron" />
                    </Flex>
                  </Flex>
                </Accordion.Trigger>
              </Accordion.Header>

              <Accordion.Content className="accordion-content">
                <Separator size="4" my="4" />
                <div className="quote-grid">
                  <div className="quote-stat">
                    <Text size="1" color="gray">
                      Probability
                    </Text>
                    <Text className="metric-mono">
                      {formatProbability(quote?.impliedProbabilityMicros ?? null)}
                    </Text>
                  </div>
                  <div className="quote-stat">
                    <Text size="1" color="gray">
                      Open interest
                    </Text>
                    <Text className="metric-mono">
                      {(Number(market.yesOpenInterest) / 1_000_000).toFixed(2)}
                    </Text>
                  </div>
                  <div className="quote-stat">
                    <Text size="1" color="gray">
                      Close
                    </Text>
                    <Text className="metric-mono">4:00 PM ET</Text>
                  </div>
                  <div className="quote-stat">
                    <Text size="1" color="gray">
                      Outcome
                    </Text>
                    <Text className="metric-mono">
                      {market.phase === "Settled" ? market.outcome : "Unsettled"}
                    </Text>
                  </div>
                </div>

                <Flex justify="between" align="center" gap="4" wrap="wrap" mt="4">
                  <Text size="2" color="gray">
                    Trade execution stays on the dedicated market workspace.
                  </Text>
                  <Button asChild>
                    <Link href={`/trade/${market.id}`}>{marketActionLabel(market)}</Link>
                  </Button>
                </Flex>
              </Accordion.Content>
            </Card>
          </Accordion.Item>
        );
      })}
    </Accordion.Root>
  );
}

export function StockMarketsPage({ ticker }: { ticker: string }) {
  const normalizedTicker = ticker.toUpperCase();
  const isKnownTicker = MERIDIAN_TICKERS.includes(normalizedTicker as MeridianTicker);
  const { markets, loading, error } = useMarketList();
  const { snapshots } = useTickerSnapshots();

  if (!isKnownTicker) {
    return (
      <PageShell
        hero={
          <Card className="hero-card">
            <Flex direction="column" gap="3">
              <Button asChild variant="ghost" color="gray">
                <Link href="/">
                  <ArrowLeftIcon />
                  Back to markets
                </Link>
              </Button>
              <Heading as="h1" size="8">
                Unknown ticker
              </Heading>
              <Text size="3" color="gray">
                {ticker} is not in the Meridian MAG7 universe.
              </Text>
            </Flex>
          </Card>
        }
      >
        <Card>
          <Text size="2" color="gray">
            Supported tickers: {MERIDIAN_TICKERS.join(", ")}.
          </Text>
        </Card>
      </PageShell>
    );
  }

  const snapshot = getTickerSnapshot(
    snapshots,
    normalizedTicker,
  );
  const stockMarkets = useMemo(
    () =>
      sortMarketsForTicker(
        markets.filter((market) => market.ticker === normalizedTicker),
        snapshot?.priceMicros ?? null,
      ),
    [markets, normalizedTicker, snapshot?.priceMicros],
  );
  const { quotes, loading: quotesLoading } = useMarketQuotes(stockMarkets);

  const tradingMarkets = stockMarkets.filter((market) => market.phase === "Trading");
  const closedMarkets = stockMarkets.filter((market) => market.phase === "Closed");
  const settledMarkets = stockMarkets.filter((market) => market.phase === "Settled");

  return (
    <PageShell
      hero={
        <Card className="hero-card">
          <Flex direction="column" gap="4">
            <Button asChild variant="ghost" color="gray">
              <Link href="/">
                <ArrowLeftIcon />
                Back to markets
              </Link>
            </Button>

            <Flex justify="between" align="end" gap="4" wrap="wrap">
              <div>
                <Text size="1" color="gray">
                  STOCK DETAIL
                </Text>
                <Heading as="h1" size="8">
                  {normalizedTicker}
                </Heading>
                <Text size="3" color="gray">
                  {snapshot?.priceMicros != null
                    ? `Underlying ${formatMicros(snapshot.priceMicros)}`
                    : "Live underlying price unavailable"}
                </Text>
              </div>
              <div className="inline-metrics">
                <Badge color="gray" variant="soft">
                  {tradingMarkets.length} trading
                </Badge>
                <Badge color="gray" variant="soft">
                  {stockMarkets.length} total contracts
                </Badge>
              </div>
            </Flex>
          </Flex>
        </Card>
      }
    >
      {(error || quotesLoading) && (
        <Card>
          <Text size="2" color="gray">
            {error ?? "Refreshing strike quotes..."}
          </Text>
        </Card>
      )}

      {loading ? (
        <Card>
          <Text size="2" color="gray">
            Loading markets...
          </Text>
        </Card>
      ) : stockMarkets.length === 0 ? (
        <Card>
          <Text size="2" color="gray">
            No contracts are available for {normalizedTicker} yet.
          </Text>
        </Card>
      ) : (
        <Card>
          <Tabs.Root defaultValue="trading">
            <Tabs.List>
              <Tabs.Trigger value="trading">Trading</Tabs.Trigger>
              <Tabs.Trigger value="closed">Closed</Tabs.Trigger>
              <Tabs.Trigger value="settled">Settled</Tabs.Trigger>
              <Tabs.Trigger value="all">All</Tabs.Trigger>
            </Tabs.List>

            <div className="phase-tabs">
              <Tabs.Content value="trading">
                <StrikeAccordionList markets={tradingMarkets} quotes={quotes} />
              </Tabs.Content>
              <Tabs.Content value="closed">
                <StrikeAccordionList markets={closedMarkets} quotes={quotes} />
              </Tabs.Content>
              <Tabs.Content value="settled">
                <StrikeAccordionList markets={settledMarkets} quotes={quotes} />
              </Tabs.Content>
              <Tabs.Content value="all">
                <StrikeAccordionList markets={stockMarkets} quotes={quotes} />
              </Tabs.Content>
            </div>
          </Tabs.Root>
        </Card>
      )}
    </PageShell>
  );
}
