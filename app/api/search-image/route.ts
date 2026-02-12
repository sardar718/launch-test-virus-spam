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

    // Attempt 3: Search CoinGecko for token image by name
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
