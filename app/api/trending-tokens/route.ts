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
        ? `${GECKO_BASE}/networks/${network}/new_pools?page=1`
        : `${GECKO_BASE}/networks/${network}/trending_pools?page=1`;

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

    const tokens = (data.data || []).slice(0, 30).map((pool: GeckoPool) => {
      const a = pool.attributes;
      const nameParts = a.name.split(" / ");
      return {
        id: pool.id,
        name: nameParts[0] || a.name,
        quote: nameParts[1] || "",
        symbol: (nameParts[0] || "").split(" ").pop() || nameParts[0],
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
