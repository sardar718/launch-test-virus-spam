"use client";

import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addDeployedToken } from "@/components/deployed-tokens-box";

const DEFAULT_ADMIN = "0x9c6111C77CBE545B9703243F895EB593f2721C7a";

type Launchpad = "4claw" | "kibu" | "clawnch" | "molaunch" | "fourclaw_fun" | "synthlaunch";
type Agent = "moltx" | "4claw_org" | "moltbook" | "clawstr" | "direct_api" | "bapbook";
type TrendSource = "all" | "google" | "twitter" | "coingecko" | "dexscreener" | "geckoterminal";
type TrendFilter = "trending" | "volume" | "gainers" | "new";

interface TrendItem {
  name: string;
  symbol: string;
  imageUrl: string;
  source: string;
  description?: string;
  volume24h?: number;
  priceChange?: number;
}

interface LogEntry {
  time: string;
  msg: string;
  type: "info" | "success" | "error" | "skip";
}

const LP_OPTIONS: { id: Launchpad; label: string; chains: string[] }[] = [
  { id: "4claw", label: "4claw", chains: ["bsc"] },
  { id: "kibu", label: "Kibu", chains: ["bsc", "base"] },
  { id: "clawnch", label: "Clawnch", chains: ["base"] },
  { id: "molaunch", label: "Molaunch", chains: ["solana"] },
  { id: "fourclaw_fun", label: "FourClaw.Fun", chains: ["bsc", "solana"] },
  { id: "synthlaunch", label: "SynthLaunch", chains: ["bsc"] },
];

const AGENT_OPTIONS: { id: Agent; label: string }[] = [
  { id: "4claw_org", label: "4claw.org" },
  { id: "moltx", label: "Moltx" },
  { id: "moltbook", label: "Moltbook" },
  { id: "clawstr", label: "Clawstr" },
  { id: "direct_api", label: "Direct API" },
  { id: "bapbook", label: "BapBook" },
];

const SOURCE_OPTIONS: { id: TrendSource; label: string; color: string }[] = [
  { id: "all", label: "All Sources", color: "bg-primary text-primary-foreground" },
  { id: "google", label: "Google Trends", color: "bg-[#4285F4]/20 text-[#4285F4]" },
  { id: "twitter", label: "Twitter / X", color: "bg-foreground/10 text-foreground" },
  { id: "coingecko", label: "CoinGecko", color: "bg-[#8DC63F]/20 text-[#8DC63F]" },
  { id: "dexscreener", label: "DexScreener", color: "bg-[#1CC9FF]/20 text-[#1CC9FF]" },
  { id: "geckoterminal", label: "GeckoTerminal", color: "bg-[#FF6B35]/20 text-[#FF6B35]" },
];

const FILTER_OPTIONS: { id: TrendFilter; label: string; desc: string }[] = [
  { id: "trending", label: "Trending", desc: "Default hot/trending" },
  { id: "volume", label: "Top Volume", desc: "Highest 24h volume" },
  { id: "gainers", label: "Top Gainers", desc: "Biggest 24h price increase" },
  { id: "new", label: "New Tokens", desc: "Recently listed tokens" },
];

