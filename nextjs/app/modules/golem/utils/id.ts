// Generate a UUID, with fallback for insecure (HTTP) contexts where crypto.randomUUID is unavailable.
// Kept as a re-export so golem's existing call sites don't churn; the implementation
// is shared app-wide in lib/uuid.ts.
export { generateUUID } from "@/lib/uuid";
