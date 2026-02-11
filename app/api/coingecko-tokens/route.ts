import { NextResponse } from "next/server";

// CoinGecko free API - trending tokens
const CG_API = "https://api.coingecko.com/api/v3";

const CHAIN_PLATFORM: Record<string, string> = {
  bsc: "binance-smart-chain",
  base: "base",
  solana: "solana",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chain = searchParams.get("chain") || "bsc";

  try {
    // CoinGecko trending search
    const res = await fetch(`${CG_API}/search/trending`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });

    if (!res.ok) throw new Error(`CoinGecko returned ${res.status}`);
    const data = await res.json();

    const platform = CHAIN_PLATFORM[chain];
    const coins = (data?.coins || []).slice(0, 20);

    const tokens = coins
      .map(
        (c: {
          item: {
            id: string;
            coin_id: number;
            name: string;
            symbol: string;
            thumb: string;
            large: string;
            small: string;
            data?: {
              price: string | number;
              price_change_percentage_24h?: Record<string, number>;
              total_volume?: string;
              market_cap?: string;
            };
            platforms?: Record<string, string>;
          };
        }) => {
          const item = c.item;
          // Check if token exists on selected chain
          const hasChain =
            !platform ||
            (item.platforms && item.platforms[platform]) ||
            chain === "bsc"; // default show on BSC if no filter

          if (!hasChain) return null;

          return {
            id: `cg_${item.id}`,
            name: item.name,
            symbol: item.symbol?.toUpperCase() || "???",
            quote: "",
            priceUsd: item.data?.price?.toString() || null,
            priceChange1h: null,
            priceChange24h:
              item.data?.price_change_percentage_24h?.usd?.toString() || null,
            volume24h: item.data?.total_volume || null,
            liquidity: null,
            createdAt: null,
            fdvUsd: item.data?.market_cap || null,
            chain,
            poolAddress: "",
            dex: "coingecko",
            imageUrl: item.large || item.small || item.thumb || null,
            website: null,
            tokenDescription: null,
          };
        },
      )
      .filter(Boolean);

    return NextResponse.json({ tokens, chain, source: "coingecko" });
  } catch (error) {
    console.error("CoinGecko error:", error);
    return NextResponse.json(
      { error: "Failed to fetch CoinGecko tokens", tokens: [] },
      { status: 500 },
    );
  }
}
