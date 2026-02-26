export const PROGRAM_STATUS_LABELS: Record<number, string> = {
  0: "Not Started",
  1: "In Progress",
  2: "Complete",
};

export const PROGRAM_STATUS_BADGE: Record<number, string> = {
  0: "badge-muted",
  1: "badge-warning",
  2: "badge-success",
};

export interface ProgramSummary {
  id: string;
  name: string;
  description: string | null;
  status: number;
  created_at: Date;
  modified_at: Date;
}

export interface ProgramSession {
  id: string;
  name: string;
  session_date: Date;
  notes: string | null;
  order_index: number | null;
}

export interface ProgramWeek {
  id: string;
  week_number: number;
  name: string | null;
  description: string | null;
  sessions: ProgramSession[];
}

export interface ProgramBlock {
  id: string;
  name: string;
  order_index: number;
  description: string | null;
  tag: string | null;
  color: string | null;
  weeks: ProgramWeek[];
}

export interface Program {
  id: string;
  name: string;
  description: string | null;
  status: number;
  created_at: Date;
  modified_at: Date;
  blocks: ProgramBlock[];
}
