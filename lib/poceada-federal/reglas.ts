/**
 * Poceada Federal (Lotería de Santa Fe) — reglas oficiales como helpers puros.
 *
 * Fuente: reglas oficiales de la Poceada Federal provistas por el operador
 * (2026-10-14). Resumen:
 *  - Se eligen 8 números del 00 al 99 (propios o selección automática en agencia).
 *  - Se juega de lunes a sábados con DOS sorteos diarios: matutino y nocturno.
 *  - El sorteo NOCTURNO se alterna según el mes:
 *      meses impares (ene, mar, may, jul, sep, nov) → Quiniela Nocturna de Santa Fe
 *      meses pares  (feb, abr, jun, ago, oct, dic)  → Tómbola / Quiniela Nocturna de Entre Ríos
 *  - Extracción: las 2 últimas cifras de los 20 premios del sorteo de quiniela
 *    correspondiente; si hay repetidos, extracciones adicionales hasta
 *    completar 20 números distintos.
 *  - Premios (juego poceado): 8 aciertos = 50% del pozo (o se acumula si no
 *    hay ganadores), 7 aciertos = 30%, 6 aciertos = 20%.
 */

/** Qué lotería rige el sorteo nocturno según el mes. */
export type LoteriaNocturna = "santa-fe" | "entre-rios";

const NOMBRES_MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
] as const;

/**
 * Período calendario en horario de Buenos Aires (mes 1-12 + año).
 * Usa el tz ART explícito: no depende del tz del usuario ni del servidor.
 */
export function periodoART(ref: Date = new Date()): { mes: number; anio: number } {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    month: "numeric",
    year: "numeric",
  }).formatToParts(ref);
  const mes = Number(partes.find((p) => p.type === "month")?.value);
  const anio = Number(partes.find((p) => p.type === "year")?.value);
  if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(anio)) {
    throw new Error("No se pudo determinar el período ART");
  }
  return { mes, anio };
}

/**
 * Lotería que rige el sorteo NOCTURNO según el mes calendario (1-12):
 * meses impares → Santa Fe; meses pares → Entre Ríos.
 */
export function loteriaNocturnaRigente(mes: number): LoteriaNocturna {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new Error(`Mes inválido: ${mes}`);
  }
  return mes % 2 === 1 ? "santa-fe" : "entre-rios";
}

/** Nombre en español del mes calendario (1-12). */
export function nombreMes(mes: number): string {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new Error(`Mes inválido: ${mes}`);
  }
  return NOMBRES_MESES[mes - 1];
}

/** Etiqueta completa de la lotería rigente (para mostrar en la UI). */
export function etiquetaLoteriaNocturna(loteria: LoteriaNocturna): string {
  return loteria === "santa-fe"
    ? "Quiniela Nocturna de Santa Fe"
    : "Tómbola / Quiniela Nocturna de Entre Ríos";
}
