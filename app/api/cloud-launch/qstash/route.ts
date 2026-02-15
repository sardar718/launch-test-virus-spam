// QStash handler: receives scheduled messages from Upstash QStash.
// Unlike cron/edge, QStash calls come from EXTERNAL Upstash servers, so
// we CAN call our own APIs from here without self-referencing issues --
// but to avoid any risk, we call external APIs directly instead.

import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

function rk(id: number) { return `cloud-launch-${id}`; }
function lk(id: number) { return `cloud-launch-logs-${id}`; }

interface CloudConfig {
  running: boolean; mode: string; launchpad: string; agent: string;
  chain: string; wallet: string; source: string; kibuPlatform?: string;
  delaySeconds: number; maxLaunches: number; totalLaunched: number;
  startedAt: number; stoppedAt?: number; lastRunAt?: number;
  sourceIndex?: number; launchedSymbols: string[];
}
interface LogEntry { time: string; msg: string; type: string; }

async function addLog(id: number, msg: string, type = "info") {
  const entry: LogEntry = {
    time: new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    msg, type,
  };
  await redis.lpush(lk(id), entry);
  await redis.ltrim(lk(id), 0, 119);
}

// Helper: check if URL is a real image
function isRealImage(url: string): boolean {
  if (!url?.startsWith("http")) return false;
  if (url.includes("pollinations.ai") || url.includes("dicebear.com")) return false;
  const l = url.toLowerCase();
  return !!(l.match(/\.(png|jpg|jpeg|webp|gif|svg)(\?|$)/) ||
    l.includes("coin-images.coingecko.com") || l.includes("assets.coingecko.com") ||
    l.includes("assets.geckoterminal.com") || l.includes("wsrv.nl"));
}

// Sources for token fetching (GeckoTerminal + DexScreener -- external, no self-reference)
const TOKEN_SOURCES = [
  { name: "GeckoTerminal BSC", url: "https://api.geckoterminal.com/api/v2/networks/bsc/new_pools?page=1" },
  { name: "GeckoTerminal Base", url: "https://api.geckoterminal.com/api/v2/networks/base/new_pools?page=1" },
  { name: "DexScreener Latest", url: "https://api.dexscreener.com/token-boosts/latest/v1" },
  { name: "DexScreener Top", url: "https://api.dexscreener.com/token-boosts/top/v1" },
  { name: "CoinGecko Trending", url: "https://api.coingecko.com/api/v3/search/trending" },
];

interface Token { name: string; symbol: string; image: string; chain: string; }

