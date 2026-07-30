// Generate a UUID, with a fallback for insecure (plain-HTTP) contexts where
// crypto.randomUUID is unavailable. Firefox only exposes randomUUID in a secure
// context, so on a LAN/HTTP origin (e.g. the android emulator's proxy) calling it
// directly throws "crypto.randomUUID is not a function" and takes the page down.
export function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16)
  );
}
