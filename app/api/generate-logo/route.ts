import { NextResponse } from "next/server";

// Free AI image generation APIs -- tried in order
const GENERATORS = [
  { id: "pollinations", label: "Pollinations AI" },
  { id: "picsum", label: "Lorem Picsum" },
] as const;

export async function POST(request: Request) {
  try {
    const { name, symbol, provider } = await request.json();
    if (!name) {
      return NextResponse.json({ error: "Token name required" }, { status: 400 });
    }

    const prompt = `memecoin crypto token logo, ${name}, ${symbol || ""}, circular icon, vibrant colors, simple design, digital art, high quality, centered, no text, clean background`;
    const encodedPrompt = encodeURIComponent(prompt);

    // Provider selection
    const selectedProvider = provider || "pollinations";

    if (selectedProvider === "pollinations") {
      // Pollinations.ai -- free, no key, returns a direct image URL
      // The URL itself IS the generated image (it generates on GET)
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true&seed=${Date.now()}`;

      // We need to re-host this to get a stable .png URL
      // Use the kibu upload endpoint to re-host it
      try {
        const uploadRes = await fetch("https://kibu.bot/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: imageUrl, name: `${(symbol || name).toLowerCase()}-logo` }),
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          if (uploadData.url) {
            return NextResponse.json({ url: uploadData.url, provider: "pollinations" });
          }
        }
      } catch {
        // If rehosting fails, return the direct Pollinations URL
      }

      return NextResponse.json({ url: imageUrl, provider: "pollinations" });
    }

    // Fallback: Lorem Picsum with a seed based on the token name
    const seed = name.split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
    const fallbackUrl = `https://picsum.photos/seed/${seed}/512/512`;
    return NextResponse.json({ url: fallbackUrl, provider: "picsum" });
  } catch (error) {
    console.error("Generate logo error:", error);
    return NextResponse.json({ error: "Failed to generate logo" }, { status: 500 });
  }
}

// Return available generators for the UI dropdown
export async function GET() {
  return NextResponse.json({ generators: GENERATORS });
}
