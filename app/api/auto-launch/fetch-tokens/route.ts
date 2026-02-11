import { NextResponse } from "next/server";

// Rotate between 3 different free APIs for variety
const SOURCES = [
  {
    id: "gecko_bsc",
    label: "GeckoTerminal BSC",
    url: "https://api.geckoterminal.com/api/v2/networks/bsc/new_pools?page=1&include=base_token",
  },
  {
    id: "gecko_base",
    label: "GeckoTerminal Base",
    url: "https://api.geckoterminal.com/api/v2/networks/base/new_pools?page=1&include=base_token",
  },
  {
    id: "gecko_sol",
    label: "GeckoTerminal Solana",
    url: "https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=1&include=base_token",
  },
  {
    id: "dex_bsc",
    label: "DexScreener BSC",
    url: "https://api.dexscreener.com/latest/dex/search?q=bsc%20new",
  },
  {
    id: "dex_base",
    label: "DexScreener Base",
    url: "https://api.dexscreener.com/latest/dex/search?q=base%20new",
  },
];

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

function parseGeckoPool(pool: Record<string, unknown>, included: Record<string, unknown>[], chain: string): AutoToken | null {
  const a = pool.attributes as Record<string, unknown>;
  if (!a) return null;
  const nameParts = ((a.name as string) || "").split(" / ");
  const baseTokenId = ((pool.relationships as Record<string, Record<string, Record<string, string>>>)?.base_token?.data?.id) || "";
  const tokenInfo = included.find((i: Record<string, unknown>) => i.id === baseTokenId);
  const ta = tokenInfo?.attributes as Record<string, unknown> | undefined;

  return {
    name: (ta?.name as string) || nameParts[0] || "Unknown",
    symbol: (ta?.symbol as string) || nameParts[0]?.split(" ").pop() || "???",
    imageUrl: (ta?.image_url as string) || undefined,
    website: ((ta?.websites as string[]) || [])[0] || undefined,
    description: (ta?.description as string) || undefined,
    volume24h: (a.volume_usd as Record<string, string>)?.h24 || "0",
    chain,
    source: "gecko",
  };
}

function parseDexPair(pair: Record<string, unknown>): AutoToken | null {
  const bt = pair.baseToken as Record<string, string>;
  if (!bt) return null;
  const info = pair.info as Record<string, unknown> | undefined;
  const websites = (info?.websites as { url: string }[]) || [];
  const socials = (info?.socials as { type: string; url: string }[]) || [];
  const twitter = socials.find((s) => s.type === "twitter");

  return {
    name: bt.name || "Unknown",
    symbol: bt.symbol || "???",
    imageUrl: (info?.imageUrl as string) || undefined,
    website: websites[0]?.url || twitter?.url || undefined,
    description: undefined,
    volume24h: ((pair.volume as Record<string, number>)?.h24 || 0).toString(),
    chain: (pair.chainId as string) === "bsc" ? "bsc" : "base",
    source: "dexscreener",
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sourceIndex = Number.parseInt(searchParams.get("sourceIndex") || "0", 10) % SOURCES.length;
  const minVolume = Number.parseFloat(searchParams.get("minVolume") || "0");

  const src = SOURCES[sourceIndex];

  try {
    const res = await fetch(src.url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`${src.label} returned ${res.status}`);

    const json = await res.json();
    let tokens: AutoToken[] = [];

    if (src.id.startsWith("gecko_")) {
      const chain = src.id.replace("gecko_", "");
      const included = json.included || [];
      tokens = (json.data || [])
        .slice(0, 25)
        .map((p: Record<string, unknown>) => parseGeckoPool(p, included, chain))
        .filter(Boolean) as AutoToken[];
    } else {
      tokens = (json.pairs || [])
        .slice(0, 25)
        .map(parseDexPair)
        .filter(Boolean) as AutoToken[];
    }

    // Filter by minimum volume if set
    if (minVolume > 0) {
      tokens = tokens.filter((t) => Number.parseFloat(t.volume24h || "0") >= minVolume);
    }

    return NextResponse.json({
      source: src.label,
      sourceIndex,
      nextSourceIndex: (sourceIndex + 1) % SOURCES.length,
      tokens,
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error), source: src.label, sourceIndex, nextSourceIndex: (sourceIndex + 1) % SOURCES.length, tokens: [] },
      { status: 200 }, // Return 200 so the loop doesn't break
    );
  }
}
