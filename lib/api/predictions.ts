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
});

export const PredDataSchema = z.object({
  ok: z.boolean().optional(),
  numeros_2: z.array(z.string()),
  numeros_3: z.array(z.string()).optional(),
  numeros_4: z.array(z.string()).optional(),
  redoblona: z.string(),
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
    redoblona: z.string(),
  }).optional(),
  debug: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export type RankingItem = z.infer<typeof RankingItemSchema>;
export type PredData = z.infer<typeof PredDataSchema>;

export function validatePredData(data: unknown): PredData {
  return PredDataSchema.parse(data) as PredData;
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