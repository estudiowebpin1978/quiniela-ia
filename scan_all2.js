const fs = require('fs');
const path = 'lib/pipeline/precompute/lote-diario.ts';
let content = fs.readFileSync(path, 'utf8');
if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
const lines = content.split(/\r?\n/);
// Comprehensive scan: every line for hidden chars + total length check
let problemsFound = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i] || '';
  // Check each char code > 127 for dangerous ones
  for (let j = 0; j < line.length; j++) {
    const c = line.charCodeAt(j);
    // Dangerous invisible Unicode ranges:
    // U+200B ZERO WIDTH SPACE
    // U+200C ZWNJ (zero width non-joiner)
    // U+200D ZWJ (zero width joiner)
    // U+FEFF BOM / zero-width no-break space
    // U+00AD soft hyphen
    // U+2028 LINE SEPARATOR (valid in JS strings but not in identifiers)
    // U+2029 PARAGRAPH SEPARATOR
    if ([0x200B, 0x200C, 0x200D, 0xFEFF, 0xAD].includes(c)) {
      console.log(`PROBLEM line ${i+1} pos ${j}: char code 0x${c.toString(16)}`);
      problemsFound++;
      break;
    }
  }
}
if (problemsFound === 0) console.log('No hidden characters found anywhere in the file');
else console.log(`Found ${problemsFound} problem(s)`);
