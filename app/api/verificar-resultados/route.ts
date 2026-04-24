import { NextRequest, NextResponse } from "next/server";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/"/g, "").trim() || "https://wazkylxgqckjfkcmfotl.supabase.co";
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/"/g, "").trim() || process.env.SUPABASE_SERVICE_KEY?.replace(/"/g, "").trim() || "";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!SB || !SK) {
    return NextResponse.json({ error: "Configuración incompleta" }, { status: 500 });
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

      try {
        const res = await fetch(
          `${SB}/rest/v1/draws?date=eq.${p.fecha}&turno=eq.${p.turno}&select=numbers&limit=1`,
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
        console.log("Error verificando:", p.fecha, p.turno, e);
      }
      return p;
    })
  );

  return NextResponse.json({ predictions: actualizadas });
}