export interface LedgerEntry {
  id: string;
  user_id: string;
  delta: number;
  reason: string;
  ref_type: 'task' | 'reward' | 'adhoc' | null;
  ref_id: string | null;
  ts_created: Date;
}
