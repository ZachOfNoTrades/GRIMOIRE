import { CreateProgramPayload } from './program';

export interface GenerateProgramResult {
  programPayload: CreateProgramPayload;
  modelUsed: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
