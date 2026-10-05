import { COURT, DIFFICULTY, MATCH, PHYS, PLAYER, TURBO } from './constants.js';
import { blankInput, createAI, otherTeam, sideOf, stepAI, teamOfSide } from './ai.js';
import { clamp, lerp, pointSegmentDistance, solveBallistic, timeForNetClearance } from './math.js';
import { makeBall, netHeightAt, stepBall } from './physics.js';
import { mulberry32 } from './rng.js';
import { MatchScore } from './score.js';

export { otherTeam, sideOf, teamOfSide };

export const MODES = {
  coop: {
    label: 'Co-op Duplas',
    doubles: true,
    players: [
      { id: 'a1', team: 'a', human: true, prefSide: 1 },
      { id: 'a2', team: 'a', human: true, prefSide: -1 },
      { id: 'b1', team: 'b', human: false, prefSide: -1 },
      { id: 'b2', team: 'b', human: false, prefSide: 1 },
    ],
  },
  singles: {
    label: 'Simples',
    doubles: false,
    players: [
      { id: 'a1', team: 'a', human: true, prefSide: 1 },
      { id: 'b1', team: 'b', human: false, prefSide: -1 },
    ],
  },
  versus: {
    label: 'Versus Simples',
    doubles: false,
    players: [
      { id: 'a1', team: 'a', human: true, prefSide: 1 },
      { id: 'b1', team: 'b', human: true, prefSide: -1 },
    ],
  },
  demo: {
    label: 'Demo (CPU vs CPU)',
    doubles: true,
    players: [
      { id: 'a1', team: 'a', human: false, prefSide: 1 },
      { id: 'a2', team: 'a', human: false, prefSide: -1 },
      { id: 'b1', team: 'b', human: false, prefSide: -1 },
      { id: 'b2', team: 'b', human: false, prefSide: 1 },
    ],
  },
};

export function createWorld({ mode = 'singles', difficulty = 'normal', seed = 1, bestOf = MATCH.BEST_OF } = {}) {
  const def = MODES[mode] ?? MODES.singles;
  const diff = DIFFICULTY[difficulty] ?? DIFFICULTY.normal;
  const rng = mulberry32(seed);
  const players = def.players.map((spec) => makePlayer(spec, diff));
  const byId = {};
  for (const p of players) byId[p.id] = p;

  const world = {
    mode,
    doubles: def.doubles,
    difficulty,
    seed,
    rng,
    players,
    byId,
    score: new MatchScore({ bestOf }),
    ball: makeBall(),
    phase: 'serve',
    phaseTimer: 0,
    message: '',
    messageTimer: 0,
    events: [],
    inputs: {},
    serve: { id: 0, serverId: null, serverTeam: 'a', attempt: 1, inFlight: false, returned: false, box: null },
    lastPoint: null,
    rallyShots: 0,
    stats: { serves: 0, hits: 0, aces: 0, doubleFaults: 0, points: 0, turboShots: 0, lets: 0 },
  };
  for (const p of players) {
    if (p.human) world.inputs[p.id] = blankInput();
  }
  resetForServe(world);
  return world;
}

function makePlayer(spec, diff) {
  const human = spec.human;
  const player = {
    id: spec.id,
    team: spec.team,
    human,
    prefSide: spec.prefSide,
    x: 0,
    y: sideOf(spec.team) * 9,
    vx: 0,
    vy: 0,
    maxSpeed: PLAYER.MAX_SPEED,
    charge: 0,
    charging: false,
    swing: null,
    swingCooldown: 0,
    turbo: TURBO.MAX,
    input: blankInput(),
    ai: null,
  };
  if (!human) {
    player.ai = createAI({ skill: diff.skill, speedMult: diff.speedMult, reaction: diff.reaction });
    player.maxSpeed = PLAYER.MAX_SPEED * diff.speedMult;
  }
  return player;
}

// ---------------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------------
export function setMessage(world, text, time = 0) {
  world.message = text;
  world.messageTimer = time;
}

function teamLabel(team) {
  return team === 'a' ? 'EQUIPE A' : 'EQUIPE B';
}

