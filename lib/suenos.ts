/**
 * SUENOS — Argentine lottery dream-number associations.
 * Shared across all prediction and analysis endpoints.
 *
 * Fuente única: lib/utils/quinielaDictionary.ts (La Tabla Cultural).
 * Se deriva aquí para que backend (APIs/cron) y frontend (tabla/grilla)
 * usen SIEMPRE el mismo emoji + nombre por número.
 */

import { getAllEntries } from "./utils/quinielaDictionary"

export const SUENOS: Record<number, { emoji: string; nombre: string }> = Object.fromEntries(
  getAllEntries().map((e) => [parseInt(e.number, 10), { emoji: e.icon, nombre: e.name }])
)
