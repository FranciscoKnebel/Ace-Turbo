import test from 'node:test';
import assert from 'node:assert/strict';
import { blankInput } from '../src/sim/ai.js';
import {
  CLASSES,
  CLASS_ORDER,
  STATS,
  clampStat,
  powerMul,
  randomClass,
  resolvePlayerStats,
  serveSpeedMul,
  staminaDrainMul,
  staminaMax,
  staminaMaxOf,
  techniqueErrorMul,
} from '../src/sim/stats.js';
import { chooseAimX, chooseShot, homeSpot, netOpponents } from '../src/sim/ai.js';
import { createWorld, executeRallyShot, executeServe, pickServer, stepWorld } from '../src/sim/world.js';
import { STAMINA } from '../src/sim/constants.js';
import { mulberry32 } from '../src/sim/rng.js';

test('existem 8 classes e todas as stats ficam entre 50 e 99', () => {
  assert.equal(CLASS_ORDER.length, 8);
  assert.equal(Object.keys(CLASSES).length, 8);
  for (const id of CLASS_ORDER) {
    const cls = CLASSES[id];
    for (const key of STATS.KEYS) {
      assert.ok(
        cls[key] >= STATS.MIN && cls[key] <= STATS.MAX,
        `${id}.${key} fora da faixa: ${cls[key]}`,
      );
    }
  }
  assert.equal(clampStat(10), 50);
  assert.equal(clampStat(200), 99);
  assert.equal(clampStat(undefined), 75);
});

test('classes aleatórias são sorteadas do conjunto e determinísticas por semente', () => {
  const rngA = mulberry32(7);
  const rngB = mulberry32(7);
  for (let i = 0; i < 20; i++) {
    const a = randomClass(rngA);
    const b = randomClass(rngB);
    assert.ok(CLASS_ORDER.includes(a), `classe sorteada inválida: ${a}`);
    assert.equal(a, b, 'mesma semente deveria sortear a mesma classe');
  }
});

test('multiplicadores: neutro em 75, extremos coerentes', () => {
  const neutral = CLASSES.balanced;
  assert.equal(powerMul(neutral), 1);
  assert.equal(techniqueErrorMul(neutral), 1);
  assert.equal(serveSpeedMul(neutral), 1);
  assert.equal(staminaMax(neutral), 100);
  assert.equal(staminaDrainMul(neutral), 1);

  assert.ok(powerMul({ power: 99 }) > 1);
  assert.ok(powerMul({ power: 50 }) < 1);
  assert.ok(techniqueErrorMul({ technique: 99 }) < 1);
  assert.ok(techniqueErrorMul({ technique: 50 }) > 1);
  assert.ok(staminaMax({ stamina: 99 }) > 100);
  assert.ok(staminaMax({ stamina: 50 }) < 100);
  assert.ok(staminaDrainMul({ stamina: 99 }) < 1);
});

test('resolvePlayerStats: preset, aleatória e personalizada', () => {
  const rng = mulberry32(3);
  const preset = resolvePlayerStats({ classId: 'power' }, rng);
  assert.equal(preset.classId, 'power');
  assert.deepEqual(preset.stats, CLASSES.power);
  const random = resolvePlayerStats({ classId: 'random' }, rng);
  assert.ok(CLASS_ORDER.includes(random.classId));
  const custom = resolvePlayerStats(
    { classId: 'custom', stats: { power: 200, technique: 10, serve: 80, stamina: 70 } },
    rng,
  );
  assert.equal(custom.classId, 'custom');
  assert.deepEqual(custom.stats, { power: 99, technique: 50, serve: 80, stamina: 70 });
  const fallback = resolvePlayerStats({ classId: 'nope' }, rng);
  assert.equal(fallback.classId, 'balanced');
});

test('CPU sem configuração no menu sorteia a classe a cada partida', () => {
  const picks = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const world = createWorld({ mode: 'singles', seed });
    picks.add(world.byId.b1.classId);
  }
  assert.ok(
    picks.size > 1,
    `a CPU deveria variar de classe entre partidas (sempre: ${[...picks].join(', ')})`,
  );
});

