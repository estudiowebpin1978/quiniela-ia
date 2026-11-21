import { bindings, defineConfig, defineWorker, triggers } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "quiniela-ia",
    entrypoint: "./cloudflare-worker.ts",
    compatibilityDate: "2026-11-21",
    triggers: [
      triggers.scheduled({ schedule: "*/5 * * * *" }),
      triggers.scheduled({ schedule: "*/15 * * * *" }),
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
