import { NextRequest, NextResponse } from "next/server";
import { ejecutarAnalisisCompleto, AnalisisCompleto } from "@/lib/analisis/motor";
import { resolveUserTier } from "@/lib/auth/tier";
import logger from "@/lib/logger";
import { SUENOS } from "@/lib/suenos";
import type { DrawRow } from "@/lib/api/types";

function pad(n: number, l = 2): string {
  return String(n).padStart(l, '0');
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const turno = searchParams.get('turno') || 'todos';
  const dias = parseInt(searchParams.get('dias') || '90');

  // Validate turno against whitelist to prevent PostgREST injection
  const VALID_TURNOS = ['todos', 'previa', 'primera', 'matutina', 'vespertina', 'nocturna'];
  const turnoLower = turno.toLowerCase();
  if (!VALID_TURNOS.includes(turnoLower)) {
    return NextResponse.json({ error: 'Turno inválido' }, { status: 400 });
  }

  const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/"/g, '').trim();
  const SK = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '').replace(/"/g, '').trim();

  if (!SB || !SK) {
    return NextResponse.json({ error: 'Configuración incompleta' }, { status: 500 });
  }

  const token = req.headers.get("authorization")?.replace("Bearer ", "") || "";
  const tier = token ? await resolveUserTier(token) : null;
  const canPremium = !!tier?.canAccessPremiumFeatures;

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 25000);

  try {
    let url = `${SB}/rest/v1/draws?select=date,turno,numbers&order=date.desc&limit=10000`;
    if (turno !== 'todos') {
      url += `&turno=ilike.*${turno}*`;
    }

    const res = await fetch(url, {
      headers: { 'apikey': SK, 'Authorization': `Bearer ${SK}` },
      signal: ctrl.signal
    });
    clearTimeout(to);

    if (!res.ok) {
      return NextResponse.json({ error: `Error fetching data: ${res.status}` }, { status: 500 });
    }

    const rows: DrawRow[] = await res.json();
    if (!rows?.length) {
      return NextResponse.json({ error: 'Sin datos disponibles' }, { status: 200 });
    }

    const sorteos = rows
      .filter((row: DrawRow) => Array.isArray(row.numbers) && row.numbers.length >= 20)
      .map((row: DrawRow) => ({
        fecha: row.date,
        turno: row.turno,
        numbers: row.numbers.map((n: number) => Number(n)).filter((n: number) => !isNaN(n) && n >= 0 && n <= 9999)
      }));

    logger.info(`[AnalisisAvanzado] Procesando ${sorteos.length} sorteos para ${turno}`);

    const analisis = ejecutarAnalisisCompleto(sorteos, {
      diasAnalisis: dias,
      turno: turno === 'todos' ? undefined : turno,
      topNRanking: 15
    });

    const pred2 = analisis.recomendaciones.dosCifras.slice(0, 10).map(r => ({
      numero: pad(r.numero),
      confianza: r.confianza,
      emoji: SUENOS[r.numero]?.emoji || '❓',
      nombre: SUENOS[r.numero]?.nombre || '',
      razon: r.razon
    }));

    const pred3 = canPremium ? analisis.recomendaciones.tresCifras.map(p => ({
      numero: pad(parseInt(p.numero), 3),
      confianza: p.confianza
    })) : [];

    const pred4 = canPremium ? analisis.recomendaciones.cuatroCifras.map(p => ({
      numero: pad(parseInt(p.numero), 4),
      probabilidad: ((p as Record<string, unknown>).probabilidad as number) || 0
    })) : [];

    const redoblona = canPremium ? analisis.recomendaciones.redoblona : null;

    return NextResponse.json({
      ok: true,
      turno: turno === 'todos' ? 'todos' : turno,
      isPremium: canPremium,
      canAccessPremiumFeatures: canPremium,
      datos: {
        totalSorteos: analisis.resumen.totalSorteos,
        totalNumeros: analisis.resumen.totalNumeros,
        diasAnalisis: analisis.resumen.diasAnalisis
      },
      predicciones: {
        dosCifras: pred2,
        tresCifras: pred3,
        cuatroCifras: pred4,
        redoblona: redoblona
      },
      ranking: analisis.ranking.dosCifras.slice(0, 15).map((r, i) => ({
        posicion: i + 1,
        numero: pad(r.numero),
        score: r.score,
        confianza: r.confianza,
        factores: r.factores
      })),
      confianza: {
        promedio: analisis.resumen.promedioConfianza,
        nivelAlto: analisis.confianza.filter(c => c.nivel === 'alto' || c.nivel === 'muy_alto').length,
        nivelMedio: analisis.confianza.filter(c => c.nivel === 'medio').length,
        nivelBajo: analisis.confianza.filter(c => c.nivel === 'bajo').length
      },
      analisis: {
        frecuencia: {
          masFrecuente: pad(analisis.frecuencia.masFrecuente.numero),
          frecuenciaMasFrecuente: analisis.frecuencia.masFrecuente.frecuencia,
          menosFrecuente: pad(analisis.frecuencia.menosFrecuente.numero),
          frecuenciaMenosFrecuente: analisis.frecuencia.menosFrecuente.frecuencia
        },
        ausencias: {
          promedioAusencia: analisis.ausencias.promedioAusencia,
          maximaAusencia: analisis.ausencias.maximaAusencia,
          numerosAtrasados: analisis.ausencias.atrasados.slice(0, 5).map(a => pad(a.numero)),
          numerosCalientes: analisis.ausencias.caliente.slice(0, 5).map(a => pad(a.numero))
        },
        ciclos: {
          numerosEnCicloFavorable: analisis.ciclos.numerosEnCicloFavorables.slice(0, 10).map(n => pad(n)),
          numerosEnCicloDesfavorable: analisis.ciclos.numerosEnCicloDesfavorables.slice(0, 10).map(n => pad(n))
        }
      },
      metodologia: analisis.resumen.metodologia,
      generado: analisis.generado
    });
  } catch (e: unknown) {
    clearTimeout(to);
    const err = e as { name?: string; message?: string };
    logger.error('[AnalisisAvanzado] Error:', { error: err?.message || String(e) });
    return NextResponse.json({ error: 'Error en análisis' }, { status: 500 });
  }
}