const fs = require('fs');
const path = 'lib/pipeline/precompute/lote-diario.ts';
let content = fs.readFileSync(path, 'utf8');
if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
const lines = content.split(/\r?\n/);

// Find import block at top - print all lines 40-70 to see imports
console.log('=== Import section ===');
for (let i = 39; i < Math.min(75, lines.length); i++) {
  console.log(`${i+1}: ${lines[i]}`);
}
console.log('\n=== Checking for actual brackets balance ===');
// Count open and close brackets in each "block" - check around lines 140-170 where t0 is set
let depth = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (const c of line) {
    if (c === '{') depth++;
    if (c === '}') depth--;
    if (c === '(') depth++;
    if (c === ')') depth--;
  }
}
console.log(`Final bracket depth: ${depth}`);
