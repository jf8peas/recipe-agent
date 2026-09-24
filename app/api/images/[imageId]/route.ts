import { NextResponse } from "next/server";
import { getImageById } from "../../../../lib/db/images";
import { verifyImageUrl } from "../../../../lib/image-url";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Serves one image's raw bytes (feature 007, contracts/image-route.md).
 * Deliberately not gated by `X-Client-Id` — `<img src>` can't send it — the
 * signature is the whole authorization boundary (research R4): it's minted
 * only by server code that already resolved a `dishImage`/`thumbnail`
 * object via an ownership-checked route (`/step`, `/fork`, `/state`,
 * `/mine`), never constructible by the client.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ imageId: string }> },
): Promise<NextResponse> {
  const { imageId } = await params;
  const url = new URL(request.url);
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig");

  // Deliberately generic — doesn't distinguish "expired" from "never valid"
  // (nothing legitimate should be probing this to find out which).
  if (!sig || !verifyImageUrl(imageId, exp, sig)) {
    return NextResponse.json({ error: "invalid-signature" }, { status: 403 });
  }

  const image = await getImageById(imageId);
  if (!image) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(image.bytes), {
    status: 200,
    headers: {
      "Content-Type": image.mime,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
