// Manages QStash schedules: create / delete / status
import { NextResponse } from "next/server";

const QSTASH_TOKEN = process.env.QSTASH_TOKEN || "";
const QSTASH_API = "https://qstash.upstash.io/v2";

// POST: create or delete a QStash schedule
export async function POST(request: Request) {
  if (!QSTASH_TOKEN) {
    return NextResponse.json({ error: "QSTASH_TOKEN not configured" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const action = body.action as string;
    const instanceId = body.instanceId || 1;

    if (action === "create") {
      // Create a recurring schedule
      const delaySeconds = Math.max(body.delaySeconds || 60, 30); // QStash min is ~30s for schedules
      const destination = body.destination; // Full URL to our qstash handler

      if (!destination) {
        return NextResponse.json({ error: "destination URL required" }, { status: 400 });
      }

      const r = await fetch(`${QSTASH_API}/schedules`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${QSTASH_TOKEN}`,
          "Content-Type": "application/json",
          "Upstash-Cron": `*/${Math.max(Math.ceil(delaySeconds / 60), 1)} * * * *`,
        },
        body: JSON.stringify({
          destination,
          body: JSON.stringify({ instanceId }),
        }),
      });

      if (!r.ok) {
        const err = await r.text();
        return NextResponse.json({ error: `QStash error: ${err}` }, { status: r.status });
      }

      const data = await r.json();
      return NextResponse.json({ success: true, scheduleId: data.scheduleId });
    }

    if (action === "delete") {
      const scheduleId = body.scheduleId;
      if (!scheduleId) {
        return NextResponse.json({ error: "scheduleId required" }, { status: 400 });
      }

      const r = await fetch(`${QSTASH_API}/schedules/${scheduleId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${QSTASH_TOKEN}` },
      });

      if (!r.ok && r.status !== 404) {
        return NextResponse.json({ error: "Failed to delete schedule" }, { status: r.status });
      }

      return NextResponse.json({ success: true });
    }

    if (action === "status") {
      // List active schedules
      const r = await fetch(`${QSTASH_API}/schedules`, {
        headers: { Authorization: `Bearer ${QSTASH_TOKEN}` },
      });

      if (!r.ok) {
        return NextResponse.json({ error: "Failed to fetch schedules" }, { status: r.status });
      }

      const schedules = await r.json();
      return NextResponse.json({ schedules });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
