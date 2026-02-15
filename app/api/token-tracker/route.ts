import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const ADMIN_ADDRESS = "0x9c6111C77CBE545B9703243F895EB593f2721C7a";
const CACHE_KEY = "token-tracker-cache";
const MILESTONE_KEY = "token-tracker-milestones";
const CACHE_TTL = 10; // 10 seconds

export interface TrackedToken {
  name: string;
  symbol: string;
  contractAddress: string;
  imageUrl: string;
  createdAt: string;
  age: string;
  mcap: number;
  mcapFormatted: string;
  volume24h: number;
  volumeFormatted: string;
  txns24h: number;
  priceChangePercent24h: number;
  adminShare: number;
  clankerUrl: string;
  status: "active" | "dead" | "mooning";
  milestoneReached: string | null; // e.g. "50K", "100K"
}

export interface TrackerSummary {
  totalTokens: number;
  totalMcap: number;
  totalVolume: number;
  activeCount: number;
  mooningCount: number;
}

const MILESTONES = [25_000, 30_000, 50_000, 100_000, 500_000, 1_000_000];

function formatMilestone(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`;
  return `${(v / 1_000).toFixed(0)}K`;
}

function formatNumber(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  if (v > 0) return `$${v.toFixed(2)}`;
  return "$0";
}

function getAge(dateStr: string): string {
  const now = Date.now();
  const created = new Date(dateStr).getTime();
  const diff = now - created;
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getStatus(vol24h: number, txns24h: number, priceChange: number): "active" | "dead" | "mooning" {
  if (priceChange > 50 && vol24h > 1000) return "mooning";
  if (txns24h < 5 && vol24h < 100) return "dead";
  return "active";
}

// Fetch tokens from clanker.world where ADMIN_ADDRESS is a fee recipient
async function fetchClankerTokens(): Promise<{
  contractAddress: string;
  name: string;
  symbol: string;
  imageUrl: string;
  createdAt: string;
  adminShare: number;
  clankerUrl: string;
}[]> {
  const tokens: {
    contractAddress: string;
    name: string;
    symbol: string;
    imageUrl: string;
    createdAt: string;
    adminShare: number;
    clankerUrl: string;
  }[] = [];

  let cursor: string | null = null;
  let pages = 0;

  // Paginate through all tokens (max 5 pages to be safe)
  while (pages < 5) {
    const params = new URLSearchParams({
      search: ADMIN_ADDRESS,
      limit: "50",
      sort: "desc",
    });
    if (cursor) params.set("cursor", cursor);

    try {
      const r = await fetch(
        `https://www.clanker.world/api/tokens?${params.toString()}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!r.ok) break;
      const data = await r.json();
      const items = data?.data || data?.tokens || [];

      for (const t of items) {
        // Check if our admin address is in the fee recipients
        const recipients = t.extensions?.fees?.recipients || [];
        const adminRecipient = recipients.find(
          (r: { admin?: string; recipient?: string }) =>
            r.admin?.toLowerCase() === ADMIN_ADDRESS.toLowerCase() ||
            r.recipient?.toLowerCase() === ADMIN_ADDRESS.toLowerCase()
        );

        // Also check if admin field matches
        const isAdmin = t.admin?.toLowerCase() === ADMIN_ADDRESS.toLowerCase();

        if (adminRecipient || isAdmin) {
          const share = adminRecipient ? (adminRecipient.bps || 8000) / 100 : 80;
          tokens.push({
            contractAddress: t.contract_address || "",
            name: t.name || "Unknown",
            symbol: (t.symbol || "???").replace(/^\$/, ""),
            imageUrl: t.img_url || t.metadata?.img_url || "",
            createdAt: t.created_at || t.deployed_at || new Date().toISOString(),
            adminShare: share,
            clankerUrl: `https://clanker.world/clanker/${t.contract_address}`,
          });
        }
      }

      if (!data?.hasMore) break;
      // Build cursor from last item
      const lastItem = items[items.length - 1];
      if (lastItem?.created_at) {
        cursor = Buffer.from(JSON.stringify({ id: lastItem.created_at })).toString("base64");
      } else {
        break;
      }
    } catch {
      break;
    }
    pages++;
  }

  return tokens;
}

// Enrich tokens with DexScreener market data (batch up to 30 addresses)
async function enrichWithDexScreener(contractAddresses: string[]): Promise<
  Map<string, { mcap: number; volume24h: number; txns24h: number; priceChange24h: number }>
