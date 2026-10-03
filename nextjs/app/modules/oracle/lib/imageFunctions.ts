import { randomUUID } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { getMainConnection } from "@/lib/db";
import type { OracleImage } from "../types/oracle";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGES, MAX_IMAGE_BYTES } from "./constants";
import { UPLOAD_ROOT } from "./campaignFunctions";
import { OracleError } from "./errors";

// Reference pictures live on local disk under a per-campaign folder outside `public/`, so a file
// is only reachable through a route that has checked who is asking (the DM, or the player
// display while the picture is actually being shown).

type ImageRow = { id: string; caption: string; content_type: string; file_name: string };

function toImage(row: ImageRow): OracleImage {
  return { id: row.id.toLowerCase(), caption: row.caption, content_type: row.content_type };
}

export async function listImages(campaignId: string): Promise<OracleImage[]> {
  const pool = await getMainConnection();
  const result = await pool.request().input("campaignId", campaignId).query(`
    SELECT id, caption, content_type, file_name FROM oracle_images WHERE campaign_id = @campaignId ORDER BY ts_created
  `);
  return result.recordset.map(toImage);
}

export async function saveImage(campaignId: string, caption: string, contentType: string, bytes: Buffer): Promise<OracleImage> {
  const extension = ALLOWED_IMAGE_TYPES[contentType];
  if (!extension) throw new OracleError(400, "Use a PNG, JPEG, GIF or WebP image");
  if (bytes.length === 0) throw new OracleError(400, "That file is empty");
  if (bytes.length > MAX_IMAGE_BYTES) throw new OracleError(413, "Images can be at most 12 MB");

  const id = randomUUID();
  const fileName = `${id}.${extension}`;
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("id", id)
    .input("campaignId", campaignId)
    .input("caption", caption)
    .input("fileName", fileName)
    .input("contentType", contentType)
    .input("maxImages", MAX_IMAGES)
    .query(`
      INSERT INTO oracle_images (id, campaign_id, caption, file_name, content_type)
      OUTPUT INSERTED.id, INSERTED.caption, INSERTED.content_type, INSERTED.file_name
      SELECT @id, @campaignId, @caption, @fileName, @contentType
      WHERE (SELECT COUNT(*) FROM oracle_images WHERE campaign_id = @campaignId) < @maxImages
    `);
  if (result.recordset.length === 0) {
    throw new OracleError(409, `A campaign can have at most ${MAX_IMAGES} images`);
  }

  // Row first, file second: a failed write removes the row again so the library never lists a
  // picture that is not on disk.
  try {
    const directory = path.join(UPLOAD_ROOT, campaignId);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, fileName), bytes);
  } catch (error) {
    await pool.request().input("id", id).query(`DELETE FROM oracle_images WHERE id = @id`);
    throw error;
  }
  return toImage(result.recordset[0]);
}

export async function updateImageCaption(campaignId: string, imageId: string, caption: string): Promise<OracleImage> {
  const pool = await getMainConnection();
  const result = await pool.request().input("imageId", imageId).input("campaignId", campaignId).input("caption", caption).query(`
    UPDATE oracle_images SET caption = @caption
    OUTPUT INSERTED.id, INSERTED.caption, INSERTED.content_type, INSERTED.file_name
    WHERE id = @imageId AND campaign_id = @campaignId
  `);
  if (result.recordset.length === 0) {
    throw new OracleError(404, "Image not found");
  }
  return toImage(result.recordset[0]);
}

// Returns the file's bytes and type. Both ids were already validated as UUIDs by the route, and
// the file name comes from the row, so nothing user-supplied reaches the path.
export async function readImage(campaignId: string, imageId: string): Promise<{ bytes: Buffer; contentType: string }> {
  const pool = await getMainConnection();
  const result = await pool.request().input("imageId", imageId).input("campaignId", campaignId).query(`
    SELECT file_name, content_type FROM oracle_images WHERE id = @imageId AND campaign_id = @campaignId
  `);
  if (result.recordset.length === 0) {
    throw new OracleError(404, "Image not found");
  }
  try {
    const bytes = await readFile(path.join(UPLOAD_ROOT, campaignId, result.recordset[0].file_name));
    return { bytes, contentType: result.recordset[0].content_type };
  } catch {
    throw new OracleError(404, "Image not found");
  }
}

// Pointers to the image (entity portraits, the display panel) have no foreign key, so they are
// cleared here.
export async function deleteImage(campaignId: string, imageId: string): Promise<void> {
  const pool = await getMainConnection();
  const transaction = pool.transaction();
  await transaction.begin();
  let fileName: string;
  try {
    const result = await transaction.request().input("imageId", imageId).input("campaignId", campaignId).query(`
      DELETE FROM oracle_images OUTPUT DELETED.file_name WHERE id = @imageId AND campaign_id = @campaignId
    `);
    if (result.recordset.length === 0) {
      throw new OracleError(404, "Image not found");
    }
    fileName = result.recordset[0].file_name;
    await transaction.request().input("imageId", imageId).input("campaignId", campaignId).query(`
      UPDATE oracle_entities SET image_id = NULL WHERE campaign_id = @campaignId AND image_id = @imageId;
      UPDATE oracle_maps SET background_image_id = NULL WHERE campaign_id = @campaignId AND background_image_id = @imageId;
      UPDATE oracle_campaigns
      SET panel_kind = CASE WHEN panel_image_id = @imageId THEN NULL ELSE panel_kind END,
          panel_image_id = CASE WHEN panel_image_id = @imageId THEN NULL ELSE panel_image_id END,
          version = version + 1
      WHERE id = @campaignId;
    `);
    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }
  await unlink(path.join(UPLOAD_ROOT, campaignId, fileName)).catch(() => undefined);
}
