import { NextRequest, NextResponse } from "next/server";
import { ejecutarAnalisisCompleto, AnalisisCompleto } from "@/lib/analisis/motor";
import { resolveUserTier } from "@/lib/auth/tier";
import logger from "@/lib/logger";

const SUENOS: Record<number, { emoji: string; nombre: string }> = {
  0: { emoji: "🥚", nombre: "Huevos" }, 1: { emoji: "💧", nombre: "Agua" }, 2: { emoji: "👶", nombre: "Niño" }, 
  3: { emoji: "🐰", nombre: "San Cono" }, 4: { emoji: "🛏️", nombre: "La cama" }, 5: { emoji: "🐱", nombre: "Gato" },
  6: { emoji: "🐕", nombre: "Perro" }, 7: { emoji: "🔫", nombre: "Revolver" }, 8: { emoji: "🔥", nombre: "Incendio" },
  9: { emoji: "🌊", nombre: "Arroyo" }, 10: { emoji: "🥛", nombre: "Leche" }, 11: { emoji: "⛏️", nombre: "Minero" },
  12: { emoji: "💂", nombre: "Soldado" }, 13: { emoji: "😱", nombre: "Yeta" }, 14: { emoji: "🍺", nombre: "Borracho" },
  15: { emoji: "👸", nombre: "Niña Bonita" }, 16: { emoji: "💍", nombre: "Anillo" }, 17: { emoji: "💀", nombre: "Desgracia" },
  18: { emoji: "🩸", nombre: "Sangre" }, 19: { emoji: "🐟", nombre: "Pescado" }, 20: { emoji: "🎉", nombre: "La fiesta" },
  21: { emoji: "👩", nombre: "Mujer" }, 22: { emoji: "🤪", nombre: "Loco" }, 23: { emoji: "👨‍🍳", nombre: "Cocinero" },
  24: { emoji: "🐴", nombre: "Caballo" }, 25: { emoji: "🐔", nombre: "Gallina" }, 26: { emoji: "⛪", nombre: "La misa" },
  27: { emoji: "🪮", nombre: "Peine" }, 28: { emoji: "⛰️", nombre: "Cerro" }, 29: { emoji: "✝️", nombre: "San Pedro" },
  30: { emoji: "🌹", nombre: "Santa Rosa" }, 31: { emoji: "💡", nombre: "Luz" }, 32: { emoji: "💰", nombre: "Dinero" },
  33: { emoji: "✝️", nombre: "Cristo" }, 34: { emoji: "🤕", nombre: "Cabeza" }, 35: { emoji: "🐦", nombre: "Pajarito" },
  36: { emoji: "🧈", nombre: "Manteca" }, 37: { emoji: "🦷", nombre: "Dentista" }, 38: { emoji: "🪨", nombre: "Piedras" },
  39: { emoji: "🌧️", nombre: "Lluvia" }, 40: { emoji: "👨‍🔬", nombre: "Cura" }, 41: { emoji: "🔪", nombre: "Cuchillo" },
  42: { emoji: "👟", nombre: "Zapatillas" }, 43: { emoji: "🏠", nombre: "Balcón" }, 44: { emoji: "🏚️", nombre: "Cárcel" },
  45: { emoji: "🍷", nombre: "Vino" }, 46: { emoji: "🍅", nombre: "Tomates" }, 47: { emoji: "💀", nombre: "Muerto" },
  48: { emoji: "🧟", nombre: "Muerto habla" }, 49: { emoji: "🥩", nombre: "Carne" }, 50: { emoji: "🍞", nombre: "Pan" },
  51: { emoji: "🪚", nombre: "Serrucho" }, 52: { emoji: "👩‍👦", nombre: "Madre" }, 53: { emoji: "⛵", nombre: "Barco" },
  54: { emoji: "🐄", nombre: "Vaca" }, 55: { emoji: "🎵", nombre: "Música" }, 56: { emoji: "🤕", nombre: "Caída" },
  57: { emoji: "🏃", nombre: "Jorobado" }, 58: { emoji: "💦", nombre: "Ahogado" }, 59: { emoji: "🌱", nombre: "Plantas" },
  60: { emoji: "🧝", nombre: "Virgen" }, 61: { emoji: "🔫", nombre: "Escopeta" }, 62: { emoji: "🌊", nombre: "Inundación" },
  63: { emoji: "💒", nombre: "Casamiento" }, 64: { emoji: "😢", nombre: "Llanto" }, 65: { emoji: "🎯", nombre: "Cazador" },
  66: { emoji: "🪱", nombre: "Lombrices" }, 67: { emoji: "🐍", nombre: "Víbora" }, 68: { emoji: "👶", nombre: "Sobrinos" },
  69: { emoji: "😈", nombre: "Vicios" }, 70: { emoji: "💀", nombre: "Muerto sueño" }, 71: { emoji: "💩", nombre: "Excremento" },
  72: { emoji: "🎁", nombre: "Sorpresa" }, 73: { emoji: "🏥", nombre: "Hospital" }, 74: { emoji: "🏿", nombre: "Gente negra" },
  75: { emoji: "💋", nombre: "Besos" }, 76: { emoji: "🔥", nombre: "Fuego" }, 77: { emoji: "🦵", nombre: "Pierna" },
  78: { emoji: "💃", nombre: "Ramera" }, 79: { emoji: "🦹", nombre: "Ladrón" }, 80: { emoji: "🎱", nombre: "Bochas" },
  81: { emoji: "💐", nombre: "Flores" }, 82: { emoji: "🥊", nombre: "Pelea" }, 83: { emoji: "⛈️", nombre: "Mal tiempo" },
  84: { emoji: "⛪", nombre: "Iglesia" }, 85: { emoji: "🔦", nombre: "Linterna" }, 86: { emoji: "💨", nombre: "Humo" },
  87: { emoji: "🦟", nombre: "Piojos" }, 88: { emoji: "🥔", nombre: "Papas" }, 89: { emoji: "🐀", nombre: "Rata" },
  90: { emoji: "😱", nombre: "Miedo" }, 91: { emoji: "🏕️", nombre: "Excursión" }, 92: { emoji: "👨‍⚕️", nombre: "Médico" },
  93: { emoji: "💕", nombre: "Enamorado" }, 94: { emoji: "🪦", nombre: "Cementerio" }, 95: { emoji: "👓", nombre: "Anteojos" },
  96: { emoji: "👨", nombre: "Marido" }, 97: { emoji: "🍽️", nombre: "Mesa" }, 98: { emoji: "👕", nombre: "Lavandera" },
  99: { emoji: "👦", nombre: "Hermano" }
};

function pad(n: number, l = 2): string {
  return String(n).padStart(l, '0');
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const turno = searchParams.get('turno') || 'todos';
  const dias = parseInt(searchParams.get('dias') || '90');

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

    const rows: any[] = await res.json();
    if (!rows?.length) {
      return NextResponse.json({ error: 'Sin datos disponibles' }, { status: 500 });
    }

    const sorteos = rows
      .filter((row: any) => Array.isArray(row.numbers) && row.numbers.length >= 20)
      .map((row: any) => ({
        fecha: row.date,
        turno: row.turno,
        numbers: row.numbers.map((n: any) => Number(n)).filter((n: number) => !isNaN(n) && n >= 0 && n <= 9999)
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
      probabilidad: (p as any).probabilidad || 0
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
  } catch (e: any) {
    clearTimeout(to);
    const err = e as { name?: string; message?: string };
    logger.error('[AnalisisAvanzado] Error:', { error: err?.message || String(e) });
    return NextResponse.json({ error: 'Error en análisis' }, { status: 500 });
  }
}