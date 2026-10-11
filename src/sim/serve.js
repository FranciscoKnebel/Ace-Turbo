import { transitionPhase, enterServeToss, enterServeFlight, enterServePreparation, makeServeState } from './systems/phases.js';
import { normalizeServeType, serveAimTarget } from './serve-target.js';
import { serviceSign, otherTeam, sideOf } from './court-sides.js';
import { pickServer, changeEnds } from './service.js';
import { emitEvent, observeTelemetry } from './systems/telemetry.js';
import { setMessage } from './systems/messages.js';
import { clearanceTime, tossQuality } from './systems/shot-model.js';
import { awardPoint } from './systems/points.js';
import { message } from './contracts.js';
import { COURT, CURVE, PHYS, SERVE, WIND } from './constants.js';
import { clamp, lerp, solveBallistic, timeForNetHit } from './math.js';
import { netHeightAt, resetBall } from './physics.js';
import { STATS, serveRiskMul, serveSpeedMul, techniqueErrorMul } from './stats.js';
export function resetForServe(world) {
  // O painel de estatísticas do set encerrado vale só para a pausa do set.
  world.setSummary = null;
  // Partidas versus: troca de lado após cada game ímpar (como no tênis).
  let swappedSides = false;
  if (
    world.mode === 'versus' &&
    world.score.gamesPlayed > 0 &&
    world.score.gamesPlayed % 2 === 1 &&
    world.lastEndChangeGames !== world.score.gamesPlayed
  ) {
    world.lastEndChangeGames = world.score.gamesPlayed;
    changeEnds(world);
    swappedSides = true;
  }

  const server = pickServer(world);
  world.serve = makeServeState({ id: world.serve.id + 1, serverId: server.id,
    serverTeam: server.team, receiverTeam: otherTeam(server.team) });
  transitionPhase(world, 'serve');
  world.rallyShots = 0;
  // O recebedor é sempre o jogador do lado que recebeu o saque (caixa diagonal).
  world.serve.receiverId = formation(world, server).id;
  const ball = world.ball;
  resetBall(ball, {
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
    spin: 'serve',
    bounceScale: 1,
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
  if (swappedSides) setMessage(world, message('msg.sideChange'), 1.6);
}

// Posição oficial do sacador para o saque atual.
export function serveSpot(world, server) {
  const sideSign = serviceSign(world.score, server.side ?? server.team);
  return { x: sideSign * 1.6, y: sideOf(server.side ?? server.team) * (COURT.HALF_LENGTH + 1.1) };
}

function formation(world, server) {
  const s = world.score;
  const sideSign = serviceSign(s, server.side ?? server.team);
  const tSign = -sideSign;
  const serverSide = sideOf(server.side ?? server.team);
  const recvSide = -serverSide;
  const serverTeamMates = world.players.filter((p) => p.team === server.team && p.id !== server.id);
  const recvTeam = otherTeam(server.team);
  const receivers = world.players.filter((p) => p.team === recvTeam);

  const spot = serveSpot(world, server);
  server.x = spot.x;
  server.y = spot.y;

  if (world.doubles && serverTeamMates[0]) {
    const mate = serverTeamMates[0];
    mate.x = -sideSign * 2.2;
    mate.y = serverSide * 3.8;
  }

  const receiver = receivers.find((p) => p.prefSide === tSign) ?? receivers[0];
  const others = receivers.filter((p) => p.id !== receiver.id);
  receiver.x = tSign * 2.8;
  // Recepção mais funda: perto da linha de fundo, como no tênis de verdade.
  receiver.y = recvSide * (COURT.HALF_LENGTH - 0.6);
  if (world.doubles && others[0]) {
    others[0].x = sideSign * 2.2;
    others[0].y = recvSide * 3.8;
  }
  // Guarda a posição de formação: a IA usa isso para esperar o saque sem
  // seguir a bola do outro lado da quadra. `pointSide` fixa o lado de cada um
  // durante o ponto: a formação espelha os lados a cada saque (como no tênis),
  // então a IA mantém o lado em que está, sem cruzar para o lado preferido.
  for (const p of world.players) {
    p.homeX = p.x;
    p.homeY = p.y;
    p.pointSide = Math.sign(p.x) || p.prefSide;
  }
  return receiver;
}

// ---------------------------------------------------------------------------
// Loop principal
// ---------------------------------------------------------------------------
export function startServeToss(world, p, charge, shot) {
  const quality = tossQuality(charge, p.stats?.serve ?? STATS.NEUTRAL);
  const vz = lerp(SERVE.TOSS_VZ_MIN, SERVE.TOSS_VZ_MAX, charge);
  const err = (1 - quality) * SERVE.TOSS_ERROR;
  const ang = world.rng() * Math.PI * 2;
  const ex = Math.cos(ang) * err;
  const ey = Math.sin(ang) * err;
  const apex = (vz * vz) / (2 * PHYS.GRAVITY);
  enterServeToss(world, {
    t: 0,
    charge,
    quality,
    shot,
    playerId: p.id,
    apex,
    idealZ: apex * SERVE.CONTACT_IDEAL,
  });
  const ball = world.ball;
  resetBall(ball, {
    x: p.x + ex,
    y: p.y + ey,
    z: 0.95,
    px: p.x + ex,
    py: p.y + ey,
    pz: 0.95,
    vx: ex * 0.6,
    vy: ey * 0.6,
    vz,
    heldBy: null,
    dead: false,
    touchedNet: false,
    crossed: false,
    onGround: false,
    bounces: [],
    spin: 'serve',
    bounceScale: 1,
  });
  emitEvent(world, { type: 'toss', player: p.id, quality });
  if (quality >= 0.999) setMessage(world, message('msg.tossPerfect'), 0.9);
  else if (quality <= 0.4) setMessage(world, message('msg.tossBad'), 0.9);
}

// ---------------------------------------------------------------------------
// Golpes
// ---------------------------------------------------------------------------
export function executeServe(world, p, charge, shot = 'flat') {
  const s = world.serve;
  if (s.serverId !== p.id || s.inFlight) return false;
  // Qualidade da batida: depende do toss (estágio 1) e da altura do contato
  // (estágio 2). Contato perto do alto = saque mais forte e preciso.
  const toss = s.toss;
  const contactZ = Math.max(0.7, world.ball.z);
  const contactVz = world.ball.vz;
  const idealZ = toss?.idealZ ?? 2.4;
  const heightFactor = clamp(1 - Math.abs(contactZ - idealZ) / SERVE.CONTACT_TOLERANCE, 0.3, 1);
  // O contato bom é na QUEDA: bater na subida é punido (saque fraco e impreciso).
  const riseFactor = contactVz > 0 ? SERVE.RISE_PENALTY : 1;
  const contactFactor = heightFactor * riseFactor;
  const tossQ = toss?.quality ?? 0.75;
  const quality = tossQ * (0.5 + 0.5 * contactFactor);
  const contactPower = lerp(0.8, 1.06, contactFactor);
  s.lastServe = { quality, heightFactor, contactFactor, contactZ, contactVz, tossQuality: tossQ };
  observeTelemetry(world, { type: 'serveContact', qualityDelta: quality - tossQ });
  const tSign = -serviceSign(world.score, p.side ?? p.team);
  const recvSide = -sideOf(p.side ?? p.team);

  // Tipo de saque (mesmas teclas das batidas): flat, top spin (kick), slice e
  // POWER (a tecla do lob vira um saque de força, mais rápido e arriscado).
  const type = normalizeServeType(shot);
  const isTopspin = type === 'topspin';
  const isSlice = type === 'slice';
  const isPower = type === 'power';

  const aim = serveAimTarget(world, p, type);
  let tx = aim.x;
  let ty = aim.y;

  const errBase = p.human
    ? (1 - Math.min(1, charge / 0.6)) * 1.6
    : (1 - p.ai.skill) * (s.attempt === 1 ? 2.0 : 0.8);
  const errPower = p.human && charge > 0.9 ? (charge - 0.9) * 2.5 : 0;
  // Precisão do saque: stat de saque manda, técnica ajuda na metade.
  // Toss/contato ruins aumentam bastante o erro (a essência do bom saque).
  const serveAcc =
    serveRiskMul(p.stats) *
    (0.5 + 0.5 * techniqueErrorMul(p.stats)) *
    (1 + (1 - quality) * 1.5);
  let errMag = (errBase + errPower) * serveAcc;
  // O saque kick arrisca mais; slice e lob são mais seguros.
  if (isTopspin) errMag = errMag * 1.35 + 0.15;
  else if (isPower) errMag *= 1.45; // força sem controle: erra mais
  else if (isSlice) errMag *= 0.75;
  let ang = world.rng() * Math.PI * 2;
  if (!p.human && s.attempt === 2 && world.rng() < (1 - p.ai.skill) * 0.08) {
    // Saque "tremido" ocasional: erra longo, gerando duplas faltas de verdade.
    ang = (recvSide > 0 ? Math.PI / 2 : -Math.PI / 2) + (world.rng() - 0.5) * 0.9;
    errMag = Math.max(errMag, 0.8) + 1.0 + world.rng() * 1.2;
  }
  tx += Math.cos(ang) * errMag;
  ty += Math.sin(ang) * errMag;

  // A bola é golpeada onde ela está (no alto, depois do lançamento).
  const ball = world.ball;
  const from = {
    x: clamp(ball.x, -(COURT.DOUBLES_HALF_WIDTH + 1.0), COURT.DOUBLES_HALF_WIDTH + 1.0),
    y: clamp(ball.y, -13.0, 13.0),
    z: Math.max(0.7, ball.z),
  };
  const to = { x: tx, y: ty, z: 0.03 };
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const speedMul = isSlice ? 0.78 : isTopspin ? 0.92 : isPower ? 1.12 : 1;
  // Voo base (flat) com a folga de rede do tipo; depois o tipo ajusta a
  // velocidade: slice e lob saem visivelmente mais lentos, o flat mais forte.
  let flight = clamp(
    dist / (lerp(14, 24, charge) * serveSpeedMul(p.stats) * contactPower),
    0.45,
    1.5,
  );
  let clearance = isPower ? 0.08 : isTopspin ? 0.45 : isSlice ? 0.06 : 0.12;
  flight = clearanceTime(from, to, flight, clearance);
  flight /= speedMul;
  // Slice do saque também tem efeito lateral (compensa o alvo com o voo final).
  const curve = isSlice ? CURVE.SLICE_SERVE : 0;
  if (curve) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const drift = 0.5 * curve * flight * flight;
    to.x -= (-dy / len) * drift;
    to.y -= (dx / len) * drift;
  }
  // Vento: mesma compensação do golpe (o saque mira onde deve cair).
  const wind = world.weather?.wind;
  if (wind) {
    const comp = 0.5 * flight * flight * WIND.COMPENSATION;
    to.x -= wind.x * comp;
    to.y -= wind.y * comp;
  }
  // Saque fraco pode bater na rede (e virar let quando passa raspando).
  const netRisk =
    (p.human ? (1 - Math.min(1, charge / 0.6)) * 0.15 : (1 - p.ai.skill) * 0.06) * serveAcc;
  if (world.rng() < netRisk) {
    // Saque errado: mira a fita (pode virar let se passar raspando).
    const crossX = from.x + (to.x - from.x) * ((0 - from.y) / (to.y - from.y));
    const hitT = timeForNetHit(from, to, netHeightAt(crossX) - 0.06, PHYS.GRAVITY);
    flight = hitT && hitT > 0.32 && hitT < flight ? hitT : clearanceTime(from, to, flight, -0.04);
  } else {
    flight = clearanceTime(from, to, flight, clearance);
  }
  const v = solveBallistic(from, to, flight, PHYS.GRAVITY, PHYS.AIR_DRAG);
  Object.assign(world.ball, {
    x: from.x,
    y: from.y,
    z: from.z,
    px: from.x,
    py: from.y,
    pz: from.z,
    vx: v.vx,
    vy: v.vy,
    vz: v.vz,
    heldBy: null,
    dead: false,
    touchedNet: false,
    crossed: false,
    onGround: false,
    bounces: [],
    spin: type,
    bounceScale: isTopspin ? 1.35 : isSlice ? 0.5 : isPower ? 0.9 : 1,
    curve,
    lastHit: { team: p.team, player: p.id, isServe: true, attempt: s.attempt, turbo: false, shot: type },
  });
  s.box = {
    xMin: tSign > 0 ? 0 : -COURT.SINGLES_HALF_WIDTH,
    xMax: tSign > 0 ? COURT.SINGLES_HALF_WIDTH : 0,
    yMin: recvSide > 0 ? 0 : -COURT.SERVICE_LINE,
    yMax: recvSide > 0 ? COURT.SERVICE_LINE : 0,
  };
  enterServeFlight(world);
  emitEvent(world, { type: 'serve', player: p.id, attempt: s.attempt, shot: type });
  return true;
}

// ---------------------------------------------------------------------------
// Regras da bola
// ---------------------------------------------------------------------------
export function registerFault(world) {
  const s = world.serve;
  observeTelemetry(world, { type: 'fault' });
  if (s.attempt === 1) {
    s.attempt = 2;
    setMessage(world, message('msg.fault'), 1.4);
    replayServe(world);
  } else {
    observeTelemetry(world, { type: 'doubleFault' });
    awardPoint(world, otherTeam(s.serverTeam), 'doubleFault');
  }
}

export function replayServe(world) {
  const s = world.serve;
  enterServePreparation(world);
  const server = world.byId[s.serverId];
  // O sacador volta para a posição de saque e o recebedor (e os parceiros)
  // voltam para a formação: depois de uma falta no 1º saque (ou de um let), o
  // 2º saque sai das posições de saque, não de onde os jogadores pararam.
  formation(world, server);
  for (const p of world.players) {
    p.vx = 0;
    p.vy = 0;
  }
  const ball = world.ball;
  resetBall(ball, {
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
    spin: 'serve',
    bounceScale: 1,
    curve: 0,
    bounces: [],
  });
  server.charge = 0;
  server.charging = false;
}


export function advanceServeToss(world, dt) {
  const s = world.serve;
  if (!s.toss) return;
  s.toss.t += dt;
  if (world.ball.z <= SERVE.HIT_MIN_Z && world.ball.vz < 0) {
    setMessage(world, message('msg.tossLost'), 1.4);
    registerFault(world);
  }
}
