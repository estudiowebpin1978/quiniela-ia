import { createClient } from "@supabase/supabase-js"

const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SK_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/"/g, "").trim()

const MAX_MOTORS = 16
const MIN_ACCURACY = 0.3

async function getSupabase() {
  if (!SB_URL || !SK_KEY) return null
  return createClient(SB_URL, SK_KEY)
}

export async function getMotorAccuracy(motor: string, turno: string): Promise<number> {
  const supabase = await getSupabase()
  if (!supabase) return 0.5

  const { data } = await supabase
    .from("motor_performance")
    .select("accuracy")
    .eq("motor", motor)
    .eq("turno", turno)
    .single()

  return data?.accuracy ?? 0.5
}

export async function updateMotorPerformance(motor: string, turno: string, hitRate: number): Promise<void> {
  const supabase = await getSupabase()
  if (!supabase) return

  await supabase.rpc("update_motor_performance", {
    p_motor: motor,
    p_turno: turno,
    p_hit_rate: hitRate,
  })
}

export async function getTopMotors(turno: string, count: number = MAX_MOTORS): Promise<string[]> {
  const supabase = await getSupabase()
  if (!supabase) return ALL_MOTORS.slice(0, count)

  const { data } = await supabase.rpc("get_top_motors", {
    p_turno: turno,
    p_count: count,
  })

  return (data || []).map((d: any) => d.motor)
}

export async function getSkippedMotors(turno: string): Promise<string[]> {
  const supabase = await getSupabase()
  if (!supabase) return []

  const { data } = await supabase.rpc("get_skipped_motors", {
    p_turno: turno,
  })

  return (data || []).map((d: any) => d.motor)
}

export async function shouldRunMotor(motor: string, turno: string): Promise<boolean> {
  const supabase = await getSupabase()
  if (!supabase) return true

  const { data } = await supabase.rpc("should_run_motor", {
    p_motor: motor,
    p_turno: turno,
  })

  return data ?? true
}

export async function getMotorPerformanceStats(turno: string): Promise<{ motor: string; accuracy: number; timesUsed: number }[]> {
  const supabase = await getSupabase()
  if (!supabase) return []

  const { data } = await supabase
    .from("motor_performance")
    .select("motor, accuracy, times_used")
    .eq("turno", turno)
    .order("accuracy", { ascending: false })

  return (data || []).map(d => ({
    motor: d.motor,
    accuracy: Number(d.accuracy),
    timesUsed: d.times_used,
  }))
}

export async function clearOldPerformance(maxAgeHours: number = 6): Promise<number> {
  const supabase = await getSupabase()
  if (!supabase) return 0

  const { data } = await supabase.rpc("clear_old_motor_performance", {
    p_max_age_hours: maxAgeHours,
  })

  return data ?? 0
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

// Backwards-compat sync functions (for callers not yet async)
export function getMotorAccuracySync(motor: string, turno: string): number {
  // Fire-and-forget async call, return default
  getMotorAccuracy(motor, turno).catch(() => {})
  return 0.5
}

export function updateMotorPerformanceSync(motor: string, turno: string, hitRate: number): void {
  updateMotorPerformance(motor, turno, hitRate).catch(() => {})
}

export function shouldRunMotorSync(motor: string, turno: string): boolean {
  return true // Conservative default when sync
}

export function getSkippedMotorsSync(turno: string): string[] {
  return []
}