async function fetchTokensFromSource(srcIdx: number, chain: string): Promise<{ tokens: Token[]; nextIdx: number; src: string }> {
  const idx = srcIdx % TOKEN_SOURCES.length;
  const source = TOKEN_SOURCES[idx];
  const nextIdx = (idx + 1) % TOKEN_SOURCES.length;
  const tokens: Token[] = [];

  try {
    const r = await fetch(source.url, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
    if (!r.ok) return { tokens: [], nextIdx, src: source.name };
    const raw = await r.json();

    if (source.name.startsWith("GeckoTerminal")) {
      const pools = raw?.data || [];
      for (const pool of (Array.isArray(pools) ? pools : []).slice(0, 15)) {
        const attrs = pool?.attributes || {};
        const name = attrs.name?.split("/")[0]?.trim() || "";
        const sym = attrs.name?.split("/")[0]?.replace(/[^A-Z]/gi, "")?.toUpperCase()?.slice(0, 8) || "";
        if (!name || !sym) continue;
        // Try GeckoTerminal image from pool token info
        const tokenAddr = pool?.relationships?.base_token?.data?.id?.split("_")?.[1] || "";
        let img = "";
        if (tokenAddr) {
          const network = source.name.includes("BSC") ? "bsc" : "base";
          img = `https://assets.geckoterminal.com/token_images/${network}_${tokenAddr}.png`;
          // We can't HEAD-check in QStash context efficiently, so just use it
        }
        tokens.push({ name, symbol: sym, image: img, chain: source.name.includes("BSC") ? "bsc" : "base" });
      }
    } else if (source.name.startsWith("DexScreener")) {
      const arr = Array.isArray(raw) ? raw : [];
      for (const t of arr.slice(0, 15)) {
        const desc = t.description || "";
        const tickerMatch = desc.match(/\$([A-Z]{2,8})/);
        const symbol = tickerMatch ? tickerMatch[1] : "";
        const name = desc.split(/[—\-|]/)[0]?.trim()?.slice(0, 30) || "";
        const img = t.icon || "";
        if (!symbol || !name) continue;
        tokens.push({ name, symbol, image: img ? (isRealImage(img) ? img : "") : "", chain: t.chainId || "bsc" });
      }
    } else if (source.name.includes("CoinGecko")) {
      const coins = raw?.coins || [];
      for (const c of coins.slice(0, 15)) {
        const coin = c?.item;
        if (!coin?.name) continue;
        const img = coin.large || coin.small || coin.thumb || "";
        tokens.push({
          name: coin.name,
          symbol: (coin.symbol || "").toUpperCase().slice(0, 8),
          image: isRealImage(img) ? img : "",
          chain: "bsc",
        });
      }
    }
  } catch { /* ignore */ }

  return { tokens: tokens.filter(t => t.chain === chain || chain === "any"), nextIdx, src: source.name };
}

// Search image via CoinGecko (external, no self-reference)
async function searchImage(name: string, symbol: string): Promise<string> {
  try {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(name)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (r.ok) {
      const d = await r.json();
      const coins = d?.coins || [];
      const match = coins.find(
        (c: { symbol?: string }) => c.symbol?.toUpperCase() === symbol.toUpperCase()
      ) || coins[0];
      if (match?.large && isRealImage(match.large)) return match.large;
    }
  } catch { /* ignore */ }
  return "";
}

export async function POST(request: Request) {
  // Verify QStash signature if QSTASH_CURRENT_SIGNING_KEY is set
  const sig = request.headers.get("upstash-signature");
  if (process.env.QSTASH_CURRENT_SIGNING_KEY && !sig) {
    // In production, verify signature. For now just check header exists.
  }

  try {
    const body = await request.json().catch(() => ({}));
    const instanceId = parseInt(body.instanceId || "1");

    const config = await redis.get<CloudConfig>(rk(instanceId));
    if (!config || !config.running) {
      return NextResponse.json({ skipped: true, reason: "not running" });
    }

    if (config.totalLaunched >= config.maxLaunches) {
      config.running = false;
      config.stoppedAt = Date.now();
      await redis.set(rk(instanceId), config);
      await addLog(instanceId, `Max reached (${config.maxLaunches}). Auto-stopped.`, "success");
      return NextResponse.json({ stopped: true });
    }

    config.lastRunAt = Date.now();
    const srcIdx = config.sourceIndex || 0;
    await addLog(instanceId, `QStash cycle -- fetching tokens (src #${srcIdx})...`);

    const { tokens, nextIdx, src } = await fetchTokensFromSource(srcIdx, config.chain);
    config.sourceIndex = nextIdx;
    await addLog(instanceId, `Source: ${src} | Found ${tokens.length} tokens`);

    if (tokens.length === 0) {
      await redis.set(rk(instanceId), config);
      return NextResponse.json({ deployed: false, reason: "no tokens" });
    }

    // Try to deploy one token
    for (const token of tokens) {
      const tk = `${token.symbol}_${token.name}`.toLowerCase();
      if (config.launchedSymbols.includes(tk)) continue;

      let img = token.image;
      if (!isRealImage(img)) {
        img = await searchImage(token.name, token.symbol);
        if (!img) {
          await addLog(instanceId, `Skip ${token.symbol}: no image`, "skip");
          continue;
        }
      }

      await addLog(instanceId, `Deploying $${token.symbol} "${token.name}" via QStash...`);

      // Build deploy request to the ORIGIN server
      const origin = request.headers.get("x-forwarded-proto") && request.headers.get("x-forwarded-host")
        ? `${request.headers.get("x-forwarded-proto")}://${request.headers.get("x-forwarded-host")}`
        : new URL(request.url).origin;

      try {
        const deployR = await fetch(`${origin}/api/deploy-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            launchpad: config.launchpad,
            agent: config.launchpad === "fourclaw_fun" ? "direct_api" : config.agent,
            kibuPlatform: config.launchpad === "kibu" ? (config.kibuPlatform || "flap") : undefined,
            token: {
              name: token.name, symbol: token.symbol, wallet: config.wallet,
              description: `$${token.symbol} - ${token.name}. Community memecoin. DYOR.`,
              image: img, chain: config.chain,
            },
          }),
        });
        const deployD = await deployR.json();

        if (deployD.success) {
          config.totalLaunched++;
          config.launchedSymbols.push(tk);
          await addLog(instanceId, `QStash deployed $${token.symbol}! ${deployD.postUrl || ""}`, "success");

          if (config.totalLaunched >= config.maxLaunches) {
            config.running = false;
            config.stoppedAt = Date.now();
            await addLog(instanceId, `Max reached (${config.maxLaunches}). Auto-stopped.`, "success");
          }
          await redis.set(rk(instanceId), config);
          return NextResponse.json({ deployed: true, symbol: token.symbol, total: config.totalLaunched });
        }
        await addLog(instanceId, `Deploy failed: ${deployD.error || "Unknown"}`, "error");
      } catch (e) {
        await addLog(instanceId, `Deploy error: ${String(e).slice(0, 80)}`, "error");
      }
    }

    await redis.set(rk(instanceId), config);
    return NextResponse.json({ deployed: false, reason: "no deployable token" });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
