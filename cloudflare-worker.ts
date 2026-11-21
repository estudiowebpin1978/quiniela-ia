import app from "vinext/server/fetch-handler"

const VERIFY_CRON = "*/5 * * * *"
const SCRAPE_CRON = "*/15 * * * *"
const APP_URL = "https://quiniela-ia.httpsquiniela-ia-twovercelapp.workers.dev"

interface CronController {
  cron: string
}

interface WorkerEnvironment {
  CRON_SECRET?: string
}

interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void
}

const worker = {
  fetch: app.fetch,

  scheduled(controller: CronController, env: WorkerEnvironment, ctx: WorkerContext) {
    const task = (async () => {
      const path = controller.cron === VERIFY_CRON
        ? "/api/cron-verify-predictions"
        : controller.cron === SCRAPE_CRON
          ? "/api/cron-scrape"
          : null

      if (!path) throw new Error(`Unsupported cron schedule: ${controller.cron}`)
      if (!env.CRON_SECRET) throw new Error("CRON_SECRET is not configured for the scheduled Worker")

      const response = await app.fetch(
        new Request(new URL(path, APP_URL), {
          headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
        }),
        env,
        ctx,
      )

      if (!response.ok) {
        throw new Error(`${path} returned HTTP ${response.status}`)
      }

      console.log(`Scheduled ${controller.cron} completed with HTTP ${response.status}`)
    })()

    ctx.waitUntil(task)
  },
}

export default worker
