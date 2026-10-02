import { CAPTION_MAX, MAX_IMAGE_BYTES } from "@/app/modules/oracle/lib/constants";
import { OracleError } from "@/app/modules/oracle/lib/errors";
import { saveImage } from "@/app/modules/oracle/lib/imageFunctions";
import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";

export const runtime = "nodejs";

// POST /modules/oracle/api/campaigns/[id]/images — upload a picture. Multipart form:
// `file` (PNG, JPEG, GIF or WebP, at most 12 MB) and an optional `caption`.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/images", async (owner) => {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new OracleError(400, "Send the picture as a form upload");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new OracleError(400, "Choose a picture to upload");
    if (file.size > MAX_IMAGE_BYTES) throw new OracleError(413, "Images can be at most 12 MB");
    const rawCaption = typeof form.get("caption") === "string" ? String(form.get("caption")) : "";
    const caption = (rawCaption.trim() || file.name.replace(/\.[a-zA-Z0-9]+$/, "") || "Picture").replace(/\s+/g, " ").slice(0, CAPTION_MAX);
    const bytes = Buffer.from(await file.arrayBuffer());
    return ok(await saveImage(owner.campaignId, caption, file.type, bytes), 201);
  });
}
