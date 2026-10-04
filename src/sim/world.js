import { COURT, CURVE, DIFFICULTY, MATCH, PHYS, PLAYER, SERVE, STAMINA, TURBO } from './constants.js';
import { t } from '../i18n.js';
import { blankInput, createAI, otherTeam, sideOf, stepAI, teamOfSide } from './ai.js';
import {
  clamp,
  lerp,
  pointInBox,
  pointSegmentDistance,
  solveBallistic,
  timeForNetClearance,
  timeForNetHit,
} from './math.js';
import { makeBall, netHeightAt, stepBall } from './physics.js';
import { mulberry32 } from './rng.js';
import {
  powerMul,
  resolvePlayerStats,
  serveRiskMul,
  serveSpeedMul,
  staminaDrainMul,
  staminaMax,
  staminaRegenMul,
  techniqueErrorMul,
} from './stats.js';
import { MatchScore } from './score.js';

export { otherTeam, pointInBox, sideOf, teamOfSide };

export const MODES = {
  coop: {
    doubles: true,
    players: [
      { id: 'a1', team: 'a', human: true, prefSide: 1 },
      { id: 'a2', team: 'a', human: true, prefSide: -1 },
      { id: 'b1', team: 'b', human: false, prefSide: -1 },
      { id: 'b2', team: 'b', human: false, prefSide: 1 },
    ],
  },
  singles: {
    doubles: false,
    players: [
      { id: 'a1', team: 'a', human: true, prefSide: 1 },
      { id: 'b1', team: 'b', human: false, prefSide: -1 },
    ],
  },
  versus: {
    doubles: false,
    players: [
      { id: 'a1', team: 'a', human: true, prefSide: 1 },
      { id: 'b1', team: 'b', human: true, prefSide: -1 },
    ],
  },
  demo: {
    doubles: true,
    players: [
      { id: 'a1', team: 'a', human: false, prefSide: 1 },
      { id: 'a2', team: 'a', human: false, prefSide: -1 },
      { id: 'b1', team: 'b', human: false, prefSide: -1 },
      { id: 'b2', team: 'b', human: false, prefSide: 1 },
    ],
  },
};

export function createWorld({
  mode = 'singles',
  difficulty = 'normal',
  seed = 1,
  bestOf = MATCH.BEST_OF,
  players: playerConfig = {},
} = {}) {
  const def = MODES[mode] ?? MODES.singles;
  const diff = DIFFICULTY[difficulty] ?? DIFFICULTY.normal;
  const rng = mulberry32(seed);
  const players = def.players.map((spec) => makePlayer(spec, diff, playerConfig[spec.id], rng));
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
      box: null,
      toss: null,
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
  resetForServe(world);
  return world;
}

