import { NextResponse } from "next/server";

/**
 * Looks up the X/Twitter handle and website for a token name.
 * Only returns VERIFIED results from CoinGecko. Never invents fake accounts.
 */
export async function POST(request: Request) {
  try {
    const { name, symbol } = await request.json();
    if (!name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    let twitter = "";
    let website = "";

    // Strategy 1: Search CoinGecko for matching token (real project links)
    try {
      const cgRes = await fetch(
        `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(name)}`,
      );
      if (cgRes.ok) {
        const cgData = await cgRes.json();
        const coins = cgData?.coins || [];
        const match = coins.find(
          (c: { symbol?: string; name?: string }) =>
            c.symbol?.toUpperCase() === (symbol || "").toUpperCase() ||
            c.name?.toLowerCase() === name.toLowerCase(),
        );
        if (match?.id) {
          const detailRes = await fetch(
            `https://api.coingecko.com/api/v3/coins/${match.id}?localization=false&tickers=false&market_data=false&community_data=true&developer_data=false`,
          );
          if (detailRes.ok) {
            const detail = await detailRes.json();
            twitter = detail?.links?.twitter_screen_name
              ? `@${detail.links.twitter_screen_name}`
              : "";
            const hp = detail?.links?.homepage?.[0] || "";
            website = hp && hp !== "" ? hp : "";
          }
        }
      }
    } catch { /* fall through */ }

    // Strategy 2: Search DexScreener for token info (has social links)
    if (!twitter && !website && symbol) {
      try {
        const dexRes = await fetch(
          `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(symbol)}`,
        );
        if (dexRes.ok) {
          const dexData = await dexRes.json();
          const pair = dexData?.pairs?.[0];
          if (pair?.info?.socials) {
            for (const s of pair.info.socials) {
              if (s.type === "twitter" && s.url) twitter = s.url;
            }
          }
          if (pair?.info?.websites?.[0]?.url) {
            website = pair.info.websites[0].url;
          }
        }
      } catch { /* fall through */ }
    }

    // NO fallback -- never invent fake accounts
    // Return empty strings if nothing was found
    return NextResponse.json({ twitter, website });
  } catch (error) {
    console.error("Lookup socials error:", error);
    return NextResponse.json({ error: "Failed to lookup" }, { status: 500 });
  }
}
