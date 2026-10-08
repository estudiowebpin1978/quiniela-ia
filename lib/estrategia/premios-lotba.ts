/**
 * Premios OFICIALES de la Quiniela Provincial (LOTBA) + EV honesto.
 *
 * FUENTES PRIMARIAS (verificadas 2026-10-08):
 *   - loteria.gba.gob.ar (sitio oficial LOTBA): 5 sorteos diarios, extracto
 *     20 números 0000-9999, apuesta mínima $100 (máx $5.000), multiplicadores
 *     "siete, setenta, seiscientos o tres mil quinientas veces".
 *   - Resolución N° 1992-2018 (normas.gba.gob.ar, Boletín Oficial PBA),
 *     Art. 18: tabla de premios "incluido el monto de la suma apostada":
 *       1 cifra 7× · 2 cifras 70× · 3 cifras 600× · 4 cifras 3500× ·
 *       5 cifras 10000× · redoblona 2 cifras 80× en ambas posturas.
 *
 * REGLAS DE HONESTIDAD:
 *   - El multiplicador INCLUYE la apuesta (Art. 18): recibir = mult × apuesta.
 *   - EV = P(ganar) × recibido − apuesta. casi siempre NEGATIVO (es el borde
 *     de la casa); eso es el resultado honesto, no un bug.
 *   - "5 cifras": figura en la resolución pero NO aplica al extracto actual
 *     (0000-9999 = 4 cifras) → `aplicable: false`, sin probabilidad inventada.
 *   - Poceada: NO está aquí — sus premios son POZO/parimutuel (varían por
 *     sorteo) y requieren programa de premios aparte. Queda "pendiente".
 *
 * Probabilidades: "directa a la cabeza" = tu número k-cifras coincide con los
 * últimos k dígitos del primer premio → P = 1/10^k (exacto, cabeza uniforme).
 */

import type { ResultadoEV } from "./ev"
import { calcularEV } from "./ev"

/** Apuesta mínima oficial (sitio LOTBA, 2026). */
export const APUESTA_MINIMA_LOTBA = 100

/** Referencia de la fuente primaria + fecha de verificación. */
export const FUENTE_PREMIOS =
  "Resolución N° 1992-2018 Art. 18 (normas.gba.gob.ar) + loteria.gba.gob.ar — verificado 2026-10-08"

interface ModalidadOficial {
  codigo: string
  modalidad: string
  /** Multiplicador oficial × lo apostado (incluye la apuesta) */
  multiplicador: number
  /** Probabilidad exacta de ganar (directa a la cabeza). null si no aplica. */
  pGanar: number | null
  aplicable: boolean
  /** true si la prob. deriva de una regla no 100% confirmada para LOTBA */
  aproximado?: boolean
  nota?: string
}

/** P(directa a la cabeza, k cifras) = 1/10^k. */
const pCabezaCifras = (k: number): number => 1 / 10 ** k

/**
 * P(redoblona "cabeza y a los 5"): A en la posición 1 (cabeza) y B dentro de
 * las posiciones 2-5. Derivada de la regla estándar de quiniela (IPRA art. 22:
 * "2 cifras a la cabeza y otro a los cinco premios... entre el segundo y el
 * sexto lugar"). APROXIMADA para LOTBA: la resolución solo fija el pago (80×)
 * sin detallar la regla de posiciones → marcada `aproximado: true`.
 */
const pRedoblonaCabeza5 = (): number => {
  const pA = 1 / 100 // A = últimos 2 dígitos de la cabeza
  // P(B en posiciones 2-5): 4 posiciones, cada una ~uniforme 00-99 sobre 9999 restantes
  const pB = 1 - (1 - 100 / 9999) ** 4
  return pA * pB
}

const MODALIDADES: ModalidadOficial[] = [
  { codigo: "c1", modalidad: "1 cifra — directa a la cabeza", multiplicador: 7, pGanar: pCabezaCifras(1), aplicable: true },
  { codigo: "c2", modalidad: "2 cifras — directa a la cabeza", multiplicador: 70, pGanar: pCabezaCifras(2), aplicable: true },
  { codigo: "c3", modalidad: "3 cifras — directa a la cabeza", multiplicador: 600, pGanar: pCabezaCifras(3), aplicable: true },
  { codigo: "c4", modalidad: "4 cifras — directa a la cabeza", multiplicador: 3500, pGanar: pCabezaCifras(4), aplicable: true },
  {
    codigo: "c5",
    modalidad: "5 cifras — directa a la cabeza",
    multiplicador: 10000,
    pGanar: null,
    aplicable: false,
    nota: "En la resolución, pero el extracto actual es 0000-9999 (4 cifras): no hay 5ª cifra que acertar. Sin probabilidad (no se inventa).",
  },
  {
    codigo: "red5",
    modalidad: "Redoblona 2 cifras — cabeza y a los 5",
    multiplicador: 80,
    pGanar: pRedoblonaCabeza5(),
    aplicable: true,
    aproximado: true,
    nota: "Pago 80× oficial. Probabilidad APROXIMADA (regla estándar cabeza+pos2-5; LOTBA no detalla posiciones en la resolución).",
  },
]

/**
 * Tabla de EV de la Quiniela Provincial por modalidad oficial.
 * Fail-closed: `c5` devuelve ev=null (inapplicable) y Poceada no está (pozo).
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
      // recibido = multiplicador × apuesta (incluye la apuesta, Art. 18)
      premio: m.aplicable && m.pGanar != null ? m.multiplicador * apuesta : null,
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
      "Todas las modalidades tienen EV negativo (borde de la casa). " +
      "El return-rate (P × multiplicador) cae al subir las cifras: " +
      "1-2 cifras ~70%, 3 cifras ~60%, 4 cifras ~35%.",
  }
}
