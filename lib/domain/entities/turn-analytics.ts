/**
 * Domain Entity: TurnAnalytics (pre-calculated statistical data per turno)
 */
export interface TurnAnalyticsProps {
  id: number
  gameId: string
  turno: string
  fecha: string
  entropyValue: number | null
  entropyTrend: string | null
  entropyAlert: boolean
  survivalHazard: Record<string, unknown> | null
  survivalCritical: unknown[] | null
  markovTransitions: Record<string, unknown> | null
  compositeConfidence: number | null
}

export class TurnAnalytics {
  private constructor(private props: TurnAnalyticsProps) {}

  static create(props: TurnAnalyticsProps): TurnAnalytics {
    return new TurnAnalytics(props)
  }

  static fromRow(row: { id?: number; game_id?: string; turno?: string; fecha?: string; entropy_value?: number | null; entropy_trend?: string | null; entropy_alert?: boolean; survival_hazard?: Record<string, unknown> | null; survival_critical?: unknown[] | null; markov_transitions?: Record<string, unknown> | null; composite_confidence?: number | null }): TurnAnalytics {
    return TurnAnalytics.create({
      id: row.id,
      gameId: row.game_id,
      turno: row.turno,
      fecha: row.fecha,
      entropyValue: row.entropy_value ?? null,
      entropyTrend: row.entropy_trend ?? null,
      entropyAlert: row.entropy_alert ?? false,
      survivalHazard: row.survival_hazard ?? null,
      survivalCritical: row.survival_critical ?? null,
      markovTransitions: row.markov_transitions ?? null,
      compositeConfidence: row.composite_confidence ?? null,
    })
  }

  get entropyNormalized(): number {
    return this.props.entropyValue ?? 0.99
  }

  get confidenceScore(): number {
    return this.props.compositeConfidence ?? 0.5
  }
}