test('createWorld aplica as classes: humano equilibrado, CPU aleatória', () => {
  const world = createWorld({ mode: 'singles', seed: 4 });
  assert.equal(world.byId.a1.classId, 'balanced');
  assert.ok(CLASS_ORDER.includes(world.byId.b1.classId), 'CPU deveria sortear uma classe');
  assert.equal(world.byId.a1.staminaMax, 100);
  assert.equal(world.byId.a1.stamina, world.byId.a1.staminaMax);

  const configured = createWorld({
    mode: 'singles',
    seed: 4,
    players: {
      a1: { classId: 'power' },
      b1: { classId: 'custom', stats: { power: 60, technique: 60, serve: 60, stamina: 60 } },
    },
  });
  assert.equal(configured.byId.a1.classId, 'power');
  assert.deepEqual(configured.byId.a1.stats, CLASSES.power);
  assert.equal(configured.byId.b1.classId, 'custom');
  assert.equal(configured.byId.b1.stats.power, 60);
  assert.ok(configured.byId.b1.staminaMax < 100);
});

test('traços da classe mudam a posição de espera e o avanço à rede', () => {
  const spot = (classId, approach = 0) => {
    const world = createWorld({ mode: 'singles', seed: 31, players: { b1: { classId } } });
    const p = world.byId.b1;
    p.ai.approach = approach;
    // Em rally (fora do saque) a posição de espera segue os traços da classe.
    world.phase = 'rally';
    world.serve.returnPending = false;
    return homeSpot(world, p, { x: 0, y: 0 });
  };
  const wall = spot('wall');
  const bruiser = spot('bruiser');
  assert.ok(
    Math.abs(wall.y) > Math.abs(bruiser.y) + 0.8,
    `muralha deveria jogar mais fundo (${wall.y.toFixed(2)} vs ${bruiser.y.toFixed(2)})`,
  );
  const veteranBase = spot('veteran');
  const veteranUp = spot('veteran', 1);
  assert.ok(
    Math.abs(veteranUp.y) < Math.abs(veteranBase.y) - 1.5,
    `veterano deveria avançar à rede (${veteranUp.y.toFixed(2)} vs ${veteranBase.y.toFixed(2)})`,
  );
});

test('classes agressivas atacam mais; defensivas usam mais slice/lob', () => {
  const count = (classId) => {
    const world = createWorld({ mode: 'singles', seed: 33, players: { b1: { classId } } });
    const p = world.byId.b1;
    const out = { flat: 0, topspin: 0, slice: 0, lob: 0 };
    for (let i = 0; i < 300; i++) {
      out[chooseShot(world, p, { x: 0, y: 5, z: 0.8 }).type]++;
    }
    return out;
  };
  const wall = count('wall');
  const bruiser = count('bruiser');
  assert.ok(
    bruiser.flat + bruiser.topspin > wall.flat + wall.topspin,
    `brutamontes deveria atacar mais (${JSON.stringify(bruiser)} vs ${JSON.stringify(wall)})`,
  );
  assert.ok(
    wall.slice + wall.lob > bruiser.slice + bruiser.lob,
    `muralha deveria usar mais slice/lob (${JSON.stringify(wall)} vs ${JSON.stringify(bruiser)})`,
  );
});

test('IA cansada fica conservadora: mais slice/lob, menos força e alvo curto', () => {
  const sample = (staminaFrac) => {
    const world = createWorld({
      mode: 'singles',
      seed: 33,
      players: { b1: { classId: 'balanced' } },
    });
    const p = world.byId.b1;
    p.stamina = staminaMaxOf(p) * staminaFrac;
    const out = { flat: 0, topspin: 0, slice: 0, lob: 0, hold: 0, short: 0 };
    for (let i = 0; i < 400; i++) {
      const shot = chooseShot(world, p, { x: 0, y: 5, z: 0.8 });
      out[shot.type]++;
      out.hold += shot.hold;
      if (shot.depth === 0) out.short++;
    }
    out.hold /= 400;
    return out;
  };
  const fresh = sample(1);
  const tired = sample(0.05);
  assert.ok(
    tired.topspin < fresh.topspin,
    `cansada deveria arriscar menos topspin (${tired.topspin} vs ${fresh.topspin})`,
  );
  assert.ok(
    tired.slice + tired.lob > fresh.slice + fresh.lob,
    `cansada deveria usar mais slice/lob (${tired.slice + tired.lob} vs ${fresh.slice + fresh.lob})`,
  );
  assert.ok(
    tired.hold < fresh.hold - 0.05,
    `cansada deveria bater mais leve (${tired.hold.toFixed(2)} vs ${fresh.hold.toFixed(2)})`,
  );
  assert.ok(
    tired.short > fresh.short,
    `cansada deveria mirar mais curto (${tired.short} vs ${fresh.short})`,
  );
});

