// Server-side cron handler that calls EXTERNAL APIs directly (no self-referencing)
// This runs on Vercel Cron every 1 minute. Works even with browser closed.
import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { Wallet } from "ethers";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

interface CloudConfig {
  running: boolean;
  mode: string;
  launchpad: string;
  agent: string;
  chain: string;
  wallet: string;
  kibuPlatform?: string;
  delaySeconds: number;
  maxLaunches: number;
  totalLaunched: number;
  startedAt: number;
  stoppedAt?: number;
  lastRunAt?: number;
  sourceIndex?: number;
  launchedSymbols: string[];
}

function rk(id: number) { return `cloud-launch-${id}`; }
function lk(id: number) { return `cloud-launch-logs-${id}`; }

async function addLog(id: number, msg: string, type = "info") {
  const entry = {
    time: new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit" as const, minute: "2-digit" as const, second: "2-digit" as const }),
    msg, type,
  };
  await redis.lpush(lk(id), entry);
  await redis.ltrim(lk(id), 0, 119);
}

// ── TOKEN SOURCES (external, no self-referencing) ──
const GECKO_SOURCES = [
  { net: "bsc", label: "GeckoTerminal BSC" },
  { net: "base", label: "GeckoTerminal Base" },
  { net: "solana", label: "GeckoTerminal Solana" },
];
const DEX_SOURCES = [
  { q: "bsc new", label: "DexScreener BSC" },
  { q: "base new", label: "DexScreener Base" },
];
const ALL_SOURCES = [...GECKO_SOURCES.map((s, i) => ({ idx: i, type: "gecko" as const, ...s })), ...DEX_SOURCES.map((s, i) => ({ idx: GECKO_SOURCES.length + i, type: "dex" as const, ...s }))];

interface TokenData {
  name: string;
  symbol: string;
  image: string;
  website?: string;
  chain: string;
}

