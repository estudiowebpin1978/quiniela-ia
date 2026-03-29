#!/usr/bin/env node
/** Comprueba que existan variables críticas (sin exponer valores). */
const need = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET"]
const miss = need.filter((k) => !process.env[k] || String(process.env[k]).trim() === "")
if (miss.length) {
  console.warn("[validate] Faltan variables (definilas en Vercel o .env.local):", miss.join(", "))
  process.exit(0)
}
console.log("[validate] Variables principales presentes.")
process.exit(0)
