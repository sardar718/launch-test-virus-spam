import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export const runtime = "edge";
export const maxDuration = 60;

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
  await redis.ltrim(LOG_KEY, 0, 99);
}

// Edge poller: runs for up to 55s, calling the cron endpoint at intervals
export async function GET(request: Request) {
  const baseUrl = new URL(request.url).origin;
  const startTime = Date.now();
  const maxRuntime = 52000; // Leave buffer before edge 60s timeout
  let cycles = 0;

  try {
    await addLog("Edge session started", "info");

    while (Date.now() - startTime < maxRuntime) {
      // Check if still running
      const config = await redis.get<CloudConfig>(REDIS_KEY);
      if (!config || !config.running || config.mode !== "edge") {
        await addLog("Edge session: stopped or mode changed", "info");
        break;
      }

      if (config.totalLaunched >= config.maxLaunches) {
        await addLog("Edge session: max launches reached", "success");
        break;
      }

      // Call the cron handler to do one deploy cycle
      try {
        const cronRes = await fetch(`${baseUrl}/api/cloud-launch/cron`, {
          signal: AbortSignal.timeout(35000),
        });
        const cronData = await cronRes.json();
        cycles++;
        if (cronData.deployed) {
          await addLog(`Edge cycle ${cycles}: token deployed`, "success");
        }
      } catch (e) {
        await addLog(
          `Edge cycle error: ${String(e).slice(0, 60)}`,
          "error",
        );
      }

      // Wait the configured delay before next cycle
      const delay = Math.max((config.delaySeconds || 30) * 1000, 10000);
      const remaining = maxRuntime - (Date.now() - startTime);
      const waitTime = Math.min(delay, remaining);
      if (waitTime <= 0) break;
      await new Promise((r) => setTimeout(r, waitTime));
    }

    await addLog(
      `Edge session ended after ${cycles} cycles (${Math.floor((Date.now() - startTime) / 1000)}s)`,
      "info",
    );

    return NextResponse.json({
      success: true,
      cycles,
      runtime: Date.now() - startTime,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
