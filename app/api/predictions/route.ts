/**
 * API de predicciones de Quiniela IA.
 * 
 * Endpoint principal: GET /api/predictions?sorteo=Nocturna&date=2026-06-01
 * 
 * Calcula 12 factores estadísticos en tiempo real desde Supabase,
 * integra modelos ML (Markov, Random Forest, Neural) cacheados,
 * y aplica boost desde XGBoost Python exportado.
 * 
 * Factores:
 *   1. Frecuencia absoluta    7. Correlación entre turnos
 *   2. Posiciones             8. Co-ocurrencia
 *   3. Ausencias              9. Números calientes
 *   4. Recencia               10. Números atrasados
 *   5. Tendencia              11. Paridad
 *   6. Ciclos                 12. Suma de dígitos
 *   + Cross-turno, XGBoost Python, ML cache, FastAPI externo
 */

import { NextRequest, NextResponse } from "next/server"
import { analisisCrossTurno } from "@/lib/analisis/cross-turno"
import { calcularPesosDinamicos, PesosDinamicos } from "@/lib/analisis/weights"
import { calibrarConfianza, recalibrar } from "@/lib/analisis/calibration"

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
}

function pad(n: number, l = 2): string {
  return String(n).padStart(l, '0')
}

// ============================================
// 12 FACTORES DE ANÁLISIS
// ============================================

// Factor 1: Frecuencia absoluta
function analisisFrecuencia(terminaciones: number[]): Record<number, number> {
  const freq: Record<number, number> = {}
  for (const t of terminaciones) {
    freq[t] = (freq[t] || 0) + 1
  }
  return freq
}

// Factor 2: Frecuencia por posición (miles, centenas, decenas, unidades)
function analisisPosiciones(numeros4: number[]): { miles: number[], centenas: number[], decenas: number[], unidades: number[] } {
  const miles = new Array(10).fill(0)
  const centenas = new Array(10).fill(0)
  const decenas = new Array(10).fill(0)
  const unidades = new Array(10).fill(0)
  
  for (const n of numeros4) {
    const s = String(n).padStart(4, '0')
    miles[parseInt(s[0])]++
    centenas[parseInt(s[1])]++
    decenas[parseInt(s[2])]++
    unidades[parseInt(s[3])]++
  }
  
  return { miles, centenas, decenas, unidades }
}

// Factor 3: Análisis de ausencias (tiempo sin aparecer)
function analisisAusencias(sequences: number[][]): { ultimoIdx: Record<number, number>, maxIdx: number } {
  const ultimoIdx: Record<number, number> = {}
  let maxIdx = 0
  
  sequences.forEach((seq, idx) => {
    seq.forEach(n => {
      const t = n % 100
      ultimoIdx[t] = idx
      if (idx > maxIdx) maxIdx = idx
    })
  })
  
  return { ultimoIdx, maxIdx }
}

// Factor 4: Análisis de recencia (apariciones recientes)
function analisisRecencia(sequences: number[][], ultimosN: number): Record<number, number> {
  const recencia: Record<number, number> = {}
  const ultimos = sequences.slice(-ultimosN)
  
  for (const seq of ultimos) {
    for (const n of seq) {
      const t = n % 100
      recencia[t] = (recencia[t] || 0) + 1
    }
  }
  
  return recencia
}

// Factor 5: Tendencia (comparación período reciente vs anterior)
function analisisTendencia(sequences: number[][], diasRecientes: number, diasAnterior: number): Record<number, number> {
  const tendencia: Record<number, number> = {}
  
  const reciente = sequences.slice(-diasRecientes)
  const anterior = sequences.slice(-diasRecientes - diasAnterior, -diasRecientes)
  
  const freqReciente: Record<number, number> = {}
  const freqAnterior: Record<number, number> = {}
  
  for (const seq of reciente) {
    for (const n of seq) {
      const t = n % 100
      freqReciente[t] = (freqReciente[t] || 0) + 1
    }
  }
  
  for (const seq of anterior) {
    for (const n of seq) {
      const t = n % 100
      freqAnterior[t] = (freqAnterior[t] || 0) + 1
    }
  }
  
  for (let t = 0; t < 100; t++) {
    const r = freqReciente[t] || 0
    const a = freqAnterior[t] || 1
    tendencia[t] = ((r / diasRecientes) - (a / diasAnterior)) * 100
  }
  
  return tendencia
}

