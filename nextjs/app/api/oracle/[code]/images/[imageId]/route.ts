import { OracleError, oracleErrorResponse } from "@/app/modules/oracle/lib/errors";
import { readImage } from "@/app/modules/oracle/lib/imageFunctions";
import { findCampaignIdByCode, getDisplayImageId } from "@/app/modules/oracle/lib/snapshotFunctions";
import { requireDisplayCode, requireUuid } from "@/app/modules/oracle/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/oracle/[code]/images/[imageId] — a picture for the player display. Public, but it
// only ever serves the one picture that is on the display right now; the rest of the DM's
// library cannot be fetched through it.
export async function GET(_request: Request, { params }: { params: Promise<{ code: string; imageId: string }> }) {
  try {
    const { code, imageId } = await params;
    const campaignId = await findCampaignIdByCode(requireDisplayCode(code));
    const wanted = requireUuid(imageId, "Image");
    if ((await getDisplayImageId(campaignId)) !== wanted) throw new OracleError(404, "Image not found");
    const image = await readImage(campaignId, wanted);
    return new Response(new Uint8Array(image.bytes), {
      headers: { "Content-Type": image.contentType, "Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    return oracleErrorResponse(error, "GET /api/oracle/[code]/images/[imageId]");
  }
}
