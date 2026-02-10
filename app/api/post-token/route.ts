import { NextResponse } from "next/server";

const MOLTX_API = "https://moltx.io/v1";
const MOLTBOOK_API = "https://www.moltbook.com/api/v1";
const FOURCLAW_API = "https://api.4claw.fun/api";
const CLAWNCH_API = "https://clawn.ch/api";

interface TokenData {
  name: string;
  symbol: string;
  wallet: string;
  description?: string;
  image?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  chain?: string;
  tax?: number;
  funds?: number;
  burn?: number;
  holders?: number;
  lp?: number;
}

// Build the text content for the post
function buildPostContent(
  launchpad: string,
  token: TokenData,
): string {
  const cmd =
    launchpad === "4claw"
      ? "!4clawd"
      : launchpad === "kibu"
        ? "!kibu"
        : "!clawnch";

  let post = `${cmd}\nname: ${token.name}\nsymbol: ${token.symbol}\nwallet: ${token.wallet}`;
  if (token.description) post += `\ndescription: ${token.description}`;
  if (token.image) post += `\nimage: ${token.image}`;
  if (token.website) post += `\nwebsite: ${token.website}`;
  if (token.twitter) post += `\ntwitter: ${token.twitter}`;
  if (token.telegram && launchpad === "4claw")
    post += `\ntelegram: ${token.telegram}`;
  if ((launchpad === "kibu" || launchpad === "clawnch") && token.chain)
    post += `\nchain: ${token.chain}`;

  // 4claw tax config
  if (launchpad === "4claw" && token.tax) {
    post += `\n\ntax: ${token.tax}\nfunds: ${token.funds || 97}\nburn: ${token.burn || 1}\nholders: ${token.holders || 1}\nlp: ${token.lp || 1}`;
  }

  return post;
}

// Build Moltbook-safe content (JSON in code block for markdown safety)
function buildMoltbookContent(
  launchpad: string,
  token: TokenData,
): string {
  const cmd =
    launchpad === "4claw"
      ? "!4clawd"
      : launchpad === "kibu"
        ? "!kibu"
        : "!clawnch";

  const jsonObj: Record<string, string | number> = {
    name: token.name,
    symbol: token.symbol,
    wallet: token.wallet,
  };
  if (token.description) jsonObj.description = token.description;
  if (token.image) jsonObj.image = token.image;
  if (token.website) jsonObj.website = token.website;
  if (token.twitter) jsonObj.twitter = token.twitter;

  return `${cmd}\n\`\`\`json\n${JSON.stringify(jsonObj, null, 2)}\n\`\`\``;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      launchpad,
      agent,
      apiKey,
      moltbookSubmolt,
      token,
    }: {
      launchpad: string;
      agent: string;
      apiKey: string;
      moltbookSubmolt?: string;
      token: TokenData;
    } = body;

    if (!launchpad || !agent || !apiKey || !token?.name || !token?.symbol) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // ── POST TO MOLTX ──────────────────────────────────────────
    if (agent === "moltx") {
      const content = buildPostContent(launchpad, token);

      const res = await fetch(`${MOLTX_API}/posts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      });

      const data = await res.json();

      if (!res.ok) {
        return NextResponse.json(
          {
            error:
              data?.error || data?.message || `Moltx returned ${res.status}`,
            details: data,
          },
          { status: res.status },
        );
      }

      const postId =
        data?.data?.id || data?.id || data?.data?.post?.id || data?.post?.id;

      // Trigger the launchpad indexer
      const triggerResult = await triggerLaunchpad(
        launchpad,
        "moltx",
        postId,
        apiKey,
      );

      return NextResponse.json({
        success: true,
        message: `Posted to Moltx. ${triggerResult.message}`,
        postId,
        autoScanned:
          launchpad !== "4claw" &&
          (agent === "moltx" ||
            agent === "4claw_org" ||
            agent === "clawstr"),
        triggerResult,
      });
    }

    // ── POST TO MOLTBOOK ────────────────────────────────────────
    if (agent === "moltbook") {
      const content = buildMoltbookContent(launchpad, token);

      const res = await fetch(`${MOLTBOOK_API}/posts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          submolt: moltbookSubmolt || (launchpad === "clawnch" ? "clawnch" : launchpad === "kibu" ? "kibu" : "crypto"),
          title: `Launching ${token.symbol} token!`,
          content,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        return NextResponse.json(
          {
            error:
              data?.error ||
              data?.message ||
              `Moltbook returned ${res.status}`,
            details: data,
          },
          { status: res.status },
        );
      }

      const postId =
        data?.post?.id || data?.data?.id || data?.id;

      // Trigger the launchpad
      const triggerResult = await triggerLaunchpad(
        launchpad,
        "moltbook",
        postId,
        apiKey,
      );

      return NextResponse.json({
        success: true,
        message: `Posted to Moltbook. ${triggerResult.message}`,
        postId,
        autoScanned: false,
        triggerResult,
      });
    }

    // ── POST TO 4CLAW.ORG ──────────────────────────────────────
    if (agent === "4claw_org") {
      // 4claw.org posts to /crypto/ board -- auto-scanned by launchpads
      const content = buildPostContent(launchpad, token);

      // 4claw.org uses the Moltx API key for authentication
      const res = await fetch("https://www.4claw.org/api/v1/threads", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          board: "crypto",
          content,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        return NextResponse.json(
          {
            error:
              data?.error ||
              data?.message ||
              `4claw.org returned ${res.status}`,
            details: data,
          },
          { status: res.status },
        );
      }

      return NextResponse.json({
        success: true,
        message: `Posted to 4claw.org /crypto/ board. ${launchpad === "clawnch" ? "Clawnch" : launchpad === "kibu" ? "Kibu" : "4claw"} scans every minute -- your token will deploy automatically.`,
        postId: data?.id || data?.thread?.id,
        autoScanned: true,
      });
    }

    // ── POST TO CLAWSTR ─────────────────────────────────────────
    if (agent === "clawstr") {
      const content = buildPostContent(launchpad, token);

      const res = await fetch("https://clawstr.com/api/v1/posts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      });

      const data = await res.json();

      if (!res.ok) {
        return NextResponse.json(
          {
            error:
              data?.error ||
              data?.message ||
              `Clawstr returned ${res.status}`,
            details: data,
          },
          { status: res.status },
        );
      }

      return NextResponse.json({
        success: true,
        message: `Posted to Clawstr (Nostr relays). ${launchpad === "clawnch" ? "Clawnch" : launchpad === "kibu" ? "Kibu" : "4claw"} scans every minute -- your token will deploy automatically.`,
        postId: data?.id || data?.event_id,
        autoScanned: true,
      });
    }

    return NextResponse.json(
      { error: `Unknown agent: ${agent}` },
      { status: 400 },
    );
  } catch (error) {
    console.error("Post token error:", error);
    return NextResponse.json(
      { error: "Failed to post token", details: String(error) },
      { status: 500 },
    );
  }
}

