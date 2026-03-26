export interface User {
  id: string;
  email: string;
  name: string;
  global_admin: boolean;
  enabled: boolean;
  ts_created: Date;
  ts_updated: Date;
}
