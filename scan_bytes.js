const fs = require('fs');
const path = 'lib/pipeline/precompute/lote-diario.ts';
let content = fs.readFileSync(path, 'utf8');
// Remove BOM if present
if (content.charCodeAt(0) === 0xFEFF) {
  content = content.slice(1);
}
const lines = content.split(/\r?\n/);
console.log('Total lines:', lines.length);
for (let i = 239; i < Math.min(270, lines.length); i++) {
  const line = lines[i] || '';
  const matches = line.match(/[\u200B\u200C\u200D\uFEFF]/g);
  let nonAsciiSuspicious = false;
  for (let j = 0; j < line.length; j++) {
    const c = line.charCodeAt(j);
    if (c > 127 && c !== 0x200B && c !== 0x200C && c !== 0x200D && c !== 0xFEFF) {
      nonAsciiSuspicious = true;
      break;
    }
  }
  if (matches || nonAsciiSuspicious) {
    console.log(`Line ${i+1}: SUSPICIOUS${matches ? ' HIDDEN=' + JSON.stringify(matches) : ''}${nonAsciiSuspicious ? ' NONASCII=' + line.substring(0, 80).replace(/\n/g, '\\n') : ''}`);
  } else {
    console.log(`Line ${i+1}: OK (${line.length} chars)`);
  }
}
console.log('\n=== Detailed analysis of line 247 ===');
const l247 = lines[246];
console.log('Full line:', JSON.stringify(l247));
