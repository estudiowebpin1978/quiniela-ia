import { NextRequest, NextResponse } from "next/server";
import { getSupabaseUrl, getSupabaseKey } from "@/lib/config";
import { validateCronAuth, unauthorizedResponse } from "@/lib/cron/auth";

const SB = getSupabaseUrl();
const SK = getSupabaseKey();

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!SB || !SK) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const authResult = await validateCronAuth(req)
  if (!authResult.authorized) {
    return unauthorizedResponse()
  }

  const { searchParams } = new URL(req.url);
  const fecha = searchParams.get("fecha");
  const turno = searchParams.get("turno");

  if (!fecha || !turno) {
    return NextResponse.json({ error: "Faltan fecha o turno" }, { status: 400 });
  }

  try {
    const safeFecha = encodeURIComponent(fecha)
    const safeTurno = encodeURIComponent(turno)
    const res = await fetch(
      `${SB}/rest/v1/draws?date=eq.${safeFecha}&turno=eq.${safeTurno}&select=date,date,turno,numbers&limit=1`,
      {
        headers: { "apikey": SK, "Authorization": `Bearer ${SK}` },
      }
    );
    if (!res.ok) return NextResponse.json({ found: false, fecha, turno });
    const rows = await res.json();

    if (!rows?.[0]) {
      return NextResponse.json({ found: false, fecha, turno });
    }

    const draw = rows[0];
    const numeros = (draw.numbers || []).map((n: number) => String(Number(n) % 100).padStart(2, "0"));

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