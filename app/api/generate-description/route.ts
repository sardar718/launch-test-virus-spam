export async function POST(request: Request) {
  try {
    const { name, symbol } = await request.json();

    if (!name || !symbol) {
      return Response.json(
        { error: "Token name and symbol are required" },
        { status: 400 },
      );
    }

    // Try free LLM APIs in order of reliability
    const prompt = `Write a short, catchy memecoin token description for "${name}" ($${symbol}). Max 180 chars. Fun crypto/meme tone. No emojis. No quotes. Just the description text.`;

    // Attempt 1: Groq free API (no key needed for small requests via their playground)
    try {
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
            temperature: 0.9,
          }),
        },
      );
      if (groqRes.ok) {
        const groqData = await groqRes.json();
        const text = groqData?.choices?.[0]?.message?.content?.trim();
        if (text) {
          return Response.json({
            description: text.replace(/^["']|["']$/g, ""),
          });
        }
      }
    } catch {
      // Fall through to template generator
    }

    // Attempt 2: HuggingFace free inference API
    try {
      const hfRes = await fetch(
        "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inputs: `<s>[INST] ${prompt} [/INST]`,
            parameters: { max_new_tokens: 100, temperature: 0.9 },
          }),
        },
      );
      if (hfRes.ok) {
        const hfData = await hfRes.json();
        const text = hfData?.[0]?.generated_text?.split("[/INST]").pop()?.trim();
        if (text && text.length > 10) {
          return Response.json({
            description: text.replace(/^["']|["']$/g, "").slice(0, 200),
          });
        }
      }
    } catch {
      // Fall through to template generator
    }

    // Attempt 3: Smart template fallback (always works, no API needed)
    const templates = [
      `$${symbol} is the fuel for the ${name} revolution. Community-driven, BSC-native, and built to moon. No VC, no presale -- just pure degen energy.`,
      `${name} ($${symbol}) -- the next generation memecoin on BSC. Join the movement before everyone else does. Built by degens, for degens.`,
      `Welcome to ${name}. $${symbol} is not just a token -- it is a movement. Early holders get rewarded. Community first, always.`,
      `$${symbol} powers the ${name} ecosystem. Zero tax entry, community governance, and a roadmap that actually delivers. WAGMI.`,
      `${name} launched on BSC with zero friction. $${symbol} holders earn, stake, and govern. The future of memecoins starts here.`,
      `The ${name} army is growing. $${symbol} combines meme culture with real utility on BSC. Diamond hands only.`,
    ];
    const description = templates[Math.floor(Math.random() * templates.length)];

    return Response.json({ description, source: "template" });
  } catch (error) {
    console.error("AI description error:", error);
    return Response.json(
      { error: "Failed to generate description", details: String(error) },
      { status: 500 },
    );
  }
}
