"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Rocket,
  Copy,
  Check,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Key,
  ExternalLink,
  Send,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react";
import type { TokenPrefill } from "@/app/page";
import { addDeployedToken } from "@/components/deployed-tokens-box";

// ─── Platform definitions ─────────────────────────────────────
const DEFAULT_ADMIN = "0x9c6111C77CBE545B9703243F895EB593f2721C7a";

type LaunchpadId = "4claw" | "kibu" | "clawnch" | "molaunch" | "fourclaw_fun";
type AgentId = "moltx" | "moltbook" | "4claw_org" | "clawstr" | "direct_api";

interface LaunchpadInfo {
  label: string;
  chain: string;
  chains: string[];
  fee: string;
  rateLimit: string;
  agents: AgentId[];
  supportsTax: boolean;
  docUrl: string;
  color: string;
}

interface AgentInfo {
  label: string;
  note: string;
  autoRegister: boolean;
  needsKey: boolean;
  keyPlaceholder: string;
}

const LAUNCHPADS: Record<LaunchpadId, LaunchpadInfo> = {
  "4claw": {
    label: "4claw",
    chain: "bsc",
    chains: ["bsc"],
    fee: "0 BNB",
    rateLimit: "1/24h",
    agents: ["moltx", "moltbook"],
    supportsTax: true,
    docUrl: "https://4claw.fun/skill.md",
    color: "text-primary",
  },
  kibu: {
    label: "Kibu",
    chain: "bsc",
    chains: ["bsc", "base"],
    fee: "Free",
    rateLimit: "5/24h",
    agents: ["moltx", "moltbook", "4claw_org", "clawstr"],
    supportsTax: false,
    docUrl: "https://kibu.bot/skill-bsc.md",
    color: "text-chart-3",
  },
  clawnch: {
    label: "Clawnch",
    chain: "base",
    chains: ["base"],
    fee: "Free",
    rateLimit: "1/24h",
    agents: ["moltx", "moltbook", "4claw_org", "clawstr"],
    supportsTax: false,
    docUrl: "https://clawn.ch/skill",
    color: "text-[#0052FF]",
  },
  molaunch: {
    label: "Molaunch",
    chain: "solana",
    chains: ["solana"],
    fee: "Free",
    rateLimit: "1/24h",
    agents: ["moltx", "moltbook"],
    supportsTax: false,
    docUrl: "https://bags.fourclaw.fun/skill.md",
    color: "text-[#9945FF]",
  },
  fourclaw_fun: {
    label: "FourClaw.Fun",
    chain: "bsc",
    chains: ["bsc", "solana"],
    fee: "Free (20% platform)",
    rateLimit: "10/hour",
    agents: ["direct_api"],
    supportsTax: true,
    docUrl: "https://fourclaw.fun/api-skill.md",
    color: "text-[#F59E0B]",
  },
};

const AGENTS: Record<AgentId, AgentInfo> = {
  moltx: {
    label: "Moltx",
    note: "Auto-scanned",
    autoRegister: true,
    needsKey: false,
    keyPlaceholder: "moltx_sk_...",
  },
  moltbook: {
    label: "Moltbook",
    note: "API key needed",
    autoRegister: false,
    needsKey: true,
    keyPlaceholder: "moltbook_...",
  },
  "4claw_org": {
    label: "4claw.org",
    note: "Auto-scanned",
    autoRegister: true,
    needsKey: false,
    keyPlaceholder: "",
  },
  clawstr: {
    label: "Clawstr",
    note: "Nostr relays",
    autoRegister: true,
    needsKey: false,
    keyPlaceholder: "",
  },
  direct_api: {
    label: "Direct API",
    note: "No agent needed",
    autoRegister: false,
    needsKey: false,
    keyPlaceholder: "",
  },
};

// ─── Types ────────────────────────────────────────────────────
interface DeployResult {
  success: boolean;
  message: string;
  error?: string;
  postId?: string;
  postUrl?: string;
  autoScanned?: boolean;
  log?: string[];
  credentials?: {
    apiKey?: string;
    agentName?: string;
    evmWallet?: { address: string; privateKey: string };
  };
}

