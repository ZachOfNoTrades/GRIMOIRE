import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { LabelOcrDraft } from '../types/labelOcr';
import { parseNutritionText } from './labelParser';
import { parseLabelImageWithLLM } from './labelOcrLLM';
import { listUnits } from './unitFunctions';
import { decodeProductBarcodeFromPath } from './barcodeScanFunctions';

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
const TESSERACT_TIMEOUT_MS = 30_000;
const CONVERT_TIMEOUT_MS = 15_000;

// Preprocesses the image with ImageMagick before OCR. Tesseract works best on
// character heights of ~30-50px, which on a Nutrition Facts panel maps to a long
// edge in the ~1200-2400px range. Clamp into that band instead of blindly upscaling:
//   - '2400x2400>' shrinks anything larger (phone photos at 4000+ blew past
//     ImageMagick's pixel-cache policy at 3x and hard-failed with exit 15)
//   - '1200x1200<' upscales tiny web thumbs so Tesseract has enough pixels
//   - inputs already in [1200, 2400] are passed through unchanged
// Grayscale + light unsharp after the resize reduces char confusion (g/9/0/O
// stop blending). Empirically (Gordita Crunch test) this turned ~12 errors into 2.
function preprocessImage(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'convert',
      [
        inputPath,
        // Apply EXIF rotation flag before anything else. Phone photos shot in
        // portrait come down as landscape pixel buffers tagged "rotate 90°";
        // browsers honor that automatically but ImageMagick (and Tesseract)
        // don't, so without this the OCR sees the label sideways and returns
        // gibberish. This is the single biggest source of label-scan failures.
        '-auto-orient',
        '-colorspace', 'Gray',
        // Straighten labels photographed on a counter or slightly off-angle —
        // a few degrees of skew is enough for Tesseract to start dropping rows.
        '-deskew', '40%',
        // Clamp the long edge into [1800, 3000]. Below 1800px Tesseract loses
        // small lines; above 3000px the pixel-cache policy at Q16 blows up on
        // phone photos (4000+ px inputs hit `cache resources exhausted`, exit 15).
        '-resize', '3000x3000>',
        '-resize', '1800x1800<',
        // Stronger unsharp than the prior 0x1.5 — empirically recovers the
        // bold "Total Fat 2.5g" row that was getting smudged into the line
        // above when sharpening was lighter.
        '-unsharp', '0x2.0+0.8',
        outputPath,
      ],
      { timeout: CONVERT_TIMEOUT_MS }
    );
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('error', (err) => reject(new Error(`Failed to start convert: ${err.message}`)));
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`convert exited with code ${code}: ${stderr.trim()}`));
      else resolve();
    });
  });
}

// Runs Tesseract once at the given PSM and returns the raw recognized text.
// Throws if tesseract exits non-zero.
//
// OMP_THREAD_LIMIT=2 caps each tesseract's OpenMP thread pool. The two PSM passes
// run in parallel (see runTesseract) and without this cap each instance spins up
// one thread per core, fights the other for CPU, and ends up taking ~85s wall
// (vs ~1s alone) — well past TESSERACT_TIMEOUT_MS, so Node SIGKILLs the procs
// and they exit with code `null`. With the cap we use 4 cores cleanly (2 procs ×
// 2 threads) and complete in the same ~1s as a single instance.
function runTesseractOnce(imagePath: string, psm: '4' | '6'): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'tesseract',
      [imagePath, 'stdout', '-l', 'eng', '--psm', psm],
      { timeout: TESSERACT_TIMEOUT_MS, env: { ...process.env, OMP_THREAD_LIMIT: '2' } }
    );

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('error', (err) => reject(new Error(`Failed to start tesseract: ${err.message}`)));
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`tesseract (psm ${psm}) exited with code ${code}: ${stderr.trim() || stdout.trim()}`));
        return;
      }
      resolve(stdout);
    });
  });
}

// Runs Tesseract twice (PSM 6 then PSM 4) and concatenates the output. Each mode
// has blind spots on Nutrition Facts panels:
//   - PSM 6 (uniform block) keeps cell-aligned text like "Total Carbohydrate 36g 13%"
//     intact but on tightly-spaced labels can lose entire rows (notably the Total Fat
//     line directly under the bold Calories value).
//   - PSM 4 (single column of text of variable sizes) catches those dropped rows
//     because it tolerates size jumps, at the cost of occasionally merging the
//     "% Daily Value" column header into the first macro line.
// Putting PSM 6 first means the cleaner reads win the parser's first-match logic
// per nutrient code, and PSM 4 fills in what PSM 6 missed.
function runTesseract(imagePath: string): Promise<string> {
  return Promise.all([
    runTesseractOnce(imagePath, '6'),
    runTesseractOnce(imagePath, '4'),
  ]).then(([a, b]) => `${a}\n${b}`);
}

