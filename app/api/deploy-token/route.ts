import { NextResponse } from "next/server";
import { Wallet } from "ethers";

const MOLTX_API = "https://moltx.io/v1";
const FOURCLAW_ORG_API = "https://www.4claw.org/api/v1";
const MOLTBOOK_API = "https://www.moltbook.com/api/v1";
const FOURCLAW_FUN_API = "https://api.4claw.fun/api";
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

// ── Build launch command content ────────────────────────────────
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

// Moltbook-safe content (JSON in code block for markdown safety)
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

// ═══════════════════════════════════════════════════════════════
// AGENT: MOLTX
// - Register: POST moltx.io/v1/agents/register (free, instant)
// - EVM Wallet: MANDATORY for ALL write operations (posts, likes, follows)
// - Post: POST moltx.io/v1/posts
// ═══════════════════════════════════════════════════════════════

async function registerMoltxAgent(
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
      data?.error || data?.message || `Moltx register failed (${res.status})`,
    );
  const apiKey =
    data?.data?.api_key || data?.api_key || data?.data?.data?.api_key;
  if (!apiKey) throw new Error("Moltx registered but no API key returned");
  return { apiKey, agentName };
}

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
      `EVM challenge failed: ${challengeData?.error || challengeRes.status}`,
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
    throw new Error(`EVM verify failed: ${vd?.error || verifyRes.status}`);
  }

  return { address: wallet.address, privateKey: wallet.privateKey };
}

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
    throw new Error(
      data?.error || data?.message || `Moltx post failed (${res.status})`,
    );
  }
  const postId =
    data?.data?.id || data?.id || data?.data?.post?.id || "unknown";
  return { postId };
}

// ═══════════════════════════════════════════════════════════════
// AGENT: 4CLAW.ORG
// - Register: POST www.4claw.org/api/v1/agents/register (free, instant)
// - EVM Wallet: NOT NEEDED
// - Post: POST www.4claw.org/api/v1/boards/crypto/threads
// ═══════════════════════════════════════════════════════════════

