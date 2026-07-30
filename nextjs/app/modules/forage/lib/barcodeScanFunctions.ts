import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/tiff',
  'image/bmp',
]);

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/tiff': 'tif',
  'image/bmp': 'bmp',
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ZBAR_TIMEOUT_MS = 15_000;

export interface BarcodeScanDraft {
  // First decoded numeric product code (EAN-8/13, UPC-A/E). null if nothing decoded.
  barcode_upc: string | null;
  // Symbology zbar reported (e.g. "EAN13", "UPCA"). Useful for the UI to label what was found.
  symbology: string | null;
}

// Runs `zbarimg -q --raw -Sdisable -Sean.enable -Sean8.enable -Supca.enable -Supce.enable`
// to restrict to product-code symbologies — QR / Code128 / Data Matrix get ignored
// so a scan of a busy package can't accidentally surface a non-UPC string as the UPC.
function runZbar(imagePath: string): Promise<{ codes: { value: string; symbology: string }[] }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'zbarimg',
      [
        '-q',
        '--xml',
        '-Sdisable',
        '-Sean.enable',
        '-Sean8.enable',
        '-Supca.enable',
        '-Supce.enable',
        imagePath,
      ],
      { timeout: ZBAR_TIMEOUT_MS }
    );
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('error', (err) => reject(new Error(`Failed to start zbarimg: ${err.message}`)));
    proc.on('close', (code) => {
      // zbarimg exit codes: 0 = found, 4 = no symbols. Treat 4 as "nothing decoded"
      // rather than an error so the UI can show a friendly "no barcode detected" toast.
      if (code !== 0 && code !== 4) {
        reject(new Error(`zbarimg exited with code ${code}: ${stderr.trim() || stdout.trim()}`));
        return;
      }
      const codes: { value: string; symbology: string }[] = [];
      // Parse the XML: <symbol type='EAN-13' ...><data><![CDATA[012345678905]]></data></symbol>
      // zbarimg emits single-quoted attributes (e.g. type='UPC-A') — accept either quote.
      const re = /<symbol\s+type=['"]([^'"]+)['"][^>]*>\s*<data><!\[CDATA\[([^\]]+)\]\]><\/data>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(stdout)) !== null) {
        codes.push({ symbology: m[1], value: m[2] });
      }
      resolve({ codes });
    });
  });
}

// Decodes the first UPC/EAN product code from an image ALREADY on disk (the label
// OCR pipeline writes its uploads to .tmp/ before this is called, so there's no
// need to re-save). Returns null when nothing decoded. Swallows zbar crashes into
// null so a barcode miss can never fail the larger label-scan request that calls it.
export async function decodeProductBarcodeFromPath(
  imagePath: string
): Promise<{ barcode_upc: string; symbology: string } | null> {
  try {
    const { codes } = await runZbar(imagePath);
    if (codes.length === 0) return null;
    return { barcode_upc: codes[0].value, symbology: codes[0].symbology };
  } catch (err: any) {
    console.warn(`[ForageBarcode] decode from path failed: ${err?.message ?? err}`);
    return null;
  }
}

// Saves the uploaded image to .tmp/, runs zbarimg restricted to UPC/EAN symbologies,
// and returns the first decoded code (or null when nothing matched). Throws on bad
// MIME / oversize / zbar crash; "no barcode found" returns { barcode_upc: null }.
export async function parseBarcodeImage(opts: {
  imageBytes: Buffer;
  mimeType: string;
}): Promise<BarcodeScanDraft> {
  const { imageBytes, mimeType } = opts;

  if (!ALLOWED_MIME.has(mimeType)) {
    throw new Error(`Unsupported image type: '${mimeType}'`);
  }
  if (imageBytes.length === 0) {
    throw new Error('Image is empty');
  }
  if (imageBytes.length > MAX_IMAGE_BYTES) {
    throw new Error(`Image too large (${imageBytes.length} bytes, max ${MAX_IMAGE_BYTES})`);
  }

  const tmpDir = join(process.cwd(), '.tmp');
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

  const ext = EXT_BY_MIME[mimeType] ?? 'img';
  const imagePath = join(tmpDir, `forage-barcode-${randomUUID()}.${ext}`);
  writeFileSync(imagePath, imageBytes);

  const latestImagePath = join(tmpDir, `forage-barcode-latest.${ext}`);
  writeFileSync(latestImagePath, imageBytes);
  console.log(`[ForageBarcode] image: ${imagePath} (${imageBytes.length} bytes, ${mimeType})`);

  const { codes } = await runZbar(imagePath);
  console.log(`[ForageBarcode] decoded:`, JSON.stringify(codes));

  if (codes.length === 0) {
    return { barcode_upc: null, symbology: null };
  }
  const first = codes[0];
  return { barcode_upc: first.value, symbology: first.symbology };
}
