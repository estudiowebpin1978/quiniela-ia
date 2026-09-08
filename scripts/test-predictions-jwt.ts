/**
 * scripts/test-predictions-jwt.ts
 *
 * Tests the /api/predictions endpoint with a real JWT.
 * Usage: npx tsx scripts/test-predictions-jwt.ts
 *
 * Requires .env.local with:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   TEST_EMAIL (a registered user)
 *   TEST_PASSWORD
 */

import "dotenv/config"

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const EMAIL = process.env.TEST_EMAIL!
const PASSWORD = process.env.TEST_PASSWORD!

async function main() {
  console.log("=== Predictions JWT Test ===\n")

  if (!SB_URL || !SB_ANON || !EMAIL || !PASSWORD) {
    console.error("Missing env vars. Need: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, TEST_EMAIL, TEST_PASSWORD")
    process.exit(1)
  }

  // 1. Sign in to get JWT
  console.log("1. Signing in...")
  const authRes = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "apikey": SB_ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })

  if (!authRes.ok) {
    const err = await authRes.text()
    console.error(`   Auth failed (${authRes.status}): ${err}`)
    process.exit(1)
  }

  const auth = await authRes.json()
  const token = auth.access_token
  console.log(`   OK — user: ${auth.user.email}, role: ${auth.user.role}`)

  // 2. Test each turno
  const turnos = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]
  let passed = 0
  let failed = 0

  for (const turno of turnos) {
    console.log(`\n2. Testing turno: ${turno}...`)
    try {
      const res = await fetch(`${BASE_URL}/api/predictions?turno=${turno}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        const body = await res.text()
        console.error(`   FAIL (${res.status}): ${body.slice(0, 200)}`)
        failed++
        continue
      }

      const data = await res.json()

      // Validate structure
      const hasTopNums = Array.isArray(data.numeros) && data.numeros.length > 0
      const hasTop3 = data.numeros?.[0]?.numero !== undefined
      const hasScore = typeof data.numeros?.[0]?.score === "number"

      if (hasTopNums && hasTop3 && hasScore) {
        const top5 = data.numeros.slice(0, 5).map((n: any) => n.numero).join(", ")
        console.log(`   PASS — top 5: ${top5}`)
        console.log(`   Engine: ${data.debug?.engine_version || "unknown"}, cached: ${data._cached}`)
        passed++
      } else {
        console.error(`   FAIL — invalid structure: ${JSON.stringify(data).slice(0, 300)}`)
        failed++
      }
    } catch (e) {
      console.error(`   ERROR: ${e}`)
      failed++
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
  process.exit(failed > 0 ? 1 : 0)
}

main()
