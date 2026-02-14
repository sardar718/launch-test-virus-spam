import { NextResponse } from "next/server";
import { Wallet } from "ethers";

const MOLTX_API = "https://moltx.io/v1";
const FOURCLAW_ORG_API = "https://www.4claw.org/api/v1";
const MOLTBOOK_API = "https://www.moltbook.com/api/v1";
const FOURCLAW_FUN_API = "https://api.4claw.fun/api";
const CLAWNCH_API = "https://clawn.ch/api";
const SYNTHLAUNCH_API = "https://synthlaunch.fun/api";

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
function buildPostContent(launchpad: string, token: TokenData, kibuPlatform?: string): string {
  // SynthLaunch uses its own format
  if (launchpad === "synthlaunch") return buildSynthLaunchContent(token);

  const cmd =
    launchpad === "4claw"
      ? "!4clawd"
      : launchpad === "kibu"
        ? "!kibu"
        : launchpad === "molaunch"
          ? "!molaunch"
          : "!clawnch";
  let post = `${cmd}\nname: ${token.name}\nsymbol: ${token.symbol}\nwallet: ${token.wallet}`;
  if (token.description) post += `\ndescription: ${token.description}`;
  if (token.image) post += `\nimage: ${token.image}`;
  if (token.website) post += `\nwebsite: ${token.website}`;
  if (token.twitter) post += `\ntwitter: ${token.twitter}`;
  if (token.telegram && (launchpad === "4claw" || launchpad === "molaunch"))
    post += `\ntelegram: ${token.telegram}`;
  if ((launchpad === "kibu" || launchpad === "clawnch") && token.chain)
    post += `\nchain: ${token.chain}`;
  // Four.meme launchpad override for Kibu (uses 'launchpad' field per new docs)
  if (launchpad === "kibu" && kibuPlatform === "fourmeme")
    post += `\nlaunchpad: fourmeme`;
  if (launchpad === "4claw" && token.tax) {
    post += `\n\ntax: ${token.tax}\nfunds: ${token.funds || 97}\nburn: ${token.burn || 1}\nholders: ${token.holders || 1}\nlp: ${token.lp || 1}`;
  }
  return post;
}

function buildSynthLaunchContent(token: TokenData): string {
  const jsonObj: Record<string, string | number> = {
    name: token.name,
    symbol: token.symbol,
    description: token.description || `$${token.symbol} token`,
    image: token.image || "",
    wallet: token.wallet,
  };
  if (token.tax) jsonObj.taxRate = token.tax * 100; // basis points
  if (token.website) jsonObj.website = token.website;
  if (token.twitter) jsonObj.twitter = token.twitter;
  return `!synthlaunch\n\`\`\`json\n${JSON.stringify(jsonObj, null, 2)}\n\`\`\``;
}

function buildMoltbookContent(launchpad: string, token: TokenData, kibuPlatform?: string): string {
  // SynthLaunch uses its own format for Moltbook posts
  if (launchpad === "synthlaunch") return buildSynthLaunchContent(token);

  const cmd =
    launchpad === "4claw"
      ? "!4clawd"
      : launchpad === "kibu"
        ? "!kibu"
        : launchpad === "molaunch"
          ? "!molaunch"
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
  // Four.meme launchpad override for Kibu (uses 'launchpad' field per new docs)
  if (launchpad === "kibu" && kibuPlatform === "fourmeme")
    jsonObj.launchpad = "fourmeme";
  return `${cmd}\n\`\`\`json\n${JSON.stringify(jsonObj, null, 2)}\n\`\`\``;
}

// ═══════════════════════════════════════════════════════════════
// MOLTX AGENT FUNCTIONS
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

/**
 * Link an EVM wallet to a Moltx agent.
 * Per moltx evm_eip712.md:
 *   1. POST /agents/me/evm/challenge  -> get typed_data + nonce
 *   2. Sign with ethers.js v6 signTypedData (strip EIP712Domain, pass domain as-is)
 *   3. POST /agents/me/evm/verify -> submit nonce + signature
 */
