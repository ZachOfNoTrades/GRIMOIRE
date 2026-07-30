export interface UserProfile {
  id: number;
  profile_prompt: string | null;
  distance_unit_short: string | null; // preferred short-distance unit: 'meters' | 'yards' | 'feet' (null = meters)
  distance_unit_long: string | null; // preferred long-distance unit: 'km' | 'mi' (null = km)
  rest_timer_enabled: boolean; // show the between-sets rest countdown during a session
  created_at: Date;
  modified_at: Date;
}