test('IA cansada mira mais o centro', () => {
  const centerRate = (staminaFrac) => {
    const world = createWorld({
      mode: 'singles',
      seed: 34,
      players: { b1: { classId: 'balanced' } },
    });
    const p = world.byId.b1;
    p.stamina = staminaMaxOf(p) * staminaFrac;
    world.byId.a1.x = -2; // adversário de um lado: o "aberto" é o outro
    let center = 0;
    for (let i = 0; i < 400; i++) if (chooseAimX(world, p) === 0) center++;
    return center;
  };
  const fresh = centerRate(1);
  const tired = centerRate(0.05);
  assert.ok(
    tired > fresh + 20,
    `cansada deveria jogar mais pelo centro (${tired} vs ${fresh})`,
  );
});

test('bola pesada: devolver bola rápida erra mais', () => {
  const scatter = (incomingSpeed) => {
    const xs = [];
    const ys = [];
    for (let i = 0; i < 80; i++) {
      const world = createWorld({
        mode: 'singles',
        seed: 200 + i,
        players: { a1: { classId: 'balanced' }, b1: { classId: 'balanced' } },
      });
      const p = world.byId.a1;
      world.phase = 'rally';
      world.serve.inFlight = false;
      p.x = 0;
      p.y = -10;
      p.input = { up: false, down: false, left: false, right: false, swing: true, shot: 'flat' };
      p.swing = { t: 0, didHit: false, charge: 0.6, shot: 'flat' };
      const ball = world.ball;
      Object.assign(ball, {
        x: 0,
        y: -9,
        z: 0.8,
        px: 0,
        py: -9,
        vx: 0,
        vy: -incomingSpeed,
        vz: 0,
        heldBy: null,
        dead: false,
        bounces: [],
        lastHit: { team: 'b', player: 'b1', isServe: false },
      });
      executeRallyShot(world, p, ball);
      for (let k = 0; k < 120 * 8 && ball.bounces.length === 0; k++) stepWorld(world, 1 / 120);
      const b = ball.bounces[0];
      if (b) {
        xs.push(b.x);
        ys.push(b.y);
      }
    }
    const std = (a) => {
      const m = a.reduce((x, y) => x + y, 0) / a.length;
      return Math.sqrt(a.reduce((acc, v) => acc + (v - m) ** 2, 0) / a.length);
    };
    return Math.hypot(std(xs), std(ys));
  };
  const slow = scatter(0);
  const fast = scatter(18);
  assert.ok(
    fast > slow * 1.3,
    `bola rápida deveria aumentar o erro de quem devolve (${fast.toFixed(2)} m vs ${slow.toFixed(2)} m)`,
  );
});

test('velocista tem saque e técnica utilizáveis (a identidade é o vigor)', () => {
  assert.ok(CLASSES.speedster.serve >= 75, `saque do velocista (${CLASSES.speedster.serve})`);
  assert.ok(
    CLASSES.speedster.technique >= 78,
    `técnica do velocista (${CLASSES.speedster.technique})`,
  );
  assert.equal(CLASSES.speedster.stamina, 99, 'o vigor segue sendo a identidade');
});

