/**
 * Domain Entity: Game (lottery game type)
 */
export interface GameProps {
  id: string
  slug: string
  name: string
  numberCount: number
  numberRange: [number, number]
  turns: string[]
  isActive: boolean
  config: Record<string, unknown>
}

export class Game {
  private constructor(private props: GameProps) {}

  static create(props: GameProps): Game {
    if (!props.slug || !props.name) throw new Error("Game requires slug and name")
    if (props.numberCount <= 0) throw new Error("Game numberCount must be positive")
    return new Game(props)
  }

  static fromRow(row: any): Game {
    return Game.create({
      id: row.id,
      slug: row.slug,
      name: row.name,
      numberCount: row.number_count,
      numberRange: [row.number_range_min ?? 0, row.number_range_max ?? 9999],
      turns: row.turns ?? ["Nocturna"],
      isActive: row.is_active ?? true,
      config: row.config ?? {},
    })
  }

  get id() { return this.props.id }
  get slug() { return this.props.slug }
  get name() { return this.props.name }
  get turns() { return this.props.turns }
  get isActive() { return this.props.isActive }

  hasTurno(turno: string): boolean {
    return this.props.turns.some(t => t.toLowerCase() === turno.toLowerCase())
  }
}
