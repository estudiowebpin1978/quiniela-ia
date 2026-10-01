export const LOTBA = {
  jurisdiction: "CABA" as const,
  name: "Lotería de la Ciudad de Buenos Aires" as const,
  quinielaName: "Quiniela de la Ciudad" as const,
  quinielaUrl: "https://quiniela.loteriadelaciudad.gob.ar/" as const,
  poceadaUrl: "https://poceada.loteriadelaciudad.gob.ar/" as const,
} as const

export const QUINIELA_TURNOS = [
  "Previa",
  "Primera",
  "Matutina",
  "Vespertina",
  "Nocturna",
] as const

export type QuinielaTurno = (typeof QUINIELA_TURNOS)[number]