test('vigor: sprint rende bem mais com vigor alto (mais sprints)', () => {
  const sprintSeconds = (staminaStat) => {
    const stats = { power: 75, technique: 75, serve: 75, stamina: staminaStat };
    return staminaMax(stats) / (STAMINA.DRAIN * staminaDrainMul(stats));
  };
  const low = sprintSeconds(50);
  const high = sprintSeconds(99);
  assert.ok(
    high > low * 3,
    `vigor 99 deveria sprintar bem mais (${high.toFixed(1)}s vs ${low.toFixed(1)}s)`,
  );
  assert.ok(
    staminaDrainMul({ stamina: 99 }) < 0.7 && staminaDrainMul({ stamina: 50 }) > 1.3,
    'o gasto do sprint varia ±35% com o vigor',
  );
});

test('IA reage à rede: mais lob e passada contra adversário adiantado', () => {
  const sample = (oppY) => {
    const world = createWorld({
      mode: 'singles',
      seed: 90,
      players: { b1: { classId: 'balanced' } },
    });
    const p = world.byId.b1;
    world.byId.a1.y = oppY;
    const out = { lob: 0, center: 0, forward: 0 };
    for (let i = 0; i < 600; i++) {
      if (chooseShot(world, p, { x: 0, y: 5, z: 0.8 }).type === 'lob') out.lob++;
      if (chooseAimX(world, p) === 0) out.center++;
    }
    out.forward = netOpponents(world, p).length;
    return out;
  };
  const deep = sample(-10);
  const net = sample(-4);
  assert.equal(deep.forward, 0, 'adversário fundo não conta como rede');
  assert.equal(net.forward, 1, 'adversário adiantado conta');
  assert.ok(
    net.lob > deep.lob * 2,
    `contra a rede deveria lobar bem mais (${net.lob} vs ${deep.lob})`,
  );
  assert.ok(
    net.center < deep.center,
    `contra a rede deveria mirar menos o centro (${net.center} vs ${deep.center})`,
  );
});

test('bola duvidosa: a IA joga seguro (mais slice/lob e menos força)', () => {
  const sample = (doubtful) => {
    const world = createWorld({
      mode: 'singles',
      seed: 96,
      players: { b1: { classId: 'balanced' } },
    });
    const p = world.byId.b1;
    p.ai.doubtful = doubtful;
    let safe = 0;
    let hold = 0;
    for (let i = 0; i < 600; i++) {
      const s = chooseShot(world, p, { x: 0, y: 5, z: 0.8 });
      if (s.type === 'slice' || s.type === 'lob') safe++;
      hold += s.hold;
    }
    return { safe, hold: hold / 600 };
  };
  const normal = sample(false);
  const doubtful = sample(true);
  assert.ok(
    doubtful.safe > normal.safe * 1.3,
    `deveria usar mais slice/lob na duvidosa (${doubtful.safe} vs ${normal.safe})`,
  );
  assert.ok(
    doubtful.hold < normal.hold - 0.05,
    `deveria bater mais leve (${doubtful.hold.toFixed(2)} vs ${normal.hold.toFixed(2)})`,
  );
});

test('bater no corpo (neutro) é punido: forehand e backhand saem mais fortes', () => {
  const shotAt = (offset) => {
    const world = createWorld({
      mode: 'singles',
      seed: 41,
      players: { a1: { classId: 'balanced' }, b1: { classId: 'balanced' } },
    });
    const p = world.byId.a1;
    world.phase = 'rally';
    world.serve.inFlight = false;
    p.x = 0;
    p.y = -9;
    Object.assign(world.ball, {
      heldBy: null,
      dead: false,
      x: offset,
      y: -8,
      z: 0.8,
      vx: 0,
      vy: 0,
      vz: 0,
      bounces: [],
      curve: 0,
      lastHit: { team: 'b', player: 'b1', isServe: false },
    });
    p.swing = { t: 0.1, didHit: false, charge: 0.8, shot: 'flat' };
    executeRallyShot(world, p, world.ball);
    return {
      speed: Math.hypot(world.ball.vx, world.ball.vy, world.ball.vz),
      hand: world.ball.lastHit.hand,
    };
  };
  const forehand = shotAt(0.6);
  const backhand = shotAt(-0.6);
  const neutral = shotAt(0);
  assert.equal(forehand.hand, 'forehand');
  assert.equal(backhand.hand, 'backhand');
  assert.equal(neutral.hand, 'neutral');
  assert.ok(
    forehand.speed > neutral.speed * 1.1,
    `forehand deveria ser mais forte que o neutro (${forehand.speed.toFixed(1)} vs ${neutral.speed.toFixed(1)})`,
  );
  assert.ok(
    backhand.speed > neutral.speed * 1.05,
    `backhand deveria ser mais forte que o neutro (${backhand.speed.toFixed(1)} vs ${neutral.speed.toFixed(1)})`,
  );
  assert.ok(forehand.speed > backhand.speed, 'forehand é o mais forte');
});

