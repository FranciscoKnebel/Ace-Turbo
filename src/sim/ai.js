import { PLAYER } from './constants.js';
import { clamp } from './math.js';
import { predictTrajectory } from './physics.js';

export const sideOf = (team) => (team === 'a' ? -1 : 1);
export const otherTeam = (team) => (team === 'a' ? 'b' : 'a');
export const teamOfSide = (y) => (y < 0 ? 'a' : 'b');

export function createAI({ skill = 0.7, speedMult = 1, reaction = 0.16 } = {}) {
  return {
    skill,
    speedMult,
    reaction,
    reactTimer: 0,
    decideTimer: 0,
    lastHitKey: null,
    intercept: null,
    holding: false,
    holdT: 0,
    holdTarget: 0.6,
    serveId: -1,
    serveWait: 0,
    serveCharge: 0.7,
    serveAimX: 1,
    serveDepth: -1,
  };
}

// Estado inicial de input; sempre reutilizado para não alocar por frame.
export function blankInput() {
  return { up: false, down: false, left: false, right: false, swing: false };
}

function setInput(player, input) {
  if (!player.input) player.input = blankInput();
  Object.assign(player.input, input);
}

function inputToward(player, dx, dy) {
  const mirror = -sideOf(player.team);
  const len = Math.hypot(dx, dy);
  const input = { up: false, down: false, left: false, right: false };
  if (len < 0.08) return input;
  const ux = dx / len;
  const uy = dy / len;
  if (ux * mirror > 0.25) input.right = true;
  else if (ux * mirror < -0.25) input.left = true;
  if (uy * mirror > 0.25) input.up = true;
  else if (uy * mirror < -0.25) input.down = true;
  return input;
}

function aimKeys(player, aimX, fwd) {
  // aimX/fwd no referencial do jogador (fwd = +1 em direção à rede).
  const input = { left: false, right: false, up: false, down: false };
  if (aimX > 0) input.right = true;
  else if (aimX < 0) input.left = true;
  if (fwd > 0) input.up = true;
  else if (fwd < 0) input.down = true;
  return input;
}

