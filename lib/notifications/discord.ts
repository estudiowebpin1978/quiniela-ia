/**
 * Discord Alert Webhook — Sends alerts when scraper fails consecutively.
 *
 * Env vars:
 *   DISCORD_WEBHOOK_URL — Discord webhook URL for alerts channel
 *
 * Usage:
 *   import { sendDiscordAlert } from "@/lib/notifications/discord"
 *   await sendDiscordAlert("Scraper", "Source X failed 3 times consecutively", "error")
 */

import logger from "@/lib/logger"

type AlertLevel = "info" | "warning" | "error" | "critical"

const LEVEL_COLORS: Record<AlertLevel, number> = {
  info: 0x3498db,      // Blue
  warning: 0xf39c12,   // Yellow
  error: 0xe74c3c,     // Red
  critical: 0x8e44ad,  // Purple
}

const LEVEL_EMOJI: Record<AlertLevel, string> = {
  info: "ℹ️",
  warning: "⚠️",
  error: "🚨",
  critical: "💀",
}

/**
 * Send an alert to Discord via webhook.
 * Silently fails if DISCORD_WEBHOOK_URL is not configured.
 */
export async function sendDiscordAlert(
  source: string,
  message: string,
  level: AlertLevel = "warning",
  extra?: Record<string, unknown>,
): Promise<void> {
  const webhookUrl = (process.env.DISCORD_WEBHOOK_URL || "").replace(/"/g, "").trim()
  if (!webhookUrl) return // Silently skip if not configured

  try {
    const embed = {
      title: `${LEVEL_EMOJI[level]} ${source}`,
      description: message,
      color: LEVEL_COLORS[level],
      timestamp: new Date().toISOString(),
      fields: extra
        ? Object.entries(extra).map(([key, val]) => ({
            name: key,
            value: String(val).slice(0, 1024),
            inline: true,
          }))
        : [],
      footer: {
        text: "Quiniela IA — Monitor",
      },
    }

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Quiniela IA Monitor",
        avatar_url: "https://quiniela-ia-two.vercel.app/icon-192.png",
        embeds: [embed],
      }),
      signal: AbortSignal.timeout(5000),
    })

    logger.info("[discord-alert] Sent", { source, level, message })
  } catch (e) {
    logger.warn("[discord-alert] Failed to send", { error: String(e) })
  }
}

/**
 * Alert for scraper source quarantine (3+ consecutive failures).
 */
export async function alertSourceQuarantined(
  source: string,
  consecutiveFailures: number,
  quarantinedUntil: string,
): Promise<void> {
  await sendDiscordAlert(
    "Scraper — Fuente Cuarentenada",
    `**${source}** ha fallado **${consecutiveFailures}** veces consecutivas.\nCuarentena hasta: ${quarantinedUntil}`,
    "critical",
    { source, failures: consecutiveFailures, until: quarantinedUntil },
  )
}

/**
 * Alert for scrape run with errors.
 */
export async function alertScrapeRunErrors(
  saved: number,
  errors: number,
  divergences: number,
  duration: number,
): Promise<void> {
  if (errors === 0 && divergences === 0) return

  await sendDiscordAlert(
    "Scrape — Errores Detectados",
    `Guardados: **${saved}** | Errores: **${errors}** | Divergencias: **${divergences}** | Duración: ${duration}ms`,
    errors >= 3 ? "critical" : "warning",
    { saved, errors, divergences, duration },
  )
}
