import { NextResponse } from "next/server";

// ── Types ──
interface TrendItem {
  name: string;
  symbol: string;
  imageUrl: string; // Must be real .png/.jpg/.webp
  source: string;   // "google_trends" | "twitter" | "coingecko" | "dexscreener"
  description?: string;
}

// ── Helpers ──
function isRealImage(url: string): boolean {
  if (!url || !url.startsWith("http")) return false;
  if (url.includes("pollinations.ai") || url.includes("dicebear.com")) return false;
  const l = url.toLowerCase();
  if (l.match(/\.(png|jpg|jpeg|webp|gif|svg)(\?|$)/)) return true;
  if (l.includes("coingecko.com") || l.includes("dexscreener.com")) return true;
  if (l.includes("assets.") || l.includes("/images/") || l.includes("/logo")) return true;
  if (l.includes("pbs.twimg.com") || l.includes("abs.twimg.com")) return true;
  return false;
}

function toSymbol(name: string): string {
  // Remove special chars, take first word, max 8 chars, uppercase
  const clean = name.replace(/[^a-zA-Z0-9\s]/g, "").trim().split(/\s+/)[0].toUpperCase();
  return clean.substring(0, 8) || "TREND";
}

// Search Google Images for a real .png/.jpg image of a topic
async function searchImage(query: string): Promise<string> {
  const encoded = encodeURIComponent(`${query} logo png`);

  // Try Serper if key available
  if (process.env.SERPER_API_KEY) {
    try {
      const res = await fetch("https://google.serper.dev/images", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": process.env.SERPER_API_KEY },
        body: JSON.stringify({ q: `${query} logo`, num: 10 }),
      });
      if (res.ok) {
        const data = await res.json();
        for (const img of data?.images || []) {
          if (img.imageUrl && isRealImage(img.imageUrl)) return img.imageUrl;
        }
      }
    } catch { /* fall through */ }
  }

  // DuckDuckGo lite fallback
  try {
    const r = await fetch(`https://lite.duckduckgo.com/lite?q=${encoded}&kp=-2&kl=us-en`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (r.ok) {
      const html = await r.text();
      const matches = html.match(/https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|webp)/gi);
      if (matches) {
        for (const m of matches) {
          if (isRealImage(m)) return m;
        }
      }
    }
  } catch { /* fall through */ }

  return "";
}

