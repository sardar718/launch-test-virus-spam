"use client";

import useSWR from "swr";
import { RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface AgentPost {
  agent: string;
  agentUrl: string;
  launchCommand: string;
  launchpad: string;
  tokenName: string;
  tokenSymbol: string;
  timestamp: string;
  postUrl: string;
}

interface FeedData {
  posts: AgentPost[];
  total: number;
  agents: Record<string, number>;
  timestamp: string;
}

const COMMAND_COLORS: Record<string, string> = {
  "!4clawd": "bg-primary/10 text-primary border-primary/20",
  "!kibu": "bg-chart-3/10 text-chart-3 border-chart-3/20",
  "!clawnch": "bg-chart-4/10 text-chart-4 border-chart-4/20",
  "!molaunch": "bg-[#9945FF]/10 text-[#9945FF] border-[#9945FF]/20",
  "!synthlaunch": "bg-[#00D4AA]/10 text-[#00D4AA] border-[#00D4AA]/20",
  "!fourclaw": "bg-accent/10 text-accent border-accent/20",
};

const AGENT_COLORS: Record<string, string> = {
  "4claw.org": "text-primary",
  Moltx: "text-chart-4",
  Moltbook: "text-chart-5",
  BapBook: "text-chart-3",
};

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function AgentPostsFeed() {
  const { data, isLoading, mutate } = useSWR<FeedData>(
    "/api/agent-posts",
    fetcher,
    { refreshInterval: 90000, revalidateOnFocus: false },
  );

  const posts = data?.posts || [];
  const agents = data?.agents || {};

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <span className="text-sm font-bold text-primary">!</span>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-card-foreground">
              Live Launch Posts
            </h2>
            <p className="text-xs text-muted-foreground">
              Token launch commands detected from agent social feeds
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
              {data.total} found
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutate()}
            disabled={isLoading}
            className="border-border bg-transparent text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Agent summary badges */}
      {Object.keys(agents).length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {Object.entries(agents).map(([agent, count]) => (
            <span
              key={agent}
              className={`rounded-md bg-secondary px-2 py-0.5 text-[10px] font-medium ${AGENT_COLORS[agent] || "text-muted-foreground"}`}
            >
              {agent}: {count as number} posts
            </span>
          ))}
        </div>
      )}

      {/* Loading */}
      {isLoading && posts.length === 0 && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={`skel-${i}`} className="h-12 animate-pulse rounded-lg bg-secondary" />
          ))}
        </div>
      )}

      {/* Posts list */}
      {posts.length > 0 && (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {posts.map((post, i) => (
            <div
              key={`${post.agent}-${post.tokenSymbol}-${i}`}
              className="flex items-center gap-3 rounded-lg bg-background border border-border px-3 py-2 hover:border-primary/20 transition-colors"
            >
              {/* Launch command badge */}
              <span
                className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-mono font-bold ${COMMAND_COLORS[post.launchCommand] || "bg-secondary text-muted-foreground border-border"}`}
              >
                {post.launchCommand}
              </span>

              {/* Token info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-card-foreground truncate">
                    {post.tokenName}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    ${post.tokenSymbol}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                  <a
                    href={post.agentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`hover:underline ${AGENT_COLORS[post.agent] || ""}`}
                  >
                    {post.agent}
                  </a>
                  <span>-&gt;</span>
                  <span className="font-medium text-foreground/70">{post.launchpad}</span>
                </div>
              </div>

              {/* Time + link */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[9px] text-muted-foreground">
                  {timeAgo(post.timestamp)}
                </span>
                <a
                  href={post.postUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && posts.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">No launch posts detected right now</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Scanning 4claw.org, Moltx, Moltbook, and BapBook feeds
          </p>
        </div>
      )}

      {/* Timestamp */}
      {data?.timestamp && (
        <p className="mt-3 text-center text-[9px] text-muted-foreground">
          Last scanned: {new Date(data.timestamp).toLocaleTimeString()} -- Auto-refreshes every 90s
        </p>
      )}
    </section>
  );
}
