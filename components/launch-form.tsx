"use client";

import { useState, useCallback } from "react";
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
  Zap,
  ExternalLink,
  Send,
  CheckCircle2,
  XCircle,
  Shield,
  Wallet,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react";

// ─── Platform definitions ─────────────────────────────────────
const DEFAULT_ADMIN = "0x9c6111C77CBE545B9703243F895EB593f2721C7a";

type LaunchpadId = "4claw" | "kibu" | "clawnch";
type AgentId = "moltx" | "moltbook" | "4claw_org" | "clawstr";

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
  url: string;
  note: string;
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
};

const AGENTS: Record<AgentId, AgentInfo> = {
  moltx: { label: "Moltx", url: "https://moltx.io", note: "Auto-scanned" },
  moltbook: {
    label: "Moltbook",
    url: "https://www.moltbook.com",
    note: "API trigger",
  },
  "4claw_org": {
    label: "4claw.org",
    url: "https://www.4claw.org",
    note: "Auto-scanned",
  },
  clawstr: {
    label: "Clawstr",
    url: "https://clawstr.com",
    note: "Nostr relays",
  },
};

// ─── Types ────────────────────────────────────────────────────
type Step = "setup" | "form" | "review" | "posting";

interface WalletInfo {
  address: string;
  privateKey: string;
}

interface SetupResult {
  success: boolean;
  partial?: boolean;
  message: string;
  apiKey?: string;
  wallet?: WalletInfo;
  log?: string[];
}

interface PostResult {
  success: boolean;
  message: string;
  postId?: string;
  autoScanned?: boolean;
}

// ─── Component ────────────────────────────────────────────────
interface LaunchFormProps {
  prefillName?: string;
  prefillSymbol?: string;
}

