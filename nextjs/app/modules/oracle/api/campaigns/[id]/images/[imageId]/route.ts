import { deleteImage, readImage, updateImageCaption } from "@/app/modules/oracle/lib/imageFunctions";
import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { parseBody, requireUuid, updateImageSchema } from "@/app/modules/oracle/lib/validation";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; imageId: string }> };

// GET /modules/oracle/api/campaigns/[id]/images/[imageId] — the picture itself, for the DM.
export async function GET(request: Request, { params }: Params) {
  const { id, imageId } = await params;
  return withOwner(request, id, "GET /oracle/api/campaigns/[id]/images/[imageId]", async (owner) => {
    const image = await readImage(owner.campaignId, requireUuid(imageId, "Image"));
    return new Response(new Uint8Array(image.bytes), {
      headers: { "Content-Type": image.contentType, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
    });
  });
}

// PUT /modules/oracle/api/campaigns/[id]/images/[imageId] — rename. Body: { caption }.
export async function PUT(request: Request, { params }: Params) {
  const { id, imageId } = await params;
  return withOwner(request, id, "PUT /oracle/api/campaigns/[id]/images/[imageId]", async (owner) => {
    const body = await parseBody(request, updateImageSchema);
    return ok(await updateImageCaption(owner.campaignId, requireUuid(imageId, "Image"), body.caption));
  });
}

// DELETE /modules/oracle/api/campaigns/[id]/images/[imageId]
export async function DELETE(request: Request, { params }: Params) {
  const { id, imageId } = await params;
  return withOwner(request, id, "DELETE /oracle/api/campaigns/[id]/images/[imageId]", async (owner) => {
    await deleteImage(owner.campaignId, requireUuid(imageId, "Image"));
    return ok({ message: "Image deleted" });
  });
}