function makePlayer(spec, diff, config, rng) {
  const human = spec.human;
  // Stats da classe (ou aleatórias para a CPU, sorteadas por partida).
  const resolved = resolvePlayerStats(config, rng);
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
    chargeShot: 'flat',
    swing: null,
    swingCooldown: 0,
    turbo: TURBO.MAX,
    classId: resolved.classId,
    stats: resolved.stats,
    traits: resolved.traits,
    staminaMax: staminaMax(resolved.stats),
    stamina: staminaMax(resolved.stats),
    sprinting: false,
    exhausted: false,
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
// Estatísticas
// ---------------------------------------------------------------------------
// `stats` é o total da partida; `setStats` é o set atual e `setHistory` guarda
// um retrato de cada set encerrado (usado nas telas de fim de set e de jogo).
export function makeStats() {
  return {
    serves: 0,
    firstServes: 0,
    secondServes: 0,
    faults: 0,
    doubleFaults: 0,
    lets: 0,
    aces: 0,
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
    serveTypes: { flat: 0, topspin: 0, slice: 0, lob: 0 },
    reasons: {},
  };
}

function bump(world, key, n = 1) {
  world.stats[key] = (world.stats[key] ?? 0) + n;
  world.setStats[key] = (world.setStats[key] ?? 0) + n;
}

function bumpGroup(world, group, key, n = 1) {
  world.stats[group][key] = (world.stats[group][key] ?? 0) + n;
  world.setStats[group][key] = (world.setStats[group][key] ?? 0) + n;
}

function snapshotStats(stats) {
  return JSON.parse(JSON.stringify(stats));
}

// ---------------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------------
export function setMessage(world, text, time = 0) {
  world.message = text;
  world.messageTimer = time;
}

function teamLabel(team) {
  return t(team === 'a' ? 'team.a' : 'team.b');
}

// Códigos internos de motivo -> chave de tradução (o código em si não muda).
const REASON_KEYS = {
  'BATEU NO PARCEIRO': 'partner',
  'BATEU NO JOGADOR': 'player',
  'NA REDE': 'net',
  'FORA DA ÁREA': 'outOfArea',
  'A BOLA QUICOU DUAS VEZES': 'doubleBounce',
  PONTO: 'point',
  FORA: 'out',
  ACE: 'ace',
  'DUPLA FALTA': 'doubleFault',
};

function reasonLabel(reason) {
  return t(`reason.${REASON_KEYS[reason] ?? 'point'}`);
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

// Troca de lado (tênis): os jogadores mudam de metade da quadra e o placar
// vai junto, porque o placar pertence ao jogador, não ao lado.
export function changeEnds(world) {
  for (const p of world.players) {
    p.team = otherTeam(p.team);
    p.prefSide = -p.prefSide;
  }
  const s = world.score;
  [s.points.a, s.points.b] = [s.points.b, s.points.a];
  [s.games.a, s.games.b] = [s.games.b, s.games.a];
  [s.tbPoints.a, s.tbPoints.b] = [s.tbPoints.b, s.tbPoints.a];
  [s.setsWon.a, s.setsWon.b] = [s.setsWon.b, s.setsWon.a];
  [s.teamServeIndex.a, s.teamServeIndex.b] = [s.teamServeIndex.b, s.teamServeIndex.a];
  s.sets = s.sets.map((set) => {
    const swapped = { a: set.b, b: set.a };
    if (set.tiebreak) swapped.tiebreak = { a: set.tiebreak.b, b: set.tiebreak.a };
    return swapped;
  });
  s.history = s.history.map((h) => ({ ...h, team: otherTeam(h.team) }));
  s.server = otherTeam(s.server);
  s.initialServer = otherTeam(s.initialServer);
  if (s.tbFirstServer) s.tbFirstServer = otherTeam(s.tbFirstServer);
}

export function resetForServe(world) {
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
    box: null,
    toss: null,
  };
  world.phase = 'serve';
  world.rallyShots = 0;
  // O recebedor é sempre o jogador do lado que recebeu o saque (caixa diagonal).
  world.serve.receiverId = formation(world, server).id;
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
  if (swappedSides) setMessage(world, t('msg.sideChange'), 1.6);
}

// Posição oficial do sacador para o saque atual.
export function serveSpot(world, server) {
  const sideSign = world.score.serveSideSign(server.team);
  return { x: sideSign * 1.6, y: sideOf(server.team) * (COURT.HALF_LENGTH + 1.1) };
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
  return receiver;
}

// ---------------------------------------------------------------------------
// Loop principal
// ---------------------------------------------------------------------------
export function stepWorld(world, dt) {
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
      applyPlayerLogic(world, p, dt, false);
    }
    resolvePlayerCollisions(world);
    const evs = [];
    stepBall(world.ball, dt, world.doubles, evs);
    for (const ev of evs) world.events.push({ ...ev, type: `ball_${ev.type}` });
    world.phaseTimer -= dt;
    if (world.phaseTimer <= 0) {
      if (world.score.winner) {
        world.phase = 'matchover';
        setMessage(world, t('msg.matchWon', { team: teamLabel(world.score.winner) }), 9999);
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
  resolvePlayerCollisions(world);

  // 3) bola
  const physEvents = [];
  const serve = world.serve;
  if (serve.toss) {
    // Lançamento do saque: a bola sobe e, depois do tempo de preparação,
    // o sacador bate (a bola é golpeada no alto).
    serve.toss.t += dt;
    if (serve.toss.t >= SERVE.TOSS_TIME) {
      const srv = world.byId[serve.toss.playerId];
      const { charge, shot } = serve.toss;
      serve.toss = null;
      executeServe(world, srv, charge, shot);
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
  const bounces = ball.bounces.filter((b) => teamOfSide(b.y) !== last.team);
  if (!bounces.length) return;
  resolveRallyEnd(world, bounces, false);
}

// Mantém o jogador dentro dos limites (laterais, fundo e sem cruzar a rede).
function clampPlayerToCourt(p) {
  const side = sideOf(p.team);
  const xMax = COURT.DOUBLES_HALF_WIDTH + 1.8;
  p.x = clamp(p.x, -xMax, xMax);
  const yMax = COURT.HALF_LENGTH + 3.2; // dá para buscar bola atrás da linha
  if (side < 0) p.y = clamp(p.y, -yMax, -PLAYER.NET_MARGIN);
  else p.y = clamp(p.y, PLAYER.NET_MARGIN, yMax);
}

// Colisão entre companheiros de time: ninguém ocupa o mesmo espaço.
export function resolvePlayerCollisions(world) {
  const players = world.players;
  const minD = PLAYER.RADIUS * 2;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      if (a.team !== b.team) continue; // times ficam em lados opostos da rede
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= minD) continue;
      if (d < 1e-4) {
        a.x -= minD / 2;
        b.x += minD / 2;
      } else {
        const push = (minD - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
      }
      clampPlayerToCourt(a);
      clampPlayerToCourt(b);
    }
  }
}

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
          awardPoint(world, otherTeam(p.team), 'BATEU NO PARCEIRO');
          return true;
        }
        continue;
      }
      // Adversário: vale depois do quique (a bola já entrou na quadra dele).
      if (ball.bounces.length > 0) {
        awardPoint(world, otherTeam(p.team), 'BATEU NO JOGADOR');
        return true;
      }
      continue;
    }
  }
  return false;
}

