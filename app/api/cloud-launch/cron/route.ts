import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import type { CloudLaunchConfig, CloudLogEntry } from "../route";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const REDIS_KEY = "cloud-auto-launch";
const LOG_KEY = "cloud-auto-launch-logs";
const MAX_LOGS = 100;

async function addLog(msg: string, type: CloudLogEntry["type"] = "info") {
  const log: CloudLogEntry = {
    time: new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    msg,
    type,
  };
  await redis.lpush(LOG_KEY, log);
  await redis.ltrim(LOG_KEY, 0, MAX_LOGS - 1);
}

// Check if image URL is real (.png/.jpg/.webp or known CDN)
function isRealImage(url: string): boolean {
  if (!url || !url.startsWith("http")) return false;
  if (url.includes("pollinations.ai") || url.includes("dicebear.com")) return false;
  const lower = url.toLowerCase();
  if (lower.match(/\.(png|jpg|jpeg|webp|gif|svg)(\?|$)/)) return true;
  if (lower.includes("coin-images.coingecko.com")) return true;
  if (lower.includes("assets.coingecko.com")) return true;
  if (lower.includes("assets.geckoterminal.com")) return true;
  if (lower.includes("wsrv.nl")) return true;
  if (lower.includes("dexscreener.com")) return true;
  return false;
}

// This runs every 1 minute via Vercel Cron OR can be called by the Edge poller
// No auth required -- protected by Vercel's cron system
export async function GET(request: Request) {
  try {
    const config = await redis.get<CloudLaunchConfig>(REDIS_KEY);
    if (!config || !config.running) {
      return NextResponse.json({ skipped: true, reason: "Not running" });
    }

    // Check if max launches reached
    if (config.totalLaunched >= config.maxLaunches) {
      config.running = false;
      config.stoppedAt = Date.now();
      await redis.set(REDIS_KEY, config);
      await addLog(
        `Max launches reached (${config.totalLaunched}/${config.maxLaunches}). Auto-stopped.`,
        "success",
      );
      return NextResponse.json({ skipped: true, reason: "Max reached" });
    }

    const baseUrl = new URL(request.url).origin;
    await addLog(`Cron cycle -- fetching tokens...`);

    // Step 1: Fetch tokens using SAME API as auto-launch UI
    // Use sourceIndex rotation stored in config for variety
    const srcIdx = config.sourceIndex ?? 0;
    const fetchUrl = `${baseUrl}/api/auto-launch/fetch-tokens?sourceIndex=${srcIdx}&minVolume=0`;
    const tokensRes = await fetch(fetchUrl, {
      signal: AbortSignal.timeout(15000),
    });
    const tokensData = await tokensRes.json();
    const tokens = tokensData.tokens || [];
    const nextSourceIndex = tokensData.nextSourceIndex ?? 0;

    // Save next source index for rotation
    config.sourceIndex = nextSourceIndex;

    if (tokens.length === 0) {
      await addLog("No tokens found this cycle, will try next source", "skip");
      config.lastRunAt = Date.now();
      await redis.set(REDIS_KEY, config);
      return NextResponse.json({ skipped: true, reason: "No tokens" });
    }

    await addLog(`Found ${tokens.length} tokens from ${tokensData.source || "source"}`);

    // Step 2: Find first deployable token (not already launched, has real image, matches chain)
    let deployed = false;
    for (const token of tokens) {
      const key = `${token.symbol}_${token.name}`.toLowerCase();
      if (config.launchedSymbols.includes(key)) continue;

      // Chain filter
      const tokenChain = token.chain || config.chain;
      if (tokenChain !== config.chain && tokenChain !== "solana") continue;

      // Image validation -- MUST have real image, skip otherwise
      const img = token.imageUrl || token.image || "";
      if (!isRealImage(img)) {
        // Try to search for a real image
        try {
          const searchRes = await fetch(`${baseUrl}/api/search-image`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: token.name,
              symbol: token.symbol,
            }),
            signal: AbortSignal.timeout(8000),
          });
          const searchData = await searchRes.json();
          if (searchData.url && isRealImage(searchData.url)) {
            token.imageUrl = searchData.url;
          } else {
            continue; // Skip token -- no real image
          }
        } catch {
          continue; // Skip on error
        }
      }

      const tokenImage = token.imageUrl || img;

      // Step 3: Generate description (same as auto-launch)
      let desc = token.description || "";
      if (!desc) {
        try {
          const descRes = await fetch(`${baseUrl}/api/generate-description`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: token.name,
              symbol: token.symbol,
            }),
            signal: AbortSignal.timeout(8000),
          });
          const descData = await descRes.json();
          desc =
            descData.description ||
            `$${token.symbol} - ${token.name} token. Community-driven memecoin.`;
        } catch {
          desc = `$${token.symbol} - ${token.name} token. Community-driven memecoin. DYOR.`;
        }
      }

      // Step 4: Lookup socials
      let website = token.website || "";
      let twitter = "";
      try {
        const socialRes = await fetch(`${baseUrl}/api/lookup-socials`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: token.name, symbol: token.symbol }),
          signal: AbortSignal.timeout(5000),
        });
        const socialData = await socialRes.json();
        if (
          socialData.twitter &&
          socialData.twitter.startsWith("@") &&
          socialData.twitter.length > 2
        ) {
          twitter = socialData.twitter;
        }
        if (
          socialData.website &&
          socialData.website.startsWith("http") &&
          !socialData.website.includes("example.com")
        ) {
          website = socialData.website;
        }
      } catch {
        /* ignore */
      }

      // Step 5: Deploy via deploy-token API (SAME as auto-launch)
      await addLog(`Deploying $${token.symbol} "${token.name}"...`);

      const effectiveAgent =
        config.launchpad === "fourclaw_fun" ? "direct_api" : config.agent;

      try {
        const deployRes = await fetch(`${baseUrl}/api/deploy-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            launchpad: config.launchpad,
            agent: effectiveAgent,
            kibuPlatform:
              config.launchpad === "kibu"
                ? config.kibuPlatform || "flap"
                : undefined,
            token: {
              name: token.name,
              symbol: token.symbol.toUpperCase(),
              wallet: config.wallet,
              description: desc,
              image: tokenImage,
              website,
              twitter,
              chain: config.chain,
            },
          }),
          signal: AbortSignal.timeout(30000),
        });

        const deployData = await deployRes.json();
        if (deployData.success) {
          config.totalLaunched++;
          config.launchedSymbols.push(key);
          await addLog(
            `Deployed $${token.symbol}! ${deployData.postUrl || deployData.postId || ""}`,
            "success",
          );
          deployed = true;
          break; // One token per cron cycle to respect rate limits
        } else {
          await addLog(
            `Deploy failed: ${deployData.error || "Unknown error"}`,
            "error",
          );
        }
      } catch (e) {
        await addLog(`Deploy error: ${String(e).slice(0, 80)}`, "error");
      }
    }

    if (!deployed) {
      await addLog(
        "No deployable tokens this cycle (no images or all launched)",
        "skip",
      );
    }

    config.lastRunAt = Date.now();
    await redis.set(REDIS_KEY, config);

    return NextResponse.json({
      success: true,
      deployed,
      totalLaunched: config.totalLaunched,
      maxLaunches: config.maxLaunches,
    });
  } catch (e) {
    await addLog(`Cron error: ${String(e).slice(0, 100)}`, "error");
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
