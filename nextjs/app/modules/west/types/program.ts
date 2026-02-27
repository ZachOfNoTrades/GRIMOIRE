export function getStatusLabel(isCurrent: boolean, isCompleted: boolean, startedAt?: Date | null): string {
  if (isCompleted) return "Complete";
  if (startedAt) return "In Progress";
  if (isCurrent) return "Current";
  return "Not Started";
}

export function getStatusBadge(isCurrent: boolean, isCompleted: boolean, startedAt?: Date | null): string {
  if (isCompleted) return "badge-success";
  if (startedAt) return "badge-warning";
  if (isCurrent) return "badge-default";
  return "badge-muted";
}

export interface ProgramSummary {
  id: string;
  name: string;
  description: string | null;
  is_current: boolean;
  is_completed: boolean;
  created_at: Date;
  modified_at: Date;
}

export interface ProgramSession {
  id: string;
  name: string;
  session_date: Date;
  notes: string | null;
  order_index: number | null;
  started_at: Date | null;
  resumed_at: Date | null;
  duration: number | null;
  is_current: boolean;
  is_completed: boolean;
}

export interface ProgramWeek {
  id: string;
  week_number: number;
  name: string | null;
  description: string | null;
  is_current: boolean;
  is_completed: boolean;
  volume: number; // total working set volume (reps * weight) for the week
  sessions: ProgramSession[];
}

export interface ProgramBlock {
  id: string;
  name: string;
  order_index: number;
  description: string | null;
  tag: string | null;
  color: string | null;
  is_current: boolean;
  is_completed: boolean;
  weeks: ProgramWeek[];
}

export interface Program {
  id: string;
  name: string;
  description: string | null;
  is_current: boolean;
  is_completed: boolean;
  created_at: Date;
  modified_at: Date;
  blocks: ProgramBlock[];
}
