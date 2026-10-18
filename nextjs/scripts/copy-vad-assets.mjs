// Copy the Silero voice activity model, its audio worklet and the ONNX runtime into
// public/vad so the browser loads them from this server instead of a CDN.
import { copyFileSync, mkdirSync } from "fs";
import { join } from "path";

const target = join(process.cwd(), "public", "vad");
const files = [
  ["node_modules/@ricky0123/vad-web/dist", ["silero_vad_legacy.onnx", "vad.worklet.bundle.min.js"]],
  ["node_modules/onnxruntime-web/dist", ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]],
];

mkdirSync(target, { recursive: true });
for (const [dir, names] of files) {
  for (const name of names) copyFileSync(join(dir, name), join(target, name));
}
console.log(`Copied voice activity assets to '${target}'`);