// ── Source 1: Google Trends (via RSS feed -- no API key needed) ──
async function fetchGoogleTrends(): Promise<TrendItem[]> {
  const items: TrendItem[] = [];
  try {
    // Google Trends RSS for daily trending searches
    const res = await fetch("https://trends.google.com/trends/trendingsearches/daily/rss?geo=US", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return items;
    const xml = await res.text();

    // Parse titles from RSS XML
    const titleMatches = xml.match(/<title>(?!Daily Search Trends)([^<]+)<\/title>/g) || [];
    // Parse image URLs from ht:picture tags
    const imageMatches = xml.match(/<ht:picture>([^<]+)<\/ht:picture>/g) || [];

    const limit = Math.min(titleMatches.length, 10);
    for (let i = 0; i < limit; i++) {
      const name = titleMatches[i]?.replace(/<\/?title>/g, "").trim();
      if (!name) continue;

      // Extract image from RSS data
      let imageUrl = "";
      if (imageMatches[i]) {
        const imgUrl = imageMatches[i].replace(/<\/?ht:picture>/g, "").trim();
        if (isRealImage(imgUrl)) imageUrl = imgUrl;
      }

      // If no image from RSS, search for one
      if (!imageUrl) {
        imageUrl = await searchImage(name);
      }

      // Skip items without a real image
      if (!imageUrl) continue;

      items.push({
        name,
        symbol: toSymbol(name),
        imageUrl,
        source: "google_trends",
        description: `Trending on Google: ${name}`,
      });
    }
  } catch (e) {
    console.error("Google Trends error:", e);
  }
  return items;
}

// ── Source 2: Twitter/X Trending (via Nitter or public API) ──
async function fetchTwitterTrending(): Promise<TrendItem[]> {
  const items: TrendItem[] = [];
  try {
    // Try multiple Nitter instances for trending topics
    const nitterHosts = [
      "https://nitter.privacydev.net",
      "https://nitter.poast.org",
      "https://nitter.net",
    ];

    for (const host of nitterHosts) {
      try {
        const res = await fetch(`${host}/search?f=tweets&q=crypto+memecoin&since=&until=&near=`, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) continue;
        const html = await res.text();

        // Extract tweet content and images
        const tweetBlocks = html.split('class="timeline-item"').slice(1, 11);
        for (const block of tweetBlocks) {
          // Get tweet text
          const textMatch = block.match(/class="tweet-content[^"]*"[^>]*>([^<]+)/);
          if (!textMatch) continue;
          const text = textMatch[1].trim();

          // Try to get a coin name from hashtags or $TICKER mentions
          const tickerMatch = text.match(/\$([A-Z]{2,8})/);
          const hashMatch = text.match(/#([A-Za-z]{2,15})/);
          const name = tickerMatch?.[1] || hashMatch?.[1] || text.split(/\s+/).slice(0, 3).join(" ");
          if (!name || name.length < 2) continue;

          // Extract image from tweet (first image)
          let imageUrl = "";
          const imgMatch = block.match(/class="still-image"[^>]*href="([^"]+)"/);
          if (imgMatch?.[1]) {
            const imgUrl = imgMatch[1].startsWith("http") ? imgMatch[1] : `${host}${imgMatch[1]}`;
            if (isRealImage(imgUrl)) imageUrl = imgUrl;
          }

          // Also check for pic.twitter.com images
          if (!imageUrl) {
            const picMatch = block.match(/src="(https:\/\/[^\s"]+(?:\.png|\.jpg|\.jpeg|\.webp)[^"]*)"/i);
            if (picMatch?.[1] && isRealImage(picMatch[1])) imageUrl = picMatch[1];
          }

          // If no image from tweet, search for one
          if (!imageUrl) {
            imageUrl = await searchImage(name);
          }
          if (!imageUrl) continue;

          items.push({
            name: name.substring(0, 30),
            symbol: toSymbol(name),
            imageUrl,
            source: "twitter",
            description: text.substring(0, 100),
          });

          if (items.length >= 8) break;
        }
        if (items.length > 0) break; // Found results, stop trying other hosts
      } catch { continue; }
    }
  } catch (e) {
    console.error("Twitter trending error:", e);
  }
  return items;
}

// ── Source 3: CoinGecko Trending ──
async function fetchCoinGeckoTrending(): Promise<TrendItem[]> {
  const items: TrendItem[] = [];
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/search/trending");
    if (!res.ok) return items;
    const data = await res.json();

    for (const c of (data?.coins || []).slice(0, 10)) {
      const coin = c?.item;
      if (!coin?.name || !coin?.symbol) continue;

      let imageUrl = coin.large || coin.small || coin.thumb || "";
      if (!isRealImage(imageUrl)) {
        imageUrl = await searchImage(`${coin.name} crypto`);
      }
      if (!imageUrl) continue;

      items.push({
        name: coin.name,
        symbol: coin.symbol.toUpperCase().substring(0, 8),
        imageUrl,
        source: "coingecko",
        description: `Trending on CoinGecko | Rank: #${coin.market_cap_rank || "N/A"}`,
      });
    }
  } catch (e) {
    console.error("CoinGecko trending error:", e);
  }
  return items;
}

// ── Source 4: DexScreener Trending ──
async function fetchDexScreenerTrending(): Promise<TrendItem[]> {
  const items: TrendItem[] = [];
  try {
    const res = await fetch("https://api.dexscreener.com/token-boosts/top/v1");
    if (!res.ok) return items;
    const data: unknown[] = await res.json();

    for (const p of (data || []).slice(0, 10)) {
      const pool = p as Record<string, unknown>;
      const name = pool.description as string || pool.tokenAddress as string || "";
      const symbol = (pool.url as string || "").split("/").pop() || "";
      if (!name || !symbol) continue;

      let imageUrl = (pool.icon as string) || (pool.header as string) || "";
      if (!isRealImage(imageUrl)) {
        imageUrl = await searchImage(`${name} crypto token`);
      }
      if (!imageUrl) continue;

      items.push({
        name: name.substring(0, 30),
        symbol: symbol.toUpperCase().substring(0, 8),
        imageUrl,
        source: "dexscreener",
        description: `Boosted on DexScreener`,
      });
    }
  } catch (e) {
    console.error("DexScreener trending error:", e);
  }
  return items;
}

// ── GET handler ──
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sourceParam = searchParams.get("source") || "all";

  try {
    let items: TrendItem[] = [];

    if (sourceParam === "all" || sourceParam === "google") {
      const gTrends = await fetchGoogleTrends();
      items.push(...gTrends);
    }
    if (sourceParam === "all" || sourceParam === "twitter") {
      const tweets = await fetchTwitterTrending();
      items.push(...tweets);
    }
    if (sourceParam === "all" || sourceParam === "coingecko") {
      const cg = await fetchCoinGeckoTrending();
      items.push(...cg);
    }
    if (sourceParam === "all" || sourceParam === "dexscreener") {
      const dx = await fetchDexScreenerTrending();
      items.push(...dx);
    }

    // Deduplicate by symbol
    const seen = new Set<string>();
    items = items.filter((t) => {
      const key = t.symbol.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return NextResponse.json({
      success: true,
      count: items.length,
      items,
    });
  } catch (error) {
    console.error("Fetch trending error:", error);
    return NextResponse.json({ error: "Failed to fetch trending topics" }, { status: 500 });
  }
}
