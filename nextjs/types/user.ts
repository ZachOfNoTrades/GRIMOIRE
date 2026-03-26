export interface User {
  id: string;
  email: string;
  name: string;
  global_admin: boolean;
  generation_limit: number; // 0 = unlimited
  enabled: boolean;
  ts_created: Date;
  ts_updated: Date;
}
