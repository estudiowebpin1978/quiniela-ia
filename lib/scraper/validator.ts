/**
 * Data validation and integrity checker for Quiniela Nacional draws.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalDraws: number;
    totalNumbers: number;
    dateRange: { from: string; to: string };
    turnosPerDay: Record<string, number>;
    missingDays: string[];
    duplicateDraws: { date: string; turno: string }[];
  };
}

const VALID_TURNOS = ["matutina", "vespertina", "nocturna", "previa", "primera"];
const NUMBERS_PER_DRAW = 20;
const MAX_NUMBER = 9999;

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

function esFeriado(dateStr: string): boolean {
  const year = parseInt(dateStr.slice(0, 4));
  return FERIADOS[year]?.includes(dateStr) ?? false;
}

function esDomingo(dateStr: string): boolean {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.getUTCDay() === 0;
}

function esSabado(dateStr: string): boolean {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.getUTCDay() === 6;
}

function dateRange(): { from: string; to: string } | null {
  return null;
}

export function validateDraw(
  fecha: string,
  turno: string,
  numbers: number[],
): string[] {
  const errors: string[] = [];

  if (!VALID_TURNOS.includes(turno)) {
    errors.push(`Turno inválido: "${turno}". Válidos: ${VALID_TURNOS.join(", ")}`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    errors.push(`Fecha con formato inválido: "${fecha}". Se espera YYYY-MM-DD`);
  }

  if (numbers.length !== NUMBERS_PER_DRAW) {
    errors.push(
      `Draw ${fecha} ${turno}: se esperaban ${NUMBERS_PER_DRAW} números, se obtuvieron ${numbers.length}`,
    );
  }

  const seen = new Set<number>();
  for (let i = 0; i < numbers.length; i++) {
    const n = numbers[i];
    if (typeof n !== "number" || isNaN(n)) {
      errors.push(`Draw ${fecha} ${turno}: posición ${i} no es un número válido`);
      continue;
    }
    if (n < 0 || n > MAX_NUMBER) {
      errors.push(`Draw ${fecha} ${turno}: número ${n} fuera de rango (0-${MAX_NUMBER})`);
    }
    if (seen.has(n)) {
      errors.push(`Draw ${fecha} ${turno}: número duplicado ${n}`);
    }
    seen.add(n);
  }

  return errors;
}

function getWeekdays(from: string, to: string): string[] {
  const days: string[] = [];
  const start = new Date(from + "T12:00:00Z");
  const end = new Date(to + "T12:00:00Z");
  const cur = new Date(start);

  while (cur <= end) {
    const iso = cur.toISOString().slice(0, 10);
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6 && !esFeriado(iso)) {
      days.push(iso);
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return days;
}

export function validateDatabase(
  draws: { date: string; turno: string; numbers: number[] }[],
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Map<string, { date: string; turno: string }[]>();
  const turnosPerDay: Record<string, number> = {};

  for (const draw of draws) {
    const drawErrors = validateDraw(draw.date, draw.turno, draw.numbers);
    errors.push(...drawErrors);

    turnosPerDay[draw.date] = (turnosPerDay[draw.date] ?? 0) + 1;

    const key = `${draw.date}|${draw.turno}`;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key)!.push({ date: draw.date, turno: draw.turno });
  }

  const duplicateDraws: { date: string; turno: string }[] = [];
  for (const [, entries] of seen) {
    if (entries.length > 1) {
      duplicateDraws.push(...entries);
    }
  }
  if (duplicateDraws.length > 0) {
    errors.push(
      `Duplicados encontrados: ${duplicateDraws.map((d) => `${d.date} ${d.turno}`).join(", ")}`,
    );
  }

  const dates = [...new Set(draws.map((d) => d.date))].sort();
  let missingDays: string[] = [];
  if (dates.length >= 2) {
    const weekdays = getWeekdays(dates[0], dates[dates.length - 1]);
    const drawDates = new Set(dates);
    missingDays = weekdays.filter((d) => !drawDates.has(d));
    if (missingDays.length > 0) {
      warnings.push(
        `Faltan ${missingDays.length} días hábiles: ${missingDays.slice(0, 10).join(", ")}${missingDays.length > 10 ? "..." : ""}`,
      );
    }
  }

  const totalNumbers = draws.reduce((sum, d) => sum + d.numbers.length, 0);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalDraws: draws.length,
      totalNumbers,
      dateRange: {
        from: dates[0] ?? "",
        to: dates[dates.length - 1] ?? "",
      },
      turnosPerDay,
      missingDays,
      duplicateDraws,
    },
  };
}

export function checkIntegrity(
  draws: { date: string; turno: string; numbers: number[] }[],
): ValidationResult {
  return validateDatabase(draws);
}