function applyPlayerLogic(world, p, dt, frozen) {
  const fr = Math.exp(-PLAYER.FRICTION * dt);
  const input = p.input;
  // O sacador esperando para sacar fica parado: as teclas de direção são mira.
  const waitingServe =
    world.phase === 'serve' && world.serve.serverId === p.id && !world.serve.inFlight;
  // Direções relativas à tela (câmera atrás do time A): cima = +y, direita = +x.
  const dx = frozen || waitingServe ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = frozen || waitingServe ? 0 : (input.up ? 1 : 0) - (input.down ? 1 : 0);

  p.vx += dx * PLAYER.ACCEL * dt;
  p.vy += dy * PLAYER.ACCEL * dt;
  if (dx === 0) p.vx *= fr;
  if (dy === 0) p.vy *= fr;
  // Vigor: Shift corre mais rápido, gastando a barra; sem correr, recarrega.
  // Ao esvaziar, é preciso soltar o Shift para voltar a correr.
  if (!input.sprint) p.exhausted = false;
  const wantsSprint = !frozen && input.sprint && (dx !== 0 || dy !== 0);
  const canSprint =
    !p.exhausted && (p.sprinting ? p.stamina > 0 : p.stamina > STAMINA.MIN_START);
  // Cansado (barra baixa): anda mais devagar e carrega mais devagar.
  const tired = p.stamina < STAMINA.LOW;
  let maxSpeed = p.maxSpeed * (tired ? STAMINA.LOW_SPEED : 1);
  const staminaMaxValue = p.staminaMax ?? STAMINA.MAX;
  if (wantsSprint && canSprint) {
    p.sprinting = true;
    maxSpeed *= STAMINA.SPEED_MULT;
    p.stamina = Math.max(0, p.stamina - STAMINA.DRAIN * staminaDrainMul(p.stats) * dt);
    if (p.stamina <= 0) p.exhausted = true;
  } else {
    p.sprinting = false;
    // A recarga pausa no saque e no fim de ponto; a IA recarrega mais devagar.
    if (world.phase === 'rally' && !p.charging) {
      const regen =
        STAMINA.REGEN * staminaRegenMul(p.stats) * (p.human ? 1 : STAMINA.AI_REGEN);
      p.stamina = Math.min(staminaMaxValue, p.stamina + regen * dt);
    }
  }
  const spd = Math.hypot(p.vx, p.vy);
  if (spd > maxSpeed) {
    p.vx *= maxSpeed / spd;
    p.vy *= maxSpeed / spd;
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  clampPlayerToCourt(p);

  p.turbo = Math.min(TURBO.MAX, p.turbo + TURBO.REGEN * dt);

  if (p.swingCooldown > 0) p.swingCooldown = Math.max(0, p.swingCooldown - dt);

  if (frozen) {
    p.charging = false;
    p.charge = 0;
    return;
  }

  // Carga e soltura (o saque ou o golpe começam no release). O tipo de batida
  // é memorizado enquanto a tecla está pressionada, porque no release a tecla
  // já foi solta. Durante o lançamento do saque (toss) não há nova carga: a
  // batida acontece automaticamente.
  const tossing =
    world.phase === 'serve' && world.serve.toss && world.serve.toss.playerId === p.id;
  if (!tossing) {
    if (input.swing) {
      if (!p.charging && p.swingCooldown <= 0 && !p.swing) {
        p.charging = true;
        p.charge = 0;
        p.chargeShot = classifyShot(input);
      } else if (p.charging) {
        // Cansado carrega mais devagar; segurar a batida também gasta vigor.
        const rate = tired ? STAMINA.LOW_CHARGE : 1;
        p.charge = Math.min(1, p.charge + (dt / PLAYER.CHARGE_TIME) * rate);
        p.chargeShot = classifyShot(input);
        p.stamina = Math.max(0, p.stamina - STAMINA.CHARGE_DRAIN * staminaDrainMul(p.stats) * dt);
        if (p.stamina <= 0) p.exhausted = true;
      }
    } else if (p.charging) {
      release(world, p);
    }
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
  const shot = p.chargeShot ?? classifyShot(p.input);
  p.charging = false;
  p.charge = 0;
  p.chargeShot = 'flat';
  if (world.phase === 'serve' && world.serve.serverId === p.id && !world.serve.inFlight) {
    startServeToss(world, p, charge, shot);
    return;
  }
  if (world.phase === 'serve' || world.phase === 'rally') {
    p.swing = { t: 0, didHit: false, charge, shot };
    world.events.push({ type: 'swing', player: p.id, shot });
  }
}

// Lança a bola para o alto; a batida acontece depois do tempo de preparação
// (ver SERVE.TOSS_TIME): como no tênis de verdade.
export function startServeToss(world, p, charge, shot) {
  const s = world.serve;
  s.toss = { t: 0, charge, shot, playerId: p.id };
  const ball = world.ball;
  Object.assign(ball, {
    x: p.x,
    y: p.y,
    z: 0.95,
    px: p.x,
    py: p.y,
    pz: 0.95,
    vx: 0,
    vy: 0,
    vz: SERVE.TOSS_VZ,
    heldBy: null,
    dead: false,
    touchedNet: false,
    crossed: false,
    onGround: false,
    bounces: [],
    spin: 'serve',
    bounceScale: 1,
  });
  world.events.push({ type: 'toss', player: p.id });
}

// ---------------------------------------------------------------------------
// Golpes
// ---------------------------------------------------------------------------
export function aimWorld(p) {
  // A IA define a mira explicitamente (input.aim) para poder mirar sem andar.
  if (p.input.aim) {
    return { x: p.input.aim.x ?? 0, fwd: p.input.aim.depth ?? 0 };
  }
  const x = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
  const upDown = (p.input.up ? 1 : 0) - (p.input.down ? 1 : 0);
  // "fwd" = em direção à rede no referencial do jogador (time A sobe, time B desce).
  const fwd = p.team === 'a' ? upDown : -upDown;
  return { x, fwd };
}

export function tryHit(world, p) {
  const ball = world.ball;
  if (ball.dead || ball.heldBy) return false;
  if (!p.swing || p.swing.didHit) return false;
  if (ball.lastHit && ball.lastHit.team === p.team) return false;
  // No saque, a devolução é sempre do recebedor designado (o lado que recebeu);
  // o parceiro da rede não pode "roubar" a devolução.
  if (world.serve.returnPending && world.serve.receiverId && p.id !== world.serve.receiverId) {
    return false;
  }
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

  if (ball.lastHit && ball.lastHit.isServe) {
    // Devolução feita: libera o jogo normal (o parceiro já pode bater depois).
    world.serve.inFlight = false;
    world.serve.returned = true;
    world.serve.returnPending = false;
    world.phase = 'rally';
  }

  // Tipo de batida escolhido pela tecla (flat, topspin, slice ou lob).
  const shot = p.swing.shot ?? 'flat';
  const isTopspin = shot === 'topspin';
  const isSlice = shot === 'slice';
  const isLob = shot === 'lob';

  // Forehand/backhand: de que lado do corpo (em relação à mão dominante) a
  // bola foi batida. Forehand é mais forte e seguro; backhand erra mais.
  const lateral = (ball.x - p.x) * (p.team === 'a' ? 1 : -1);
  const hand = lateral > 0.2 ? 'forehand' : lateral < -0.2 ? 'backhand' : 'neutral';

  // Situação do golpe (mecânicas fundamentais do tênis):
  // devolução (primeiro golpe após o saque), voleio (antes do quique, perto da
  // rede), smash (bola alta antes do quique), meio-voleio (logo após o quique,
  // bola baixa) ou bola de fundo.
  const preBounce = ball.bounces.length === 0;
  const nearNet = Math.abs(p.y) < 5.5;
  let situation = 'fundo';
  if (ball.lastHit && ball.lastHit.isServe) situation = 'devolucao';
  else if (preBounce && ball.z > 1.55) situation = 'smash';
  else if (preBounce && nearNet) situation = 'voleio';
  else if (!preBounce && ball.z < 0.15 && ball.sinceBounce < 0.07) situation = 'meio-voleio';

  const depth = (aim.fwd + 1) / 2;
  let targetY = opp * lerp(4.5, 10.9, depth);
  // Top spin: mais fundo (perto da linha de fundo) e com quique mais alto.
  if (isTopspin) targetY = opp * lerp(6.8, 11.4, depth);
  if (isSlice) targetY *= 0.92; // slice cai um pouco mais curta
  if (isLob) targetY = opp * 10.6;
  if (situation === 'voleio') targetY *= 0.8; // voleio é curto e firme
  else if (situation === 'meio-voleio') targetY *= 1.05; // meio-voleio levanta a bola

  let targetX = aim.x !== 0 ? aim.x * (world.doubles ? 4.2 : 3.5) : clamp(p.x * 0.7, -3.4, 3.4);

  let turbo = false;
  if (!isLob && !isSlice && charge >= TURBO.THRESHOLD && p.turbo >= TURBO.COST) {
    turbo = true;
    p.turbo -= TURBO.COST;
    targetY *= TURBO.DEEP_BONUS;
    bump(world, 'turboShots');
  }

  // Erro: humano depende da carga; IA depende da habilidade. Rallies longos
  // acumulam "pressão" e aumentam o erro (pontos precisam terminar).
  world.rallyShots += 1;
  const pressure = p.human ? Math.min(0.2, world.rallyShots * 0.008) : Math.min(0.3, world.rallyShots * 0.018);
  let errMag = (p.human ? charge * 0.3 : (1 - p.ai.skill) * 0.4) + pressure;
  // O top spin arrisca mais (alvo fundo, quique alto): erro maior.
  if (isTopspin) errMag = errMag * 1.3 + 0.1;
  else if (isSlice || isLob) errMag *= 0.85;
  // Forehand é mais preciso; backhand é mais instável.
  if (hand === 'forehand') errMag *= 0.85;
  else if (hand === 'backhand') errMag *= 1.3;
  // Voleio e smash são firmes; meio-voleio é defensivo.
  if (situation === 'voleio') errMag *= 0.85;
  else if (situation === 'smash') errMag *= 0.9;
  else if (situation === 'meio-voleio') errMag *= 0.95;
  // Técnica: menos erro de execução (multiplicador abaixo de 1).
  errMag *= techniqueErrorMul(p.stats);
  if (!p.human) {
    // Erro não forçado ocasional (a bola sai ou fica curta): pontos terminam.
    const shankChance =
      0.03 + (1 - p.ai.skill) * 0.04 + Math.min(0.04, world.rallyShots * 0.004);
    if (world.rng() < shankChance) errMag += 0.75 + world.rng() * 1.1;
  }
  // 1) Alvo base dentro da quadra, com margem das linhas.
  const aimMaxX = (world.doubles ? COURT.DOUBLES_HALF_WIDTH : COURT.SINGLES_HALF_WIDTH) - 0.5;
  targetX = clamp(targetX, -aimMaxX, aimMaxX);
  const aimMaxY = COURT.HALF_LENGTH - 0.5;
  targetY = opp > 0 ? clamp(targetY, 0.5, aimMaxY) : clamp(targetY, -aimMaxY, -0.5);

  // 2) Erro de execução: pode tirar a bola (faltas/bolas fora acontecem).
  const ang = world.rng() * Math.PI * 2;
  targetX += Math.cos(ang) * Math.max(0, errMag);
  targetY += Math.sin(ang) * Math.max(0, errMag);

  // 3) Limite generoso, só para não mirar em lugares absurdos.
  const maxX = COURT.DOUBLES_HALF_WIDTH + 0.8;
  targetX = clamp(targetX, -maxX, maxX);
  targetY =
    opp > 0
      ? clamp(targetY, 0.5, COURT.HALF_LENGTH + 1.2)
      : clamp(targetY, -(COURT.HALF_LENGTH + 1.2), -0.5);

  const from = { x: ball.x, y: ball.y, z: Math.max(0.05, ball.z) };
  const to = { x: targetX, y: targetY, z: 0.04 };
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const baseSpeed = (turbo ? lerp(12, 22, charge) : lerp(9.5, 18, charge)) * powerMul(p.stats);
  let speedMul = hand === 'forehand' ? 1.04 : hand === 'backhand' ? 0.95 : 1;
  if (isSlice) speedMul *= 0.78; // slice é mais lenta
  const avgSpeed = baseSpeed * speedMul;
  let flight = clamp(dist / avgSpeed, 0.45, 1.2);
  if (isLob) flight *= 1.5;
  if (situation === 'voleio') flight *= 0.85;
  else if (situation === 'smash') flight *= 0.72;
  else if (situation === 'meio-voleio') flight *= 1.3;
  // Risco ocasional de bola na rede (golpe fraco/erro de timing).
  const netRisk =
    (p.human ? (1 - Math.min(1, charge / 0.5)) * 0.15 : (1 - p.ai.skill) * 0.07) *
    techniqueErrorMul(p.stats);
  const margin = world.rng() < netRisk ? -0.04 : isLob ? 0.5 : isSlice ? 0.06 : 0.1;
  flight = clearanceTime(from, to, flight, margin);

  // Slice tem efeito lateral: compensa o alvo (com o voo final) para a bola
  // cair no lugar certo mesmo curvando.
  const curve = isSlice ? CURVE.SLICE_SHOT : 0;
  if (curve) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const drift = 0.5 * curve * flight * flight;
    to.x -= (-dy / len) * drift;
    to.y -= (dx / len) * drift;
  }
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
    spin: shot,
    // Top spin quica mais alto; slice fica baixo.
    bounceScale: situation === 'smash' ? 1.15 : isTopspin ? 1.3 : isSlice ? 0.5 : isLob ? 0.95 : 1,
    curve,
    lastHit: { team: p.team, player: p.id, isServe: false, turbo, shot, hand, situation },
  });
  bump(world, 'hits');
  bumpGroup(world, 'shots', shot);
  bumpGroup(world, 'hands', hand);
  bumpGroup(world, 'situations', situation);
  world.events.push({ type: 'hit', player: p.id, turbo, shot, hand, situation });
}

