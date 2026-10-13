/**
 * Premios OFICIALES de la Quiniela de la Ciudad (LOTBA — Lotería de la Ciudad
 * de Buenos Aires, ex Quiniela Nacional) + EV honesto.
 *
 * FUENTES PRIMARIAS (verificadas 2026-10-13):
 *   - quiniela.loteriadelaciudad.gob.ar (sitio oficial): "4 cifras → 3500 veces
 *     lo apostado · 3 cifras → 600 · 2 cifras → 70 · 1 cifra → 7"; juego de 1 a
 *     4 cifras (0000-9999), 20 ubicaciones por extracto.
 *   - Programación Mensual oficial OCTUBRE 2026 (PDF oficial LOTBA, descargable
 *     desde el sitio): "Los aciertos ... se abonarán ... incluido el monto de la
 *     apuesta": 1 cifra 7× · 2 cifras 70× · 3 cifras 600× · 4 cifras 3500×;
 *     VALOR DE LA APUESTA MÍNIMA $150 por extracto apostado; REDOBLONAS:
 *     Exacta 3500× · Redoblona 70× ("el cociente de cada apuesta"); TOPE DE
 *     BANCA (pago a prorrata si los aciertos superan 5× lo recaudado).
 *   - Reglamento, Resolución de Directorio N° 32/2018 (Boletín Oficial CABA,
 *     PE-RESDIC-MHGC-LOTBA-32-18): Art. 7 (redoblona exacta / por extensión),
 *     Art. 15 ("incluido el monto de la apuesta"), Art. 16 (Tope de Banca),
 *     Art. 18 (topes de acumulación de la extensión: 1500× / 2500× / 1800×).
 *
 * CORRECCIÓN 2026-10-13: antes citábamos la Resolución PBA 1992-2018 y
 * loteria.gba.gob.ar (Provincia de Buenos Aires) — jurisdicción equivocada para
 * este juego. Los multiplicadores directos (7/70/600/3500) coincidían, pero la
 * redoblona "80× cabeza y a los 5", el "5 cifras 10000×", la apuesta mínima
 * $100 y el máximo $5000 NO aplican a la Ciudad.
 *
 * REGLAS DE HONESTIDAD:
 *   - El multiplicador INCLUYE la apuesta (programación + Art. 15): recibir = mult × apuesta.
 *   - EV = P(ganar) × recibido − apuesta. casi siempre NEGATIVO (es el borde
 *     de la casa); eso es el resultado honesto, no un bug.
 *   - Tope de Banca: LOTBA puede pagar a prorrata → el EV asume pago íntegro.
 *   - "5 cifras": NO existe en el juego de la Ciudad (oficial: 1 a 4 cifras,
 *     0000-9999) → `aplicable: false`, sin probabilidad inventada.
 *   - Poceada: pendiente — la programación oficial SÍ la incluye
 *     (sección "QUINIELA POCEADA DE LA CIUDAD") pero aún no se transcribió
 *     aquí; sin datos inventados queda "pendiente".
 *
 * Probabilidades: "directa a la cabeza" = tu número k-cifras coincide con los
 * últimos k dígitos del primer premio → P = 1/10^k (cabeza uniforme).
 * Redoblona Exacta = ambas cifras en sus 2 ubicaciones → P = (1/100)² asumiendo
 * cabezas uniformes e independientes por ubicación (marcada `aproximado`).
 */

import type { ResultadoEV } from "./ev"
import { calcularEV } from "./ev"

/** Apuesta mínima oficial (Programación Mensual LOTBA oct-2026, verif. 2026-10-13). */
export const APUESTA_MINIMA_LOTBA = 150

/** Referencia de la fuente primaria + fecha de verificación. */
export const FUENTE_PREMIOS =
  "quiniela.loteriadelaciudad.gob.ar + Programación Mensual oficial oct-2026 (LOTBA) " +
  "+ Reglamento Res. Dir. 32/2018 (Boletín Oficial CABA) — verificado 2026-10-13"

interface ModalidadOficial {
  codigo: string
  modalidad: string
  /** Multiplicador oficial × lo apostado (incluye la apuesta). null = sin premio oficial. */
  multiplicador: number | null
  /** Probabilidad exacta de ganar (directa a la cabeza). null si no aplica. */
  pGanar: number | null
  aplicable: boolean
  /** true si la prob. deriva de una regla no 100% confirmada para la Ciudad */
  aproximado?: boolean
  nota?: string
}

/** P(directa a la cabeza, k cifras) = 1/10^k. */
const pCabezaCifras = (k: number): number => 1 / 10 ** k

/**
 * P(Redoblona Exacta): 2 números de 2 cifras en 2 ubicaciones específicas del
 * extracto → ambos deben acertar. (1/100)² = 1/10⁴ asumiendo cabezas
 * uniformes e independientes entre ubicaciones → `aproximado: true`.
 */
