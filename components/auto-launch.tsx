"use client";

import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { addDeployedToken } from "@/components/deployed-tokens-box";

const DEFAULT_ADMIN = "0x9c6111C77CBE545B9703243F895EB593f2721C7a";

type Launchpad = "4claw" | "kibu" | "clawnch" | "molaunch";
type Agent = "moltx" | "4claw_org" | "moltbook" | "clawstr";

interface AutoToken {
  name: string;
  symbol: string;
  imageUrl?: string;
  website?: string;
  description?: string;
  volume24h?: string;
  chain: string;
  source: string;
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
];

const AGENT_OPTIONS: { id: Agent; label: string }[] = [
  { id: "4claw_org", label: "4claw.org" },
  { id: "moltx", label: "Moltx" },
  { id: "clawstr", label: "Clawstr" },
];

export function AutoLaunchPanel() {
  const [running, setRunning] = useState(false);
  const [launchpad, setLaunchpad] = useState<Launchpad>("kibu");
  const [agent, setAgent] = useState<Agent>("4claw_org");
  const [chain, setChain] = useState("bsc");
  const [minVolume, setMinVolume] = useState("100");
  const [delaySeconds, setDelaySeconds] = useState("30");
  const [maxLaunches, setMaxLaunches] = useState("10");
  const [useCustomWallet, setUseCustomWallet] = useState(false);
  const [customWallet, setCustomWallet] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState({ launched: 0, skipped: 0, errors: 0 });
  const [launched, setLaunched] = useState<Set<string>>(new Set());
  const abortRef = useRef(false);
  const sourceRef = useRef(0);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const activeWallet = useCustomWallet && customWallet.trim() ? customWallet.trim() : DEFAULT_ADMIN;

  // Only scroll within the log container, NOT the page
  const addLog = useCallback((msg: string, type: LogEntry["type"] = "info") => {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs((prev) => {
      const next = [...prev, { time, msg, type }];
      return next.length > 200 ? next.slice(-200) : next;
    });
    // Scroll within log container only (block: "nearest" prevents page scroll)
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  }, []);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const generateDesc = async (name: string, symbol: string): Promise<string> => {
    try {
      const r = await fetch("/api/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, symbol }),
      });
      const d = await r.json();
      return d.description || `$${symbol} - ${name} token. Community-driven memecoin.`;
    } catch {
      return `$${symbol} - ${name} token. Community-driven memecoin. DYOR.`;
    }
  };

  const deployToken = async (token: AutoToken): Promise<boolean> => {
    const desc = token.description || (await generateDesc(token.name, token.symbol));

    const body = {
      launchpad,
      agent,
      token: {
        name: token.name,
        symbol: token.symbol.toUpperCase(),
        wallet: activeWallet,
        description: desc,
        // Pass the actual token image (each token has its own from the API)
        image: token.imageUrl || "",
        website: token.website || "",
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
      addLog(`Deployed ${token.symbol}! Post: ${data.postUrl || data.postId}`, "success");
      addDeployedToken({
        name: token.name,
        symbol: token.symbol.toUpperCase(),
        postUrl: data.postUrl,
        launchpad,
        agent,
        timestamp: Date.now(),
      });
      return true;
    }
    addLog(`Deploy failed for ${token.symbol}: ${data.error}`, "error");
    return false;
  };

  const startAutoLaunch = async () => {
    abortRef.current = false;
    setRunning(true);
    setLogs([]);
    setStats({ launched: 0, skipped: 0, errors: 0 });
    const launchedSet = new Set(launched);
    const max = Number.parseInt(maxLaunches, 10) || 10;
    const delay = (Number.parseInt(delaySeconds, 10) || 30) * 1000;
    const vol = Number.parseFloat(minVolume) || 0;
    let totalLaunched = 0;

    addLog(`Auto-launch started: ${LP_OPTIONS.find((l) => l.id === launchpad)?.label} via ${AGENT_OPTIONS.find((a) => a.id === agent)?.label} | Chain: ${chain} | Max: ${max} | Wallet: ${activeWallet.substring(0, 8)}...`);

    while (!abortRef.current && totalLaunched < max) {
      addLog(`Fetching tokens (source #${sourceRef.current + 1})...`);
      try {
        const r = await fetch(`/api/auto-launch/fetch-tokens?sourceIndex=${sourceRef.current}&minVolume=${vol}`);
        const data = await r.json();
        sourceRef.current = data.nextSourceIndex || 0;
        addLog(`Source: ${data.source} | Found ${data.tokens?.length || 0} tokens`);

        const tokens: AutoToken[] = data.tokens || [];
        if (tokens.length === 0) {
          addLog("No tokens found from this source, rotating...", "skip");
          await sleep(5000);
          continue;
        }

        for (const token of tokens) {
          if (abortRef.current || totalLaunched >= max) break;

          const key = `${token.symbol}_${token.name}`.toLowerCase();
          if (launchedSet.has(key)) {
            addLog(`Skip ${token.symbol} (already launched)`, "skip");
            setStats((p) => ({ ...p, skipped: p.skipped + 1 }));
            continue;
          }

          // Filter: only pick tokens whose chain matches selected chain
          if (token.chain !== chain && token.chain !== "solana") {
            continue;
          }

          // Log image info for debugging
          const hasImage = token.imageUrl && token.imageUrl.startsWith("http");
          addLog(
            `Launching: ${token.name} ($${token.symbol}) | Vol: $${Number(token.volume24h || 0).toLocaleString()}${hasImage ? " | Has image" : " | No image"}`,
          );

          try {
            const ok = await deployToken(token);
            if (ok) {
              totalLaunched++;
              launchedSet.add(key);
              setLaunched(new Set(launchedSet));
              setStats((p) => ({ ...p, launched: p.launched + 1 }));
            } else {
              setStats((p) => ({ ...p, errors: p.errors + 1 }));
            }
          } catch (e) {
            addLog(`Error on ${token.symbol}: ${String(e)}`, "error");
            setStats((p) => ({ ...p, errors: p.errors + 1 }));
          }

          if (!abortRef.current && totalLaunched < max) {
            addLog(`Waiting ${delaySeconds}s before next...`);
            await sleep(delay);
          }
        }
      } catch (e) {
        addLog(`Fetch error: ${String(e)} -- retrying in 10s`, "error");
        await sleep(10000);
      }
    }

    addLog(
      abortRef.current
        ? `Stopped by user. Launched: ${totalLaunched}`
        : `Auto-launch complete! Launched: ${totalLaunched}/${max}`,
      "success",
    );
    setRunning(false);
  };

  const stopAutoLaunch = () => {
    abortRef.current = true;
    addLog("Stopping after current token...", "info");
  };

  const selectedLp = LP_OPTIONS.find((l) => l.id === launchpad);

  return (
    <Card className="border-accent/30 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/20 text-accent text-xs">
              {">>"}
            </span>
            Auto-Launch
          </CardTitle>
          {running && (
            <Badge variant="outline" className="border-chart-3/40 text-chart-3 animate-pulse text-[10px]">
              RUNNING
            </Badge>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">
          Fetch new tokens, copy details, auto-register agent, deploy, and loop.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Config */}
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
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label htmlFor="auto-vol" className="text-[10px] text-muted-foreground mb-1 block">
              Min Vol ($)
            </Label>
            <Input
              id="auto-vol"
              value={minVolume}
              onChange={(e) => setMinVolume(e.target.value)}
              disabled={running}
              className="h-7 text-xs bg-secondary border-border"
              placeholder="100"
            />
          </div>
          <div>
            <Label htmlFor="auto-delay" className="text-[10px] text-muted-foreground mb-1 block">
              Delay (sec)
            </Label>
            <Input
              id="auto-delay"
              value={delaySeconds}
              onChange={(e) => setDelaySeconds(e.target.value)}
              disabled={running}
              className="h-7 text-xs bg-secondary border-border"
              placeholder="30"
            />
          </div>
          <div>
            <Label htmlFor="auto-max" className="text-[10px] text-muted-foreground mb-1 block">
              Max Tokens
            </Label>
            <Input
              id="auto-max"
              value={maxLaunches}
              onChange={(e) => setMaxLaunches(e.target.value)}
              disabled={running}
              className="h-7 text-xs bg-secondary border-border"
              placeholder="10"
            />
          </div>
        </div>

        {/* Admin wallet with custom option */}
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

        {/* Controls */}
        <div className="flex gap-2">
          {!running ? (
            <Button
              onClick={startAutoLaunch}
              className="flex-1 h-8 text-xs bg-accent text-accent-foreground hover:bg-accent/90"
            >
              Start Auto-Launch
            </Button>
          ) : (
            <Button
              onClick={stopAutoLaunch}
              variant="destructive"
              className="flex-1 h-8 text-xs"
            >
              Stop
            </Button>
          )}
          {!running && logs.length > 0 && (
            <Button
              variant="outline"
              onClick={() => { setLogs([]); setStats({ launched: 0, skipped: 0, errors: 0 }); }}
              className="h-8 text-xs bg-transparent"
            >
              Clear
            </Button>
          )}
        </div>

        {/* Log -- scroll stays WITHIN this container, no page pull */}
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
