import { PHASES } from '../contracts.js';
export function makeServeState(overrides = {}) {
  return { id: 0, serverId: null, serverTeam: 'a', receiverId: null, receiverTeam: 'b',
    attempt: 1, inFlight: false, returned: false, returnPending: false,
    stage: 'toss', box: null, toss: null, lastServe: null, ...overrides };
}
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
  world.serve.toss = null;
}

export function enterServePreparation(world) {
  transitionPhase(world, 'serve');
  Object.assign(world.serve, { inFlight: false, returned: false, returnPending: false,
    stage: 'toss', box: null, toss: null });
}
export function enterServeToss(world, toss) {
  transitionPhase(world, 'serve');
  Object.assign(world.serve, { stage: 'hit', toss, inFlight: false, returnPending: false });
}
export function enterServeFlight(world) {
  transitionPhase(world, 'serve');
  Object.assign(world.serve, { stage: 'flight', toss: null, inFlight: true,
    returned: false, returnPending: true });
}
export function enterRally(world, { returned = false } = {}) {
  transitionPhase(world, 'rally');
  world.serve.inFlight = false;
  if (returned) { world.serve.returned = true; world.serve.returnPending = false; }
}

/** Public diagnostic state; legacy phase/stage fields remain compatible. */
export function matchState(world) {
  if (world.phase !== 'serve') return world.phase === 'rally' && world.serve.returnPending ? 'rally.return' : world.phase;
  return world.serve.inFlight ? 'serve.flight' : world.serve.toss ? 'serve.toss' : 'serve.prepare';
}
/** Check only at tick boundaries, after each atomic state entry finishes. */
export function assertMatchInvariants(world) {
  const { serve: s, ball, score } = world, state = matchState(world);
  const require = (ok, reason) => { if (!ok) throw new Error(`Invalid match state ${state}: ${reason}`); };
  require(PHASES.includes(world.phase), 'phase');
  require([1, 2].includes(s.attempt), 'serve attempt');
  require(world.byId[s.serverId]?.team === s.serverTeam, 'server identity');
  require(world.byId[s.receiverId]?.team === s.receiverTeam, 'receiver identity');
  if (state === 'serve.prepare') {
    require(s.stage === 'toss' && !s.returnPending && !s.returned, 'preparation flags');
    require(ball.heldBy === s.serverId && !ball.dead, 'held ball');
  } else if (state === 'serve.toss') {
    require(s.stage === 'hit' && !s.returnPending && !s.returned, 'toss flags');
    require(s.toss.playerId === s.serverId && !ball.heldBy && !ball.dead, 'toss ball');
  } else if (state === 'serve.flight' || state === 'rally.return') {
    require(s.stage === 'flight' && s.returnPending && !s.returned && !s.toss && s.box, 'service flight flags');
    require(!ball.heldBy && ball.lastHit?.isServe, 'service ball');
  } else if (state === 'rally') {
    require(!s.inFlight && !s.toss && !ball.heldBy, 'rally flags');
  } else {
    require(!s.inFlight && !s.returnPending && !s.toss, 'pause/end flags');
    require(world.players.every(p => !p.charging && !p.swing), 'active shot after point');
    if (state === 'matchover') require(Boolean(score.winner), 'missing winner');
  }
  return state;
}
