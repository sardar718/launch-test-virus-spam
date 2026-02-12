"use client";

import { useState } from "react";
import {
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Trash2,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export interface DeployedToken {
  name: string;
  symbol: string;
  postUrl?: string;
  launchpad: string;
  agent: string;
  timestamp: number;
}

// Shared state across components (simple module-level store)
let _tokens: DeployedToken[] = [];
let _listeners: Array<() => void> = [];

export function addDeployedToken(token: DeployedToken) {
  _tokens = [token, ..._tokens].slice(0, 50);
  for (const fn of _listeners) fn();
}

export function getDeployedTokens(): DeployedToken[] {
  return _tokens;
}

function useDeployedTokens() {
  const [, setTick] = useState(0);
  useState(() => {
    const fn = () => setTick((t) => t + 1);
    _listeners.push(fn);
    return () => {
      _listeners = _listeners.filter((l) => l !== fn);
    };
  });
  return _tokens;
}

function formatLine(t: DeployedToken): string {
  return `${t.name} ($${t.symbol}) | ${t.launchpad} via ${t.agent}${t.postUrl ? ` | ${t.postUrl}` : ""}`;
}

export function DeployedTokensBox() {
  const tokens = useDeployedTokens();
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(true);

  if (tokens.length === 0) return null;

  const handleCopy = async (token: DeployedToken, idx: number) => {
    await navigator.clipboard.writeText(formatLine(token));
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const handleCopyAll = async () => {
    const text = tokens.map(formatLine).join("\n");
    await navigator.clipboard.writeText(text);
    setCopiedIdx(-1);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const handleDownload = () => {
    const text = tokens.map(formatLine).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deployed-tokens-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    _tokens = [];
    for (const fn of _listeners) fn();
  };

  return (
    <div className="rounded-xl border border-chart-3/30 bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-sm font-semibold text-card-foreground"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded bg-chart-3/20 text-chart-3 text-[10px] font-bold">
            {tokens.length}
          </span>
          Deployed Tokens
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyAll}
            className="h-6 px-2 text-[9px] bg-transparent border-border"
          >
            {copiedIdx === -1 ? (
              <Check className="mr-1 h-2.5 w-2.5" />
            ) : (
              <Copy className="mr-1 h-2.5 w-2.5" />
            )}
            Copy All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="h-6 px-2 text-[9px] bg-transparent border-border"
          >
            <Download className="mr-1 h-2.5 w-2.5" />
            .txt
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            className="h-6 px-2 text-[9px] bg-transparent border-border text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-1 h-2.5 w-2.5" />
            Clear
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {tokens.map((token, idx) => (
            <div
              key={`${token.symbol}-${token.timestamp}`}
              className="group flex items-center justify-between rounded-md border border-border bg-secondary/50 px-2.5 py-1.5"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="shrink-0 text-[10px] font-bold text-primary">
                  ${token.symbol}
                </span>
                <span className="truncate text-[10px] text-foreground">
                  {token.name}
                </span>
                <span className="shrink-0 text-[8px] text-muted-foreground">
                  {token.launchpad}/{token.agent}
                </span>
                {token.postUrl && (
                  <a
                    href={token.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-[8px] text-accent hover:underline"
                  >
                    view
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleCopy(token, idx)}
                className="ml-2 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {copiedIdx === idx ? (
                  <Check className="h-3 w-3 text-chart-3" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
