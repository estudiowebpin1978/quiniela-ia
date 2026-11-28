/**
 * Helpers de fecha genéricos (zona ART) compartidos por toda la app.
 */

const fmtFecha = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Argentina/Buenos_Aires",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Fecha de hoy en Argentina ("YYYY-MM-DD"). */
export function hoyArgentina(): string {
  return fmtFecha.format(new Date());
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
