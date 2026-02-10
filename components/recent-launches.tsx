"use client";

import useSWR from "swr";
import { ExternalLink, Rocket, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface LaunchToken {
  name?: string;
  symbol?: string;
  contractAddress?: string;
  wallet?: string;
  description?: string;
  image?: string;
  createdAt?: string;
  status?: string;
  tax?: number;
}

function truncateAddress(addr: string | undefined): string {
  if (!addr) return "--";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function RecentLaunches() {
  const { data, error, isLoading, mutate } = useSWR(
    "/api/launches",
    fetcher,
    {
      refreshInterval: 30000,
      revalidateOnFocus: false,
    }
  );

  const launches: LaunchToken[] = Array.isArray(data)
    ? data
    : data?.launches || data?.data || [];

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Rocket className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-card-foreground">
              4claw Launches
            </h2>
            <p className="text-xs text-muted-foreground">
              Recent deployments via 4claw
            </p>
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

      {error ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 py-8">
          <p className="text-sm text-destructive">
            Unable to load 4claw launches.
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
          <p className="text-xs text-muted-foreground mt-1">
            Use the launch form to deploy your first token.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {launches.slice(0, 10).map((launch, index) => (
            <div
              key={launch.contractAddress || `launch-${index}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 transition-colors hover:border-primary/30"
            >
              {launch.image ? (
                <img
                  src={launch.image || "/placeholder.svg"}
                  alt={launch.name || "Token"}
                  className="h-8 w-8 rounded-full bg-secondary object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-mono font-bold text-muted-foreground">
                  {(launch.symbol || "?")[0]}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-card-foreground truncate">
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
                <p className="text-xs text-muted-foreground font-mono">
                  {truncateAddress(launch.contractAddress)}
                </p>
              </div>
              {launch.contractAddress && (
                <a
                  href={`https://bscscan.com/token/${launch.contractAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  aria-label={`View ${launch.name || "token"} on BscScan`}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