// ---------------------------------------------------------------------------
// Saque: formação e reinício de ponto
// ---------------------------------------------------------------------------
export function pickServer(world) {
  const team = world.score.server;
  const mates = world.players.filter((p) => p.team === team);
  const idx = world.score.teamServeIndex[team] % mates.length;
  return mates[idx];
}

export function resetForServe(world) {
  const server = pickServer(world);
  world.serve = {
    id: world.serve.id + 1,
    serverId: server.id,
    serverTeam: server.team,
    attempt: 1,
    inFlight: false,
    returned: false,
    box: null,
  };
  world.phase = 'serve';
  world.rallyShots = 0;
  formation(world, server);
  const ball = world.ball;
  Object.assign(ball, {
    x: server.x,
    y: server.y,
    z: 0.85,
    vx: 0,
    vy: 0,
    vz: 0,
    px: server.x,
    py: server.y,
    pz: 0.85,
    heldBy: server.id,
    dead: false,
    touchedNet: false,
    crossed: false,
    onGround: false,
    bounces: [],
    lastHit: null,
  });
  for (const p of world.players) {
    p.vx = 0;
    p.vy = 0;
    p.charge = 0;
    p.charging = false;
    p.swing = null;
    p.swingCooldown = 0;
    p.input.swing = false;
  }
  setMessage(world, '', 0);
}

function formation(world, server) {
  const s = world.score;
  const sideSign = s.serveSideSign(server.team);
  const tSign = -sideSign;
  const serverSide = sideOf(server.team);
  const recvSide = -serverSide;
  const serverTeamMates = world.players.filter((p) => p.team === server.team && p.id !== server.id);
  const recvTeam = otherTeam(server.team);
  const receivers = world.players.filter((p) => p.team === recvTeam);

  server.x = sideSign * 1.6;
  server.y = serverSide * (COURT.HALF_LENGTH + 1.1);

  if (world.doubles && serverTeamMates[0]) {
    const mate = serverTeamMates[0];
    mate.x = -sideSign * 2.2;
    mate.y = serverSide * 3.8;
  }

  const receiver = receivers.find((p) => p.prefSide === tSign) ?? receivers[0];
  const others = receivers.filter((p) => p.id !== receiver.id);
  receiver.x = tSign * 2.8;
  receiver.y = recvSide * (COURT.HALF_LENGTH - 2.6);
  if (world.doubles && others[0]) {
    others[0].x = sideSign * 2.2;
    others[0].y = recvSide * 3.8;
  }
}

// ---------------------------------------------------------------------------
// Loop principal
// ---------------------------------------------------------------------------
export function stepWorld(world, dt) {
  world.events.length = 0;
  if (world.messageTimer > 0) world.messageTimer = Math.max(0, world.messageTimer - dt);

  if (world.phase === 'pointover') {
    for (const p of world.players) applyPlayerLogic(world, p, dt, true);
    world.phaseTimer -= dt;
    if (world.phaseTimer <= 0) {
      if (world.score.winner) {
        world.phase = 'matchover';
        setMessage(world, `${teamLabel(world.score.winner)} VENCEU A PARTIDA!`, 9999);
      } else {
        resetForServe(world);
      }
    }
    return;
  }
  if (world.phase === 'matchover') {
    for (const p of world.players) applyPlayerLogic(world, p, dt, true);
    return;
  }

  // 1) comandos das CPUs e leitura dos humanos
  for (const p of world.players) {
    if (!p.human) {
      stepAI(world, p, dt);
    } else {
      const src = world.inputs[p.id];
      if (!src) world.inputs[p.id] = p.input;
      else p.input = src;
    }
  }

  // 2) movimento, carga, golpes
  for (const p of world.players) applyPlayerLogic(world, p, dt, false);

  // 3) bola
  const physEvents = [];
  if (world.phase === 'serve' && !world.serve.inFlight) {
    const srv = world.byId[world.serve.serverId];
    const ball = world.ball;
    ball.x = srv.x;
    ball.y = srv.y;
    ball.z = 0.85;
    ball.vx = ball.vy = ball.vz = 0;
    ball.px = ball.x;
    ball.py = ball.y;
  } else {
    stepBall(world.ball, dt, world.doubles, physEvents);
  }

  // 4) regras (os eventos físicos entram na lista antes das decisões, para o
  // cliente registrar som/quique no mesmo frame)
  for (const ev of physEvents) world.events.push({ type: `ball_${ev.type}`, ...ev });
  for (const ev of physEvents) {
    if (world.phase !== 'serve' && world.phase !== 'rally') break;
    if (ev.type === 'bounce') processBounce(world, ev);
    else if (ev.type === 'fence') handleFence(world, ev);
  }
}

