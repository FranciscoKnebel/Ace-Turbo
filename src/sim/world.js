import { transitionPhase, makeServeState } from './systems/phases.js';
import { resetForServe, advanceServeToss } from './serve.js';
export { resetForServe, serveSpot, startServeToss, executeServe, registerFault } from './serve.js';
import { checkBallStopped, checkPlayerBallCollision, processBounce, handleFence } from './rules.js';
export { checkPlayerBallCollision, processBounce } from './rules.js';
import { release, tryHit } from './shots.js';
export { tryHit } from './shots.js';
export { normalizeServeType, serveAimTarget } from './serve-target.js';
export { pickServer, changeEnds } from './service.js';
import { makePlayer, resolveWeather } from './systems/creation.js';
import { makeStats } from './systems/telemetry.js';
export { makeStats } from './systems/telemetry.js';
import { setMessage } from './systems/messages.js';
export { setMessage } from './systems/messages.js';
export { applySetFatigue } from './systems/energy.js';
import { resolvePlayerCollisions } from './systems/movement.js';
export { resolvePlayerCollisions } from './systems/movement.js';
export { aimWorld, classifyShot, tossQuality } from './systems/shot-model.js';
export { executeRallyShot } from './systems/rally.js';
import { advancePlayer } from './systems/players.js';
export { awardPoint } from './systems/points.js';
import { blankInput, message } from './contracts.js';
import { MODES, normalizeMatchOptions } from './config.js';
export { MODES } from './config.js';
import { DIFFICULTY, SURFACES, WEATHERS } from './constants.js';
import { stepAI } from './ai.js';
export { otherTeam, sideOf, teamOfSide } from './court-sides.js';
export { pointInBox } from './math.js';
import { makeBall, stepBall } from './physics.js';
import { mulberry32 } from './rng.js';
import { MatchScore } from './score.js';

/** @returns {import("./contracts.js").World} */
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
    serve: makeServeState(),
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
  advanceServeToss(world, dt);
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
