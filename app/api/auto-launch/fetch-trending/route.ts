import { NextResponse } from "next/server";

export const maxDuration = 30;

interface TrendItem {
  name: string;
  symbol: string;
  imageUrl: string;
  source: string;
  description?: string;
  volume24h?: number;
  priceChange?: number;
}

function isRealImage(url: string): boolean {
  if (!url || !url.startsWith("http")) return false;
  if (url.includes("pollinations.ai") || url.includes("dicebear.com")) return false;
  const l = url.toLowerCase();
  if (l.match(/\.(png|jpg|jpeg|webp|gif|svg)(\?|$)/)) return true;
  if (l.includes("coin-images.coingecko.com")) return true;
  if (l.includes("assets.coingecko.com")) return true;
  if (l.includes("assets.geckoterminal.com")) return true;
  if (l.includes("pbs.twimg.com") || l.includes("abs.twimg.com")) return true;
  if (l.includes("wsrv.nl")) return true;
  return false;
}

function cleanImg(url: string): string {
  if (!url) return "";
  const l = url.toLowerCase();
  if (l.match(/\.(png|jpg|jpeg|webp)$/)) return url;
  if (l.includes("coin-images.coingecko.com") && l.includes(".png")) return url;
  if (l.includes("assets.geckoterminal.com")) return url;
  if (l.includes("pbs.twimg.com") || l.includes("abs.twimg.com")) return url;
  if (url.includes("?")) return `https://wsrv.nl/?url=${encodeURIComponent(url.split("?")[0])}&output=png`;
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=png`;
}

function toSymbol(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().substring(0, 8) || "TREND";
}

async function searchImageForTopic(query: string): Promise<string> {
  try {
    const r = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query + " logo")}&format=json&no_html=1&skip_disambig=1`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (r.ok) {
      const d = await r.json();
      if (d.Image && isRealImage(d.Image)) return cleanImg(d.Image);
      for (const topic of d.RelatedTopics || []) {
        if (topic?.Icon?.URL && isRealImage(topic.Icon.URL)) return cleanImg(topic.Icon.URL);
      }
    }
  } catch { /* ignore */ }
  return "";
}

// ── Source 1: CoinGecko ──
async function fetchCoinGecko(filter: string): Promise<TrendItem[]> {
  const items: TrendItem[] = [];
  try {
    if (filter === "volume") {
      const r = await fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=volume_desc&per_page=20&page=1&sparkline=false",
        { signal: AbortSignal.timeout(8000) }
      );
      if (!r.ok) return items;
      const data = await r.json();
      for (const c of (Array.isArray(data) ? data : []).slice(0, 20)) {
        const img = c.image || "";
        if (!isRealImage(img)) continue;
        items.push({
          name: c.name || c.id, symbol: (c.symbol || "").toUpperCase().slice(0, 8),
          imageUrl: cleanImg(img), source: "CoinGecko (Volume)",
          description: `Vol: $${((c.total_volume || 0) / 1e6).toFixed(1)}M`,
          volume24h: c.total_volume || 0, priceChange: c.price_change_percentage_24h || 0,
        });
      }
    } else if (filter === "gainers") {
      const r = await fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=percent_change_24h_desc&per_page=20&page=1&sparkline=false",
        { signal: AbortSignal.timeout(8000) }
      );
      if (!r.ok) return items;
      const data = await r.json();
      for (const c of (Array.isArray(data) ? data : []).slice(0, 20)) {
        const img = c.image || "";
        if (!isRealImage(img)) continue;
        items.push({
          name: c.name || c.id, symbol: (c.symbol || "").toUpperCase().slice(0, 8),
          imageUrl: cleanImg(img), source: "CoinGecko (Gainers)",
          description: `+${(c.price_change_percentage_24h || 0).toFixed(1)}% 24h`,
          volume24h: c.total_volume || 0, priceChange: c.price_change_percentage_24h || 0,
        });
      }
    } else if (filter === "new") {
      // Recently added coins
      const r = await fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=id_asc&per_page=20&page=1&sparkline=false",
        { signal: AbortSignal.timeout(8000) }
      );
      if (!r.ok) return items;
      const data = await r.json();
      for (const c of (Array.isArray(data) ? data : []).slice(0, 20)) {
        const img = c.image || "";
        if (!isRealImage(img)) continue;
        items.push({
          name: c.name || c.id, symbol: (c.symbol || "").toUpperCase().slice(0, 8),
          imageUrl: cleanImg(img), source: "CoinGecko (New)",
          volume24h: c.total_volume || 0, priceChange: c.price_change_percentage_24h || 0,
        });
      }
    } else {
      // Default: trending
      const r = await fetch("https://api.coingecko.com/api/v3/search/trending", { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return items;
      const data = await r.json();
      for (const c of (data?.coins || []).slice(0, 15)) {
        const coin = c?.item;
        if (!coin?.name) continue;
        const img = coin.large || coin.small || coin.thumb || "";
        if (!isRealImage(img)) continue;
        items.push({
          name: coin.name, symbol: (coin.symbol || "").toUpperCase().slice(0, 8),
          imageUrl: cleanImg(img), source: "CoinGecko (Trending)",
          description: `Rank #${coin.market_cap_rank || "N/A"}`,
          volume24h: coin.data?.total_volume?.usd || 0,
          priceChange: coin.data?.price_change_percentage_24h?.usd || 0,
        });
      }
    }
  } catch (e) { console.error("[trending] CoinGecko:", e); }
  return items;
}

