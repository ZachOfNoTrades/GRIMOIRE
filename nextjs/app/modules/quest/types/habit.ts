import { Difficulty } from './task';

export interface Habit {
  id: string;
  user_id: string;
  title: string;
  difficulty: Difficulty;
  allow_positive: boolean;
  allow_negative: boolean;
  ts_created: Date;
}
