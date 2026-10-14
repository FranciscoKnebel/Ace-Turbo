import { transitionPhase } from './systems/phases.js';
import { normalizeServeType, serveAimTarget } from './serve-target.js';
export { normalizeServeType, serveAimTarget } from './serve-target.js';
import { teamAt, serviceSign } from './court-sides.js';
import { pickServer, changeEnds } from './service.js';
export { pickServer, changeEnds } from './service.js';
import { makePlayer, resolveWeather } from './systems/creation.js';
import { makeStats, bump, bumpAmount, bumpGroup } from './systems/telemetry.js';
export { makeStats } from './systems/telemetry.js';
import { setMessage } from './systems/messages.js';
export { setMessage } from './systems/messages.js';
import { applySetFatigue, applyHitCost } from './systems/energy.js';
export { applySetFatigue } from './systems/energy.js';
import { resolvePlayerCollisions } from './systems/movement.js';
export { resolvePlayerCollisions } from './systems/movement.js';
import { aimWorld, classifyShot, clearanceTime, tossQuality } from './systems/shot-model.js';
export { aimWorld, classifyShot, tossQuality } from './systems/shot-model.js';
import { executeRallyShot } from './systems/rally.js';
export { executeRallyShot } from './systems/rally.js';
import { advancePlayer } from './systems/players.js';
import { awardPoint } from './systems/points.js';
export { awardPoint } from './systems/points.js';
import { blankInput, message } from './contracts.js';
import { MODES, normalizeMatchOptions } from './config.js';
export { MODES } from './config.js';
import { COURT, CURVE, DIFFICULTY, PHYS, PLAYER, SERVE, SURFACES, WEATHERS, WIND } from './constants.js';
import { otherTeam, sideOf, stepAI, teamOfSide } from './ai.js';
import { clamp, lerp, pointInBox, pointSegmentDistance, solveBallistic, timeForNetHit } from './math.js';
import { makeBall, netHeightAt, resetBall, stepBall } from './physics.js';
import { mulberry32 } from './rng.js';
import { STATS, serveRiskMul, serveSpeedMul, techniqueErrorMul } from './stats.js';
import { MatchScore } from './score.js';

export { otherTeam, pointInBox, sideOf, teamOfSide };

export function createWorld(options = {}) {
  const { mode, difficulty, seed, bestOf, surface, weather, noAd, superTiebreak, players: playerConfig } = normalizeMatchOptions(options);
  const def = MODES[mode] ?? MODES.singles;
  const diff = DIFFICULTY[difficulty] ?? DIFFICULTY.normal;
  const rng = mulberry32(seed);
  const surfaceId = SURFACES[surface] ? surface : 'hard';
  const weatherKind = WEATHERS[weather] ? weather : weather === 'random' ? 'random' : 'night';
  const players = def.players.map((spec) => makePlayer(spec, diff, playerConfig[spec.id], rng));
  const byId = {};
  for (const p of players) byId[p.id] = p;

  const world = {
    mode,
    doubles: def.doubles,
    endsSwapped: false,
    difficulty,
    surface: surfaceId,
    weather: resolveWeather(weatherKind, rng),
    elapsed: 0,
    seed,
    rng,
    players,
    byId,
    score: new MatchScore({ bestOf, noAd, superTiebreak }),
    ball: makeBall(),
    phase: 'serve',
    phaseTimer: 0,
    message: '',
    messageTimer: 0,
    events: [],
    inputs: {},
    serve: {
      id: 0,
      serverId: null,
      serverTeam: 'a',
      receiverId: null,
      receiverTeam: 'b',
      attempt: 1,
      inFlight: false,
      returned: false,
      returnPending: false,
      stage: 'toss',
      box: null,
      toss: null,
      lastServe: null,
    },
    lastPoint: null,
    rallyShots: 0,
    lastEndChangeGames: 0,
    stats: makeStats(),
    setStats: makeStats(),
    setHistory: [],
    setSummary: null,
  };
  for (const p of players) {
    if (p.human) world.inputs[p.id] = blankInput();
  }
  world.ball.surface = surfaceId;
  world.ball.wind = world.weather.wind;
  resetForServe(world);
  return world;
}

