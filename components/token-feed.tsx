"use client";

import useSWR from "swr";
import { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Flame,
  RefreshCw,
  ExternalLink,
  BarChart3,
  Droplets,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Pool {
  id: string;
  name: string;
  priceUsd: string | null;
  fdvUsd: string | null;
  marketCapUsd: string | null;
  priceChange1h: string | null;
  priceChange24h: string | null;
  volume1h: string | null;
  volume24h: string | null;
  liquidity: string | null;
  createdAt: string | null;
  txns1h: { buys: number; sells: number } | null;
  txns24h: { buys: number; sells: number } | null;
  baseTokenAddress: string;
  dex: string;
}

function formatUsd(value: string | null | undefined): string {
  if (!value) return "$0";
  const num = Number.parseFloat(value);
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  if (num >= 1) return `$${num.toFixed(2)}`;
  if (num >= 0.0001) return `$${num.toFixed(6)}`;
  return `$${num.toExponential(2)}`;
}

function formatAge(dateStr: string | null): string {
  if (!dateStr) return "--";
  const created = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

function PriceChange({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground">--</span>;
  const num = Number.parseFloat(value);
  const isPositive = num >= 0;
  return (
    <span
      className={`flex items-center gap-0.5 font-mono text-xs ${isPositive ? "text-chart-3" : "text-destructive"}`}
    >
      {isPositive ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {Math.abs(num).toFixed(2)}%
    </span>
  );
}

function TokenRow({ pool }: { pool: Pool }) {
  const pairParts = pool.name.split(" / ");
  const baseName = pairParts[0] || pool.name;
  const quoteName = pairParts[1] || "";

  return (
    <div className="group flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/30 hover:bg-card/80">
      {/* Token info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-card-foreground">
            {baseName}
          </span>
          {quoteName && (
            <span className="text-xs text-muted-foreground">
              {"/"} {quoteName}
            </span>
          )}
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground uppercase">
            {pool.dex}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatAge(pool.createdAt)}
          </span>
          {pool.txns24h && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <BarChart3 className="h-3 w-3" />
              {pool.txns24h.buys + pool.txns24h.sells} txns
            </span>
          )}
        </div>
      </div>

      {/* Price */}
      <div className="text-right">
        <p className="text-sm font-mono font-semibold text-card-foreground">
          {formatUsd(pool.priceUsd)}
        </p>
        <PriceChange value={pool.priceChange1h} />
      </div>

      {/* Volume */}
      <div className="hidden text-right sm:block">
        <p className="text-xs text-muted-foreground">Vol 24h</p>
        <p className="text-sm font-mono text-card-foreground">
          {formatUsd(pool.volume24h)}
        </p>
      </div>

      {/* Liquidity */}
      <div className="hidden text-right md:block">
        <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
          <Droplets className="h-3 w-3" />
          Liq
        </p>
        <p className="text-sm font-mono text-card-foreground">
          {formatUsd(pool.liquidity)}
        </p>
      </div>

      {/* Link */}
      <a
        href={`https://www.geckoterminal.com/bsc/pools/${pool.id.replace("bsc_", "")}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label={`View ${baseName} on GeckoTerminal`}
      >
        <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  );
}

export function TokenFeed() {
  const [feedType, setFeedType] = useState<"new" | "trending">("new");

  const { data, error, isLoading, mutate } = useSWR(
    `/api/bsc-tokens?type=${feedType}`,
    fetcher,
    {
      refreshInterval: 60000,
      revalidateOnFocus: false,
    }
  );

  const pools: Pool[] = data?.pools || [];

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
            {feedType === "new" ? (
              <Clock className="h-4 w-4 text-accent" />
            ) : (
              <Flame className="h-4 w-4 text-primary" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-card-foreground">
              BSC Token Feed
            </h2>
            <p className="text-xs text-muted-foreground">
              Live data from GeckoTerminal
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border bg-secondary p-0.5">
            <button
              type="button"
              onClick={() => setFeedType("new")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                feedType === "new"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              New Pools
            </button>
            <button
              type="button"
              onClick={() => setFeedType("trending")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                feedType === "trending"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Trending
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutate()}
            disabled={isLoading}
            className="border-border bg-transparent text-muted-foreground hover:text-foreground"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {/* Content */}
      {error ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 py-12">
          <p className="text-sm text-destructive">
            Failed to load token data. GeckoTerminal API may be rate-limited.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutate()}
            className="mt-3 border-border bg-transparent text-muted-foreground"
          >
            Retry
          </Button>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={`skeleton-${i}`}
              className="h-16 animate-pulse rounded-lg bg-secondary"
            />
          ))}
        </div>
      ) : pools.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border py-12">
          <p className="text-sm text-muted-foreground">No pools found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pools.slice(0, 10).map((pool) => (
            <TokenRow key={pool.id} pool={pool} />
          ))}
        </div>
      )}
    </div>
  );
}