export function stepAI(world, player, dt) {
  const ai = player.ai;
  const ball = world.ball;
  const side = sideOf(player.team);
  const base = blankInput();

  if (world.phase === 'pointover' || world.phase === 'matchover') {
    ai.holding = false;
    setInput(player, base);
    return;
  }

  // --- Saque -------------------------------------------------------------
  if (
    world.phase === 'serve' &&
    world.serve.serverId === player.id &&
    !world.serve.inFlight
  ) {
    if (ai.serveId !== world.serve.id) {
      ai.serveId = world.serve.id;
      ai.serveWait = (0.5 + world.rng() * 1.1) / (0.4 + ai.skill);
      ai.serveCharge = clamp(0.5 + ai.skill * 0.3 + world.rng() * 0.18, 0.35, 0.97);
      ai.serveAimX = world.rng() < 0.5 ? -1 : 1;
      ai.serveDepth = world.rng() < 0.6 ? -1 : 1; // deep preferido
      ai.holding = false;
    }
    ai.serveWait -= dt;
    if (ai.serveWait <= 0) {
      const aim = aimKeys(player, ai.serveAimX, ai.serveDepth);
      if (player.charge >= ai.serveCharge) {
        // Solta: o world executa o saque.
        Object.assign(base, aim);
        base.swing = false;
        setInput(player, base);
        return;
      }
      Object.assign(base, aim);
      base.swing = true;
      setInput(player, base);
      return;
    }
    setInput(player, base);
    return;
  }

  // --- Bola em jogo (rally / saque em voo) --------------------------------
  if (ball.heldBy || ball.dead) {
    setInput(player, base);
    return;
  }

  const hitKey = `${ball.lastHit ? ball.lastHit.player : 'nenhum'}:${ball.bounces.length}`;
  if (hitKey !== ai.lastHitKey) {
    ai.lastHitKey = hitKey;
    ai.reactTimer = ai.reaction * (0.7 + world.rng() * 0.6);
    ai.decideTimer = 0;
  }
  if (ai.reactTimer > 0) ai.reactTimer -= dt;

  const myTurn = !ball.lastHit || ball.lastHit.team !== player.team;

  // Recalcula alvo de interceptação periodicamente.
  ai.decideTimer -= dt;
  if (ai.decideTimer <= 0 && ai.reactTimer <= 0) {
    ai.decideTimer = 0.06 + world.rng() * 0.06;
    ai.intercept = pickIntercept(world, player, ball);
  }

  // Golpe: começa a carregar ANTES da bola chegar e solta no momento do impacto.
  const dx = ball.x - player.x;
  const dy = ball.y - player.y;
  const d = Math.hypot(dx, dy);
  // Velocidade de aproximação: positiva quando a distância está diminuindo.
  const closing = -(ball.vx * dx + ball.vy * dy) / Math.max(0.2, d);
  const timeToReach = closing > 0.01 ? d / closing : Infinity;
  const ballOnMySide = teamOfSide(ball.y) === player.team;
  const canHit =
    ballOnMySide &&
    myTurn &&
    !ball.heldBy &&
    ball.z <= PLAYER.REACH_HEIGHT - 0.05;

  if (
    !ai.holding &&
    canHit &&
    ((closing > 0 && timeToReach <= ai.holdTarget + 0.14) || (d < 0.9 && ball.onGround))
  ) {
    ai.holding = true;
    ai.holdT = 0;
    ai.holdTarget =
      ball.z > 1.3 && Math.abs(player.y) < 5
        ? 0.32
        : clamp(0.42 + ai.skill * 0.28 + world.rng() * 0.12, 0.3, 0.95);
    ai.aimX = chooseAimX(world, player);
  }

  const input = { ...base };
  if (ai.holding) {
    ai.holdT += dt;
    const inReach = canHit && d <= PLAYER.REACH * 0.95 && (closing > 0 || ball.onGround || d < 0.3);
    const aboutToArrive = canHit && timeToReach <= PLAYER.SWING_WINDUP + 0.03;
    if (inReach || aboutToArrive) {
      input.swing = false; // solta: vira golpe
      ai.holding = false;
    } else if (ai.holdT > ai.holdTarget + 0.35) {
      ai.holding = false; // desistiu (não vai chegar)
    } else {
      input.swing = true;
      if (d > 1.2 && ai.intercept) {
        Object.assign(
          input,
          inputToward(player, ai.intercept.x - player.x, ai.intercept.y - player.y),
        );
      } else {
        const fwd = ball.z > 1.2 && d < 2.2 ? 0 : -1; // smash é mais plano
        Object.assign(input, aimKeys(player, ai.aimX, fwd));
      }
    }
  } else if (ai.intercept) {
    Object.assign(input, inputToward(player, ai.intercept.x - player.x, ai.intercept.y - player.y));
  } else {
    // Posição de espera, cobrindo a quadra com o parceiro.
    const home = homeSpot(world, player, ball);
    Object.assign(input, inputToward(player, home.x - player.x, home.y - player.y));
  }
  setInput(player, input);
}

// Primeiro ponto da trajetória (no lado do jogador) em que a bola está
// alcançável. Cobre voleio e devolução depois do quique.
function pickIntercept(world, player, ball) {
  const side = sideOf(player.team);
  const samples = predictTrajectory(ball, { maxT: 4.5, step: 0.02 });
  for (const s of samples) {
    if (teamOfSide(s.y) !== player.team) continue;
    if (s.z <= PLAYER.REACH_HEIGHT - 0.1 && s.z >= 0.0) {
      return { x: s.x, y: s.y + side * 0.15, t: s.t };
    }
  }
  return null;
}

// Mira: prefere o lado oposto ao adversário mais próximo da linha central.
function chooseAimX(world, player) {
  const oppTeam = otherTeam(player.team);
  const opponents = world.players.filter((p) => p.team === oppTeam);
  if (!opponents.length) return world.rng() < 0.5 ? -1 : 1;
  const avg = opponents.reduce((s, p) => s + p.x, 0) / opponents.length;
  const open = avg <= 0 ? 1 : -1; // lado aberto em coordenadas do mundo
  const wildcard = world.rng() < 0.15 ? -open : open;
  // Converte o lado do mundo para o referencial do jogador.
  return wildcard * -sideOf(player.team);
}

function homeSpot(world, player, ball) {
  const side = sideOf(player.team);
  const nearSide = ball.x >= 0 ? 1 : -1;
  if (!world.doubles || world.mode === 'singles' || world.mode === 'versus') {
    return { x: clamp(ball.x * 0.6, -3.2, 3.2), y: side * 9.2 };
  }
  // Parceiro cobre o lado oposto ao da bola.
  if (player.prefSide === nearSide || player.prefSide === 0) {
    return { x: clamp(ball.x * 0.7, -3.4, 3.4), y: side * 7.4 };
  }
  return { x: -nearSide * 2.6, y: side * 9.4 };
}
