// Matriz de equilíbrio das classes: roda o confronto de todas contra todas, em
// todas as dificuldades, e imprime as tabelas de vitórias, games e break
// points. É a ferramenta usada para calibrar classes, força/técnica e vigor.
//
// Uso:
//   node scripts/balance-matrix.mjs                       # matriz completa
//   node scripts/balance-matrix.mjs --seeds 5             # mais partidas por célula
//   node scripts/balance-matrix.mjs --difficulties normal,hard
//   node scripts/balance-matrix.mjs --class speedster     # medição focada
//   node scripts/balance-matrix.mjs --json /tmp/matriz.json
import { createWorld, stepWorld } from '../src/sim/world.js';
import { CLASS_ORDER } from '../src/sim/stats.js';

const ALL_DIFFS = ['easy', 'normal', 'hard', 'unfair', 'impossible'];
const NAME = {
  balanced: 'Equilibrado',
  power: 'Potência',
  wall: 'Muralha',
  server: 'Sacador',
  technician: 'Técnico',
  speedster: 'Velocista',
  veteran: 'Veterano',
  bruiser: 'Brutamontes',
};
const SHORT = {
  balanced: 'Equ',
  power: 'Pot',
  wall: 'Mur',
  server: 'Sac',
  technician: 'Téc',
  speedster: 'Vel',
  veteran: 'Vet',
  bruiser: 'Bru',
};
const other = (team) => (team === 'a' ? 'b' : 'a');
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const pad = (s, n) => String(s).padEnd(n);

function parseArgs(argv) {
  const out = { seeds: 3, difficulties: ALL_DIFFS, classId: null, json: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seeds') out.seeds = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--difficulties') out.difficulties = String(argv[++i] ?? '').split(',');
    else if (a === '--class') out.classId = argv[++i];
    else if (a === '--json') out.json = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log('uso: node scripts/balance-matrix.mjs [--seeds N] [--difficulties a,b] [--class id] [--json arquivo]');
      process.exit(0);
    }
  }
  out.difficulties = out.difficulties.filter((d) => ALL_DIFFS.includes(d));
  if (!out.difficulties.length) out.difficulties = ALL_DIFFS;
  return out;
}

// Roda uma partida com as classes dadas e devolve o resultado + break points.
function runMatch({ classA, classB, difficulty, seed, swap }) {
  const cls = (side) => (swap ? (side === 'a' ? classB : classA) : side === 'a' ? classA : classB);
  const world = createWorld({
    mode: 'demo',
    seed,
    difficulty,
    bestOf: 1,
    players: {
      a1: { classId: cls('a') },
      a2: { classId: cls('a') },
      b1: { classId: cls('b') },
      b2: { classId: cls('b') },
    },
  });
  let steps = 0;
  let bpTeam = null;
  let gameServer = null;
  const bp = { facedA: 0, convA: 0, facedB: 0, convB: 0, breaksA: 0, breaksB: 0 };
  while (world.phase !== 'matchover' && steps < 120 * 5400) {
    const prevServeId = world.serve.id;
    stepWorld(world, 1 / 120);
    steps++;
    if (world.serve.id !== prevServeId && world.phase === 'serve') {
      const s = world.score;
      const server = world.serve.serverTeam;
      const recv = other(server);
      gameServer = server;
      bpTeam = s.points[recv] >= 3 && s.points[recv] > s.points[server] ? recv : null;
    }
    for (const ev of world.events) {
      if (ev.type !== 'point') continue;
      const recv = other(gameServer ?? 'a');
      if (bpTeam === recv) {
        if (cls(recv) === classA) {
          bp.facedA++;
          if (ev.team === recv) bp.convA++;
        } else {
          bp.facedB++;
          if (ev.team === recv) bp.convB++;
        }
      }
      if (ev.gameWon && ev.team !== gameServer) {
        if (cls(ev.team) === classA) bp.breaksA++;
        else bp.breaksB++;
      }
      bpTeam = null;
    }
  }
  const set = world.score.sets[0] ?? { a: 0, b: 0 };
  const gamesA = swap ? set.b : set.a;
  const gamesB = swap ? set.a : set.b;
  const aWon = swap
    ? world.score.setsWon.b > world.score.setsWon.a
    : world.score.setsWon.a > world.score.setsWon.b;
  return { aWon, gamesA, gamesB, bp };
}