// `stats` é o total da partida; `setStats` é o set atual e `setHistory` guarda
// um retrato de cada set encerrado (usado nas telas de fim de set e de jogo).
// ---------------------------------------------------------------------------
// Saque: formação e reinício de ponto
// ---------------------------------------------------------------------------
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
  world.serve = {
    id: world.serve.id + 1,
    serverId: server.id,
    serverTeam: server.team,
    receiverId: null,
    receiverTeam: otherTeam(server.team),
    attempt: 1,
    inFlight: false,
    returned: false,
    returnPending: false,
    stage: 'toss',
    box: null,
    toss: null,
    lastServe: null,
  };
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
export function stepWorld(world, dt) {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.05) throw new RangeError('World tick must be in (0, 0.05] seconds');
  world.elapsed = (world.elapsed ?? 0) + dt;
  world.events.length = 0;
  if (world.messageTimer > 0) world.messageTimer = Math.max(0, world.messageTimer - dt);

  if (world.phase === 'pointover') {
    // Pausa do ponto: o anúncio é mais longo, mas a movimentação continua
    // liberada (só os golpes ficam bloqueados, porque a bola está morta).
    for (const p of world.players) {
      if (p.human) {
        const src = world.inputs[p.id];
        if (src) p.input = src;
      } else {
        Object.assign(p.input, blankInput());
      }
      advancePlayer(world, p, dt, false, { release, tryHit });
    }
    resolvePlayerCollisions(world);
    const evs = [];
    stepBall(world.ball, dt, world.doubles, evs);
    for (const ev of evs) world.events.push({ ...ev, type: `ball_${ev.type}` });
    world.phaseTimer -= dt;
    if (world.phaseTimer <= 0) {
      if (world.score.winner) {
        transitionPhase(world, 'matchover');
        setMessage(world, message('msg.matchWon', { team: world.score.winner }), 9999);
      } else {
        resetForServe(world);
      }
    }
    return;
  }
  if (world.phase === 'matchover') {
    for (const p of world.players) advancePlayer(world, p, dt, true, { release, tryHit });
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
  for (const p of world.players) advancePlayer(world, p, dt, false, { release, tryHit });
  resolvePlayerCollisions(world);

  // 3) bola
  const physEvents = [];
  const serve = world.serve;
  if (serve.toss) {
    // Estágio 2: a bola está no alto esperando a batida (o saque acontece no
    // release do jogador). Se ela cair sem ser batida, é falta (toss perdido).
    serve.toss.t += dt;
    if (world.ball.z <= SERVE.HIT_MIN_Z && world.ball.vz < 0) {
      serve.toss = null;
      serve.stage = 'toss';
      setMessage(world, message('msg.tossLost'), 1.4);
      registerFault(world);
    }
  }
  if (world.phase === 'serve' && !serve.inFlight && !serve.toss) {
    const srv = world.byId[serve.serverId];
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
  for (const ev of physEvents) world.events.push({ ...ev, type: `ball_${ev.type}` });
  if (!world.serve.toss) {
    for (const ev of physEvents) {
      if (world.phase !== 'serve' && world.phase !== 'rally') break;
      if (ev.type === 'bounce') processBounce(world, ev);
      else if (ev.type === 'fence') handleFence(world, ev);
    }
  }

  // 4.4) a bola parou no chão? decide o ponto.
  checkBallStopped(world);

  // 4.5) a bola toca um jogador? (o time dele perde o ponto na hora)
  checkPlayerBallCollision(world);
}

// A bola parou de rolar no chão sem chegar ao segundo quique (golpe fraco ou
// quique fora): o ponto é decidido para a jogada não travar.
function checkBallStopped(world) {
  const ball = world.ball;
  const last = ball.lastHit;
  if (!last || ball.dead || ball.heldBy) return;
  if (world.phase !== 'rally' && world.phase !== 'serve') return;
  if (!ball.onGround || Math.hypot(ball.vx, ball.vy) > 0.01) return;
  const bounces = ball.bounces.filter((b) => teamAt(world, b.y) !== last.team);
  if (!bounces.length) return;
  resolveRallyEnd(world, bounces, false);
}

// Mantém o jogador dentro dos limites (laterais, fundo e sem cruzar a rede).
// A bola toca um jogador: o time dele perde o ponto na hora. Vale para o
// parceiro (antes de a bola cruzar a rede ou quicar) e para o adversário.
export function checkPlayerBallCollision(world) {
  if (world.phase !== 'serve' && world.phase !== 'rally') return false;
  // Bola na mão ou em lançamento (toss) não conta como toque no jogador.
  if (world.ball.heldBy || world.serve.toss) return false;
  const ball = world.ball;
  if (ball.dead) return false;
  const last = ball.lastHit;
  for (const p of world.players) {
    if (last && last.player === p.id) continue; // o próprio batedor não conta
    // Se o jogador está jogando a bola (carga ou golpe ativo), o toque no corpo
    // não conta: a raquete está no lance.
    if (p.charging || p.swing) continue;
    if (ball.z > 1.8) continue; // bola alta passa por cima
    const d = pointSegmentDistance(p.x, p.y, ball.px, ball.py, ball.x, ball.y);
    if (d <= 0.25 + PHYS.BALL_RADIUS) {
      const isPartner = last && p.team === last.team;
      if (isPartner) {
        // Regra do parceiro: perde o ponto se a bola ainda não cruzou a rede
        // nem tocou o chão. Depois disso, a bola passou e o toque é ignorado.
        if (!ball.crossed && ball.bounces.length === 0) {
          awardPoint(world, otherTeam(p.team), 'partner');
          return true;
        }
        continue;
      }
      // Adversário: vale depois do quique (a bola já entrou na quadra dele).
      if (ball.bounces.length > 0) {
        awardPoint(world, otherTeam(p.team), 'player');
        return true;
      }
      continue;
    }
  }
  return false;
}

// Fadiga de partida: a cada set concluído a barra máxima encolhe um pouco,
// menos para quem tem vigor alto (vigor mínimo 9% por set, neutro 6%, máximo
// 3%), sem nunca cair abaixo de FATIGUE.MIN_MUL do máximo.
function release(world, p) {
  const charge = clamp(p.charge, 0, 1);
  const shot = p.chargeShot ?? classifyShot(p.input);
  p.charging = false;
  p.charge = 0;
  p.chargeShot = 'flat';
  if (world.phase === 'serve' && world.serve.serverId === p.id && !world.serve.inFlight) {
    if (world.serve.stage === 'hit' && world.serve.toss) {
      executeServe(world, p, charge, shot); // estágio 2: batida
    } else {
      startServeToss(world, p, charge, shot); // estágio 1: toss
    }
    return;
  }
  if (world.phase === 'serve' || world.phase === 'rally') {
    p.swing = { t: 0, didHit: false, charge, shot };
    world.events.push({ type: 'swing', player: p.id, shot });
  }
}

// Qualidade do toss: a área (0,6 a 0,9) vale 90%+ e a área interna, que cresce
// com o stat de saque, vale 100%. Fora da área a qualidade cai rápido.
export function startServeToss(world, p, charge, shot) {
  const s = world.serve;
  const quality = tossQuality(charge, p.stats?.serve ?? STATS.NEUTRAL);
  const vz = lerp(SERVE.TOSS_VZ_MIN, SERVE.TOSS_VZ_MAX, charge);
  const err = (1 - quality) * SERVE.TOSS_ERROR;
  const ang = world.rng() * Math.PI * 2;
  const ex = Math.cos(ang) * err;
  const ey = Math.sin(ang) * err;
  const apex = (vz * vz) / (2 * PHYS.GRAVITY);
  s.stage = 'hit';
  s.toss = {
    t: 0,
    charge,
    quality,
    shot,
    playerId: p.id,
    apex,
    idealZ: apex * SERVE.CONTACT_IDEAL,
  };
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
  bump(world, 'tosses');
  bumpAmount(world, 'tossQualitySum', quality);
  world.events.push({ type: 'toss', player: p.id, quality });
  if (quality >= 0.999) setMessage(world, message('msg.tossPerfect'), 0.9);
  else if (quality <= 0.4) setMessage(world, message('msg.tossBad'), 0.9);
}

// ---------------------------------------------------------------------------
// Golpes
// ---------------------------------------------------------------------------
export function tryHit(world, p) {
  // Fora de serve/rally (pausa do ponto, fim de jogo) não há golpe: a bola
  // está morta e o ponto já foi decidido.
  if (world.phase !== 'serve' && world.phase !== 'rally') return false;
  const ball = world.ball;
  if (ball.dead || ball.heldBy) return false;
  if (!p.swing || p.swing.didHit) return false;
  if (ball.lastHit && ball.lastHit.team === p.team) return false;
  // No saque, a devolução é sempre do recebedor designado (o lado que recebeu);
  // o parceiro da rede não pode "roubar" a devolução.
  if (world.serve.returnPending && world.serve.receiverId && p.id !== world.serve.receiverId) {
    return false;
  }
  if (teamAt(world, ball.y) !== p.team) return false;
  if (ball.z > PLAYER.REACH_HEIGHT) return false;
  const d = pointSegmentDistance(p.x, p.y, ball.px, ball.py, ball.x, ball.y);
  if (d > PLAYER.REACH) return false;
  executeRallyShot(world, p, ball);
  p.swing.didHit = true;
  applyHitCost(p, ball);
  return true;
}

// Custo de vigor da batida: fixo + extra quando o jogador teve de correr ou se
// esticar para chegar na bola.
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
  s.toss = null;
  s.stage = 'flight';
  bumpAmount(world, 'tossQualitySum', quality - tossQ);
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
  s.inFlight = true;
  s.returned = false;
  s.returnPending = true;
  s.box = {
    xMin: tSign > 0 ? 0 : -COURT.SINGLES_HALF_WIDTH,
    xMax: tSign > 0 ? COURT.SINGLES_HALF_WIDTH : 0,
    yMin: recvSide > 0 ? 0 : -COURT.SERVICE_LINE,
    yMax: recvSide > 0 ? COURT.SERVICE_LINE : 0,
  };
  transitionPhase(world, 'serve');
  bump(world, 'serves');
  bump(world, s.attempt === 1 ? 'firstServes' : 'secondServes');
  bumpGroup(world, 'serveTypes', type);
  world.events.push({ type: 'serve', player: p.id, attempt: s.attempt, shot: type });
  return true;
}

