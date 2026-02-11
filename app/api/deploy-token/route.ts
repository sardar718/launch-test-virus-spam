import { NextResponse } from "next/server";
import { Wallet } from "ethers";

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

// ── Build post content ──────────────────────────────────────────
function buildPostContent(launchpad: string, token: TokenData): string {
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
  if (launchpad === "4claw" && token.tax) {
    post += `\n\ntax: ${token.tax}\nfunds: ${token.funds || 97}\nburn: ${token.burn || 1}\nholders: ${token.holders || 1}\nlp: ${token.lp || 1}`;
  }
  return post;
}

// Build Moltbook-safe content (JSON in code block)
function buildMoltbookContent(launchpad: string, token: TokenData): string {
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
  if ((launchpad === "kibu" || launchpad === "clawnch") && token.chain)
    jsonObj.chain = token.chain;
  return `${cmd}\n\`\`\`json\n${JSON.stringify(jsonObj, null, 2)}\n\`\`\``;
}

// ── Register Moltx agent ────────────────────────────────────────
// All agents (Moltx, 4claw.org, Clawstr) use Moltx registration under the hood.
// The Moltx API is the single registration endpoint for all auto-register agents.
async function registerAgent(
  tokenName: string,
  tokenSymbol: string,
): Promise<{ apiKey: string; agentName: string }> {
  const agentName = `${tokenName.toLowerCase().replace(/[^a-z0-9]/g, "")}_${Date.now().toString(36)}`;
  const res = await fetch(`${MOLTX_API}/agents/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: agentName,
      display_name: tokenName,
      description: `Token launcher for $${tokenSymbol}`,
      avatar_emoji: "\uD83E\uDD9E",
    }),
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(
      data?.error || data?.message || `Register failed (${res.status})`,
    );
  const apiKey =
    data?.data?.api_key || data?.api_key || data?.data?.data?.api_key;
  if (!apiKey) throw new Error("Registered but no API key returned");
  return { apiKey, agentName };
}

// ── Link EVM wallet via EIP-712 ─────────────────────────────────
async function linkEvmWallet(
  apiKey: string,
  chainId: number,
): Promise<{ address: string; privateKey: string }> {
  const wallet = Wallet.createRandom();

  // Step 1: Request challenge
  const challengeRes = await fetch(`${MOLTX_API}/agents/me/evm/challenge`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ address: wallet.address, chain_id: chainId }),
  });
  const challengeData = await challengeRes.json();
  if (!challengeRes.ok)
    throw new Error(
      `Challenge failed: ${challengeData?.error || challengeRes.status}`,
    );

  const nonce = challengeData?.data?.nonce;
  const typedData = challengeData?.data?.typed_data;
  if (!nonce || !typedData)
    throw new Error("Challenge response missing nonce or typed_data");

  // Step 2: Sign EIP-712
  const { EIP712Domain: _unused, ...sigTypes } = typedData.types;
  const domain = { ...typedData.domain };
  if (typeof domain.chainId === "string") {
    domain.chainId =
      Number.parseInt(domain.chainId, 16) || Number(domain.chainId);
  }
  const signature = await wallet.signTypedData(
    domain,
    sigTypes,
    typedData.message,
  );

  // Step 3: Verify
  const verifyRes = await fetch(`${MOLTX_API}/agents/me/evm/verify`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ nonce, signature }),
  });
  if (!verifyRes.ok) {
    const vd = await verifyRes.json();
    throw new Error(`Verify failed: ${vd?.error || verifyRes.status}`);
  }

  return { address: wallet.address, privateKey: wallet.privateKey };
}

// ── Post to Moltx (used by moltx, 4claw.org, and clawstr agents) ──
async function postToMoltx(
  apiKey: string,
  content: string,
): Promise<{ postId: string }> {
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
    const errMsg =
      data?.error || data?.message || `Moltx post failed (${res.status})`;
    throw new Error(errMsg);
  }
  const postId =
    data?.data?.id || data?.id || data?.data?.post?.id || "unknown";
  return { postId };
}

// ── Trigger launchpad indexer ────────────────────────────────────
async function triggerLaunchpad(
  launchpad: string,
  source: string,
  postId: string | undefined,
  apiKey: string,
): Promise<string> {
  if (!postId || postId === "unknown")
    return "No post ID -- launchpad will still auto-scan.";

  if (launchpad === "4claw") {
    const res = await fetch(`${FOURCLAW_API}/launch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        source === "moltbook"
          ? { url: `https://www.moltbook.com/post/${postId}` }
          : { platform: "moltx", post_id: postId },
      ),
    });
    const d = await res.json();
    return res.ok
      ? "4claw indexer triggered."
      : `4claw trigger: ${d?.error || d?.message || res.status}`;
  }

  if (launchpad === "clawnch" && source === "moltbook") {
    const res = await fetch(`${CLAWNCH_API}/launch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moltbook_key: apiKey, post_id: postId }),
    });
    const d = await res.json();
    return d.success
      ? `Clawnch deployed! Contract: ${d.token_address || "pending"}`
      : `Clawnch: ${d?.error || res.status}`;
  }

  // Auto-scanned platforms (kibu, clawnch via moltx/4claw.org/clawstr)
  const name =
    launchpad === "kibu"
      ? "Kibu"
      : launchpad === "clawnch"
        ? "Clawnch"
        : "4claw";
  return `${name} auto-scans posts every minute. Token will deploy automatically.`;
}

// ═══════════════════════════════════════════════════════════════
// MAIN DEPLOY ENDPOINT
// ═══════════════════════════════════════════════════════════════
export async function POST(request: Request) {
  const log: string[] = [];

  try {
    const body = await request.json();
    const {
      launchpad,
      agent,
      existingApiKey,
      token,
    }: {
      launchpad: string;
      agent: string;
      existingApiKey?: string;
      token: TokenData;
    } = body;

    if (!launchpad || !agent || !token?.name || !token?.symbol) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const agentLabel =
      agent === "moltx"
        ? "Moltx"
        : agent === "4claw_org"
          ? "4claw.org"
          : agent === "clawstr"
            ? "Clawstr"
            : "Moltbook";

    let apiKey = existingApiKey || "";
    let evmWallet: { address: string; privateKey: string } | null = null;
    let agentName = "";

    // ── STEP 1: Register agent ───────────────────────────────
    // Moltx, 4claw.org, and Clawstr all use the same Moltx registration API.
    // They differ in WHERE posts get scanned, not in how you register.
    if (!apiKey && agent !== "moltbook") {
      log.push(`Registering "${token.name}" agent on ${agentLabel}...`);
      const reg = await registerAgent(token.name, token.symbol);
      apiKey = reg.apiKey;
      agentName = reg.agentName;
      log.push(`Agent "${reg.agentName}" registered on ${agentLabel}`);
    }

    // Moltbook requires user-provided key
    if (agent === "moltbook" && !apiKey) {
      return NextResponse.json(
        {
          error:
            "Moltbook requires an API key. Get one from moltbook.com and enter it in the form.",
        },
        { status: 400 },
      );
    }

    // ── STEP 2: Link EVM wallet (ALL agents that post via Moltx API) ──
    // Moltx requires a linked EVM wallet for ALL write operations (posts, likes, follows).
    // Since moltx, 4claw_org, and clawstr agents all post through the Moltx API,
    // they ALL need a linked wallet before posting.
    if (agent !== "moltbook" && apiKey) {
      try {
        const chainId = token.chain === "base" ? 8453 : 56;
        log.push("Generating EVM wallet...");
        evmWallet = await linkEvmWallet(apiKey, chainId);
        log.push(`Wallet ${evmWallet.address} linked via EIP-712`);
      } catch (e) {
        log.push(
          `EVM wallet link warning: ${String(e)} -- will try posting anyway`,
        );
      }
    }

    // ── STEP 3: Post the launch command ──────────────────────
    // Key insight from skill docs:
    //   - Moltx agent    -> posts to Moltx API -> auto-scanned by launchpads
    //   - 4claw.org agent -> posts to Moltx API -> 4claw.org scans /crypto/ from Moltx
    //   - Clawstr agent   -> posts to Moltx API -> Clawstr scans Nostr relays from Moltx
    //   - Moltbook agent  -> posts to Moltbook API -> needs API trigger for indexer
    //
    // ALL auto-register agents post through Moltx. 4claw.org and Clawstr
    // are just different scanning layers on top of Moltx posts.

    if (agent === "moltbook") {
      // === MOLTBOOK: posts to Moltbook API directly ===
      const content = buildMoltbookContent(launchpad, token);
      const submolt =
        launchpad === "kibu"
          ? "kibu"
          : launchpad === "clawnch"
            ? "clawnch"
            : "crypto";
      log.push(`Posting to Moltbook (m/${submolt})...`);

      const res = await fetch(`${MOLTBOOK_API}/posts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          submolt,
          title: `Launching ${token.symbol} token!`,
          content,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data?.error || data?.message || `Moltbook returned ${res.status}`,
        );
      }

      const postId = data?.post?.id || data?.data?.id || data?.id;
      log.push(`Posted to Moltbook! ID: ${postId}`);

      const trigger = await triggerLaunchpad(
        launchpad,
        "moltbook",
        postId,
        apiKey,
      );
      log.push(trigger);

      return NextResponse.json({
        success: true,
        message: `Posted to Moltbook. ${trigger}`,
        postId,
        postUrl: `https://www.moltbook.com/post/${postId}`,
        autoScanned: false,
        log,
      });
    }

    // === ALL OTHER AGENTS (moltx, 4claw_org, clawstr): post to Moltx API ===
    if (!apiKey) {
      return NextResponse.json(
        { error: "No API key available" },
        { status: 400 },
      );
    }

    const content = buildPostContent(launchpad, token);
    log.push(`Posting via ${agentLabel} (Moltx network)...`);

    const { postId } = await postToMoltx(apiKey, content);
    log.push(`Posted! ID: ${postId}`);

    // Trigger the launchpad indexer
    const trigger = await triggerLaunchpad(launchpad, "moltx", postId, apiKey);
    log.push(trigger);

    const lpName =
      launchpad === "kibu"
        ? "Kibu"
        : launchpad === "clawnch"
          ? "Clawnch"
          : "4claw";

    return NextResponse.json({
      success: true,
      message: `Posted via ${agentLabel}. ${trigger}`,
      postId,
      postUrl: `https://moltx.io/post/${postId}`,
      autoScanned: true,
      log,
      credentials: !existingApiKey
        ? { apiKey, agentName, evmWallet }
        : undefined,
    });
  } catch (error) {
    console.error("Deploy token error:", error);
    return NextResponse.json(
      {
        error: String(error instanceof Error ? error.message : error),
        log,
      },
      { status: 500 },
    );
  }
}
