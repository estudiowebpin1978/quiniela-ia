import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const accion = searchParams.get('accion') || 'entrenar';
  const turno = searchParams.get('turno') || 'todos';

  const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wazkylxgqckjfkcmfotl.supabase.co').replace(/"/g, '').trim();
  const SK = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/"/g, '').trim();

  if (!SB || !SK) {
    return NextResponse.json({ error: 'Configuración incompleta' }, { status: 500 });
  }

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 60000);

  try {
    let url = `${SB}/rest/v1/draws?select=date,turno,numbers&order=date.desc&limit=5000`;
    if (turno !== 'todos') {
      url += `&turno=ilike.*${turno}*`;
    }

    const res = await fetch(url, {
      headers: { 'apikey': SK, 'Authorization': `Bearer ${SK}` },
      signal: ctrl.signal
    });
    clearTimeout(to);

    if (!res.ok) {
      return NextResponse.json({ error: `Error: ${res.status}` }, { status: 500 });
    }

    const rows: any[] = await res.json();
    if (!rows?.length || rows.length < 50) {
      return NextResponse.json({ error: 'Datos insuficientes para training (mínimo 50 sorteos)' }, { status: 500 });
    }

    const sorteos = rows
      .filter((row: any) => Array.isArray(row.numbers) && row.numbers.length >= 20)
      .map((row: any) => ({
        fecha: row.date,
        turno: row.turno,
        numbers: row.numbers.map((n: any) => Number(n)).filter((n: number) => !isNaN(n))
      }));

    console.log(`[ML-Training] Procesando ${sorteos.length} sorteos para ${turno}`);

    if (accion === 'entrenar') {
      return NextResponse.json({
        ok: true,
        accion: 'entrenamiento',
        turno,
        mensaje: 'Sistema de ML en desarrollo',
        estado: 'disponible_pronto',
        generado: new Date().toISOString()
      });
    } else if (accion === 'validar') {
      return NextResponse.json({
        ok: true,
        accion: 'validacion',
        turno,
        mensaje: 'Sistema de validación en desarrollo',
        estado: 'disponible_pronto',
        generado: new Date().toISOString()
      });
    } else {
      return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
    }
  } catch (e: any) {
    clearTimeout(to);
    console.error('[ML-Training] Error:', e.message || String(e));
    return NextResponse.json({ error: e.message || 'Error en training' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    mensaje: 'API de ML Training',
    endpoints: {
      POST: {
        '/api/ml-training?accion=entrenar': 'Entrenar modelos',
        '/api/ml-training?accion=validar': 'Validar modelos'
      }
    },
    estado: 'en_desarrollo'
  });
}