async function register4clawOrgAgent(
  tokenName: string,
  tokenSymbol: string,
): Promise<{ apiKey: string; agentName: string }> {
  const agentName = `${tokenName.replace(/[^A-Za-z0-9_]/g, "")}_${Date.now().toString(36)}`;
  const res = await fetch(`${FOURCLAW_ORG_API}/agents/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: agentName,
      description: `Token launcher for $${tokenSymbol} (${tokenName})`,
    }),
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(
      data?.error || data?.message || `4claw.org register failed (${res.status})`,
    );
  const apiKey = data?.agent?.api_key;
  if (!apiKey)
    throw new Error("4claw.org registered but no API key returned");
  return { apiKey, agentName: data?.agent?.name || agentName };
}

async function postTo4clawOrg(
  apiKey: string,
  content: string,
  tokenName: string,
): Promise<{ postId: string }> {
  const res = await fetch(`${FOURCLAW_ORG_API}/boards/crypto/threads`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: `Launching $${tokenName}`,
      content,
      anon: false,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data?.error || data?.message || `4claw.org post failed (${res.status})`,
    );
  }
  const postId =
    data?.thread?.id || data?.id || data?.data?.id || "unknown";
  return { postId };
}

// ═══════════════════════════════════════════════════════════════
// AGENT: CLAWSTR (Nostr-based, auto-scanned)
// - Register: Uses Moltx registration (Clawstr scans Moltx posts via Nostr relays)
// - EVM Wallet: YES (because it posts through Moltx)
// - Post: Through Moltx API
// ═══════════════════════════════════════════════════════════════
// (Reuses Moltx functions above)

// ── Trigger launchpad indexer ────────────────────────────────────
async function triggerLaunchpad(
  launchpad: string,
  source: string,
  postId: string | undefined,
  apiKey: string,
): Promise<string> {
  if (!postId || postId === "unknown")
    return "No post ID -- launchpad will auto-scan within 1 minute.";

  if (launchpad === "4claw") {
    const res = await fetch(`${FOURCLAW_FUN_API}/launch`, {
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

  // Auto-scanned platforms
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

    let apiKey = existingApiKey || "";
    let evmWallet: { address: string; privateKey: string } | null = null;
    let agentName = "";

    // ─────────────────────────────────────────────────────────
    // ROUTE BY AGENT
    // ─────────────────────────────────────────────────────────

    // ── MOLTX AGENT ──
    // Register on Moltx -> Link EVM wallet -> Post to Moltx
    if (agent === "moltx") {
      if (!apiKey) {
        log.push(`Registering "${token.name}" agent on Moltx...`);
        const reg = await registerMoltxAgent(token.name, token.symbol);
        apiKey = reg.apiKey;
        agentName = reg.agentName;
        log.push(`Agent "${reg.agentName}" registered on Moltx`);
      }

      // EVM wallet is MANDATORY for Moltx posting
      log.push("Generating EVM wallet...");
      const chainId = token.chain === "base" ? 8453 : 56;
      evmWallet = await linkEvmWallet(apiKey, chainId);
      log.push(`Wallet ${evmWallet.address} linked via EIP-712`);

      // Post to Moltx
      const content = buildPostContent(launchpad, token);
      log.push("Posting to Moltx...");
      const { postId } = await postToMoltx(apiKey, content);
      log.push(`Posted to Moltx! ID: ${postId}`);

      // Trigger launchpad
      const trigger = await triggerLaunchpad(launchpad, "moltx", postId, apiKey);
      log.push(trigger);

      return NextResponse.json({
        success: true,
        message: `Posted via Moltx. ${trigger}`,
        postId,
        postUrl: `https://moltx.io/post/${postId}`,
        autoScanned: true,
        log,
        credentials: !existingApiKey
          ? { apiKey, agentName, evmWallet }
          : undefined,
      });
    }

    // ── 4CLAW.ORG AGENT ──
    // Register on 4claw.org -> Post to /crypto/ board -> NO EVM wallet needed
    if (agent === "4claw_org") {
      if (!apiKey) {
        log.push(`Registering "${token.name}" agent on 4claw.org...`);
        const reg = await register4clawOrgAgent(token.name, token.symbol);
        apiKey = reg.apiKey;
        agentName = reg.agentName;
        log.push(`Agent "${reg.agentName}" registered on 4claw.org`);
      }

      // Post to 4claw.org /crypto/ board -- NO EVM wallet needed
      const content = buildPostContent(launchpad, token);
      log.push("Posting to 4claw.org /crypto/ board...");
      const { postId } = await postTo4clawOrg(apiKey, content, token.name);
      log.push(`Posted to 4claw.org! Thread ID: ${postId}`);

      // Trigger launchpad
      const trigger = await triggerLaunchpad(launchpad, "4claw_org", postId, apiKey);
      log.push(trigger);

      return NextResponse.json({
        success: true,
        message: `Posted on 4claw.org. ${trigger}`,
        postId,
        postUrl: `https://www.4claw.org/crypto/thread/${postId}`,
        autoScanned: true,
        log,
        credentials: !existingApiKey
          ? { apiKey, agentName }
          : undefined,
      });
    }

    // ── CLAWSTR AGENT ──
    // Clawstr auto-scans Moltx posts via Nostr relays. 
    // So we register on Moltx + link EVM wallet + post to Moltx (same as Moltx agent).
    if (agent === "clawstr") {
      if (!apiKey) {
        log.push(`Registering "${token.name}" agent on Moltx (for Clawstr relay)...`);
        const reg = await registerMoltxAgent(token.name, token.symbol);
        apiKey = reg.apiKey;
        agentName = reg.agentName;
        log.push(`Agent "${reg.agentName}" registered`);
      }

      // EVM wallet is MANDATORY for Moltx posting (Clawstr uses Moltx under the hood)
      log.push("Generating EVM wallet for Moltx...");
      const chainId = token.chain === "base" ? 8453 : 56;
      evmWallet = await linkEvmWallet(apiKey, chainId);
      log.push(`Wallet ${evmWallet.address} linked via EIP-712`);

      // Post to Moltx (Clawstr auto-scans)
      const content = buildPostContent(launchpad, token);
      log.push("Posting to Moltx (Clawstr auto-scans)...");
      const { postId } = await postToMoltx(apiKey, content);
      log.push(`Posted! ID: ${postId}`);

      const trigger = await triggerLaunchpad(launchpad, "moltx", postId, apiKey);
      log.push(trigger);

      return NextResponse.json({
        success: true,
        message: `Posted via Clawstr (Moltx). ${trigger}`,
        postId,
        postUrl: `https://moltx.io/post/${postId}`,
        autoScanned: true,
        log,
        credentials: !existingApiKey
          ? { apiKey, agentName, evmWallet }
          : undefined,
      });
    }

    // ── MOLTBOOK AGENT ──
    // User provides their own Moltbook API key -> Post to Moltbook -> NO EVM wallet
    if (agent === "moltbook") {
      if (!apiKey) {
        return NextResponse.json(
          {
            error:
              "Moltbook requires an API key. Get one from moltbook.com and enter it.",
          },
          { status: 400 },
        );
      }

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

    return NextResponse.json(
      { error: `Unknown agent: ${agent}` },
      { status: 400 },
    );
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
