/**
 * Fechas de sorteo de Poceada — helpers puros y testeables.
 *
 * Misma regla que la pantalla principal de Quiniela (predictions/page.tsx):
 * no hay sorteos los domingos ni feriados; si el día no tiene sorteo se avanza
 * al próximo día válido (máximo 7 días). Poceada sortea de lunes a sábado
 * a las 21:00 ART.
 *
 * Todas las fechas son "YYYY-MM-DD" y el cálculo usa siempre la zona horaria
 * Argentina (UTC-3), sin depender de la timezone del servidor.
 */

import { esFeriado } from "@/lib/feriados";

const fmtFecha = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Argentina/Buenos_Aires",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const fmtDia = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Argentina/Buenos_Aires",
  weekday: "short",
});

const DIA_SEMANA: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Día de la semana (0=domingo) de una fecha "YYYY-MM-DD" en zona ART. */
function diaDeFecha(fecha: string): number {
  const d = new Date(fecha + "T12:00:00-03:00");
  if (Number.isNaN(d.getTime())) return -1;
  return DIA_SEMANA[fmtDia.format(d)] ?? -1;
}

/** Fecha de hoy en Argentina ("YYYY-MM-DD"). */
export function hoyArgentina(): string {
  return fmtFecha.format(new Date());
}

/**
 * Fecha objetivo del próximo sorteo de Poceada.
 * Si hoy hay sorteo (lun-sáb no feriado) devuelve hoy; si no, el próximo
 * día válido (los domingos y feriados se saltan, incluidos feriados seguidos).
 */
export function fechaObjetivoPoceada(hoy: string = hoyArgentina()): string {
  if (diaDeFecha(hoy) !== 0 && !esFeriado(hoy)) return hoy;
  for (let i = 1; i <= 7; i++) {
    const base = new Date(hoy + "T12:00:00-03:00").getTime() + i * 86400000;
    const fecha = fmtFecha.format(new Date(base));
    if (diaDeFecha(fecha) === 0 || esFeriado(fecha)) continue;
    return fecha;
  }
  return hoy;
}

/** Etiqueta larga en español, p. ej. "viernes, 09/10/2026". */
export function fechaLarga(fecha: string): string {
  return new Date(fecha + "T12:00:00-03:00").toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
