"use client";

// Small fetch helpers shared by the Oracle pages. Every call checks `res.ok` before the body is
// used, so an `{ error }` envelope can never be assigned into page state as if it were data.

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(url: string, method: "GET" | "POST" | "PUT" | "DELETE" = "GET", body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      cache: "no-store",
      // A save fired by a blur right before the page navigates away must still reach the server.
      keepalive: method !== "GET",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Couldn't reach the server", 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(typeof data?.error === "string" ? data.error : `Request failed (${response.status})`, response.status);
  }
  return data as T;
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function campaignApi(campaignId: string): string {
  return `/modules/oracle/api/campaigns/${campaignId}`;
}
