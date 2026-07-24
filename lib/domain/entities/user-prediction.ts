/**
 * Domain Entity: UserPrediction
 */
export interface UserPredictionProps {
  id: string
  userId: string
  gameId: string
  date: string
  turno: string
  numbers2c: number[]
  numbers3c: number[]
  numbers4c: number[]
  redoblona: string | null
  confidence: number | null
}

export class UserPrediction {
  private constructor(private props: UserPredictionProps) {}

  static create(props: UserPredictionProps): UserPrediction {
    if (!props.userId || !props.gameId || !props.date || !props.turno) {
      throw new Error("UserPrediction requires userId, gameId, date, turno")
    }
    if (!Array.isArray(props.numbers2c) || props.numbers2c.length === 0) {
      throw new Error("UserPrediction requires at least one 2c number")
    }
    return new UserPrediction(props)
  }

  static fromRow(row: any): UserPrediction {
    return UserPrediction.create({
      id: row.id,
      userId: row.user_id,
      gameId: row.game_id,
      date: row.date,
      turno: row.turno,
      numbers2c: row.numbers_2c ?? [],
      numbers3c: row.numbers_3c ?? [],
      numbers4c: row.numbers_4c ?? [],
      redoblona: row.redoblona ?? null,
      confidence: row.confidence ?? null,
    })
  }

  get id() { return this.props.id }
  get userId() { return this.props.userId }
  get gameId() { return this.props.gameId }
  get date() { return this.props.date }
  get turno() { return this.props.turno }
  get numbers2c() { return this.props.numbers2c }
  get numbers3c() { return this.props.numbers3c }
  get numbers4c() { return this.props.numbers4c }
  get redoblona() { return this.props.redoblona }

  get hasPremiumContent(): boolean {
    return this.props.numbers3c.length > 0 || this.props.numbers4c.length > 0 || this.props.redoblona !== null
  }

  toInsertPayload(): Record<string, unknown> {
    return {
      user_id: this.props.userId,
      game_id: this.props.gameId,
      date: this.props.date,
      turno: this.props.turno,
      numbers_2c: this.props.numbers2c,
      numbers_3c: this.props.numbers3c,
      numbers_4c: this.props.numbers4c,
      redoblona: this.props.redoblona,
      confidence: this.props.confidence,
    }
  }
}
