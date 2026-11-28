import app from "vinext/server/fetch-handler"

const VERIFY_CRON = "*/5 * * * *"
const SCRAPE_CRON = "*/15 * * * *"
const PRECOMPUTE_CRON = "7 * * * *"
const AUX_CRON = "20 4 * * *"

interface CronController {
  cron: string
}

interface WorkerEnvironment {
  CRON_SECRET?: string
  APP_URL?: string
}

interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void
}

const worker = {
  fetch: app.fetch,

  scheduled(controller: CronController, env: WorkerEnvironment, ctx: WorkerContext) {
    const task = (async () => {
      const paths = controller.cron === VERIFY_CRON
        ? ["/api/cron-verify-predictions"]
        : controller.cron === SCRAPE_CRON
          ? ["/api/cron-scrape"]
          : controller.cron === PRECOMPUTE_CRON
            ? ["/api/cron-precompute"]
            : controller.cron === AUX_CRON
              ? ["/api/cron-aux"]
              : null

      if (!paths) throw new Error(`Unsupported cron schedule: ${controller.cron}`)
      if (!env.CRON_SECRET) throw new Error("CRON_SECRET is not configured for the scheduled Worker")
      if (!env.APP_URL) throw new Error("APP_URL is not configured for the scheduled Worker")

      for (const path of paths) {
        const appUrl = new URL(env.APP_URL)
        if (appUrl.protocol !== "https:" || appUrl.pathname !== "/" || appUrl.search || appUrl.hash) {
          throw new Error("APP_URL must be an HTTPS origin")
        }

        const response = await fetch(new Request(new URL(path, appUrl), {
          headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
        }))

        if (!response.ok) {
          throw new Error(`${path} returned HTTP ${response.status}`)
        }

        console.log(`Scheduled ${controller.cron} ${path} completed with HTTP ${response.status}`)
      }
    })()

    ctx.waitUntil(task)
  },
}

export default worker