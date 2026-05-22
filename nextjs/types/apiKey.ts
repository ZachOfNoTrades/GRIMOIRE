export interface GeneratedApiKey {
  plaintext: string;
  hash: Buffer;
  prefix: string;
}

export interface UserApiKeySummary {
  id: string;
  name: string;
  key_prefix: string;
  ts_created: string;
  ts_last_used: string | null;
}
