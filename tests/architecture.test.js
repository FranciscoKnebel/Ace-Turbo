import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../src/', import.meta.url));
function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(resolve(dir, e.name)) : e.name.endsWith('.js') ? [resolve(dir, e.name)] : []); }
test('simulação não importa DOM/apresentação e grafo de módulos não tem ciclos', () => {
  const graph = new Map();
  for (const path of files(root)) {
    const text = readFileSync(path, 'utf8');
    const dependencies = [...text.matchAll(/^(?:import|export)\s+\{[^}]*\}\s+from\s+['"]([^'"]+)['"]/gm)].map(m => resolve(dirname(path), m[1]));
    graph.set(path, dependencies);
    if (relative(root, path).startsWith('sim/')) for (const dependency of dependencies) assert.ok(relative(root, dependency).startsWith('sim/'), `${path} imports ${dependency}`);
  }
  const active = new Set(), visited = new Set();
  function visit(path) {
    assert.ok(!active.has(path), 'cycle at ' + relative(root, path)); if (visited.has(path)) return;
    active.add(path); for (const dependency of graph.get(path) ?? []) visit(dependency); active.delete(path); visited.add(path);
  }
  for (const path of graph.keys()) visit(path);
});
