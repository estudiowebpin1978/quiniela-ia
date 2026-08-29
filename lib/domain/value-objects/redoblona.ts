/**
 * Value Object: Redoblona (pair of 2-digit numbers)
 */
export class Redoblona {
  private constructor(
    private readonly _a: number,
    private readonly _b: number,
  ) {}

  static create(a: number, b: number): Redoblona {
    if (a < 0 || a > 99 || b < 0 || b > 99) {
      throw new Error("Redoblona numbers must be 0-99")
    }
    return new Redoblona(Math.min(a, b), Math.max(a, b))
  }

  static fromString(s: string): Redoblona {
    const parts = s.split("-").map(Number)
    if (parts.length !== 2 || parts.some(isNaN)) throw new Error(`Invalid redoblona: ${s}`)
    return Redoblona.create(parts[0], parts[1])
  }

  get a(): number { return this._a }
  get b(): number { return this._b }

  toString(): string {
    return `${String(this._a).padStart(2, "0")}-${String(this._b).padStart(2, "0")}`
  }

  equals(other: Redoblona): boolean {
    return this._a === other._a && this._b === other._b
  }
}
