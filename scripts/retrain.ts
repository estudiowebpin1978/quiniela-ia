// Load env vars from .env.local
import { readFileSync } from "fs"
import { resolve } from "path"

const envPath = resolve(__dirname, "../.env.local")
const envContent = readFileSync(envPath, "utf8")
for (const line of envContent.split("\n")) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith("#")) continue
  const eqIdx = trimmed.indexOf("=")
  if (eqIdx === -1) continue
  const key = trimmed.slice(0, eqIdx).trim()
  const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "")
  if (!process.env[key]) process.env[key] = val
}

import { autoTrainSingle } from "../lib/ml/auto-train"

async function main() {
  const turnos = ["previa", "primera", "matutina", "vespertina", "nocturna"]
  for (const t of turnos) {
    console.log("Training", t, "...")
    try {
      const models = await autoTrainSingle(t, false, true)
      console.log("  →", models?.length || 0, "models")
    } catch (e) {
      console.error("  → ERROR:", String(e))
    }
  }
  console.log("Done")
}

main().catch(e => { console.error(e); process.exit(1) })
