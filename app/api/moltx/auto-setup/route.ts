import { NextResponse } from "next/server";
import { Wallet } from "ethers";

const MOLTX_API = "https://moltx.io/v1";

export async function POST(request: Request) {
  const log: string[] = [];

  try {
    const body = await request.json();
    const {
      agentName,
      displayName,
      description,
      chainId = 56,
    } = body;

    if (!agentName?.trim()) {
      return NextResponse.json(
        { error: "Agent name is required" },
        { status: 400 }
      );
    }

    // ── Step 1: Generate a fresh EVM wallet ────────────────────
    const wallet = Wallet.createRandom();
    const privateKey = wallet.privateKey;
    const address = wallet.address;
    log.push(`Wallet generated: ${address}`);

    // ── Step 2: Register agent on Moltx ────────────────────────
    const regRes = await fetch(`${MOLTX_API}/agents/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: agentName.trim(),
        display_name: displayName?.trim() || agentName.trim(),
        description: description?.trim() || "4claw token launcher agent on BSC",
        avatar_emoji: "🦞",
      }),
    });

    const regData = await regRes.json();

    if (!regRes.ok) {
      return NextResponse.json(
        {
          error: regData.error || regData.message || "Failed to register agent",
          step: "register",
          details: regData,
          log,
        },
        { status: regRes.status }
      );
    }

    // Extract API key from various response shapes
    const apiKey =
      regData?.data?.api_key ||
      regData?.api_key ||
      regData?.data?.data?.api_key;

    if (!apiKey) {
      return NextResponse.json(
        {
          error: "Registered but could not extract API key from response",
          step: "register",
          details: regData,
          log,
        },
        { status: 500 }
      );
    }

    log.push(`Agent registered, API key received`);

    // ── Step 3: Request EVM challenge ──────────────────────────
    const challengeRes = await fetch(`${MOLTX_API}/agents/me/evm/challenge`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        address,
        chain_id: chainId,
      }),
    });

    const challengeData = await challengeRes.json();

    if (!challengeRes.ok) {
      return NextResponse.json({
        success: true,
        partial: true,
        step: "challenge_failed",
        message:
          "Agent registered and wallet generated. EVM challenge request failed -- you may need to link manually.",
        apiKey,
        wallet: { address, privateKey },
        challengeError: challengeData,
        log,
      });
    }

    const nonce = challengeData?.data?.nonce;
    const typedData = challengeData?.data?.typed_data;

    if (!nonce || !typedData) {
      return NextResponse.json({
        success: true,
        partial: true,
        step: "challenge_incomplete",
        message:
          "Agent registered and wallet generated. Challenge response missing nonce/typed_data.",
        apiKey,
        wallet: { address, privateKey },
        challengeResponse: challengeData,
        log,
      });
    }

    log.push(`Challenge received, nonce: ${nonce}`);

    // ── Step 4: Sign the EIP-712 typed data ────────────────────
    // ethers v6: signTypedData(domain, types, value)
    // Remove EIP712Domain from types -- ethers handles it automatically
    const { EIP712Domain: _unused, ...sigTypes } = typedData.types;

    // ethers requires chainId as a number in the domain
    const domain = { ...typedData.domain };
    if (typeof domain.chainId === "string") {
      domain.chainId = Number.parseInt(domain.chainId, 16) || Number(domain.chainId);
    }

    const signature = await wallet.signTypedData(
      domain,
      sigTypes,
      typedData.message
    );

    log.push(`Typed data signed`);

    // ── Step 5: Verify signature to link wallet ────────────────
    const verifyRes = await fetch(`${MOLTX_API}/agents/me/evm/verify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ nonce, signature }),
    });

    const verifyData = await verifyRes.json();

    if (!verifyRes.ok) {
      return NextResponse.json({
        success: true,
        partial: true,
        step: "verify_failed",
        message:
          "Agent registered, wallet generated, and challenge signed -- but verification failed. Try linking manually.",
        apiKey,
        wallet: { address, privateKey },
        verifyError: verifyData,
        log,
      });
    }

    log.push(`Wallet linked and verified!`);

    // ── All done ───────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      partial: false,
      step: "complete",
      message:
        "Agent registered, wallet generated and linked. Ready to post on Moltx!",
      apiKey,
      wallet: { address, privateKey },
      verification: verifyData?.data,
      log,
    });
  } catch (error) {
    console.error("Auto-setup error:", error);
    return NextResponse.json(
      {
        error: "Auto-setup failed",
        details: String(error),
        log,
      },
      { status: 500 }
    );
  }
}
