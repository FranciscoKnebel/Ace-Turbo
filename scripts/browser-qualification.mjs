import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { engine } from './lib/browser-engine.mjs';
const suites = ['smoke', 'gameplay', 'resilience', 'lifecycle', 'accessibility', 'performance'];
const results = [];
// Independent suites still execute after a failure, preserving all diagnostics.
for (const suite of suites) {
  const result = await new Promise(resolve => {
    const child = spawn(process.execPath, [`scripts/browser-${suite}.mjs`], { stdio: 'inherit', timeout: 300000 });
    child.once('error', error => resolve({ suite, passed: false, error: error.message }));
    child.once('exit', (code, signal) => resolve({ suite, passed: code === 0, code, signal }));
  });
  results.push(result);
}
const directory = new URL(`../browser-artifacts/${engine}/`, import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('suite-summary.json', directory), JSON.stringify({ engine, results }, null, 2) + '\n');
if (results.some(result => !result.passed)) process.exitCode = 1;
