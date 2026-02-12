import { NextResponse } from "next/server";

const SOURCES: Record<string, string> = {
  "kibu-bsc": "https://kibu.bot/api/launches?limit=12&chain=bsc",
  "kibu-base": "https://kibu.bot/api/launches?limit=12&chain=base",
  clawnch: "https://clawn.ch/api/launches?limit=12",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") || "kibu-bsc";

  const url = SOURCES[source];
  if (!url) {
    return NextResponse.json({ error: "Invalid source", launches: [] }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      next: { revalidate: 30 },
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      throw new Error(`${source} API returned ${res.status}`);
    }

    const data = await res.json();
    const launches = data?.launches || data?.tokens || data?.data || [];
    return NextResponse.json({ launches, source });
  } catch (error) {
    console.error(`${source} launches error:`, error);
    return NextResponse.json(
      { error: `Failed to fetch ${source} launches`, launches: [] },
      { status: 500 },
    );
  }
}
