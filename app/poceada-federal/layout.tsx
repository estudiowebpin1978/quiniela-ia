import type { Metadata } from "next"

/**
 * Metadata de la nueva modalidad Poceada Federal (Santa Fe).
 * El layout raíz aplica el template "%s | Quiniela IA".
 */
export const metadata: Metadata = {
  title: "Poceada Federal (Santa Fe) — Reglas, sorteos y premios",
  description:
    "Cómo se juega la Poceada Federal: 8 números del 00 al 99, dos sorteos diarios de lunes a sábados (matutino y nocturno), extracción de 20 premios y niveles de premios (50%, 30% y 20% del pozo). Reglas oficiales de la Lotería de Santa Fe.",
}

export default function PoceadaFederalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
