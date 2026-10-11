import { distribution, seedClusterInterval } from './lib/report-statistics.mjs';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { CLASS_ORDER } from '../src/sim/stats.js';
import { DIFFICULTY, SURFACES, WEATHER_ORDER } from '../src/sim/constants.js';
import { runMatch } from './lib/match-runner.mjs';
const ALL_DIFFS = Object.keys(DIFFICULTY);
export function parseArgs(argv) {
  const out = { seeds: 3, difficulties: ALL_DIFFS, classId: null, json: null, maxSeconds: 5400, surface: 'hard', weather: 'night', mode: 'demo', bestOf: 1 };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') { out.help = true; continue; }
    if (!['--seeds', '--difficulties', '--class', '--json', '--max-seconds', '--surface', '--weather', '--mode', '--best-of'].includes(flag)) throw new Error('Unknown option: ' + flag);
    const value = argv[++i]; if (!value || value.startsWith('--')) throw new Error('Missing value: ' + flag);
    if (flag === '--seeds') { out.seeds = Number(value); if (!Number.isSafeInteger(out.seeds) || out.seeds < 1) throw new Error('Seeds must be a positive integer'); }
    if (flag === '--difficulties') { out.difficulties = value.split(','); if (out.difficulties.some(d => !ALL_DIFFS.includes(d)) || new Set(out.difficulties).size !== out.difficulties.length) throw new Error('Invalid difficulties'); }
    if (flag === '--class') { out.classId = value; if (!CLASS_ORDER.includes(value)) throw new Error('Invalid class'); }
    if (flag === '--mode') { if (!['demo','singles'].includes(value)) throw new Error('Invalid mode'); out.mode=value; }
    if (flag === '--best-of') { out.bestOf=Number(value); if (![1,3,5].includes(out.bestOf)) throw new Error('Invalid best-of'); }
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
  const results = {}, records = [], cache = new Map();
  const selected = config.classId ? [config.classId] : CLASS_ORDER;
  for (const difficulty of config.difficulties) for (const A of selected) for (const B of CLASS_ORDER) {
    const row = { matches: 0, completed: 0, timeouts: 0, winsA: 0, gamesA: 0, gamesB: 0, bpOpportunitiesA: 0, bpConvertedA: 0, bpFacedA: 0, bpSavedA: 0, breaksA: 0 };
    const cellRecords=[];
    for (let seed = 1; seed <= config.seeds; seed++) for (const swap of [false, true]) {
      const aSide = swap ? 'b' : 'a', bSide = swap ? 'a' : 'b';
      const players = Object.fromEntries(['a1', 'a2', 'b1', 'b2'].map(id => [id, { classId: id[0] === aSide ? A : B }]));
      const options={mode:config.mode??'demo',seed,difficulty,bestOf:config.bestOf??1,surface:config.surface,weather:config.weather,players};
      const key=JSON.stringify(options);
      if(!cache.has(key))cache.set(key,runMatch({options,maxSeconds:config.maxSeconds,cpuHumans:options.mode==='singles'}));
      const match=cache.get(key),record={classA:A,classB:B,swap,...match};
      records.push(record);cellRecords.push(record);row.matches++;
      if (match.timeout) { row.timeouts++; continue; } // censored matches never become wins/losses
      row.completed++; row.winsA += match.winner === aSide ? 1 : 0;
      for (const set of match.score.sets) { row.gamesA += set[aSide]; row.gamesB += set[bSide]; }
      row.bpOpportunitiesA += match.breakPoints.opportunities[aSide]; row.bpConvertedA += match.breakPoints.converted[aSide];
      row.bpFacedA += match.breakPoints.faced[aSide]; row.bpSavedA += match.breakPoints.saved[aSide]; row.breaksA += match.breakPoints.breaks[aSide];
    }
    const completed=cellRecords.filter(r=>r.completed);
    row.durationSeconds=distribution(completed.map(r=>r.simulatedSeconds));
    row.pointSeconds=distribution(completed.flatMap(r=>r.pointSeries.map(p=>p.seconds)));
    row.rallyHits=distribution(completed.flatMap(r=>r.pointSeries.map(p=>p.hits)));
    row.winRateInterval=seedClusterInterval(cellRecords);
    results[`${difficulty}|${A}|${B}`] = row;
  }
  return { schemaVersion: 2, profileVersion: 'shared-physics-v1', aiDecisionVersion: 'common-claim-v2', seedRange: { first: 1, last: config.seeds }, protocol: { mirroredSides: true, independentSamplingUnit: 'seed cluster', uniqueSimulations: cache.size, recordedPerspectives: records.length, timeoutPolicy: 'excluded from wins/distributions; incomplete seed clusters excluded from interval' }, config, runtime, results, records };
}
export function main(argv) {
  const config = parseArgs(argv);
  if (config.help) { console.log('usage: npm run balance:matrix -- [--seeds N] [--difficulties easy,normal,hard,unfair,impossible] [--class id] [--surface hard|clay|grass] [--weather kind] [--mode demo|singles] [--best-of 1|3|5] [--max-seconds N] [--json file]'); return; }
  const report = runMatrix(config);
  for (const [cell, row] of Object.entries(report.results)) console.log(`${cell}: ${row.completed}/${row.matches} completed; ${row.timeouts} timeouts; ${row.completed ? (100 * row.winsA / row.completed).toFixed(1) + '%' : 'n/a'} wins; BP converted ${row.bpConvertedA}/${row.bpOpportunitiesA}; BP saved ${row.bpSavedA}/${row.bpFacedA}`);
  if (config.json) writeFileSync(config.json, JSON.stringify(report, null, 2) + '\n');
  if (report.records.some(r => r.timeout)) process.exitCode = 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
