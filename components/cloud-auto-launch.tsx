"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Cloud, Zap, Timer, Square, RotateCw } from "lucide-react";

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

export function CloudAutoLaunch() {
  const [mode, setMode] = useState<Mode>("cron");
  const [launchpad, setLaunchpad] = useState<Launchpad>("kibu");
  const [agent, setAgent] = useState<Agent>("4claw_org");
  const [chain, setChain] = useState("bsc");
  const [delaySeconds, setDelaySeconds] = useState("60");
  const [maxLaunches, setMaxLaunches] = useState("50");
  const [useCustomWallet, setUseCustomWallet] = useState(false);
  const [customWallet, setCustomWallet] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [config, setConfig] = useState<CloudConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const edgePollRef = useRef(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const activeWallet = useCustomWallet && customWallet.trim() ? customWallet.trim() : DEFAULT_ADMIN;
  const selectedLp = LP_OPTIONS.find((l) => l.id === launchpad);
  const isRunning = config?.running === true;

  // Fetch status + logs from Redis
  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/cloud-launch");
      const d = await r.json();
      if (d.config) setConfig(d.config);
      if (d.logs) setLogs(d.logs.reverse()); // lpush stores newest first
    } catch { /* ignore */ }
  }, []);

  // Poll status every 5s when running
  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchStatus]);

  // Edge mode: keep re-triggering the edge-poll endpoint
  const runEdgePoll = useCallback(async () => {
    edgePollRef.current = true;
    while (edgePollRef.current) {
      try {
        await fetch("/api/cloud-launch/edge-poll", { signal: AbortSignal.timeout(65000) });
      } catch { /* timeout is expected after 60s */ }
      // Check if still running before re-triggering
      try {
        const r = await fetch("/api/cloud-launch");
        const d = await r.json();
        if (!d.config?.running || d.config.mode !== "edge") {
          edgePollRef.current = false;
          break;
        }
      } catch { break; }
    }
  }, []);

  const startCloud = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/cloud-launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          mode,
          launchpad,
          agent: launchpad === "fourclaw_fun" ? "direct_api" : agent,
          chain,
          wallet: activeWallet,
          source: chain,
          delaySeconds: parseInt(delaySeconds) || 60,
          maxLaunches: parseInt(maxLaunches) || 50,
        }),
      });
      const d = await r.json();
      if (d.config) setConfig(d.config);

      // If edge mode, start the edge polling loop
      if (mode === "edge") {
        runEdgePoll();
      }

      await fetchStatus();
    } catch (e) {
      console.error("Start cloud error:", e);
    }
    setLoading(false);
  };

  const stopCloud = async () => {
    setLoading(true);
    edgePollRef.current = false;
    try {
      await fetch("/api/cloud-launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      await fetchStatus();
    } catch (e) {
      console.error("Stop cloud error:", e);
    }
    setLoading(false);
  };

  const clearCloud = async () => {
    edgePollRef.current = false;
    await fetch("/api/cloud-launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear" }),
    });
    setConfig(null);
    setLogs([]);
  };

  const uptime = config?.startedAt
    ? Math.floor((Date.now() - config.startedAt) / 60000)
    : 0;

  return (
    <Card className="border-[#06B6D4]/30 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#06B6D4]/20 text-[#06B6D4]">
              <Cloud className="h-3.5 w-3.5" />
            </span>
            Cloud Auto-Launch
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {isRunning && (
              <Badge variant="outline" className="border-[#06B6D4]/40 text-[#06B6D4] animate-pulse text-[10px]">
                CLOUD RUNNING
              </Badge>
            )}
            <button type="button" onClick={fetchStatus} className="text-muted-foreground hover:text-foreground p-1" title="Refresh">
              <RotateCw className="h-3 w-3" />
            </button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Runs in background even if your browser is closed. Choose Cron (every 1 min) or Edge (continuous 60s sessions).
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Mode selector */}
        <div>
          <Label className="text-[10px] text-muted-foreground mb-1 block">Cloud Mode</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("cron")}
              disabled={isRunning}
              className={`flex items-center gap-2 rounded-lg border p-2.5 text-left transition-all ${
                mode === "cron"
                  ? "border-[#06B6D4]/50 bg-[#06B6D4]/10"
                  : "border-border bg-secondary hover:border-border/80"
              } disabled:opacity-50`}
            >
              <Timer className={`h-4 w-4 ${mode === "cron" ? "text-[#06B6D4]" : "text-muted-foreground"}`} />
              <div>
                <p className={`text-[11px] font-medium ${mode === "cron" ? "text-[#06B6D4]" : "text-card-foreground"}`}>Vercel Cron</p>
                <p className="text-[9px] text-muted-foreground">Runs every 1 min. Works forever even offline.</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMode("edge")}
              disabled={isRunning}
              className={`flex items-center gap-2 rounded-lg border p-2.5 text-left transition-all ${
                mode === "edge"
                  ? "border-[#06B6D4]/50 bg-[#06B6D4]/10"
                  : "border-border bg-secondary hover:border-border/80"
              } disabled:opacity-50`}
            >
              <Zap className={`h-4 w-4 ${mode === "edge" ? "text-[#06B6D4]" : "text-muted-foreground"}`} />
              <div>
                <p className={`text-[11px] font-medium ${mode === "edge" ? "text-[#06B6D4]" : "text-card-foreground"}`}>Edge + KV</p>
                <p className="text-[9px] text-muted-foreground">60s sessions, auto-retriggers. Browser polls state.</p>
              </div>
            </button>
          </div>
        </div>

        {/* Running status */}
        {config && (
          <div className="rounded-lg border border-border bg-secondary/50 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">Status</span>
              <span className={isRunning ? "text-chart-3 font-medium" : "text-muted-foreground"}>
                {isRunning ? "Running" : "Stopped"}
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
            {isRunning && (
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">Uptime</span>
                <span className="text-card-foreground">{uptime} min</span>
              </div>
            )}
            {config.lastRunAt && (
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">Last run</span>
                <span className="text-card-foreground font-mono text-[9px]">
                  {new Date(config.lastRunAt).toLocaleTimeString("en-US", { hour12: false })}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Config -- only show when NOT running */}
        {!isRunning && (
          <>
            {/* Launchpad + Agent */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground mb-1 block">Launchpad</Label>
                <div className="flex flex-wrap gap-1">
                  {LP_OPTIONS.map((lp) => (
                    <button
                      key={lp.id} type="button"
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
                    <button
                      key={ag.id} type="button" onClick={() => setAgent(ag.id)}
                      className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                        agent === ag.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      }`}
                    >{ag.label}</button>
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
                    key={c} type="button" onClick={() => setChain(c)}
                    className={`rounded px-3 py-1 text-[10px] font-medium uppercase transition-colors ${
                      chain === c ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    }`}
                  >{c}</button>
                ))}
              </div>
            </div>

            {/* Params */}
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

            {/* Wallet */}
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
        <div className="flex gap-2">
          {!isRunning ? (
            <Button
              onClick={startCloud}
              disabled={loading}
              className="flex-1 h-8 text-xs bg-[#06B6D4] text-[#000] hover:bg-[#06B6D4]/90 font-semibold"
            >
              <Cloud className="mr-1.5 h-3 w-3" />
              {loading ? "Starting..." : `Start Cloud (${mode === "cron" ? "Cron" : "Edge"})`}
            </Button>
          ) : (
            <Button onClick={stopCloud} disabled={loading} variant="destructive" className="flex-1 h-8 text-xs">
              <Square className="mr-1.5 h-3 w-3" />
              {loading ? "Stopping..." : "Stop Cloud"}
            </Button>
          )}
          {!isRunning && config && (
            <Button variant="outline" onClick={clearCloud} className="h-8 text-xs bg-transparent">Clear</Button>
          )}
        </div>

        {/* Info box */}
        <div className="rounded border border-[#06B6D4]/20 bg-[#06B6D4]/5 p-2 text-[9px] text-muted-foreground space-y-0.5">
          {mode === "cron" ? (
            <>
              <p className="font-medium text-[#06B6D4]">Vercel Cron Mode</p>
              <p>Runs every 1 minute via Vercel scheduled function. Deploys 1 token per cycle.</p>
              <p>Works even if your browser is closed or internet is off. Runs until max tokens or you stop it.</p>
            </>
          ) : (
            <>
              <p className="font-medium text-[#06B6D4]">Edge + KV Mode</p>
              <p>Edge function runs for 60 seconds, deploys tokens at your set delay, then auto-retriggers.</p>
              <p>Browser keeps polling status. If browser closes, current 60s session finishes then stops.</p>
            </>
          )}
        </div>

        {/* Cloud logs */}
        {logs.length > 0 && (
          <div className="max-h-48 overflow-y-auto rounded bg-background/80 border border-border p-2 font-mono text-[9px] space-y-0.5">
            {logs.map((l, i) => (
              <div
                key={`${l.time}-${i}`}
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
