"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, Trash2, ChevronDown, ChevronUp } from "lucide-react";

interface GlobalLogEntry {
  time: string;
  msg: string;
  type: "info" | "success" | "error" | "skip";
  id: number;
}

// Global in-memory store so all panels can push logs here
let globalLogs: GlobalLogEntry[] = [];
let logIdCounter = 0;
let listeners: Array<() => void> = [];

export function addGlobalLog(msg: string, type: GlobalLogEntry["type"] = "info") {
  const time = new Date().toLocaleTimeString("en-US", {
    hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  globalLogs = [{ time, msg, type, id: ++logIdCounter }, ...globalLogs].slice(0, 300);
  listeners.forEach((fn) => fn());
}

function useGlobalLogs() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    listeners.push(fn);
    return () => { listeners = listeners.filter((l) => l !== fn); };
  }, []);
  return globalLogs;
}

export function GlobalActivityFeed() {
  const logs = useGlobalLogs();
  const [expanded, setExpanded] = useState(true);
  const [filter, setFilter] = useState<"all" | "success" | "error">("all");
  const containerRef = useRef<HTMLDivElement>(null);

  const clearLogs = useCallback(() => {
    globalLogs = [];
    listeners.forEach((fn) => fn());
  }, []);

  const filtered = filter === "all" ? logs
    : logs.filter((l) => l.type === filter);

  const successCount = logs.filter((l) => l.type === "success").length;
  const errorCount = logs.filter((l) => l.type === "error").length;

  return (
    <Card className="border-chart-4/30 bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold sm:text-base">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-chart-4/20 text-chart-4">
              <Activity className="h-3.5 w-3.5" />
            </span>
            <span className="truncate">Global Activity Feed</span>
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {successCount > 0 && (
              <Badge variant="outline" className="border-chart-3/40 text-chart-3 text-[10px]">
                {successCount} deployed
              </Badge>
            )}
            {errorCount > 0 && (
              <Badge variant="outline" className="border-destructive/40 text-destructive text-[10px]">
                {errorCount} errors
              </Badge>
            )}
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          All deploys from Auto-Launch, Cloud, and Trending panels in one feed.
        </p>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-2">
          {/* Filters + Clear */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {(["all", "success", "error"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    filter === f
                      ? f === "success" ? "bg-chart-3/20 text-chart-3"
                        : f === "error" ? "bg-destructive/20 text-destructive"
                        : "bg-primary/20 text-primary"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  {f === "all" ? `All (${logs.length})` : f === "success" ? `Success (${successCount})` : `Errors (${errorCount})`}
                </button>
              ))}
            </div>
            {logs.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearLogs} className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground">
                <Trash2 className="mr-1 h-2.5 w-2.5" />
                Clear
              </Button>
            )}
          </div>

          {/* Log entries */}
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-[10px] text-muted-foreground/50">
              No activity yet. Start an Auto-Launch, Cloud, or Trending panel.
            </div>
          ) : (
            <div
              ref={containerRef}
              className="max-h-52 overflow-y-auto rounded bg-background/80 border border-border p-2 font-mono text-[9px] space-y-0.5"
            >
              {filtered.slice(0, 150).map((l) => (
                <div
                  key={l.id}
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
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
