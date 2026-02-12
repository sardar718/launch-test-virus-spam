import { NextResponse } from "next/server";

// CoinGecko free API
const CG_API = "https://api.coingecko.com/api/v3";

const CHAIN_PLATFORM: Record<string, string> = {
  bsc: "binance-smart-chain",
  base: "base",
  solana: "solana",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chain = searchParams.get("chain") || "bsc";
  const feedType = searchParams.get("type") || "trending";

  try {
    // For "trending" (hot) use the trending endpoint
    // For "new" use recently added coins endpoint
    const apiUrl =
      feedType === "new"
        ? `${CG_API}/coins/list/new`
        : `${CG_API}/search/trending`;

    const res = await fetch(apiUrl, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });

    if (!res.ok) throw new Error(`CoinGecko returned ${res.status}`);
    const data = await res.json();

    const platform = CHAIN_PLATFORM[chain];

    if (feedType === "new") {
      // /coins/list/new returns array of {id, symbol, name, activated_at}
      const newCoins = Array.isArray(data) ? data.slice(0, 20) : [];
      const tokens = newCoins.map(
        (coin: { id: string; symbol: string; name: string; activated_at?: number }) => ({
          id: `cg_${coin.id}`,
          name: coin.name,
          symbol: coin.symbol?.toUpperCase() || "???",
          quote: "",
          priceUsd: null,
          priceChange1h: null,
          priceChange24h: null,
          volume24h: null,
          liquidity: null,
          createdAt: coin.activated_at
            ? new Date(coin.activated_at * 1000).toISOString()
            : null,
          fdvUsd: null,
          chain,
          poolAddress: "",
          dex: "coingecko",
          imageUrl: null,
          website: null,
          tokenDescription: null,
        }),
      );
      return NextResponse.json({ tokens, chain, source: "coingecko" });
    }

    // Trending endpoint
    const coins = (data?.coins || []).slice(0, 20);
    const tokens = coins
      .map(
        (c: {
          item: {
            id: string;
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
          const hasChain =
            !platform ||
            (item.platforms && item.platforms[platform]) ||
            chain === "bsc";

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
