import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runMatch } from './lib/match-runner.mjs';
import { CLASS_ORDER, staminaMaxOf } from '../src/sim/stats.js';
import { TURBO } from '../src/sim/constants.js';

export function scenarios(count = 40) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 200) throw new RangeError('Cases must be 1..200');
  return Array.from({ length: count }, (_, i) => ({
    options: { seed: (0x9e3779b9 * (i + 1)) >>> 0,
      mode: ['demo', 'singles', 'versus', 'coop'][i % 4],
      difficulty: ['easy', 'normal', 'hard', 'unfair', 'impossible'][i % 5],
      surface: ['hard', 'clay', 'grass'][i % 3], weather: ['night', 'day', 'windy', 'random'][Math.floor(i / 3) % 4],
      bestOf: [1, 3, 5][Math.floor(i / 5) % 3], noAd: i % 2 === 0, superTiebreak: Math.floor(i / 2) % 2 === 0,
      players: Object.fromEntries(['a1', 'a2', 'b1', 'b2'].map((id, n) => [id, i % 10 === 0 ?
        { classId: 'custom', stats: { power: n % 2 ? 50 : 99, technique: n % 2 ? 99 : 50, serve: n % 2 ? 50 : 99, stamina: n % 2 ? 99 : 50 } } :
        { classId: i % 7 === 0 ? 'random' : CLASS_ORDER[(i + n) % CLASS_ORDER.length] }])) },
    dt: [1 / 120, 1 / 60, .05][i % 3], maxSeconds: 14400, cpuHumans: true,
  }));
}
export function executeScenario(config) {
  const trace = []; let accounting = null;
  try {
    const match = runMatch({ ...config, inputDriver(world, tick) {
      if (tick % 120 !== 0) return;
      trace.push({ tick, elapsed: world.elapsed, phase: world.phase, ball: { ...world.ball, lastHit: world.ball.lastHit ? { ...world.ball.lastHit } : null },
        players: world.players.map(p => ({ id: p.id, x: p.x, y: p.y, stamina: p.stamina, turbo: p.turbo, input: structuredClone(p.input) })) });
      if (trace.length > 60) trace.shift();
      for (const p of world.players) {
        assert.ok(p.stamina >= -1e-7 && p.stamina <= staminaMaxOf(p) + 1e-7, `stamina: ${p.id}, tick ${tick}`);
        assert.ok(p.turbo >= -1e-7 && p.turbo <= TURBO.MAX + 1e-7, `turbo: ${p.id}, tick ${tick}`);
      }
      accounting = world;
    } });
    assert.equal(match.completed, true, 'Match timed out; never treated as a victory');
    assert.equal(match.score.sets.length, accounting.setHistory.length);
    for (const [key, value] of Object.entries(match.stats)) {
      if (typeof value !== 'number' || key === 'tossQualitySum') continue;
      assert.equal(value, accounting.setHistory.reduce((sum, set) => sum + set[key], 0), 'set accounting: ' + key);
    }
    assert.equal(Object.values(match.stats.reasons).reduce((a, b) => a + b, 0), match.stats.points);
    assert.equal(Object.values(match.stats.shots).reduce((a, b) => a + b, 0), match.stats.hits);
    return { passed: true, config, match };
  } catch (error) { return { passed: false, config, error: { message: error.message, stack: error.stack }, trace }; }
}
export async function main(argv) {
  let count = 40, output = 'browser-artifacts/stress.json', replay = null;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i], value = argv[++i];
    if (!['--cases', '--output', '--replay'].includes(flag) || !value || value.startsWith('--')) throw Error('Invalid argument: ' + flag);
    if (flag === '--cases') count = Number(value);
    if (flag === '--output') output = value;
    if (flag === '--replay') replay = value;
  }
  const configs = replay ? [JSON.parse(await readFile(replay, 'utf8')).config] : scenarios(count);
  const records = [];
  for (const config of configs) { records.push(executeScenario(config)); console.log(`stress ${records.length}/${configs.length}: ${records.at(-1).passed ? 'passed' : 'FAILED'}, seed ${config.options.seed}`); }
  const repeats = [];
  const replayFailures = [];
  if (!replay) for (const index of [0, Math.floor(configs.length / 2), configs.length - 1]) {
    const rerun = executeScenario(configs[index]);
    const comparable = result => ({ ...result, error: result.error?.message });
    try { assert.deepEqual(comparable(rerun), comparable(records[index]), 'Non-deterministic replay: ' + index); repeats.push(index); }
    catch (error) { replayFailures.push({ index, error: error.message, rerun }); }
  }
  await mkdir(dirname(resolve(output)), { recursive: true });
  const git = args => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const report = { schemaVersion: 1, protocol: 'stress-v1', runtime: { node: process.version, revision: git(['rev-parse', 'HEAD']), tree: git(['rev-parse', 'HEAD^{tree}']) },
    limitations: ['Configuration sample, not a Cartesian exhaustiveness claim. CPU substitution in human modes is not a keyboard test.', 'Trace contains sampled CPU inputs; replay recomputes the deterministic match from its full configuration.'],
    deterministicRepeats: repeats, replayFailures, records };
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  for (const [index, record] of records.entries()) if (!record.passed) await writeFile(output + `.failure-${index}.json`, JSON.stringify(record, null, 2) + '\n');
  if (records.some(record => !record.passed) || replayFailures.length) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
