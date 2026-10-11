import { distribution } from './report-statistics.mjs';
import { assertMatchInvariants } from '../../src/sim/systems/phases.js';
import { createWorld, stepWorld } from '../../src/sim/world.js';
import { createAI } from '../../src/sim/ai.js';
import { DIFFICULTY, PLAYER } from '../../src/sim/constants.js';
const other = team => team === 'a' ? 'b' : 'a';
export function breakPointTeam(score) {
  if (score.tiebreak || score.winner) return null;
  const receiver = other(score.server);
  return score.points[receiver] >= 3 && (score.noAd || score.points[receiver] > score.points[score.server]) ? receiver : null;
}
export function runMatch({ options = {}, dt = 1 / 120, maxSeconds = 5400, cpuHumans = false, inputDriver = null } = {}) {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.05 || !Number.isFinite(maxSeconds) || maxSeconds <= 0) throw new RangeError('Invalid simulation duration');
  const world = createWorld(options);
  if (cpuHumans) {
    const difficulty = DIFFICULTY[world.difficulty];
    for (const p of world.players) if (p.human) {
      p.human = false; p.ai = createAI(difficulty); p.maxSpeed = PLAYER.MAX_SPEED * difficulty.speedMult;
    }
  } else if (world.players.some(p => p.human) && !inputDriver) throw new Error('Human modes require inputDriver or cpuHumans');
  const bp = { opportunities: { a: 0, b: 0 }, converted: { a: 0, b: 0 }, faced: { a: 0, b: 0 }, saved: { a: 0, b: 0 }, breaks: { a: 0, b: 0 } };
  const maxTicks = Math.ceil(maxSeconds / dt);
  if (!Number.isSafeInteger(maxTicks)) throw new RangeError('Tick limit exceeds safe integer range');
  let ticks = 0, pointStarted = 0;
  const pointSeries = [];
  while (world.phase !== 'matchover' && ticks < maxTicks) {
    const receiver = breakPointTeam(world.score), server = world.score.server, wasTiebreak = world.score.tiebreak;
    const previousPhase = world.phase;
    inputDriver?.(world, ticks);
    stepWorld(world, dt); ticks++;
    if (ticks % 120 === 0) {
      const ball = world.ball;
      const numbers = [world.elapsed, ball.x, ball.y, ball.z, ball.vx, ball.vy, ball.vz,
        ...world.players.flatMap(p => [p.x, p.y, p.vx, p.vy, p.stamina, p.turbo])];
      if (!numbers.every(Number.isFinite) || world.players.some(p => p.stamina < 0 || p.turbo < 0)) throw new Error(`Invalid simulation state: seed ${world.seed}, tick ${ticks}`);
      assertMatchInvariants(world);
    }
    if (previousPhase === 'pointover' && world.phase === 'serve') pointStarted = world.elapsed;
    for (const event of world.events) if (event.type === 'point') pointSeries.push({ seconds: world.elapsed - pointStarted, hits: world.rallyShots });
    for (const event of world.events) if (event.type === 'point' && !wasTiebreak) {
      if (receiver) {
        bp.opportunities[receiver]++; bp.faced[server]++;
        if (event.team === receiver) bp.converted[receiver]++;
        else bp.saved[server]++;
      }
      if (event.gameWon && event.team !== server) bp.breaks[event.team]++;
    }
  }
  const completed = world.phase === 'matchover';
  return { completed, timeout: !completed, winner: completed ? world.score.winner : null, ticks,
    simulatedSeconds: ticks * dt, options: { mode: world.mode, seed: world.seed, difficulty: world.difficulty, bestOf: world.score.bestOf, surface: world.surface, weather: world.weather.kind, noAd: world.score.noAd, superTiebreak: world.score.superTiebreak },
    score: { sets: structuredClone(world.score.sets), setsWon: { ...world.score.setsWon }, games: { ...world.score.games }, points: { ...world.score.points } },
    metrics: { pointSeconds: distribution(pointSeries.map(p=>p.seconds)), rallyHits: distribution(pointSeries.map(p=>p.hits)), finalEnergy: world.players.map(p=>({id:p.id,stamina:p.stamina,turbo:p.turbo})) }, pointSeries,
    stats: structuredClone(world.stats), breakPoints: bp };
}
