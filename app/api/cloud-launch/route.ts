import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const MAX_LOGS = 120;

function redisKey(instanceId: number) { return `cloud-launch-${instanceId}`; }
function logKey(instanceId: number) { return `cloud-launch-logs-${instanceId}`; }

export interface CloudLaunchConfig {
  running: boolean;
  mode: "cron" | "edge";
  launchpad: string;
  agent: string;
  chain: string;
  wallet: string;
  source: string;
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

export interface CloudLogEntry {
  time: string;
  msg: string;
  type: "info" | "success" | "error" | "skip";
}

// GET: fetch status + logs for an instance
export async function GET(request: Request) {
  const url = new URL(request.url);
  const instanceId = parseInt(url.searchParams.get("id") || "1");
  try {
    const config = await redis.get<CloudLaunchConfig>(redisKey(instanceId));
    const logs = await redis.lrange<CloudLogEntry>(logKey(instanceId), 0, MAX_LOGS - 1);
    return NextResponse.json({ config: config || null, logs: (logs || []).reverse() });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST: start / stop / clear for an instance
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = body.action as string;
    const instanceId = parseInt(body.instanceId || "1");
    const rk = redisKey(instanceId);
    const lk = logKey(instanceId);

    if (action === "start") {
      const config: CloudLaunchConfig = {
        running: true,
        mode: body.mode || "cron",
        launchpad: body.launchpad || "kibu",
        agent: body.agent || "4claw_org",
        chain: body.chain || "bsc",
        wallet: body.wallet || "",
        source: body.source || "bsc",
        kibuPlatform: body.kibuPlatform || "flap",
        delaySeconds: body.delaySeconds || 60,
        maxLaunches: body.maxLaunches || 50,
        totalLaunched: 0,
        startedAt: Date.now(),
        sourceIndex: 0,
        launchedSymbols: [],
      };
      await redis.set(rk, config);
      await redis.del(lk);
      await addCloudLog(instanceId, { msg: `Cloud #${instanceId} started (${config.mode} mode)`, type: "success" });
      return NextResponse.json({ success: true, config });
    }

    if (action === "stop") {
      const existing = await redis.get<CloudLaunchConfig>(rk);
      if (existing) {
        existing.running = false;
        existing.stoppedAt = Date.now();
        await redis.set(rk, existing);
        await addCloudLog(instanceId, { msg: "Stopped by user", type: "info" });
      }
      return NextResponse.json({ success: true });
    }

    if (action === "clear") {
      await redis.del(rk);
      await redis.del(lk);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function addCloudLog(instanceId: number, entry: Omit<CloudLogEntry, "time">) {
  const log: CloudLogEntry = {
    time: new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    msg: entry.msg,
    type: entry.type,
  };
  const lk = logKey(instanceId);
  await redis.lpush(lk, log);
  await redis.ltrim(lk, 0, MAX_LOGS - 1);
}
