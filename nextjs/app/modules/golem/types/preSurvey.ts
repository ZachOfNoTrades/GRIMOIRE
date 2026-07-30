export interface PreSurveyMuscleFatigue {
  muscle_group_id: string;
  muscle_group_name: string;
  fatigue: number;
}

export interface PreSurvey {
  notes: string | null;
  muscles: PreSurveyMuscleFatigue[];
  // Per-muscle auto-calculated fatigue derived from recently logged working sets.
  // Includes every muscle_group; values are 1/2/3 even when the user has no saved survey.
  suggestions: PreSurveyMuscleFatigue[];
}

export interface PreSurveyPayload {
  notes: string | null;
  muscles: { muscle_group_id: string; fatigue: number }[];
}
