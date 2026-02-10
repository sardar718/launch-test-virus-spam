import { NextResponse } from "next/server";

const GECKO_BASE = "https://api.geckoterminal.com/api/v2";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "new"; // "new" | "trending"

  try {
    let url: string;
    if (type === "trending") {
      url = `${GECKO_BASE}/networks/bsc/trending_pools`;
    } else {
      url = `${GECKO_BASE}/networks/bsc/new_pools`;
    }

    const res = await fetch(url, {
      headers: {
        Accept: "application/json;version=20230203",
      },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      throw new Error(`GeckoTerminal API returned ${res.status}`);
    }

    const data = await res.json();

    interface PoolAttributes {
      name: string;
      base_token_price_usd: string | null;
      quote_token_price_usd: string | null;
      fdv_usd: string | null;
      market_cap_usd: string | null;
      price_change_percentage: {
        h1?: string;
        h24?: string;
      };
      volume_usd: {
        h1?: string;
        h24?: string;
      };
      reserve_in_usd: string | null;
      pool_created_at: string | null;
      transactions: {
        h1?: { buys: number; sells: number };
        h24?: { buys: number; sells: number };
      };
    }

    interface PoolRelationshipData {
      id: string;
      type: string;
    }

    interface Pool {
      id: string;
      attributes: PoolAttributes;
      relationships?: {
        base_token?: { data?: PoolRelationshipData };
        dex?: { data?: PoolRelationshipData };
      };
    }

    const pools = (data.data || []).map((pool: Pool) => {
      const attrs = pool.attributes;
      const baseTokenId =
        pool.relationships?.base_token?.data?.id?.split("_")[1] || "";
      const dexId =
        pool.relationships?.dex?.data?.id?.split("_")[1] || "unknown";

      return {
        id: pool.id,
        name: attrs.name,
        priceUsd: attrs.base_token_price_usd,
        fdvUsd: attrs.fdv_usd,
        marketCapUsd: attrs.market_cap_usd,
        priceChange1h: attrs.price_change_percentage?.h1,
        priceChange24h: attrs.price_change_percentage?.h24,
        volume1h: attrs.volume_usd?.h1,
        volume24h: attrs.volume_usd?.h24,
        liquidity: attrs.reserve_in_usd,
        createdAt: attrs.pool_created_at,
        txns1h: attrs.transactions?.h1,
        txns24h: attrs.transactions?.h24,
        baseTokenAddress: baseTokenId,
        dex: dexId,
      };
    });

    return NextResponse.json({ pools, type });
  } catch (error) {
    console.error("GeckoTerminal API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch BSC tokens", pools: [] },
      { status: 500 }
    );
  }
}