test('IA abre para o forehand na posição de espera (lateral > 0,2)', () => {
  const world = createWorld({ mode: 'singles', seed: 42 });
  world.phase = 'rally';
  world.serve.returnPending = false;
  const frame = (team) => (team === 'a' ? 1 : -1);
  // Bola perto do centro: sem o deslocamento o lateral ficaria no neutro.
  for (const [id, ballX] of [
    ['a1', 0.5],
    ['b1', -0.5],
  ]) {
    const p = world.byId[id];
    p.x = 0;
    p.y = id === 'a1' ? -9 : 9;
    const spot = homeSpot(world, p, { x: ballX, y: p.y + 1 });
    const lateral = (ballX - spot.x) * frame(p.team);
    assert.ok(
      lateral > 0.2,
      `${id}: espera deveria abrir para o forehand (lateral=${lateral.toFixed(2)})`,
    );
  }
});

// Bola parada em posição controlada para medir a velocidade da batida.
function rallyWorld(players) {
  const world = createWorld({ mode: 'singles', seed: 21, players });
  const p = world.byId.a1;
  world.phase = 'rally';
  world.serve.inFlight = false;
  Object.assign(world.ball, {
    heldBy: null,
    dead: false,
    x: 0,
    y: -8,
    z: 0.8,
    vx: 0,
    vy: 0,
    vz: 0,
    bounces: [],
    curve: 0,
    lastHit: { team: 'b', player: 'b1', isServe: false },
  });
  p.x = 0;
  p.y = -9;
  p.vx = 0;
  p.vy = 0;
  p.input = { ...blankInput(), swing: true };
  p.swing = { t: 0.1, didHit: false, charge: 0.8, shot: 'flat' };
  executeRallyShot(world, p, world.ball);
  return Math.hypot(world.ball.vx, world.ball.vy, world.ball.vz);
}

test('força aumenta a velocidade da batida; técnica não muda o alvo base', () => {
  const strong = rallyWorld({
    a1: { classId: 'custom', stats: { power: 99, technique: 75, serve: 75, stamina: 75 } },
    b1: { classId: 'balanced' },
  });
  const weak = rallyWorld({
    a1: { classId: 'custom', stats: { power: 50, technique: 75, serve: 75, stamina: 75 } },
    b1: { classId: 'balanced' },
  });
  assert.ok(strong > weak * 1.15, `força deveria acelerar (${strong} vs ${weak})`);
});

test('saque: stat de saque aumenta a velocidade do saque', () => {
  const serveSpeed = (serve) => {
    const world = createWorld({
      mode: 'singles',
      seed: 22,
      players: {
        a1: { classId: 'custom', stats: { power: 75, technique: 75, serve, stamina: 75 } },
        b1: { classId: 'balanced' },
      },
    });
    const server = pickServer(world);
    // Bola na altura do toss (como no jogo): sem isso a folga de rede domina
    // o voo e a stat de saque não apareceria.
    Object.assign(world.ball, { x: 0.8, y: -11.5, z: 2.4, vx: 0, vy: 0, vz: 0 });
    executeServe(world, server, 0.75, 'flat');
    return Math.hypot(world.ball.vx, world.ball.vy, world.ball.vz);
  };
  const fast = serveSpeed(99);
  const slow = serveSpeed(50);
  assert.ok(fast > slow * 1.1, `saque forte deveria ser mais rápido (${fast} vs ${slow})`);
});
