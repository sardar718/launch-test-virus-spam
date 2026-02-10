import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch("https://api.4claw.fun/api/launches?limit=20", {
      next: { revalidate: 30 },
    });

    if (!res.ok) {
      throw new Error(`4claw API returned ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("4claw launches API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch 4claw launches", launches: [] },
      { status: 500 }
    );
  }
}
