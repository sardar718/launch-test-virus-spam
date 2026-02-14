import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export const runtime = "edge";
export const maxDuration = 60; // Edge functions can run up to 60s

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const REDIS_KEY = "cloud-auto-launch";
const LOG_KEY = "cloud-auto-launch-logs";

interface CloudConfig {
  running: boolean;
  mode: string;
  delaySeconds: number;
  totalLaunched: number;
  maxLaunches: number;
}

interface LogEntry {
  time: string;
  msg: string;
  type: string;
}

async function addLog(msg: string, type: string = "info") {
  const log: LogEntry = {
    time: new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    msg, type,
  };
  await redis.lpush(LOG_KEY, log);
  await redis.ltrim(LOG_KEY, 0, 99);
}

// Edge poller: runs for up to 60s, calling the cron endpoint at intervals
// After 60s, the client re-triggers this if still running
export async function GET(request: Request) {
  const baseUrl = new URL(request.url).origin;
  const startTime = Date.now();
  const maxRuntime = 55000; // Leave 5s buffer before edge timeout
  let cycles = 0;

  try {
    while (Date.now() - startTime < maxRuntime) {
      // Check if still running
      const config = await redis.get<CloudConfig>(REDIS_KEY);
      if (!config || !config.running || config.mode !== "edge") {
        await addLog("Edge poller: config says stop. Exiting.", "info");
        break;
      }

      if (config.totalLaunched >= config.maxLaunches) {
        await addLog("Edge poller: max launches reached. Stopping.", "success");
        break;
      }

      // Call the cron handler to do one deploy cycle
      try {
        await fetch(`${baseUrl}/api/cloud-launch/cron`, {
          signal: AbortSignal.timeout(30000),
        });
        cycles++;
      } catch (e) {
        await addLog(`Edge poll cycle error: ${String(e).slice(0, 60)}`, "error");
      }

      // Wait the configured delay before next cycle
      const delay = Math.max((config.delaySeconds || 30) * 1000, 10000);
      const waitUntil = Math.min(delay, maxRuntime - (Date.now() - startTime));
      if (waitUntil <= 0) break;
      await new Promise((r) => setTimeout(r, waitUntil));
    }

    return NextResponse.json({
      success: true,
      cycles,
      runtime: Date.now() - startTime,
      message: "Edge poll session complete. Client should re-trigger if config.running is true.",
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