// Factor 6: Análisis de ciclos (apariciones periódicas)
function analisisCiclos(sequences: number[][]): Record<number, { promedio: number, ultimo: number }> {
  const ciclos: Record<number, number[]> = {}
  const ultimoIdx: Record<number, number> = {}
  
  sequences.forEach((seq, idx) => {
    seq.forEach(n => {
      const t = n % 100
      if (!ciclos[t]) ciclos[t] = []
      ciclos[t].push(idx)
      ultimoIdx[t] = idx
    })
  })
  
  const result: Record<number, { promedio: number, ultimo: number }> = {}
  const maxIdx = sequences.length - 1
  
  for (const t of Object.keys(ciclos)) {
    const indices = ciclos[parseInt(t)]
    if (indices.length > 1) {
      let sumaDistancias = 0
      for (let i = 1; i < indices.length; i++) {
        sumaDistancias += indices[i] - indices[i-1]
      }
      result[parseInt(t)] = {
        promedio: Math.round(sumaDistancias / (indices.length - 1) * 10) / 10,
        ultimo: maxIdx - ultimoIdx[parseInt(t)]
      }
    }
  }
  
  return result
}

// Factor 7: Correlación entre turnos
function analisisCorrelacionTurnos(rows: any[]): Record<string, Record<number, number>> {
  const turnos = ['previa', 'primera', 'matutina', 'vespertina', 'nocturna']
  const correlacion: Record<string, Record<number, number>> = {}
  
  for (const turno of turnos) {
    const filtro = rows.filter((r: any) => r.turno && r.turno.toLowerCase().includes(turno))
    const freq: Record<number, number> = {}
    
    for (const row of filtro) {
      if (Array.isArray(row.numbers)) {
        for (const n of row.numbers) {
          const t = Number(n) % 100
          freq[t] = (freq[t] || 0) + 1
        }
      }
    }
    
    correlacion[turno] = freq
  }
  
  return correlacion
}

// Factor 8: Matriz de co-ocurrencia (qué números aparecen juntos)
function analisisCoocurrencia(sequences: number[][]): Record<string, number> {
  const cooc: Record<string, number> = {}
  
  for (const seq of sequences) {
    const unicos = [...new Set(seq.map(n => n % 100))]
    for (let i = 0; i < unicos.length; i++) {
      for (let j = i + 1; j < unicos.length; j++) {
        const key = `${Math.min(unicos[i], unicos[j])}-${Math.max(unicos[i], unicos[j])}`
        cooc[key] = (cooc[key] || 0) + 1
      }
    }
  }
  
  return cooc
}

// Factor 9: Números calientes (alta frecuencia reciente)
function numerosCalientes(recencia: Record<number, number>, threshold: number): number[] {
  const entries = Object.entries(recencia)
    .map(([k, v]) => ({ num: parseInt(k), freq: v }))
    .filter(x => x.freq >= threshold)
    .sort((a, b) => b.freq - a.freq)
  
  return entries.slice(0, 10).map(x => x.num)
}

// Factor 10: Números atrasados (mucho tiempo sin aparecer)
function numerosAtrasados(ultimoIdx: Record<number, number>, maxIdx: number, threshold: number): number[] {
  const entries = Object.entries(ultimoIdx)
    .map(([k, v]) => ({ num: parseInt(k), ausente: maxIdx - v }))
    .filter(x => x.ausente >= threshold)
    .sort((a, b) => b.ausente - a.ausente)
  
  return entries.slice(0, 10).map(x => x.num)
}

// Factor 11: Análisis de terminaciones (pares/impares)
function analisisParidad(terminaciones: number[]): { pares: number, impares: number } {
  let pares = 0
  let impares = 0
  for (const t of terminaciones) {
    if (t % 2 === 0) {
      pares++
    } else {
      impares++
    }
  }
  return { pares, impares }
}

// Factor 12: Suma de dígitos (patrón de suma)
function analisisSumaDigitos(terminaciones: number[]): Record<number, number> {
  const suma: Record<number, number> = {}
  for (const t of terminaciones) {
    const digitos = String(t).padStart(2, '0')
    const s = parseInt(digitos[0]) + parseInt(digitos[1])
    suma[s] = (suma[s] || 0) + 1
  }
  return suma
}

