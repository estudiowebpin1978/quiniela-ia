import { z } from "zod";

export const RankingItemSchema = z.object({
  numero: z.string(),
  score: z.number(),
  prob: z.number(),
  emoji: z.string().optional(),
  significado: z.string().optional(),
  rank: z.number().optional(),
  frecuencia: z.number().optional(),
  factores: z.array(z.string()).optional(),
  bayesianConfidence: z.number().optional(),
  bayesianPosterior: z.number().optional(),
  confidenceCalibrated: z.number().optional(), // audit: calibración obligatoria antes de exponer probabilidad
});

export const PredDataSchema = z.object({
  ok: z.boolean().optional(),
  numeros_2: z.array(z.string()),
  numeros_3: z.array(z.string()).optional(),
  numeros_4: z.array(z.string()).optional(),
  redoblona: z.string().nullable().optional(),
  ranking: z.array(RankingItemSchema).optional(),
  numeros: z.array(RankingItemSchema).optional(),
  heatmap: z.array(z.object({
    n: z.number(),
    f: z.number(),
    // Accept both the structured object and a plain string label for resilience
    s: z.union([z.object({ emoji: z.string(), nombre: z.string() }), z.string()]),
    pct: z.number(),
  })).optional(),
  diasAnalisis: z.number().optional(),
  totalSorteos: z.number().optional(),
  stats: z.object({
    numeroMasFrecuente: z.object({
      numero: z.string(),
      frecuencia: z.number(),
      significado: z.string(),
    }).optional(),
    numeroMayorRetraso: z.object({
      numero: z.string(),
      retraso: z.number(),
      significado: z.string(),
    }).optional(),
  }).optional(),
  analysisInfo: z.object({
    metodo: z.string(),
    motores: z.array(z.string()),
    datosUtilizados: z.string(),
    confianzaAvanzada: z.object({
      promedioGeneral: z.number().optional(),
      enCicloFavorable: z.array(z.string()).optional(),
      evitar: z.array(z.string()).optional(),
    }).optional(),
  }).optional(),
  confidence: z.number().optional(),
  aiInsight: z.string().optional(),
  pred: z.object({
    numeros_2: z.array(z.string()),
    numeros_3: z.array(z.string()).optional(),
    numeros_4: z.array(z.string()).optional(),
    redoblona: z.string().nullable().optional(),
  }).optional(),
  debug: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export type RankingItem = z.infer<typeof RankingItemSchema>;
export type PredData = z.infer<typeof PredDataSchema>;

export function validatePredData(data: unknown): PredData {
  return PredDataSchema.parse(data) as PredData;
}

/**
 * Shape que espera la tarjeta de /pronostico/[fecha] (PredictionData).
 * La API y la tarjeta viven en formatos distintos: ver `mapApiPredictionCard`.
 */
export interface PredictionCardData {
  turno: string;
  cifras2: string;
  cifras3?: string;
  cifras4?: string;
  redoblona?: [string, string];
  /** 0-100 (puntos porcentuales). 0 = sin dato de consistencia ("s/d"). */
  confidence: number;
  factores?: Array<{ name: string; value: number }>;
  atrasoActual?: number;
  trendAcceleration?: number;
  intervalDeviation?: number;
}

const soloStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x)) : [];

/**
 * Mapea la respuesta de GET /api/predictions al shape de la tarjeta
 * /pronostico/[fecha].
 *
 * Fix 2026-10-14 (bug real, usuarios logueados): sin este mapeo la tarjeta
 * mostraba el número vacío (la API no envía `cifras2`), "Confianza: 0.6%"
 * (la API da consistencia 0-1 y la tarjeta la lee 0-100 con umbrales
 * 50/75), y `TurnoSummary` crasheaba con `.padStart` sobre `undefined`.
 * La redoblona llega como string "cc-aa" y la tarjeta esperaba tupla
 * (`.join`).
 *
 * Defensivo: nunca lanza; entrada desconocida → campos vacíos y
 * confidence 0 (que la UI muestra como "s/d", no como medición).
 *
 * - cifras2/3/4 ← pred.numeros_*[0] (o el campo equivalente si ya viniera)
 * - redoblona    ← "cc-aa" | ["cc","aa"] → ["cc","aa"] | undefined
 * - confidence   ← 0-1 → 0-100; null/sin dato → 0
 * - factores     ← factor_attribution real del top-1 (pesos 0-1, desc)
 */
