"use client";

import useSWR from "swr";
import { useState } from "react";
import { ExternalLink, Rocket, RefreshCw, BarChart3, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface LaunchToken {
  name?: string;
  symbol?: string;
  contractAddress?: string;
  contract_address?: string;
  address?: string;
  id?: string;
  wallet?: string;
  description?: string;
  image?: string;
  createdAt?: string;
  created_at?: string;
  status?: string;
  tax?: number;
  chain?: string;
  source?: string;
  volume24h?: string | null;
  priceUsd?: string | null;
  txns24h?: number | null;
  buys24h?: number | null;
  sells24h?: number | null;
}

const SOURCES = [
  { id: "kibu-bsc", label: "Kibu BSC", color: "text-accent", explorer: "https://bscscan.com/token/" },
  { id: "kibu-base", label: "Kibu Base", color: "text-[#0052FF]", explorer: "https://basescan.org/token/" },
  { id: "clawnch", label: "Clawnch", color: "text-[#0052FF]", explorer: "https://basescan.org/token/" },
  { id: "4claw", label: "4claw", color: "text-primary", explorer: "https://bscscan.com/token/" },
  { id: "fourclaw-fun", label: "FourClaw.Fun", color: "text-[#F59E0B]", explorer: "https://bscscan.com/token/" },
] as const;

function truncateAddress(addr: string | undefined): string {
  if (!addr) return "--";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatTxns(value: number | null | undefined): string {
  if (value == null || value === 0) return "--";
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toString();
}

function formatVolume(value: string | null | undefined): string {
  if (!value) return "--";
  const num = Number.parseFloat(value);
  if (Number.isNaN(num) || num === 0) return "--";
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  return `$${num.toFixed(0)}`;
}

export function RecentLaunches() {
  const [source, setSource] = useState<string>("kibu-bsc");
  const currentSource = SOURCES.find((s) => s.id === source) || SOURCES[0];

  const { data, error, isLoading, mutate } = useSWR(
    `/api/launches?source=${source}`,
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: false },
  );

  const launches: LaunchToken[] = Array.isArray(data)
    ? data
    : data?.launches || data?.data || [];

  // Calculate totals across all visible launches
  const visibleLaunches = launches.slice(0, 10);
  const totalVolume = visibleLaunches.reduce((sum, launch) => {
    const vol = Number.parseFloat(launch.volume24h || "0");
    return sum + (Number.isNaN(vol) ? 0 : vol);
  }, 0);
  const totalTxns = visibleLaunches.reduce((sum, launch) => sum + (launch.txns24h || 0), 0);

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Rocket className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-card-foreground">
                Recent Launches
              </h2>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  Latest token deployments
                </p>
                {totalVolume > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-chart-3/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-chart-3">
                    <BarChart3 className="h-2.5 w-2.5" />
                    {formatVolume(totalVolume.toString())} vol
                  </span>
                )}
                {totalTxns > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-accent">
                    <ArrowLeftRight className="h-2.5 w-2.5" />
                    {formatTxns(totalTxns)} txns
                  </span>
                )}
              </div>
            </div>
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

        {/* Source tabs */}
        <div className="flex overflow-x-auto rounded-lg border border-border bg-secondary p-0.5">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSource(s.id)}
              className={`shrink-0 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors ${
                source === s.id
                  ? "bg-card text-card-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 py-8">
          <p className="text-sm text-destructive">
            Unable to load launches.
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
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={`launch-skel-${i}`}
              className="h-14 animate-pulse rounded-lg bg-secondary"
            />
          ))}
        </div>
      ) : launches.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border py-8">
          <p className="text-sm text-muted-foreground">
            No launches found yet.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use the launch form to deploy your first token.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {launches.slice(0, 10).map((launch, index) => {
            const addr = launch.contractAddress || launch.contract_address || launch.address || launch.id;
            return (
              <div
                key={addr || `launch-${index}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 transition-colors hover:border-primary/30"
              >
                {launch.image ? (
                  <img
                    src={launch.image || "/placeholder.svg"}
                    alt={launch.name || "Token"}
                    className="h-8 w-8 rounded-full bg-secondary object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-mono font-bold text-muted-foreground">
                    {(launch.symbol || "?")[0]}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-card-foreground">
                      {launch.name || "Unknown Token"}
                    </span>
                    {launch.symbol && (
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-accent">
                        ${launch.symbol}
                      </span>
                    )}
                    {launch.tax != null && launch.tax > 0 && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono text-primary">
                        {launch.tax}% tax
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-mono text-xs text-muted-foreground">
                      {truncateAddress(addr)}
                    </p>
                    <span className="flex items-center gap-0.5 rounded bg-chart-3/10 px-1.5 py-0.5 text-[10px] font-mono text-chart-3">
                      <BarChart3 className="h-2.5 w-2.5" />
                      {formatVolume(launch.volume24h)}
                    </span>
                    <span className="flex items-center gap-0.5 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-mono text-accent">
                      <ArrowLeftRight className="h-2.5 w-2.5" />
                      {formatTxns(launch.txns24h)} txns
                    </span>
                  </div>
                </div>
                {addr && (
                  <a
                    href={`${currentSource.explorer}${addr}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    aria-label={`View ${launch.name || "token"} on explorer`}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
