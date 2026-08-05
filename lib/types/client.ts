/**
 * Shared type definitions for client-side components.
 * Uses flexible types to match actual runtime data shapes.
 */

// ── Prediction Types ─────────────────────────────────────────────────

export interface NumeroItem {
  [key: string]: any
  numero: string
  significado?: string
  emoji?: string
  score?: number
  confianza?: number
  rank?: number
  frecuencia?: number
  factores?: Record<string, number> | string[]
  n?: number
  num?: string
  highConfidence?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SavedPrediction = Record<string, any>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AciertoItem = Record<string, any>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ResultadoControl = Record<string, any>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TrendItem = Record<string, any>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NumeroHistorial = Record<string, any>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MLData = Record<string, any>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VerificationStats = Record<string, any>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Achievement = Record<string, any>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DrawData = Record<string, any>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BacktestItem = Record<string, any>

// ── Shared UI Types ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HeatmapItem = Record<string, any>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type StatsData = Record<string, any>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RankingItem = Record<string, any>
