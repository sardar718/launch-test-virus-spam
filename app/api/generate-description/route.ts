import { generateText } from "ai";

export async function POST(request: Request) {
  try {
    const { name, symbol } = await request.json();

    if (!name || !symbol) {
      return Response.json(
        { error: "Token name and symbol are required" },
        { status: 400 }
      );
    }

    const { text } = await generateText({
      model: "openai/gpt-4o-mini",
      prompt: `Write a short, catchy memecoin token description for a token called "${name}" with the ticker symbol "$${symbol}". 
      
Requirements:
- Maximum 200 characters
- Hype/memecoin tone - fun, engaging, community-driven
- Do NOT use any emojis
- Mention the token's purpose/vibe briefly
- End with something that makes people want to buy/hold
- Do NOT use quotes around the output
- Return ONLY the description text, nothing else`,
    });

    return Response.json({ description: text.trim() });
  } catch (error) {
    console.error("AI description error:", error);
    return Response.json(
      { error: "Failed to generate description", details: String(error) },
      { status: 500 }
    );
  }
}