// ── Source 2: DexScreener ──
async function fetchDexScreener(filter: string): Promise<TrendItem[]> {
  const items: TrendItem[] = [];
  try {
    // DexScreener top boosted tokens
    const endpoints: string[] = [];
    if (filter === "volume" || filter === "new") {
      endpoints.push("https://api.dexscreener.com/token-boosts/latest/v1");
    }
    endpoints.push("https://api.dexscreener.com/token-boosts/top/v1");

    for (const ep of endpoints) {
      if (items.length > 0) break;
      try {
        const r = await fetch(ep, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) continue;
        const raw = await r.json();
        const arr = Array.isArray(raw) ? raw : [];

        for (const t of arr.slice(0, 20)) {
          const desc = t.description || "";
          const tokenAddr = t.tokenAddress || "";
          const chainId = t.chainId || "";
          const linkUrl = t.url || (chainId && tokenAddr ? `https://dexscreener.com/${chainId}/${tokenAddr}` : "");

          // Try to get name/symbol from the description or search
          let name = desc.split(/[—\-|]/).map((s: string) => s.trim()).filter(Boolean)[0] || "";
          let symbol = "";

          // Try to extract $TICKER from description
          const tickerMatch = desc.match(/\$([A-Z]{2,8})/);
          if (tickerMatch) symbol = tickerMatch[1];

          // If no name from description, try to fetch token info
          if ((!name || name.length < 2) && tokenAddr && chainId) {
            try {
              const infoR = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddr}`, { signal: AbortSignal.timeout(4000) });
              if (infoR.ok) {
                const infoD = await infoR.json();
                const pair = infoD?.pairs?.[0];
                if (pair?.baseToken) {
                  name = pair.baseToken.name || name;
                  symbol = symbol || (pair.baseToken.symbol || "").toUpperCase();
                }
              }
            } catch { /* ignore */ }
          }

          if (!name || name.length < 2) name = tokenAddr.slice(0, 10);
          if (!symbol) symbol = toSymbol(name);

          // Image: use icon field or search
          let img = t.icon || t.header || "";
          if (!isRealImage(img)) {
            img = await searchImageForTopic(`${name} ${symbol} crypto token`);
          }
          if (!img) continue;

          items.push({
            name: name.substring(0, 30), symbol: symbol.slice(0, 8),
            imageUrl: cleanImg(img), source: filter === "new" ? "DexScreener (New)" : "DexScreener (Boosted)",
            description: linkUrl ? `Chain: ${chainId}` : desc.substring(0, 60),
          });
        }
      } catch { /* try next */ }
    }
  } catch (e) { console.error("[trending] DexScreener:", e); }
  return items;
}

// ── Source 3: GeckoTerminal ──
async function fetchGeckoTerminal(filter: string): Promise<TrendItem[]> {
  const items: TrendItem[] = [];
  try {
    const net = "bsc";
    let ep = `https://api.geckoterminal.com/api/v2/networks/${net}/trending_pools?page=1`;
    if (filter === "new") ep = `https://api.geckoterminal.com/api/v2/networks/${net}/new_pools?page=1`;

    const r = await fetch(ep, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return items;
    const data = await r.json();
    const pools = data?.data || [];

    for (const pool of pools.slice(0, 15)) {
      const attrs = pool.attributes || {};
      const poolName = attrs.name || "";
      const tokenName = poolName.split("/")[0]?.trim();
      if (!tokenName || tokenName.length < 2) continue;

      // Get base token address for image lookup
      const baseId = pool.relationships?.base_token?.data?.id || "";
      const tokenAddr = baseId.split("_")[1] || "";
      let img = "";

      // Try GeckoTerminal image URL
      if (tokenAddr) {
        const possibleImgs = [
          `https://assets.geckoterminal.com/uploads/token/image_url/${net}_${tokenAddr}/small.png`,
          `https://coin-images.coingecko.com/coins/images/search?query=${tokenName}`,
        ];
        for (const u of possibleImgs) {
          if (u.includes("geckoterminal.com")) { img = u; break; }
        }
      }

      // Verify the GeckoTerminal image exists by HEAD check
      if (img) {
        try {
          const h = await fetch(img, { method: "HEAD", signal: AbortSignal.timeout(3000) });
          if (!h.ok) img = "";
        } catch { img = ""; }
      }

      if (!img) {
        img = await searchImageForTopic(`${tokenName} crypto token logo`);
      }
      if (!img) continue;

      const symbol = toSymbol(tokenName);
      const vol = parseFloat(attrs.volume_usd?.h24 || "0");
      const change = parseFloat(attrs.price_change_percentage?.h24 || "0");

      items.push({
        name: tokenName, symbol,
        imageUrl: cleanImg(img),
        source: filter === "new" ? "GeckoTerminal (New)" : "GeckoTerminal (Trending)",
        description: vol > 0 ? `Vol: $${(vol / 1e3).toFixed(1)}K` : undefined,
        volume24h: vol, priceChange: change,
      });
    }
  } catch (e) { console.error("[trending] GeckoTerminal:", e); }
  return items;
}

// ── Source 4: Google Trends (RSS -- no API key) ──
async function fetchGoogleTrends(): Promise<TrendItem[]> {
  const items: TrendItem[] = [];
  try {
    const r = await fetch("https://trends.google.com/trends/trendingsearches/daily/rss?geo=US", {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; v0bot/1.0)" },
    });
    if (!r.ok) return items;
    const xml = await r.text();

    // Parse <item> blocks
    const itemBlocks = xml.split("<item>").slice(1, 12);
    for (const block of itemBlocks) {
      const titleM = block.match(/<title>([^<]+)<\/title>/);
      const picM = block.match(/<ht:picture>([^<]+)<\/ht:picture>/);
      const newsImgM = block.match(/<ht:picture_source>([^<]+)<\/ht:picture_source>/);
      if (!titleM) continue;

      const name = titleM[1].trim();
      if (!name || name.length < 2) continue;

      let img = picM?.[1]?.trim() || newsImgM?.[1]?.trim() || "";
      if (!isRealImage(img)) {
        img = await searchImageForTopic(name);
      }
      if (!img) continue;

      items.push({
        name, symbol: toSymbol(name),
        imageUrl: cleanImg(img), source: "Google Trends",
        description: `Trending in US`,
      });
    }
  } catch (e) { console.error("[trending] Google Trends:", e); }
  return items;
}

// ── Source 5: Twitter/X crypto mentions (via Nitter RSS) ──
async function fetchTwitterCrypto(): Promise<TrendItem[]> {
  const items: TrendItem[] = [];
  try {
    // Try Nitter RSS feeds for crypto-focused accounts
    const feeds = [
      { url: "https://nitter.privacydev.net/search/rss?f=tweets&q=%24token+OR+memecoin+OR+%24coin+launch", name: "nitter.privacydev.net" },
      { url: "https://nitter.poast.org/search/rss?f=tweets&q=%24token+OR+memecoin+launch", name: "nitter.poast.org" },
    ];

    for (const feed of feeds) {
      if (items.length > 0) break;
      try {
        const r = await fetch(feed.url, {
          signal: AbortSignal.timeout(6000),
          headers: { Accept: "application/rss+xml, text/xml, */*", "User-Agent": "Mozilla/5.0" },
        });
        if (!r.ok) continue;
        const xml = await r.text();

        const tweetBlocks = xml.split("<item>").slice(1, 12);
        for (const block of tweetBlocks) {
          const titleM = block.match(/<title>([^<]+)<\/title>/);
          const descM = block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/);
          if (!titleM && !descM) continue;

          const content = descM?.[1] || titleM?.[1] || "";
          const plainContent = content.replace(/<[^>]+>/g, "").trim();

          // Look for $TICKER
          const tickerMatch = plainContent.match(/\$([A-Z]{2,8})/);
          if (!tickerMatch) continue;
          const symbol = tickerMatch[1];

          // Extract image from tweet HTML content
          let img = "";
          const imgM = content.match(/src="(https?:\/\/[^"]+\.(jpg|png|webp)[^"]*)"/i);
          if (imgM?.[1] && isRealImage(imgM[1])) img = imgM[1];

          // Also check for media:content in RSS
          if (!img) {
            const mediaM = block.match(/url="(https?:\/\/[^"]+\.(jpg|png|webp)[^"]*)"/i);
            if (mediaM?.[1] && isRealImage(mediaM[1])) img = mediaM[1];
          }

          if (!img) {
            img = await searchImageForTopic(`${symbol} crypto token`);
          }
          if (!img) continue;

          const nameCtx = plainContent.split("$" + symbol)[0]?.trim().split(/[.!?\n]/).pop()?.trim();
          const tokenName = nameCtx && nameCtx.length > 2 && nameCtx.length < 25 ? nameCtx : symbol;

          items.push({
            name: tokenName.replace(/[^A-Za-z0-9 ]/g, "").trim() || symbol,
            symbol, imageUrl: cleanImg(img), source: "Twitter/X",
            description: plainContent.substring(0, 80),
          });
          if (items.length >= 8) break;
        }
      } catch { continue; }
    }
  } catch (e) { console.error("[trending] Twitter:", e); }
  return items;
}

// ── GET handler ──
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sourceParam = searchParams.get("source") || "all";
  // Filters: "trending" (default) | "volume" | "gainers" | "new"
  const filter = searchParams.get("filter") || "trending";
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  const fetchers: { key: string; fn: Promise<TrendItem[]> }[] = [];
  const wantsAll = sourceParam === "all";

  if (wantsAll || sourceParam === "coingecko") fetchers.push({ key: "coingecko", fn: fetchCoinGecko(filter) });
  if (wantsAll || sourceParam === "dexscreener") fetchers.push({ key: "dexscreener", fn: fetchDexScreener(filter) });
  if (wantsAll || sourceParam === "geckoterminal") fetchers.push({ key: "geckoterminal", fn: fetchGeckoTerminal(filter) });
  if (wantsAll || sourceParam === "google") fetchers.push({ key: "google", fn: fetchGoogleTrends() });
  if (wantsAll || sourceParam === "twitter") fetchers.push({ key: "twitter", fn: fetchTwitterCrypto() });

  const results = await Promise.allSettled(fetchers.map((f) => f.fn));
  const allItems: TrendItem[] = [];
  const sourceStatus: Record<string, { count: number; error?: string }> = {};

  results.forEach((r, i) => {
    const key = fetchers[i].key;
    if (r.status === "fulfilled") {
      allItems.push(...r.value);
      sourceStatus[key] = { count: r.value.length };
    } else {
      sourceStatus[key] = { count: 0, error: String(r.reason).slice(0, 80) };
    }
  });

  // Deduplicate by symbol
  const seen = new Set<string>();
  const unique = allItems.filter((t) => {
    const key = t.symbol.toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json({
    success: true,
    count: unique.length,
    items: unique.slice(0, limit),
    sources: sourceStatus,
    filter,
  });
}