async function fetchTokensExternal(srcIdx: number): Promise<{ tokens: TokenData[]; nextIdx: number; label: string }> {
  const src = ALL_SOURCES[srcIdx % ALL_SOURCES.length];
  const nextIdx = (srcIdx + 1) % ALL_SOURCES.length;
  const tokens: TokenData[] = [];

  try {
    if (src.type === "gecko") {
      const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/${src.net}/new_pools?page=1&include=base_token`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) {
        const d = await r.json();
        const included = d.included || [];
        for (const pool of (d.data || []).slice(0, 15)) {
          const a = pool.attributes || {};
          const baseId = pool.relationships?.base_token?.data?.id || "";
          const ti = included.find((x: Record<string, unknown>) => x.id === baseId);
          const ta = ti?.attributes || {};
          const name = ta?.name || (a.name || "").split(" / ")[0]?.trim();
          const symbol = ta?.symbol || name?.split(" ").pop() || "";
          if (!name || name.length < 2) continue;
          let img = "";
          if (ta?.image_url && typeof ta.image_url === "string" && ta.image_url.startsWith("http")) img = ta.image_url;
          if (!img) {
            const tokenInfo = ta?.token_info;
            if (tokenInfo && typeof tokenInfo === "object" && (tokenInfo as Record<string, unknown>).image_url) {
              const iu = (tokenInfo as Record<string, string>).image_url;
              if (iu?.startsWith("http")) img = iu;
            }
          }
          if (!img) continue; // skip tokens without images
          tokens.push({ name, symbol, image: img, chain: src.net, website: (ta?.websites || [])[0] });
        }
      }
    } else {
      const r = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(src.q)}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) {
        const d = await r.json();
        for (const pair of (d.pairs || []).slice(0, 15)) {
          const bt = pair.baseToken;
          if (!bt) continue;
          const info = pair.info || {};
          let img = info.imageUrl || info.header || bt.icon || "";
          if (!img || !img.startsWith("http")) continue;
          const chain = pair.chainId === "bsc" ? "bsc" : pair.chainId === "base" ? "base" : pair.chainId || "bsc";
          const websites = info.websites || [];
          tokens.push({ name: bt.name, symbol: bt.symbol, image: img, chain, website: websites[0]?.url });
        }
      }
    }
  } catch { /* empty */ }

  return { tokens, nextIdx, label: src.label };
}

// ── CLEAN IMAGE URL ──
function cleanImage(url: string): string {
  if (!url?.startsWith("http")) return "";
  if (url.toLowerCase().match(/\.(png|jpg|jpeg|webp)$/)) return url;
  if (url.includes("assets.geckoterminal.com")) return url;
  if (url.includes("coin-images.coingecko.com")) return url;
  if (url.includes("?")) return `https://wsrv.nl/?url=${encodeURIComponent(url.split("?")[0])}&output=png`;
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=png`;
}

// ── DEPLOY VIA AGENT (external calls only) ──
const AGENT_APIS: Record<string, string> = {
  "4claw_org": "https://www.4claw.org/api/v1",
  moltx: "https://moltx.io/v1",
  moltbook: "https://www.moltbook.com/api/v1",
  bapbook: "https://app-ookzumda.fly.dev",
};

async function deployViaAgent(config: CloudConfig, token: TokenData): Promise<{ ok: boolean; msg: string }> {
  const lp = config.launchpad;
  const agent = config.agent;
  const wallet = config.wallet;

  // Build post content
  const cmd = lp === "4claw" ? "!4clawd" : lp === "kibu" ? "!kibu" : lp === "molaunch" ? "!molaunch" : "!clawnch";
  const img = cleanImage(token.image);
  let post = `${cmd}\nname: ${token.name}\nsymbol: ${token.symbol}\nwallet: ${wallet}`;
  post += `\ndescription: $${token.symbol} is the fuel for the ${token.name} revolution. Community-driven, built to moon.`;
  if (img) post += `\nimage: ${img}`;
  if (token.website) post += `\nwebsite: ${token.website}`;
  if ((lp === "kibu" || lp === "clawnch") && token.chain) post += `\nchain: ${token.chain}`;
  if (lp === "kibu" && config.kibuPlatform === "fourmeme") post += `\nlaunchpad: fourmeme`;

  // Post to 4claw.org API (most reliable, works for all launchpads)
  const apiBase = AGENT_APIS[agent] || AGENT_APIS["4claw_org"];

  try {
    // Register temp agent
    const regRes = await fetch(`${apiBase}/agents/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `cloud_${token.symbol.toLowerCase()}_${Date.now().toString(36)}`,
        display_name: token.name,
        description: `Cloud launcher for $${token.symbol}`,
        avatar_emoji: "\uD83D\uDE80",
      }),
    });
    if (!regRes.ok) return { ok: false, msg: `Agent register failed: ${regRes.status}` };
    const regData = await regRes.json();
    const apiKey = regData?.data?.api_key || regData?.api_key;
    if (!apiKey) return { ok: false, msg: "No API key from agent" };

    // Link wallet via EVM (using ethers)
    const tempWallet = Wallet.createRandom();
    const chainId = token.chain === "base" ? 8453 : token.chain === "solana" ? 1 : 56;

    const chalRes = await fetch(`${apiBase}/agents/me/evm/challenge`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ address: tempWallet.address, chain_id: chainId }),
    });
    if (chalRes.ok) {
      const chalData = await chalRes.json();
      const cData = chalData?.data;
      if (cData?.nonce && cData?.typed_data) {
        const { EIP712Domain: _, ...sigTypes } = cData.typed_data.types;
        const sig = await tempWallet.signTypedData(cData.typed_data.domain, sigTypes, cData.typed_data.message);
        await fetch(`${apiBase}/agents/me/evm/verify`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ nonce: cData.nonce, signature: sig }),
        });
      }
    }

    // Engage feed
    try {
      const feedRes = await fetch(`${apiBase}/feed/global?limit=3`, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (feedRes.ok) {
        const feedData = await feedRes.json();
        const posts = feedData?.data?.posts || feedData?.data || [];
        const postId = posts[0]?.id || posts[0]?.post_id;
        if (postId) {
          await fetch(`${apiBase}/posts/${postId}/like`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          });
        }
      }
    } catch { /* */ }

    // Post the launch command
    const postRes = await fetch(`${apiBase}/posts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: post }),
    });
    if (!postRes.ok) {
      const e = await postRes.text();
      return { ok: false, msg: `Post failed: ${postRes.status} ${e.slice(0, 100)}` };
    }
    const postData = await postRes.json();
    const pId = postData?.data?.id || postData?.data?.post_id || "";
    return { ok: true, msg: `Posted $${token.symbol} (${pId})` };
  } catch (e) {
    return { ok: false, msg: String(e).slice(0, 100) };
  }
}

// ── VERCEL CRON ENTRY POINT ──
// This GET is called by Vercel Cron every minute.
// It checks all cloud instances. If running + mode=cron, it deploys one token.
export async function GET() {
  const results: Record<string, unknown>[] = [];

  for (const id of [1, 2]) {
    const config = await redis.get<CloudConfig>(rk(id));
    if (!config?.running) continue;
    // Only process cron mode instances (edge runs client-side)
    if (config.mode !== "cron") continue;
    if (config.totalLaunched >= config.maxLaunches) {
      config.running = false;
      config.stoppedAt = Date.now();
      await redis.set(rk(id), config);
      await addLog(id, `Max launches reached (${config.maxLaunches}). Auto-stopped.`, "success");
      continue;
    }

    // Check delay (cron runs every min, but user may want 2-3 min)
    const now = Date.now();
    const minDelay = (config.delaySeconds || 60) * 1000;
    if (config.lastRunAt && (now - config.lastRunAt) < minDelay * 0.8) {
      continue; // too soon
    }

    await addLog(id, `[Cron] Fetching tokens (src #${config.sourceIndex || 0})...`);

    const srcIdx = config.sourceIndex || 0;
    const { tokens, nextIdx, label } = await fetchTokensExternal(srcIdx);
    config.sourceIndex = nextIdx;
    config.lastRunAt = now;

    await addLog(id, `[Cron] Source: ${label} | Found ${tokens.length} tokens`);

    let deployed = false;
    for (const token of tokens) {
      if (token.chain !== config.chain && config.chain !== "all") continue;
      const tk = `${token.symbol}_${token.name}`.toLowerCase();
      if (config.launchedSymbols.includes(tk)) continue;

      const result = await deployViaAgent(config, token);
      if (result.ok) {
        config.totalLaunched++;
        config.launchedSymbols.push(tk);
        await addLog(id, `[Cron] Deployed $${token.symbol}! ${result.msg}`, "success");
        deployed = true;
        break;
      } else {
        await addLog(id, `[Cron] Skip ${token.symbol}: ${result.msg}`, "skip");
      }
    }

    if (!deployed) {
      await addLog(id, "[Cron] No deployable tokens this cycle, rotating source", "skip");
    }

    await redis.set(rk(id), config);
    results.push({ instanceId: id, deployed, totalLaunched: config.totalLaunched });
  }

  return NextResponse.json({ cron: true, ts: Date.now(), results });
}