// ---------------------------------------------------------------------------
// Regras da bola
// ---------------------------------------------------------------------------
export function processBounce(world, ev) {
  const ball = world.ball;
  const last = ball.lastHit;
  if (!last) return;

  if (world.serve.inFlight && last.isServe) {
    handleServeBounce(world, ev);
    return;
  }

  const bounceSide = teamAt(world, ev.y);
  if (bounceSide === last.team) {
    awardPoint(world, otherTeam(last.team), ball.touchedNet ? 'net' : 'outOfArea');
    return;
  }

  // Quiques no lado de quem recebeu (inclui o atual, que a física já registrou).
  // Um quique FORA já é ponto do adversário na hora. O quique DENTRO não
  // encerra: a jogada segue até o segundo quique, o que dá chance de buscar uma
  // bola funda perto da linha antes que o ponto seja chamado.
  const receiverBounces = ball.bounces.filter((b) => teamAt(world, b.y) !== last.team);
  const first = receiverBounces[0];
  if (first && !first.inCourt) {
    awardPoint(world, otherTeam(last.team), 'out');
    return;
  }
  if (receiverBounces.length >= 2) {
    resolveRallyEnd(world, receiverBounces, ev.inCourt);
  }
}

// Fim de jogada depois de pelo menos um quique do lado de quem recebeu.
function resolveRallyEnd(world, bounces, secondInCourt = true) {
  const last = world.ball.lastHit;
  if (!last) return;
  const first = bounces[0];
  if (!first || !first.inCourt) {
    awardPoint(world, otherTeam(last.team), 'out');
    return;
  }
  const ace = last.isServe && !world.serve.returned;
  if (ace) {
    awardPoint(world, last.team, 'ace');
    return;
  }
  awardPoint(world, last.team, secondInCourt ? 'doubleBounce' : 'point');
}

