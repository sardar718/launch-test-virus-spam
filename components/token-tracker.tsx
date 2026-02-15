"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  ArrowUpDown,
  TrendingUp,
  Flame,
  Skull,
  Trophy,
  Clock,
} from "lucide-react";
import type { TrackedToken, TrackerSummary } from "@/app/api/token-tracker/route";

type SortField = "mcap" | "volume" | "txns" | "newest" | "age";

const SORT_OPTIONS: { id: SortField; label: string }[] = [
  { id: "mcap", label: "Mcap" },
  { id: "volume", label: "Volume" },
  { id: "txns", label: "Txns" },
  { id: "newest", label: "Newest" },
];

const MILESTONE_COLORS: Record<string, string> = {
  "25K": "bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/30",
  "30K": "bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/30",
  "50K": "bg-chart-3/20 text-chart-3 border-chart-3/30",
  "100K": "bg-[#06B6D4]/20 text-[#06B6D4] border-[#06B6D4]/30",
  "500K": "bg-[#8B5CF6]/20 text-[#8B5CF6] border-[#8B5CF6]/30",
  "1M": "bg-primary/20 text-primary border-primary/30",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "mooning") {
    return (
      <Badge variant="outline" className="border-chart-3/40 text-chart-3 text-[9px] gap-0.5 px-1.5 py-0 animate-pulse">
        <Flame className="h-2.5 w-2.5" /> Mooning
      </Badge>
    );
  }
  if (status === "dead") {
    return (
      <Badge variant="outline" className="border-destructive/40 text-destructive text-[9px] gap-0.5 px-1.5 py-0">
        <Skull className="h-2.5 w-2.5" /> Dead
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-[#06B6D4]/40 text-[#06B6D4] text-[9px] gap-0.5 px-1.5 py-0">
      <TrendingUp className="h-2.5 w-2.5" /> Active
    </Badge>
  );
}

export function TokenTracker() {
  const [tokens, setTokens] = useState<TrackedToken[]>([]);
  const [summary, setSummary] = useState<TrackerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>("mcap");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "dead" | "mooning">("all");
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [minMcap, setMinMcap] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const [countdown, setCountdown] = useState(10);

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch("/api/token-tracker");
      const d = await r.json();
      if (d.tokens) setTokens(d.tokens);
      if (d.summary) setSummary(d.summary);
      setLastUpdated(new Date().toLocaleTimeString("en-US", { hour12: false }));
      setCountdown(10);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    if (!autoRefresh) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          fetchData();
          return 10;
        }
        return c - 1;
      });
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh, fetchData]);

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedAddr(addr);
    setTimeout(() => setCopiedAddr(null), 2000);
  };

  // Sort and filter tokens
  const filtered = tokens
    .filter((t) => filterStatus === "all" || t.status === filterStatus)
    .filter((t) => t.mcap >= minMcap)
    .sort((a, b) => {
      if (sortField === "mcap") return b.mcap - a.mcap;
      if (sortField === "volume") return b.volume24h - a.volume24h;
      if (sortField === "txns") return b.txns24h - a.txns24h;
      if (sortField === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return 0;
    });

  // Milestone alerts (tokens that just passed a milestone)
  const milestoneTokens = tokens.filter((t) => t.milestoneReached);

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2 px-3 pt-3 sm:px-4 sm:pt-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-[#0052FF]/20 border border-[#0052FF]/30">
              <BarChart3 className="h-3.5 w-3.5 text-[#0052FF]" />
            </div>
            <div>
              <CardTitle className="text-sm font-bold text-card-foreground">
                Clawnch Token Tracker
              </CardTitle>
              <p className="text-[9px] text-muted-foreground">
                Base chain -- admin 0x9c61...1C7a -- {autoRefresh ? `refreshing in ${countdown}s` : "paused"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`rounded px-2 py-0.5 text-[9px] font-medium transition-colors ${
                autoRefresh
                  ? "bg-chart-3/20 text-chart-3"
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              {autoRefresh ? "Auto ON" : "Auto OFF"}
            </button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { fetchData(); }}
              className="h-6 w-6 p-0"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4 space-y-3">
        {/* Summary Bar */}
        {summary && (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
            {[
              { label: "Tokens", value: String(summary.totalTokens) },
              { label: "Total Mcap", value: summary.totalMcap >= 1_000_000 ? `$${(summary.totalMcap / 1_000_000).toFixed(2)}M` : `$${(summary.totalMcap / 1_000).toFixed(1)}K` },
              { label: "24h Volume", value: summary.totalVolume >= 1_000_000 ? `$${(summary.totalVolume / 1_000_000).toFixed(2)}M` : `$${(summary.totalVolume / 1_000).toFixed(1)}K` },
              { label: "Active", value: String(summary.activeCount) },
              { label: "Mooning", value: String(summary.mooningCount) },
            ].map((s) => (
              <div key={s.label} className="rounded border border-border bg-secondary/50 px-2 py-1.5 text-center">
                <p className="text-[9px] text-muted-foreground">{s.label}</p>
                <p className="text-xs font-bold font-mono text-card-foreground">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Milestone Alerts */}
        {milestoneTokens.length > 0 && (
          <div className="space-y-1">
            {milestoneTokens.map((t) => (
              <div key={t.contractAddress} className={`flex items-center gap-2 rounded border px-2 py-1.5 ${MILESTONE_COLORS[t.milestoneReached || "25K"] || "bg-accent/20 text-accent border-accent/30"}`}>
                <Trophy className="h-3 w-3 shrink-0" />
                <span className="text-[10px] font-semibold">
                  ${t.symbol} passed {t.milestoneReached} mcap!
                </span>
                <span className="ml-auto text-[9px] font-mono">{t.mcapFormatted}</span>
              </div>
            ))}
          </div>
        )}

        {/* Sort & Filter Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
          {SORT_OPTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSortField(s.id)}
              className={`rounded px-2 py-0.5 text-[9px] font-medium transition-colors ${
                sortField === s.id
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {s.label}
            </button>
          ))}
          <span className="text-muted-foreground text-[9px] mx-1">|</span>
          {(["all", "active", "mooning", "dead"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterStatus(f)}
              className={`rounded px-2 py-0.5 text-[9px] font-medium transition-colors ${
                filterStatus === f
                  ? "bg-accent/20 text-accent border border-accent/30"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <span className="text-muted-foreground text-[9px] mx-1">|</span>
          <select
            value={minMcap}
            onChange={(e) => setMinMcap(Number(e.target.value))}
            className="rounded bg-secondary text-secondary-foreground text-[9px] px-1.5 py-0.5 border border-border"
          >
            <option value={0}>Min: Any</option>
            <option value={1000}>Min: $1K</option>
            <option value={5000}>Min: $5K</option>
            <option value={10000}>Min: $10K</option>
            <option value={25000}>Min: $25K</option>
            <option value={50000}>Min: $50K</option>
          </select>
        </div>

        {/* Token List */}
        <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
          {loading && tokens.length === 0 && (
            <div className="py-8 text-center text-xs text-muted-foreground">Loading tokens...</div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No tokens found matching filters.
            </div>
          )}

          {filtered.map((t) => (
            <div
              key={t.contractAddress}
              className={`flex items-center gap-2 rounded-lg border bg-secondary/30 px-2 py-2 sm:px-3 transition-colors hover:bg-secondary/60 ${
                t.status === "mooning" ? "border-chart-3/30" : t.status === "dead" ? "border-destructive/20" : "border-border"
              }`}
            >
              {/* Logo */}
              <div className="shrink-0">
                {t.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={t.imageUrl}
                    alt={t.symbol}
                    className="h-8 w-8 rounded-full object-cover border border-border"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-[9px] font-bold text-muted-foreground border border-border">
                    {t.symbol.slice(0, 2)}
                  </div>
                )}
              </div>

              {/* Name + Symbol + Age */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-card-foreground truncate max-w-[100px] sm:max-w-[140px]">
                    {t.name}
                  </span>
                  <span className="text-[9px] text-muted-foreground font-mono">${t.symbol}</span>
                  <StatusBadge status={t.status} />
                  {t.milestoneReached && (
                    <Badge variant="outline" className={`text-[8px] px-1 py-0 ${MILESTONE_COLORS[t.milestoneReached] || ""}`}>
                      <Trophy className="h-2 w-2 mr-0.5" />{t.milestoneReached}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                    <Clock className="h-2.5 w-2.5" />{t.age}
                  </span>
                  <span className="text-[9px] text-muted-foreground font-mono">
                    {t.contractAddress.slice(0, 6)}...{t.contractAddress.slice(-4)}
                  </span>
                  <button
                    onClick={() => copyAddress(t.contractAddress)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="Copy contract address"
                  >
                    {copiedAddr === t.contractAddress ? (
                      <Check className="h-2.5 w-2.5 text-chart-3" />
                    ) : (
                      <Copy className="h-2.5 w-2.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="hidden sm:flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <p className="text-[9px] text-muted-foreground">MCap</p>
                  <p className="text-[10px] font-bold font-mono text-card-foreground">{t.mcapFormatted}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-muted-foreground">24h Vol</p>
                  <p className="text-[10px] font-bold font-mono text-card-foreground">{t.volumeFormatted}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-muted-foreground">Txns</p>
                  <p className="text-[10px] font-bold font-mono text-card-foreground">{t.txns24h}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-muted-foreground">24h</p>
                  <p className={`text-[10px] font-bold font-mono ${t.priceChangePercent24h >= 0 ? "text-chart-3" : "text-destructive"}`}>
                    {t.priceChangePercent24h >= 0 ? "+" : ""}{t.priceChangePercent24h.toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* Mobile stats row */}
              <div className="flex sm:hidden flex-col items-end gap-0.5 shrink-0">
                <p className="text-[10px] font-bold font-mono text-card-foreground">{t.mcapFormatted}</p>
                <p className={`text-[9px] font-mono ${t.priceChangePercent24h >= 0 ? "text-chart-3" : "text-destructive"}`}>
                  {t.priceChangePercent24h >= 0 ? "+" : ""}{t.priceChangePercent24h.toFixed(1)}%
                </p>
              </div>

              {/* clanker.world link */}
              <a
                href={t.clankerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 flex h-6 w-6 items-center justify-center rounded bg-secondary hover:bg-secondary/80 transition-colors"
                title="View on clanker.world"
              >
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </a>
            </div>
          ))}
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between text-[9px] text-muted-foreground pt-1 border-t border-border">
          <span>
            Showing {filtered.length} of {tokens.length} tokens
          </span>
          <span>
            Last: {lastUpdated || "--"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
