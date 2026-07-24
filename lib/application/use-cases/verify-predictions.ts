/**
 * Application Use Case: VerifyUserPredictions
 * Matches user predictions against actual draw results
 */
import { getSupabaseClient } from "@/lib/infrastructure/supabase/client"

export interface VerifyPredictionsOutput {
  ok: boolean
  verified: number
  errors: string[]
}

export async function verifyUserPredictions(): Promise<VerifyPredictionsOutput> {
  const sb = getSupabaseClient()

  try {
    const { data, error } = await sb.rpc("verify_predictions")
    if (error) {
      return { ok: false, verified: 0, errors: [error.message] }
    }
    return { ok: true, verified: data ?? 0, errors: [] }
  } catch (err: any) {
    return { ok: false, verified: 0, errors: [err.message || "Verification failed"] }
  }
}
