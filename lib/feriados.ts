/**
 * Feriados argentinos — single source of truth.
 * Importado por predictions/page.tsx, cron-scrape, mis-predicciones, etc.
 */

const FERIADOS: Record<number, string[]> = {
  2026: [
    "2026-01-01", "2026-02-16", "2026-02-17", "2026-03-24",
    "2026-04-02", "2026-04-03", "2026-05-01", "2026-05-25",
    "2026-06-20", "2026-07-09", "2026-08-17", "2026-10-12",
    "2026-11-20", "2026-12-08", "2026-12-25",
  ],
  2027: [
    "2027-01-01", "2027-02-08", "2027-02-09", "2027-03-24",
    "2027-04-01", "2027-04-02", "2027-05-01", "2027-05-25",
    "2027-06-20", "2027-07-09", "2027-08-17", "2027-10-12",
    "2027-11-22", "2027-11-25", "2027-12-08", "2027-12-25",
  ],
};

export function esFeriado(dateStr: string): boolean {
  const year = parseInt(dateStr.slice(0, 4));
  return FERIADOS[year]?.includes(dateStr) ?? false;
}

export function esDiaSinSorteo(dateStr: string, diaSemana: number): boolean {
  if (diaSemana === 0) return true;
  return esFeriado(dateStr);
}

export function esSabadoSinPrevia(diaSemana: number, turno: string): boolean {
  return diaSemana === 6 && turno === "Previa";
}

export function motivoDiaSinSorteo(dateStr: string, diaSemana: number, turno: string): string | null {
  if (esSabadoSinPrevia(diaSemana, turno)) return "sábado (no hay Previa)";
  if (diaSemana === 0) return "domingo";
  if (esFeriado(dateStr)) return "feriado";
  return null;
}

export function todosLosFeriados(): string[] {
  return Object.values(FERIADOS).flat();
}
