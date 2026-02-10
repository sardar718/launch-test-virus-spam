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
} from "lucide-react";

const ADMIN_WALLET = "0x9c6111C77CBE545B9703243F895EB593f2721C7a";

type Step = "setup" | "form" | "review" | "posting";
type SetupMode = "existing" | "auto";

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
  step?: string;
  log?: string[];
}

interface PostResult {
  success: boolean;
  message: string;
  postId?: string;
  step?: string;
  details?: string;
}

export function LaunchForm() {
  // Setup state
  const [currentStep, setCurrentStep] = useState<Step>("setup");
  const [setupMode, setSetupMode] = useState<SetupMode>("auto");
  const [apiKey, setApiKey] = useState("");
  const [agentWallet, setAgentWallet] = useState<WalletInfo | null>(null);

  // Auto-setup state
  const [agentName, setAgentName] = useState("");
  const [agentDisplayName, setAgentDisplayName] = useState("");
  const [agentBio, setAgentBio] = useState("");
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupResult, setSetupResult] = useState<SetupResult | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);

  // Token form state
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [enableTax, setEnableTax] = useState(false);
  const [tax, setTax] = useState(3);
  const [funds, setFunds] = useState(97);
  const [burn, setBurn] = useState(1);
  const [holders, setHolders] = useState(1);
  const [lp, setLp] = useState(1);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Posting state
  const [isPosting, setIsPosting] = useState(false);
  const [postResult, setPostResult] = useState<PostResult | null>(null);
  const [copied, setCopied] = useState(false);

  const taxDistTotal = funds + burn + holders + lp;
  const taxDistValid = taxDistTotal === 100;

  const generatePostContent = useCallback((): string => {
    let post = `!4clawd\nname: ${name}\nsymbol: ${symbol.toUpperCase()}\nwallet: ${ADMIN_WALLET}`;
    if (description) post += `\ndescription: ${description}`;
    if (imageUrl) post += `\nimage: ${imageUrl}`;
    if (website) post += `\nwebsite: ${website}`;
    if (twitter) post += `\ntwitter: ${twitter}`;
    if (telegram) post += `\ntelegram: ${telegram}`;
    if (enableTax) {
      post += `\n\ntax: ${tax}\nfunds: ${funds}\nburn: ${burn}\nholders: ${holders}\nlp: ${lp}`;
    }
    return post;
  }, [
    name,
    symbol,
    description,
    imageUrl,
    website,
    twitter,
    telegram,
    enableTax,
    tax,
    funds,
    burn,
    holders,
    lp,
  ]);

  // ── Auto-setup: register + generate wallet + link ──────────
  async function handleAutoSetup() {
    if (!agentName.trim()) return;
    setIsSettingUp(true);
    setSetupResult(null);

    try {
      const res = await fetch("/api/moltx/auto-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentName: agentName.trim(),
          displayName: agentDisplayName.trim() || agentName.trim(),
          description: agentBio.trim(),
          chainId: 56,
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
      setSetupResult({
        success: false,
        message: "Network error during auto-setup",
      });
    } finally {
      setIsSettingUp(false);
    }
  }

  function handleContinueToForm() {
    if (apiKey.trim()) {
      setCurrentStep("form");
    }
  }

  function handleSaveExistingKey() {
    if (apiKey.trim()) {
      setCurrentStep("form");
    }
  }

  function handleReviewStep() {
    if (!name.trim() || !symbol.trim()) return;
    if (enableTax && !taxDistValid) return;
    setCurrentStep("review");
  }

  async function handlePost() {
    setCurrentStep("posting");
    setIsPosting(true);
    setPostResult(null);

    const content = generatePostContent();

    try {
      const res = await fetch("/api/moltx/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          content,
          platform: "moltx",
        }),
      });

      const data = await res.json();

      if (data.success) {
        setPostResult({
          success: true,
          message: data.message || "Token launch post created on Moltx!",
          postId: data.postId,
          step: data.step,
        });
      } else {
        setPostResult({
          success: false,
          message: data.error || "Failed to post on Moltx",
          details:
            data.details?.error ||
            data.details?.message ||
            (typeof data.details === "string" ? data.details : undefined),
        });
      }
    } catch {
      setPostResult({
        success: false,
        message: "Network error while posting to Moltx",
      });
    } finally {
      setIsPosting(false);
    }
  }

  async function handleCopyContent() {
    await navigator.clipboard.writeText(generatePostContent());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleCopyText(text: string) {
    await navigator.clipboard.writeText(text);
  }

  // Step indicator
  const steps = [
    { key: "setup", label: "Connect" },
    { key: "form", label: "Token" },
    { key: "review", label: "Review" },
    { key: "posting", label: "Launch" },
  ] as const;

  const currentStepIndex = steps.findIndex((s) => s.key === currentStep);

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Rocket className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-card-foreground">
            Launch Token
          </h2>
          <p className="text-xs text-muted-foreground">
            Post directly to Moltx and deploy on Four.Meme
          </p>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="mb-6 flex items-center gap-1">
        {steps.map((s, i) => (
          <div key={s.key} className="flex flex-1 items-center gap-1">
            <div className="flex flex-1 flex-col items-center gap-1">
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
          </div>
        ))}
      </div>

      {/* ═══════ STEP: Setup ═══════ */}
      {currentStep === "setup" && (
        <div className="space-y-4">
          {/* Mode selector */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSetupMode("auto")}
              className={`flex-1 rounded-lg border px-3 py-3 text-left transition-colors ${
                setupMode === "auto"
                  ? "border-primary bg-primary/5"
                  : "border-border bg-secondary hover:bg-secondary/80"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Zap className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-card-foreground">
                  One-Click Setup
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Auto: register + wallet + link
              </p>
            </button>
            <button
              type="button"
              onClick={() => setSetupMode("existing")}
              className={`flex-1 rounded-lg border px-3 py-3 text-left transition-colors ${
                setupMode === "existing"
                  ? "border-primary bg-primary/5"
                  : "border-border bg-secondary hover:bg-secondary/80"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Key className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-card-foreground">
                  I have a key
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Already registered on Moltx
              </p>
            </button>
          </div>

          {/* ── Auto-Setup Mode ── */}
          {setupMode === "auto" && !setupResult && (
            <div className="space-y-3">
              <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2">
                <p className="text-[10px] text-primary leading-relaxed font-medium">
                  This will automatically: register a Moltx agent, generate a
                  new EVM wallet, and link it via EIP-712 signature. You will
                  receive an API key and wallet credentials.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  Agent Handle *
                </Label>
                <Input
                  placeholder="my_token_agent"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  className="bg-secondary border-border text-secondary-foreground placeholder:text-muted-foreground font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  Display Name
                </Label>
                <Input
                  placeholder="My Token Agent"
                  value={agentDisplayName}
                  onChange={(e) => setAgentDisplayName(e.target.value)}
                  className="bg-secondary border-border text-secondary-foreground placeholder:text-muted-foreground text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  Agent Bio
                </Label>
                <Input
                  placeholder="Token launcher on BSC via 4claw"
                  value={agentBio}
                  onChange={(e) => setAgentBio(e.target.value)}
                  className="bg-secondary border-border text-secondary-foreground placeholder:text-muted-foreground text-sm"
                />
              </div>

              <Button
                onClick={handleAutoSetup}
                disabled={!agentName.trim() || isSettingUp}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                size="lg"
              >
                {isSettingUp ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-4 w-4" />
                    Register + Generate Wallet + Link
                  </>
                )}
              </Button>

              {isSettingUp && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Registering agent on Moltx...</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Wallet className="h-3 w-3" />
                    <span>Generating EVM wallet...</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Shield className="h-3 w-3" />
                    <span>Signing EIP-712 challenge...</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Auto-Setup Result ── */}
          {setupMode === "auto" && setupResult && (
            <div className="space-y-3">
              <div
                className={`rounded-lg border p-4 ${
                  setupResult.success && !setupResult.partial
                    ? "border-chart-3/30 bg-chart-3/5"
                    : setupResult.success && setupResult.partial
                      ? "border-accent/30 bg-accent/5"
                      : "border-destructive/30 bg-destructive/5"
                }`}
              >
                <div className="flex items-start gap-2 mb-3">
                  {setupResult.success && !setupResult.partial ? (
                    <CheckCircle2 className="h-5 w-5 text-chart-3 shrink-0 mt-0.5" />
                  ) : setupResult.success && setupResult.partial ? (
                    <AlertCircle className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  )}
                  <p
                    className={`text-xs leading-relaxed ${
                      setupResult.success && !setupResult.partial
                        ? "text-chart-3"
                        : setupResult.partial
                          ? "text-accent"
                          : "text-destructive"
                    }`}
                  >
                    {setupResult.message}
                  </p>
                </div>

                {/* API Key */}
                {setupResult.apiKey && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        API Key
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText(setupResult.apiKey || "")
                        }
                        className="text-[10px] text-primary hover:underline"
                      >
                        Copy
                      </button>
                    </div>
                    <code className="block rounded bg-background border border-border px-3 py-2 text-[10px] font-mono text-accent break-all select-all">
                      {setupResult.apiKey}
                    </code>
                  </div>
                )}

                {/* Wallet */}
                {setupResult.wallet && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        Wallet Address
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText(setupResult.wallet?.address || "")
                        }
                        className="text-[10px] text-primary hover:underline"
                      >
                        Copy
                      </button>
                    </div>
                    <code className="block rounded bg-background border border-border px-3 py-2 text-[10px] font-mono text-foreground break-all select-all">
                      {setupResult.wallet.address}
                    </code>

                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        Private Key
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowPrivateKey(!showPrivateKey)}
                          className="text-[10px] text-muted-foreground hover:text-foreground"
                        >
                          {showPrivateKey ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyText(
                              setupResult.wallet?.privateKey || ""
                            )
                          }
                          className="text-[10px] text-primary hover:underline"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                    <code className="block rounded bg-background border border-border px-3 py-2 text-[10px] font-mono text-foreground break-all select-all">
                      {showPrivateKey
                        ? setupResult.wallet.privateKey
                        : "●".repeat(40)}
                    </code>
                  </div>
                )}

                {/* Setup log */}
                {setupResult.log && setupResult.log.length > 0 && (
                  <div className="mt-3 rounded bg-background border border-border px-3 py-2">
                    <p className="text-[10px] font-medium text-muted-foreground mb-1">
                      Setup Log
                    </p>
                    {setupResult.log.map((entry, i) => (
                      <div
                        key={`log-${i}`}
                        className="flex items-center gap-1.5 text-[10px] text-muted-foreground"
                      >
                        <CheckCircle2 className="h-2.5 w-2.5 text-chart-3 shrink-0" />
                        {entry}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
                <p className="text-[10px] text-destructive leading-relaxed font-medium">
                  SAVE YOUR API KEY AND PRIVATE KEY NOW. They cannot be retrieved
                  again. The private key controls your linked wallet.
                </p>
              </div>

              {setupResult.apiKey && (
                <Button
                  onClick={handleContinueToForm}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                  size="lg"
                >
                  <Rocket className="mr-2 h-4 w-4" />
                  Continue to Token Setup
                </Button>
              )}

              {!setupResult.success && (
                <Button
                  variant="outline"
                  onClick={() => setSetupResult(null)}
                  className="w-full bg-transparent"
                >
                  Try Again
                </Button>
              )}
            </div>
          )}

          {/* ── Existing Key Mode ── */}
          {setupMode === "existing" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  Moltx API Key
                </Label>
                <Input
                  type="password"
                  placeholder="moltx_sk_..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="bg-secondary border-border text-secondary-foreground placeholder:text-muted-foreground font-mono text-sm"
                />
              </div>
              <Button
                onClick={handleSaveExistingKey}
                disabled={!apiKey.trim()}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Check className="mr-2 h-4 w-4" />
                Continue with API Key
              </Button>
              <div className="rounded-md bg-secondary/50 border border-border px-3 py-2">
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Your API key is only used for this session and sent directly to
                  Moltx. It is never stored.
                  <br />
                  <strong>Note:</strong> Posting requires a linked EVM wallet. If
                  you have not linked one yet, use the One-Click Setup instead.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════ STEP: Token Details ═══════ */}
      {currentStep === "form" && (
        <div className="space-y-4">
          {/* Connected badge */}
          <div className="flex items-center gap-2 rounded-md bg-chart-3/10 border border-chart-3/20 px-3 py-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-chart-3" />
            <span className="text-xs text-chart-3 font-medium">
              Moltx connected
              {agentWallet ? " + wallet linked" : ""}
            </span>
            <button
              type="button"
              onClick={() => {
                setCurrentStep("setup");
                setSetupResult(null);
              }}
              className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
            >
              Change
            </button>
          </div>

          {/* Name & Symbol */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                Token Name *
              </Label>
              <Input
                placeholder="My AI Token"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
                className="bg-secondary border-border text-secondary-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Symbol *</Label>
              <Input
                placeholder="MAI"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                maxLength={10}
                className="bg-secondary border-border text-secondary-foreground placeholder:text-muted-foreground font-mono"
              />
            </div>
          </div>

          {/* Wallet */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">
              Admin Wallet
            </Label>
            <div className="rounded-md bg-secondary/50 border border-border px-3 py-2.5">
              <code className="text-xs font-mono text-accent break-all">
                {ADMIN_WALLET}
              </code>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Description</Label>
            <Textarea
              placeholder="Describe your token..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={2}
              className="bg-secondary border-border text-secondary-foreground placeholder:text-muted-foreground resize-none"
            />
          </div>

          {/* Image URL */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Image URL</Label>
            <Input
              placeholder="https://your-host.com/image.png"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="bg-secondary border-border text-secondary-foreground placeholder:text-muted-foreground"
            />
            <p className="text-[10px] text-muted-foreground">
              Cannot be changed after launch. Use IPFS for permanence.
            </p>
          </div>

          {/* Advanced toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAdvanced ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            Social Links
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Website</Label>
                <Input
                  placeholder="https://..."
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="bg-secondary border-border text-secondary-foreground placeholder:text-muted-foreground text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Twitter</Label>
                <Input
                  placeholder="@handle"
                  value={twitter}
                  onChange={(e) => setTwitter(e.target.value)}
                  className="bg-secondary border-border text-secondary-foreground placeholder:text-muted-foreground text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Telegram
                </Label>
                <Input
                  placeholder="t.me/group"
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  className="bg-secondary border-border text-secondary-foreground placeholder:text-muted-foreground text-sm"
                />
              </div>
            </div>
          )}

          {/* Tax Config */}
          <div className="rounded-lg border border-border bg-background p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-card-foreground">
                  V5 Tax Configuration
                </p>
                <p className="text-xs text-muted-foreground">
                  Buy/sell tax: 1-5%
                </p>
              </div>
              <Switch checked={enableTax} onCheckedChange={setEnableTax} />
            </div>

            {enableTax && (
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-muted-foreground">
                      Tax Rate
                    </Label>
                    <span className="text-sm font-mono font-bold text-primary">
                      {tax}%
                    </span>
                  </div>
                  <Slider
                    value={[tax]}
                    onValueChange={(v) => setTax(v[0])}
                    min={1}
                    max={5}
                    step={1}
                    className="py-2"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Funds %
                    </Label>
                    <Input
                      type="number"
                      value={funds}
                      onChange={(e) => setFunds(Number(e.target.value))}
                      min={0}
                      max={100}
                      className="bg-secondary border-border text-secondary-foreground font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Burn %
                    </Label>
                    <Input
                      type="number"
                      value={burn}
                      onChange={(e) => setBurn(Number(e.target.value))}
                      min={0}
                      max={100}
                      className="bg-secondary border-border text-secondary-foreground font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Holders %
                    </Label>
                    <Input
                      type="number"
                      value={holders}
                      onChange={(e) => setHolders(Number(e.target.value))}
                      min={0}
                      max={100}
                      className="bg-secondary border-border text-secondary-foreground font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      LP %
                    </Label>
                    <Input
                      type="number"
                      value={lp}
                      onChange={(e) => setLp(Number(e.target.value))}
                      min={0}
                      max={100}
                      className="bg-secondary border-border text-secondary-foreground font-mono text-sm"
                    />
                  </div>
                </div>

                <div
                  className={`flex items-center gap-2 text-xs ${taxDistValid ? "text-chart-3" : "text-destructive"}`}
                >
                  {!taxDistValid && <AlertCircle className="h-3 w-3" />}
                  <span className="font-mono">
                    Distribution total: {taxDistTotal}/100
                    {taxDistValid ? " (Valid)" : " (Must equal 100)"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Continue to Review */}
          <Button
            onClick={handleReviewStep}
            disabled={
              !name.trim() ||
              !symbol.trim() ||
              (enableTax && !taxDistValid)
            }
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
            size="lg"
          >
            Review & Post
          </Button>
        </div>
      )}

      {/* ═══════ STEP: Review ═══════ */}
      {currentStep === "review" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-card-foreground">
                Post Preview
              </h3>
              <button
                type="button"
                onClick={handleCopyContent}
                className="flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground hover:bg-secondary/80 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" /> Copy
                  </>
                )}
              </button>
            </div>
            <pre className="rounded-md bg-card border border-border p-4 text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {generatePostContent()}
            </pre>
          </div>

          {/* Token summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md bg-secondary/50 border border-border px-3 py-2">
              <p className="text-[10px] text-muted-foreground">Name</p>
              <p className="text-sm font-medium text-card-foreground">
                {name}
              </p>
            </div>
            <div className="rounded-md bg-secondary/50 border border-border px-3 py-2">
              <p className="text-[10px] text-muted-foreground">Symbol</p>
              <p className="text-sm font-mono font-bold text-accent">
                {"$"}{symbol.toUpperCase()}
              </p>
            </div>
            {enableTax && (
              <>
                <div className="rounded-md bg-secondary/50 border border-border px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">Tax Rate</p>
                  <p className="text-sm font-mono font-bold text-primary">
                    {tax}%
                  </p>
                </div>
                <div className="rounded-md bg-secondary/50 border border-border px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">
                    To Wallet
                  </p>
                  <p className="text-sm font-mono text-card-foreground">
                    {((funds / 100) * tax).toFixed(2)}%
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="rounded-md bg-accent/10 border border-accent/20 px-3 py-2">
            <p className="text-[10px] text-accent leading-relaxed">
              This will post the !4clawd command to Moltx.io using your API key,
              then automatically trigger the 4claw indexer. Your token enters the
              review queue and deploys on Four.Meme once approved. Cost: 0 BNB.
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setCurrentStep("form")}
              className="flex-1 bg-transparent"
            >
              Back to Edit
            </Button>
            <Button
              onClick={handlePost}
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
              size="lg"
            >
              <Send className="mr-2 h-4 w-4" />
              Post to Moltx
            </Button>
          </div>
        </div>
      )}

      {/* ═══════ STEP: Posting / Result ═══════ */}
      {currentStep === "posting" && (
        <div className="space-y-4">
          {isPosting && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <div className="text-center">
                <p className="text-sm font-medium text-card-foreground">
                  Posting to Moltx...
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Creating !4clawd post and triggering 4claw indexer
                </p>
              </div>
            </div>
          )}

          {postResult && !isPosting && (
            <div className="space-y-4">
              <div
                className={`flex flex-col items-center gap-3 py-6 ${
                  postResult.success ? "text-chart-3" : "text-destructive"
                }`}
              >
                {postResult.success ? (
                  <CheckCircle2 className="h-10 w-10" />
                ) : (
                  <XCircle className="h-10 w-10" />
                )}
                <p className="text-sm font-semibold text-center">
                  {postResult.success
                    ? "Token Launch Initiated!"
                    : "Post Failed"}
                </p>
              </div>

              <div
                className={`rounded-lg border p-4 ${
                  postResult.success
                    ? "border-chart-3/30 bg-chart-3/5"
                    : "border-destructive/30 bg-destructive/5"
                }`}
              >
                <p
                  className={`text-xs leading-relaxed ${postResult.success ? "text-chart-3" : "text-destructive"}`}
                >
                  {postResult.message}
                </p>
                {postResult.details && (
                  <p className="text-[10px] text-muted-foreground mt-2">
                    {postResult.details}
                  </p>
                )}
                {postResult.postId && (
                  <a
                    href={`https://moltx.io/post/${postResult.postId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View post on Moltx
                  </a>
                )}
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setCurrentStep("form");
                    setPostResult(null);
                    setName("");
                    setSymbol("");
                    setDescription("");
                    setImageUrl("");
                  }}
                  className="flex-1 bg-transparent"
                >
                  Launch Another
                </Button>
                {!postResult.success && (
                  <Button
                    onClick={() => {
                      setCurrentStep("review");
                      setPostResult(null);
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