async function linkEvmWallet(
  apiKey: string,
  chainId: number,
  log: string[],
): Promise<{ address: string; privateKey: string }> {
  const wallet = Wallet.createRandom();
  log.push(`Generated wallet: ${wallet.address}`);

  // Step 1: Request challenge
  log.push(`Requesting EIP-712 challenge (chain_id: ${chainId})...`);
  const challengeRes = await fetch(`${MOLTX_API}/agents/me/evm/challenge`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ address: wallet.address, chain_id: chainId }),
  });
  const challengeBody = await challengeRes.text();

  let challengeData: Record<string, unknown>;
  try {
    challengeData = JSON.parse(challengeBody);
  } catch {
    throw new Error(`Challenge returned non-JSON: ${challengeBody.substring(0, 200)}`);
  }

  if (!challengeRes.ok) {
    throw new Error(
      `EVM challenge failed (${challengeRes.status}): ${(challengeData as Record<string, unknown>)?.error || challengeBody.substring(0, 200)}`,
    );
  }

  const cData = (challengeData as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  const nonce = cData?.nonce as string | undefined;
  const typedData = cData?.typed_data as Record<string, unknown> | undefined;
  if (!nonce || !typedData) {
    throw new Error(
      `Challenge missing fields. Keys: ${JSON.stringify(Object.keys(cData || {}))}`,
    );
  }
  log.push(`Challenge received (nonce: ${nonce.substring(0, 8)}...)`);

  // Step 2: Sign EIP-712
  // Per moltx evm_eip712.md ethers.js v6 example:
  //   const { EIP712Domain, ...types } = typedData.types;
  //   const signature = await wallet.signTypedData(typedData.domain, types, typedData.message);
  const allTypes = typedData.types as Record<string, unknown[]>;
  const { EIP712Domain: _unused, ...sigTypes } = allTypes;
  const domain = typedData.domain as Record<string, unknown>;
  const message = typedData.message as Record<string, unknown>;

  log.push("Signing EIP-712 typed data...");
  const signature = await wallet.signTypedData(domain, sigTypes, message);
  log.push(`Signature: ${signature.substring(0, 16)}...`);

  // Step 3: Verify
  log.push("Verifying signature with Moltx...");
  const verifyRes = await fetch(`${MOLTX_API}/agents/me/evm/verify`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ nonce, signature }),
  });
  const verifyBody = await verifyRes.text();

  let verifyData: Record<string, unknown>;
  try {
    verifyData = JSON.parse(verifyBody);
  } catch {
    throw new Error(`Verify returned non-JSON: ${verifyBody.substring(0, 200)}`);
  }

  if (!verifyRes.ok) {
    throw new Error(
      `EVM verify failed (${verifyRes.status}): ${(verifyData as Record<string, unknown>)?.error || verifyBody.substring(0, 200)}`,
    );
  }

  log.push(`Wallet ${wallet.address} verified and linked!`);
  return { address: wallet.address, privateKey: wallet.privateKey };
}

/**
 * Engage with the Moltx feed before posting.
 * Moltx now requires agents to interact with the feed before they can post.
 * We like a random post from the global feed to satisfy this requirement.
 */