function handleServeBounce(world, ev) {
  const s = world.serve;
  const recvTeam = otherTeam(s.serverTeam);
  const bounceSide = teamAt(world, ev.y);
  if (bounceSide !== recvTeam) {
    registerFault(world);
    return;
  }
  const inBox = pointInBox(ev.x, ev.y, s.box);
  if (world.ball.touchedNet) {
    if (inBox) {
      bump(world, 'lets');
      setMessage(world, message('msg.let'), 1.5);
      replayServe(world);
    } else {
      registerFault(world);
    }
    return;
  }
  if (inBox) {
    s.inFlight = false;
    transitionPhase(world, 'rally');
    return;
  }
  registerFault(world);
}

export function registerFault(world) {
  const s = world.serve;
  bump(world, 'faults');
  if (s.attempt === 1) {
    s.attempt = 2;
    setMessage(world, message('msg.fault'), 1.4);
    replayServe(world);
  } else {
    bump(world, 'doubleFaults');
    awardPoint(world, otherTeam(s.serverTeam), 'doubleFault');
  }
}

function replayServe(world) {
  const s = world.serve;
  s.inFlight = false;
  s.returned = false;
  s.stage = 'toss';
  s.box = null;
  s.toss = null;
  s.returnPending = false;
  transitionPhase(world, 'serve');
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

function handleFence(world, ev) {
  const ball = world.ball;
  const last = ball.lastHit;
  if (!last) return;
  if (world.serve.inFlight && last.isServe) {
    registerFault(world);
    return;
  }
  const bounces = ball.bounces.filter((b) => teamAt(world, b.y) !== last.team);
  resolveRallyEnd(world, bounces, false);
}

// ---------------------------------------------------------------------------
// Ponto
// ---------------------------------------------------------------------------
