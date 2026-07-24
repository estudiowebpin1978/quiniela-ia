/**
 * Application Use Case: RunDailyBacktest
 * Runs backtest for all turnos and stores results
 */
import { getSupabaseClient } from "@/lib/infrastructure/supabase/client"

export interface RunBacktestOutput {
  ok: boolean
  inserted: number
  errors: string[]
}

export async function runDailyBacktest(
  gameSlug: string = "quiniela",
): Promise<RunBacktestOutput> {
  const sb = getSupabaseClient()

  try {
    const { data, error } = await sb.rpc("run_daily_backtest", {
      p_game_slug: gameSlug,
    })

    if (error) {
      return { ok: false, inserted: 0, errors: [error.message] }
    }

    return { ok: true, inserted: data ?? 0, errors: [] }
  } catch (err: any) {
    return { ok: false, inserted: 0, errors: [err.message || "Backtest failed"] }
  }
}