// Saves the uploaded image(s) to .tmp/, runs OCR, parses the text into the
// LabelOcrDraft shape the modal consumes, and deletes the temp files. Accepts one
// OR MORE images of the same packaged food (e.g. the front/marketing face plus the
// back nutrition-facts panel) — the Claude vision path reads them all so the brand
// and product name can be pulled off the front. Throws on validation failure (bad
// MIME, oversize, tesseract crash).
export async function parseLabelImage(opts: {
  images: { imageBytes: Buffer; mimeType: string }[];
}): Promise<LabelOcrDraft> {
  const { images } = opts;

  if (images.length === 0) {
    throw new Error('No image provided');
  }
  for (const { imageBytes, mimeType } of images) {
    if (!ALLOWED_MIME.has(mimeType)) {
      throw new Error(`Unsupported image type: '${mimeType}'`);
    }
    if (imageBytes.length === 0) {
      throw new Error('Image is empty');
    }
    if (imageBytes.length > MAX_IMAGE_BYTES) {
      throw new Error(`Image too large (${imageBytes.length} bytes, max ${MAX_IMAGE_BYTES})`);
    }
  }

  const tmpDir = join(process.cwd(), '.tmp');
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

  // Write each upload to its own UUID path; collect the paths to hand to the vision
  // LLM. The first image is treated as the "primary" — it backs the debug "latest"
  // copy and is the one the Tesseract fallback OCRs (Tesseract is single-image and
  // expects a nutrition panel, so the front-of-pack shot would only confuse it).
  const imagePaths: string[] = [];
  let primaryExt = 'img';
  images.forEach(({ imageBytes, mimeType }, i) => {
    const ext = EXT_BY_MIME[mimeType] ?? 'img';
    if (i === 0) primaryExt = ext;
    const imagePath = join(tmpDir, `forage-label-${randomUUID()}.${ext}`);
    writeFileSync(imagePath, imageBytes);
    imagePaths.push(imagePath);
    console.log(`[ForageOCR] image ${i + 1}/${images.length}: ${imagePath} (${imageBytes.length} bytes, ${mimeType})`);
  });
  const primaryImagePath = imagePaths[0];

  // DEBUG: persist a stable "latest" copy of the primary image so it can be
  // inspected after the request. The UUID copies stay too for historical diff.
  const latestImagePath = join(tmpDir, `forage-label-latest.${primaryExt}`);
  writeFileSync(latestImagePath, images[0].imageBytes);
  console.log(`[ForageOCR] latest copy: ${latestImagePath}`);

  const units = await listUnits();
  const knownUnits = new Set(units.map((u) => u.name.toLowerCase()));

  // BARCODE — decode a UPC/EAN off the uploaded image(s) with zbarimg (the same
  // decoder the live barcode scanner uses). zbar on the raw pixels is far more
  // reliable than the LLM reading printed digits, so this wins when it finds a
  // code; when it doesn't, we fall back to whatever the LLM read off the package.
  // Checked across every image (front OR back can carry the barcode); first hit
  // wins. Best-effort — a miss leaves scannedBarcode null and never throws.
  let scannedBarcode: string | null = null;
  for (const imagePath of imagePaths) {
    const hit = await decodeProductBarcodeFromPath(imagePath);
    if (hit) {
      scannedBarcode = hit.barcode_upc;
      console.log(`[ForageOCR] barcode decoded: ${hit.barcode_upc} (${hit.symbology}) from ${imagePath}`);
      break;
    }
  }

  // Primary path: Claude vision via the local CLI. Higher accuracy on phone photos
  // and any label where Tesseract drops decimals / misreads g→9/2, and the only
  // path that can read multiple sides at once (front for brand, back for nutrition).
  // If the CLI fails (timeout, non-zero exit, invalid JSON) we fall through to the
  // local tesseract pipeline on the primary image so the request still completes —
  // the modal pre-fill is best-effort.
  try {
    const t0 = Date.now();
    const llmDraft = await parseLabelImageWithLLM({ imagePaths, knownUnits });
    console.log(`[ForageOCR] LLM draft in ${Date.now() - t0}ms`);
    // Prefer the zbar-decoded barcode; fall back to the LLM's printed-digit read.
    llmDraft.barcode_upc = scannedBarcode ?? llmDraft.barcode_upc ?? null;
    return llmDraft;
  } catch (err: any) {
    console.warn(`[ForageOCR] LLM path failed, falling back to tesseract: ${err?.message ?? err}`);
  }

  // Fallback: preprocess for OCR. Run from a separate file path so the original upload stays
  // untouched on disk for debugging diff.
  const preprocessedPath = join(tmpDir, `forage-label-latest-pre.png`);
  await preprocessImage(primaryImagePath, preprocessedPath);
  console.log(`[ForageOCR] preprocessed: ${preprocessedPath}`);

  const text = await runTesseract(preprocessedPath);
  const rawTextPath = join(tmpDir, `forage-label-latest.txt`);
  writeFileSync(rawTextPath, text);
  console.log(`[ForageOCR] raw text (${text.length} chars):\n${text}`);
  console.log(`[ForageOCR] raw text file: ${rawTextPath}`);

  const draft = parseNutritionText(text, knownUnits);
  // Tesseract never reads the barcode; attach the zbar-decoded UPC if we got one.
  draft.barcode_upc = scannedBarcode ?? null;
  console.log(`[ForageOCR] parsed draft:`, JSON.stringify(draft));
  return draft;
}
