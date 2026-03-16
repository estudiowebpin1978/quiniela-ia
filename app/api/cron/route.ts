import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g,"").trim()
  const SK = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/"/g,"").trim()

  const today = new Date()
  let inserted = 0

  for (let i = 0; i < 3; i++) {
    const date = new Date(today)
    date.setDate(today.getDate() - i)
    if (date.getDay() === 0 || date.getDay() === 6) continue

    const dateStr = date.toISOString().split("T")[0]
    const [y, m, d] = dateStr.split("-")

    for (const turno of ["previa","primera","matutina","vespertina","nocturna"]) {
      const turnoMap: Record<string,string> = {previa:"Previa",primera:"Primera",matutina:"Matutina",vespertina:"Vespertina",nocturna:"Nocturna"}
      try {
        const url = `https://www.quinielanacional.ruta1000.com.ar/resultados/${y}/${m}/${d}/${turno}`
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) })
        if (!res.ok) continue
        const html = await res.text()

        // Extraer numeros
        const nums: number[] = []
        const matches = html.match(/\b(\d{1,4})\b/g) || []
        for (const m of matches) {
          const n = parseInt(m)
          if (n >= 0 && n <= 9999 && !nums.includes(n) && nums.length < 20) nums.push(n)
        }
        if (nums.length < 5) continue

        await fetch(`${SB}/rest/v1/draws`, {
          method: "POST",
          headers: { "apikey": SK, "Authorization": `Bearer ${SK}`, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates" },
          body: JSON.stringify({ date: dateStr, turno: turnoMap[turno], numbers: nums })
        })
        inserted++
      } catch { continue }
    }
  }

  return NextResponse.json({ ok: true, inserted, date: today.toISOString() })
}
