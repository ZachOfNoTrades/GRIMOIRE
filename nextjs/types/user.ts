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

// User as returned by GET /api/users/[id]: the row plus the server-side generation window.
export interface UserDetail extends User {
  generation_window_hours: number;
}
