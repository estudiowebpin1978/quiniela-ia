import { NextRequest, NextResponse } from "next/server";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/"/g, "").trim() || "https://wazkylxgqckjfkcmfotl.supabase.co";
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/"/g, "").trim() || process.env.SUPABASE_SERVICE_KEY?.replace(/"/g, "").trim() || "";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fecha = searchParams.get("fecha");
  const turno = searchParams.get("turno");

  if (!fecha || !turno) {
    return NextResponse.json({ error: "Faltan fecha o turno" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${SB}/rest/v1/draws?date=eq.${fecha}&turno=eq.${turno}&select=date,turno,numbers&limit=1`,
      {
        headers: { "apikey": SK, "Authorization": `Bearer ${SK}` },
      }
    );
    const rows = await res.json();

    if (!rows?.[0]) {
      return NextResponse.json({ found: false, fecha, turno });
    }

    const draw = rows[0];
    const numeros = draw.numbers.map((n: number) => String(Number(n) % 100).padStart(2, "0"));

    return NextResponse.json({
      found: true,
      fecha: draw.date,
      turno: draw.turno,
      numbers: draw.numbers,
      numeros,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}