import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
export function isTestFile(path) {
  const parts = path.split(/[\\/]/), name = parts.at(-1);
  if (/\.(cjs|mjs|js)$/.test(name)) return parts.slice(0, -1).includes('test') || /^(test|test-.+|.+[._-]test)\.(cjs|mjs|js)$/.test(name);
  return parts.slice(0, -1).includes('test') && /[._-]test\.(cts|mts|ts)$/.test(name);
}
export function testSources(root, dir = '') {
  return readdirSync(join(root, dir), { withFileTypes: true }).filter(e => e.name !== 'node_modules' && e.name !== '.git').map(e => {
    const p = dir ? dir + '/' + e.name : e.name;
    return e.isDirectory() ? testSources(root, p) : isTestFile(p) ? readFileSync(join(root, p), 'utf8') : '';
  }).join('\n');
}