export function TrendingAutoLaunch() {
  const [running, setRunning] = useState(false);
  const [launchpad, setLaunchpad] = useState<Launchpad>("kibu");
  const [agent, setAgent] = useState<Agent>("4claw_org");
  const [chain, setChain] = useState("bsc");
  const [trendSource, setTrendSource] = useState<TrendSource>("all");
  const [trendFilter, setTrendFilter] = useState<TrendFilter>("trending");
  const [delaySeconds, setDelaySeconds] = useState("30");
  const [maxLaunches, setMaxLaunches] = useState("10");
  const [useCustomWallet, setUseCustomWallet] = useState(false);
  const [customWallet, setCustomWallet] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState({ launched: 0, skipped: 0, errors: 0 });
  const [launched, setLaunched] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<TrendItem[]>([]);
  const abortRef = useRef(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const activeWallet = useCustomWallet && customWallet.trim() ? customWallet.trim() : DEFAULT_ADMIN;

  const addLog = useCallback((msg: string, type: LogEntry["type"] = "info") => {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs((prev) => {
      const next = [...prev, { time, msg, type }];
      return next.length > 200 ? next.slice(-200) : next;
    });
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  }, []);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Fetch trending topics with filter
  const fetchTrending = async (): Promise<TrendItem[]> => {
    const r = await fetch(`/api/auto-launch/fetch-trending?source=${trendSource}&filter=${trendFilter}&limit=25`);
    const d = await r.json();
    // Log source status
    if (d.sources) {
      const statuses = Object.entries(d.sources as Record<string, { count: number; error?: string }>)
        .map(([k, v]) => `${k}: ${v.count}${v.error ? ` (err)` : ""}`)
        .join(", ");
      addLog(`Sources: ${statuses}`);
    }
    return d.items || [];
  };

  // Preview trending topics without launching
  const previewTrending = async () => {
    setPreview([]);
    addLog(`Fetching trending from: ${SOURCE_OPTIONS.find((s) => s.id === trendSource)?.label}...`);
    try {
      const items = await fetchTrending();
      setPreview(items);
      addLog(`Found ${items.length} trending topics with real images`, "success");
    } catch (e) {
      addLog(`Preview error: ${String(e)}`, "error");
    }
  };

  // Deploy a single trending item as a token
  const deployTrend = async (item: TrendItem): Promise<boolean> => {
    const body = {
      launchpad,
      agent: launchpad === "fourclaw_fun" ? "direct_api" : agent,
      token: {
        name: item.name,
        symbol: item.symbol.toUpperCase(),
        wallet: activeWallet,
        description: item.description || `$${item.symbol} - Trending token. Community-driven memecoin.`,
        image: item.imageUrl,
        chain,
      },
    };

    const r = await fetch("/api/deploy-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();

    if (data.success) {
      addLog(`Deployed $${item.symbol} (${item.source})! Post: ${data.postUrl || data.postId}`, "success");
      addDeployedToken({
        name: item.name,
        symbol: item.symbol.toUpperCase(),
        postUrl: data.postUrl,
        launchpad,
        agent,
        timestamp: Date.now(),
      });
      return true;
    }
    addLog(`Deploy failed for $${item.symbol}: ${data.error}`, "error");
    return false;
  };

  // Main auto-launch loop
  const startTrendingLaunch = async () => {
    abortRef.current = false;
    setRunning(true);
    setLogs([]);
    setStats({ launched: 0, skipped: 0, errors: 0 });
    setPreview([]);
    const launchedSet = new Set(launched);
    const max = Number.parseInt(maxLaunches, 10) || 10;
    const delay = (Number.parseInt(delaySeconds, 10) || 30) * 1000;
    let totalLaunched = 0;

    const sourceName = SOURCE_OPTIONS.find((s) => s.id === trendSource)?.label || trendSource;
    addLog(`Trending auto-launch started: ${sourceName} -> ${LP_OPTIONS.find((l) => l.id === launchpad)?.label} via ${AGENT_OPTIONS.find((a) => a.id === agent)?.label}`);

    while (!abortRef.current && totalLaunched < max) {
      addLog(`Fetching trending topics from ${sourceName}...`);
      try {
        const items = await fetchTrending();
        addLog(`Found ${items.length} trending items with images`);

        if (items.length === 0) {
          addLog("No trending items found, retrying in 15s...", "skip");
          await sleep(15000);
          continue;
        }

        for (const item of items) {
          if (abortRef.current || totalLaunched >= max) break;

          const key = `${item.symbol}_trend`.toLowerCase();
          if (launchedSet.has(key)) {
            setStats((p) => ({ ...p, skipped: p.skipped + 1 }));
            continue;
          }

          addLog(`Launching: $${item.symbol} "${item.name}" [${item.source}]`);

          try {
            const ok = await deployTrend(item);
            if (ok) {
              totalLaunched++;
              launchedSet.add(key);
              setLaunched(new Set(launchedSet));
              setStats((p) => ({ ...p, launched: p.launched + 1 }));
            } else {
              setStats((p) => ({ ...p, errors: p.errors + 1 }));
            }
          } catch (e) {
            addLog(`Error on $${item.symbol}: ${String(e)}`, "error");
            setStats((p) => ({ ...p, errors: p.errors + 1 }));
          }

          if (!abortRef.current && totalLaunched < max) {
            addLog(`Waiting ${delaySeconds}s...`);
            await sleep(delay);
          }
        }

        // Wait before next fetch cycle if we haven't hit max
        if (!abortRef.current && totalLaunched < max) {
          addLog("Refreshing trending data in 60s...");
          await sleep(60000);
        }
      } catch (e) {
        addLog(`Fetch error: ${String(e)} -- retrying in 10s`, "error");
        await sleep(10000);
      }
    }

    addLog(
      abortRef.current
        ? `Stopped. Launched: ${totalLaunched}`
        : `Trending launch complete! Launched: ${totalLaunched}/${max}`,
      "success",
    );
    setRunning(false);
  };

  const stopLaunch = () => {
    abortRef.current = true;
    addLog("Stopping after current...", "info");
  };

  const selectedLp = LP_OPTIONS.find((l) => l.id === launchpad);

  return (
    <Card className="border-[#F59E0B]/30 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#F59E0B]/20 text-[#F59E0B] text-xs font-bold">
              T
            </span>
            Trending Auto-Launch
          </CardTitle>
          {running && (
            <Badge variant="outline" className="border-[#F59E0B]/40 text-[#F59E0B] animate-pulse text-[10px]">
              RUNNING
            </Badge>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">
          Auto-create tokens from trending topics. Images from post/tweet or Google search (.png/.jpg only).
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Trending Source */}
        <div>
          <Label className="text-[10px] text-muted-foreground mb-1 block">Trending Source</Label>
          <div className="flex flex-wrap gap-1">
            {SOURCE_OPTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setTrendSource(s.id)}
                disabled={running}
                className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                  trendSource === s.id
                    ? s.color
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                } disabled:opacity-50`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filter (for CoinGecko / DexScreener / GeckoTerminal) */}
        <div>
          <Label className="text-[10px] text-muted-foreground mb-1 block">Filter</Label>
          <div className="flex flex-wrap gap-1">
            {FILTER_OPTIONS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setTrendFilter(f.id)}
                disabled={running}
                title={f.desc}
                className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                  trendFilter === f.id
                    ? "bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/30"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                } disabled:opacity-50`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Launchpad + Agent */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] text-muted-foreground mb-1 block">Launchpad</Label>
            <div className="flex flex-wrap gap-1">
              {LP_OPTIONS.map((lp) => (
                <button
                  key={lp.id}
                  type="button"
                  onClick={() => {
                    setLaunchpad(lp.id);
                    if (!lp.chains.includes(chain)) setChain(lp.chains[0]);
                  }}
                  disabled={running}
                  className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                    launchpad === lp.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  } disabled:opacity-50`}
                >
                  {lp.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground mb-1 block">Agent</Label>
            <div className="flex flex-wrap gap-1">
              {AGENT_OPTIONS.map((ag) => (
                <button
                  key={ag.id}
                  type="button"
                  onClick={() => setAgent(ag.id)}
                  disabled={running}
                  className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                    agent === ag.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  } disabled:opacity-50`}
                >
                  {ag.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chain */}
        <div>
          <Label className="text-[10px] text-muted-foreground mb-1 block">Chain</Label>
          <div className="flex gap-1">
            {(selectedLp?.chains || ["bsc"]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChain(c)}
                disabled={running}
                className={`rounded px-3 py-1 text-[10px] font-medium uppercase transition-colors ${
                  chain === c
                    ? "bg-accent text-accent-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                } disabled:opacity-50`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Params */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] text-muted-foreground mb-1 block">Delay (sec)</Label>
            <Input
              value={delaySeconds}
              onChange={(e) => setDelaySeconds(e.target.value)}
              disabled={running}
              className="h-7 text-xs bg-secondary border-border"
              placeholder="30"
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground mb-1 block">Max Tokens</Label>
            <Input
              value={maxLaunches}
              onChange={(e) => setMaxLaunches(e.target.value)}
              disabled={running}
              className="h-7 text-xs bg-secondary border-border"
              placeholder="10"
            />
          </div>
        </div>

        {/* Wallet */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] text-muted-foreground">Admin Wallet</Label>
            <button
              type="button"
              onClick={() => setUseCustomWallet(!useCustomWallet)}
              disabled={running}
              className="text-[9px] text-primary hover:underline disabled:opacity-50"
            >
              {useCustomWallet ? "Use default" : "Custom address"}
            </button>
          </div>
          {useCustomWallet ? (
            <Input
              placeholder="0x..."
              value={customWallet}
              onChange={(e) => setCustomWallet(e.target.value)}
              disabled={running}
              className="h-7 text-xs bg-secondary border-border font-mono"
            />
          ) : (
            <div className="text-[9px] text-muted-foreground bg-secondary/50 rounded px-2 py-1">
              <span className="font-mono text-foreground">
                {DEFAULT_ADMIN.substring(0, 10)}...{DEFAULT_ADMIN.substring(36)}
              </span>
            </div>
          )}
        </div>

        {/* Stats */}
        {(stats.launched > 0 || stats.skipped > 0 || stats.errors > 0) && (
          <div className="flex gap-3 text-[10px]">
            <span className="text-chart-3">Launched: {stats.launched}</span>
            <span className="text-muted-foreground">Skipped: {stats.skipped}</span>
            <span className="text-destructive">Errors: {stats.errors}</span>
          </div>
        )}

        {/* Preview section */}
        {preview.length > 0 && !running && (
          <div className="rounded border border-border bg-background/50 p-2">
            <p className="text-[9px] text-muted-foreground mb-1.5 font-medium">Preview: {preview.length} trending topics</p>
            <div className="flex flex-wrap gap-1.5">
              {preview.slice(0, 15).map((item, i) => (
                <div key={`${item.symbol}-${i}`} className="flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.imageUrl} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />
                  <span className="text-[9px] font-medium text-card-foreground">${item.symbol}</span>
                  <span className="text-[8px] text-muted-foreground">{item.source}</span>
                  {item.priceChange && item.priceChange !== 0 ? (
                    <span className={`text-[8px] ${item.priceChange > 0 ? "text-chart-3" : "text-destructive"}`}>
                      {item.priceChange > 0 ? "+" : ""}{item.priceChange.toFixed(1)}%
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-2">
          {!running ? (
            <>
              <Button
                onClick={startTrendingLaunch}
                className="flex-1 h-8 text-xs bg-[#F59E0B] text-[#000] hover:bg-[#F59E0B]/90 font-semibold"
              >
                Start Trending Launch
              </Button>
              <Button
                onClick={previewTrending}
                variant="outline"
                className="h-8 text-xs bg-transparent"
              >
                Preview
              </Button>
            </>
          ) : (
            <Button
              onClick={stopLaunch}
              variant="destructive"
              className="flex-1 h-8 text-xs"
            >
              Stop
            </Button>
          )}
          {!running && logs.length > 0 && (
            <Button
              variant="outline"
              onClick={() => { setLogs([]); setStats({ launched: 0, skipped: 0, errors: 0 }); setPreview([]); }}
              className="h-8 text-xs bg-transparent"
            >
              Clear
            </Button>
          )}
        </div>

        {/* Log */}
        {logs.length > 0 && (
          <div className="max-h-48 overflow-y-auto rounded bg-background/80 border border-border p-2 font-mono text-[9px] space-y-0.5">
            {logs.map((l, i) => (
              <div
                key={`${l.time}-${i}`}
                className={`flex gap-1.5 ${
                  l.type === "success"
                    ? "text-chart-3"
                    : l.type === "error"
                      ? "text-destructive"
                      : l.type === "skip"
                        ? "text-muted-foreground/60"
                        : "text-muted-foreground"
                }`}
              >
                <span className="shrink-0 text-muted-foreground/40">{l.time}</span>
                <span>{l.msg}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
