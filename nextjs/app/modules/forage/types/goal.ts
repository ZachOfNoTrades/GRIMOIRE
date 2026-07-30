export type GoalKind = "lose" | "maintain" | "gain";

export interface Goal {
  id: string;
  user_id: string;
  goal_kind: GoalKind;
  rate_lb_per_week: number | null;
  target_weight_lb: number | null;
  created_at: string;
  ended_at: string | null;
}
