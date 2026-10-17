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

export function bump(world, key, n = 1) {
  world.stats[key] = (world.stats[key] ?? 0) + n;
  world.setStats[key] = (world.setStats[key] ?? 0) + n;
}

export function bumpAmount(world, key, amount) {
  world.stats[key] = (world.stats[key] ?? 0) + amount;
  world.setStats[key] = (world.setStats[key] ?? 0) + amount;
}

export function bumpGroup(world, group, key, n = 1) {
  world.stats[group][key] = (world.stats[group][key] ?? 0) + n;
  world.setStats[group][key] = (world.setStats[group][key] ?? 0) + n;
}

export function snapshotStats(stats) {
  return JSON.parse(JSON.stringify(stats));
}

// ---------------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------------
