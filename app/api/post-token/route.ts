import { NextResponse } from "next/server";

// Launchpad configs
const LAUNCHPADS = {
  "4claw": {
    command: "!4clawd",
    triggerUrl: "https://api.4claw.fun/api/launch",
    chain: "bsc",
    supportsTax: true,
  },
  kibu: {
    command: "!kibu",
    triggerUrl: null, // auto-scanned, no manual trigger needed
    chain: "bsc", // default, also supports base
    supportsTax: false,
  },
  clawnch: {
    command: "!clawnch",
    triggerUrl: "https://clawn.ch/api/launch", // only for moltbook
    chain: "base",
    supportsTax: false,
  },
} as const;

type LaunchpadId = keyof typeof LAUNCHPADS;

// Agent / platform configs
const AGENTS = {
  moltx: {
    postUrl: "https://moltx.io/v1/posts",
    authHeader: (key: string) => `Bearer ${key}`,
    buildBody: (content: string) => ({ content }),
    postIdPath: (data: Record<string, unknown>) =>
      (data?.data as Record<string, unknown>)?.id ||
      (data?.data as Record<string, unknown>)?.post &&
        ((data?.data as Record<string, unknown>)?.post as Record<string, unknown>)?.id ||
      data?.id,
  },
  moltbook: {
    postUrl: "https://www.moltbook.com/api/v1/posts",
    authHeader: (key: string) => `Bearer ${key}`,
    buildBody: (content: string, opts?: { submolt?: string; title?: string }) => ({
      submolt: opts?.submolt || "general",
      title: opts?.title || "Token Launch",
      content,
    }),
    postIdPath: (data: Record<string, unknown>) =>
      (data?.post as Record<string, unknown>)?.id || data?.id,
  },
  "4claw_org": {
    postUrl: "https://www.4claw.org/api/v1/posts",
    authHeader: (key: string) => `Bearer ${key}`,
    buildBody: (content: string) => ({
      board: "crypto",
      content,
    }),
    postIdPath: (data: Record<string, unknown>) => data?.id,
  },
  clawstr: {
    postUrl: "https://clawstr.com/api/v1/posts",
    authHeader: (key: string) => `Bearer ${key}`,
    buildBody: (content: string) => ({
      subclaw: "crypto",
      content,
    }),
    postIdPath: (data: Record<string, unknown>) => data?.id,
  },
} as const;

type AgentId = keyof typeof AGENTS;

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
  // 4claw tax fields
  tax?: number;
  funds?: number;
  burn?: number;
  holders?: number;
  lp?: number;
}