function applyPlayerLogic(world, p, dt, frozen) {
  const fr = Math.exp(-PLAYER.FRICTION * dt);
  const input = p.input;
  const mirror = -sideOf(p.team);
  // O sacador esperando para sacar fica parado: as teclas de direção são mira.
  const waitingServe =
    world.phase === 'serve' && world.serve.serverId === p.id && !world.serve.inFlight;
  const dx = frozen || waitingServe ? 0 : ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * mirror;
  const dy = frozen || waitingServe ? 0 : ((input.up ? 1 : 0) - (input.down ? 1 : 0)) * mirror;

  p.vx += dx * PLAYER.ACCEL * dt;
  p.vy += dy * PLAYER.ACCEL * dt;
  if (dx === 0) p.vx *= fr;
  if (dy === 0) p.vy *= fr;
  const spd = Math.hypot(p.vx, p.vy);
  if (spd > p.maxSpeed) {
    p.vx *= p.maxSpeed / spd;
    p.vy *= p.maxSpeed / spd;
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  const side = sideOf(p.team);
  const xMax = COURT.DOUBLES_HALF_WIDTH + 1.8;
  p.x = clamp(p.x, -xMax, xMax);
  const yMax = COURT.HALF_LENGTH + 1.4;
  if (side < 0) p.y = clamp(p.y, -yMax, -PLAYER.NET_MARGIN);
  else p.y = clamp(p.y, PLAYER.NET_MARGIN, yMax);

  p.turbo = Math.min(TURBO.MAX, p.turbo + TURBO.REGEN * dt);

  if (p.swingCooldown > 0) p.swingCooldown = Math.max(0, p.swingCooldown - dt);

  if (frozen) {
    p.charging = false;
    p.charge = 0;
    return;
  }

  // Carga e soltura (o saque ou o golpe começam no release).
  if (input.swing) {
    if (!p.charging && p.swingCooldown <= 0 && !p.swing) {
      p.charging = true;
      p.charge = 0;
    } else if (p.charging) {
      p.charge = Math.min(1, p.charge + dt / PLAYER.CHARGE_TIME);
    }
  } else if (p.charging) {
    release(world, p);
  }

  // Janela ativa da raquete.
  if (p.swing) {
    p.swing.t += dt;
    const inWindow =
      p.swing.t >= PLAYER.SWING_WINDUP &&
      p.swing.t <= PLAYER.SWING_WINDUP + PLAYER.SWING_ACTIVE;
    if (inWindow && !p.swing.didHit) tryHit(world, p);
    if (p.swing.t > PLAYER.SWING_WINDUP + PLAYER.SWING_ACTIVE) {
      p.swing = null;
      p.swingCooldown = PLAYER.SWING_RECOVER;
    }
  }
}

function release(world, p) {
  const charge = clamp(p.charge, 0, 1);
  p.charging = false;
  p.charge = 0;
  if (world.phase === 'serve' && world.serve.serverId === p.id && !world.serve.inFlight) {
    executeServe(world, p, charge);
    return;
  }
  if (world.phase === 'serve' || world.phase === 'rally') {
    p.swing = { t: 0, didHit: false, charge };
    world.events.push({ type: 'swing', player: p.id });
  }
}

// ---------------------------------------------------------------------------
// Golpes
// ---------------------------------------------------------------------------
export function aimWorld(p) {
  const mirror = -sideOf(p.team);
  const x = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
  const y = (p.input.up ? 1 : 0) - (p.input.down ? 1 : 0);
  return { x: x * mirror, fwd: y };
}

export function tryHit(world, p) {
  const ball = world.ball;
  if (ball.dead || ball.heldBy) return false;
  if (!p.swing || p.swing.didHit) return false;
  if (ball.lastHit && ball.lastHit.team === p.team) return false;
  if (teamOfSide(ball.y) !== p.team) return false;
  if (ball.z > PLAYER.REACH_HEIGHT) return false;
  const d = pointSegmentDistance(p.x, p.y, ball.px, ball.py, ball.x, ball.y);
  if (d > PLAYER.REACH) return false;
  executeRallyShot(world, p, ball);
  p.swing.didHit = true;
  return true;
}

export function executeRallyShot(world, p, ball) {
  const charge = clamp(p.swing.charge, 0, 1);
  const side = sideOf(p.team);
  const opp = -side;
  const aim = aimWorld(p);

  if (world.serve.inFlight && ball.lastHit && ball.lastHit.isServe) {
    world.serve.inFlight = false;
    world.serve.returned = true;
    world.phase = 'rally';
  }

  const isLob = aim.fwd === -1 && charge <= 0.62;
  const depth = (aim.fwd + 1) / 2;
  let targetY = opp * lerp(4.5, 10.9, depth);
  let targetX = aim.x !== 0 ? aim.x * (world.doubles ? 4.2 : 3.5) : clamp(p.x * 0.7, -3.4, 3.4);

  if (isLob) targetY = opp * 10.6;

  let turbo = false;
  if (!isLob && charge >= TURBO.THRESHOLD && p.turbo >= TURBO.COST) {
    turbo = true;
    p.turbo -= TURBO.COST;
    targetY *= TURBO.DEEP_BONUS;
    world.stats.turboShots++;
  }

  // Erro: humano depende da carga; IA depende da habilidade. Rallies longos
  // acumulam "pressão" e aumentam o erro (pontos precisam terminar).
  world.rallyShots += 1;
  const pressure = p.human ? Math.min(0.2, world.rallyShots * 0.008) : Math.min(1.1, world.rallyShots * 0.07);
  let errMag =
    (p.human ? charge * 0.3 : (1 - p.ai.skill) * 2.0) + pressure + (isLob ? -0.15 : 0);
  if (!p.human) {
    // Erro não forçado ocasional (a bola sai ou fica curta): pontos terminam.
    const shankChance =
      0.07 + (1 - p.ai.skill) * 0.17 + Math.min(0.15, world.rallyShots * 0.01);
    if (world.rng() < shankChance) errMag += 1.3 + world.rng() * 2.0;
  }
  const ang = world.rng() * Math.PI * 2;
  targetX += Math.cos(ang) * Math.max(0, errMag);
  targetY += Math.sin(ang) * Math.max(0, errMag);

  const maxX = COURT.DOUBLES_HALF_WIDTH + 0.45;
  targetX = clamp(targetX, -maxX, maxX);
  targetY =
    opp > 0
      ? clamp(targetY, 0.5, COURT.HALF_LENGTH + 0.9)
      : clamp(targetY, -(COURT.HALF_LENGTH + 0.9), -0.5);

  const from = { x: ball.x, y: ball.y, z: Math.max(0.05, ball.z) };
  const to = { x: targetX, y: targetY, z: 0.04 };
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const avgSpeed = turbo ? lerp(17, 32, charge) : lerp(13, 26, charge);
  let flight = clamp(dist / avgSpeed, 0.45, 1.2);
  if (isLob) flight *= 1.5;
  flight = clearanceTime(from, to, flight, isLob ? 0.5 : 0.1);

  const v = solveBallistic(from, to, flight, PHYS.GRAVITY, PHYS.AIR_DRAG);
  Object.assign(ball, {
    vx: v.vx,
    vy: v.vy,
    vz: v.vz,
    dead: false,
    touchedNet: false,
    crossed: false,
    onGround: false,
    bounces: [],
    heldBy: null,
    lastHit: { team: p.team, player: p.id, isServe: false, turbo },
  });
  world.stats.hits++;
  world.events.push({ type: 'hit', player: p.id, turbo });
}

// Tempo de voo ajustado para passar a rede com folga (usa a altura no ponto de
// travessia aproximado).
function clearanceTime(from, to, flight, margin) {
  const denom = to.y - from.y;
  if (Math.abs(denom) < 1e-6) return flight;
  const f = (0 - from.y) / denom;
  const crossX = from.x + (to.x - from.x) * f;
  const clearance = netHeightAt(crossX) + margin;
  return timeForNetClearance(from, to, clearance, PHYS.GRAVITY, flight);
}

export function executeServe(world, p, charge) {
  const s = world.serve;
  if (s.serverId !== p.id || s.inFlight) return false;
  const sideSign = world.score.serveSideSign(p.team);
  const tSign = -sideSign;
  const recvSide = -sideOf(p.team);
  const aim = aimWorld(p);
  const fwd01 = (aim.fwd + 1) / 2;

  let tx = tSign * 2.0 + aim.x * 1.1;
  let ty = recvSide * lerp(5.6, 2.6, fwd01);
  tx = clamp(tx, tSign > 0 ? 0.25 : -3.85, tSign > 0 ? 3.85 : -0.25);
  ty = clamp(ty, recvSide > 0 ? 0.35 : -5.95, recvSide > 0 ? 5.95 : -0.35);

  const errBase = p.human ? (1 - Math.min(1, charge / 0.6)) * 0.9 : (1 - p.ai.skill) * (s.attempt === 1 ? 1.15 : 0.55);
  const errPower = p.human && charge > 0.9 ? (charge - 0.9) * 2.5 : 0;
  const errMag = errBase + errPower;
  const ang = world.rng() * Math.PI * 2;
  tx += Math.cos(ang) * errMag;
  ty += Math.sin(ang) * errMag;

  const from = {
    x: clamp(p.x, -(COURT.DOUBLES_HALF_WIDTH + 1.0), COURT.DOUBLES_HALF_WIDTH + 1.0),
    y: clamp(p.y, -13.0, 13.0),
    z: 0.85,
  };
  const to = { x: tx, y: ty, z: 0.03 };
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  let flight = clamp(dist / lerp(15, 28, charge), 0.5, 1.25);
  flight = clearanceTime(from, to, flight, 0.18);
  const v = solveBallistic(from, to, flight, PHYS.GRAVITY, PHYS.AIR_DRAG);
  Object.assign(world.ball, {
    x: p.x,
    y: p.y,
    z: 0.85,
    px: p.x,
    py: p.y,
    vx: v.vx,
    vy: v.vy,
    vz: v.vz,
    heldBy: null,
    dead: false,
    touchedNet: false,
    crossed: false,
    onGround: false,
    bounces: [],
    lastHit: { team: p.team, player: p.id, isServe: true, attempt: s.attempt, turbo: false },
  });
  s.inFlight = true;
  s.returned = false;
  s.box = {
    xMin: tSign > 0 ? 0 : -COURT.SINGLES_HALF_WIDTH,
    xMax: tSign > 0 ? COURT.SINGLES_HALF_WIDTH : 0,
    yMin: recvSide > 0 ? 0 : -COURT.SERVICE_LINE,
    yMax: recvSide > 0 ? COURT.SERVICE_LINE : 0,
  };
  world.phase = 'serve';
  world.stats.serves++;
  world.events.push({ type: 'serve', player: p.id, attempt: s.attempt });
  return true;
}

// ---------------------------------------------------------------------------
// Regras da bola
// ---------------------------------------------------------------------------
export function pointInBox(x, y, box) {
  if (!box) return false;
  const t = 0.03;
  return x >= box.xMin - t && x <= box.xMax + t && y >= box.yMin - t && y <= box.yMax + t;
}

export function processBounce(world, ev) {
  const ball = world.ball;
  const last = ball.lastHit;
  if (!last) return;

  if (world.serve.inFlight && last.isServe) {
    handleServeBounce(world, ev);
    return;
  }

  const bounceSide = teamOfSide(ev.y);
  if (bounceSide === last.team) {
    awardPoint(world, otherTeam(last.team), ball.touchedNet ? 'NA REDE' : 'FORA DA ÁREA');
    return;
  }

  // Quiques no lado de quem recebeu (inclui o atual, que a física já registrou).
  const receiverBounces = ball.bounces.filter((b) => teamOfSide(b.y) !== last.team);
  if (receiverBounces.length >= 2) {
    awardPoint(world, last.team, ev.inCourt ? 'A BOLA QUICOU DUAS VEZES' : 'PONTO');
    return;
  }
  if (!ev.inCourt) {
    awardPoint(world, otherTeam(last.team), 'FORA');
  }
}

function handleServeBounce(world, ev) {
  const s = world.serve;
  const recvTeam = otherTeam(s.serverTeam);
  const bounceSide = teamOfSide(ev.y);
  if (bounceSide !== recvTeam) {
    registerFault(world);
    return;
  }
  const inBox = pointInBox(ev.x, ev.y, s.box);
  if (world.ball.touchedNet) {
    if (inBox) {
      world.stats.lets++;
      setMessage(world, 'LET: REPETE O SAQUE', 1.5);
      replayServe(world);
    } else {
      registerFault(world);
    }
    return;
  }
  if (inBox) {
    s.inFlight = false;
    world.phase = 'rally';
    return;
  }
  registerFault(world);
}

export function registerFault(world) {
  const s = world.serve;
  if (s.attempt === 1) {
    s.attempt = 2;
    setMessage(world, 'FAULT: 2º SAQUE', 1.4);
    replayServe(world);
  } else {
    world.stats.doubleFaults++;
    awardPoint(world, otherTeam(s.serverTeam), 'DUPLA FALTA');
  }
}

function replayServe(world) {
  const s = world.serve;
  s.inFlight = false;
  s.box = null;
  world.phase = 'serve';
  const server = world.byId[s.serverId];
  const ball = world.ball;
  Object.assign(ball, {
    x: server.x,
    y: server.y,
    z: 0.85,
    vx: 0,
    vy: 0,
    vz: 0,
    px: server.x,
    py: server.y,
    heldBy: server.id,
    dead: false,
    touchedNet: false,
    crossed: false,
    onGround: false,
    bounces: [],
  });
  server.charge = 0;
  server.charging = false;
}

function handleFence(world, ev) {
  const ball = world.ball;
  const last = ball.lastHit;
  if (!last) return;
  if (world.serve.inFlight && last.isServe) {
    registerFault(world);
    return;
  }
  const good = ball.bounces.filter((b) => teamOfSide(b.y) !== last.team && b.inCourt).length;
  if (good >= 1) awardPoint(world, last.team, 'PONTO');
  else awardPoint(world, otherTeam(last.team), 'FORA');
}

// ---------------------------------------------------------------------------
// Ponto
// ---------------------------------------------------------------------------
export function awardPoint(world, team, reason) {
  if (world.phase !== 'serve' && world.phase !== 'rally') return;
  const last = world.ball.lastHit;
  if (last && last.isServe && last.team === team && !world.serve.returned) {
    world.stats.aces++;
  }
  const evs = world.score.awardPoint(team);
  world.stats.points++;
  world.lastPoint = { team, reason };
  for (const p of world.players) {
    if (p.team === team) p.turbo = Math.min(TURBO.MAX, p.turbo + TURBO.POINT_GAIN);
  }
  const gameWon = evs.some((e) => e.type === 'game');
  const setWon = evs.some((e) => e.type === 'set');
  const matchWon = evs.some((e) => e.type === 'match');
  let msg;
  if (matchWon) msg = `${teamLabel(team)} VENCEU A PARTIDA!`;
  else if (setWon) msg = `SET PARA ${teamLabel(team)}!`;
  else if (gameWon) msg = `GAME ${teamLabel(team)}!`;
  else if (reason === 'DUPLA FALTA') msg = `DUPLA FALTA: ${teamLabel(team)}`;
  else msg = `${reason}: ${teamLabel(team)}`;
  setMessage(world, msg, gameWon || setWon ? MATCH.SET_PAUSE : MATCH.POINT_PAUSE);
  world.phase = 'pointover';
  world.phaseTimer = gameWon || setWon ? MATCH.SET_PAUSE : MATCH.POINT_PAUSE;
  world.serve.inFlight = false;
  world.events.push({ type: 'point', team, reason, gameWon, setWon, matchWon });
}
