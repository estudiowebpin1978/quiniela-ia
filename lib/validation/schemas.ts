/**
 * Validation Schemas: API request/response validation using Zod
 */
import { z } from "zod"

// ============================================================================
// COMMON
// ============================================================================

export const turnoSchema = z.enum([
  "previa", "primera", "matutina", "vespertina", "nocturna",
])

export const gameSlugSchema = z.enum(["quiniela", "quini6"])

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")

// ============================================================================
// PREDICTIONS API
// ============================================================================

export const predictionsRequestSchema = z.object({
  turno: turnoSchema,
  targetDate: dateSchema.optional(),
})

export const predictionSaveSchema = z.object({
  turno: turnoSchema,
  date: dateSchema,
  gameId: z.string().uuid().optional(),
  numbers2c: z.array(z.number().int().min(0).max(99)).min(1).max(10),
  numbers3c: z.array(z.number().int().min(0).max(999)).max(10).optional(),
  numbers4c: z.array(z.number().int().min(0).max(9999)).max(10).optional(),
  redoblona: z.string().regex(/^\d{2}-\d{2}$/).optional(),
  confidence: z.number().int().min(0).max(100).optional(),
})

// ============================================================================
// SCRAPE API
// ============================================================================

export const scrapeRequestSchema = z.object({
  gameSlug: gameSlugSchema.default("quiniela"),
  source: z.string().min(1).max(100).optional(),
})

// ============================================================================
// DRAW DATA
// ============================================================================

export const drawRowSchema = z.object({
  id: z.number().optional(),
  game_id: z.string().uuid(),
  date: dateSchema,
  turno: turnoSchema,
  numbers: z.array(z.number().int().min(0).max(9999)).min(20),
  source: z.string().min(1).max(100),
  html_hash: z.string().nullable().optional(),
  confidence_score: z.number().min(0).max(1).nullable().optional(),
  source_priority: z.number().int().min(0).max(10).optional(),
})

// ============================================================================
// USER PROFILE
// ============================================================================

export const userProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["free", "premium", "admin"]),
  premium_until: z.string().nullable().optional(),
  trial_ends_at: z.string().nullable().optional(),
  predictions_used: z.number().int().min(0).optional(),
})

// ============================================================================
// PAYMENT WEBHOOK
// ============================================================================

export const webhookPayloadSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["approved", "pending", "rejected"]),
  amount: z.number().positive().optional(),
  paymentId: z.string().optional(),
})

// ============================================================================
// CRON AUTH
// ============================================================================

export const cronAuthHeaderSchema = z.object({
  authorization: z.string().min(1),
})

// ============================================================================
// RESPONSE TYPES (inferred from schemas)
// ============================================================================

export type TurnoType = z.infer<typeof turnoSchema>
export type GameSlugType = z.infer<typeof gameSlugSchema>
export type PredictionsRequest = z.infer<typeof predictionsRequestSchema>
export type PredictionSave = z.infer<typeof predictionSaveSchema>
export type ScrapeRequest = z.infer<typeof scrapeRequestSchema>
export type DrawRow = z.infer<typeof drawRowSchema>
export type UserProfileData = z.infer<typeof userProfileSchema>
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>
