const fs = require('fs');
const path = 'lib/pipeline/precompute/lote-diario.ts';
let content = fs.readFileSync(path, 'utf8');
if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
const lines = content.split(/\r?\n/);
// Look for null bytes anywhere (U+0000) - these break JS parsers
let nullPositions = [];
for (let i = 0; i < lines.length; i++) {
  for (let j = 0; j < lines[i].length; j++) {
    if (lines[i].charCodeAt(j) === 0x00) {
      nullPositions.push({ line: i+1, pos: j });
    }
  }
}
console.log('Null bytes found:', nullPositions.length);
if (nullPositions.length > 0) {
  console.log(JSON.stringify(nullPositions.slice(0, 10), null, 2));
}

// Also check: look at the entire file size vs line count
console.log('Total lines:', lines.length);
console.log('Total content length:', content.length);
console.log('First char U+', content.charCodeAt(0).toString(16));
console.log('Last char U+', content.charCodeAt(content.length - 1).toString(16));

// Print lines around 240-260 with exact char count
console.log('\n=== Lines 240-260 char counts ===');
for (let i = 239; i < Math.min(261, lines.length); i++) {
  console.log(`Line ${i+1}: [${lines[i]}] len=${lines[i] ? lines[i].length : 0}`);
}
