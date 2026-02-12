import { NextResponse } from "next/server";

const SOURCES: Record<string, { url: string; network: string }> = {
  "kibu-bsc": { url: "https://kibu.bot/api/launches?limit=12&chain=bsc", network: "bsc" },
  "kibu-base": { url: "https://kibu.bot/api/launches?limit=12&chain=base", network: "base" },
  clawnch: { url: "https://clawn.ch/api/launches?limit=12", network: "base" },
};

interface LaunchRaw {
  name?: string;
  symbol?: string;
  contractAddress?: string;
  contract_address?: string;
  address?: string;
  id?: string;
  description?: string;
  image?: string;
  createdAt?: string;
  created_at?: string;
  status?: string;
  tax?: number;
  chain?: string;
  [key: string]: unknown;
}

async function fetchVolumes(
  addresses: string[],
  network: string,
): Promise<Record<string, { volume24h: string | null; priceUsd: string | null }>> {
  const result: Record<string, { volume24h: string | null; priceUsd: string | null }> = {};
  if (addresses.length === 0) return result;

  // Batch up to 30 addresses to DexScreener (free API)
  const batch = addresses.slice(0, 30).join(",");
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${batch}`,
      { next: { revalidate: 60 } },
    );
    if (res.ok) {
      const data = await res.json();
      const pairs = data?.pairs || [];
      for (const pair of pairs) {
        const addr = (pair.baseToken?.address || "").toLowerCase();
        if (addr && !result[addr]) {
          result[addr] = {
            volume24h: pair.volume?.h24?.toString() || null,
            priceUsd: pair.priceUsd || null,
          };
        }
      }
    }
  } catch {
    // Silently fail -- volume is optional
  }
  return result;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") || "kibu-bsc";

  const sourceInfo = SOURCES[source];
  if (!sourceInfo) {
    return NextResponse.json({ error: "Invalid source", launches: [] }, { status: 400 });
  }

  try {
    const res = await fetch(sourceInfo.url, {
      next: { revalidate: 30 },
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      throw new Error(`${source} API returned ${res.status}`);
    }

    const data = await res.json();
    const rawLaunches: LaunchRaw[] = data?.launches || data?.tokens || data?.data || [];

    // Extract contract addresses for volume lookup
    const addresses = rawLaunches
      .map((l) => l.contractAddress || l.contract_address || l.address || l.id || "")
      .filter(Boolean);

    // Fetch volumes in parallel
    const volumes = await fetchVolumes(addresses, sourceInfo.network);

    // Enrich launches with volume data
    const launches = rawLaunches.map((launch) => {
      const addr = (launch.contractAddress || launch.contract_address || launch.address || launch.id || "").toLowerCase();
      const vol = volumes[addr];
      return {
        ...launch,
        volume24h: vol?.volume24h || null,
        priceUsd: vol?.priceUsd || null,
      };
    });

    return NextResponse.json({ launches, source });
  } catch (error) {
    console.error(`${source} launches error:`, error);
    return NextResponse.json(
      { error: `Failed to fetch ${source} launches`, launches: [] },
      { status: 500 },
    );
  }
}
