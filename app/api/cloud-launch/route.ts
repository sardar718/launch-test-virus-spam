import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const REDIS_KEY = "cloud-auto-launch";
const LOG_KEY = "cloud-auto-launch-logs";
const MAX_LOGS = 100;

export interface CloudLaunchConfig {
  running: boolean;
  mode: "cron" | "edge"; // cron = Vercel Cron, edge = Edge Function + KV polling
  launchpad: string;
  agent: string;
  chain: string;
  wallet: string;
  source: string; // "bsc" | "base" | "solana" for token source
  trendSource?: string; // for trending mode
  trendFilter?: string;
  delaySeconds: number;
  maxLaunches: number;
  totalLaunched: number;
  startedAt: number;
  stoppedAt?: number;
  lastRunAt?: number;
  launchedSymbols: string[]; // track already launched to avoid duplicates
}

export interface CloudLogEntry {
  time: string;
  msg: string;
  type: "info" | "success" | "error" | "skip";
}

// GET: fetch current status + logs
export async function GET() {
  try {
    const config = await redis.get<CloudLaunchConfig>(REDIS_KEY);
    const logs = await redis.lrange<CloudLogEntry>(LOG_KEY, 0, MAX_LOGS - 1);
    return NextResponse.json({
      config: config || null,
      logs: logs || [],
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST: start / stop / update config
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = body.action as string;

    if (action === "start") {
      const config: CloudLaunchConfig = {
        running: true,
        mode: body.mode || "cron",
        launchpad: body.launchpad || "kibu",
        agent: body.agent || "4claw_org",
        chain: body.chain || "bsc",
        wallet: body.wallet || "",
        source: body.source || "bsc",
        trendSource: body.trendSource,
        trendFilter: body.trendFilter,
        delaySeconds: body.delaySeconds || 30,
        maxLaunches: body.maxLaunches || 50,
        totalLaunched: 0,
        startedAt: Date.now(),
        launchedSymbols: [],
      };

      await redis.set(REDIS_KEY, config);
      // Clear old logs
      await redis.del(LOG_KEY);
      await addCloudLog({ msg: `Cloud auto-launch started (${config.mode} mode)`, type: "success" });

      return NextResponse.json({ success: true, config });
    }

    if (action === "stop") {
      const existing = await redis.get<CloudLaunchConfig>(REDIS_KEY);
      if (existing) {
        existing.running = false;
        existing.stoppedAt = Date.now();
        await redis.set(REDIS_KEY, existing);
        await addCloudLog({ msg: "Cloud auto-launch stopped by user", type: "info" });
      }
      return NextResponse.json({ success: true, message: "Stopped" });
    }

    if (action === "clear") {
      await redis.del(REDIS_KEY);
      await redis.del(LOG_KEY);
      return NextResponse.json({ success: true, message: "Cleared" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// Helper: add a log entry to Redis
async function addCloudLog(entry: Omit<CloudLogEntry, "time">) {
  const log: CloudLogEntry = {
    time: new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    msg: entry.msg,
    type: entry.type,
  };
  await redis.lpush(LOG_KEY, log);
  await redis.ltrim(LOG_KEY, 0, MAX_LOGS - 1);
}