export function LaunchForm({ prefillName, prefillSymbol }: LaunchFormProps) {
  // Platform state
  const [launchpad, setLaunchpad] = useState<LaunchpadId>("4claw");
  const [agent, setAgent] = useState<AgentId>("moltx");
  const [tokenChain, setTokenChain] = useState("bsc");

  // Setup state
  const [currentStep, setCurrentStep] = useState<Step>("setup");
  const [apiKey, setApiKey] = useState("");
  const [agentWallet, setAgentWallet] = useState<WalletInfo | null>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupResult, setSetupResult] = useState<SetupResult | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [setupMode, setSetupMode] = useState<"auto" | "existing">("auto");

  // Token form state
  const [name, setName] = useState(prefillName || "");
  const [symbol, setSymbol] = useState(prefillSymbol || "");
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

  // AI desc state
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);

  // Posting state
  const [isPosting, setIsPosting] = useState(false);
  const [postResult, setPostResult] = useState<PostResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Derived
  const lpInfo = LAUNCHPADS[launchpad];
  const activeWallet = useCustomWallet ? customWallet : DEFAULT_ADMIN;
  const taxDistTotal = funds + burn + holders + lp;
  const taxDistValid = taxDistTotal === 100;

  // Update prefills
  if (prefillName && prefillName !== name && currentStep === "setup") {
    setName(prefillName);
  }
  if (prefillSymbol && prefillSymbol !== symbol && currentStep === "setup") {
    setSymbol(prefillSymbol);
  }

  // When launchpad changes, reset agent to first available
  function handleLaunchpadChange(lp: LaunchpadId) {
    setLaunchpad(lp);
    const availableAgents = LAUNCHPADS[lp].agents;
    if (!availableAgents.includes(agent)) {
      setAgent(availableAgents[0]);
    }
    setTokenChain(LAUNCHPADS[lp].chain);
    // Reset tax for non-4claw
    if (lp !== "4claw") setEnableTax(false);
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
    } catch {
      // ignore
    } finally {
      setIsGeneratingDesc(false);
    }
  }

  // ── Auto-setup ──────────────────────────────────────────────
  async function handleAutoSetup() {
    const agentHandle = name.trim()
      ? name.trim().toLowerCase().replace(/[^a-z0-9]/g, "_")
      : "token_agent";
    setIsSettingUp(true);
    setSetupResult(null);
    try {
      const res = await fetch("/api/moltx/auto-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentName: `${agentHandle}_${Date.now().toString(36)}`,
          displayName: name.trim() || "Token Agent",
          description: `Token launcher for ${symbol || "tokens"} via ${lpInfo.label}`,
          chainId: tokenChain === "bsc" ? 56 : 8453,
        }),
      });
      const data: SetupResult = await res.json();
      if (data.success || data.apiKey) {
        if (data.apiKey) setApiKey(data.apiKey);
        if (data.wallet) setAgentWallet(data.wallet);
        setSetupResult(data);
      } else {
        setSetupResult({
          success: false,
          message:
            data.message ||
            (data as Record<string, unknown>).error?.toString() ||
            "Setup failed",
          log: data.log,
        });
      }
    } catch {
      setSetupResult({ success: false, message: "Network error during setup" });
    } finally {
      setIsSettingUp(false);
    }
  }

  // ── Post token ──────────────────────────────────────────────
  const buildPreviewContent = useCallback((): string => {
    const lp = LAUNCHPADS[launchpad];
    const cmd =
      launchpad === "4claw"
        ? "!4clawd"
        : launchpad === "kibu"
          ? "!kibu"
          : "!clawnch";

    let post = `${cmd}\nname: ${name}\nsymbol: ${symbol.toUpperCase()}\nwallet: ${activeWallet}`;
    if (description) post += `\ndescription: ${description}`;
    if (imageUrl) post += `\nimage: ${imageUrl}`;
    if (website) post += `\nwebsite: ${website}`;
    if (twitter) post += `\ntwitter: ${twitter}`;
    if (telegram && launchpad === "4claw") post += `\ntelegram: ${telegram}`;
    if (launchpad === "kibu" || launchpad === "clawnch")
      post += `\nchain: ${tokenChain}`;
    if (launchpad === "4claw" && enableTax && lp.supportsTax)
      post += `\n\ntax: ${tax}\nfunds: ${funds}\nburn: ${burn}\nholders: ${holders}\nlp: ${lp}`;
    return post;
  }, [
    launchpad,
    name,
    symbol,
    activeWallet,
    description,
    imageUrl,
    website,
    twitter,
    telegram,
    tokenChain,
    enableTax,
    tax,
    funds,
    burn,
    holders,
    lp,
  ]);

  async function handlePost() {
    setCurrentStep("posting");
    setIsPosting(true);
    setPostResult(null);

    try {
      const res = await fetch("/api/post-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          launchpad,
          agent,
          apiKey,
          moltbookSubmolt:
            agent === "moltbook"
              ? launchpad === "kibu"
                ? "kibu"
                : launchpad === "clawnch"
                  ? "clawnch"
                  : undefined
              : undefined,
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
            ...(launchpad === "4claw" && enableTax
              ? { tax, funds, burn, holders, lp }
              : {}),
          },
        }),
      });

      const data = await res.json();
      if (data.success) {
        setPostResult({
          success: true,
          message: data.message,
          postId: data.postId,
          autoScanned: data.autoScanned,
        });
      } else {
        setPostResult({
          success: false,
          message: data.error || "Failed to post",
        });
      }
    } catch {
      setPostResult({ success: false, message: "Network error while posting" });
    } finally {
      setIsPosting(false);
    }
  }

  async function handleCopyContent() {
    await navigator.clipboard.writeText(buildPreviewContent());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
  }

  // ─── Steps ──────────────────────────────────────────────────
  const steps = [
    { key: "setup", label: "Connect" },
    { key: "form", label: "Token" },
    { key: "review", label: "Review" },
    { key: "posting", label: "Launch" },
  ] as const;
  const currentStepIndex = steps.findIndex((s) => s.key === currentStep);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Rocket className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-card-foreground">
            Launch Token
          </h2>
          <p className="text-xs text-muted-foreground">
            Multi-platform token deployment
          </p>
        </div>
      </div>

      {/* ── Launchpad Selector ── */}
      <div className="mb-3">
        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
          Launchpad
        </Label>
        <div className="grid grid-cols-3 gap-2">
          {(Object.entries(LAUNCHPADS) as [LaunchpadId, LaunchpadInfo][]).map(
            ([id, info]) => (
              <button
                key={id}
                type="button"
                onClick={() => handleLaunchpadChange(id)}
                className={`rounded-lg border px-3 py-2 text-left transition-all ${
                  launchpad === id
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border bg-secondary hover:bg-secondary/80"
                }`}
              >
                <p
                  className={`text-xs font-semibold ${launchpad === id ? info.color : "text-card-foreground"}`}
                >
                  {info.label}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  {info.chains.map((c) => c.toUpperCase()).join(" / ")} |{" "}
                  {info.fee}
                </p>
              </button>
            )
          )}
        </div>
      </div>

      {/* ── Agent Selector ── */}
      <div className="mb-4">
        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
          Post via
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {lpInfo.agents.map((agentId) => {
            const a = AGENTS[agentId];
            return (
              <button
                key={agentId}
                type="button"
                onClick={() => setAgent(agentId)}
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
      </div>

      {/* ── Chain selector (kibu supports bsc + base) ── */}
      {lpInfo.chains.length > 1 && (
        <div className="mb-4">
          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
            Chain
          </Label>
          <div className="flex gap-2">
            {lpInfo.chains.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setTokenChain(c)}
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

      {/* Step Indicator */}
      <div className="mb-5 flex items-center gap-1">
        {steps.map((s, i) => (
          <div key={s.key} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`h-1.5 w-full rounded-full transition-colors ${
                i <= currentStepIndex ? "bg-primary" : "bg-border"
              }`}
            />
            <span
              className={`text-[10px] ${
                i <= currentStepIndex
                  ? "text-primary font-medium"
                  : "text-muted-foreground"
              }`}
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* ═══════ STEP: Setup ═══════ */}
      {currentStep === "setup" && (
        <div className="space-y-3">
          {/* Mode tabs */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSetupMode("auto")}
              className={`flex-1 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                setupMode === "auto"
                  ? "border-primary bg-primary/5"
                  : "border-border bg-secondary hover:bg-secondary/80"
              }`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <Zap className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-card-foreground">
                  One-Click Setup
                </span>
              </div>
              <p className="text-[9px] text-muted-foreground">
                Register agent as token name + wallet + link
              </p>
            </button>
            <button
              type="button"
              onClick={() => setSetupMode("existing")}
              className={`flex-1 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                setupMode === "existing"
                  ? "border-primary bg-primary/5"
                  : "border-border bg-secondary hover:bg-secondary/80"
              }`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <Key className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-card-foreground">
                  I have a key
                </span>
              </div>
              <p className="text-[9px] text-muted-foreground">
                Enter existing API key
              </p>
            </button>
          </div>

          {/* Auto-setup */}
          {setupMode === "auto" && !setupResult && (
            <div className="space-y-2.5">
              <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2">
                <p className="text-[10px] text-primary leading-relaxed font-medium">
                  Registers a Moltx agent named after your token, generates a new
                  EVM wallet, and links it via EIP-712 signature. All automatic.
                </p>
              </div>

              <Button
                onClick={handleAutoSetup}
                disabled={isSettingUp}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
              >
                {isSettingUp ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-4 w-4" />
                    Register + Wallet + Link
                  </>
                )}
              </Button>

              {isSettingUp && (
                <div className="space-y-1.5">
                  {["Registering agent...", "Generating EVM wallet...", "Signing EIP-712 challenge..."].map(
                    (msg, i) => (
                      <div key={`step-${i}`} className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        {i === 0 ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : i === 1 ? <Wallet className="h-2.5 w-2.5" /> : <Shield className="h-2.5 w-2.5" />}
                        {msg}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {/* Auto-setup result */}
          {setupMode === "auto" && setupResult && (
            <div className="space-y-3">
              <div
                className={`rounded-lg border p-3 ${
                  setupResult.success && !setupResult.partial
                    ? "border-chart-3/30 bg-chart-3/5"
                    : "border-destructive/30 bg-destructive/5"
                }`}
              >
                <div className="flex items-start gap-2 mb-2">
                  {setupResult.success ? (
                    <CheckCircle2 className="h-4 w-4 text-chart-3 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  )}
                  <p className={`text-[10px] leading-relaxed ${setupResult.success ? "text-chart-3" : "text-destructive"}`}>
                    {setupResult.message}
                  </p>
                </div>

                {setupResult.apiKey && (
                  <div className="space-y-1.5 mt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">API Key</span>
                      <button type="button" onClick={() => copyText(setupResult.apiKey || "")} className="text-[9px] text-primary hover:underline">Copy</button>
                    </div>
                    <code className="block rounded bg-background border border-border px-2 py-1.5 text-[9px] font-mono text-accent break-all select-all">{setupResult.apiKey}</code>
                  </div>
                )}

                {setupResult.wallet && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Wallet</span>
                      <button type="button" onClick={() => copyText(setupResult.wallet?.address || "")} className="text-[9px] text-primary hover:underline">Copy</button>
                    </div>
                    <code className="block rounded bg-background border border-border px-2 py-1.5 text-[9px] font-mono text-foreground break-all select-all">{setupResult.wallet.address}</code>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Private Key</span>
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => setShowPrivateKey(!showPrivateKey)} className="text-muted-foreground hover:text-foreground">
                          {showPrivateKey ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
                        </button>
                        <button type="button" onClick={() => copyText(setupResult.wallet?.privateKey || "")} className="text-[9px] text-primary hover:underline">Copy</button>
                      </div>
                    </div>
                    <code className="block rounded bg-background border border-border px-2 py-1.5 text-[9px] font-mono text-foreground break-all select-all">
                      {showPrivateKey ? setupResult.wallet.privateKey : "".padStart(40, "x")}
                    </code>
                  </div>
                )}

                {setupResult.log && setupResult.log.length > 0 && (
                  <div className="mt-2 rounded bg-background border border-border px-2 py-1.5">
                    {setupResult.log.map((entry, i) => (
                      <div key={`log-${i}`} className="flex items-center gap-1 text-[9px] text-muted-foreground">
                        <CheckCircle2 className="h-2 w-2 text-chart-3 shrink-0" />
                        {entry}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
                <p className="text-[9px] text-destructive leading-relaxed font-medium">
                  SAVE YOUR API KEY AND PRIVATE KEY. They cannot be retrieved again.
                </p>
              </div>

              {setupResult.apiKey && (
                <Button onClick={() => setCurrentStep("form")} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold">
                  <Rocket className="mr-2 h-4 w-4" />
                  Continue to Token Details
                </Button>
              )}
              {!setupResult.success && (
                <Button variant="outline" onClick={() => setSetupResult(null)} className="w-full bg-transparent">Try Again</Button>
              )}
            </div>
          )}

          {/* Existing key */}
          {setupMode === "existing" && (
            <div className="space-y-2.5">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">API Key</Label>
                <Input
                  type="password"
                  placeholder="moltx_sk_... or moltbook_..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="bg-secondary border-border text-secondary-foreground placeholder:text-muted-foreground font-mono text-sm"
                />
              </div>
              <Button
                onClick={() => apiKey.trim() && setCurrentStep("form")}
                disabled={!apiKey.trim()}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Check className="mr-2 h-4 w-4" />
                Continue
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ═══════ STEP: Token Details ═══════ */}
      {currentStep === "form" && (
        <div className="space-y-3">
          {/* Connected badge */}
          <div className="flex items-center gap-2 rounded-md bg-chart-3/10 border border-chart-3/20 px-3 py-1.5">
            <CheckCircle2 className="h-3 w-3 text-chart-3" />
            <span className="text-[10px] text-chart-3 font-medium">
              {AGENTS[agent].label} connected | {lpInfo.label} ({tokenChain.toUpperCase()})
            </span>
            <button type="button" onClick={() => { setCurrentStep("setup"); setSetupResult(null); }} className="ml-auto text-[9px] text-muted-foreground hover:text-foreground">
              Change
            </button>
          </div>

          {/* Name & Symbol */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Token Name *</Label>
              <Input placeholder="My AI Token" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} className="bg-secondary border-border text-secondary-foreground placeholder:text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Symbol *</Label>
              <Input placeholder="MAI" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} maxLength={10} className="bg-secondary border-border text-secondary-foreground placeholder:text-muted-foreground font-mono" />
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

          {/* Description + AI button */}
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
                <Label className="text-[10px] text-muted-foreground">Website</Label>
                <Input placeholder="https://..." value={website} onChange={(e) => setWebsite(e.target.value)} className="bg-secondary border-border text-secondary-foreground placeholder:text-muted-foreground text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Twitter</Label>
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
                  <p className="text-xs font-medium text-card-foreground">V5 Tax Config</p>
                  <p className="text-[9px] text-muted-foreground">Buy/sell tax: 1-5%</p>
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
                    Distribution: {taxDistTotal}/100{taxDistValid ? " (Valid)" : " (Must = 100)"}
                  </div>
                </div>
              )}
            </div>
          )}

          <Button
            onClick={() => {
              if (!name.trim() || !symbol.trim()) return;
              if (enableTax && !taxDistValid) return;
              setCurrentStep("review");
            }}
            disabled={!name.trim() || !symbol.trim() || (enableTax && !taxDistValid)}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
          >
            Review & Post
          </Button>
        </div>
      )}

      {/* ═══════ STEP: Review ═══════ */}
      {currentStep === "review" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-background p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-card-foreground">Post Preview</h3>
              <button type="button" onClick={handleCopyContent} className="flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground hover:bg-secondary/80">
                {copied ? <><Check className="h-2.5 w-2.5" /> Copied</> : <><Copy className="h-2.5 w-2.5" /> Copy</>}
              </button>
            </div>
            <pre className="rounded-md bg-card border border-border p-3 text-[10px] font-mono text-foreground overflow-x-auto whitespace-pre-wrap leading-relaxed">{buildPreviewContent()}</pre>
          </div>

          {/* Summary grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md bg-secondary/50 border border-border px-2 py-1.5">
              <p className="text-[9px] text-muted-foreground">Platform</p>
              <p className="text-xs font-medium text-card-foreground">{lpInfo.label}</p>
            </div>
            <div className="rounded-md bg-secondary/50 border border-border px-2 py-1.5">
              <p className="text-[9px] text-muted-foreground">Agent</p>
              <p className="text-xs font-medium text-card-foreground">{AGENTS[agent].label}</p>
            </div>
            <div className="rounded-md bg-secondary/50 border border-border px-2 py-1.5">
              <p className="text-[9px] text-muted-foreground">Chain</p>
              <p className="text-xs font-mono font-bold text-accent">{tokenChain.toUpperCase()}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-secondary/50 border border-border px-2 py-1.5">
              <p className="text-[9px] text-muted-foreground">Name</p>
              <p className="text-xs font-medium text-card-foreground">{name}</p>
            </div>
            <div className="rounded-md bg-secondary/50 border border-border px-2 py-1.5">
              <p className="text-[9px] text-muted-foreground">Symbol</p>
              <p className="text-xs font-mono font-bold text-accent">{"$"}{symbol.toUpperCase()}</p>
            </div>
          </div>

          <div className="rounded-md bg-accent/10 border border-accent/20 px-3 py-2">
            <p className="text-[9px] text-accent leading-relaxed">
              Posts the {launchpad === "4claw" ? "!4clawd" : launchpad === "kibu" ? "!kibu" : "!clawnch"} command to {AGENTS[agent].label}.
              {lpInfo.agents.includes(agent) && (agent === "moltx" || agent === "4claw_org" || agent === "clawstr") && launchpad !== "4claw"
                ? ` ${lpInfo.label} auto-scans every minute and deploys automatically.`
                : launchpad === "4claw"
                  ? " Then triggers the 4claw indexer."
                  : " Then triggers the launch API."}
              {" "}Cost: {lpInfo.fee}.
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCurrentStep("form")} className="flex-1 bg-transparent">Edit</Button>
            <Button onClick={handlePost} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold">
              <Send className="mr-2 h-4 w-4" />
              Post to {AGENTS[agent].label}
            </Button>
          </div>
        </div>
      )}

      {/* ═══════ STEP: Posting ═══════ */}
      {currentStep === "posting" && (
        <div className="space-y-3">
          {isPosting && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-7 w-7 text-primary animate-spin" />
              <p className="text-sm font-medium text-card-foreground">
                Posting to {AGENTS[agent].label}...
              </p>
              <p className="text-[10px] text-muted-foreground">
                Deploying via {lpInfo.label} on {tokenChain.toUpperCase()}
              </p>
            </div>
          )}

          {postResult && !isPosting && (
            <div className="space-y-3">
              <div className={`flex flex-col items-center gap-2 py-4 ${postResult.success ? "text-chart-3" : "text-destructive"}`}>
                {postResult.success ? <CheckCircle2 className="h-8 w-8" /> : <XCircle className="h-8 w-8" />}
                <p className="text-sm font-semibold text-center">{postResult.success ? "Token Launch Initiated!" : "Post Failed"}</p>
              </div>

              <div className={`rounded-lg border p-3 ${postResult.success ? "border-chart-3/30 bg-chart-3/5" : "border-destructive/30 bg-destructive/5"}`}>
                <p className={`text-[10px] leading-relaxed ${postResult.success ? "text-chart-3" : "text-destructive"}`}>{postResult.message}</p>
                {postResult.postId && (
                  <a href={agent === "moltx" ? `https://moltx.io/post/${postResult.postId}` : agent === "moltbook" ? `https://www.moltbook.com/post/${postResult.postId}` : "#"} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[10px] text-primary hover:underline">
                    <ExternalLink className="h-2.5 w-2.5" />
                    View post
                  </a>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setCurrentStep("form"); setPostResult(null); setName(""); setSymbol(""); setDescription(""); }} className="flex-1 bg-transparent">Launch Another</Button>
                {!postResult.success && (
                  <Button onClick={() => { setCurrentStep("review"); setPostResult(null); }} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">Retry</Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
