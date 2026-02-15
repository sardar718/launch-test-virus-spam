"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Cloud, Zap, Timer, Square, RotateCw, Server } from "lucide-react";
import { addDeployedToken } from "@/components/deployed-tokens-box";
import { addGlobalLog } from "@/components/global-activity-feed";

const DEFAULT_ADMIN = "0x9c6111C77CBE545B9703243F895EB593f2721C7a";

type Mode = "cron" | "edge" | "server_cron";
type Launchpad = "4claw" | "kibu" | "clawnch" | "molaunch" | "fourclaw_fun" | "synthlaunch";
type Agent = "moltx" | "4claw_org" | "moltbook" | "clawstr" | "direct_api" | "bapbook";

interface LogEntry { time: string; msg: string; type: "info" | "success" | "error" | "skip"; }

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

interface Props { instanceId: number; instanceLabel: string; }

export function CloudAutoLaunch({ instanceId, instanceLabel }: Props) {
  const [launchpad, setLaunchpad] = useState<Launchpad>("kibu");
  const [agent, setAgent] = useState<Agent>("4claw_org");
  const [chain, setChain] = useState("bsc");
  const [kibuPlatform, setKibuPlatform] = useState<"flap" | "fourmeme">("flap");
  const [delaySeconds, setDelaySeconds] = useState("60");
  const [maxLaunches, setMaxLaunches] = useState("50");
  const [useCustomWallet, setUseCustomWallet] = useState(false);
  const [customWallet, setCustomWallet] = useState("");

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [totalLaunched, setTotalLaunched] = useState(0);
  const [loading, setLoading] = useState(false);
  const [resuming, setResuming] = useState(false);

  const abortRef = useRef(false);
  const sourceRef = useRef(0);
  const launchedRef = useRef<Set<string>>(new Set());
  const logsEndRef = useRef<HTMLDivElement>(null);

  const activeWallet = useCustomWallet && customWallet.trim() ? customWallet.trim() : DEFAULT_ADMIN;
  const selectedLp = LP_OPTIONS.find((l) => l.id === launchpad);

  // Log helper
  const addLog = useCallback((msg: string, type: LogEntry["type"] = "info") => {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs((prev) => {
      const next = [...prev, { time, msg, type }];
      return next.length > 200 ? next.slice(-200) : next;
    });
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    // Also persist to Redis
    fetch("/api/cloud-launch/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "log", instanceId, msg, type }),
    }).catch(() => {});
    // Global activity feed
    addGlobalLog(`[Cloud #${instanceId}] ${msg}`, type);
  }, [instanceId]);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Image validation
  const isRealImageUrl = (url: string): boolean => {
    if (!url?.startsWith("http")) return false;
    if (url.includes("pollinations.ai") || url.includes("dicebear.com")) return false;
    const l = url.toLowerCase();
    return !!(l.match(/\.(png|jpg|jpeg|webp|gif|svg)(\?|$)/) ||
      l.includes("coin-images.coingecko.com") || l.includes("assets.coingecko.com") ||
      l.includes("assets.geckoterminal.com") || l.includes("wsrv.nl"));
  };

  // Search image
  const fetchTokenImage = async (name: string, symbol: string): Promise<string> => {
    try {
      const r = await fetch("/api/search-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, symbol }),
      });
      const d = await r.json();
      if (d.url && isRealImageUrl(d.url)) return d.url;
    } catch { /* */ }
    return "";
  };

  // Generate description
  const generateDesc = async (name: string, symbol: string): Promise<string> => {
    try {
      const r = await fetch("/api/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, symbol }),
      });
      return (await r.json()).description || `$${symbol} - ${name}. Community memecoin.`;
    } catch {
      return `$${symbol} - ${name}. Community memecoin. DYOR.`;
    }
  };

  // Lookup socials
  const lookupSocials = async (name: string, symbol: string) => {
    try {
      const r = await fetch("/api/lookup-socials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, symbol }),
      });
      const d = await r.json();
      return { twitter: d.twitter || "", website: d.website || "" };
    } catch {
      return { twitter: "", website: "" };
    }
  };

  // Deploy one token
  const deployToken = async (token: Record<string, string>, lp: string, ag: string, ch: string, wallet: string, kp?: string): Promise<boolean> => {
    const sym = (token.symbol || "").toUpperCase();
    const nm = token.name || "";
    const tk = `${sym}_${nm}`.toLowerCase();

    if (launchedRef.current.has(tk)) return false;
    if ((token.chain || ch) !== ch) return false;

    let img = token.imageUrl || token.image || "";
    if (!isRealImageUrl(img)) {
      img = await fetchTokenImage(nm, sym);
      if (!img) {
        addLog(`Skip ${sym}: no real image`, "skip");
        return false;
      }
    }

    const desc = token.description || await generateDesc(nm, sym);
    const { twitter, website: socialWeb } = await lookupSocials(nm, sym);
    const website = token.website || socialWeb;

    addLog(`Deploying $${sym} "${nm}"...`);

    try {
      const r = await fetch("/api/deploy-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          launchpad: lp,
          agent: lp === "fourclaw_fun" ? "direct_api" : ag,
          kibuPlatform: lp === "kibu" ? (kp || "flap") : undefined,
          token: { name: nm, symbol: sym, wallet, description: desc, image: img, website, twitter, chain: ch },
        }),
      });
      const d = await r.json();
      if (d.success) {
        launchedRef.current.add(tk);
        addLog(`Deployed $${sym}! ${d.postUrl || d.postId || ""}`, "success");
        addDeployedToken({ name: nm, symbol: sym, image: img, launchpad: lp, chain: ch, postUrl: d.postUrl || "" });
        fetch("/api/cloud-launch/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "deployed", instanceId, symbol: tk, sourceIndex: sourceRef.current }),
        }).catch(() => {});
        return true;
      }
      addLog(`Failed: ${d.error || "Unknown"}`, "error");
      return false;
    } catch (e) {
      addLog(`Deploy error: ${String(e).slice(0, 80)}`, "error");
      return false;
    }
  };

  // Main loop (cron + edge modes)
  const runLoop = async (lp: string, ag: string, ch: string, wallet: string, kp: string | undefined, delay: number, max: number, startCount = 0) => {
    let launched = startCount;
    while (!abortRef.current && launched < max) {
      const srcIdx = sourceRef.current;
      addLog(`Cycle -- fetching tokens (src #${srcIdx})...`);

      let tokens: Record<string, string>[] = [];
      try {
        const r = await fetch(`/api/auto-launch/fetch-tokens?sourceIndex=${srcIdx}&minVolume=0`);
        const d = await r.json();
        tokens = d.tokens || [];
        sourceRef.current = d.nextSourceIndex ?? ((srcIdx + 1) % 6);
        if (d.source) addLog(`Source: ${d.source} | Found ${tokens.length} tokens`);
      } catch (e) {
        addLog(`Fetch error: ${String(e).slice(0, 60)}`, "error");
        sourceRef.current = (srcIdx + 1) % 6;
      }

      let deployedThisCycle = false;
      for (const token of tokens) {
        if (abortRef.current) break;
        const ok = await deployToken(token, lp, ag, ch, wallet, kp);
        if (ok) {
          launched++;
          setTotalLaunched(launched);
          deployedThisCycle = true;
          break;
        }
      }

      if (!deployedThisCycle && !abortRef.current) {
        addLog("No deployable tokens this cycle, rotating source", "skip");
      }

      fetch("/api/cloud-launch/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_source", instanceId, sourceIndex: sourceRef.current }),
      }).catch(() => {});

      if (abortRef.current) break;
      if (launched >= max) break;

      addLog(`Waiting ${delay}s before next cycle...`);
      for (let i = 0; i < delay && !abortRef.current; i++) {
        await sleep(1000);
      }
    }

    if (launched >= max) {
      addLog(`Max launches reached (${max}). Auto-stopped.`, "success");
    }
  };

  // Server Cron mode: poll Redis for logs and state (Vercel Cron does the work server-side)
  const runServerCronPoller = async () => {
    while (!abortRef.current) {
      try {
        const r = await fetch(`/api/cloud-launch?id=${instanceId}`);
        const d = await r.json();
        if (d.config) {
          setTotalLaunched(d.config.totalLaunched || 0);
          if (!d.config.running) {
            addLog("Server cron stopped (max reached or stopped remotely)", "success");
            break;
          }
        }
        if (d.logs?.length) {
          setLogs(d.logs.map((l: LogEntry) => l));
        }
      } catch { /* ignore */ }
      // Poll every 15s
      for (let i = 0; i < 15 && !abortRef.current; i++) {
        await sleep(1000);
      }
    }
  };

  // START
  const startCloud = async (selectedMode: Mode) => {
    setLoading(true);
    abortRef.current = false;
    sourceRef.current = 0;
    launchedRef.current = new Set();
    setTotalLaunched(0);
    setLogs([]);

    const lp = launchpad;
    const ag = launchpad === "fourclaw_fun" ? "direct_api" : agent;
    const ch = chain;
    const wallet = activeWallet;
    const kp = launchpad === "kibu" ? kibuPlatform : undefined;
    const delay = selectedMode === "cron" ? 60 : Math.max(parseInt(delaySeconds) || 60, 15);
    const max = parseInt(maxLaunches) || 50;

    // Save config to Redis
    try {
      await fetch("/api/cloud-launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start", instanceId, mode: selectedMode,
          launchpad: lp, agent: ag, chain: ch, wallet,
          source: ch, kibuPlatform: kp,
          delaySeconds: delay, maxLaunches: max,
        }),
      });
    } catch { /* ok */ }

    setRunning(true);
    setMode(selectedMode);
    setLoading(false);

    if (selectedMode === "server_cron") {
      addLog(`Cloud #${instanceId} started (Server Cron mode) | Vercel Cron every ~60s | max ${max}`);
      addLog("Runs server-side on Vercel -- works even with browser closed after deploy.");

      // Set mode to "cron" in Redis so the server-side cron handler picks it up
      try {
        await fetch("/api/cloud-launch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "start", instanceId, mode: "cron",
            launchpad: lp, agent: ag, chain: ch, wallet,
            source: ch, kibuPlatform: kp,
            delaySeconds: 60, maxLaunches: max,
          }),
        });
      } catch { /* ok */ }

      // Poll Redis for updates
      await runServerCronPoller();
    } else {
      addLog(`Cloud #${instanceId} started (${selectedMode} mode) | ${delay}s delay | max ${max}`);
      await runLoop(lp, ag, ch, wallet, kp, delay, max);
    }

    // Done
    setRunning(false);
    setMode(null);
    addLog("Stopped");
    try {
      await fetch("/api/cloud-launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", instanceId }),
      });
    } catch { /* ok */ }
  };

  // STOP
  const stopCloud = async () => {
    abortRef.current = true;
    addLog("Stop requested...");

    // Mark stopped in Redis immediately (server cron checks this)
    fetch("/api/cloud-launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop", instanceId }),
    }).catch(() => {});

    setRunning(false);
    setMode(null);
  };

  // CLEAR
  const clearCloud = async () => {
    abortRef.current = true;
    setRunning(false);
    setMode(null);
    setLogs([]);
    setTotalLaunched(0);
    launchedRef.current = new Set();
    await fetch("/api/cloud-launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear", instanceId }),
    }).catch(() => {});
  };

  // On mount: load state from Redis + AUTO-RESUME if was running
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/cloud-launch?id=${instanceId}`);
        const d = await r.json();
        if (cancelled) return;

        if (d.config) {
          setTotalLaunched(d.config.totalLaunched || 0);
          sourceRef.current = d.config.sourceIndex || 0;
          if (d.config.launchedSymbols) {
            launchedRef.current = new Set(d.config.launchedSymbols);
          }
          if (d.config.launchpad) setLaunchpad(d.config.launchpad);
          if (d.config.agent) setAgent(d.config.agent);
          if (d.config.chain) setChain(d.config.chain);

          // AUTO-RESUME: if it was running and mode is cron/edge, restart the loop
          if (d.config.running && (d.config.mode === "cron" || d.config.mode === "edge")) {
            setResuming(true);
            setRunning(true);
            setMode(d.config.mode);
            const lp = d.config.launchpad || "kibu";
            const ag = d.config.agent || "4claw_org";
            const ch = d.config.chain || "bsc";
            const wallet = d.config.wallet || DEFAULT_ADMIN;
            const kp = d.config.kibuPlatform;
            const delay = d.config.mode === "cron" ? 60 : Math.max(d.config.delaySeconds || 60, 15);
            const max = d.config.maxLaunches || 50;
            const already = d.config.totalLaunched || 0;

            addLog(`Auto-resuming ${d.config.mode} mode (${already}/${max} launched)...`, "info");
            setResuming(false);
            abortRef.current = false;
            await runLoop(lp, ag, ch, wallet, kp, delay, max, already);

            setRunning(false);
            setMode(null);
            addLog("Stopped");
            fetch("/api/cloud-launch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "stop", instanceId }),
            }).catch(() => {});
          }
          // Server Cron mode: it's running server-side, just poll
          else if (d.config.running && d.config.mode === "cron" && !d.config.lastRunAt) {
            // If cron mode was started as server_cron, poll for updates
            setRunning(true);
            setMode("server_cron");
            addLog("Server Cron mode active (Vercel Cron). Polling for updates...", "info");
            abortRef.current = false;
            await runServerCronPoller();
            setRunning(false);
            setMode(null);
          }
        }

        if (d.logs?.length) {
          setLogs(d.logs.map((l: LogEntry) => l));
        }
      } catch { /* ok */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId]);

  return (
    <Card className="border-[#06B6D4]/30 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold sm:text-base">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#06B6D4]/20 text-[#06B6D4]">
              <Cloud className="h-3.5 w-3.5" />
            </span>
            <span className="truncate">{instanceLabel}</span>
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {running && mode && (
              <Badge variant="outline" className={`animate-pulse text-[10px] ${
                mode === "server_cron" ? "border-[#10B981]/40 text-[#10B981]"
                : mode === "cron" ? "border-[#06B6D4]/40 text-[#06B6D4]"
                : "border-[#8B5CF6]/40 text-[#8B5CF6]"
              }`}>
                {mode === "server_cron" && <Server className="mr-1 h-2.5 w-2.5" />}
                {mode === "server_cron" ? "SERVER" : mode.toUpperCase()} | {totalLaunched} launched
              </Badge>
            )}
            {resuming && (
              <Badge variant="outline" className="border-[#F59E0B]/40 text-[#F59E0B] text-[10px]">
                <RotateCw className="mr-1 h-2.5 w-2.5 animate-spin" />RESUMING
              </Badge>
            )}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Cron = 60s | Edge = custom delay | Server Cron = works offline (Vercel Cron + Redis).
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Config -- only when NOT running */}
        {!running && (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <Label className="text-[10px] text-muted-foreground mb-1 block">Launchpad</Label>
                <div className="flex flex-wrap gap-1">
                  {LP_OPTIONS.map((lp) => (
                    <button key={lp.id} type="button"
                      onClick={() => { setLaunchpad(lp.id); if (!lp.chains.includes(chain)) setChain(lp.chains[0]); }}
                      className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                        launchpad === lp.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      }`}
                    >{lp.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground mb-1 block">Agent</Label>
                <div className="flex flex-wrap gap-1">
                  {AGENT_OPTIONS.map((ag) => (
                    <button key={ag.id} type="button" onClick={() => setAgent(ag.id)}
                      className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                        agent === ag.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      }`}
                    >{ag.label}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="flex-1 min-w-[100px]">
                <Label className="text-[10px] text-muted-foreground mb-1 block">Chain</Label>
                <div className="flex gap-1">
                  {(selectedLp?.chains || ["bsc"]).map((c) => (
                    <button key={c} type="button" onClick={() => setChain(c)}
                      className={`rounded px-3 py-1 text-[10px] font-medium uppercase transition-colors ${
                        chain === c ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      }`}
                    >{c}</button>
                  ))}
                </div>
              </div>
              {launchpad === "kibu" && (
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-1 block">Platform</Label>
                  <div className="flex gap-1">
                    {(["flap", "fourmeme"] as const).map((p) => (
                      <button key={p} type="button" onClick={() => setKibuPlatform(p)}
                        className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                          kibuPlatform === p ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                        }`}
                      >{p === "flap" ? "Flap.sh" : "FourMeme"}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground mb-1 block">Delay (sec)</Label>
                <Input value={delaySeconds} onChange={(e) => setDelaySeconds(e.target.value)} className="h-7 text-xs bg-secondary border-border" placeholder="60" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground mb-1 block">Max Tokens</Label>
                <Input value={maxLaunches} onChange={(e) => setMaxLaunches(e.target.value)} className="h-7 text-xs bg-secondary border-border" placeholder="50" />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] text-muted-foreground">Admin Wallet</Label>
                <button type="button" onClick={() => setUseCustomWallet(!useCustomWallet)} className="text-[9px] text-primary hover:underline">
                  {useCustomWallet ? "Use default" : "Custom address"}
                </button>
              </div>
              {useCustomWallet ? (
                <Input placeholder="0x..." value={customWallet} onChange={(e) => setCustomWallet(e.target.value)} className="h-7 text-xs bg-secondary border-border font-mono" />
              ) : (
                <div className="text-[9px] text-muted-foreground bg-secondary/50 rounded px-2 py-1">
                  <span className="font-mono text-foreground">{DEFAULT_ADMIN.substring(0, 10)}...{DEFAULT_ADMIN.substring(36)}</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Controls */}
        <div className="flex flex-wrap gap-2">
          {!running ? (
            <>
              <Button onClick={() => startCloud("cron")} disabled={loading}
                className="flex-1 min-w-[90px] h-8 text-[10px] sm:text-xs bg-[#06B6D4] text-[#000] hover:bg-[#06B6D4]/90 font-semibold"
              >
                <Timer className="mr-1 h-3 w-3" />
                {loading ? "..." : "Cron (60s)"}
              </Button>
              <Button onClick={() => startCloud("edge")} disabled={loading}
                className="flex-1 min-w-[90px] h-8 text-[10px] sm:text-xs bg-[#8B5CF6] text-[#fff] hover:bg-[#8B5CF6]/90 font-semibold"
              >
                <Zap className="mr-1 h-3 w-3" />
                {loading ? "..." : `Edge (${delaySeconds}s)`}
              </Button>
              <Button onClick={() => startCloud("server_cron")} disabled={loading}
                className="flex-1 min-w-[90px] h-8 text-[10px] sm:text-xs bg-[#10B981] text-[#000] hover:bg-[#10B981]/90 font-semibold"
              >
                <Server className="mr-1 h-3 w-3" />
                {loading ? "..." : "Server Cron"}
              </Button>
            </>
          ) : (
            <Button onClick={stopCloud} variant="destructive" className="flex-1 h-8 text-xs">
              <Square className="mr-1.5 h-3 w-3" />
              Stop {mode?.toUpperCase()}
            </Button>
          )}
          {!running && totalLaunched > 0 && (
            <Button variant="outline" onClick={clearCloud} className="h-8 text-xs bg-transparent">Clear</Button>
          )}
        </div>

        {/* Info */}
        <div className="rounded border border-border bg-secondary/30 p-2 text-[9px] text-muted-foreground space-y-0.5">
          <p><span className="font-medium text-[#06B6D4]">Cron:</span> 60s intervals. Browser must stay open. Auto-resumes on refresh.</p>
          <p><span className="font-medium text-[#8B5CF6]">Edge:</span> Custom {delaySeconds || 60}s intervals. Browser must stay open. Auto-resumes on refresh.</p>
          <p><span className="font-medium text-[#10B981]">Server Cron:</span> Runs on Vercel server. Works with browser closed. Deploys via Vercel Cron every ~1 min.</p>
        </div>

        {/* Logs */}
        {logs.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded bg-background/80 border border-border p-2 font-mono text-[9px] space-y-0.5">
            {logs.map((l, i) => (
              <div key={`${l.time}-${i}`}
                className={`flex gap-1.5 ${
                  l.type === "success" ? "text-chart-3"
                  : l.type === "error" ? "text-destructive"
                  : l.type === "skip" ? "text-muted-foreground/60"
                  : "text-muted-foreground"
                }`}
              >
                <span className="shrink-0 text-muted-foreground/40">{l.time}</span>
                <span className="break-all">{l.msg}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
