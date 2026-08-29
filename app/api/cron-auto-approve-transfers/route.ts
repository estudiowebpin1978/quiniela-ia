/**
 * /api/cron-auto-approve-transfers
 * Auto-approves pending transfers after TRANSFER_AUTO_APPROVE_HOURS (default 24h).
 * Called by cron-job.org every 30 minutes.
 *
 * Uses a single Supabase RPC (approve_transfer_and_activate_premium) that:
 *   - FOR UPDATE SKIP LOCKED prevents concurrent cron collisions
 *   - Atomic: transfer + premium + notification in one DB transaction
 *   - Returns ok/reason so the route can classify transient vs definitive errors
 */

import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import logger from "@/lib/logger"

const AUTO_APPROVE_HOURS = Number(process.env.TRANSFER_AUTO_APPROVE_HOURS) || 24
const TIME_BUDGET_MS = 8_000

/** Errors that are transient — the transfer stays pending for next cron run */
const TRANSIENT_REASONS = new Set(["network_error", "timeout", "5xx"])

/** Errors that are definitive — the transfer is already marked failed by the RPC */
const DEFINITIVE_REASONS = new Set([
  "not_found_or_already_processed",
  "invalid_plan",
])

interface RpcResult {
  ok: boolean
  reason?: string
  transfer_id?: string
  user_id?: string
  plan?: string
  error?: string
}

export async function GET(req: NextRequest) {
  const t0 = Date.now()
  const auth = await validateCronAuth(req)
  if (!auth.authorized) return unauthorizedResponse()

  const supabase = getSupabaseAdmin()
  const cutoff = new Date(Date.now() - AUTO_APPROVE_HOURS * 3600000).toISOString()

  try {
    // Lightweight fetch: only IDs needed — RPC does the heavy lifting with row-level locks
    const { data: transfers, error: fetchError } = await supabase
      .from("pending_transfers")
      .select("id")
      .eq("status", "pending")
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(50)

    if (fetchError) throw fetchError
    if (!transfers || transfers.length === 0) {
      return NextResponse.json({ ok: true, message: "No pending transfers to approve", approved: 0 })
    }

    let approved = 0
    let transientRetries = 0
    const definitiveErrors: string[] = []

    for (const t of transfers) {
      if (Date.now() - t0 > TIME_BUDGET_MS) {
        logger.warn("[cron-auto-approve] Time budget exceeded, stopping early", {
          processed: approved + transientRetries + definitiveErrors.length,
          approved,
          transientRetries,
          definitiveErrors: definitiveErrors.length,
          remaining: transfers.length - (approved + transientRetries + definitiveErrors.length),
        })
        break
      }

      let rpcResult: RpcResult | null = null
      try {
        const { data, error: rpcError } = await supabase
          .rpc("approve_transfer_and_activate_premium" as never, {
            p_transfer_id: t.id,
          } as never)

        if (rpcError) {
          // Supabase client-level error (connection, auth, etc.) — treat as transient
          logger.error("[cron-auto-approve] RPC client error", { transferId: t.id, error: rpcError.message })
          transientRetries++
          continue
        }

        rpcResult = data as unknown as RpcResult
      } catch (e) {
        // Network timeout or unexpected error — transient, leave pending
        logger.error("[cron-auto-approve] RPC call failed", { transferId: t.id, error: String(e) })
        transientRetries++
        continue
      }

      if (rpcResult?.ok) {
        approved++
        logger.info("[cron-auto-approve] Transfer approved", {
          transferId: rpcResult.transfer_id,
          userId: rpcResult.user_id,
          plan: rpcResult.plan,
        })
      } else {
        const reason = rpcResult?.reason || "unknown"

        if (TRANSIENT_REASONS.has(reason)) {
          transientRetries++
          logger.warn("[cron-auto-approve] Transient error, will retry next run", { transferId: t.id, reason })
        } else if (DEFINITIVE_REASONS.has(reason)) {
          definitiveErrors.push(`${t.id}: ${reason}`)
          logger.info("[cron-auto-approve] Definitive error, transfer marked failed by RPC", { transferId: t.id, reason })
        } else {
          // Unknown reason — log but don't mark as failed (could be transient)
          transientRetries++
          logger.warn("[cron-auto-approve] Unknown RPC reason, will retry", { transferId: t.id, reason })
        }
      }
    }

    const result = {
      ok: true,
      message: `Approved ${approved}/${transfers.length} transfers`,
      approved,
      total: transfers.length,
      transientRetries,
      definitiveErrors: definitiveErrors.length > 0 ? definitiveErrors : undefined,
    }

    logCronExecution("cron-auto-approve", {
      approved,
      total: transfers.length,
      transientRetries,
      definitiveCount: definitiveErrors.length,
    }, t0)

    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.error("[cron-auto-approve] Error", { error: msg })
    logCronExecution("cron-auto-approve", { error: msg }, t0)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
