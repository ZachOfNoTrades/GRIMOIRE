export interface Module {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  enabled: boolean;
  ts_created: Date;
  ts_updated: Date;
}
