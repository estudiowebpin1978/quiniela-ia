import { bindings, defineConfig, defineWorker, triggers } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "quiniela-ia",
    entrypoint: "./cloudflare-worker.ts",
    compatibilityDate: "2026-11-21",
    // Workers Free: 10 ms de CPU y 50 subrequests por invocación (no son
    // configurables en Free; `limits` ni siquiera permite el deploy). Toda la
    // app (Quiniela Ciudad + Redoblonas) se dimensiona para caber ahí:
    // precompute por turno en invocaciones separadas y respuestas servidas
    // desde predictions_cache (CPU de compute sólo en los crons).
    triggers: [
      triggers.scheduled({ schedule: "*/5 * * * *" }),
      triggers.scheduled({ schedule: "*/15 * * * *" }),
      triggers.scheduled({ schedule: "7 * * * *" }),
      triggers.scheduled({ schedule: "20 4 * * *" }),
    ],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      VINEXT_KV_CACHE: bindings.kv(),
    },
  }),
});
