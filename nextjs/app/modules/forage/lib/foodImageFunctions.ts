import sql from 'mssql';
import { getFoodConnection, closeFoodConnection } from './db';
import { OFF_CONTACT_EMAIL } from './openFoodFacts';

// ============================================================
// FOOD IMAGES
//
// One product photo per food, stored as bytes in food_images. The app never
// hotlinks: a stored image survives its source going down or re-revving its
// URLs, keeps the browser from announcing every food the user looks at to a
// third party, and is backed up with the database.
//
// foods.image_updated_at mirrors "a row exists here" so list queries can render
// avatars without touching the blob table, and doubles as the cache-buster in
// the image URL.
// ============================================================

// Only these hosts may be fetched from. This is a server-side fetch of a
// user-influenced URL, i.e. an SSRF sink — an allowlist is the whole defence,
// so widening it is a deliberate decision, not a convenience.
const ALLOWED_IMAGE_HOSTS = new Set([
  'images.openfoodfacts.org',
  'world.openfoodfacts.org',
  'static.openfoodfacts.org',
]);

// Front photos run ~10-30 KB; this is generous headroom, not a target.
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 10_000;
const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface FoodImage {
  contentType: string;
  bytes: Buffer;
  tsUpdated: Date;
}

// Download a product photo and store it against a food. Best-effort by design:
// every failure path returns false rather than throwing, because a missing photo
// must never fail the food creation it was attached to — the icon covers it.
export async function saveFoodImageFromUrl(foodId: string, imageUrl: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' || !ALLOWED_IMAGE_HOSTS.has(parsed.hostname.toLowerCase())) {
    console.warn(`[ForageFoodImage] refused non-allowlisted image host '${parsed.hostname}'`);
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
  let bytes: Buffer;
  let contentType: string;
  try {
    const res = await fetch(parsed.toString(), {
      // Same identifying UA Open Food Facts requires of API clients
      // (AppName/Version (ContactEmail)) — image hosts see it too.
      headers: { 'user-agent': `Grimoire-Forage/1.0 (${OFF_CONTACT_EMAIL})` },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[ForageFoodImage] ${res.status} fetching '${imageUrl}'`);
      return false;
    }
    contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      console.warn(`[ForageFoodImage] refused content-type '${contentType}' from '${imageUrl}'`);
      return false;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) {
      console.warn(`[ForageFoodImage] refused ${buffer.byteLength} bytes from '${imageUrl}'`);
      return false;
    }
    bytes = buffer;
  } catch (error: any) {
    console.warn(`[ForageFoodImage] fetch failed for '${imageUrl}': ${error?.message ?? error}`);
    return false;
  } finally {
    clearTimeout(timer);
  }

  let pool;
  try {
    pool = await getFoodConnection();
    // One image per food — replace whatever was there.
    await pool
      .request()
      .input('foodId', sql.UniqueIdentifier, foodId)
      .input('contentType', sql.NVarChar(64), contentType)
      .input('bytes', sql.VarBinary(sql.MAX), bytes)
      .input('byteSize', sql.Int, bytes.byteLength)
      .input('sourceUrl', sql.NVarChar(1000), imageUrl)
      .query(
        `MERGE food_images AS target
         USING (SELECT @foodId AS food_id) AS source ON target.food_id = source.food_id
         WHEN MATCHED THEN UPDATE SET
           content_type = @contentType, bytes = @bytes, byte_size = @byteSize,
           source_url = @sourceUrl, ts_updated = GETDATE()
         WHEN NOT MATCHED THEN INSERT (food_id, content_type, bytes, byte_size, source_url)
           VALUES (@foodId, @contentType, @bytes, @byteSize, @sourceUrl);

         UPDATE foods SET image_updated_at = GETDATE() WHERE id = @foodId;`
      );
    return true;
  } catch (error) {
    console.error(`Error saving food image for food id: '${foodId}':`, error);
    return false;
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// Read a food's stored photo. Returns null when it has none — the caller 404s
// and the UI falls back to the icon.
export async function getFoodImage(foodId: string): Promise<FoodImage | null> {
  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .input('foodId', sql.UniqueIdentifier, foodId)
      .query<{ content_type: string; bytes: Buffer; ts_updated: Date }>(
        `SELECT content_type, bytes, ts_updated FROM food_images WHERE food_id = @foodId`
      );
    if (result.recordset.length === 0) return null;
    const row = result.recordset[0];
    return { contentType: row.content_type, bytes: row.bytes, tsUpdated: row.ts_updated };
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// Drop a food's photo (used when the user clears it in favour of an icon).
export async function deleteFoodImage(foodId: string): Promise<void> {
  let pool;
  try {
    pool = await getFoodConnection();
    await pool
      .request()
      .input('foodId', sql.UniqueIdentifier, foodId)
      .query(
        `DELETE FROM food_images WHERE food_id = @foodId;
         UPDATE foods SET image_updated_at = NULL WHERE id = @foodId;`
      );
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}