export function mapApiPredictionCard(raw: unknown, turnoFallback: string): PredictionCardData {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pred = (data.pred && typeof data.pred === "object" ? data.pred : {}) as Record<string, unknown>;

  const nums2 = soloStrings(pred.numeros_2 ?? data.numeros_2);
  const nums3 = soloStrings(pred.numeros_3 ?? data.numeros_3);
  const nums4 = soloStrings(pred.numeros_4 ?? data.numeros_4);

  const cifras2 =
    typeof data.cifras2 === "string" ? data.cifras2 : (nums2[0] ?? "");

  // redoblona: string "cc-aa" (paths cache y V6) o array → tupla de 2
  const rRaw = pred.redoblona ?? data.redoblona ?? null;
  let redoblona: [string, string] | undefined;
  if (typeof rRaw === "string" && rRaw.includes("-")) {
    const [c, a] = rRaw.split("-");
    redoblona = [c.padStart(2, "0"), a.padStart(2, "0")];
  } else if (Array.isArray(rRaw) && rRaw.length >= 2) {
    redoblona = [String(rRaw[0]).padStart(2, "0"), String(rRaw[1]).padStart(2, "0")];
  }

  // confidence: consistencia 0-1 (cache) → puntos; V6 vivo la manda null
  // (no se calculó) → 0 = "s/d" en la UI; un valor ya 0-100 se respeta.
  const confRaw = data.confidence;
  const confidence =
    typeof confRaw === "number" && Number.isFinite(confRaw)
      ? confRaw > 0 && confRaw <= 1
        ? Math.round(confRaw * 1000) / 10
        : confRaw
      : 0;

  // factores reales del top-1 (solo pesos con forma de proporción 0-1;
  // valores fuera de ese rango pueden ser conteos, no porcentajes)
  let factores: Array<{ name: string; value: number }> | undefined;
  const numerosList = Array.isArray(data.numeros) ? data.numeros : [];
  const top = numerosList.find(
    (n) => (n as Record<string, unknown>)?.numero === cifras2,
  ) as Record<string, unknown> | undefined;
  const fa = top?.factor_attribution;
  if (fa && typeof fa === "object" && !Array.isArray(fa)) {
    const entradas = Object.entries(fa as Record<string, unknown>)
      .map(([name, value]) => ({ name, value: Number(value) }))
      .filter((f) => Number.isFinite(f.value) && f.value > 0 && f.value <= 1)
      .sort((a, b) => b.value - a.value);
    if (entradas.length > 0) factores = entradas;
  }

  return {
    turno: typeof data.turno === "string" && data.turno ? data.turno : turnoFallback,
    cifras2,
    cifras3: typeof data.cifras3 === "string" ? data.cifras3 : (nums3[0] ?? undefined),
    cifras4: typeof data.cifras4 === "string" ? data.cifras4 : (nums4[0] ?? undefined),
    redoblona,
    confidence,
    factores,
  };
}

export const MisPrediccionSchema = z.object({
  id: z.string().optional(),
  fecha: z.string().optional(),
  date: z.string().optional(),
  turno: z.string().optional(),
  numeros: z.union([
    z.array(z.string()),
    z.object({
      "2": z.array(z.string()).optional(),
      "3": z.array(z.string()).optional(),
      "4": z.array(z.string()).optional(),
    }),
  ]).optional(),
  numeros_2: z.array(z.string()).optional(),
  numeros_3: z.array(z.string()).optional(),
  numeros_4: z.array(z.string()).optional(),
  resultado: z.array(z.string()).optional(),
  aciertos: z.array(z.object({
    numero: z.string(),
    puesto: z.number(),
  })).optional(),
  aciertos_2: z.array(z.object({
    numero: z.string(),
    puesto: z.number(),
  })).optional(),
  aciertos_3: z.array(z.object({
    numero: z.string(),
    puesto: z.number(),
  })).optional(),
  aciertos_4: z.array(z.object({
    numero: z.string(),
    puesto: z.number(),
  })).optional(),
  acerto: z.boolean().optional(),
  status: z.enum(["WON", "NEAR_MISS", "LOST"]).nullable().optional(),
  created_at: z.string().optional(),
  resultado_original: z.array(z.string()).optional(),
});

export type MisPrediccion = z.infer<typeof MisPrediccionSchema>;

export function validateMisPrediccion(data: unknown): MisPrediccion {
  return MisPrediccionSchema.parse(data);
}

export const MisPrediccionesResponseSchema = z.object({
  predictions: z.array(MisPrediccionSchema),
  count: z.number().optional(),
});

export function validateMisPrediccionesResponse(data: unknown): { predictions: MisPrediccion[] } {
  return MisPrediccionesResponseSchema.parse(data);
}

/**
 * Guard de frescura del cache-first (GET y POST /api/predictions).
 *
 * Una fila de `predictions_cache` fechada D se calculó con histórico
 * estrictamente < D (por diseño nunca ve los resultados del propio día D).
 * Para servirla como predicción de un destino T > D haría falta un modelo
 * entrenado con histórico < T: los sorteos que la fila no tuvo en cuenta son
 * exactamente los de [D, T).
 *
 * Devuelve `false` (fila vieja → calcular en vivo) si existe al menos un
 * sorteo de ese turno en el rango. Contexto real (bug 2026-10-14): cuando los
 * triggers del cache fallaron, el GET servía en silencio filas de 4 días de
 * atraso porque sólo chequeaba `date <= targetDate`.
 *
 * - D == T → rango vacío → siempre fresco (la fila del día es la correcta,
 *   aunque el sorteo del día ya se haya jugado: por diseño lo excluye).
 * - Sorteos en T o posteriores no cuentan (no existían al calcular la fila).
 */
export function cacheFrescoParaDestino(
  fechaCache: string,
  fechaDestino: string,
  fechasSorteosDelTurno: string[],
): boolean {
  if (fechaCache >= fechaDestino) return true;
  return !fechasSorteosDelTurno.some((f) => f >= fechaCache && f < fechaDestino);
}