async function engageMoltxFeed(apiKey: string, log: string[]): Promise<void> {
  log.push("Engaging with Moltx feed...");
  try {
    // Fetch global trending feed
    const feedRes = await fetch(`${MOLTX_API}/feed/global?limit=5`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!feedRes.ok) return;
    const feedData = await feedRes.json();
    const posts = feedData?.data?.posts || feedData?.data || feedData?.posts || [];
    if (posts.length === 0) return;

    // Like the first post
    const targetPost = posts[0];
    const postId = targetPost?.id || targetPost?.post_id;
    if (!postId) return;

    await fetch(`${MOLTX_API}/posts/${postId}/like`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
    log.push("Feed engagement complete");
  } catch {
    // Non-critical, continue anyway
    log.push("Feed engagement skipped");
  }
}

/**
 * Post to Moltx with retry.
 * If first attempt fails with "EVM wallet required", re-link wallet and retry once.
 * If first attempt fails with "Engage before posting", engage with feed and retry.
 */
async function postToMoltxWithRetry(
  apiKey: string,
  content: string,
  chainId: number,
  log: string[],
  evmWalletRef: { current: { address: string; privateKey: string } | null },
): Promise<{ postId: string }> {
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${MOLTX_API}/posts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content }),
    });
    const body = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body);
    } catch {
      throw new Error(`Moltx post returned non-JSON: ${body.substring(0, 200)}`);
    }

    if (res.ok) {
      const postId =
        (data as Record<string, unknown>)?.data &&
        typeof (data as Record<string, unknown>).data === "object"
          ? ((data as Record<string, Record<string, unknown>>).data?.id as string) ||
            ((data as Record<string, Record<string, Record<string, unknown>>>).data?.post?.id as string)
          : (data as Record<string, unknown>)?.id as string;
      return { postId: postId || "unknown" };
    }

    const errMsg = (data?.error as string) || (data?.message as string) || `Moltx post failed (${res.status})`;

    // If "EVM wallet required" and we haven't exhausted retries, re-link wallet
    if (errMsg.toLowerCase().includes("evm wallet required") && attempt < MAX_RETRIES) {
      log.push(`Post attempt ${attempt} failed: EVM wallet required. Re-linking wallet...`);
      try {
        const newWallet = await linkEvmWallet(apiKey, chainId, log);
        evmWalletRef.current = newWallet;
        log.push("Wallet re-linked. Retrying post...");
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      } catch (relinkErr) {
        log.push(`Re-link failed: ${String(relinkErr)}`);
        throw new Error(errMsg);
      }
    }

    // If "Engage before posting", engage with feed and retry
    if (errMsg.toLowerCase().includes("engage before posting") && attempt < MAX_RETRIES) {
      log.push("Moltx requires feed engagement. Engaging...");
      await engageMoltxFeed(apiKey, log);
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }

    throw new Error(errMsg);
  }

  throw new Error("Post failed after all retries");
}

