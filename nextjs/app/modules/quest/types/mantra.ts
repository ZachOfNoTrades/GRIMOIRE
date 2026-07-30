export interface Mantra {
  id: string;
  user_id: string;
  text: string;
  ts_created: Date;
}

export const MANTRA_MAX_LENGTH = 500;
