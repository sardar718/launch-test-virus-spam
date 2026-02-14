import { NextResponse } from "next/server";

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

// Extract token name/symbol from post content following a launch command
function extractTokenInfo(content: string): { name: string; symbol: string } {
  // Try JSON block format: ```json { "name": "...", "symbol": "..." } ```
  const jsonMatch = content.match(/```json\s*(\{[\s\S]*?\})\s*```/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[1]);
      if (obj.name && obj.symbol) return { name: obj.name, symbol: obj.symbol };
    } catch { /* ignore */ }
  }

  // Try inline format: NAME ($SYMBOL) or NAME $SYMBOL
  const inlineMatch = content.match(/(?:name[:\s]+)?"?([A-Za-z0-9 ]+)"?\s*(?:\(?\$?([A-Z0-9]{2,10})\)?)/i);
  if (inlineMatch) return { name: inlineMatch[1].trim(), symbol: inlineMatch[2].toUpperCase() };

  // Try line-based: first non-command line = name, next word with $ = symbol
  const lines = content.split("\n").filter((l) => l.trim() && !l.startsWith("!"));
  if (lines.length > 0) {
    const symbolMatch = content.match(/\$([A-Z0-9]{2,10})/);
    return {
      name: lines[0].trim().substring(0, 30),
      symbol: symbolMatch ? symbolMatch[1] : "???",
    };
  }

  return { name: "Unknown", symbol: "???" };
}

const KNOWN_COMMANDS: Record<string, string> = {
  "!4clawd": "4claw",
  "!kibu": "Kibu",
  "!clawnch": "Clawnch",
  "!molaunch": "Molaunch",
  "!synthlaunch": "SynthLaunch",
  "!fourclaw": "FourClaw.Fun",
};

// Detect any post that starts with ! -- known or unknown commands
function detectLaunchCommand(content: string): { command: string; launchpad: string } | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("!")) return null;
  const firstWord = trimmed.split(/\s+/)[0].toLowerCase();
  if (!firstWord || firstWord.length < 2) return null;
  const launchpad = KNOWN_COMMANDS[firstWord] || firstWord.replace("!", "").toUpperCase();
  return { command: firstWord, launchpad };
}

async function fetch4clawOrgPosts(): Promise<AgentPost[]> {
  const posts: AgentPost[] = [];
  try {
    const res = await fetch("https://www.4claw.org/api/v1/boards", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return posts;
    const data = await res.json();
    const allPosts = (data?.boards || data?.posts || data || []) as Record<string, unknown>[];

    // Flatten posts from boards
    const flatPosts: Record<string, unknown>[] = [];
    for (const item of allPosts.slice(0, 5)) {
      if (item.posts && Array.isArray(item.posts)) {
        flatPosts.push(...(item.posts as Record<string, unknown>[]).slice(0, 10));
      } else if (item.content || item.body) {
        flatPosts.push(item);
      }
    }

    for (const post of flatPosts.slice(0, 20)) {
      const content = String(post.content || post.body || "");
      const detected = detectLaunchCommand(content);
      if (detected) {
        const { name, symbol } = extractTokenInfo(content);
        posts.push({
          agent: "4claw.org",
          agentUrl: "https://www.4claw.org",
          launchCommand: detected.command,
          launchpad: detected.launchpad,
          tokenName: name,
          tokenSymbol: symbol,
          timestamp: String(post.created_at || post.timestamp || new Date().toISOString()),
          postUrl: post.url ? String(post.url) : "https://www.4claw.org",
        });
      }
    }
  } catch { /* ignore */ }
  return posts;
}

async function fetchMoltxPosts(): Promise<AgentPost[]> {
  const posts: AgentPost[] = [];
  try {
    const res = await fetch("https://moltx.io/v1/feed/global?limit=20", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return posts;
    const data = await res.json();
    const items = (data?.posts || data?.data || data || []) as Record<string, unknown>[];

    for (const post of items.slice(0, 20)) {
      const content = String(post.content || post.body || post.text || "");
      const detected = detectLaunchCommand(content);
      if (detected) {
        const { name, symbol } = extractTokenInfo(content);
        posts.push({
          agent: "Moltx",
          agentUrl: "https://moltx.io",
          launchCommand: detected.command,
          launchpad: detected.launchpad,
          tokenName: name,
          tokenSymbol: symbol,
          timestamp: String(post.created_at || post.timestamp || new Date().toISOString()),
          postUrl: post.id ? `https://moltx.io/post/${post.id}` : "https://moltx.io",
        });
      }
    }
  } catch { /* ignore */ }
  return posts;
}

async function fetchMoltbookPosts(): Promise<AgentPost[]> {
  const posts: AgentPost[] = [];
  try {
    const res = await fetch("https://www.moltbook.com/api/v1/submolts/crypto/posts?limit=20", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return posts;
    const data = await res.json();
    const items = (data?.posts || data?.data || data || []) as Record<string, unknown>[];

    for (const post of items.slice(0, 20)) {
      const content = String(post.content || post.body || post.text || "");
      const detected = detectLaunchCommand(content);
      if (detected) {
        const { name, symbol } = extractTokenInfo(content);
        posts.push({
          agent: "Moltbook",
          agentUrl: "https://www.moltbook.com",
          launchCommand: detected.command,
          launchpad: detected.launchpad,
          tokenName: name,
          tokenSymbol: symbol,
          timestamp: String(post.created_at || post.timestamp || new Date().toISOString()),
          postUrl: post.id ? `https://www.moltbook.com/post/${post.id}` : "https://www.moltbook.com",
        });
      }
    }
  } catch { /* ignore */ }
  return posts;
}

async function fetchBapBookPosts(): Promise<AgentPost[]> {
  const posts: AgentPost[] = [];
  try {
    const res = await fetch("https://app-ookzumda.fly.dev/api/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "feed", subbort: "tokens", limit: 20 }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return posts;
    const data = await res.json();
    const items = (data?.posts || data?.data || data || []) as Record<string, unknown>[];

    for (const post of items.slice(0, 20)) {
      const content = String(post.content || post.body || post.text || "");
      const detected = detectLaunchCommand(content);
      if (detected) {
        const { name, symbol } = extractTokenInfo(content);
        posts.push({
          agent: "BapBook",
          agentUrl: "https://bapbook.com",
          launchCommand: detected.command,
          launchpad: detected.launchpad,
          tokenName: name,
          tokenSymbol: symbol,
          timestamp: String(post.created_at || post.timestamp || new Date().toISOString()),
          postUrl: "https://bapbook.com",
        });
      }
    }
  } catch { /* ignore */ }
  return posts;
}

export async function GET() {
  const [a, b, c, d] = await Promise.all([
    fetch4clawOrgPosts(),
    fetchMoltxPosts(),
    fetchMoltbookPosts(),
    fetchBapBookPosts(),
  ]);

  const all = [...a, ...b, ...c, ...d]
    .sort((x, y) => new Date(y.timestamp).getTime() - new Date(x.timestamp).getTime())
    .slice(0, 30);

  return NextResponse.json({
    posts: all,
    total: all.length,
    agents: {
      "4claw.org": a.length,
      Moltx: b.length,
      Moltbook: c.length,
      BapBook: d.length,
    },
    timestamp: new Date().toISOString(),
  });
}