// ═══════════════════════════════════════════════════════════════
// 4CLAW.ORG AGENT FUNCTIONS (NO EVM wallet needed)
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

  // SynthLaunch: POST /api/launch with moltbook_key + post_id
  if (launchpad === "synthlaunch" && source === "moltbook") {
    try {
      const res = await fetch(`${SYNTHLAUNCH_API}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moltbook_key: apiKey, post_id: postId }),
      });
      const d = await res.json();
      if (d.success) {
        return `SynthLaunch deployed! Token: ${d.token_address || "pending"} | Flap: ${d.flap_url || ""}`;
      }
      return `SynthLaunch: ${d?.error || res.status}`;
    } catch (e) {
      return `SynthLaunch trigger error: ${String(e)}`;
    }
  }

  // For SynthLaunch via non-moltbook agents, post content must still get picked up
  if (launchpad === "synthlaunch") {
    return "SynthLaunch auto-scans Moltbook posts with !synthlaunch. Token will deploy within 1 minute.";
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

  // Molaunch triggers via Moltx post_id
  if (launchpad === "molaunch") {
    try {
      // Try bags.fourclaw.fun first, then pump, then clanker
      const endpoints = [
        "https://bags.fourclaw.fun/api/launch",
        "https://pump.fourclaw.fun/api/launch",
        "https://clanker.fourclaw.fun/api/launch",
      ];
      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ post_id: postId }),
          });
          const d = await res.json();
          if (d.success || d.job_id) {
            return `Molaunch queued! Job: ${d.job_id || "processing"}. Status: ${d.status_url || "check bags.fm"}`;
          }
        } catch {
          continue;
        }
      }
      return "Molaunch will auto-scan the Moltx post within 1 minute.";
    } catch {
      return "Molaunch will auto-scan the Moltx post within 1 minute.";
    }
  }

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
      kibuPlatform,
      token,
    }: {
      launchpad: string;
      agent: string;
      existingApiKey?: string;
      kibuPlatform?: string;
      token: TokenData;
    } = body;

    if (!launchpad || !agent || !token?.name || !token?.symbol) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    let apiKey = existingApiKey || "";
    const evmWalletRef: { current: { address: string; privateKey: string } | null } = { current: null };
    let agentName = "";

    // ── MOLTX AGENT ──
    if (agent === "moltx") {
      if (!apiKey) {
        log.push(`Registering "${token.name}" agent on Moltx...`);
        const reg = await registerMoltxAgent(token.name, token.symbol);
        apiKey = reg.apiKey;
        agentName = reg.agentName;
        log.push(`Agent "${reg.agentName}" registered on Moltx`);
      }

      // Link EVM wallet (mandatory for posting)
      const chainId = token.chain === "base" ? 8453 : 56;
      evmWalletRef.current = await linkEvmWallet(apiKey, chainId, log);

      // Small delay to let Moltx propagate wallet link
      await new Promise((r) => setTimeout(r, 1500));

      // Engage with feed before posting (Moltx requirement)
      await engageMoltxFeed(apiKey, log);

      // Post with retry (re-links wallet if first attempt fails)
      const content = buildPostContent(launchpad, token, kibuPlatform);
      log.push("Posting to Moltx...");
      const { postId } = await postToMoltxWithRetry(apiKey, content, chainId, log, evmWalletRef);
      log.push(`Posted to Moltx! ID: ${postId}`);

      const trigger = await triggerLaunchpad(launchpad, "moltx", postId, apiKey);
      log.push(trigger);

      return NextResponse.json({
        success: true,
        message: `Posted via Moltx. ${trigger}`,
        postId,
        postUrl: `https://moltx.io/post/${postId}`,
        autoScanned: true,
        log,
        tokenName: token.name,
        tokenSymbol: token.symbol,
        credentials: !existingApiKey
          ? { apiKey, agentName, evmWallet: evmWalletRef.current }
          : undefined,
      });
    }

    // ── 4CLAW.ORG AGENT ── (NO EVM wallet needed)
    if (agent === "4claw_org") {
      if (!apiKey) {
        log.push(`Registering "${token.name}" agent on 4claw.org...`);
        const reg = await register4clawOrgAgent(token.name, token.symbol);
        apiKey = reg.apiKey;
        agentName = reg.agentName;
        log.push(`Agent "${reg.agentName}" registered on 4claw.org`);
      }

      const content = buildPostContent(launchpad, token, kibuPlatform);
      log.push("Posting to 4claw.org /crypto/ board...");
      const { postId } = await postTo4clawOrg(apiKey, content, token.name);
      log.push(`Posted to 4claw.org! Thread ID: ${postId}`);

      const trigger = await triggerLaunchpad(launchpad, "4claw_org", postId, apiKey);
      log.push(trigger);

      return NextResponse.json({
        success: true,
        message: `Posted on 4claw.org. ${trigger}`,
        postId,
        postUrl: `https://www.4claw.org/crypto/thread/${postId}`,
        autoScanned: true,
        log,
        tokenName: token.name,
        tokenSymbol: token.symbol,
        credentials: !existingApiKey
          ? { apiKey, agentName }
          : undefined,
      });
    }

    // ── CLAWSTR AGENT ── (Uses Moltx registration + EVM wallet)
    if (agent === "clawstr") {
      if (!apiKey) {
        log.push(`Registering "${token.name}" agent on Moltx (for Clawstr relay)...`);
        const reg = await registerMoltxAgent(token.name, token.symbol);
        apiKey = reg.apiKey;
        agentName = reg.agentName;
        log.push(`Agent "${reg.agentName}" registered`);
      }

      const chainId = token.chain === "base" ? 8453 : 56;
      evmWalletRef.current = await linkEvmWallet(apiKey, chainId, log);

      await new Promise((r) => setTimeout(r, 1500));

      // Engage with feed before posting (Moltx requirement)
      await engageMoltxFeed(apiKey, log);

      const content = buildPostContent(launchpad, token, kibuPlatform);
      log.push("Posting to Moltx (Clawstr auto-scans)...");
      const { postId } = await postToMoltxWithRetry(apiKey, content, chainId, log, evmWalletRef);
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
        tokenName: token.name,
        tokenSymbol: token.symbol,
        credentials: !existingApiKey
          ? { apiKey, agentName, evmWallet: evmWalletRef.current }
          : undefined,
      });
    }

    // ── FOURCLAW.FUN DIRECT API ── (no agent needed)
    if (agent === "direct_api" && launchpad === "fourclaw_fun") {
      const platform = token.chain === "solana" ? "BAGS" : "FLAP";
      const agentId = `launcher_${Date.now().toString(36)}`;
      log.push(`Launching on FourClaw.Fun (${platform})...`);

      const payload: Record<string, unknown> = {
        platform,
        name: token.name,
        symbol: token.symbol.toUpperCase(),
        agentId,
        agentName: `${token.name} Launcher`,
        creatorWallet: token.wallet,
      };
      if (token.description) payload.description = token.description;
      if (token.image) payload.imageUrl = token.image;
      if (token.website) payload.website = token.website;
      if (token.twitter) payload.twitter = token.twitter;
      if (token.telegram) payload.telegram = token.telegram;

      // FLAP-specific tax settings
      if (platform === "FLAP" && token.tax) {
        payload.taxRate = token.tax * 100; // Convert % to BPS
        payload.vaultType = "split";
      }

      const res = await fetch("https://fourclaw.fun/api/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data?.error || `FourClaw.Fun launch failed (${res.status})`);
      }

      const jobId = data?.data?.jobId || "unknown";
      const tokenId = data?.data?.tokenId || "";
      log.push(`Launch queued! Job: ${jobId}`);
      log.push(`Platform: ${platform} | Status: ${data?.data?.status || "queued"}`);
      if (data?.data?.estimatedTime) log.push(`Estimated: ${data.data.estimatedTime}`);

      return NextResponse.json({
        success: true,
        message: `FourClaw.Fun launch queued on ${platform}. Job: ${jobId}`,
        postId: jobId,
        postUrl: `https://fourclaw.fun/token/${tokenId}`,
        autoScanned: false,
        log,
        tokenName: token.name,
        tokenSymbol: token.symbol,
      });
    }

    // ── MOLTBOOK AGENT ── (requires pre-claimed API key)
    if (agent === "moltbook") {
      if (!apiKey) {
        return NextResponse.json(
          { error: "Moltbook requires a claimed API key. Register at moltbook.com, claim your agent, then enter the key." },
          { status: 400 },
        );
      }

      const content = buildMoltbookContent(launchpad, token, kibuPlatform);
      const submolt =
        launchpad === "kibu"
          ? "kibu"
          : launchpad === "clawnch"
            ? "clawnch"
            : launchpad === "molaunch"
              ? "molaunch"
              : launchpad === "synthlaunch"
                ? "synthlaunch"
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

      const trigger = await triggerLaunchpad(launchpad, "moltbook", postId, apiKey);
      log.push(trigger);

      return NextResponse.json({
        success: true,
        message: `Posted to Moltbook. ${trigger}`,
        postId,
        postUrl: `https://www.moltbook.com/post/${postId}`,
        autoScanned: false,
        log,
        tokenName: token.name,
        tokenSymbol: token.symbol,
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
