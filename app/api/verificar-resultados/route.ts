import { NextRequest, NextResponse } from "next/server";
import logger from "@/lib/logger";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/"/g, "").trim() || "";
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/"/g, "").trim() || process.env.SUPABASE_SERVICE_KEY?.replace(/"/g, "").trim() || "";

const TURNOS_VALIDOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

async function verifyUser(req: NextRequest): Promise<boolean> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  if (!token || !SB || !SK) return false
  try {
    const res = await fetch(`${SB}/auth/v1/user`, {
      headers: { "apikey": SK, "Authorization": `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    })
    return res.ok
  } catch { return false }
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!SB || !SK) {
    return NextResponse.json({ error: "Configuración incompleta" }, { status: 500 });
  }

  if (!await verifyUser(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const predictions = searchParams.get("predictions");

  if (!predictions) {
    return NextResponse.json({ error: "Faltan predicciones" }, { status: 400 });
  }

  let preds: any[] = [];
  try {
    preds = JSON.parse(predictions);
  } catch {
    return NextResponse.json({ error: "Invalid predictions format" }, { status: 400 });
  }

  const actualizadas = await Promise.all(
    preds.map(async (p: any) => {
      if (p.resultado && p.resultado.length) return p;

      // Validate inputs
      if (!p.fecha || !DATE_RE.test(p.fecha)) return p;
      if (!p.turno || !TURNOS_VALIDOS.includes(p.turno)) return p;

      try {
        const res = await fetch(
          `${SB}/rest/v1/draws?date=eq.${encodeURIComponent(p.fecha)}&turno=eq.${encodeURIComponent(p.turno)}&select=numbers&limit=1`,
          {
            headers: { "apikey": SK, "Authorization": `Bearer ${SK}` },
          }
        );
        const rows = await res.json();

        if (rows?.[0]?.numbers) {
          const nums = rows[0].numbers.map((n: number) =>
            String(Number(n) % 100).padStart(2, "0")
          );
          const aciertos = p.numeros
            .filter((n: string) => nums.includes(n))
            .map((n: string) => ({ numero: n, puesto: nums.indexOf(n) + 1 }));
          return { ...p, resultado: nums, aciertos, acerto: aciertos.length > 0 };
        }
      } catch (e) {
        logger.error("Error verificando:", { fecha: p.fecha, turno: p.turno, error: String(e) });
      }
      return p;
    })
  );

  return NextResponse.json({ predictions: actualizadas });
}