function buildPostContent(
  launchpad: LaunchpadId,
  agent: AgentId,
  token: TokenData
): string {
  const lp = LAUNCHPADS[launchpad];
  const chainField = token.chain || lp.chain;

  // For moltbook, use JSON inside code block (markdown-safe)
  if (agent === "moltbook") {
    const jsonObj: Record<string, unknown> = {
      name: token.name,
      symbol: token.symbol.toUpperCase(),
      wallet: token.wallet,
      description: token.description || "",
      image: token.image || "",
    };
    if (token.website) jsonObj.website = token.website;
    if (token.twitter) jsonObj.twitter = token.twitter;
    if (launchpad === "kibu" || launchpad === "clawnch") {
      jsonObj.chain = chainField;
    }

    return `${lp.command}\n\`\`\`json\n${JSON.stringify(jsonObj, null, 2)}\n\`\`\``;
  }

  // For moltx / 4claw.org / clawstr, use key:value format
  let post = `${lp.command}\nname: ${token.name}\nsymbol: ${token.symbol.toUpperCase()}\nwallet: ${token.wallet}`;
  if (token.description) post += `\ndescription: ${token.description}`;
  if (token.image) post += `\nimage: ${token.image}`;
  if (token.website) post += `\nwebsite: ${token.website}`;
  if (token.twitter) post += `\ntwitter: ${token.twitter}`;
  if (token.telegram && launchpad === "4claw")
    post += `\ntelegram: ${token.telegram}`;

  // Chain field for kibu/clawnch
  if (launchpad === "kibu" || launchpad === "clawnch") {
    post += `\nchain: ${chainField}`;
  }

  // Tax config for 4claw only
  if (launchpad === "4claw" && lp.supportsTax && token.tax) {
    post += `\n\ntax: ${token.tax}\nfunds: ${token.funds || 97}\nburn: ${token.burn || 1}\nholders: ${token.holders || 1}\nlp: ${token.lp || 1}`;
  }

  return post;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      launchpad,
      agent,
      apiKey,
      token,
      moltbookSubmolt,
    }: {
      launchpad: LaunchpadId;
      agent: AgentId;
      apiKey: string;
      token: TokenData;
      moltbookSubmolt?: string;
    } = body;

    // Validate
    if (!LAUNCHPADS[launchpad]) {
      return NextResponse.json(
        { error: `Unknown launchpad: ${launchpad}` },
        { status: 400 }
      );
    }
    if (!AGENTS[agent]) {
      return NextResponse.json(
        { error: `Unknown agent/platform: ${agent}` },
        { status: 400 }
      );
    }
    if (!apiKey) {
      return NextResponse.json(
        { error: "API key is required" },
        { status: 400 }
      );
    }
    if (!token?.name || !token?.symbol || !token?.wallet) {
      return NextResponse.json(
        { error: "Token name, symbol, and wallet are required" },
        { status: 400 }
      );
    }

    const agentConfig = AGENTS[agent];
    const content = buildPostContent(launchpad, agent, token);

    // Determine submolt for moltbook
    let submolt = moltbookSubmolt;
    if (agent === "moltbook" && !submolt) {
      if (launchpad === "kibu") submolt = "kibu";
      else if (launchpad === "clawnch") submolt = "clawnch";
      else submolt = "general";
    }

    // Step 1: Post to the agent platform
    const postBody =
      agent === "moltbook"
        ? agentConfig.buildBody(content, {
            submolt,
            title: `Launching ${token.symbol.toUpperCase()}!`,
          })
        : agentConfig.buildBody(content);

    const postRes = await fetch(agentConfig.postUrl, {
      method: "POST",
      headers: {
        Authorization: agentConfig.authHeader(apiKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(postBody),
    });

    const postData = await postRes.json();

    if (!postRes.ok) {
      return NextResponse.json(
        {
          error:
            postData.error || postData.message || `Failed to post on ${agent}`,
          details: postData,
          step: "post",
        },
        { status: postRes.status }
      );
    }

    const postId = agentConfig.postIdPath(postData);

    // Step 2: Trigger launchpad indexer (if applicable)
    const lpConfig = LAUNCHPADS[launchpad];
    let launchTriggered = false;
    let launchData = null;

    // 4claw always needs manual trigger
    if (launchpad === "4claw" && postId) {
      const triggerPayload =
        agent === "moltbook"
          ? { url: `https://www.moltbook.com/post/${postId}` }
          : { platform: agent === "moltx" ? "moltx" : "4claw", post_id: postId };

      try {
        const triggerRes = await fetch(lpConfig.triggerUrl!, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(triggerPayload),
        });
        launchData = await triggerRes.json();
        launchTriggered = triggerRes.ok;
      } catch {
        // Trigger failed, but post was created
      }
    }

    // clawnch needs API call only for moltbook
    if (launchpad === "clawnch" && agent === "moltbook" && postId && apiKey) {
      try {
        const triggerRes = await fetch(lpConfig.triggerUrl!, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            moltbook_key: apiKey,
            post_id: postId,
          }),
        });
        launchData = await triggerRes.json();
        launchTriggered = triggerRes.ok;
      } catch {
        // ok
      }
    }

    // kibu and clawnch (via moltx/4claw.org/clawstr) are auto-scanned
    const autoScanned =
      (launchpad === "kibu") ||
      (launchpad === "clawnch" && agent !== "moltbook");

    return NextResponse.json({
      success: true,
      postId,
      content,
      launchpad,
      agent,
      launchTriggered,
      autoScanned,
      launchData,
      message: autoScanned
        ? `Posted on ${agent}! ${launchpad} will auto-scan and launch within 1 minute.`
        : launchTriggered
          ? `Posted on ${agent} and ${launchpad} launch triggered!`
          : postId
            ? `Posted on ${agent}. Trigger the ${launchpad} indexer manually if needed.`
            : `Posted on ${agent}. Token may be processed via auto-scan.`,
    });
  } catch (error) {
    console.error("Post token error:", error);
    return NextResponse.json(
      { error: "Failed to post token", details: String(error) },
      { status: 500 }
    );
  }
}
