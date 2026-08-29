/**
 * Value Object: Turno (lottery drawing period)
 */
export type TurnoName = "previa" | "primera" | "matutina" | "vespertina" | "nocturna"

const TURNO_ORDER: TurnoName[] = ["previa", "primera", "matutina", "vespertina", "nocturna"]

export class Turno {
  private constructor(private readonly value: TurnoName) {}

  static create(raw: string): Turno {
    const lower = raw.toLowerCase().trim() as TurnoName
    if (!TURNO_ORDER.includes(lower)) {
      throw new Error(`Invalid turno: ${raw}. Valid: ${TURNO_ORDER.join(", ")}`)
    }
    return new Turno(lower)
  }

  static safe(raw: string): Turno | null {
    try { return Turno.create(raw) } catch { return null }
  }

  get name(): TurnoName { return this.value }
  get capitalized(): string { return this.value.charAt(0).toUpperCase() + this.value.slice(1) }

  get next(): Turno {
    const idx = TURNO_ORDER.indexOf(this.value)
    return new Turno(TURNO_ORDER[(idx + 1) % TURNO_ORDER.length])
  }

  get previous(): Turno {
    const idx = TURNO_ORDER.indexOf(this.value)
    return new Turno(TURNO_ORDER[(idx - 1 + TURNO_ORDER.length) % TURNO_ORDER.length])
  }

  equals(other: Turno): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }
}
