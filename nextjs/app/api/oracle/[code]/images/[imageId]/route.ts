import { OracleError } from "@/app/modules/oracle/lib/errors";
import { parseImageWidth, readImage, readImageVariant } from "@/app/modules/oracle/lib/imageFunctions";
import { withViewer } from "@/app/modules/oracle/lib/routeHandlers";
import { findCampaignIdByCode, getDisplayImageIds } from "@/app/modules/oracle/lib/snapshotFunctions";
import { requireDisplayCode, requireUuid } from "@/app/modules/oracle/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/oracle/[code]/images/[imageId] — a picture for the player display. Needs a signed-in
// account, and it only ever serves what is on the display right now (the panel's picture and the
// active map's background); the rest of the DM's library cannot be fetched through it.
export async function GET(request: Request, { params }: { params: Promise<{ code: string; imageId: string }> }) {
  return withViewer(request, "GET /api/oracle/[code]/images/[imageId]", async () => {
    const { code, imageId } = await params;
    const campaignId = await findCampaignIdByCode(requireDisplayCode(code));
    const wanted = requireUuid(imageId, "Image");
    if (!(await getDisplayImageIds(campaignId)).has(wanted)) throw new OracleError(404, "Image not found");
    const width = parseImageWidth(new URL(request.url).searchParams.get("w"));
    const image = width ? await readImageVariant(campaignId, wanted, width) : await readImage(campaignId, wanted);
    // The bytes behind an id never change, so the players' screen keeps them: it used to carry
    // the snapshot version in the URL, which threw the whole picture away on any campaign edit.
    return new Response(new Uint8Array(image.bytes), {
      headers: { "Content-Type": image.contentType, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
    });
  });
}
