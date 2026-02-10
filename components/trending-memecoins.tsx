"use client";

import useSWR from "swr";
import { useState, useCallback } from "react";
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Flame,
  Clock,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface TrendingToken {
  id: string;
  name: string;
  symbol: string;
  quote: string;
  priceUsd: string | null;
  priceChange1h: string | null;
  priceChange24h: string | null;
  volume24h: string | null;
  liquidity: string | null;
  createdAt: string | null;
  fdvUsd: string | null;
  chain: string;
  poolAddress: string;
  dex: string;
}

const CHAINS = [
  { id: "bsc", label: "BSC", color: "text-accent" },
  { id: "base", label: "Base", color: "text-[#0052FF]" },
  { id: "solana", label: "Solana", color: "text-[#9945FF]" },
] as const;

const CHAIN_EXPLORERS: Record<string, string> = {
  bsc: "https://www.geckoterminal.com/bsc/pools/",
  base: "https://www.geckoterminal.com/base/pools/",
  solana: "https://www.geckoterminal.com/solana/pools/",
};

function formatCompact(value: string | null): string {
  if (!value) return "$0";
  const num = Number.parseFloat(value);
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  if (num >= 1) return `$${num.toFixed(2)}`;
  return `$${num.toFixed(6)}`;
}

function formatAge(dateStr: string | null): string {
  if (!dateStr) return "--";
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

interface Props {
  onSelectToken?: (name: string, symbol: string) => void;
}

export function TrendingMemecoins({ onSelectToken }: Props) {
  const [chain, setChain] = useState<string>("bsc");
  const [feedType, setFeedType] = useState<"trending" | "new">("trending");

  const { data, isLoading, mutate } = useSWR(
    `/api/trending-tokens?chain=${chain}&type=${feedType}`,
    fetcher,
    { refreshInterval: 60000, revalidateOnFocus: false }
  );

  const tokens: TrendingToken[] = data?.tokens || [];

  const handleSelect = useCallback(
    (t: TrendingToken) => {
      if (onSelectToken) {
        const cleanName = t.name.replace(/\s*\/\s*.*$/, "").trim();
        const cleanSymbol = t.symbol
          .replace(/[^a-zA-Z0-9]/g, "")
          .toUpperCase();
        onSelectToken(cleanName, cleanSymbol);
      }
    },
    [onSelectToken]
  );

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      {/* Header */}
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-card-foreground">
            Trending Memecoins
          </h2>
          <span className="text-[10px] text-muted-foreground">
            Click to fill form
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Chain selector */}
          <div className="flex rounded-lg border border-border bg-secondary p-0.5">
            {CHAINS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setChain(c.id)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  chain === c.id
                    ? "bg-card text-card-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Type toggle */}
          <div className="flex rounded-lg border border-border bg-secondary p-0.5">
            <button
              type="button"
              onClick={() => setFeedType("trending")}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                feedType === "trending"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Flame className="inline h-3 w-3 mr-0.5" />
              Hot
            </button>
            <button
              type="button"
              onClick={() => setFeedType("new")}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                feedType === "new"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Clock className="inline h-3 w-3 mr-0.5" />
              New
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => mutate()}
            disabled={isLoading}
            className="h-7 w-7 p-0 border-border bg-transparent text-muted-foreground"
          >
            <RefreshCw
              className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {/* Token grid */}
      {isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={`skel-${i}`}
              className="h-20 w-40 shrink-0 animate-pulse rounded-lg bg-secondary"
            />
          ))}
        </div>
      ) : tokens.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No tokens found for this chain.
        </p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
          {tokens.map((t) => {
            const change = t.priceChange1h
              ? Number.parseFloat(t.priceChange1h)
              : null;
            const isUp = change !== null && change >= 0;

            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSelect(t)}
                className="group flex shrink-0 flex-col rounded-lg border border-border bg-background px-3 py-2.5 text-left transition-all hover:border-primary/40 hover:bg-primary/5 active:scale-[0.98] min-w-[150px]"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-semibold text-card-foreground truncate max-w-[90px]">
                    {t.name}
                  </span>
                  <span
                    className={`text-[9px] font-mono px-1 rounded ${
                      chain === "bsc"
                        ? "bg-accent/10 text-accent"
                        : chain === "base"
                          ? "bg-[#0052FF]/10 text-[#0052FF]"
                          : "bg-[#9945FF]/10 text-[#9945FF]"
                    }`}
                  >
                    {chain.toUpperCase()}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-card-foreground">
                    {formatCompact(t.priceUsd)}
                  </span>
                  {change !== null && (
                    <span
                      className={`flex items-center gap-0.5 text-[10px] font-mono ${
                        isUp ? "text-chart-3" : "text-destructive"
                      }`}
                    >
                      {isUp ? (
                        <TrendingUp className="h-2.5 w-2.5" />
                      ) : (
                        <TrendingDown className="h-2.5 w-2.5" />
                      )}
                      {Math.abs(change).toFixed(1)}%
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px] text-muted-foreground">
                    Vol: {formatCompact(t.volume24h)}
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    {formatAge(t.createdAt)}
                  </span>
                  <a
                    href={`${CHAIN_EXPLORERS[chain] || CHAIN_EXPLORERS.bsc}${t.poolAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="ml-auto text-muted-foreground hover:text-foreground"
                    aria-label={`View ${t.name} on GeckoTerminal`}
                  >
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
