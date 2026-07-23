/**
 * Resumen legible de predicciones vía Groq (gratis) o Gemini.
 * No inventa números: solo interpreta el ranking matemático ya calculado.
 * Timeout estricto para no romper el presupuesto de Vercel Hobby.
 */

export type PredictionSummaryInput = {
  turno: string
  top2: string[]
  confidence: number
  totalSorteos: number
  metodo?: string
  factoresDestacados?: string[]
}

function groqKey() {
  return (process.env.GROQ_API_KEY || "").replace(/"/g, "").trim()
}
function geminiKey() {
  return (process.env.GEMINI_API_KEY || "").replace(/"/g, "").trim()
}

function fallbackSummary(input: PredictionSummaryInput): string {
  const nums = input.top2.slice(0, 5).join(", ")
  return (
    `Análisis estadístico del turno ${input.turno}: top 2 cifras sugerido [${nums}] ` +
    `con confianza calibrada ~${input.confidence}% sobre ${input.totalSorteos} sorteos históricos. ` +
    `Basado en frecuencias, atrasos y secuencias reales. No garantiza resultados futuros.`
  )
}

export async function generatePredictionSummary(
  input: PredictionSummaryInput,
  timeoutMs = 2500,
): Promise<{ summary: string; provider: "groq" | "gemini" | "local" }> {
  const prompt =
    `Sos un analista estadístico de la Quiniela Nacional (Buenos Aires). ` +
    `Interpretá SOLO estos resultados ya calculados (no inventes números):\n` +
    `- Turno: ${input.turno}\n` +
    `- Top 10 de 2 cifras: ${input.top2.join(", ")}\n` +
    `- Confianza calibrada: ${input.confidence}%\n` +
    `- Sorteos analizados: ${input.totalSorteos}\n` +
    (input.factoresDestacados?.length
      ? `- Factores: ${input.factoresDestacados.slice(0, 5).join("; ")}\n`
      : "") +
    `Respondé en español, 2-3 oraciones claras, tono sobrio, sin promesas de ganancia.`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)

  try {
    const gk = groqKey()
    if (gk) {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${gk}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            { role: "system", content: "Analista estadístico. Respuestas breves en español." },
            { role: "user", content: prompt },
          ],
          temperature: 0.2,
          max_tokens: 220,
        }),
        signal: ctrl.signal,
      })
      if (res.ok) {
        const data = await res.json()
        const text = data?.choices?.[0]?.message?.content?.trim()
        if (text) {
          clearTimeout(timer)
          return { summary: text, provider: "groq" }
        }
      }
    }

    const gem = geminiKey()
    if (gem) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${gem}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 220 },
          }),
          signal: ctrl.signal,
        }
      )
      if (res.ok) {
        const data = await res.json()
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
        if (text) {
          clearTimeout(timer)
          return { summary: text, provider: "gemini" }
        }
      }
    }
  } catch {
    /* timeout o red → fallback local */
  } finally {
    clearTimeout(timer)
  }

  return { summary: fallbackSummary(input), provider: "local" }
}
