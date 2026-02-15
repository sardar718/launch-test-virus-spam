// This route is kept only for Vercel Cron (GET) -- which cannot do client-side fetches.
// In practice both cron and edge modes now run from the client.
// The cron GET just marks "last cron ping" so we can verify cron is active.

import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import type { CloudLaunchConfig, CloudLogEntry } from "../route";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

function rk(id: number) { return `cloud-launch-${id}`; }
function lk(id: number) { return `cloud-launch-logs-${id}`; }

// GET: Vercel Cron heartbeat (every 1 min)
export async function GET() {
  // Just record that cron pinged -- actual launches happen client-side
  for (const id of [1, 2]) {
    const config = await redis.get<CloudLaunchConfig>(rk(id));
    if (config?.running && config.mode === "cron") {
      config.lastRunAt = Date.now();
      await redis.set(rk(id), config);
    }
  }
  return NextResponse.json({ cron: true, ts: Date.now() });
}

// POST: Client reports a deploy result to persist in Redis
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const instanceId = parseInt(body.instanceId || "1");
    const action = body.action as string;
    const key = rk(instanceId);

    if (action === "log") {
      const entry: CloudLogEntry = {
        time: new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        msg: body.msg || "",
        type: body.type || "info",
      };
      await redis.lpush(lk(instanceId), entry);
      await redis.ltrim(lk(instanceId), 0, 119);
      return NextResponse.json({ ok: true });
    }

    if (action === "deployed") {
      const config = await redis.get<CloudLaunchConfig>(key);
      if (config) {
        config.totalLaunched = (config.totalLaunched || 0) + 1;
        config.lastRunAt = Date.now();
        if (body.symbol) {
          config.launchedSymbols = config.launchedSymbols || [];
          config.launchedSymbols.push(body.symbol.toLowerCase());
        }
        if (body.sourceIndex !== undefined) {
          config.sourceIndex = body.sourceIndex;
        }
        if (config.totalLaunched >= config.maxLaunches) {
          config.running = false;
          config.stoppedAt = Date.now();
        }
        await redis.set(key, config);
        return NextResponse.json({ ok: true, totalLaunched: config.totalLaunched, stopped: !config.running });
      }
    }

    if (action === "update_source") {
      const config = await redis.get<CloudLaunchConfig>(key);
      if (config) {
        config.sourceIndex = body.sourceIndex ?? 0;
        config.lastRunAt = Date.now();
        await redis.set(key, config);
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
