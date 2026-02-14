"use client";

import useSWR from "swr";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface CheckResult {
  id: string;
  label: string;
  category: "launchpad" | "agent" | "data" | "chain";
  status: "online" | "offline" | "slow" | "checking";
  latency: number;
  message: string;
  url: string;
}

interface HealthData {
  checks: CheckResult[];
  summary: { online: number; total: number; percentage: number };
  timestamp: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  launchpad: "Launchpads",
  agent: "Posting Agents",
  data: "Data Sources",
  chain: "Chain RPCs",
};

const CATEGORY_ORDER = ["launchpad", "agent", "data", "chain"];

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    online: "bg-chart-3",
    offline: "bg-destructive",
    slow: "bg-accent",
    checking: "bg-muted-foreground animate-pulse",
  };
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${colors[status] || colors.checking}`} />
  );
}

export function HealthCheck() {
  const { data, isLoading, mutate } = useSWR<HealthData>(
    "/api/health-check",
    fetcher,
    { refreshInterval: 60000, revalidateOnFocus: false },
  );

  const checks = data?.checks || [];
  const summary = data?.summary;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-chart-3/10">
            <span className="text-sm font-bold text-chart-3">{"<>"}</span>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-card-foreground">
              System Status
            </h2>
            <p className="text-xs text-muted-foreground">
              Check which launchpads and agents are operational before launching
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {summary && (
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                  summary.percentage >= 80
                    ? "bg-chart-3/10 text-chart-3"
                    : summary.percentage >= 50
                      ? "bg-accent/10 text-accent"
                      : "bg-destructive/10 text-destructive"
                }`}
              >
                {summary.online}/{summary.total} Online
              </span>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutate()}
            disabled={isLoading}
            className="border-border bg-transparent text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && checks.length === 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={`skel-${i}`} className="h-28 animate-pulse rounded-lg bg-secondary" />
          ))}
        </div>
      )}

      {/* Checks by category */}
      {checks.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORY_ORDER.map((cat) => {
            const items = checks.filter((c) => c.category === cat);
            if (items.length === 0) return null;
            const onlineCount = items.filter((c) => c.status === "online").length;
            return (
              <div
                key={cat}
                className="rounded-lg border border-border bg-background p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {CATEGORY_LABELS[cat]}
                  </h3>
                  <span className="text-[9px] font-mono text-muted-foreground">
                    {onlineCount}/{items.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {items.map((check) => (
                    <div
                      key={check.id}
                      className="flex items-center justify-between rounded-md bg-secondary/50 px-2.5 py-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <StatusDot status={check.status} />
                        <span className="text-xs font-medium text-card-foreground">
                          {check.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {check.status === "online" && (
                          <span className="text-[9px] font-mono text-chart-3">
                            {check.latency}ms
                          </span>
                        )}
                        {check.status === "slow" && (
                          <span className="text-[9px] font-mono text-accent">
                            {check.latency}ms
                          </span>
                        )}
                        {check.status === "offline" && (
                          <span className="text-[9px] font-mono text-destructive">
                            DOWN
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Timestamp */}
      {data?.timestamp && (
        <p className="mt-3 text-center text-[9px] text-muted-foreground">
          Last checked: {new Date(data.timestamp).toLocaleTimeString()} -- Auto-refreshes every 60s
        </p>
      )}
    </section>
  );
}
