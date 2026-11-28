/**
 * Auditoría: tablas referenciadas por el código (app/ + lib/) vs tablas que
 * existen realmente en Supabase (schema public y schema api).
 * Uso: node scripts/audit-tables.mjs
 */
import { createClient } from "@supabase/supabase-js"
import fs from "node:fs"
import path from "node:path"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// 1. recolectar .from("x") del código
const roots = ["app", "lib", "scripts", "components"]
const froms = new Map() // tabla -> [archivos]
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) {
      const src = fs.readFileSync(p, "utf8")
      for (const m of src.matchAll(/\.from\(\s*["']([a-zA-Z0-9_]+)["']\s*\)/g)) {
        const t = m[1]
        if (!froms.has(t)) froms.set(t, new Set())
        froms.get(t).add(p)
      }
    }
  }
}
for (const r of roots) if (fs.existsSync(r)) walk(r)

// 2. probe
const missing = []
const present = []
for (const [table, files] of [...froms.entries()].sort()) {
  const { error } = await sb.from(table).select("*").limit(1)
  if (error && (error.code === "PGRST205" || /Could not find the table/.test(error.message || ""))) {
    missing.push({ table, files: [...files].slice(0, 3) })
  } else {
    present.push(table)
  }
}

console.log(`Tablas referenciadas: ${froms.size}`)
console.log(`Existentes: ${present.length}`)
console.log(`FALTANTES: ${missing.length}`)
for (const m of missing) {
  console.log(`  ❌ ${m.table}`)
  for (const f of m.files) console.log(`       <- ${f}`)
}
