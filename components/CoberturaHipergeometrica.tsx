"use client"

/**
 * Cobertura vs costo — hipergeométrica EXACTA.
 *
 * Muestra, para cada cantidad k de números jugados, la probabilidad exacta de
 * acertar al menos uno (P(X≥1) = 1 − C(N−K, k) / C(N, k)) y los aciertos
 * esperados (E[X] = k·K/N). Es matemática pura, no una "técnica":
 *
 *   - En sorteos independientes, justos y sin sesgo (medido con χ² en esta
 *     app), NINGUNA selección de números supera a otra.
 *   - Las únicas maneras de subir aciertos son (a) jugar más números
 *     (más costo, proporcionalmente) o (b) tener un sesgo real en el sorteo
 *     — y en los juegos/datos de esta app no se demostró ninguno.
 *
 * Determinista, sin red, sin estado. Etiquetas honestas como el resto de la app.
 */

const CONFIG = {
  quiniela: { N: 100, K: 20, unidad: "00-99", nombre: "Quiniela" },
  poceada: { N: 100, K: 20, unidad: "00-99", nombre: "Poceada Ciudad" },
  federal: { N: 100, K: 20, unidad: "00-99", nombre: "Poceada Federal" },
  brinco: { N: 40, K: 6, unidad: "00-39", nombre: "Brinco" },
} as const

export type JuegoCobertura = keyof typeof CONFIG

function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  const kk = Math.min(k, n - k)
  let r = 1
  for (let i = 1; i <= kk; i++) r = (r * (n - kk + i)) / i
  return r
}

/** P(X ≥ 1) con X hipergeométrica(N, K, k). */
export function pAlMenosUno(N: number, K: number, k: number): number {
  if (k <= 0) return 0
  if (k >= N - K + 1) return 1
  return 1 - comb(N - K, k) / comb(N, k)
}

/** E[X] con X hipergeométrica(N, K, k). */
export function esperanza(N: number, K: number, k: number): number {
  return (k * K) / N
}

export default function CoberturaHipergeometrica({ juego }: { juego: JuegoCobertura }) {
  const { N, K, unidad, nombre } = CONFIG[juego]
  const kMax = Math.min(20, N)
  const bars = Array.from({ length: kMax }, (_, i) => i + 1)
  const p = (k: number) => pAlMenosUno(N, K, k)
  const e = (k: number) => esperanza(N, K, k)

  // Hitos mostrados: jugada oficial (brinco) o puntos útiles para quiniela.
  const hitos =
    juego === "brinco"
      ? [1, 3, 6]
      : [1, 4, 10, 20]

  return (
    <section
      aria-label="Cobertura de la jugada — hipergeométrica exacta"
      style={{
        margin: "14px 0",
        padding: "12px 14px",
        borderRadius: 12,
        background: "rgba(148, 163, 184, 0.06)",
        border: "1px solid rgba(148, 163, 184, 0.16)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#e2e8f0" }}>
          📊 Cobertura vs costo — matemática exacta
        </div>
        <span style={{ fontSize: 10, color: "#94a3b8" }}>{nombre} · {unidad}</span>
      </div>

      {/* Barras P(≥1 acierto) para k = 1..kMax */}
      <div
        role="img"
        aria-label={`Curva de cobertura: P(al menos 1 acierto) al jugar k números de ${N}`}
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 2,
          height: 84,
          marginTop: 10,
          paddingBottom: 16,
          borderBottom: "1px solid rgba(148,163,184,0.25)",
          position: "relative",
        }}
      >
        {/* guías 25/50/75% */}
        {[25, 50, 75].map((g) => (
          <div
            key={g}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: (g / 100) * 68 + 16,
              borderTop: "1px dashed rgba(148,163,184,0.18)",
              pointerEvents: "none",
            }}
          >
            <span style={{ position: "absolute", right: 0, top: -7, fontSize: 8, color: "#64748b" }}>{g}%</span>
          </div>
        ))}
        {bars.map((k) => {
          const v = p(k) * 100
          const esHito = hitos.includes(k)
          return (
            <div key={k} title={`k=${k} → P(≥1) ${v.toFixed(1)}% · E[X] ${e(k).toFixed(2)}`}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", zIndex: 1 }}
            >
              <div
                style={{
                  width: "100%",
                  height: `${Math.max(2, (v / 100) * 68)}px`,
                  borderRadius: "3px 3px 1px 1px",
                  background: esHito
                    ? "linear-gradient(180deg, #38bdf8, #0284c7)"
                    : "rgba(56,189,248,0.38)",
                }}
              />
              <div style={{ fontSize: 8, color: esHito ? "#7dd3fc" : "#475569", marginTop: 2, fontWeight: esHito ? 700 : 400 }}>
                {k}
              </div>
            </div>
          )
        })}
      </div>

      {/* Hitos con números exactos */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        {hitos.map((k) => (
          <div
            key={k}
            style={{
              fontSize: 10,
              color: "#cbd5e1",
              background: "rgba(148,163,184,0.10)",
              border: "1px solid rgba(148,163,184,0.14)",
              borderRadius: 8,
              padding: "4px 8px",
            }}
          >
            <b>Jugando {k}:</b> P(≥1) = <b>{(p(k) * 100).toFixed(1)}%</b> · Esperados: {e(k).toFixed(2)}
          </div>
        ))}
      </div>

      <p style={{ fontSize: 10, color: "#64748b", margin: "8px 0 0", lineHeight: 1.5 }}>
        Hipergeométrica exacta sobre {N} bolillas, {K} extraídas por sorteo. Costo ∝ jugadas: cada número extra cuesta lo mismo
        y sube la cobertura en la misma proporción que en todos los sorteos justos. Ninguna técnica de selección supera estas curvas
        (no hay sesgo demostrado en los datos de esta app). La app te muestra análisis honesto, no un método ganador.
      </p>
    </section>
  )
}
