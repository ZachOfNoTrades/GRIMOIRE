export function getStatusLabel(isCurrent: boolean, isCompleted: boolean): string {
  if (isCurrent) return "In Progress";
  if (isCompleted) return "Complete";
  return "Not Started";
}

export function getStatusBadge(isCurrent: boolean, isCompleted: boolean): string {
  if (isCurrent) return "badge-warning";
  if (isCompleted) return "badge-success";
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
