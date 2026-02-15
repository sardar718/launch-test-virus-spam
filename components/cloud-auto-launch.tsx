"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Cloud, Zap, Timer, Square, RotateCw, Play } from "lucide-react";

const DEFAULT_ADMIN = "0x9c6111C77CBE545B9703243F895EB593f2721C7a";

type Mode = "cron" | "edge";
type Launchpad = "4claw" | "kibu" | "clawnch" | "molaunch" | "fourclaw_fun" | "synthlaunch";
type Agent = "moltx" | "4claw_org" | "moltbook" | "clawstr" | "direct_api" | "bapbook";

interface LogEntry { time: string; msg: string; type: "info" | "success" | "error" | "skip"; }
interface CloudConfig {
  running: boolean; mode: Mode; launchpad: string; agent: string; chain: string;
  wallet: string; source: string; delaySeconds: number; maxLaunches: number;
  totalLaunched: number; startedAt: number; stoppedAt?: number; lastRunAt?: number;
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

interface CloudAutoLaunchProps {
  instanceId: number;
  instanceLabel: string;
}

export function CloudAutoLaunch({ instanceId, instanceLabel }: CloudAutoLaunchProps) {
  // Config state
  const [launchpad, setLaunchpad] = useState<Launchpad>("kibu");
  const [agent, setAgent] = useState<Agent>("4claw_org");
  const [chain, setChain] = useState("bsc");
  const [kibuPlatform, setKibuPlatform] = useState<"flap" | "fourmeme">("flap");
  const [delaySeconds, setDelaySeconds] = useState("60");
  const [maxLaunches, setMaxLaunches] = useState("50");
  const [useCustomWallet, setUseCustomWallet] = useState(false);
  const [customWallet, setCustomWallet] = useState("");

  // Runtime state
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [config, setConfig] = useState<CloudConfig | null>(null);
  const [loading, setLoading] = useState(false);

  // Both modes can run -- cron runs via Vercel scheduler, edge runs via client polling
  const [cronRunning, setCronRunning] = useState(false);
  const [edgeRunning, setEdgeRunning] = useState(false);
  const edgeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const deployingRef = useRef(false);

  const activeWallet = useCustomWallet && customWallet.trim() ? customWallet.trim() : DEFAULT_ADMIN;
  const selectedLp = LP_OPTIONS.find((l) => l.id === launchpad);
  const isAnythingRunning = cronRunning || edgeRunning || config?.running === true;

  // Fetch status from Redis
  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`/api/cloud-launch?id=${instanceId}`);
      const d = await r.json();
      if (d.config) {
        setConfig(d.config);
        if (d.config.running && d.config.mode === "cron") setCronRunning(true);
        else setCronRunning(false);
      } else {
        setCronRunning(false);
      }
      if (d.logs) setLogs(d.logs);
    } catch { /* ignore */ }
  }, [instanceId]);

  // Poll status every 4 seconds
  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchStatus]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Build config body for start
  const buildStartBody = (mode: Mode) => ({
    action: "start",
    instanceId,
    mode,
    launchpad,
    agent: launchpad === "fourclaw_fun" ? "direct_api" : agent,
    chain,
    wallet: activeWallet,
    source: chain,
    kibuPlatform: launchpad === "kibu" ? kibuPlatform : undefined,
    delaySeconds: parseInt(delaySeconds) || 60,
    maxLaunches: parseInt(maxLaunches) || 50,
  });

  // Trigger one deploy cycle on the server
  const triggerRun = async (): Promise<boolean> => {
    if (deployingRef.current) return false;
    deployingRef.current = true;
    try {
      const r = await fetch("/api/cloud-launch/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId }),
        signal: AbortSignal.timeout(45000),
      });
      const d = await r.json();
      if (d.stopped) return false; // max reached
      return !d.skipped;
    } catch {
      return false;
    } finally {
      deployingRef.current = false;
    }
  };

  // ─── START CRON ───
  const startCron = async () => {
    setLoading(true);
    try {
      await fetch("/api/cloud-launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildStartBody("cron")),
      });
      setCronRunning(true);

      // Also trigger first run immediately (don't wait for Vercel cron)
      await triggerRun();
      await fetchStatus();

      // Keep client-side polling to trigger runs every 60s (backup for Vercel cron)
      if (edgeIntervalRef.current) clearInterval(edgeIntervalRef.current);
      edgeIntervalRef.current = setInterval(async () => {
        await triggerRun();
        await fetchStatus();
      }, 60000);
    } catch (e) {
      console.error("[v0] Start cron error:", e);
    }
    setLoading(false);
  };

  // ─── START EDGE ───
  const startEdge = async () => {
    setLoading(true);
    try {
      await fetch("/api/cloud-launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildStartBody("edge")),
      });
      setEdgeRunning(true);

      // Trigger first run immediately
      await triggerRun();
      await fetchStatus();

      // Client polls /run at the configured delay (fast mode)
      const delay = Math.max((parseInt(delaySeconds) || 60) * 1000, 15000);
      if (edgeIntervalRef.current) clearInterval(edgeIntervalRef.current);
      edgeIntervalRef.current = setInterval(async () => {
        // Check if still running
        try {
          const sr = await fetch(`/api/cloud-launch?id=${instanceId}`);
          const sd = await sr.json();
          if (!sd.config?.running) {
            setEdgeRunning(false);
            if (edgeIntervalRef.current) clearInterval(edgeIntervalRef.current);
            return;
          }
        } catch { return; }
        await triggerRun();
        await fetchStatus();
      }, delay);
    } catch (e) {
      console.error("[v0] Start edge error:", e);
    }
    setLoading(false);
  };

  // ─── STOP ───
  const stopCloud = async () => {
    setLoading(true);
    if (edgeIntervalRef.current) { clearInterval(edgeIntervalRef.current); edgeIntervalRef.current = null; }
    setCronRunning(false);
    setEdgeRunning(false);
    try {
      await fetch("/api/cloud-launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", instanceId }),
      });
      await fetchStatus();
    } catch (e) {
      console.error("[v0] Stop error:", e);
    }
    setLoading(false);
  };

  const clearCloud = async () => {
    if (edgeIntervalRef.current) { clearInterval(edgeIntervalRef.current); edgeIntervalRef.current = null; }
    setCronRunning(false);
    setEdgeRunning(false);
    await fetch("/api/cloud-launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear", instanceId }),
    });
    setConfig(null);
    setLogs([]);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (edgeIntervalRef.current) clearInterval(edgeIntervalRef.current);
    };
  }, []);

  const uptime = config?.startedAt ? Math.floor((Date.now() - config.startedAt) / 60000) : 0;

  return (
    <Card className="border-[#06B6D4]/30 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#06B6D4]/20 text-[#06B6D4]">
              <Cloud className="h-3.5 w-3.5" />
            </span>
            {instanceLabel}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {isAnythingRunning && (
              <Badge variant="outline" className="border-[#06B6D4]/40 text-[#06B6D4] animate-pulse text-[10px]">
                {cronRunning ? "CRON" : edgeRunning ? "EDGE" : "RUNNING"}
              </Badge>
            )}
            <button type="button" onClick={fetchStatus} className="text-muted-foreground hover:text-foreground p-1" title="Refresh">
              <RotateCw className="h-3 w-3" />
            </button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Background launching via Redis. Cron = every 60s (works offline). Edge = fast polling at your set delay.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Running status */}
        {config && (
          <div className="rounded-lg border border-border bg-secondary/50 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">Status</span>
              <span className={config.running ? "text-chart-3 font-medium" : "text-muted-foreground"}>
                {config.running ? "Running" : "Stopped"}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">Mode</span>
              <span className="text-card-foreground font-mono">{config.mode === "cron" ? "Vercel Cron" : "Edge + KV"}</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">Launched</span>
              <span className="text-card-foreground">{config.totalLaunched} / {config.maxLaunches}</span>
            </div>
            {config.running && (
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">Uptime</span>
                <span className="text-card-foreground">{uptime} min</span>
              </div>
            )}
            {config.lastRunAt && (
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">Last cycle</span>
                <span className="text-card-foreground font-mono text-[9px]">
                  {new Date(config.lastRunAt).toLocaleTimeString("en-US", { hour12: false })}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Config -- only when NOT running */}
        {!isAnythingRunning && (
          <>
            <div className="grid grid-cols-2 gap-2">
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

            <div className="flex gap-2">
              <div className="flex-1">
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

        {/* Controls -- 2 start buttons (one per mode) or stop */}
        <div className="flex gap-2">
          {!isAnythingRunning ? (
            <>
              <Button onClick={startCron} disabled={loading}
                className="flex-1 h-8 text-xs bg-[#06B6D4] text-[#000] hover:bg-[#06B6D4]/90 font-semibold"
              >
                <Timer className="mr-1 h-3 w-3" />
                {loading ? "Starting..." : "Start Cron"}
              </Button>
              <Button onClick={startEdge} disabled={loading}
                className="flex-1 h-8 text-xs bg-[#8B5CF6] text-[#fff] hover:bg-[#8B5CF6]/90 font-semibold"
              >
                <Zap className="mr-1 h-3 w-3" />
                {loading ? "Starting..." : "Start Edge"}
              </Button>
            </>
          ) : (
            <Button onClick={stopCloud} disabled={loading} variant="destructive" className="flex-1 h-8 text-xs">
              <Square className="mr-1.5 h-3 w-3" />
              {loading ? "Stopping..." : "Stop"}
            </Button>
          )}
          {!isAnythingRunning && config && (
            <Button variant="outline" onClick={clearCloud} className="h-8 text-xs bg-transparent">Clear</Button>
          )}
        </div>

        {/* Info */}
        <div className="rounded border border-border bg-secondary/30 p-2 text-[9px] text-muted-foreground space-y-0.5">
          <p><span className="font-medium text-[#06B6D4]">Cron:</span> Runs every 60s. Vercel triggers it + client backup poll. Works offline.</p>
          <p><span className="font-medium text-[#8B5CF6]">Edge:</span> Client triggers /run every {delaySeconds || 60}s. Faster but needs browser open.</p>
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
