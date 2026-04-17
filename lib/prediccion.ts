// ===============================
// TIPOS
// ===============================
type Stats = {
  frecuencia: number;
  atraso: number;
  tendencia: number;
};

type RankingItem = {
  numero: string;
  score: number;
  prob: number;
};

// ===============================
// SCORE PRINCIPAL
// ===============================
export function calcularScore(s: Stats) {
  return (
    s.frecuencia * 0.4 +
    s.atraso * 0.3 +
    s.tendencia * 0.3
  );
}

// ===============================
// HELPERS
// ===============================

// Evita duplicados
function unique(arr: string[]) {
  return [...new Set(arr)];
}

// Mezcla inteligente (balance)
function mezclar(ranking: RankingItem[]) {
  const calientes = ranking.slice(0, 5);
  const medios = ranking.slice(5, 15);
  const frios = ranking.slice(-10);

  return [
    ...calientes.slice(0, 4),
    ...medios.slice(0, 4),
    ...frios.slice(0, 2),
  ];
}

// Selección de redoblona
function seleccionarRedoblona(
  ranking: RankingItem[],
  stats: Record<string, Stats>
) {
  const candidatos = ranking.filter(
    (n) => stats[n.numero]?.atraso > 10
  );

  if (candidatos.length === 0) return ranking[0].numero;

  return candidatos.sort((a, b) => b.score - a.score)[0].numero;
}

// ===============================
// GENERADOR PRINCIPAL
// ===============================
export function generarPredicciones(stats: Record<string, Stats>) {
  const numeros = Object.keys(stats);

  // 1. Ranking base
  const rankingBase = numeros
    .map((n) => ({
      numero: n,
      score: calcularScore(stats[n]),
    }))
    .sort((a, b) => b.score - a.score);

  // 2. Suma total para probabilidades
  const totalScore =
    rankingBase.reduce((acc, n) => acc + n.score, 0) || 1;

  // 3. Ranking con probabilidad
  const ranking: RankingItem[] = rankingBase.map((n) => ({
    ...n,
    prob: Number(((n.score / totalScore) * 100).toFixed(2)),
  }));

  // 4. Selección balanceada
  const seleccion = mezclar(ranking);

  // 5. Generar salidas sin duplicados
  const numeros_2 = unique(
    seleccion.map((n) => n.numero.slice(-2))
  ).slice(0, 10);

  const numeros_3 = unique(
    seleccion.map((n) => n.numero.slice(-3))
  ).slice(0, 10);

  const numeros_4 = unique(
    seleccion.map((n) => n.numero)
  ).slice(0, 10);

  // 6. Redoblona
  const redoblona = seleccionarRedoblona(ranking, stats);

  // 7. Resultado final
  return {
    numeros_2,
    numeros_3,
    numeros_4,
    redoblona,
    ranking: ranking.slice(0, 20), // 🔥 clave para UI
  };
}