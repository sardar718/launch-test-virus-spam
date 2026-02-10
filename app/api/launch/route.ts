import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { platform, post_id, url } = body;

    // Build the payload for the 4claw API
    let payload: Record<string, string>;

    if (platform === "moltbook" && url) {
      payload = { url };
    } else if (platform === "moltx" && post_id) {
      payload = { platform: "moltx", post_id };
    } else {
      return NextResponse.json(
        { error: "Invalid launch parameters. Provide platform + post_id, or url for moltbook." },
        { status: 400 }
      );
    }

    const res = await fetch("https://api.4claw.fun/api/launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || "Launch API returned an error", details: data },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Launch trigger error:", error);
    return NextResponse.json(
      { error: "Failed to trigger launch" },
      { status: 500 }
    );
  }
}
