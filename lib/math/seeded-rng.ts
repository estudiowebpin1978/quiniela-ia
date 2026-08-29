/**
 * PRNG determinista (xorshift32). Misma semilla → misma secuencia.
 * Usar en entrenamiento ML; nunca Math.random en el path de predicción.
 */

export function hashSeed(...parts: Array<string | number>): number {
  let h = 2166136261 >>> 0
  const s = parts.join("|")
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0 || 1
}

export function createRng(seed: number): () => number {
  let state = (seed >>> 0) || 1
  return () => {
    state ^= state << 13
    state >>>= 0
    state ^= state >>> 17
    state >>>= 0
    state ^= state << 5
    state >>>= 0
    return (state >>> 0) / 4294967296
  }
}

export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rng = createRng(seed)
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function seededInt(rng: () => number, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive)
}
