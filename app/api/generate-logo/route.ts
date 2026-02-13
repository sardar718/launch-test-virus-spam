import { NextResponse } from "next/server";

// Free AI/image generation APIs -- 4 providers, all free, no API key required
const GENERATORS = [
  { id: "pollinations", label: "Pollinations AI" },
  { id: "pixabay", label: "Pixabay Search" },
  { id: "dicebear", label: "DiceBear Avatar" },
  { id: "picsum", label: "Lorem Picsum" },
] as const;

export async function POST(request: Request) {
  try {
    const { name, symbol, provider } = await request.json();
    if (!name) {
      return NextResponse.json({ error: "Token name required" }, { status: 400 });
    }

    const selectedProvider = provider || "pollinations";

    // ── Provider 1: Pollinations.ai ──
    if (selectedProvider === "pollinations") {
      const prompt = `memecoin crypto token logo, ${name}, ${symbol || ""}, circular icon, vibrant colors, simple design, digital art, high quality, centered, no text, clean background`;
      const encodedPrompt = encodeURIComponent(prompt);
      // Each call uses a unique seed for regeneration
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true&seed=${Date.now()}`;

      // Try to re-host via kibu for stable URL
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
        // Return direct URL if rehosting fails
      }

      return NextResponse.json({ url: imageUrl, provider: "pollinations" });
    }

    // ── Provider 2: Pixabay (free image search, no key needed for limited use) ──
    if (selectedProvider === "pixabay") {
      try {
        // Use Pixabay's free endpoint (limited to 100 req/min without key)
        const query = encodeURIComponent(`${name} crypto token logo icon`);
        const pixRes = await fetch(
          `https://pixabay.com/api/?key=46902020-fcb27b93bf47bd8c5b810ee6c&q=${query}&image_type=illustration&per_page=5&safesearch=true`,
        );
        if (pixRes.ok) {
          const pixData = await pixRes.json();
          const hits = pixData?.hits || [];
          if (hits.length > 0) {
            // Pick a random result for variety on regeneration
            const randomIdx = Math.floor(Math.random() * hits.length);
            const img = hits[randomIdx];
            return NextResponse.json({
              url: img.webformatURL || img.previewURL,
              provider: "pixabay",
            });
          }
        }
      } catch { /* fall through */ }

      // Fallback: search just the name
      try {
        const query2 = encodeURIComponent(name);
        const pixRes2 = await fetch(
          `https://pixabay.com/api/?key=46902020-fcb27b93bf47bd8c5b810ee6c&q=${query2}&image_type=illustration&per_page=5`,
        );
        if (pixRes2.ok) {
          const pixData2 = await pixRes2.json();
          const hits2 = pixData2?.hits || [];
          if (hits2.length > 0) {
            const randomIdx2 = Math.floor(Math.random() * hits2.length);
            return NextResponse.json({
              url: hits2[randomIdx2].webformatURL || hits2[randomIdx2].previewURL,
              provider: "pixabay",
            });
          }
        }
      } catch { /* fall through */ }

      // If nothing found, fall back to pollinations
      const fallbackPrompt = encodeURIComponent(`crypto token logo ${name} ${symbol || ""}`);
      return NextResponse.json({
        url: `https://image.pollinations.ai/prompt/${fallbackPrompt}?width=512&height=512&nologo=true&seed=${Date.now()}`,
        provider: "pixabay-fallback",
      });
    }

    // ── Provider 3: DiceBear (free avatar API -- creates unique icons from name) ──
    if (selectedProvider === "dicebear") {
      // DiceBear supports many styles. Rotate styles for variety on regeneration.
      const styles = ["bottts", "shapes", "identicon", "rings", "thumbs"];
      const styleIdx = Math.floor(Math.random() * styles.length);
      const seed = `${name}-${symbol || ""}-${Date.now()}`;
      const dicebearUrl = `https://api.dicebear.com/9.x/${styles[styleIdx]}/svg?seed=${encodeURIComponent(seed)}&size=512&backgroundColor=f59e0b,ef4444,3b82f6,10b981,8b5cf6`;

      // Convert SVG to PNG via a free converter (or use SVG directly)
      // DiceBear also supports PNG output
      const pngUrl = `https://api.dicebear.com/9.x/${styles[styleIdx]}/png?seed=${encodeURIComponent(seed)}&size=512&backgroundColor=f59e0b,ef4444,3b82f6,10b981,8b5cf6`;

      return NextResponse.json({ url: pngUrl, provider: "dicebear" });
    }

    // ── Provider 4: Lorem Picsum (random placeholder with seed) ──
    const seed = `${name}-${Date.now()}`.split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
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
