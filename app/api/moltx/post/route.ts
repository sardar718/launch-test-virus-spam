import { NextResponse } from "next/server";

const MOLTX_API_BASE = "https://moltx.io/v1";
const FOURCLAW_API = "https://api.4claw.fun/api/launch";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { apiKey, content, platform } = body;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Moltx API key is required" },
        { status: 400 }
      );
    }

    if (!content) {
      return NextResponse.json(
        { error: "Post content is required" },
        { status: 400 }
      );
    }

    // Step 1: Post to Moltx
    const postRes = await fetch(`${MOLTX_API_BASE}/posts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
      }),
    });

    const postData = await postRes.json();

    if (!postRes.ok) {
      return NextResponse.json(
        {
          error: postData.error || postData.message || "Failed to post on Moltx",
          details: postData,
          step: "moltx_post",
        },
        { status: postRes.status }
      );
    }

    // Extract the post ID from response
    const postId =
      postData?.data?.id ||
      postData?.data?.post?.id ||
      postData?.id ||
      postData?.post?.id;

    if (!postId) {
      return NextResponse.json({
        success: true,
        step: "moltx_post_only",
        message:
          "Posted to Moltx successfully, but could not extract post ID for auto-trigger. Please trigger manually.",
        moltxResponse: postData,
      });
    }

    // Step 2: Trigger 4claw indexer
    const launchPayload =
      platform === "moltbook"
        ? { url: `https://www.moltbook.com/post/${postId}` }
        : { platform: "moltx", post_id: postId };

    const launchRes = await fetch(FOURCLAW_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(launchPayload),
    });

    const launchData = await launchRes.json();

    return NextResponse.json({
      success: true,
      step: "complete",
      postId,
      moltxResponse: postData,
      launchResponse: launchData,
      launchTriggered: launchRes.ok,
      message: launchRes.ok
        ? "Posted on Moltx and 4claw launch triggered successfully!"
        : "Posted on Moltx. 4claw trigger returned an issue - token may still be processed via queue.",
    });
  } catch (error) {
    console.error("Moltx post error:", error);
    return NextResponse.json(
      { error: "Failed to post on Moltx", details: String(error) },
      { status: 500 }
    );
  }
}
