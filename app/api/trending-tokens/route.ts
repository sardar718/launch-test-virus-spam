import { NextResponse } from "next/server";

const GECKO_BASE = "https://api.geckoterminal.com/api/v2";

const CHAIN_MAP: Record<string, string> = {
  bsc: "bsc",
  base: "base",
  solana: "solana",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chain = searchParams.get("chain") || "bsc";
  const type = searchParams.get("type") || "trending"; // "trending" | "new"

  const network = CHAIN_MAP[chain] || "bsc";

  try {
    const endpoint =
      type === "new"
        ? `${GECKO_BASE}/networks/${network}/new_pools?page=1&include=base_token`
        : `${GECKO_BASE}/networks/${network}/trending_pools?page=1&include=base_token`;

    const res = await fetch(endpoint, {
      headers: { Accept: "application/json;version=20230203" },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      throw new Error(`GeckoTerminal returned ${res.status}`);
    }

    const data = await res.json();

    interface GeckoPool {
      id: string;
      attributes: {
        name: string;
        base_token_price_usd: string | null;
        fdv_usd: string | null;
        market_cap_usd: string | null;
        price_change_percentage: { h1?: string; h24?: string };
        volume_usd: { h1?: string; h24?: string };
        reserve_in_usd: string | null;
        pool_created_at: string | null;
        transactions: {
          h1?: { buys: number; sells: number };
          h24?: { buys: number; sells: number };
        };
      };
      relationships?: {
        base_token?: { data?: { id: string } };
        dex?: { data?: { id: string } };
      };
    }

    // Build a map of included token data (GeckoTerminal includes base token info)
    const includedTokens: Record<string, { name: string; symbol: string; image_url: string | null; websites: string[]; twitter: string | null; description: string | null }> = {};
    if (data.included) {
      for (const inc of data.included) {
        if (inc.type === "token") {
          // GeckoTerminal may have twitter_handle in attributes
          const tw = inc.attributes?.twitter_handle || null;
          includedTokens[inc.id] = {
            name: inc.attributes?.name || "",
            symbol: inc.attributes?.symbol || "",
            image_url: inc.attributes?.image_url || null,
            websites: inc.attributes?.websites || [],
            twitter: tw ? (tw.startsWith("@") ? tw : `@${tw}`) : null,
            description: inc.attributes?.description || null,
          };
        }
      }
    }

    const tokens = (data.data || []).slice(0, 30).map((pool: GeckoPool) => {
      const a = pool.attributes;
      const nameParts = a.name.split(" / ");
      const baseTokenId = pool.relationships?.base_token?.data?.id;
      const tokenInfo = baseTokenId ? includedTokens[baseTokenId] : null;

      return {
        id: pool.id,
        name: tokenInfo?.name || nameParts[0] || a.name,
        quote: nameParts[1] || "",
        symbol: tokenInfo?.symbol || (nameParts[0] || "").split(" ").pop() || nameParts[0],
        imageUrl: tokenInfo?.image_url || null,
        website: tokenInfo?.websites?.[0] || null,
        twitter: tokenInfo?.twitter || null,
        tokenDescription: tokenInfo?.description || null,
        priceUsd: a.base_token_price_usd,
        priceChange1h: a.price_change_percentage?.h1,
        priceChange24h: a.price_change_percentage?.h24,
        volume24h: a.volume_usd?.h24,
        liquidity: a.reserve_in_usd,
        createdAt: a.pool_created_at,
        fdvUsd: a.fdv_usd,
        chain,
        poolAddress: pool.id.replace(`${network}_`, ""),
        dex: pool.relationships?.dex?.data?.id?.split("_")[1] || "unknown",
      };
    });

    return NextResponse.json({ tokens, chain, type });
  } catch (error) {
    console.error("Trending tokens error:", error);
    return NextResponse.json(
      { error: "Failed to fetch trending tokens", tokens: [] },
      { status: 500 }
    );
  }
}
