const fs = require('fs');
const t = fs.readFileSync('convex/prompts/dentalEv.ts', 'utf8');
const m = t.match(/=\s*`([\s\S]*?)`\s*;/);
if (m) {
  fs.writeFileSync('scripts/dental-prompt.txt', m[1]);
  console.log('wrote ' + m[1].length + ' chars');
} else {
  console.log('no match');
}
