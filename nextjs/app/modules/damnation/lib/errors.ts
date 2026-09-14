import { NextResponse } from "next/server";

// A failure the caller can act on, carrying its HTTP status. Lib functions throw these;
// routes turn them into JSON responses through damnationErrorResponse.
export class DamnationError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "DamnationError";
  }
}

// SQL Server duplicate-key errors: 2627 (unique constraint) and 2601 (unique index).
export function isUniqueViolation(error: unknown): boolean {
  const number = (error as { number?: number } | null)?.number;
  return number === 2627 || number === 2601;
}

export function damnationErrorResponse(error: unknown, context: string): NextResponse {
  if (error instanceof DamnationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(`Error in ${context}:`, error);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
