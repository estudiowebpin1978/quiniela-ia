/**
 * Value Object: PredictionScore (score for a single number)
 */
export class PredictionScore {
  private constructor(
    private readonly numero: number,
    private readonly _score: number,
    private readonly _confidence: number,
  ) {}

  static create(numero: number, score: number, confidence: number = 0.5): PredictionScore {
    if (numero < 0 || numero > 99) throw new Error("Score numero must be 0-99")
    return new PredictionScore(
      Math.max(0, Math.min(1, score)),
      Math.max(0, Math.min(1, confidence)),
      numero,
    )
  }

  get num(): number { return this.numero }
  get score(): number { return this._score }
  get confidence(): number { return this._confidence }

  get padded(): string {
    return String(this.numero).padStart(2, "0")
  }

  get rank(): number { return 0 } // Set externally when sorting

  isHot(threshold: number = 0.7): boolean {
    return this._score >= threshold
  }

  isCold(threshold: number = 0.3): boolean {
    return this._score <= threshold
  }
}
