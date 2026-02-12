import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { name, symbol, field } = await request.json();
    if (!name || !field) {
      return NextResponse.json({ error: "name and field required" }, { status: 400 });
    }

    // Use web search-style prompt to get AI to suggest social links
    const fieldLabel = field === "twitter" ? "Twitter/X handle" : "official website URL";
    const prompt = `You are a crypto token research assistant. The user wants the ${fieldLabel} for a token called "${name}" (symbol: ${symbol || "unknown"}).

Search your knowledge for any real token matching this name and symbol. If you find a real match, return the actual ${fieldLabel}. If you can't find a real match, generate a plausible ${fieldLabel} that would fit this token name.

Rules:
- For Twitter: Return ONLY the handle like @example (no URLs)
- For Website: Return ONLY the full URL like https://example.com
- Return ONLY the value, nothing else. No explanation.`;

    // Use the AI gateway
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY || ""}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 60,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      // Fallback: generate a plausible suggestion without AI
      const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (field === "twitter") {
        return NextResponse.json({ value: `@${cleanName}` });
      }
      return NextResponse.json({ value: `https://${cleanName}.io` });
    }

    const data = await res.json();
    const value = data.choices?.[0]?.message?.content?.trim() || "";
    return NextResponse.json({ value });
  } catch {
    return NextResponse.json({ error: "Failed to suggest" }, { status: 500 });
  }
}
