/**
 * Domain Service: Prediction validation
 */
import { Turno } from "../value-objects/turno"
import { NumberSet } from "../value-objects/number-set"
import type { TierResolution } from "./tier-service"

export interface PredictionValidation {
  valid: boolean
  errors: string[]
}

export function validatePredictionInput(params: {
  turno: string
  numbers2c: number[]
  numbers3c?: number[]
  numbers4c?: number[]
  redoblona?: string
  tier: TierResolution
}): PredictionValidation {
  const errors: string[] = []

  // Validate turno
  const turno = Turno.safe(params.turno)
  if (!turno) {
    errors.push(`Turno inválido: ${params.turno}`)
  }

  // Validate 2c numbers
  if (!params.numbers2c || params.numbers2c.length === 0) {
    errors.push("Se requiere al menos un número de 2 cifras")
  } else if (params.numbers2c.length > 10) {
    errors.push("Máximo 10 números de 2 cifras")
  }

  const valid2c = NumberSet.create2c(params.numbers2c)
  if (valid2c.length !== params.numbers2c.length) {
    errors.push("Algunos números de 2 cifras son inválidos (deben ser 0-99)")
  }

  // Premium-only features
  if (params.tier.canAccessPremiumFeatures) {
    if (params.numbers3c && params.numbers3c.length > 10) {
      errors.push("Máximo 10 números de 3 cifras")
    }
    if (params.numbers4c && params.numbers4c.length > 10) {
      errors.push("Máximo 10 números de 4 cifras")
    }
    if (params.redoblona) {
      const parts = params.redoblona.split("-").map(Number)
      if (parts.length !== 2 || parts.some(isNaN) || parts.some(n => n < 0 || n > 99)) {
        errors.push("Redoblona debe ser formato XX-XX (0-99)")
      }
    }
  } else if (
    (params.numbers3c && params.numbers3c.length > 0) ||
    (params.numbers4c && params.numbers4c.length > 0) ||
    params.redoblona
  ) {
    errors.push("3 cifras, 4 cifras y redoblona requieren acceso premium")
  }

  // Check predictions remaining
  if (!params.tier.canSavePrediction) {
    errors.push("Límite de predicciones alcanzado. Actualiza a premium.")
  }

  return { valid: errors.length === 0, errors }
}
