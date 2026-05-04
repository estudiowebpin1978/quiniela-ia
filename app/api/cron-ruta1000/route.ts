import { NextRequest, NextResponse } from "next/server"

const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SK = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]
const ANIOS = [2026, 2025, 2024, 2023, 2022, 2021, 2020]

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") || ""
  const expected = process.env.CRON_SECRET || "quiniela_ia_cron_2024_seguro"
  
  if (secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const anioParam = parseInt(req.nextUrl.searchParams.get("anio") || "2026")
  const anio = ANIOS.includes(anioParam) ? anioParam : 2026

  const resultados: any[] = []
  let total = 0

  for (const turno of TURNOS) {
    try {
      const fechaStr = `${anio}-01-01`
      const fechaUrl = `01-01-${String(anio).slice(-2)}`
      
      // Por ahora solo registramos que vamos a implementar el scraper
      resultados.push({
        turno,
        anio,
        status: "pendiente_implementar_scraper",
        nota: "ruta1000 tiene datos desde 1999 pero requiere scraper especifico"
      })
    } catch (e: any) {
      resultados.push({ turno, anio, error: e.message })
    }
  }

  return NextResponse.json({
    ok: true,
    anio,
    resultados,
    nota: "ruta1000.com.ar tiene 27 años de datos pero solo cabezas (primeros numeros). Requiere desarrollo adicional."
  })
}
