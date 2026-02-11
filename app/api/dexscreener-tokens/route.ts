import { NextResponse } from "next/server";

// DexScreener free public API - boosted & most active tokens
const DEXSCREENER_API = "https://api.dexscreener.com";

const CHAIN_MAP: Record<string, string> = {
  bsc: "bsc",
  base: "base",
  solana: "solana",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chain = searchParams.get("chain") || "bsc";
  const network = CHAIN_MAP[chain] || "bsc";

  try {
    // DexScreener "boosted" tokens for the chain
    const res = await fetch(
      `${DEXSCREENER_API}/token-boosts/top/v1`,
      { next: { revalidate: 120 } },
    );

    if (!res.ok) throw new Error(`DexScreener returned ${res.status}`);
    const data = await res.json();

    // Filter by chain
    const filtered = (data || [])
      .filter((t: { chainId: string }) => t.chainId === network)
      .slice(0, 20);

    // Get detailed pair data for these tokens
    const tokenAddresses = filtered
      .map((t: { tokenAddress: string }) => t.tokenAddress)
      .slice(0, 10);

    let pairs: Array<{
      chainId: string;
      pairAddress: string;
      baseToken: { address: string; name: string; symbol: string };
      priceUsd: string;
      priceChange: { h1?: number; h24?: number };
      volume: { h24?: number };
      liquidity: { usd?: number };
      pairCreatedAt: number;
      fdv: number;
      url: string;
      info?: { imageUrl?: string; websites?: Array<{ url: string }>; socials?: Array<{ type: string; url: string }> };
    }> = [];

    if (tokenAddresses.length > 0) {
      const pairRes = await fetch(
        `${DEXSCREENER_API}/tokens/v1/${network}/${tokenAddresses.join(",")}`,
        { next: { revalidate: 120 } },
      );
      if (pairRes.ok) {
        const pairData = await pairRes.json();
        // Get the best pair (highest liquidity) for each token
        const seen = new Set<string>();
        for (const p of pairData || []) {
          const addr = p.baseToken?.address;
          if (addr && !seen.has(addr)) {
            seen.add(addr);
            pairs.push(p);
          }
        }
      }
    }

    const tokens = pairs.map((p) => ({
      id: `dex_${p.pairAddress}`,
      name: p.baseToken?.name || "Unknown",
      symbol: p.baseToken?.symbol || "???",
      quote: "",
      priceUsd: p.priceUsd || null,
      priceChange1h: p.priceChange?.h1?.toString() || null,
      priceChange24h: p.priceChange?.h24?.toString() || null,
      volume24h: p.volume?.h24?.toString() || null,
      liquidity: p.liquidity?.usd?.toString() || null,
      createdAt: p.pairCreatedAt
        ? new Date(p.pairCreatedAt).toISOString()
        : null,
      fdvUsd: p.fdv?.toString() || null,
      chain,
      poolAddress: p.pairAddress,
      dex: "dexscreener",
      imageUrl: p.info?.imageUrl || null,
      website: p.info?.websites?.[0]?.url || null,
      twitter: p.info?.socials?.find((s: { type: string }) => s.type === "twitter")?.url || null,
      telegram: p.info?.socials?.find((s: { type: string }) => s.type === "telegram")?.url || null,
      tokenDescription: null,
    }));

    return NextResponse.json({ tokens, chain, source: "dexscreener" });
  } catch (error) {
    console.error("DexScreener error:", error);
    return NextResponse.json(
      { error: "Failed to fetch DexScreener tokens", tokens: [] },
      { status: 500 },
    );
  }
}
