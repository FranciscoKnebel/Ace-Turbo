export function makeStats() {
  return {
    serves: 0,
    firstServes: 0,
    secondServes: 0,
    faults: 0,
    doubleFaults: 0,
    lets: 0,
    aces: 0,
    tosses: 0,
    tossQualitySum: 0,
    hits: 0,
    turboShots: 0,
    points: 0,
    winners: 0,
    errorsOut: 0,
    errorsNet: 0,
    touches: 0,
    shots: { flat: 0, topspin: 0, slice: 0, lob: 0 },
    situations: { fundo: 0, devolucao: 0, voleio: 0, smash: 0, 'meio-voleio': 0 },
    hands: { forehand: 0, backhand: 0, neutral: 0 },
    serveTypes: { flat: 0, topspin: 0, slice: 0, power: 0 },
    reasons: {},
  };
}

/** Metric definitions describe legacy counters without changing their values. */
export const METRICS = Object.freeze({
  serves: { unit: 'attempts', source: 'serve: executed contact, including faults/lets' },
  firstServes: { unit: 'attempts', source: 'serve: attempt 1' },
  secondServes: { unit: 'attempts', source: 'serve: attempt 2' },
  faults: { unit: 'faults', source: 'fault: includes lost tosses and both attempts' },
  doubleFaults: { unit: 'points', source: 'doubleFault: second failed attempt' },
  lets: { unit: 'replays', source: 'let: net touch and legal service bounce' },
  aces: { unit: 'points', source: 'point: legal serve not returned' },
  tosses: { unit: 'launches', source: 'toss' },
  tossQualitySum: { unit: 'adjusted quality sum (0–1 per launch)', source: 'toss quality, corrected to contact quality if struck; lost toss retains launch quality; legacy name' },
  hits: { unit: 'contacts', source: 'hit: rally contacts excluding serve' },
  turboShots: { unit: 'contacts', source: 'turbo: reserve spent on rally contact' },
  points: { unit: 'points', source: 'point: once per awarded point' },
  winners: { unit: 'points', source: 'point: point/doubleBounce reasons; aces excluded' },
  errorsOut: { unit: 'points', source: 'point: out/outOfArea' },
  errorsNet: { unit: 'points', source: 'point: net' },
  touches: { unit: 'points', source: 'point: partner/player contact' },
  shots: { unit: 'contacts by shot', source: 'hit' },
  hands: { unit: 'contacts by hand', source: 'hit' },
  situations: { unit: 'contacts by situation', source: 'hit' },
  serveTypes: { unit: 'attempts by type', source: 'serve' },
  reasons: { unit: 'points by reason', source: 'point' },
});

/** Synchronous event reducer; operates on total and current set identically. */
export function reduceStats(stats, event) {
  const add = (key, n = 1) => { stats[key] = (stats[key] ?? 0) + n; };
  const group = (key, value) => { stats[key][value] = (stats[key][value] ?? 0) + 1; };
  switch (event.type) {
    case 'toss': add('tosses'); add('tossQualitySum', event.quality); break;
    case 'serveContact': add('tossQualitySum', event.qualityDelta); break;
    case 'serve': add('serves'); add(event.attempt === 1 ? 'firstServes' : 'secondServes'); group('serveTypes', event.shot); break;
    case 'hit': add('hits'); group('shots', event.shot); group('hands', event.hand); group('situations', event.situation); break;
    case 'turbo': add('turboShots'); break;
    case 'fault': add('faults'); break;
    case 'doubleFault': add('doubleFaults'); break;
    case 'let': add('lets'); break;
    case 'point':
      add('points'); group('reasons', event.reason);
      if (event.reason === 'ace') add('aces');
      else if (['point', 'doubleBounce'].includes(event.reason)) add('winners');
      else if (['out', 'outOfArea'].includes(event.reason)) add('errorsOut');
      else if (event.reason === 'net') add('errorsNet');
      else if (['partner', 'player'].includes(event.reason)) add('touches');
      break;
    case 'metric':
      if (event.group) stats[event.group][event.key] = (stats[event.group][event.key] ?? 0) + event.amount;
      else add(event.key, event.amount);
      break;
  }
  return stats;
}
export function observeTelemetry(world, event) {
  reduceStats(world.stats, event); reduceStats(world.setStats, event);
}
export function emitEvent(world, event) {
  observeTelemetry(world, event); world.events.push(event);
}
// Compatibility helpers for callers that record a named metric directly.
export const bump = (world, key, amount = 1) => observeTelemetry(world, { type: 'metric', key, amount });
export const bumpAmount = bump;
export const bumpGroup = (world, group, key, amount = 1) => observeTelemetry(world, { type: 'metric', group, key, amount });
export const snapshotStats = stats => structuredClone(stats);