// Matriz completa: A x B em cada dificuldade (os dois lados e todos os seeds).
function runMatrix(opts) {
  const data = {};
  for (const difficulty of opts.difficulties) {
    const t0 = Date.now();
    let matches = 0;
    for (const A of CLASS_ORDER) {
      for (const B of CLASS_ORDER) {
        const res = {
          matches: 0,
          winsA: 0,
          gamesA: 0,
          gamesB: 0,
          bpFacedA: 0,
          bpConvA: 0,
          bpFacedB: 0,
          bpConvB: 0,
          breaksA: 0,
          breaksB: 0,
        };
        for (let seed = 1; seed <= opts.seeds; seed++) {
          for (const swap of [false, true]) {
            const r = runMatch({ classA: A, classB: B, difficulty, seed, swap });
            res.matches++;
            if (r.aWon) res.winsA++;
            res.gamesA += r.gamesA;
            res.gamesB += r.gamesB;
            res.bpFacedA += r.bp.facedA;
            res.bpConvA += r.bp.convA;
            res.bpFacedB += r.bp.facedB;
            res.bpConvB += r.bp.convB;
            res.breaksA += r.bp.breaksA;
            res.breaksB += r.bp.breaksB;
          }
        }
        data[`${difficulty}|${A}|${B}`] = res;
        matches += res.matches;
      }
    }
    console.log(
      `${difficulty}: ${matches} partidas em ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    );
  }
  return data;
}

function printMatrix(opts, data) {
  const get = (d, A, B) => data[`${d}|${A}|${B}`];
  for (const d of opts.difficulties) {
    console.log(`\n### ${d}`);
    console.log(`vitórias da linha sobre a coluna (% de ${get(d, CLASS_ORDER[0], CLASS_ORDER[0]).matches} partidas)`);
    console.log(`${pad('', 13)} ${CLASS_ORDER.map((c) => pad(SHORT[c], 4)).join('')}`);
    for (const A of CLASS_ORDER) {
      const row = CLASS_ORDER.map((B) => pad(pct(get(d, A, B).winsA, get(d, A, B).matches), 4));
      console.log(`${pad(NAME[A], 13)} ${row.join('')}`);
    }
  }
  for (const d of opts.difficulties) {
    console.log(`\n### ${d} (resumo)`);
    console.log(`${pad('classe', 13)} vitórias  games   BP convertidos   BP salvos`);
    const rows = CLASS_ORDER.map((X) => {
      let wins = 0, matches = 0, gW = 0, gT = 0;
      let facedR = 0, convR = 0, facedS = 0, convS = 0;
      for (const B of CLASS_ORDER) {
        const r = get(d, X, B);
        wins += r.winsA;
        matches += r.matches;
        gW += r.gamesA;
        gT += r.gamesA + r.gamesB;
        facedR += r.bpFacedA;
        convR += r.bpConvA;
        facedS += r.bpFacedB;
        convS += r.bpConvB;
      }
      return { X, win: pct(wins, matches), games: pct(gW, gT), facedR, convR, facedS, convS };
    });
    rows.sort((a, b) => b.win - a.win);
    for (const r of rows) {
      console.log(
        `${pad(NAME[r.X], 13)} ${pad(r.win + '%', 8)} ${pad(r.games + '%', 7)} ` +
          `${pad(`${pct(r.convR, r.facedR)}% (${r.convR}/${r.facedR})`, 16)} ` +
          `${pct(r.facedS - r.convS, r.facedS)}% (${r.facedS - r.convS}/${r.facedS})`,
      );
    }
  }
}

// Medição focada: uma classe contra todas, com mais seeds por confronto (a
// matriz tem células pequenas; para decidir um ajuste fino, use esta).
function runFocused(opts) {
  const X = opts.classId;
  const out = {};
  for (const B of CLASS_ORDER) {
    const res = { matches: 0, wins: 0, games: 0, gamesAgainst: 0 };
    for (const d of opts.difficulties) {
      for (let seed = 1; seed <= opts.seeds; seed++) {
        for (const swap of [false, true]) {
          const r = runMatch({ classA: X, classB: B, difficulty: d, seed, swap });
          res.matches++;
          if (r.aWon) res.wins++;
          res.games += r.gamesA;
          res.gamesAgainst += r.gamesB;
        }
      }
    }
    out[B] = res;
  }
  const tot = Object.values(out).reduce(
    (a, r) => ({ w: a.w + r.wins, m: a.m + r.matches, g: a.g + r.games, ga: a.ga + r.gamesAgainst }),
    { w: 0, m: 0, g: 0, ga: 0 },
  );
  console.log(
    `\n${NAME[X]}: ${((tot.w / tot.m) * 100).toFixed(1)}% das partidas | games ${tot.g} x ${tot.ga} (${((tot.g / (tot.g + tot.ga)) * 100).toFixed(1)}%) | ${tot.m} partidas`,
  );
  for (const B of CLASS_ORDER) {
    const r = out[B];
    console.log(
      `  x ${pad(NAME[B], 13)} ${pad(((r.wins / r.matches) * 100).toFixed(0) + '%', 5)} (${r.wins}/${r.matches}) | games ${r.games} x ${r.gamesAgainst}`,
    );
  }
  return out;
}

const opts = parseArgs(process.argv.slice(2));
if (opts.classId && !CLASS_ORDER.includes(opts.classId)) {
  console.error(
    `classe inválida: ${opts.classId} (use uma de: ${CLASS_ORDER.join(', ')})`,
  );
  process.exit(1);
}
console.log(
  `matriz de equilíbrio: ${opts.classId ? `focada em ${NAME[opts.classId] ?? opts.classId}` : 'classes x classes'} | ` +
    `${opts.seeds} seeds | dificuldades ${opts.difficulties.join(', ')}`,
);
const result = opts.classId ? runFocused(opts) : runMatrix(opts);
if (!opts.classId) printMatrix(opts, result);
if (opts.json) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(opts.json, JSON.stringify(result));
  console.log(`\ndados salvos em ${opts.json}`);
}
