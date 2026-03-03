export interface ProgramTemplate {
  id: string;
  name: string;
  description: string | null;
  program_prompt: string | null;
  week_prompt: string | null;
  session_prompt: string | null;
  days_per_week: number;
  created_at: Date;
  modified_at: Date;
}

export interface ProgramTemplateSummary {
  id: string;
  name: string;
  description: string | null;
  created_at: Date;
  modified_at: Date;
}