// ============================================
// CÁLCULO DE SCORE MULTIVARIABLE
// ============================================
interface DatosDoceFactores {
  num: number; freq: number; totalFreq: number; recencia: number;
  tendencia: number; coocurrencia: number; ultimoIdx: number; maxIdx: number;
  ciclo: { promedio: number; ultimo: number } | undefined;
  digitos: number[]; posiciones: { miles: number[]; centenas: number[]; decenas: number[]; unidades: number[] };
  esCaliente: boolean; esAtrasado: boolean;
  freqTurno: Record<number, number>; freqTurnoTotal: number;
  paridadMayoritaria: 'par' | 'impar';
  sumaDigitosTop: Set<number>;
}

function calcularScore(d: DatosDoceFactores): { score: number; confianza: number; factores: string[] } {
  const factores: string[] = [];
  let score = 0;

  // 1. Frecuencia (18%)
  const scoreFreq = d.freq / d.totalFreq * 100;
  score += scoreFreq * 0.18;
  if (scoreFreq > 3) factores.push(`Freq: ${d.freq}`);

  // 2. Posicion (10%): compara digitos del numero con los mas frecuentes
  const tens = Math.floor(d.num / 10), units = d.num % 10;
  const topDec = d.posiciones.decenas.slice(0, 3);
  const topUni = d.posiciones.unidades.slice(0, 3);
  let aciertosPos = 0;
  if (topDec.includes(tens)) aciertosPos++;
  if (topUni.includes(units)) aciertosPos++;
  const scorePos = aciertosPos === 2 ? 90 : aciertosPos === 1 ? 60 : 30;
  score += scorePos * 0.10;
  if (aciertosPos > 0 && !factores.some(f => f.startsWith("Freq"))) factores.push(`Posición favorable`);

  // 3. Recencia (14%)
  const scoreRecencia = Math.min(100, d.recencia * 10);
  score += scoreRecencia * 0.14;
  if (d.recencia > 3) factores.push(`Reciente: ${d.recencia}`);

  // 4. Tendencia (10%)
  const scoreTendencia = d.tendencia > 0 ? 50 + Math.min(50, d.tendencia * 10) : 50 - Math.min(50, Math.abs(d.tendencia) * 5);
  score += scoreTendencia * 0.10;
  if (d.tendencia > 10) factores.push(`Sube: +${Math.round(d.tendencia)}%`);
  else if (d.tendencia < -10) factores.push(`Baja: ${Math.round(d.tendencia)}%`);

  // 5. Ciclo (10%)
  if (d.ciclo) {
    const esperado = d.ciclo.ultimo - d.ciclo.promedio;
    score += (esperado >= -2 ? 70 : 30) * 0.10;
    if (esperado >= -2) factores.push(`Ciclo favorable`);
  } else score += 40 * 0.10;

  // 6. Co-ocurrencia (8%)
  score += Math.min(100, d.coocurrencia * 5) * 0.08;
  if (d.coocurrencia > 3) factores.push(`Co-ocurre: ${d.coocurrencia}`);

  // 7. Ausencia (8%)
  const ausencia = d.maxIdx - d.ultimoIdx;
  const scoreAus = ausencia < 5 ? 80 : ausencia < 15 ? 50 : 20;
  score += scoreAus * 0.08;
  if (ausencia > 15) factores.push(`Ausente: ${ausencia}`);

  // 8. Caliente (5%)
  if (d.esCaliente) { score += 80 * 0.05; factores.push(`Caliente`); }
  else score += 30 * 0.05;

  // 9. Atrasado (5%)
  if (d.esAtrasado) score += 20 * 0.05;
  else score += 60 * 0.05;

  // 10. Correlacion turno (5%)
  const freqTurnoNum = d.freqTurno[d.num] || 0;
  const scoreTurno = d.freqTurnoTotal > 0 ? Math.min(100, (freqTurnoNum / d.freqTurnoTotal) * 10000) : 40;
  score += scoreTurno * 0.05;

  // 11. Paridad (4%)
  const esPar = d.num % 2 === 0;
  if ((d.paridadMayoritaria === 'par' && esPar) || (d.paridadMayoritaria === 'impar' && !esPar))
    score += 70 * 0.04;
  else score += 30 * 0.04;

  // 12. Suma digitos (3%)
  const sumaDig = Math.floor(d.num / 10) + (d.num % 10);
  if (d.sumaDigitosTop.has(sumaDig)) score += 80 * 0.03;
  else score += 30 * 0.03;

  const confianza = Math.min(95, Math.round(score));
  return { score: Math.round(score * 100) / 100, confianza, factores };
}

