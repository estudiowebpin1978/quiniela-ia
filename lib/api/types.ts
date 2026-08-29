/**
 * Shared types for API routes.
 * Replace `any` with concrete interfaces.
 */

/** Row from Supabase `draws` table */
export interface DrawRow {
  date: string;
  turno: string;
  numbers: number[];
}

/** Row from Supabase `user_predictions` table */
export interface PredictionRow {
  id: string;
  user_id: string;
  date: string;
  turno: string;
  numeros: number[] | Record<string, string[]> | string;
  created_at: string;
  status?: string;
  aciertos?: number[];
  verified_at?: string;
}

/** Row from Supabase `prediction_history` table */
export interface PredictionHistoryRow {
  prediction_id: string;
  aciertos_2: Acierto[] | null;
  aciertos_3: Acierto[] | null;
  aciertos_4: Acierto[] | null;
  total_aciertos: number;
  resultado_oficial: number[];
}

/** Single hit (acierto) in a prediction */
export interface Acierto {
  numero: string;
  puesto: number;
  tipo: 2 | 3 | 4;
}

/** Row from Supabase `user_gamification` table */
export interface GamificationRow {
  xp: number;
  level: number;
  streak: number;
  last_active_date: string | null;
  total_analyses: number;
  total_saves: number;
  total_compares: number;
}

/** Row from Supabase `user_achievements` table */
export interface AchievementRow {
  achievement_id: string;
  unlocked_at: string;
}

/** Parsed prediction numeros object */
export interface PredictionNumeros {
  "2": string[];
  "3": string[];
  "4": string[];
}

/** Sorteo (draw used for analysis) */
export interface SorteoRow {
  fecha: string;
  turno: string;
  numbers: number[];
}

/** Gamification update payload */
export interface GamificationUpdate {
  xp?: number;
  level?: number;
  streak?: number;
  last_active_date?: string;
  total_analyses?: number;
  total_saves?: number;
  total_compares?: number;
}

/** Comparison result for a single prediction */
export interface ComparisonResult {
  id: string;
  fecha: string;
  turno: string;
  prediccion_2: string[];
  prediccion_3: string[];
  prediccion_4: string[];
  resultado_2: string[];
  resultado_3: string[];
  resultado_4: string[];
  aciertos: number;
  aciertos_2: number;
  aciertos_3: number;
  aciertos_4: number;
  detalles: { numero: string; posicion: number; tipo: 2 | 3 | 4 }[];
  acierto: boolean;
}

/** Gamification POST request body */
export interface GamificationRequestBody {
  action: "analysis" | "save" | "compare" | "premium";
  turno?: string;
}
