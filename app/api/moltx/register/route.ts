import { NextResponse } from "next/server";

const MOLTX_API_BASE = "https://moltx.io/v1";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, displayName, description, avatarEmoji } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Agent name/handle is required" },
        { status: 400 }
      );
    }

    const res = await fetch(`${MOLTX_API_BASE}/agents/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        display_name: displayName || name,
        description: description || "4claw token launcher agent",
        avatar_emoji: avatarEmoji || "🦞",
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        {
          error: data.error || data.message || "Failed to register agent",
          details: data,
        },
        { status: res.status }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Moltx register error:", error);
    return NextResponse.json(
      { error: "Failed to register agent", details: String(error) },
      { status: 500 }
    );
  }
}