// Tipo de batida a partir do input (função pura).
export function classifyShot(input) {
  const shot = input?.shot ?? 'flat';
  return ['flat', 'topspin', 'slice', 'lob'].includes(shot) ? shot : 'flat';
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

// Alvo do saque (sem erro): usado pelo próprio saque e pela mira na tela.
// Mais controle de direção: a mira lateral cobre a caixa inteira e a
// profundidade vai de curta (perto da rede) a funda (perto da linha de saque).
export function serveAimTarget(world, p, type = 'flat') {
  const s = world.serve;
  const sideSign = world.score.serveSideSign(p.team);
  const tSign = -sideSign;
  const recvSide = -sideOf(p.team);
  const aim = aimWorld(p);
  const fwd01 = (aim.fwd + 1) / 2;
  const isTopspin = type === 'topspin';
  const isSlice = type === 'slice';
  const isLob = type === 'lob';

  const aimX = s.attempt === 2 ? aim.x * 0.6 : aim.x;
  let tx = tSign * 2.6 + aimX * 2.2;
  let ty = recvSide * lerp(6.0, 1.8, fwd01);
  if (isTopspin) ty = recvSide * lerp(6.2, 3.0, fwd01); // kick: mais fundo
  if (isSlice) {
    ty = recvSide * lerp(5.6, 1.8, fwd01); // slice: mais curto...
    tx += tSign * 0.8; // ...e mais aberto
  }
  if (isLob) ty = recvSide * lerp(6.0, 3.0, fwd01);
  tx = clamp(tx, tSign > 0 ? 0.15 : -4.0, tSign > 0 ? 4.0 : -0.15);
  ty = clamp(ty, recvSide > 0 ? 0.3 : -6.1, recvSide > 0 ? 6.1 : -0.3);
  return { x: tx, y: ty };
}

export function executeServe(world, p, charge, shot = 'flat') {
  const s = world.serve;
  if (s.serverId !== p.id || s.inFlight) return false;
  const tSign = -world.score.serveSideSign(p.team);
  const recvSide = -sideOf(p.team);

  // Tipo de saque (mesmas teclas das batidas): flat, top spin (kick), slice
  // (baixo e aberto) e lob (alto e seguro).
  const type = ['flat', 'topspin', 'slice', 'lob'].includes(shot) ? shot : 'flat';
  const isTopspin = type === 'topspin';
  const isSlice = type === 'slice';
  const isLob = type === 'lob';

  const aim = serveAimTarget(world, p, type);
  let tx = aim.x;
  let ty = aim.y;

  const errBase = p.human
    ? (1 - Math.min(1, charge / 0.6)) * 1.6
    : (1 - p.ai.skill) * (s.attempt === 1 ? 2.0 : 0.8);
  const errPower = p.human && charge > 0.9 ? (charge - 0.9) * 2.5 : 0;
  // Precisão do saque: stat de saque manda, técnica ajuda na metade.
  const serveAcc = serveRiskMul(p.stats) * (0.5 + 0.5 * techniqueErrorMul(p.stats));
  let errMag = (errBase + errPower) * serveAcc;
  // O saque kick arrisca mais; slice e lob são mais seguros.
  if (isTopspin) errMag = errMag * 1.35 + 0.15;
  else if (isSlice || isLob) errMag *= 0.75;
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
  const speedMul = isSlice ? 0.78 : isTopspin ? 0.92 : isLob ? 0.6 : 1;
  // Voo base (flat) com a folga de rede do tipo; depois o tipo ajusta a
  // velocidade: slice e lob saem visivelmente mais lentos, o flat mais forte.
  let flight = clamp(dist / (lerp(14, 24, charge) * serveSpeedMul(p.stats)), 0.45, 1.5);
  let clearance = isLob ? 1.6 : isTopspin ? 0.45 : isSlice ? 0.06 : 0.12;
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
    bounceScale: isTopspin ? 1.35 : isSlice ? 0.5 : 1,
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
  world.phase = 'serve';
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

  const bounceSide = teamOfSide(ev.y);
  if (bounceSide === last.team) {
    awardPoint(world, otherTeam(last.team), ball.touchedNet ? 'NA REDE' : 'FORA DA ÁREA');
    return;
  }

  // Quiques no lado de quem recebeu (inclui o atual, que a física já registrou).
  // O ponto só termina no SEGUNDO quique: um quique fora não encerra a jogada,
  // então dá para buscar a bola perto da linha de fundo (sem parede invisível).
  const receiverBounces = ball.bounces.filter((b) => teamOfSide(b.y) !== last.team);
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
    awardPoint(world, otherTeam(last.team), 'FORA');
    return;
  }
  const ace = last.isServe && !world.serve.returned;
  if (ace) {
    awardPoint(world, last.team, 'ACE');
    return;
  }
  awardPoint(world, last.team, secondInCourt ? 'A BOLA QUICOU DUAS VEZES' : 'PONTO');
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
      bump(world, 'lets');
      setMessage(world, t('msg.let'), 1.5);
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
  bump(world, 'faults');
  if (s.attempt === 1) {
    s.attempt = 2;
    setMessage(world, t('msg.fault'), 1.4);
    replayServe(world);
  } else {
    bump(world, 'doubleFaults');
    awardPoint(world, otherTeam(s.serverTeam), 'DUPLA FALTA');
  }
}

