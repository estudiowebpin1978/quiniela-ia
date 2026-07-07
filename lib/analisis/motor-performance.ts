/**
 * Motor Performance Tracker.
 * Tracks which analysis engines perform best per turno and caches results.
 * Weak motors are skipped to reduce response time by ~30-40%.
 */

interface MotorScore {
  motor: string
  turno: string
  accuracy: number
  lastUsed: number
  timesUsed: number
}

const MAX_MOTORS = 16
const CACHE_TTL = 6 * 60 * 60 * 1000 // 6 hours
const MIN_ACCURACY = 0.3

function getStorage(): MotorScore[] {
  const gc = globalThis as any
  if (!gc.__motorPerf) gc.__motorPerf = []
  return gc.__motorPerf
}

export function getMotorAccuracy(motor: string, turno: string): number {
  const storage = getStorage()
  const entry = storage.find(e => e.motor === motor && e.turno === turno)
  return entry?.accuracy ?? 0.5
}

export function updateMotorPerformance(motor: string, turno: string, hitRate: number) {
  const storage = getStorage()
  const idx = storage.findIndex(e => e.motor === motor && e.turno === turno)

  if (idx >= 0) {
    const entry = storage[idx]
    entry.accuracy = (entry.accuracy * entry.timesUsed + hitRate) / (entry.timesUsed + 1)
    entry.timesUsed++
    entry.lastUsed = Date.now()
  } else {
    storage.push({ motor, turno, accuracy: hitRate, lastUsed: Date.now(), timesUsed: 1 })
  }

  if (storage.length > 500) {
    storage.sort((a, b) => b.lastUsed - a.lastUsed)
    storage.length = 300
  }
}

export function getTopMotors(turno: string, count: number = MAX_MOTORS): string[] {
  const storage = getStorage()
  const turnoEntries = storage.filter(e => e.turno === turno)

  if (turnoEntries.length < 3) return ALL_MOTORS.slice(0, count)

  const sorted = [...turnoEntries].sort((a, b) => b.accuracy - a.accuracy)
  return sorted.slice(0, count).map(e => e.motor)
}

export function getSkippedMotors(turno: string): string[] {
  const storage = getStorage()
  const turnoEntries = storage.filter(e => e.turno === turno && e.timesUsed >= 5)

  return turnoEntries
    .filter(e => e.accuracy < MIN_ACCURACY)
    .map(e => e.motor)
}

export function shouldRunMotor(motor: string, turno: string): boolean {
  const storage = getStorage()
  const entry = storage.find(e => e.motor === motor && e.turno === turno)

  if (!entry) return true
  if (entry.timesUsed < 3) return true
  if (entry.accuracy < MIN_ACCURACY && entry.timesUsed >= 5) return false
  return true
}

export function getMotorPerformanceStats(turno: string): { motor: string; accuracy: number; timesUsed: number }[] {
  const storage = getStorage()
  return storage
    .filter(e => e.turno === turno)
    .sort((a, b) => b.accuracy - a.accuracy)
    .map(e => ({ motor: e.motor, accuracy: e.accuracy, timesUsed: e.timesUsed }))
}

export function clearOldPerformance(maxAgeMs: number = CACHE_TTL) {
  const storage = getStorage()
  const cutoff = Date.now() - maxAgeMs
  const idx = storage.findIndex(e => e.lastUsed < cutoff)
  if (idx >= 0) storage.splice(0, idx)
}

export const ALL_MOTORS = [
  "factores30",
  "crossTurno",
  "pesosDinamicos",
  "monteCarlo",
  "correlation",
  "markovSuperior",
  "cyclicPatterns",
  "graphAnalysis",
  "featureEngineering",
  "multilevelScoring",
  "pmiCooccurrence",
  "advancedMarkov",
  "positionAnalysis",
  "ensembleML",
  "metaLearner",
  "bayesian",
] as const

export type MotorName = typeof ALL_MOTORS[number]
