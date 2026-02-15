import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { name, symbol } = await request.json();
    if (!name) {
      return NextResponse.json({ error: "Token name required" }, { status: 400 });
    }

    const query = `${name} ${symbol || ""} crypto token logo png`;
    const encodedQuery = encodeURIComponent(query);

    // Attempt 1: Use Serper.dev (if key available)
    if (process.env.SERPER_API_KEY) {
      try {
        const res = await fetch("https://google.serper.dev/images", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": process.env.SERPER_API_KEY,
          },
          body: JSON.stringify({ q: query, num: 5 }),
        });
        if (res.ok) {
          const data = await res.json();
          const images = data?.images || [];
          const pngImage = images.find((img: { imageUrl?: string }) =>
            img.imageUrl?.match(/\.(png|jpg|jpeg|webp)$/i),
          );
          if (pngImage?.imageUrl) {
            return NextResponse.json({ url: pngImage.imageUrl, source: "google" });
          }
          if (images[0]?.imageUrl) {
            return NextResponse.json({ url: images[0].imageUrl, source: "google" });
          }
        }
      } catch { /* fall through */ }
    }

    // Attempt 2: DuckDuckGo image search via Lite (no API key)
    try {
      const ddgRes = await fetch(
        `https://lite.duckduckgo.com/lite?q=${encodedQuery}&kp=-2&kl=us-en`,
        { headers: { "User-Agent": "Mozilla/5.0" } },
      );
      if (ddgRes.ok) {
        const html = await ddgRes.text();
        // Try to extract image links from results
        const imgMatches = html.match(/https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|webp)/gi);
        if (imgMatches && imgMatches.length > 0) {
          // Filter for likely token logos (prefer .png)
          const pngUrl = imgMatches.find((u) => u.endsWith(".png")) || imgMatches[0];
          return NextResponse.json({ url: pngUrl, source: "duckduckgo" });
        }
      }
    } catch { /* fall through */ }

    // Attempt 3: GeckoTerminal search by name (can find contract-based images)
    try {
      const gtRes = await fetch(
        `https://api.geckoterminal.com/api/v2/search/pools?query=${encodeURIComponent(name)}&page=1`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (gtRes.ok) {
        const gtData = await gtRes.json();
        const pools = gtData?.data || [];
        for (const pool of (Array.isArray(pools) ? pools : []).slice(0, 5)) {
          const attrs = pool?.attributes || {};
          const baseTokenName = (attrs.name || "").split("/")[0]?.trim()?.toLowerCase();
          if (baseTokenName && (baseTokenName === name.toLowerCase() || baseTokenName.includes(name.toLowerCase().slice(0, 4)))) {
            // Try to get token image from included relationships
            const tokenId = pool?.relationships?.base_token?.data?.id;
            if (tokenId) {
              const [network, addr] = tokenId.split("_");
              if (network && addr) {
                // GeckoTerminal token info endpoint has image_url
                try {
                  const tokenRes = await fetch(
                    `https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${addr}`,
                    { signal: AbortSignal.timeout(4000) }
                  );
                  if (tokenRes.ok) {
                    const tokenData = await tokenRes.json();
                    const imgUrl = tokenData?.data?.attributes?.image_url;
                    if (imgUrl && (imgUrl.endsWith(".png") || imgUrl.endsWith(".jpg") || imgUrl.endsWith(".jpeg") || imgUrl.includes("assets.geckoterminal.com"))) {
                      return NextResponse.json({ url: imgUrl, source: "geckoterminal" });
                    }
                  }
                } catch { /* continue */ }
              }
            }
          }
        }
      }
    } catch { /* fall through */ }

    // Attempt 4: Search CoinGecko for token image by name
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
        if (match?.large) {
          return NextResponse.json({ url: match.large, source: "coingecko" });
        }
        if (coins[0]?.large) {
          return NextResponse.json({ url: coins[0].large, source: "coingecko" });
        }
      }
    } catch { /* fall through */ }

    return NextResponse.json({ error: "No image found. Try AI Generate instead." }, { status: 404 });
  } catch (error) {
    console.error("Search image error:", error);
    return NextResponse.json({ error: "Failed to search image" }, { status: 500 });
  }
}