function replayServe(world) {
  const s = world.serve;
  s.inFlight = false;
  s.box = null;
  s.toss = null;
  s.returnPending = false;
  world.phase = 'serve';
  const server = world.byId[s.serverId];
  // O sacador volta para a posição de saque: se ele estava se movendo quando o
  // saque foi dado, o 2º saque (ou o let) não pode sair de onde ele parou.
  const spot = serveSpot(world, server);
  server.x = spot.x;
  server.y = spot.y;
  server.vx = 0;
  server.vy = 0;
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
  const bounces = ball.bounces.filter((b) => teamOfSide(b.y) !== last.team);
  resolveRallyEnd(world, bounces, false);
}

// ---------------------------------------------------------------------------
// Ponto
// ---------------------------------------------------------------------------
export function awardPoint(world, team, reason) {
  if (world.phase !== 'serve' && world.phase !== 'rally') return;
  const last = world.ball.lastHit;
  if (last && last.isServe && last.team === team && !world.serve.returned) {
    bump(world, 'aces');
  }
  const evs = world.score.awardPoint(team);
  bump(world, 'points');
  const reasonKey = REASON_KEYS[reason] ?? 'point';
  bumpGroup(world, 'reasons', reasonKey);
  if (reasonKey === 'point' || reasonKey === 'doubleBounce') bump(world, 'winners');
  else if (reasonKey === 'out' || reasonKey === 'outOfArea') bump(world, 'errorsOut');
  else if (reasonKey === 'net') bump(world, 'errorsNet');
  else if (reasonKey === 'partner' || reasonKey === 'player') bump(world, 'touches');
  world.lastPoint = { team, reason };
  for (const p of world.players) {
    if (p.team === team) p.turbo = Math.min(TURBO.MAX, p.turbo + TURBO.POINT_GAIN);
  }
  const gameWon = evs.some((e) => e.type === 'game');
  const setWon = evs.some((e) => e.type === 'set');
  const matchWon = evs.some((e) => e.type === 'match');
  if (setWon) {
    // Fim de set: guarda o retrato do set para a tela de estatísticas e começa
    // um set novo em branco (o total da partida continua em `stats`).
    world.setSummary = snapshotStats(world.setStats);
    world.setHistory.push(world.setSummary);
    world.setStats = makeStats();
  }
  let msg;
  const label = teamLabel(team);
  if (matchWon) msg = t('msg.matchWon', { team: label });
  else if (setWon) msg = t('msg.setWon', { team: label });
  else if (gameWon) msg = t('msg.gameWon', { team: label });
  else if (reason === 'DUPLA FALTA') msg = t('msg.doubleFault', { team: label });
  else msg = t('msg.point', { reason: reasonLabel(reason), team: label });
  setMessage(world, msg, gameWon || setWon ? MATCH.SET_PAUSE : MATCH.POINT_PAUSE);
  world.phase = 'pointover';
  world.phaseTimer = gameWon || setWon ? MATCH.SET_PAUSE : MATCH.POINT_PAUSE;
  world.serve.inFlight = false;
  world.serve.returnPending = false;
  world.events.push({ type: 'point', team, reason, gameWon, setWon, matchWon });
}
