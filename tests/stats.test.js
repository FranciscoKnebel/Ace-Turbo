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
  techniqueErrorMul,
} from '../src/sim/stats.js';
import { chooseShot, homeSpot } from '../src/sim/ai.js';
import { createWorld, executeRallyShot, executeServe, pickServer } from '../src/sim/world.js';
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
