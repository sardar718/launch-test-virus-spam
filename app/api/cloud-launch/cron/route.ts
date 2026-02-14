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
    time: new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    msg, type,
  };
  await redis.lpush(LOG_KEY, log);
  await redis.ltrim(LOG_KEY, 0, MAX_LOGS - 1);
}

// This runs every 1 minute via Vercel Cron OR can be called by the Edge poller
export async function GET(request: Request) {
  // Optional: verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Allow calls without auth if no CRON_SECRET is set
    if (cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

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
      await addLog(`Max launches reached (${config.totalLaunched}/${config.maxLaunches}). Auto-stopped.`, "success");
      return NextResponse.json({ skipped: true, reason: "Max reached" });
    }

    // Fetch tokens from the same API used by the UI auto-launch
    const baseUrl = new URL(request.url).origin;
    await addLog(`Cron triggered -- fetching tokens for ${config.chain}...`);

    const fetchUrl = `${baseUrl}/api/auto-launch/fetch-tokens?chain=${config.source || config.chain}`;
    const tokensRes = await fetch(fetchUrl, { signal: AbortSignal.timeout(15000) });
    const tokensData = await tokensRes.json();
    const tokens = tokensData.tokens || [];

    if (tokens.length === 0) {
      await addLog("No tokens found this cycle", "skip");
      config.lastRunAt = Date.now();
      await redis.set(REDIS_KEY, config);
      return NextResponse.json({ skipped: true, reason: "No tokens" });
    }

    // Find the first token not yet launched
    let deployed = false;
    for (const token of tokens) {
      const key = `${token.symbol}_${token.name}`.toLowerCase();
      if (config.launchedSymbols.includes(key)) continue;

      // Verify image is real
      const img = token.imageUrl || token.image || "";
      const isReal = img && !img.includes("pollinations.ai") && !img.includes("dicebear.com") &&
        (img.match(/\.(png|jpg|jpeg|webp)(\?|$)/i) || img.includes("coingecko.com") || img.includes("geckoterminal.com") || img.includes("wsrv.nl"));
      if (!isReal) {
        continue;
      }

      await addLog(`Deploying $${token.symbol} "${token.name}"...`);

      // Call deploy-token API
      try {
        const deployRes = await fetch(`${baseUrl}/api/deploy-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            launchpad: config.launchpad,
            agent: config.launchpad === "fourclaw_fun" ? "direct_api" : config.agent,
            token: {
              name: token.name,
              symbol: token.symbol,
              wallet: config.wallet,
              description: token.description || `$${token.symbol} token`,
              image: img,
              chain: config.chain,
            },
          }),
          signal: AbortSignal.timeout(25000),
        });

        const deployData = await deployRes.json();
        if (deployData.success) {
          config.totalLaunched++;
          config.launchedSymbols.push(key);
          await addLog(`Deployed $${token.symbol}! Post: ${deployData.postUrl || deployData.postId}`, "success");
          deployed = true;
          break; // One token per cron cycle to respect rate limits
        } else {
          await addLog(`Deploy failed: ${deployData.error}`, "error");
        }
      } catch (e) {
        await addLog(`Deploy error: ${String(e).slice(0, 80)}`, "error");
      }
    }

    if (!deployed) {
      await addLog("No deployable tokens this cycle (all launched or no images)", "skip");
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
