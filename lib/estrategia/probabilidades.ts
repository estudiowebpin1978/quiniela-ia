/**
 * Motor de probabilidades EXACTAS para EV — matemática pura, sin I/O.
 *
 * Pool oficial (tabla `games`, fuente primaria LOTBA):
 *   - Quiniela de la Ciudad (ex Nacional): 20 números sorteados de 0..9999
 *     (N=10000), 5 turnos.
 *   - Sorteo SIN reemplazo (números distintos por sorteo).
 *
 * Dos familias de eventos, exactas:
 *   1. Coincidencia de "cifra" (mod-M): tus K picks de clase mod-M aparecen
 *      al menos una vez entre los D=20 sorteados. → hipergeométrica clásica
 *      tratando cada clase mod-M como un conjunto de N/M números.
 *   2. Cabeza (primer número sorteado mod-M): uniforme → K/(N/M).
 *
 * Regla de honestidad: estas son probabilidades de azar EXACTAS (baseline).
 * NO contienen factor del modelo — sirven para (a) valor esperado y
 * (b) comparar si un modelo supera al azar. Nunca se rellenan con métricas
 * inventadas.
 *
 * Numeración: las funciones evitan números gigantes (C(10000,20)~1e73)
 * usando productos de razones.
 */

/** Config de un juego — pools oficiales de la tabla `games`. */
export interface JuegoConfig {
  nombre: string;
  /** Tamaño del pool (0..N-1) */
  poolSize: number;
  /** Cantidad de números por sorteo (sin reemplazo) */
  porSorteo: number;
  /** Cantidad de clases mod-M para "cifras" (2C→100, 3C→1000, 4C→10000) */
  clasesMod: number;
}

export const QUINIELA: JuegoConfig = {
  nombre: "Quiniela de la Ciudad",
  poolSize: 10000,
  porSorteo: 20,
  clasesMod: 100, // 2 cifras (la app opera sobre mod 100)
};

/**
 * P(NINGUNO de `numerosGanadores` números ganadores cae entre D sorteados
 * tomados sin reemplazo de un pool de N) = C(N-g, D)/C(N, D)
 *   = prod_{i=0}^{D-1} (N-g-i)/(N-i)
 * Producto directo: estable y sin desbordar.
 */
export function pNinguno(N: number, ganadores: number, D: number): number {
  if (ganadores <= 0) return 1;
  if (D > N - ganadores) return 0; // obligatorio al menos uno
  let p = 1;
  for (let i = 0; i < D; i++) p *= (N - ganadores - i) / (N - i);
  return p;
}

/**
 * P(AL MENOS UNA de tus K clases mod-M aparece entre D sorteados de N).
 * Cada clase mod-M contiene c = N/M números.
 * Ej.: Quiniela 2C, K=10 → 10 clases × 100 números = 1000 números ganadores.
 */
export function pCoincidenciaMod(cfg: JuegoConfig, kPicks: number, modM: number): number {
  const porClase = cfg.poolSize / modM;
  if (!Number.isInteger(porClase)) {
    throw new Error(`poolSize ${cfg.poolSize} no divisible por mod ${modM}`);
  }
  const ganadores = kPicks * porClase;
  if (ganadores > cfg.poolSize) {
    throw new Error(`kPicks ${kPicks} excede el número de clases ${modM}`);
  }
  return 1 - pNinguno(cfg.poolSize, ganadores, cfg.porSorteo);
}

/**
 * P(LA CABEZA —primer número sorteado— mod-M cae en tus K clases).
 * La cabeza es uniforme en el pool ⇒ su clase mod-M es uniforme entre las
 * N/M clases ⇒ probabilidad exacta = K/(N/M) = K·M/N.
 */
export function pCabezaMod(cfg: JuegoConfig, kPicks: number, modM: number): number {
  const clases = modM; // cantidad total de clases mod-M
  if (kPicks <= 0) return 0;
  if (kPicks > clases) throw new Error(`kPicks ${kPicks} excede clases ${clases}`);
  return kPicks / clases;
}