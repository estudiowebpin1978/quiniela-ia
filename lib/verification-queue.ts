/**
 * Verification Queue using Supabase pg_notify
 * Queues verification jobs for async processing
 */

import { getSupabaseAdmin } from "@/lib/supabase-client"
import logger from "@/lib/logger"

interface VerificationJob {
  fecha: string
  turno: string
  priority?: number
}

/**
 * Enqueue a verification job using pg_notify
 * The listener (cron-verify-worker) will pick it up
 */
export async function enqueueVerification(fecha: string, turno: string, priority = 0): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return false

  try {
    const job: VerificationJob = { fecha, turno, priority }
    const payload = JSON.stringify(job)

    // Use pg_notify to queue the job
    const { error } = await supabase.rpc("enqueue_verification", {
      p_payload: payload
    })

    if (error) {
      logger.error("[enqueueVerification] Error:", { error: error.message })
      return false
    }

    return true
  } catch (err) {
    logger.error("[enqueueVerification] Exception:", { error: String(err) })
    return false
  }
}

/**
 * Process verification queue (called by worker)
 */
export async function processVerificationQueue(batchSize = 10): Promise<number> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return 0

  try {
    const { data, error } = await supabase.rpc("process_verification_queue", {
      p_batch_size: batchSize
    })

    if (error) {
      logger.error("[processVerificationQueue] Error:", { error: error.message })
      return 0
    }

    return data?.[0]?.processed ?? 0
  } catch (err) {
    logger.error("[processVerificationQueue] Exception:", { error: String(err) })
    return 0
  }
}