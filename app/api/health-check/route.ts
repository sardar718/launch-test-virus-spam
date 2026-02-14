import { NextResponse } from "next/server";

interface CheckResult {
  id: string;
  label: string;
  category: "launchpad" | "agent" | "data" | "chain";
  status: "online" | "offline" | "slow" | "checking";
  latency: number;
  message: string;
  url: string;
}

async function checkEndpoint(
  id: string,
  label: string,
  category: CheckResult["category"],
  url: string,
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
        id,
        label,
        category,
        status: latency > 5000 ? "slow" : "online",
        latency,
        message: `HTTP ${res.status} (${latency}ms)`,
        url,
      };
    }
    return {
      id,
      label,
      category,
      status: "offline",
      latency,
      message: `HTTP ${res.status}`,
      url,
    };
  } catch (e) {
    return {
      id,
      label,
      category,
      status: "offline",
      latency: Date.now() - start,
      message: String(e).includes("abort") ? "Timeout" : String(e).slice(0, 80),
      url,
    };
  }
}

export async function GET() {
  const checks = await Promise.all([
    // Launchpads
    checkEndpoint("4claw", "4claw", "launchpad", "https://api.4claw.fun/api/launches?limit=1"),
    checkEndpoint("kibu", "Kibu", "launchpad", "https://kibu.bot/api/launches?limit=1&chain=bsc"),
    checkEndpoint("clawnch", "Clawnch", "launchpad", "https://clawn.ch/api/launches?limit=1"),
    checkEndpoint("fourclaw-fun", "FourClaw.Fun", "launchpad", "https://fourclaw.fun/api/tokens?limit=1"),
    checkEndpoint("synthlaunch", "SynthLaunch", "launchpad", "https://synthlaunch.fun/api/health"),
    checkEndpoint("molaunch", "Molaunch", "launchpad", "https://bags.fourclaw.fun/api/health"),

    // Agents
    checkEndpoint("moltx", "Moltx", "agent", "https://moltx.io/v1/feed/global?limit=1"),
    checkEndpoint("moltbook", "Moltbook", "agent", "https://www.moltbook.com/api/v1/health"),
    checkEndpoint("4claw-org", "4claw.org", "agent", "https://www.4claw.org/api/v1/boards"),
    checkEndpoint("clawstr", "Clawstr", "agent", "https://clawstr.com/api/health"),

    // Data sources
    checkEndpoint("gecko-bsc", "GeckoTerminal BSC", "data", "https://api.geckoterminal.com/api/v2/networks/bsc/new_pools?page=1"),
    checkEndpoint("gecko-base", "GeckoTerminal Base", "data", "https://api.geckoterminal.com/api/v2/networks/base/new_pools?page=1"),
    checkEndpoint("dexscreener", "DexScreener", "data", "https://api.dexscreener.com/latest/dex/search?q=bsc"),
    checkEndpoint("coingecko", "CoinGecko", "data", "https://api.coingecko.com/api/v3/ping"),

    // Chain RPCs
    checkEndpoint("bsc-rpc", "BSC RPC", "chain", "https://bsc-dataseed.binance.org/"),
    checkEndpoint("base-rpc", "Base RPC", "chain", "https://mainnet.base.org/"),
  ]);

  const online = checks.filter((c) => c.status === "online").length;
  const total = checks.length;

  return NextResponse.json({
    checks,
    summary: { online, total, percentage: Math.round((online / total) * 100) },
    timestamp: new Date().toISOString(),
  });
}
