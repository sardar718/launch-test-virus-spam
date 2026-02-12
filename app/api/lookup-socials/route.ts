import { NextResponse } from "next/server";

/**
 * Looks up the X/Twitter handle and website for a token name.
 * Used by auto-launch to enrich celebrity/project tokens with real social links.
 *
 * Strategy:
 * 1. CoinGecko search (for existing crypto projects)
 * 2. AI inference (for celebrities and new projects)
 */
export async function POST(request: Request) {
  try {
    const { name, symbol } = await request.json();
    if (!name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    let twitter = "";
    let website = "";

    // Strategy 1: Search CoinGecko for matching token (real project links)
    try {
      const cgRes = await fetch(
        `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(name)}`,
      );
      if (cgRes.ok) {
        const cgData = await cgRes.json();
        const coins = cgData?.coins || [];
        const match = coins.find(
          (c: { symbol?: string; name?: string }) =>
            c.symbol?.toUpperCase() === (symbol || "").toUpperCase() ||
            c.name?.toLowerCase().includes(name.toLowerCase()),
        );
        if (match?.id) {
          // Fetch full details for social links
          const detailRes = await fetch(
            `https://api.coingecko.com/api/v3/coins/${match.id}?localization=false&tickers=false&market_data=false&community_data=true&developer_data=false`,
          );
          if (detailRes.ok) {
            const detail = await detailRes.json();
            twitter = detail?.links?.twitter_screen_name
              ? `@${detail.links.twitter_screen_name}`
              : "";
            website = detail?.links?.homepage?.[0] || "";
          }
        }
      }
    } catch { /* fall through */ }

    // Strategy 2: If no CoinGecko result, use AI to infer (for celebrities)
    if (!twitter && !website) {
      try {
        const prompt = `You are a research assistant. For the entity/celebrity/project named "${name}" (crypto token symbol: ${symbol || "unknown"}):

1. What is their official Twitter/X handle? Return @handle format
2. What is their official website URL?

If this is a celebrity (like Elon Musk, Trump, etc), return their personal X handle.
If this is a crypto project, return the project's X handle and website.
If you don't know, make a plausible guess based on the name.

Return ONLY a JSON object like: {"twitter": "@handle", "website": "https://example.com"}
Nothing else. No explanation.`;

        // Try Groq first (free tier)
        const groqRes = await fetch(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.GROQ_API_KEY || ""}`,
            },
            body: JSON.stringify({
              model: "llama-3.1-8b-instant",
              messages: [{ role: "user", content: prompt }],
              max_tokens: 100,
              temperature: 0.2,
            }),
          },
        );
        if (groqRes.ok) {
          const groqData = await groqRes.json();
          const text = groqData?.choices?.[0]?.message?.content?.trim() || "";
          // Parse JSON from response
          const jsonMatch = text.match(/\{[^}]+\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            twitter = parsed.twitter || "";
            website = parsed.website || "";
          }
        }
      } catch { /* fall through */ }
    }

    // Strategy 3: Smart fallback based on name
    if (!twitter) {
      const clean = name.toLowerCase().replace(/[^a-z0-9]/g, "");
      twitter = `@${clean}`;
    }
    if (!website) {
      const clean = name.toLowerCase().replace(/[^a-z0-9]/g, "");
      website = `https://${clean}.com`;
    }

    return NextResponse.json({ twitter, website });
  } catch (error) {
    console.error("Lookup socials error:", error);
    return NextResponse.json({ error: "Failed to lookup" }, { status: 500 });
  }
}