// ─── Component ────────────────────────────────────────────────
interface LaunchFormProps {
  prefill?: TokenPrefill | null;
}

export function LaunchForm({ prefill }: LaunchFormProps) {
  // Platform state
  const [launchpad, setLaunchpad] = useState<LaunchpadId>("4claw");
  const [agent, setAgent] = useState<AgentId>("moltx");
  const [tokenChain, setTokenChain] = useState("bsc");

  // Kibu sub-platform: flap (flap.sh default) or fourmeme (four.meme)
  const [kibuPlatform, setKibuPlatform] = useState<"flap" | "fourmeme">("flap");

  // Token form
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [useCustomWallet, setUseCustomWallet] = useState(false);
  const [customWallet, setCustomWallet] = useState("");
  const [enableTax, setEnableTax] = useState(false);
  const [tax, setTax] = useState(3);
  const [funds, setFunds] = useState(97);
  const [burn, setBurn] = useState(1);
  const [holders, setHolders] = useState(1);
  const [lp, setLp] = useState(1);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Moltbook key (only needed for Moltbook agent)
  const [moltbookKey, setMoltbookKey] = useState("");

  // AI desc + social suggest
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [isSuggestingTwitter, setIsSuggestingTwitter] = useState(false);
  const [isSuggestingWebsite, setIsSuggestingWebsite] = useState(false);

  async function handleSuggestSocial(field: "twitter" | "website") {
    if (!name.trim()) return;
    const setter = field === "twitter" ? setIsSuggestingTwitter : setIsSuggestingWebsite;
    setter(true);
    try {
      const res = await fetch("/api/suggest-socials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, symbol, field }),
      });
      const data = await res.json();
      if (data.value) {
        if (field === "twitter") setTwitter(data.value);
        else setWebsite(data.value);
      }
    } catch { /* ignore */ } finally {
      setter(false);
    }
  }

  // Deploy state
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deployLog, setDeployLog] = useState<string[]>([]);

  // Derived
  const lpInfo = LAUNCHPADS[launchpad];
  const agentInfo = AGENTS[agent];
  const activeWallet = useCustomWallet ? customWallet : DEFAULT_ADMIN;
  const taxDistTotal = funds + burn + holders + lp;
  const taxDistValid = taxDistTotal === 100;

  // Handle prefill from trending tokens -- auto-fill everything + auto-generate desc
  useEffect(() => {
    if (prefill) {
      setName(prefill.name);
      setSymbol(prefill.symbol);
      if (prefill.imageUrl) setImageUrl(prefill.imageUrl);
      if (prefill.website) {
        setWebsite(prefill.website);
        setShowAdvanced(true);
      }
      if (prefill.twitter) {
        setTwitter(prefill.twitter);
        setShowAdvanced(true);
      }
      // Auto-generate description via AI if not already provided
      if (prefill.description) {
        setDescription(prefill.description);
      } else if (prefill.name && prefill.symbol) {
        setIsGeneratingDesc(true);
        fetch("/api/generate-description", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: prefill.name, symbol: prefill.symbol }),
        })
          .then((r) => r.json())
          .then((d) => { if (d.description) setDescription(d.description); })
          .catch(() => {})
          .finally(() => setIsGeneratingDesc(false));
      }
    }
  }, [prefill]);

  // When launchpad changes, reset agent to first available
  function handleLaunchpadChange(id: LaunchpadId) {
    setLaunchpad(id);
    const available = LAUNCHPADS[id].agents;
    if (!available.includes(agent)) setAgent(available[0]);
    setTokenChain(LAUNCHPADS[id].chain);
    if (id !== "4claw" && id !== "fourclaw_fun") setEnableTax(false);
    setDeployResult(null);
  }

  function handleAgentChange(id: AgentId) {
    setAgent(id);
    setDeployResult(null);
  }

  // ── AI Description ──────────────────────────────────────────
  async function handleGenerateDesc() {
    if (!name.trim() || !symbol.trim()) return;
    setIsGeneratingDesc(true);
    try {
      const res = await fetch("/api/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, symbol }),
      });
      const data = await res.json();
      if (data.description) setDescription(data.description);
    } catch { /* ignore */ } finally {
      setIsGeneratingDesc(false);
    }
  }

  // ── Build preview ───────────────────────────────────────────
  const buildPreview = useCallback((): string => {
    // FourClaw.Fun uses direct JSON API
    if (launchpad === "fourclaw_fun") {
      const platform = tokenChain === "solana" ? "BAGS" : "FLAP";
      const obj: Record<string, unknown> = {
        platform,
        name,
        symbol: symbol.toUpperCase(),
        creatorWallet: activeWallet,
      };
      if (description) obj.description = description;
      if (imageUrl) obj.imageUrl = imageUrl;
      if (website) obj.website = website;
      if (twitter) obj.twitter = twitter;
      if (telegram) obj.telegram = telegram;
      if (platform === "FLAP" && enableTax) {
        obj.taxRate = tax * 100;
        obj.vaultType = "split";
      }
      return `POST https://fourclaw.fun/api/launch\n\n${JSON.stringify(obj, null, 2)}`;
    }
    const cmd = launchpad === "4claw" ? "!4clawd" : launchpad === "kibu" ? "!kibu" : launchpad === "molaunch" ? "!molaunch" : "!clawnch";
    let post = `${cmd}\nname: ${name}\nsymbol: ${symbol.toUpperCase()}\nwallet: ${activeWallet}`;
    if (description) post += `\ndescription: ${description}`;
    if (imageUrl) post += `\nimage: ${imageUrl}`;
    if (website) post += `\nwebsite: ${website}`;
    if (twitter) post += `\ntwitter: ${twitter}`;
    if (telegram && launchpad === "4claw") post += `\ntelegram: ${telegram}`;
    if (launchpad === "kibu" || launchpad === "clawnch") post += `\nchain: ${tokenChain}`;
    if (launchpad === "kibu" && kibuPlatform === "fourmeme") post += `\nplatform: fourmeme`;
    if (launchpad === "4claw" && enableTax && lpInfo.supportsTax)
      post += `\n\ntax: ${tax}\nfunds: ${funds}\nburn: ${burn}\nholders: ${holders}\nlp: ${lp}`;
    return post;
  }, [launchpad, name, symbol, activeWallet, description, imageUrl, website, twitter, telegram, tokenChain, enableTax, tax, funds, burn, holders, lp, lpInfo.supportsTax]);

  // ── DEPLOY ──────────────────────────────────────────────────
  async function handleDeploy() {
    setIsDeploying(true);
    setDeployResult(null);
    setDeployLog([]);

    // Show progressive log messages based on agent type
    const logMsgs: string[] = [];
    const pushLog = (msg: string) => {
      logMsgs.push(msg);
      setDeployLog([...logMsgs]);
    };

  if (launchpad === "fourclaw_fun") {
  pushLog(`Launching on FourClaw.Fun (${tokenChain === "solana" ? "BAGS" : "FLAP"})...`);
  pushLog("Calling direct API...");
  } else if (agentInfo.autoRegister) {
  pushLog(`Registering "${name}" agent on ${agentInfo.label}...`);
  if (agent === "moltx" || agent === "clawstr") {
  pushLog("Generating EVM wallet...");
  pushLog("Linking wallet via EIP-712...");
  pushLog("Engaging with Moltx feed...");
  }
  }
  if (launchpad !== "fourclaw_fun") {
    if (agent === "moltbook") {
      pushLog(`Posting to Moltbook...`);
    } else {
      pushLog(`Posting via ${agentInfo.label}...`);
    }
  }

    try {
      const res = await fetch("/api/deploy-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          launchpad,
          agent,
          existingApiKey: agent === "moltbook" ? moltbookKey : undefined,
          kibuPlatform: launchpad === "kibu" ? kibuPlatform : undefined,
          token: {
            name,
            symbol: symbol.toUpperCase(),
            wallet: activeWallet,
            description,
            image: imageUrl,
            website,
            twitter,
            telegram,
            chain: tokenChain,
            ...(launchpad === "4claw" && enableTax ? { tax, funds, burn, holders, lp } : {}),
            ...(launchpad === "fourclaw_fun" && enableTax ? { tax } : {}),
          },
        }),
      });

      const data = await res.json();
      if (data.log) setDeployLog(data.log);

      if (data.success) {
        addDeployedToken({
          name: data.tokenName || name,
          symbol: data.tokenSymbol || symbol.toUpperCase(),
          postUrl: data.postUrl,
          launchpad,
          agent,
          timestamp: Date.now(),
        });
        setDeployResult({
          success: true,
          message: data.message,
          postId: data.postId,
          postUrl: data.postUrl,
          autoScanned: data.autoScanned,
          log: data.log,
          credentials: data.credentials,
        });
      } else {
        setDeployResult({
          success: false,
          message: data.error || "Deploy failed",
          error: data.details ? String(data.details) : undefined,
          log: data.log,
          credentials: data.credentials,
        });
      }
    } catch {
      setDeployResult({ success: false, message: "Network error during deployment" });
    } finally {
      setIsDeploying(false);
    }
  }

  async function handleCopyContent() {
    await navigator.clipboard.writeText(buildPreview());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
  }

  // Can the user deploy?
  const canDeploy =
    name.trim() &&
    symbol.trim() &&
    (!enableTax || launchpad === "fourclaw_fun" || taxDistValid) &&
    (agent !== "moltbook" || moltbookKey.trim());

  // Is the form in deploy/result view?
  const showDeployView = isDeploying || deployResult;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Rocket className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-card-foreground">Launch Token</h2>
          <p className="text-xs text-muted-foreground">Choose platform, fill details, deploy</p>
        </div>
      </div>

      {/* ── Step 1: Launchpad ── */}
      <div className="mb-3">
        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
          1. Launchpad
        </Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {(Object.entries(LAUNCHPADS) as [LaunchpadId, LaunchpadInfo][]).map(([id, info]) => (
            <button
              key={id}
              type="button"
              onClick={() => handleLaunchpadChange(id)}
              disabled={!!showDeployView}
              className={`rounded-lg border px-3 py-2 text-left transition-all ${
                launchpad === id
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border bg-secondary hover:bg-secondary/80"
              }`}
            >
              <p className={`text-xs font-semibold ${launchpad === id ? info.color : "text-card-foreground"}`}>
                {info.label}
              </p>
              <p className="text-[9px] text-muted-foreground mt-0.5">
                {info.chains.map((c) => c.toUpperCase()).join(" / ")} | {info.fee}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Step 2: Agent ── */}
      <div className="mb-3">
        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
          2. Post via (Agent)
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {lpInfo.agents.map((agentId) => {
            const a = AGENTS[agentId];
            return (
              <button
                key={agentId}
                type="button"
                onClick={() => handleAgentChange(agentId)}
                disabled={!!showDeployView}
                className={`rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                  agent === agentId
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {a.label}
                <span className="ml-1 text-[9px] opacity-60">{a.note}</span>
              </button>
            );
          })}
        </div>
        {/* Agent info note */}
        <div className="mt-1.5 rounded-md bg-secondary/50 border border-border px-2.5 py-1.5">
          <p className="text-[9px] text-muted-foreground leading-relaxed">
            {agentInfo.autoRegister ? (
              <>
                <span className="font-medium text-chart-3">Auto-register:</span>{" "}
                Agent will be registered on <span className="font-semibold text-foreground">{agentInfo.label}</span> with your token name on deploy.
                {(agent === "moltx" || agent === "clawstr") && " EVM wallet will be generated and linked automatically (required by Moltx for posting)."}
                {agent === "4claw_org" && " No EVM wallet needed."}
              </>
            ) : (
              <>
                <span className="font-medium text-accent">Key required:</span>{" "}
                Enter your Moltbook API key below. Get one from{" "}
                <a href="https://www.moltbook.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  moltbook.com
                </a>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Chain selector (kibu bsc+base) */}
      {lpInfo.chains.length > 1 && (
        <div className="mb-3">
          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
            Chain
          </Label>
          <div className="flex gap-2">
            {lpInfo.chains.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setTokenChain(c)}
                disabled={!!showDeployView}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  tokenChain === c
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 3 (Kibu only): DEX Platform ── */}
      {launchpad === "kibu" && !showDeployView && (
        <div className="mb-3">
          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
            3. DEX Platform
          </Label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setKibuPlatform("flap")}
              className={`flex-1 rounded-lg border px-3 py-2 text-left transition-all ${
                kibuPlatform === "flap"
                  ? "border-chart-3 bg-chart-3/5 ring-1 ring-chart-3/20"
                  : "border-border bg-secondary hover:bg-secondary/80"
              }`}
            >
              <p className={`text-xs font-semibold ${kibuPlatform === "flap" ? "text-chart-3" : "text-card-foreground"}`}>
                Flap.sh
              </p>
              <p className="text-[9px] text-muted-foreground mt-0.5">
                Default | 3% tax | BSC/Base
              </p>
            </button>
            <button
              type="button"
              onClick={() => setKibuPlatform("fourmeme")}
              className={`flex-1 rounded-lg border px-3 py-2 text-left transition-all ${
                kibuPlatform === "fourmeme"
                  ? "border-accent bg-accent/5 ring-1 ring-accent/20"
                  : "border-border bg-secondary hover:bg-secondary/80"
              }`}
            >
              <p className={`text-xs font-semibold ${kibuPlatform === "fourmeme" ? "text-accent" : "text-card-foreground"}`}>
                Four.meme
              </p>
              <p className="text-[9px] text-muted-foreground mt-0.5">
                New | BSC | four.meme
              </p>
            </button>
          </div>
        </div>
      )}

      {/* Moltbook API key (required -- agent must be claimed first) */}
      {agent === "moltbook" && !showDeployView && (
        <div className="mb-3 space-y-1.5">
          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider block">
            Moltbook API Key <span className="text-destructive">*</span>
          </Label>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="moltbook_..."
              value={moltbookKey}
              onChange={(e) => setMoltbookKey(e.target.value)}
              className="bg-secondary border-border text-secondary-foreground placeholder:text-muted-foreground font-mono text-sm flex-1"
            />
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-secondary">
              <Key className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground">
            Get a key from{" "}
            <a href="https://www.moltbook.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">moltbook.com</a>
            {" "}-- register your agent, then claim it (verify email + tweet). Only claimed agents can post.
          </p>
        </div>
      )}

      {/* ═══════════════════════════════════════════════ */}
      {/* TOKEN DETAILS FORM (always visible unless deploying) */}
      {/* ═══════════════════════════════════════════════ */}
      {!showDeployView && (
        <div className="space-y-3 border-t border-border pt-3 mt-2">
          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider block">
            {launchpad === "kibu" ? "4" : "3"}. Token Details
          </Label>

          {/* Name & Symbol */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Token Name *</Label>
              <Input
                placeholder="My AI Token"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
                className="bg-secondary border-border text-secondary-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Symbol *</Label>
              <Input
                placeholder="MAI"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                maxLength={10}
                className="bg-secondary border-border text-secondary-foreground placeholder:text-muted-foreground font-mono"
              />
            </div>
          </div>

          {/* Admin Wallet */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Admin Wallet</Label>
              <button type="button" onClick={() => setUseCustomWallet(!useCustomWallet)} className="text-[9px] text-primary hover:underline">
                {useCustomWallet ? "Use default" : "Custom"}
              </button>
            </div>
            {useCustomWallet ? (
              <Input
                placeholder="0x..."
                value={customWallet}
                onChange={(e) => setCustomWallet(e.target.value)}
                className="bg-secondary border-border text-secondary-foreground placeholder:text-muted-foreground font-mono text-xs"
              />
            ) : (
              <div className="rounded-md bg-secondary/50 border border-border px-3 py-2">
                <code className="text-[10px] font-mono text-accent break-all">{DEFAULT_ADMIN}</code>
              </div>
            )}
          </div>

          {/* Description + AI */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateDesc}
                disabled={isGeneratingDesc || !name.trim() || !symbol.trim()}
                className="h-6 px-2 text-[9px] border-border bg-transparent text-muted-foreground hover:text-primary hover:border-primary/40"
              >
                {isGeneratingDesc ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Sparkles className="h-3 w-3 mr-1" />
                )}
                AI Generate
              </Button>
            </div>
            <Textarea
              placeholder="Describe your token..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={2}
              className="bg-secondary border-border text-secondary-foreground placeholder:text-muted-foreground resize-none text-sm"
            />
          </div>

          {/* Image URL */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Image URL</Label>
            <Input
              placeholder="https://your-host.com/image.png"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="bg-secondary border-border text-secondary-foreground placeholder:text-muted-foreground text-sm"
            />
          </div>

          {/* Socials toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Social Links
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] text-muted-foreground">Website</Label>
                  <button
                    type="button"
                    onClick={() => handleSuggestSocial("website")}
                    disabled={isSuggestingWebsite || !name.trim()}
                    className="flex items-center gap-0.5 text-[9px] text-muted-foreground hover:text-primary disabled:opacity-50"
                  >
                    {isSuggestingWebsite ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Sparkles className="h-2.5 w-2.5" />}
                    AI
                  </button>
                </div>
                <Input placeholder="https://..." value={website} onChange={(e) => setWebsite(e.target.value)} className="bg-secondary border-border text-secondary-foreground placeholder:text-muted-foreground text-xs" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] text-muted-foreground">Twitter</Label>
                  <button
                    type="button"
                    onClick={() => handleSuggestSocial("twitter")}
                    disabled={isSuggestingTwitter || !name.trim()}
                    className="flex items-center gap-0.5 text-[9px] text-muted-foreground hover:text-primary disabled:opacity-50"
                  >
                    {isSuggestingTwitter ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Sparkles className="h-2.5 w-2.5" />}
                    AI
                  </button>
                </div>
                <Input placeholder="@handle" value={twitter} onChange={(e) => setTwitter(e.target.value)} className="bg-secondary border-border text-secondary-foreground placeholder:text-muted-foreground text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Telegram</Label>
                <Input placeholder="t.me/group" value={telegram} onChange={(e) => setTelegram(e.target.value)} className="bg-secondary border-border text-secondary-foreground placeholder:text-muted-foreground text-xs" />
              </div>
            </div>
          )}

          {/* Tax Config (4claw only) */}
          {lpInfo.supportsTax && (
            <div className="rounded-lg border border-border bg-background p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-card-foreground">{launchpad === "fourclaw_fun" ? "FLAP Tax Config" : "V5 Tax Config"}</p>
                  <p className="text-[9px] text-muted-foreground">{launchpad === "fourclaw_fun" ? "Tax in BPS (1%=100, max 10%)" : "Buy/sell tax: 1-5%"}</p>
                </div>
                <Switch checked={enableTax} onCheckedChange={setEnableTax} />
              </div>
              {enableTax && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Tax Rate</Label>
                      <span className="text-xs font-mono font-bold text-primary">{tax}%</span>
                    </div>
                    <Slider value={[tax]} onValueChange={(v) => setTax(v[0])} min={1} max={5} step={1} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Funds %", value: funds, set: setFunds },
                      { label: "Burn %", value: burn, set: setBurn },
                      { label: "Holders %", value: holders, set: setHolders },
                      { label: "LP %", value: lp, set: setLp },
                    ].map((f) => (
                      <div key={f.label} className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">{f.label}</Label>
                        <Input type="number" value={f.value} onChange={(e) => f.set(Number(e.target.value))} min={0} max={100} className="bg-secondary border-border text-secondary-foreground font-mono text-xs" />
                      </div>
                    ))}
                  </div>
                  <div className={`text-[10px] font-mono ${taxDistValid ? "text-chart-3" : "text-destructive"}`}>
                    {!taxDistValid && <AlertCircle className="inline h-2.5 w-2.5 mr-1" />}
                    Distribution: {taxDistTotal}/100 {taxDistValid ? "(Valid)" : "(Must = 100)"}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Post Preview */}
          {name.trim() && symbol.trim() && (
            <div className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Post Preview</h3>
                <button
                  type="button"
                  onClick={handleCopyContent}
                  className="flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground hover:bg-secondary/80"
                >
                  {copied ? <><Check className="h-2.5 w-2.5" /> Copied</> : <><Copy className="h-2.5 w-2.5" /> Copy</>}
                </button>
              </div>
              <pre className="rounded-md bg-card border border-border p-2.5 text-[9px] font-mono text-foreground overflow-x-auto whitespace-pre-wrap leading-relaxed">
                {buildPreview()}
              </pre>
            </div>
          )}

          {/* Info banner */}
          <div className="rounded-md bg-accent/10 border border-accent/20 px-3 py-2">
            <p className="text-[9px] text-accent leading-relaxed">
              {launchpad === "fourclaw_fun"
                ? `Click Deploy to launch "${name || "your token"}" directly via FourClaw.Fun API on ${tokenChain === "solana" ? "Solana (BAGS)" : "BNB Chain (FLAP)"}. No agent needed.`
                : agentInfo.autoRegister
                  ? `Click Deploy to auto-register a "${name || "your token"}" agent on ${agentInfo.label}${(agent === "moltx" || agent === "clawstr") ? " (with EVM wallet)" : ""}, post the launch command via ${agentInfo.label}, and trigger ${lpInfo.label} deployment.`
                  : `Click Deploy to post the launch command to ${agentInfo.label} using your API key and trigger ${lpInfo.label} deployment.`
              }
              {" "}Cost: {lpInfo.fee}. Rate: {lpInfo.rateLimit}.
            </p>
          </div>

          {/* DEPLOY BUTTON */}
          <Button
            onClick={handleDeploy}
            disabled={!canDeploy}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold h-11 text-sm"
          >
            <Send className="mr-2 h-4 w-4" />
            {launchpad === "fourclaw_fun" ? `Deploy on ${tokenChain === "solana" ? "BAGS" : "FLAP"}` : `Deploy Token via ${agentInfo.label}`}
          </Button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════ */}
      {/* DEPLOYING / RESULT VIEW */}
      {/* ═══════════════════════════════════════════════ */}
      {showDeployView && (
        <div className="space-y-3 border-t border-border pt-3 mt-2">
          {/* Progress log */}
          {isDeploying && (
            <div className="flex flex-col items-center gap-4 py-6">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm font-medium text-card-foreground">Deploying {name}...</p>
              <div className="w-full space-y-1.5">
                {deployLog.map((msg, i) => (
                  <div key={`log-${i}`} className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    {i < deployLog.length - 1 ? (
                      <CheckCircle2 className="h-2.5 w-2.5 text-chart-3 shrink-0" />
                    ) : (
                      <Loader2 className="h-2.5 w-2.5 animate-spin shrink-0" />
                    )}
                    {msg}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deploy result */}
          {deployResult && !isDeploying && (
            <div className="space-y-3">
              {/* Status icon */}
              <div className={`flex flex-col items-center gap-2 py-4 ${deployResult.success ? "text-chart-3" : "text-destructive"}`}>
                {deployResult.success ? <CheckCircle2 className="h-8 w-8" /> : <XCircle className="h-8 w-8" />}
                <p className="text-sm font-semibold text-center">
                  {deployResult.success ? "Token Launch Initiated!" : "Deploy Failed"}
                </p>
              </div>

              {/* Message */}
              <div className={`rounded-lg border p-3 ${deployResult.success ? "border-chart-3/30 bg-chart-3/5" : "border-destructive/30 bg-destructive/5"}`}>
                <p className={`text-[10px] leading-relaxed ${deployResult.success ? "text-chart-3" : "text-destructive"}`}>
                  {deployResult.message}
                </p>
                {deployResult.postUrl && (
                  <a
                    href={deployResult.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                  >
                    <ExternalLink className="h-2.5 w-2.5" /> View post
                  </a>
                )}
              </div>

              {/* Deploy log */}
              {deployResult.log && deployResult.log.length > 0 && (
                <div className="rounded-md bg-background border border-border px-3 py-2 space-y-1">
                  {deployResult.log.map((entry, i) => (
                    <div key={`rlog-${i}`} className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                      <CheckCircle2 className="h-2 w-2 text-chart-3 shrink-0" />
                      {entry}
                    </div>
                  ))}
                </div>
              )}

              {/* Credentials (if agent was auto-registered) */}
              {deployResult.credentials?.apiKey && (
                <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 space-y-2">
                  <p className="text-[10px] font-semibold text-accent">Auto-Registered Agent Credentials</p>
                  <div className="space-y-1.5">
                    {deployResult.credentials.agentName && (
                      <div>
                        <span className="text-[9px] text-muted-foreground">Agent: </span>
                        <code className="text-[9px] font-mono text-foreground">{deployResult.credentials.agentName}</code>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">API Key</span>
                      <button type="button" onClick={() => copyText(deployResult.credentials?.apiKey || "")} className="text-[9px] text-primary hover:underline">Copy</button>
                    </div>
                    <code className="block rounded bg-background border border-border px-2 py-1.5 text-[9px] font-mono text-accent break-all select-all">
                      {deployResult.credentials.apiKey}
                    </code>
                  </div>

                  {deployResult.credentials.evmWallet && (
                    <div className="space-y-1.5 pt-1 border-t border-border">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">EVM Wallet</span>
                        <button type="button" onClick={() => copyText(deployResult.credentials?.evmWallet?.address || "")} className="text-[9px] text-primary hover:underline">Copy</button>
                      </div>
                      <code className="block rounded bg-background border border-border px-2 py-1.5 text-[9px] font-mono text-foreground break-all select-all">
                        {deployResult.credentials.evmWallet.address}
                      </code>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">Private Key</span>
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={() => setShowPrivateKey(!showPrivateKey)} className="text-muted-foreground hover:text-foreground">
                            {showPrivateKey ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
                          </button>
                          <button type="button" onClick={() => copyText(deployResult.credentials?.evmWallet?.privateKey || "")} className="text-[9px] text-primary hover:underline">Copy</button>
                        </div>
                      </div>
                      <code className="block rounded bg-background border border-border px-2 py-1.5 text-[9px] font-mono text-foreground break-all select-all">
                        {showPrivateKey ? deployResult.credentials.evmWallet.privateKey : "x".repeat(40)}
                      </code>
                    </div>
                  )}

                  <div className="rounded-md bg-destructive/10 border border-destructive/20 px-2 py-1.5">
                    <p className="text-[8px] text-destructive font-medium leading-relaxed">
                      SAVE THESE CREDENTIALS. They cannot be retrieved again.
                    </p>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDeployResult(null);
                    setDeployLog([]);
                    setName("");
                    setSymbol("");
                    setDescription("");
                    setImageUrl("");
                  }}
                  className="flex-1 bg-transparent"
                >
                  Launch Another
                </Button>
                {!deployResult.success && (
                  <Button
                    onClick={() => {
                      setDeployResult(null);
                      setDeployLog([]);
                    }}
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Retry
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
