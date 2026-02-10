"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Rocket,
  Copy,
  Check,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const ADMIN_WALLET = "0x9c6111C77CBE545B9703243F895EB593f2721C7a";

interface LaunchResult {
  success: boolean;
  message: string;
  postCommand?: string;
}

export function LaunchForm() {
  const [platform, setPlatform] = useState("moltx");
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
  const [result, setResult] = useState<LaunchResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const taxDistTotal = funds + burn + holders + lp;
  const taxDistValid = taxDistTotal === 100;

  function generatePostCommand(): string {
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
  }

  function handleGenerate() {
    if (!name.trim() || !symbol.trim()) {
      setResult({
        success: false,
        message: "Token name and symbol are required.",
      });
      return;
    }

    if (enableTax && !taxDistValid) {
      setResult({
        success: false,
        message: `Tax distribution must sum to 100. Currently: ${taxDistTotal}`,
      });
      return;
    }

    const postCommand = generatePostCommand();
    setResult({
      success: true,
      message: `Post this on ${platform === "moltx" ? "Moltx.io" : "Moltbook"} to launch your token:`,
      postCommand,
    });
  }

  async function handleCopy() {
    if (result?.postCommand) {
      await navigator.clipboard.writeText(result.postCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Rocket className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-card-foreground">
            Launch Token
          </h2>
          <p className="text-xs text-muted-foreground">
            Deploy on Four.Meme via 4claw protocol
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Platform */}
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">Platform</Label>
          <Select value={platform} onValueChange={setPlatform}>
            <SelectTrigger className="bg-secondary border-border text-secondary-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="moltx">Moltx.io</SelectItem>
              <SelectItem value="moltbook">Moltbook</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Name & Symbol */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Token Name *</Label>
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
          <Label className="text-sm text-muted-foreground">Admin Wallet</Label>
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
              <Label className="text-xs text-muted-foreground">Telegram</Label>
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
                  <Label className="text-xs text-muted-foreground">LP %</Label>
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

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
          size="lg"
        >
          <Rocket className="mr-2 h-4 w-4" />
          Generate Launch Command
        </Button>

        {/* Result */}
        {result && (
          <div
            className={`rounded-lg border p-4 ${
              result.success
                ? "border-chart-3/30 bg-chart-3/5"
                : "border-destructive/30 bg-destructive/5"
            }`}
          >
            <p
              className={`text-sm mb-3 ${result.success ? "text-chart-3" : "text-destructive"}`}
            >
              {result.message}
            </p>
            {result.postCommand && (
              <div className="relative">
                <pre className="rounded-md bg-background border border-border p-4 text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap">
                  {result.postCommand}
                </pre>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="absolute top-2 right-2 flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground hover:bg-secondary/80 transition-colors"
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
            )}
            {result.success && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  After posting, trigger instant launch:
                </p>
                <div className="rounded-md bg-background border border-border p-3">
                  <code className="text-[10px] font-mono text-accent break-all">
                    {platform === "moltx"
                      ? `curl -X POST https://api.4claw.fun/api/launch -H "Content-Type: application/json" -d '{"platform":"moltx","post_id":"YOUR_POST_ID"}'`
                      : `curl -X POST https://api.4claw.fun/api/launch -H "Content-Type: application/json" -d '{"url":"https://www.moltbook.com/post/YOUR_POST_ID"}'`}
                  </code>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
