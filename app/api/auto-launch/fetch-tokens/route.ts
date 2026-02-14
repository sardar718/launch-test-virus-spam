import { NextResponse } from "next/server";

// Rotate between 5 different free API sources for variety
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

/**
 * Parse a GeckoTerminal pool + its included base_token data.
 * Each pool links to a unique base_token which has its own image_url.
 */
function parseGeckoPool(
  pool: Record<string, unknown>,
  included: Record<string, unknown>[],
  chain: string,
): AutoToken | null {
  const a = pool.attributes as Record<string, unknown>;
  if (!a) return null;

  const nameParts = ((a.name as string) || "").split(" / ");

  // Find the base token in the included array by matching the relationship ID
  const relationships = pool.relationships as Record<string, Record<string, Record<string, string>>> | undefined;
  const baseTokenId = relationships?.base_token?.data?.id || "";
  const tokenInfo = included.find((i: Record<string, unknown>) => i.id === baseTokenId);
  const ta = tokenInfo?.attributes as Record<string, unknown> | undefined;

  // Extract the token-specific image URL -- check multiple locations
  let imageUrl: string | undefined;

  // 1) Direct image_url on the token included object
  if (ta?.image_url && typeof ta.image_url === "string" && ta.image_url.startsWith("http")) {
    imageUrl = ta.image_url;
  }

  // 2) Check token_info.image_url (GeckoTerminal nested format)
  if (!imageUrl) {
    const tokenInfoImg = (ta as Record<string, unknown>)?.token_info;
    if (tokenInfoImg && typeof tokenInfoImg === "object") {
      const infoObj = tokenInfoImg as Record<string, unknown>;
      if (infoObj.image_url && typeof infoObj.image_url === "string" && (infoObj.image_url as string).startsWith("http")) {
        imageUrl = infoObj.image_url as string;
      }
    }
  }

  // 3) Pool-level image_url (some pools have their own)
  if (!imageUrl && a?.image_url && typeof a.image_url === "string" && (a.image_url as string).startsWith("http")) {
    imageUrl = a.image_url as string;
  }

  // 4) CoinGecko CDN via coin_id
  if (!imageUrl && ta?.coingecko_coin_id) {
    imageUrl = `https://assets.coingecko.com/coins/images/${ta.coingecko_coin_id}/small/logo.png`;
  }

  // Extract website from token info
  let website: string | undefined;
  const websites = ta?.websites as string[] | undefined;
  if (websites && websites.length > 0) {
    website = websites[0];
  }

  return {
    name: (ta?.name as string) || nameParts[0] || "Unknown",
    symbol: (ta?.symbol as string) || nameParts[0]?.split(" ").pop() || "???",
    imageUrl,
    website,
    description: (ta?.description as string) || undefined,
    volume24h: (a.volume_usd as Record<string, string>)?.h24 || "0",
    chain,
    source: "gecko",
  };
}

/**
 * Parse a DexScreener pair.
 * Each pair has its own info.imageUrl for the token's unique logo.
 */
function parseDexPair(pair: Record<string, unknown>): AutoToken | null {
  const bt = pair.baseToken as Record<string, string>;
  if (!bt) return null;

  const info = pair.info as Record<string, unknown> | undefined;
  const websites = (info?.websites as { url: string }[]) || [];
  const socials = (info?.socials as { type: string; url: string }[]) || [];
  const twitter = socials.find((s) => s.type === "twitter");

  // Per-token image from DexScreener's info object -- check multiple locations
  let imageUrl: string | undefined;
  if (info?.imageUrl && typeof info.imageUrl === "string" && (info.imageUrl as string).startsWith("http")) {
    imageUrl = info.imageUrl as string;
  }
  // Try header image
  if (!imageUrl && info?.header && typeof info.header === "string" && (info.header as string).startsWith("http")) {
    imageUrl = info.header as string;
  }
  // Try icon from baseToken
  if (!imageUrl && bt?.icon && typeof bt.icon === "string" && bt.icon.startsWith("http")) {
    imageUrl = bt.icon;
  }
  // Try openGraph image
  if (!imageUrl && info?.openGraph && typeof (info.openGraph as Record<string, unknown>)?.image === "string") {
    const ogImg = (info.openGraph as Record<string, string>).image;
    if (ogImg.startsWith("http")) imageUrl = ogImg;
  }

  return {
    name: bt.name || "Unknown",
    symbol: bt.symbol || "???",
    imageUrl,
    website: websites[0]?.url || twitter?.url || undefined,
    description: undefined,
    volume24h: ((pair.volume as Record<string, number>)?.h24 || 0).toString(),
    chain: (pair.chainId as string) === "bsc" ? "bsc" : (pair.chainId as string) === "base" ? "base" : (pair.chainId as string) || "bsc",
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
      {
        error: String(error),
        source: src.label,
        sourceIndex,
        nextSourceIndex: (sourceIndex + 1) % SOURCES.length,
        tokens: [],
      },
      { status: 200 },
    );
  }
}
