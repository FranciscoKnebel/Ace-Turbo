import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
export function isTestFile(path) {
  const parts = path.split(/[\\/]/), name = parts.at(-1);
  if (parts.some(part => part.startsWith('.'))) return false;
  // Node aceita curinga vazio nos padrões test-*, *-test e *_test (ex.: test-.js,
  // -test.js e _test.js); o mesmo conjunto é usado aqui para o audit não divergir.
  if (/\.(cjs|mjs|js|cts|mts|ts)$/.test(name)) return parts.slice(0, -1).includes('test') || /^(test|test-.*|.*[._-]test)\.(cjs|mjs|js|cts|mts|ts)$/.test(name);
  return false;
}
export function testSources(root, dir = '') {
  return readdirSync(join(root, dir), { withFileTypes: true }).filter(e => e.name !== 'node_modules' && !e.name.startsWith('.')).map(e => {
    const p = dir ? dir + '/' + e.name : e.name;
    return e.isDirectory() ? testSources(root, p) : isTestFile(p) ? readFileSync(join(root, p), 'utf8') : '';
  }).join('\n');
}
