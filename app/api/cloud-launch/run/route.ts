import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import type { CloudLaunchConfig, CloudLogEntry } from "../route";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

function rk(id: number) { return `cloud-launch-${id}`; }
function lk(id: number) { return `cloud-launch-logs-${id}`; }

async function log(id: number, msg: string, type: CloudLogEntry["type"] = "info") {
  const entry: CloudLogEntry = {
    time: new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    msg, type,
  };
  await redis.lpush(lk(id), entry);
  await redis.ltrim(lk(id), 0, 119);
}

function isImg(url: string): boolean {
  if (!url?.startsWith("http")) return false;
  if (url.includes("pollinations.ai") || url.includes("dicebear.com")) return false;
  const l = url.toLowerCase();
  return !!(l.match(/\.(png|jpg|jpeg|webp|gif|svg)(\?|$)/) ||
    l.includes("coin-images.coingecko.com") || l.includes("assets.coingecko.com") ||
    l.includes("assets.geckoterminal.com") || l.includes("wsrv.nl") || l.includes("dexscreener.com"));
}

// Shared deploy logic used by both GET (cron) and POST (client)
async function runDeploy(instanceId: number, baseUrl: string) {
  const key = rk(instanceId);
  const config = await redis.get<CloudLaunchConfig>(key);
  if (!config?.running) return { skipped: true, reason: "Not running" };

  if (config.totalLaunched >= config.maxLaunches) {
    config.running = false;
    config.stoppedAt = Date.now();
    await redis.set(key, config);
    await log(instanceId, `Max reached (${config.totalLaunched}/${config.maxLaunches}). Stopped.`, "success");
    return { skipped: true, stopped: true };
  }

  const srcIdx = config.sourceIndex ?? 0;
  await log(instanceId, `Cycle start -- fetching tokens (src #${srcIdx})...`);

  // Fetch tokens
  let tokens: Record<string, string>[] = [];
  try {
    const r = await fetch(`${baseUrl}/api/auto-launch/fetch-tokens?sourceIndex=${srcIdx}&minVolume=0`, {
      signal: AbortSignal.timeout(15000),
    });
    const d = await r.json();
    tokens = d.tokens || [];
    config.sourceIndex = d.nextSourceIndex ?? ((srcIdx + 1) % 6);
  } catch (e) {
    await log(instanceId, `Fetch error: ${String(e).slice(0, 60)}`, "error");
    config.sourceIndex = (srcIdx + 1) % 6;
    config.lastRunAt = Date.now();
    await redis.set(key, config);
    return { skipped: true, reason: "Fetch failed" };
  }

  if (!tokens.length) {
    await log(instanceId, "No tokens, rotating source", "skip");
    config.lastRunAt = Date.now();
    await redis.set(key, config);
    return { skipped: true, reason: "No tokens" };
  }

  await log(instanceId, `Found ${tokens.length} tokens`);

  let deployed = false;
  for (const token of tokens) {
    const sym = (token.symbol || "").toUpperCase();
    const nm = token.name || "";
    const tk = `${sym}_${nm}`.toLowerCase();
    if (config.launchedSymbols.includes(tk)) continue;
    if ((token.chain || config.chain) !== config.chain) continue;

    // Image
    let img = token.imageUrl || token.image || "";
    if (!isImg(img)) {
      try {
        const sr = await fetch(`${baseUrl}/api/search-image`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: nm, symbol: sym }),
          signal: AbortSignal.timeout(8000),
        });
        const sd = await sr.json();
        if (sd.url && isImg(sd.url)) img = sd.url; else continue;
      } catch { continue; }
    }

    // Description
    let desc = token.description || "";
    if (!desc) {
      try {
        const dr = await fetch(`${baseUrl}/api/generate-description`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: nm, symbol: sym }),
          signal: AbortSignal.timeout(8000),
        });
        desc = (await dr.json()).description || `$${sym} - community memecoin.`;
      } catch { desc = `$${sym} - ${nm}. Community-driven memecoin. DYOR.`; }
    }

    // Socials
    let website = token.website || "", twitter = "";
    try {
      const sr = await fetch(`${baseUrl}/api/lookup-socials`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nm, symbol: sym }),
        signal: AbortSignal.timeout(5000),
      });
      const sd = await sr.json();
      if (sd.twitter?.startsWith("@") && sd.twitter.length > 2) twitter = sd.twitter;
      if (sd.website?.startsWith("http") && !sd.website.includes("example.com")) website = sd.website;
    } catch { /* ok */ }

    // Deploy
    await log(instanceId, `Deploying $${sym} "${nm}"...`);
    const ag = config.launchpad === "fourclaw_fun" ? "direct_api" : config.agent;

    try {
      const dr = await fetch(`${baseUrl}/api/deploy-token`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          launchpad: config.launchpad,
          agent: ag,
          kibuPlatform: config.launchpad === "kibu" ? (config.kibuPlatform || "flap") : undefined,
          token: { name: nm, symbol: sym, wallet: config.wallet, description: desc, image: img, website, twitter, chain: config.chain },
        }),
        signal: AbortSignal.timeout(30000),
      });
      const dd = await dr.json();
      if (dd.success) {
        config.totalLaunched++;
        config.launchedSymbols.push(tk);
        await log(instanceId, `Deployed $${sym}! ${dd.postUrl || dd.postId || ""}`, "success");
        deployed = true;
        break;
      } else {
        await log(instanceId, `Failed: ${dd.error || "Unknown"}`, "error");
      }
    } catch (e) {
      await log(instanceId, `Deploy error: ${String(e).slice(0, 80)}`, "error");
    }
  }

  if (!deployed) await log(instanceId, "No deployable tokens this cycle", "skip");
  config.lastRunAt = Date.now();
  await redis.set(key, config);
  return { success: true, deployed, totalLaunched: config.totalLaunched, maxLaunches: config.maxLaunches, stopped: config.totalLaunched >= config.maxLaunches };
}

// GET: Vercel Cron calls this every 1 min. Runs all cron-mode instances.
export async function GET(request: Request) {
  const baseUrl = new URL(request.url).origin;
  const results = [];
  for (const id of [1, 2]) {
    const config = await redis.get<CloudLaunchConfig>(rk(id));
    if (config?.running && config.mode === "cron") {
      const r = await runDeploy(id, baseUrl);
      results.push({ instanceId: id, ...r });
    }
  }
  return NextResponse.json({ cron: true, results });
}

// POST: Client calls this for both cron (backup) and edge mode.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const instanceId = parseInt(body.instanceId || "1");
    const baseUrl = new URL(request.url).origin;
    const result = await runDeploy(instanceId, baseUrl);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
