export const QUERY_TIMEOUT_MS: number;
export const MAX_ROWS: number;
export const MAX_RESULT_CHARS: number;
export const FORBIDDEN_PATTERNS: RegExp[];
export const USER_OWNED_TABLES: string[];
export function validateSqlQuery(query: string): { valid: boolean; error?: string };
