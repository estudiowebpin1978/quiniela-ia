const fs = require('fs');
const path = 'lib/pipeline/precompute/lote-diario.ts';
let content = fs.readFileSync(path, 'utf8');
if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
const lines = content.split(/\r?\n/);
// Replace lines 246-247 (catch block) with simpler version
lines[246] = '      } catch (e: unknown) {';
lines[247] = '      const errMsg = e instanceof Error ? e.message : String(e)';
content = lines.join('\n');
fs.writeFileSync(path, content);
console.log('Replaced complex ternary with simple version');