> {
  const result = new Map<string, { mcap: number; volume24h: number; txns24h: number; priceChange24h: number }>();

  // DexScreener allows batch lookup: /tokens/v1/{chain}/{addr1},{addr2},...
  // Max 30 per request
  const chunks: string[][] = [];
  for (let i = 0; i < contractAddresses.length; i += 30) {
    chunks.push(contractAddresses.slice(i, i + 30));
  }

  for (const chunk of chunks) {
    try {
      const r = await fetch(
        `https://api.dexscreener.com/tokens/v1/base/${chunk.join(",")}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!r.ok) continue;
      const pairs = await r.json();

      for (const pair of Array.isArray(pairs) ? pairs : []) {
        const addr = pair.baseToken?.address?.toLowerCase();
        if (!addr) continue;
        const existing = result.get(addr);
        const mcap = pair.marketCap || pair.fdv || 0;
        const vol = pair.volume?.h24 || 0;
        const txBuys = pair.txns?.h24?.buys || 0;
        const txSells = pair.txns?.h24?.sells || 0;
        const change = pair.priceChange?.h24 || 0;

        // Keep the pair with highest volume for this token
        if (!existing || vol > existing.volume24h) {
          result.set(addr, {
            mcap,
            volume24h: vol,
            txns24h: txBuys + txSells,
            priceChange24h: change,
          });
        }
      }
    } catch { /* continue */ }
  }

  return result;
}

// Check and record milestones
async function checkMilestones(tokens: TrackedToken[]): Promise<void> {
  const existing = (await redis.get<Record<string, string[]>>(MILESTONE_KEY)) || {};

  for (const t of tokens) {
    const key = t.contractAddress.toLowerCase();
    const reached = existing[key] || [];

    for (const m of MILESTONES) {
      const label = formatMilestone(m);
      if (t.mcap >= m && !reached.includes(label)) {
        reached.push(label);
        t.milestoneReached = label;
      }
    }

    existing[key] = reached;
  }

  await redis.set(MILESTONE_KEY, existing);
}

export async function GET() {
  try {
    // Try cache first
    const cached = await redis.get<{ tokens: TrackedToken[]; summary: TrackerSummary; updatedAt: number }>(CACHE_KEY);
    if (cached && Date.now() - cached.updatedAt < CACHE_TTL * 1000) {
      return NextResponse.json(cached);
    }

    // Fetch fresh data
    const clankerTokens = await fetchClankerTokens();
    if (clankerTokens.length === 0) {
      return NextResponse.json({
        tokens: [],
        summary: { totalTokens: 0, totalMcap: 0, totalVolume: 0, activeCount: 0, mooningCount: 0 },
        updatedAt: Date.now(),
      });
    }

    // Enrich with DexScreener data
    const addresses = clankerTokens.map((t) => t.contractAddress);
    const marketData = await enrichWithDexScreener(addresses);

    // Build tracked tokens
    const tracked: TrackedToken[] = clankerTokens.map((t) => {
      const data = marketData.get(t.contractAddress.toLowerCase()) || {
        mcap: 0, volume24h: 0, txns24h: 0, priceChange24h: 0,
      };

      return {
        name: t.name,
        symbol: t.symbol,
        contractAddress: t.contractAddress,
        imageUrl: t.imageUrl,
        createdAt: t.createdAt,
        age: getAge(t.createdAt),
        mcap: data.mcap,
        mcapFormatted: formatNumber(data.mcap),
        volume24h: data.volume24h,
        volumeFormatted: formatNumber(data.volume24h),
        txns24h: data.txns24h,
        priceChangePercent24h: data.priceChange24h,
        adminShare: t.adminShare,
        clankerUrl: t.clankerUrl,
        status: getStatus(data.volume24h, data.txns24h, data.priceChange24h),
        milestoneReached: null,
      };
    });

    // Sort by mcap desc
    tracked.sort((a, b) => b.mcap - a.mcap);

    // Check milestones
    await checkMilestones(tracked);

    // Build summary
    const summary: TrackerSummary = {
      totalTokens: tracked.length,
      totalMcap: tracked.reduce((s, t) => s + t.mcap, 0),
      totalVolume: tracked.reduce((s, t) => s + t.volume24h, 0),
      activeCount: tracked.filter((t) => t.status === "active").length,
      mooningCount: tracked.filter((t) => t.status === "mooning").length,
    };

    const payload = { tokens: tracked, summary, updatedAt: Date.now() };

    // Cache in Redis
    await redis.set(CACHE_KEY, payload, { ex: CACHE_TTL });

    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