// Trigger the correct launchpad indexer after posting
async function triggerLaunchpad(
  launchpad: string,
  source: string,
  postId: string | undefined,
  apiKey: string,
): Promise<{ success: boolean; message: string }> {
  if (!postId)
    return {
      success: false,
      message: "No post ID returned -- launchpad may still auto-scan.",
    };

  try {
    if (launchpad === "4claw") {
      // 4claw: trigger indexer directly
      const res = await fetch(`${FOURCLAW_API}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          source === "moltbook"
            ? { url: `https://www.moltbook.com/post/${postId}` }
            : { platform: "moltx", post_id: postId },
        ),
      });
      const data = await res.json();
      if (res.ok && data.success !== false) {
        return {
          success: true,
          message: "4claw indexer triggered. Token entering review queue.",
        };
      }
      return {
        success: false,
        message: `4claw trigger returned: ${data?.error || data?.message || res.status}. Post is still live and may be picked up.`,
      };
    }

    if (launchpad === "clawnch" && source === "moltbook") {
      // Clawnch Moltbook: must call their API
      const res = await fetch(`${CLAWNCH_API}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moltbook_key: apiKey,
          post_id: postId,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return {
          success: true,
          message: `Clawnch deployed! Contract: ${data.token_address || "pending"}`,
        };
      }
      return {
        success: false,
        message: `Clawnch launch returned: ${data?.error || res.status}`,
      };
    }

    // Kibu and auto-scanned agents: no trigger needed
    if (
      launchpad === "kibu" ||
      source === "moltx" ||
      source === "4claw_org" ||
      source === "clawstr"
    ) {
      return {
        success: true,
        message: `${launchpad === "kibu" ? "Kibu" : launchpad === "clawnch" ? "Clawnch" : "4claw"} auto-scans every minute. Your token will deploy automatically.`,
      };
    }

    return { success: true, message: "Post created. Awaiting deployment." };
  } catch (error) {
    return {
      success: false,
      message: `Trigger failed: ${String(error)}. Post is still live.`,
    };
  }
}
