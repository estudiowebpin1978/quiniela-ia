/**
 * Domain Entity: Draw (official lottery result)
 */
export interface DrawProps {
  id: number
  gameId: string
  date: string
  turno: string
  numbers: number[]
  source: string
  htmlHash: string | null
  confidenceScore: number | null
  sourcePriority: number
}

export class Draw {
  private constructor(private props: DrawProps) {}

  static create(props: DrawProps): Draw {
    if (!props.gameId || !props.date || !props.turno) throw new Error("Draw requires gameId, date, turno")
    if (!Array.isArray(props.numbers) || props.numbers.length < 20) throw new Error("Draw requires at least 20 numbers")
    return new Draw(props)
  }

  static fromRow(row: any): Draw {
    return Draw.create({
      id: row.id,
      gameId: row.game_id,
      date: row.date,
      turno: row.turno,
      numbers: row.numbers ?? [],
      source: row.source ?? "unknown",
      htmlHash: row.html_hash ?? null,
      confidenceScore: row.confidence_score ?? null,
      sourcePriority: row.source_priority ?? 0,
    })
  }

  get id() { return this.props.id }
  get gameId() { return this.props.gameId }
  get date() { return this.props.date }
  get turno() { return this.props.turno }
  get numbers() { return this.props.numbers }

  /** Extract 2-digit terminaciones from numbers */
  get terminaciones2(): number[] {
    return this.props.numbers.map(n => n % 100).filter(n => n >= 0 && n <= 99)
  }

  /** Extract 3-digit terminaciones */
  get terminaciones3(): number[] {
    return this.props.numbers.map(n => n % 1000)
  }

  /** Get full 4-digit numbers */
  get numeros4(): number[] {
    return this.props.numbers.filter(n => n >= 0 && n <= 9999)
  }

  /** First 2-digit number (for quick access) */
  get first2c(): number {
    return this.props.numbers[0] % 100
  }
}
