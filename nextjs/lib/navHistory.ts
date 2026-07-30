"use client";

// Session-scoped record of the routes the user has visited, so a Back button can
// tell whether the page it would pop back to is in the SAME module (safe to use
// browser history) or a DIFFERENT module / external entry (better to fall back to
// the current module's own landing page). The browser never exposes the URLs in
// its back stack, so we track our own.

const STACK_KEY = "grimoire:navStack";

// The module a route belongs to. Mirrors DocumentTitleSync's segment logic:
// /modules/<slug>/... -> "modules/<slug>"; every other top-level route (settings,
// auth, dashboard, ...) is keyed by its first segment; the root is "".
export function moduleOf(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return "";
  if (segments[0] === "modules" && segments[1]) return `modules/${segments[1]}`;
  return segments[0];
}

function readStack(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STACK_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStack(stack: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STACK_KEY, JSON.stringify(stack));
  } catch {
    // sessionStorage can throw (private mode / quota) — degrade to "no history".
  }
}

// Record a visited route, keeping the stack in sync with real back/forward moves:
// landing on the entry directly beneath the top means the user went back, so we
// pop instead of pushing a duplicate. Capped so a long session can't grow forever.
export function recordVisit(pathname: string): void {
  const stack = readStack();
  if (stack[stack.length - 1] === pathname) return; // same route — ignore repeats
  if (stack[stack.length - 2] === pathname) {
    stack.pop(); // user navigated back — mirror it
  } else {
    stack.push(pathname);
  }
  if (stack.length > 50) stack.splice(0, stack.length - 50);
  writeStack(stack);
}

// The route directly beneath the current one — i.e. where router.back() would
// land — or null when there's no in-app history to pop.
export function previousPath(): string | null {
  const stack = readStack();
  return stack.length >= 2 ? stack[stack.length - 2] : null;
}
