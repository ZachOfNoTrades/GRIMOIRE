export interface Exercise {
  id: string;
  name: string;
  description: string | null;
  is_disabled: boolean;
  created_at: Date;
  modified_at: Date;
}
