import { PHASES } from '../contracts.js';
const NEXT = Object.freeze({ serve: ['serve', 'rally', 'pointover'], rally: ['rally', 'serve', 'pointover'], pointover: ['pointover', 'serve', 'matchover'], matchover: ['matchover', 'serve'] });
export function transitionPhase(world, next) {
  if (!PHASES.includes(next) || !NEXT[world.phase]?.includes(next)) throw new Error(`Invalid phase transition: ${world.phase} -> ${next}`);
  world.phase = next;
}
export function enterPointPause(world, duration) {
  if (!Number.isFinite(duration) || duration <= 0) throw new RangeError('Invalid point pause');
  transitionPhase(world, 'pointover');
  world.pauseDuration = duration; world.phaseTimer = duration;
  world.serve.inFlight = false; world.serve.returnPending = false;
}