const pRedoblonaExacta = (): number => 1 / 10 ** 4

const MODALIDADES: ModalidadOficial[] = [
  { codigo: "c1", modalidad: "1 cifra — directa a la cabeza", multiplicador: 7, pGanar: pCabezaCifras(1), aplicable: true },
  { codigo: "c2", modalidad: "2 cifras — directa a la cabeza", multiplicador: 70, pGanar: pCabezaCifras(2), aplicable: true },
  { codigo: "c3", modalidad: "3 cifras — directa a la cabeza", multiplicador: 600, pGanar: pCabezaCifras(3), aplicable: true },
  { codigo: "c4", modalidad: "4 cifras — directa a la cabeza", multiplicador: 3500, pGanar: pCabezaCifras(4), aplicable: true },
  {
    codigo: "c5",
    modalidad: "5 cifras — directa a la cabeza",
    multiplicador: null,
    pGanar: null,
    aplicable: false,
    nota: "No existe en la Quiniela de la Ciudad: el juego oficial es de 1 a 4 cifras (0000-9999, 20 ubicaciones). El \"10000×\" era de la Resolución PBA 1992-2018 (jurisdicción equivocada, removida). Sin probabilidad (no se inventa).",
  },
  {
    codigo: "red-exacta",
    modalidad: "Redoblona Exacta — 2 cifras en 2 ubicaciones específicas",
    multiplicador: 3500,
    pGanar: pRedoblonaExacta(),
    aplicable: true,
    aproximado: true,
    nota: "Pago oficial 3500× (programación oct-2026, reglamento Art. 7 inc. c). Probabilidad APROXIMADA: asume ambas cabezas uniformes e independientes entre las 2 ubicaciones elegidas.",
  },
  {
    codigo: "red-extension",
    modalidad: "Redoblona por Extensión — 2 cifras en 2 rangos de ubicaciones",
    multiplicador: 70,
    pGanar: null,
    aplicable: true,
    nota: "Pago oficial \"SETENTA (70) VECES el cociente de cada apuesta\" (programación oct-2026). La probabilidad depende de los rangos de ubicación que elija el apostador (hasta/entre) → sin probabilidad fija no se calcula EV (no se inventa).",
  },
]

/**
 * Tabla de EV de la Quiniela de la Ciudad por modalidad oficial.
 * Fail-closed: `c5` y `red-extension` devuelven ev=null (sin prob/premio
 * computable) y Poceada no está (pendiente de transcripción).
 */
export function tablaEVQuiniela(apuesta: number = APUESTA_MINIMA_LOTBA): (ResultadoEV & {
  codigo: string
  multiplicador: number | null
  aplicable: boolean
  aproximado: boolean
  fuente: string
})[] {
  return MODALIDADES.map((m) => {
    const ev = calcularEV({
      modalidad: m.modalidad,
      kPicks: 1,
      pGanar: m.pGanar ?? 0,
      // recibido = multiplicador × apuesta (incluye la apuesta: programación + Art. 15)
      premio:
        m.aplicable && m.pGanar != null && m.multiplicador != null
          ? m.multiplicador * apuesta
          : null,
      costo: apuesta,
    })
    return {
      ...ev,
      codigo: m.codigo,
      multiplicador: m.aplicable ? m.multiplicador : null,
      aplicable: m.aplicable,
      aproximado: m.aproximado ?? false,
      ...(m.nota ? { motivoNoCalculable: m.nota } : {}),
      fuente: FUENTE_PREMIOS,
    }
  })
}

/**
 * Resumen honesto: la tendencia clave es que A MÁS CIFRAS, PEOR EV.
 * Devuelve el return-rate (P × multiplicador) por modalidad aplicable.
 */
export function resumenEVQuiniela(apuesta: number = APUESTA_MINIMA_LOTBA): {
  tabla: ReturnType<typeof tablaEVQuiniela>
  peorEV: string | null
  mejorEV: string | null
  observacion: string
} {
  const tabla = tablaEVQuiniela(apuesta)
  const aplicables = tabla.filter((r) => r.calculable && r.ev != null)
  const ordenado = [...aplicables].sort((a, b) => (a.ev ?? 0) - (b.ev ?? 0))
  return {
    tabla,
    peorEV: ordenado[0]?.modalidad ?? null,
    mejorEV: ordenado[ordenado.length - 1]?.modalidad ?? null,
    observacion:
      "Todas las modalidades calculables tienen EV negativo (borde de la casa). " +
      "El return-rate (P × multiplicador) cae al subir las cifras: " +
      "1-2 cifras ~70%, 3 cifras ~60%, 4 cifras y Redoblona Exacta ~35%. " +
      "El Tope de Banca (programación) puede pagar a prorrata y empeorar aún más ese retorno.",
  }
}
