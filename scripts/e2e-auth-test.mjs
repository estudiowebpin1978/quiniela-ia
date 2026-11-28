/**
 * E2E autenticado contra producción.
 * Verifica: auth/me, guardar predicción, listar predicciones.
 * Uso: node scripts/e2e-auth-test.mjs
 */
import { createClient } from "@supabase/supabase-js"

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://quiniela-ia.httpsquiniela-ia-twovercelapp.workers.dev"

if (!URL || !ANON || !SERVICE) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY")
  process.exit(1)
}

const sb = createClient(URL, ANON)
const sbS = createClient(URL, SERVICE)
let userId = null

const results = []
function check(name, ok, detail = "") {
  results.push({ name, ok, detail })
  console.log((ok ? "✅" : "❌") + " " + name + (detail ? " — " + detail : ""))
}

async function main() {
  const email = `qa-e2e-${Date.now()}@quiniela-ia.test`
  const pw = "TestPass123!"
  const { data: su, error: sue } = await sb.auth.signUp({ email, password: pw })
  if (sue) { console.error("signUp error", sue); process.exit(1) }
  userId = su.user.id
  console.log("Usuario de prueba creado:", userId, email)

  const { data: li, error: lie } = await sb.auth.signInWithPassword({ email, password: pw })
  if (lie) { console.error("login error", lie); process.exit(1) }
  const tok = li.session.access_token
  console.log("Login OK (token de sesión real)")

  await sbS.from("user_profiles").upsert({ id: userId, email, role: "premium", premium_until: new Date(Date.now() + 30*86400000).toISOString(), trial_ends_at: new Date(Date.now() + 30*86400000).toISOString() })
  console.log("Promover a premium: OK")

  // auth/me
  const meRes = await fetch(`${BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${tok}` } })
  const me = await meRes.json()
  check("GET /api/auth/me", meRes.ok && (me.role === "premium" || me.canAccessPremiumFeatures === true), `status=${meRes.status} role=${me.role} premium=${me.canAccessPremiumFeatures}`)

  // guardar
  const saveRes = await fetch(`${BASE}/api/mis-predicciones`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body: JSON.stringify({ date: "2027-02-28", turno: "Nocturna", numeros: ["11","22","33","44","55","66","77","88","99","00"] }),
  })
  const saveBody = await saveRes.json().catch(() => ({}))
  check("POST /api/mis-predicciones (guardar)", saveRes.ok, `status=${saveRes.status}`)

  // listar
  const listRes = await fetch(`${BASE}/api/mis-predicciones`, { headers: { Authorization: `Bearer ${tok}` } })
  const listBody = await listRes.json().catch(() => ({}))
  const found = Array.isArray(listBody.predictions) && listBody.predictions.some((p) => p.fecha === "2027-02-28" || p.date === "2027-02-28")
  check("GET /api/mis-predicciones (aparece)", listRes.ok && found, `status=${listRes.status} encontrada=${found}`)

  // cleanup
  const { data: mine } = await sbS.from("user_predictions").select("id").eq("user_id", userId)
  if (mine?.length) {
    await sbS.from("user_predictions").delete().in("id", mine.map((r) => r.id))
    console.log(`🧹 Limpieza user_predictions (${mine.length}): OK`)
  }
  await sbS.from("user_profiles").delete().eq("id", userId)
  const del = await fetch(`${URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  })
  console.log("🧹 Limpieza usuario de prueba:", del.status === 204 || del.ok ? "OK (borrado)" : "HTTP " + del.status)

  const allOk = results.every((r) => r.ok)
  console.log(`\n=== E2E AUTENTICADO: ${allOk ? "TODO FUNCIONA ✅" : "HAY FALLOS ❌"} ===`)
  for (const r of results.filter((x) => !x.ok)) console.log("  FALLA:", r.name, "-", r.detail)
  process.exit(allOk ? 0 : 1)
}

main().catch(async (e) => {
  console.error("Error inesperado:", e)
  if (userId) await fetch(`${URL}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }).catch(() => {})
  process.exit(1)
})
