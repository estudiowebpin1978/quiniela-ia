/**
 * Tests de matriz de quorum tri-consensus (sin red — lógica pura).
 * Ejecutar: npx tsx lib/scrapers/consensus.quorum.test.ts
 */

type SourceNode = { name: string; numbers: number[]; cabeza: number | null; ok: boolean }

function computeQuorum(nodes: SourceNode[]) {
  const validNodes = nodes.filter((n) => n.ok && n.cabeza !== null)
  if (validNodes.length === 0) {
    return { matchCount: 0, matchValue: null as number | null, majorityNumbers: [] as number[], majoritySource: "none" }
  }
  const votes = new Map<number, { count: number; numbers: number[]; source: string }>()
  for (const node of validNodes) {
    const key = node.cabeza!
    const existing = votes.get(key)
    if (existing) existing.count++
    else votes.set(key, { count: 1, numbers: node.numbers, source: node.name })
  }
  let best = { count: 0, value: null as number | null, numbers: [] as number[], source: "none" }
  for (const [value, entry] of votes) {
    if (entry.count > best.count) {
      best = { count: entry.count, value, numbers: entry.numbers, source: entry.source }
    }
  }
  return {
    matchCount: best.count,
    matchValue: best.value,
    majorityNumbers: best.numbers,
    majoritySource: best.source,
  }
}

function evaluateScenario(label: string, nodes: SourceNode[]): { label: string; ok: boolean; matchCount: number; okCount: number } {
  const okCount = nodes.filter((n) => n.ok).length
  const q = computeQuorum(nodes)
  let ok = false
  if (okCount === 3 && q.matchCount === 3) ok = true
  else if (okCount >= 2 && q.matchCount >= 2) ok = true
  else ok = false
  return { label, ok, matchCount: q.matchCount, okCount }
}

const nums5832 = Array.from({ length: 20 }, (_, i) => 5832 + i)
const nums5837 = Array.from({ length: 20 }, (_, i) => 5837 + i)

const scenarios = [
  evaluateScenario("A✅ B✅ C✅", [
    { name: "A", ok: true, cabeza: 5832, numbers: nums5832 },
    { name: "B", ok: true, cabeza: 5832, numbers: nums5832 },
    { name: "C", ok: true, cabeza: 5832, numbers: nums5832 },
  ]),
  evaluateScenario("A✅ B✅ C❌", [
    { name: "A", ok: true, cabeza: 5832, numbers: nums5832 },
    { name: "B", ok: true, cabeza: 5832, numbers: nums5832 },
    { name: "C", ok: false, cabeza: null, numbers: [] },
  ]),
  evaluateScenario("A✅ B❌ C❌", [
    { name: "A", ok: true, cabeza: 5832, numbers: nums5832 },
    { name: "B", ok: false, cabeza: null, numbers: [] },
    { name: "C", ok: false, cabeza: null, numbers: [] },
  ]),
  evaluateScenario("A❌ B❌ C❌", [
    { name: "A", ok: false, cabeza: null, numbers: [] },
    { name: "B", ok: false, cabeza: null, numbers: [] },
    { name: "C", ok: false, cabeza: null, numbers: [] },
  ]),
  evaluateScenario("A=5832 B=5837 C=5832 (2/1)", [
    { name: "A", ok: true, cabeza: 5832, numbers: nums5832 },
    { name: "B", ok: true, cabeza: 5837, numbers: nums5837 },
    { name: "C", ok: true, cabeza: 5832, numbers: nums5832 },
  ]),
  evaluateScenario("A=5832 B=5837 C=5839 (3 distintos)", [
    { name: "A", ok: true, cabeza: 5832, numbers: nums5832 },
    { name: "B", ok: true, cabeza: 5837, numbers: nums5837 },
    { name: "C", ok: true, cabeza: 5839, numbers: nums5837 },
  ]),
  evaluateScenario("A✅ B✅ disagree (5832 vs 5837)", [
    { name: "A", ok: true, cabeza: 5832, numbers: nums5832 },
    { name: "B", ok: true, cabeza: 5837, numbers: nums5837 },
    { name: "C", ok: false, cabeza: null, numbers: [] },
  ]),
]

let failed = 0
const expected: Record<string, boolean> = {
  "A✅ B✅ C✅": true,
  "A✅ B✅ C❌": true,
  "A✅ B❌ C❌": false,
  "A❌ B❌ C❌": false,
  "A=5832 B=5837 C=5832 (2/1)": true,
  "A=5832 B=5837 C=5839 (3 distintos)": false,
  "A✅ B✅ disagree (5832 vs 5837)": false,
}

for (const s of scenarios) {
  const pass = s.ok === expected[s.label]
  if (!pass) failed++
  console.log(`${pass ? "PASS" : "FAIL"} | ${s.label} → guardar=${s.ok} (okCount=${s.okCount}, matchCount=${s.matchCount})`)
}

if (failed > 0) {
  console.error(`\n${failed} escenarios fallaron`)
  process.exit(1)
}
console.log("\nTodos los escenarios de quorum pasaron.")
