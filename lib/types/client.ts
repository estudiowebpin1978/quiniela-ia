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

 
export type SavedPrediction = Record<string, any>

 
export type AciertoItem = Record<string, any>

 
export type ResultadoControl = Record<string, any>

 
export type TrendItem = Record<string, any>

 
export type NumeroHistorial = Record<string, any>

 
export type MLData = Record<string, any>

 
export type VerificationStats = Record<string, any>

 
export type Achievement = Record<string, any>

 
export type DrawData = Record<string, any>

 
export type BacktestItem = Record<string, any>

// ── Shared UI Types ──────────────────────────────────────────────────

 
export type HeatmapItem = Record<string, any>

 
export type StatsData = Record<string, any>

 
export type RankingItem = Record<string, any>
