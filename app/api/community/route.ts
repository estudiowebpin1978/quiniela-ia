import { NextRequest, NextResponse } from "next/server"
import { getSupabaseUrl, getSupabaseKey, sbHeaders } from "@/lib/config"

const SB_URL = getSupabaseUrl();
const SB_KEY = getSupabaseKey();

const TURNOS_VALIDOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]

async function verifyUser(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  if (!token || !SB_URL || !SB_KEY) return null
  try {
    const res = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { "apikey": SB_KEY, "Authorization": `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    const user = await res.json()
    return user?.id || null
  } catch { return null }
}

// GET: fetch community trends for today
export async function GET(req: NextRequest) {
  const today = new Date().toISOString().split("T")[0]

  try {
    if (!SB_URL || !SB_KEY) return NextResponse.json({ trends: [], totalToday: 0 });
    const res = await fetch(
      `${SB_URL}/rest/v1/community_trends?date=eq.${today}&select=*&order=turno`,
      { headers: sbHeaders(), next: { revalidate: 60 } }
    )
    if (!res.ok) return NextResponse.json({ trends: [], totalToday: 0 })
    const rows = await res.json()

    const totalToday = rows.reduce((sum: number, r: any) => sum + (r.analysis_count || 0), 0)

    return NextResponse.json({
      trends: rows.map((r: any) => ({
        turno: r.turno,
        hot_numbers: r.hot_numbers || [],
        hot_correlations: r.hot_correlations || [],
        analysis_count: r.analysis_count || 0,
      })),
      totalToday,
    })
  } catch {
    return NextResponse.json({ trends: [], totalToday: 0 })
  }
}

// POST: increment analysis count for a turno
export async function POST(req: NextRequest) {
  const userId = await verifyUser(req)
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const body = await req.json()
  const turno = body.turno as string
  const topNumbers = body.topNumbers as string[] | undefined
  const correlations = body.correlations as any[] | undefined

  if (!turno || !TURNOS_VALIDOS.includes(turno)) return NextResponse.json({ ok: true })

  const today = new Date().toISOString().split("T")[0]

  try {
    const existing = await fetch(
      `${SB_URL}/rest/v1/community_trends?date=eq.${today}&turno=eq.${turno}&limit=1`,
      { headers: sbHeaders() }
    )
    const rows = await existing.json()

    if (rows.length > 0) {
      const current = rows[0]
      const newCount = (current.analysis_count || 0) + 1

      const numMap = new Map<string, number>()
      for (const n of current.hot_numbers || []) {
        numMap.set(n.num, (n.count || 0))
      }
      for (const n of topNumbers || []) {
        numMap.set(n, (numMap.get(n) || 0) + 1)
      }
      const merged = Array.from(numMap.entries())
        .map(([num, count]) => ({ num, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)

      await fetch(`${SB_URL}/rest/v1/community_trends?date=eq.${today}&turno=eq.${turno}`, {
        method: "PATCH",
        headers: {
          ...sbHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          hot_numbers: merged,
          hot_correlations: correlations || current.hot_correlations,
          analysis_count: newCount,
          updated_at: new Date().toISOString(),
        }),
      })
    } else {
      await fetch(`${SB_URL}/rest/v1/community_trends`, {
        method: "POST",
        headers: {
          ...sbHeaders(),
          "Content-Type": "application/json", Prefer: "return=minimal",
        },
        body: JSON.stringify({
          date: today,
          turno,
          hot_numbers: (topNumbers || []).map(n => ({ num: n, count: 1 })),
          hot_correlations: correlations || [],
          analysis_count: 1,
        }),
      })
    }
  } catch {
    // Silently fail — community data is non-critical
  }

  return NextResponse.json({ ok: true })
}
