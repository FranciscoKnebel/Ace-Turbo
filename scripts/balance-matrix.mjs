import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { CLASS_ORDER } from '../src/sim/stats.js';
import { DIFFICULTY, SURFACES, WEATHER_ORDER } from '../src/sim/constants.js';
import { runMatch } from './lib/match-runner.mjs';
const ALL_DIFFS = Object.keys(DIFFICULTY);
export function parseArgs(argv) {
  const out = { seeds: 3, difficulties: ALL_DIFFS, classId: null, json: null, maxSeconds: 5400, surface: 'hard', weather: 'night' };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') { out.help = true; continue; }
    if (!['--seeds', '--difficulties', '--class', '--json', '--max-seconds', '--surface', '--weather'].includes(flag)) throw new Error('Unknown option: ' + flag);
    const value = argv[++i]; if (!value || value.startsWith('--')) throw new Error('Missing value: ' + flag);
    if (flag === '--seeds') { out.seeds = Number(value); if (!Number.isSafeInteger(out.seeds) || out.seeds < 1) throw new Error('Seeds must be a positive integer'); }
    if (flag === '--difficulties') { out.difficulties = value.split(','); if (out.difficulties.some(d => !ALL_DIFFS.includes(d)) || new Set(out.difficulties).size !== out.difficulties.length) throw new Error('Invalid difficulties'); }
    if (flag === '--class') { out.classId = value; if (!CLASS_ORDER.includes(value)) throw new Error('Invalid class'); }
    if (flag === '--json') out.json = value;
    if (flag === '--max-seconds') { out.maxSeconds = Number(value); if (!Number.isFinite(out.maxSeconds) || out.maxSeconds <= 0) throw new Error('Invalid max-seconds'); }
    if (flag === '--surface') { if (!SURFACES[value]) throw new Error('Invalid surface'); out.surface = value; }
    if (flag === '--weather') { if (!WEATHER_ORDER.includes(value)) throw new Error('Invalid weather'); out.weather = value; }
  }
  return out;
}
export function runMatrix(config) {
  const runtime = { node: process.version, revision: 'unknown', tree: 'unknown', dirty: null };
  try {
    const git = args => execFileSync('git', args, { cwd: new URL('..', import.meta.url), encoding: 'utf8' }).trim();
    runtime.revision = git(['rev-parse', 'HEAD']); runtime.tree = git(['rev-parse', 'HEAD^{tree}']); runtime.dirty = Boolean(git(['status', '--porcelain']));
  } catch {}
  const results = {}, records = [];
  const selected = config.classId ? [config.classId] : CLASS_ORDER;
  for (const difficulty of config.difficulties) for (const A of selected) for (const B of CLASS_ORDER) {
    const row = { matches: 0, completed: 0, timeouts: 0, winsA: 0, gamesA: 0, gamesB: 0, bpOpportunitiesA: 0, bpConvertedA: 0, bpFacedA: 0, bpSavedA: 0, breaksA: 0 };
    for (let seed = 1; seed <= config.seeds; seed++) for (const swap of [false, true]) {
      const aSide = swap ? 'b' : 'a', bSide = swap ? 'a' : 'b';
      const players = Object.fromEntries(['a1', 'a2', 'b1', 'b2'].map(id => [id, { classId: id[0] === aSide ? A : B }]));
      const match = runMatch({ options: { mode: 'demo', seed, difficulty, bestOf: 1, surface: config.surface, weather: config.weather, players }, maxSeconds: config.maxSeconds });
      records.push({ classA: A, classB: B, swap, ...match }); row.matches++;
      if (match.timeout) { row.timeouts++; continue; } // censored matches never become wins/losses
      row.completed++; row.winsA += match.winner === aSide ? 1 : 0;
      for (const set of match.score.sets) { row.gamesA += set[aSide]; row.gamesB += set[bSide]; }
      row.bpOpportunitiesA += match.breakPoints.opportunities[aSide]; row.bpConvertedA += match.breakPoints.converted[aSide];
      row.bpFacedA += match.breakPoints.faced[aSide]; row.bpSavedA += match.breakPoints.saved[aSide]; row.breaksA += match.breakPoints.breaks[aSide];
    }
    results[`${difficulty}|${A}|${B}`] = row;
  }
  return { schemaVersion: 1, config, runtime, results, records };
}
export function main(argv) {
  const config = parseArgs(argv);
  if (config.help) { console.log('usage: npm run balance:matrix -- [--seeds N] [--difficulties easy,normal,hard,unfair,impossible] [--class id] [--surface hard|clay|grass] [--weather kind] [--max-seconds N] [--json file]'); return; }
  const report = runMatrix(config);
  for (const [cell, row] of Object.entries(report.results)) console.log(`${cell}: ${row.completed}/${row.matches} completed; ${row.timeouts} timeouts; ${row.completed ? (100 * row.winsA / row.completed).toFixed(1) + '%' : 'n/a'} wins; BP converted ${row.bpConvertedA}/${row.bpOpportunitiesA}; BP saved ${row.bpSavedA}/${row.bpFacedA}`);
  if (config.json) writeFileSync(config.json, JSON.stringify(report, null, 2) + '\n');
  if (report.records.some(r => r.timeout)) process.exitCode = 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
