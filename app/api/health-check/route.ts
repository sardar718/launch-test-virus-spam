import { NextResponse } from "next/server";

interface CheckResult {
  id: string;
  label: string;
  category: "launchpad" | "agent" | "data" | "chain" | "image";
  status: "online" | "offline" | "slow" | "checking";
  latency: number;
  message: string;
  url: string;
  siteUrl: string; // Official website link
}

async function checkEndpoint(
  id: string,
  label: string,
  category: CheckResult["category"],
  url: string,
  siteUrl: string,
  timeout = 8000,
): Promise<CheckResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);
    const latency = Date.now() - start;

    if (res.ok) {
      return {
        id, label, category,
        status: latency > 5000 ? "slow" : "online",
        latency,
        message: `HTTP ${res.status} (${latency}ms)`,
        url, siteUrl,
      };
    }
    return {
      id, label, category,
      status: "offline", latency,
      message: `HTTP ${res.status}`,
      url, siteUrl,
    };
  } catch (e) {
    return {
      id, label, category,
      status: "offline",
      latency: Date.now() - start,
      message: String(e).includes("abort") ? "Timeout" : String(e).slice(0, 80),
      url, siteUrl,
    };
  }
}

export async function GET() {
  const checks = await Promise.all([
    // Launchpads
    checkEndpoint("4claw", "4claw", "launchpad", "https://api.4claw.fun/api/launches?limit=1", "https://4claw.fun"),
    checkEndpoint("kibu", "Kibu", "launchpad", "https://kibu.bot/api/launches?limit=1&chain=bsc", "https://kibu.bot"),
    checkEndpoint("clawnch", "Clawnch", "launchpad", "https://clawn.ch/api/launches?limit=1", "https://clawn.ch"),
    checkEndpoint("fourclaw-fun", "FourClaw.Fun", "launchpad", "https://fourclaw.fun/api/tokens?limit=1", "https://fourclaw.fun"),
    checkEndpoint("synthlaunch", "SynthLaunch", "launchpad", "https://synthlaunch.fun/api/health", "https://synthlaunch.fun"),
    checkEndpoint("molaunch", "Molaunch", "launchpad", "https://bags.fourclaw.fun/api/health", "https://bags.fourclaw.fun"),

    // Agents
    checkEndpoint("moltx", "Moltx", "agent", "https://moltx.io/v1/feed/global?limit=1", "https://moltx.io"),
    checkEndpoint("moltbook", "Moltbook", "agent", "https://www.moltbook.com/api/v1/health", "https://www.moltbook.com"),
    checkEndpoint("4claw-org", "4claw.org", "agent", "https://www.4claw.org/api/v1/boards", "https://www.4claw.org"),
    checkEndpoint("clawstr", "Clawstr", "agent", "https://clawstr.com/api/health", "https://clawstr.com"),
    checkEndpoint("bapbook", "BapBook", "agent", "https://app-ookzumda.fly.dev/api/webhook", "https://bapbook.com"),

    // Data sources
    checkEndpoint("gecko-bsc", "GeckoTerminal BSC", "data", "https://api.geckoterminal.com/api/v2/networks/bsc/new_pools?page=1", "https://www.geckoterminal.com"),
    checkEndpoint("gecko-base", "GeckoTerminal Base", "data", "https://api.geckoterminal.com/api/v2/networks/base/new_pools?page=1", "https://www.geckoterminal.com"),
    checkEndpoint("dexscreener", "DexScreener", "data", "https://api.dexscreener.com/latest/dex/search?q=bsc", "https://dexscreener.com"),
    checkEndpoint("coingecko", "CoinGecko", "data", "https://api.coingecko.com/api/v3/ping", "https://www.coingecko.com"),

    // Image providers
    checkEndpoint("pollinations", "Pollinations AI", "image", "https://image.pollinations.ai/prompt/test?width=64&height=64&nologo=true", "https://pollinations.ai"),
    checkEndpoint("dicebear", "DiceBear", "image", "https://api.dicebear.com/7.x/identicon/png?seed=healthcheck&size=64", "https://dicebear.com"),

    // Chain RPCs
    checkEndpoint("bsc-rpc", "BSC RPC", "chain", "https://bsc-dataseed.binance.org/", "https://bscscan.com"),
    checkEndpoint("base-rpc", "Base RPC", "chain", "https://mainnet.base.org/", "https://basescan.org"),
    checkEndpoint("sol-rpc", "Solana RPC", "chain", "https://api.mainnet-beta.solana.com", "https://solscan.io"),
  ]);

  const online = checks.filter((c) => c.status === "online").length;
  const total = checks.length;

  return NextResponse.json({
    checks,
    summary: { online, total, percentage: Math.round((online / total) * 100) },
    timestamp: new Date().toISOString(),
  });
}
