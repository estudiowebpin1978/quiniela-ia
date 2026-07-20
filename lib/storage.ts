/**
 * Claves de localStorage — fuente única de verdad.
 * Importar desde aquí en lugar de hardcodear strings en cada componente.
 */

export const STORAGE_KEYS = {
  /** Token de autenticación de Supabase */
  AUTH: "quiniela-ia-auth",
  /** Flag de modo invitado */
  GUEST: "quiniela-ia-guest",
  /** Predicciones guardadas localmente */
  MIS_PREDS: "misPreds",
  /** Nivel de confianza por turno (cache) */
  CONFIANZA_TURNOS: "confianzaTurnos",
  /** Último sorteo visto (para polling de nuevos sorteos) */
  ULTIMO_SORTEO_VISTO: "quiniela-ia-ultimo-sorteo-visto",
  /** Flag de tour/primer visita */
  TOUR_VISTO: "quiniela-ia-tour-visto",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/** Lee y parsea JSON del localStorage, retorna null en caso de error */
export function readStorage<T>(key: StorageKey): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Escribe un valor en el localStorage como JSON */
export function writeStorage<T>(key: StorageKey, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/** Elimina un item del localStorage */
export function removeStorage(key: StorageKey): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {}
}