// ============================================
// MAIN API
// ============================================
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const turno = searchParams.get("sorteo") || "previa"
  const targetDate = searchParams.get("date") || ""

  const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
  const SK = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/"/g, "").trim()

  if (!SB || !SK) {
    return NextResponse.json({ error: "Configuración incompleta" }, { status: 500 })
  }

  const turnosValidos = ["previa", "primera", "matutina", "vespertina", "nocturna"]
  const turnoQuery = turno.toLowerCase()
  
  if (!turnosValidos.includes(turnoQuery)) {
    return NextResponse.json({ error: `Sorteo inválido. Válidos: ${turnosValidos.join(", ")}` }, { status: 400 })
  }

  // Recalibrar curva de confianza desde datos reales
  recalibrar().catch(() => {})

  const ctrl = new AbortController()
  const to = setTimeout(() => ctrl.abort(), 25000)

  try {
    // Filter by target date: only use draws BEFORE the prediction date
    const dateFilter = targetDate ? `&date=lt.${targetDate}` : ""
    const url = `${SB}/rest/v1/draws?select=date,turno,numbers&turno=ilike.*${turnoQuery}*&order=date.desc&limit=10000${dateFilter}`
    const res = await fetch(url, { 
      headers: { "apikey": SK, "Authorization": `Bearer ${SK}` }, 
      signal: ctrl.signal 
    })
    clearTimeout(to)
    if (!res.ok) return NextResponse.json({ error: `Error: ${res.status}` }, { status: 500 })

    const rows = await res.json()
    if (!rows?.length) return NextResponse.json({ error: `Sin datos para turno ${turnoQuery}` }, { status: 500 })

    // Extraer secuencias válidas
    const sequences: number[][] = []
    const dates: string[] = []
    
    for (const row of rows) {
      if (Array.isArray(row.numbers) && row.numbers.length >= 20) {
        const nums4 = row.numbers.map((n: number) => Number(n)).filter((n: number) => !isNaN(n) && n >= 0 && n <= 9999)
        if (nums4.length >= 20) {
          sequences.push(nums4)
          dates.push(row.date)
        }
      }
    }

    if (!sequences.length) return NextResponse.json({ error: "Sin secuencias válidas" }, { status: 500 })

    // Extraer datos
    const terminaciones2: number[] = []
    const terminaciones3: number[] = []
    const numeros4: number[] = []
    
    for (const seq of sequences) {
      for (const n of seq) {
        if (typeof n === 'number' && n >= 0 && n <= 9999) {
          terminaciones2.push(n % 100)
          terminaciones3.push(n % 1000)
          numeros4.push(n)
        }
      }
    }

    // === APLICAR LOS 12 FACTORES ===
    
    // Factor 1: Frecuencia
    const freq = analisisFrecuencia(terminaciones2)
    
    // Factor 2: Posiciones
    const posiciones = analisisPosiciones(numeros4)
    
    // Factor 3: Ausencias
    const { ultimoIdx, maxIdx } = analisisAusencias(sequences)
    
    // Factor 4: Recencia (últimos 7 sorteos)
    const recencia = analisisRecencia(sequences, 7)
    
    // Factor 5: Tendencia (últimos 7 vs anteriores 7)
    const tendencia = analisisTendencia(sequences, 7, 7)
    
    // Factor 6: Ciclos
    const ciclos = analisisCiclos(sequences)
    
    // Factor 7: Correlación entre turnos
    const correlacionTurnos = analisisCorrelacionTurnos(rows)
    
    // Factor 8: Co-ocurrencia
    const coocurrencia = analisisCoocurrencia(sequences)
    
    // Factor 9: Números calientes
    const calientes = numerosCalientes(recencia, 5)
    
    // Factor 10: Números atrasados
    const atrasados = numerosAtrasados(ultimoIdx, maxIdx, 15)
    
    // Factor 11: Paridad
    const paridad = analisisParidad(terminaciones2)
    
    // Factor 12: Suma de dígitos
    const sumaDigitos = analisisSumaDigitos(terminaciones2)

    // === FACTOR 13: ANÁLISIS CROSS-TURNO ===
    let crossTurnoScore: Record<number, number> = {}
    try { crossTurnoScore = (await analisisCrossTurno(turno, 3, targetDate || undefined)).crossTurnoScore } catch {}

    // === PESOS DINÁMICOS (auto-optimizados) ===
    let pesosDinamicos: PesosDinamicos | null = null
    try { pesosDinamicos = await calcularPesosDinamicos(turnoQuery) } catch {}

    // === CALCULAR SCORES PARA CADA NÚMERO (12 FACTORES + CROSS-TURNO) ===
    const scores: { num: number, score: number, confianza: number, factores: string[], frecuencia: number, crossTurno: number, pesoAjustado: number }[] = []

    const topDecenas = posiciones.decenas.map((v, i) => ({ d: i, v })).sort((a, b) => b.v - a.v);
    const topUnidades = posiciones.unidades.map((v, i) => ({ d: i, v })).sort((a, b) => b.v - a.v);
    const setCalientes = new Set(calientes);
    const setAtrasados = new Set(atrasados);
    const freqTurnoActual = correlacionTurnos[turnoQuery] || {};
    const freqTurnoTotal = Object.values(freqTurnoActual).reduce((a, b) => a + b, 1);
    const paridadMayoritaria = paridad.pares >= paridad.impares ? 'par' : 'impar';
    const sumaDigitosTop = new Set(
      Object.entries(sumaDigitos).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => parseInt(k))
    );

    for (let n = 0; n < 100; n++) {
      const result = calcularScore({
        num: n,
        freq: freq[n] || 0, totalFreq: terminaciones2.length,
        recencia: recencia[n] || 0,
        tendencia: tendencia[n] || 0,
        coocurrencia: Object.entries(coocurrencia)
          .filter(([k]) => k.includes(`-${n}`) || k.includes(`${n}-`))
          .reduce((sum, [, v]) => sum + v, 0),
        ultimoIdx: ultimoIdx[n] || 0, maxIdx,
        ciclo: ciclos[n],
        digitos: [Math.floor(n / 10), n % 10],
        posiciones: {
          miles: posiciones.miles, centenas: posiciones.centenas,
          decenas: topDecenas.map(x => x.d), unidades: topUnidades.map(x => x.d)
        },
        esCaliente: setCalientes.has(n),
        esAtrasado: setAtrasados.has(n),
        freqTurno: freqTurnoActual, freqTurnoTotal,
        paridadMayoritaria,
        sumaDigitosTop
      });

      const crossBoost = crossTurnoScore[n] || 0
      let ajustePeso = 1
      if (pesosDinamicos) {
        const baseSum = Object.values(pesosDinamicos).reduce((a, b) => a + b, 0)
        ajustePeso = baseSum > 0 ? 1 + (pesosDinamicos.frecuencia - 0.15) * 0.5 : 1
        ajustePeso = Math.max(0.85, Math.min(1.15, ajustePeso))
      }

      const scoreFinal = result.score * ajustePeso + crossBoost

      scores.push({
        num: n,
        score: scoreFinal,
        confianza: calibrarConfianza(scoreFinal, result.confianza),
        factores: [...result.factores, ...(crossBoost > 0 ? [`Cross: +${crossBoost}`] : [])],
        frecuencia: freq[n] || 0,
        crossTurno: crossBoost,
        pesoAjustado: Math.round(ajustePeso * 100) / 100
      });
    }

    // Ordenar por score
    scores.sort((a, b) => b.score - a.score)

    // Top 10 de 2 cifras
    const pred2 = scores.slice(0, 10).map(s => pad(s.num))

    // === Análisis de 4 cifras vía motor para 3 y 4 cifras ===
    const sorteos = rows
      .filter((row: any) => Array.isArray(row.numbers) && row.numbers.length >= 20)
      .map((row: any) => ({
        fecha: row.date,
        turno: row.turno || turnoQuery,
        numbers: row.numbers.map((n: any) => Number(n)).filter((n: number) => !isNaN(n) && n >= 0 && n <= 9999)
      }))
    const { ejecutarAnalisisCompleto } = await import("@/lib/analisis/motor")
    const analisisAv = ejecutarAnalisisCompleto(sorteos, { topNRanking: 15 })

    // === ENSEMBLE: Integrar ML cacheado (TypeScript) ===
    try {
      const { getModelos } = await import("@/lib/ml/cache")
      const cached = getModelos(turnoQuery)
      if (cached && cached.length > 0) {
        const ordenados = [...sorteos].sort((a: any, b: any) =>
          new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
        ).filter((s: any) => Array.isArray(s.numbers) && s.numbers.length > 0)
        const { prepararPrediccion } = await import("@/lib/ml/trainer")
        const vectorPred = prepararPrediccion(ordenados)
        const primerosDraws = ordenados.map((s: any) => s.numbers[0] % 100)

        const { predecirSiguienteMarkov } = await import("@/lib/ml/markov")
        const { predecirRandomForest } = await import("@/lib/ml/random-forest")
        const { predecirMultipleClases } = await import("@/lib/ml/neural")

        for (const modelo of cached) {
          const mlTop = new Set<number>()
          if (modelo.tipo === "markov") {
            const estado = [primerosDraws[primerosDraws.length - 2], primerosDraws[primerosDraws.length - 1]]
            const pred = predecirSiguienteMarkov(modelo.modelo as any, estado, 10)
            for (const p of pred.topK) mlTop.add(p.estado)
          } else if (modelo.tipo === "random-forest") {
            const pred = predecirRandomForest(modelo.modelo as any, vectorPred)
            const sorted = pred.probabilidades.map((p: number, i: number) => ({ n: i, p })).sort((a: any, b: any) => b.p - a.p)
            for (const x of sorted.slice(0, 10)) mlTop.add(x.n)
          } else if (modelo.tipo === "neural") {
            const pred = predecirMultipleClases(modelo.modelo as any, vectorPred, 10)
            for (const p of pred) mlTop.add(p.clase)
          }
          for (const s of scores) {
            if (mlTop.has(s.num)) s.score += 3
          }
        }
        scores.sort((a, b) => b.score - a.score)
      }
    } catch {}

    // === ENSEMBLE: Integrar modelos exportados desde Python (XGBoost / RF) ===
    let boostPythonActivo = false
    try {
      const { obtenerBoostPython } = await import("@/lib/ml/python_model_loader")
      const boostXGB = obtenerBoostPython(turnoQuery, "xgboost")
      if (boostXGB) {
        boostPythonActivo = true
        for (const s of scores) {
          const b = boostXGB[s.num] || 0
          if (b > 0) s.score += Math.min(8, b / 10)
        }
        scores.sort((a, b) => b.score - a.score)
      }
    } catch {}

    // === ENSEMBLE: FastAPI ML backend (si está disponible) ===
    let mlApiActivo = false
    try {
      const mlApiUrl = process.env.ML_API_URL
      if (mlApiUrl) {
        mlApiActivo = true
        const mlRes = await fetch(`${mlApiUrl}/predict?turno=${turnoQuery}&top=10`, { signal: AbortSignal.timeout(5000) })
        if (mlRes.ok) {
          const mlData = await mlRes.json()
          if (mlData?.scores_completos) {
            for (const s of scores) {
              const boost = mlData.scores_completos[String(s.num).padStart(2, "0")] || 0
              if (boost > 0) s.score += Math.min(10, boost / 5)
            }
            scores.sort((a, b) => b.score - a.score)
          }
        }
      }
    } catch {}

    const pred3 = analisisAv.recomendaciones.tresCifras.slice(0, 10).map(r => r.numero.padStart(3, '0'))
    const pred4 = analisisAv.recomendaciones.cuatroCifras.slice(0, 10).map(r => r.numero.padStart(4, '0'))

    // Top 10 con información completa
    const top20 = scores.slice(0, 10).map((s, i) => ({
      n: s.num, numero: pad(s.num),
      emoji: SUENOS[s.num]?.emoji || "❓",
      significado: SUENOS[s.num]?.nombre || "",
      score: s.score, confianza: s.confianza, rank: i + 1,
      frecuencia: s.frecuencia, factores: s.factores
    }))

    // Redoblona (dos mejores score de 2 cifras)
    const redoblona = scores.length >= 2 
      ? `${pad(scores[0].num)}-${pad(scores[1].num)}`
      : "00-00"

    // Heatmap
    const heatmap = scores.slice(0, 10).map(s => ({
      n: s.num, f: s.frecuencia,
      s: SUENOS[s.num] || { emoji: "❓", nombre: "" },
      pct: Math.round((s.frecuencia / terminaciones2.length) * 10000) / 100
    }))

    const uniqueDates = [...new Set(dates)].sort().reverse()
    const confidence = Math.round((scores.slice(0, 10).reduce((sum, s) => sum + s.confianza, 0) / 10))

    console.log(`[12 FACTORES] Total números: ${numeros4.length}, Sorteos: ${sequences.length}`)
    console.log(`[12 FACTORES] Top 3: ${scores.slice(0, 3).map(s => `${s.num}:${s.score.toFixed(2)}`).join(', ')}`)

    return NextResponse.json({
      ok: true,
      turno: turnoQuery,
      debug: {
        factores_aplicados: 13,
        pesos_dinamicos: pesosDinamicos ? Object.fromEntries(Object.entries(pesosDinamicos).map(([k, v]) => [k, +(v * 100).toFixed(1)])) : null,
        cross_turno_activo: Object.values(crossTurnoScore).some(v => v > 0),
        calibracion_aplicada: true,
        modelos_python_activos: boostPythonActivo,
        ml_api_externa_activa: mlApiActivo,
        total_numeros: terminaciones2.length,
        numeros_unicos: Object.keys(freq).length,
        sorteos_analizados: sequences.length,
        fechas_unicas: uniqueDates.length,
        numeros_calientes: calientes.map(n => pad(n)),
        numeros_atrasados: atrasados.map(n => pad(n)),
        paridad: paridad
      },
      numeros: top20,
      totalSorteos: sequences.length,
      fechasAnalizadas: uniqueDates.length,
      generado: new Date().toISOString(),
      confidence,
      pred: {
        numeros_2: pred2,
        numeros_3: pred3,
        numeros_4: pred4,
        redoblona: redoblona,
      },
      redoblona: redoblona,
      heatmap,
      stats: {
        totalNumeros: terminaciones2.length,
        promedioPorSorteo: (terminaciones2.length / sequences.length).toFixed(2),
        numeroMasFrecuente: { numero: pad(scores[0]?.num || 0), frecuencia: scores[0]?.frecuencia || 0, significado: SUENOS[scores[0]?.num || 0]?.nombre || "" },
        terminacionesMasFrecuentes: scores.slice(0, 5).map(s => ({ terminacion: s.num, frecuencia: s.frecuencia, score: s.score.toFixed(2) })),
      },
      analysisInfo: {
        metodo: `12 factores en tiempo real desde BD + XGBoost Python + ML cache + pesos dinámicos + calibración - turno ${turnoQuery.toUpperCase()}`,
        factores: [
          "1. Frecuencia absoluta",
          "2. Posiciones (miles/centenas/decenas/unidades)",
          "3. Ausencias (tiempo sin aparecer)",
          "4. Recencia (apariciones recientes)",
          "5. Tendencia (comparación períodos)",
          "6. Ciclos (patrones periódicos)",
          "7. Correlación entre turnos",
          "8. Co-ocurrencia (números juntos)",
          "9. Números calientes",
          "10. Números atrasados",
          "11. Paridad (pares/impares)",
          "12. Suma de dígitos",
          "13. Cross-turno (arrastre entre turnos)",
          "14. XGBoost (Python - exportado)",
          "15. FastAPI ML backend (externo)"
        ],
        datosUtilizados: `${sequences.length} sorteos con ${terminaciones2.length} terminaciones de 2 cifras + ${sorteos.length} sorteos para scoring de 3/4 cifras`,
        confianzaAvanzada: {
          promedioGeneral: analisisAv.resumen.promedioConfianza,
          enCicloFavorable: analisisAv.ciclos.numerosEnCicloFavorables.slice(0, 10).map(n => pad(n)),
          evitar: analisisAv.recomendaciones.evitar.slice(0, 10).map(n => pad(n))
        }
      }
    })
  } catch (e: unknown) {
    clearTimeout(to)
    const err = e as { name?: string; message?: string }
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 })
  }
}