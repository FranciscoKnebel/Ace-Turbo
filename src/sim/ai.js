import { PLAYER } from './constants.js';
import { clamp, pointInBox } from './math.js';
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
    goingOut: false,
    holding: false,
    holdT: 0,
    holdTarget: 0.6,
    holdReleaseT: null,
    pendingShot: null,
    shotType: 'flat',
    aimDepth: 0,
    aimX: 1,
    serveId: -1,
    lastServeId: -1,
    serveWait: 0,
    serveCharge: 0.7,
    serveAimX: 1,
    serveDepth: -1,
    serveShot: 'flat',
    serveShotAttempt: 0,
  };
}

// Estado inicial de input; sempre reutilizado para não alocar por frame.
export function blankInput() {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    swing: false,
    shot: 'flat',
    topspin: false,
    slice: false,
    lob: false,
    sprint: false,
    // Mira explícita (usada pela IA para mirar sem se mover).
    aim: null,
  };
}

function setInput(player, input) {
  if (!player.input) player.input = blankInput();
  Object.assign(player.input, input);
}

function inputToward(player, dx, dy) {
  // Direções do mundo: +x = direita na tela, +y = para o fundo (lado B).
  const len = Math.hypot(dx, dy);
  const input = { up: false, down: false, left: false, right: false };
  if (len < 0.08) return input;
  const ux = dx / len;
  const uy = dy / len;
  if (ux > 0.25) input.right = true;
  else if (ux < -0.25) input.left = true;
  if (uy > 0.25) input.up = true;
  else if (uy < -0.25) input.down = true;
  return input;
}

function aimKeys(player, aimX, fwd) {
  // aimX em coordenadas do mundo (+ = direita); fwd = +1 em direção à rede.
  const input = { left: false, right: false, up: false, down: false };
  if (aimX > 0) input.right = true;
  else if (aimX < 0) input.left = true;
  const vertical = player.team === 'a' ? fwd : -fwd;
  if (vertical > 0) input.up = true;
  else if (vertical < 0) input.down = true;
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

  // Cada novo saque reinicia as decisões (evita carregar golpe de um ponto
  // para o outro e voltar saques que vão sair).
  if (ai.lastServeId !== world.serve.id) {
    ai.lastServeId = world.serve.id;
    ai.holding = false;
    ai.holdT = 0;
    ai.holdReleaseT = null;
    ai.pendingShot = null;
    ai.intercept = null;
    ai.goingOut = false;
    ai.lastHitKey = null;
    ai.reactTimer = 0;
    ai.decideTimer = 0;
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
      ai.serveAimX = world.rng() < 0.5 ? -0.6 : 0.6; // mira conservadora
      ai.serveDepth = world.rng() < 0.6 ? -0.7 : 0.3; // deep preferido
      ai.holding = false;
      ai.serveShotAttempt = 0;
    }
    // Escolhe o tipo de saque (muda quando vira 2º saque: mais seguro).
    if (ai.serveShotAttempt !== world.serve.attempt) {
      ai.serveShotAttempt = world.serve.attempt;
      const r = world.rng();
      if (world.serve.attempt === 2) {
        ai.serveShot = r < 0.4 ? 'slice' : r < 0.7 ? 'lob' : 'topspin';
      } else {
        ai.serveShot = r < 0.45 ? 'flat' : r < 0.8 ? 'topspin' : 'slice';
      }
    }
    ai.serveWait -= dt;
    if (ai.serveWait <= 0) {
      // Mira fina via input.aim (o sacador não se move durante o saque).
      const aim = { x: ai.serveAimX, depth: ai.serveDepth };
      if (player.charge >= ai.serveCharge) {
        // Solta: o world lança a bola e bate (saque).
        base.aim = aim;
        base.swing = false;
        base.shot = ai.serveShot;
        setInput(player, base);
        return;
      }
      base.aim = aim;
      base.swing = true;
      base.shot = ai.serveShot;
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

  const myTurn = !ball.lastHit || ball.lastHit.team !== player.team;

  const hitKey = `${ball.lastHit ? ball.lastHit.player : 'nenhum'}:${ball.bounces.length}`;
  if (hitKey !== ai.lastHitKey) {
    ai.lastHitKey = hitKey;
    ai.reactTimer = ai.reaction * (0.7 + world.rng() * 0.6);
    ai.decideTimer = 0;
    ai.pendingShot = null;
    // Julgar imediatamente se a bola vai sair (não é questão de reação):
    // evita volear um saque/golpe que cairia fora. Se a bola é do próprio
    // time (minha vez ainda não chegou), não persegue: volta para a posição.
    if (myTurn) {
      const plan = planIntercept(world, player, ball);
      ai.goingOut = plan.goingOut;
      ai.intercept = plan.goingOut ? null : plan.intercept;
    } else {
      ai.goingOut = false;
      ai.intercept = null;
    }
  }
  if (ai.reactTimer > 0) ai.reactTimer -= dt;

  // Recalcula alvo de interceptação periodicamente.
  ai.decideTimer -= dt;
  if (ai.decideTimer <= 0 && ai.reactTimer <= 0) {
    ai.decideTimer = 0.06 + world.rng() * 0.06;
    if (myTurn) {
      const plan = planIntercept(world, player, ball);
      ai.goingOut = plan.goingOut;
      ai.intercept = plan.goingOut ? null : plan.intercept;
    } else {
      ai.goingOut = false;
      ai.intercept = null;
    }
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
    !ai.goingOut &&
    ball.z <= PLAYER.REACH_HEIGHT - 0.05;

  // Escolhe o tipo de batida assim que a bola começa a chegar (uma vez por
  // golpe), para dar tempo de carregar a força certa para slice/lob.
  if (!ai.holding && !ai.pendingShot && canHit && closing > 0 && timeToReach <= 1.3) {
    ai.pendingShot = chooseShot(world, player, ball);
  }

  // Não pode começar a carregar enquanto um golpe anterior ainda está ativo
  // (nem durante o cooldown): senão o AI "segura" e o golpe nunca sai.
  const swingBusy = !!player.swing || player.swingCooldown > 0;
  if (
    !ai.holding &&
    !swingBusy &&
    canHit &&
    ((closing > 0 && timeToReach <= (ai.pendingShot?.hold ?? ai.holdTarget) + 0.14) ||
      (d < 0.9 && ball.onGround))
  ) {
    ai.holding = true;
    ai.holdT = 0;
    const choice = ai.pendingShot ?? chooseShot(world, player, ball);
    ai.pendingShot = null;
    ai.shotType = choice.type;
    ai.aimDepth = choice.depth;
    ai.holdTarget = choice.hold;
    ai.aimX = chooseAimX(world, player);
  }

  const input = { ...base };
  if (ai.holdReleaseT !== null) {
    // Janela do golpe: mantém a mira (sem mover) e continua se posicionando.
    ai.holdReleaseT += dt;
    if (ai.holdReleaseT < PLAYER.SWING_WINDUP + PLAYER.SWING_ACTIVE + 0.02) {
      input.aim = { x: ai.aimX, depth: ai.aimDepth };
      if (ai.intercept) {
        Object.assign(
          input,
          inputToward(player, ai.intercept.x - player.x, ai.intercept.y - player.y),
        );
      }
      setInput(player, input);
      return;
    }
    ai.holdReleaseT = null;
  }
  if (ai.holding && swingBusy) {
    ai.holding = false; // espera o golpe em andamento terminar
  }
  if (ai.holding) {
    ai.holdT += dt;
    const inReach = canHit && d <= PLAYER.REACH * 0.95 && (closing > 0 || ball.onGround || d < 0.8);
    const aboutToArrive = canHit && timeToReach <= PLAYER.SWING_WINDUP + 0.03;
    input.shot = ai.shotType;
    if (inReach || aboutToArrive) {
      input.swing = false; // solta: vira golpe
      ai.holding = false;
      ai.holdReleaseT = 0;
    } else if (ai.holdT > ai.holdTarget + 0.35) {
      ai.holding = false; // desistiu (não vai chegar)
    } else {
      input.swing = true;
      // Mira explícita: carrega sem andar para a rede; o movimento serve para
      // se posicionar (interceptação ou posição de espera).
      input.aim = { x: ai.aimX, depth: ai.aimDepth };
      if (d > 1.2 && ai.intercept) {
        Object.assign(
          input,
          inputToward(player, ai.intercept.x - player.x, ai.intercept.y - player.y),
        );
      } else if (!ai.intercept) {
        const home = homeSpot(world, player, ball);
        Object.assign(input, inputToward(player, home.x - player.x, home.y - player.y));
      }
    }
  } else if (ai.intercept) {
    const dx = ai.intercept.x - player.x;
    const dy = ai.intercept.y - player.y;
    // A IA também usa o vigor: corre quando precisa cobrir distância.
    input.sprint = Math.hypot(dx, dy) > 2.5 && player.stamina > 25;
    Object.assign(input, inputToward(player, dx, dy));
  } else {
    // Posição de espera: se a bola vai sair, sai da frente dela.
    const home = ai.goingOut && myTurn ? dodgeSpot(player, ball) : homeSpot(world, player, ball);
    Object.assign(input, inputToward(player, home.x - player.x, home.y - player.y));
  }
  setInput(player, input);
}

// Primeiro ponto da trajetória (no lado do jogador) em que a bola está
// alcançável. Cobre voleio e devolução depois do quique. Devolve
// { intercept, goingOut }: goingOut indica que a bola vai quicar fora e o
// melhor é deixar passar para ganhar o ponto.
export function planIntercept(world, player, ball) {
  const pred = predictTrajectory(ball, {
    maxT: 4.5,
    step: 0.02,
    doubles: world.doubles,
  });
  let goingOut = false;
  if (ball.bounces.length === 0) {
    const first = pred.bounces.find((b) => teamOfSide(b.y) === player.team);
    if (first) {
      const isServe = ball.lastHit && ball.lastHit.isServe;
      // No saque, "fora" é fora da caixa de serviço; no rally, fora da quadra.
      const valid = isServe ? pointInBox(first.x, first.y, world.serve.box) : first.inCourt;
      if (!valid) goingOut = true;
    }
  }
  if (goingOut) return { intercept: null, goingOut: true };
  const side = sideOf(player.team);
  // Prefere bater depois do quique (golpe de fundo) em vez de correr à rede
  // para volear: isso evita avanços excessivos e erros não forçados.
  const alreadyBounced = ball.bounces.length > 0;
  const bounce = pred.bounces.find((b) => teamOfSide(b.y) === player.team);
  const minT = alreadyBounced ? 0 : bounce ? bounce.t : 0;
  const pick = (minZ, maxZ) => {
    for (const s of pred.samples) {
      if (teamOfSide(s.y) !== player.team) continue;
      if (s.t < minT) continue;
      if (s.z >= minZ && s.z <= maxZ) {
        // Fica um pouco atrás do quique: a bola vem ao encontro do golpe e não
        // bate no corpo do jogador.
        return { x: s.x, y: s.y + side * 1.2, t: s.t };
      }
    }
    return null;
  };
  // Prefere bater na altura confortável (0,55 a 1,1 m); se não der, aceita
  // bola baixa (meio-voleio) ou alta (voleio/smash).
  // Golpe rasteiro perto do quique (chega a tempo); se não der, aceita uma bola
  // mais alta. O gatilho do meio-voleio é estrito, então isso não vira
  // "meio-voleio" no placar.
  const base = pick(0, 0.9) ?? pick(0, PLAYER.REACH_HEIGHT - 0.1);
  if (!base) return { intercept: null, goingOut: false };
  // Em duplas, só o parceiro mais perto persegue a bola (o outro cobre a
  // outra metade), evitando os dois irem juntos e ficarem colados.
  if (world.doubles) {
    const mates = world.players.filter((q) => q.team === player.team && q.id !== player.id && q.ai);
    const mine = Math.hypot(base.x - player.x, base.y - player.y);
    for (const mate of mates) {
      const theirs = Math.hypot(base.x - mate.x, base.y - mate.y);
      if (theirs < mine - 0.05 || (Math.abs(theirs - mine) <= 0.05 && mate.id < player.id)) {
        return { intercept: null, goingOut: false };
      }
    }
  }
  return { intercept: base, goingOut: false };
}

// Escolha do tipo de batida da CPU: top spin agressivo na maioria das vezes,
// flat como opção segura, slice e lob como variação; smash na bola alta.
function chooseShot(world, player, ball) {
  const smash = ball.z > 1.3 && Math.abs(player.y) < 5;
  if (smash) return { type: 'flat', depth: 1, hold: 0.32 };
  const r = world.rng();
  if (r < 0.08) return { type: 'lob', depth: 1, hold: 0.3 + world.rng() * 0.2 };
  if (r < 0.2) return { type: 'slice', depth: 0, hold: 0.55 + world.rng() * 0.25 };
  if (r < 0.45) {
    return {
      type: 'flat',
      depth: 1,
      hold: clamp(0.45 + player.ai.skill * 0.4 + world.rng() * 0.2, 0.3, 0.95),
    };
  }
  return {
    type: 'topspin',
    depth: 1,
    hold: clamp(0.55 + player.ai.skill * 0.4 + world.rng() * 0.2, 0.4, 1.05),
  };
}

// Mira: prefere o lado oposto ao adversário, mas nem sempre na linha: parte
// das bolas vai pelo centro para não estourar a lateral com o erro somado.
function chooseAimX(world, player) {
  const oppTeam = otherTeam(player.team);
  const opponents = world.players.filter((p) => p.team === oppTeam);
  if (!opponents.length) return world.rng() < 0.5 ? -1 : 1;
  if (world.rng() < 0.35) return 0; // joga pelo centro
  const avg = opponents.reduce((s, p) => s + p.x, 0) / opponents.length;
  const open = avg <= 0 ? 1 : -1; // lado aberto em coordenadas do mundo
  return open;
}

// Posição para sair da frente de uma bola que não vai ser jogada (vai sair).
function dodgeSpot(player, ball) {
  const side = sideOf(player.team);
  const dx = player.x - ball.x;
  const dir = Math.abs(dx) > 0.1 ? Math.sign(dx) : player.prefSide || 1;
  return { x: clamp(ball.x + dir * 2.2, -4.8, 4.8), y: side * 8.5 };
}

function homeSpot(world, player, ball) {
  const side = sideOf(player.team);
  const nearSide = ball.x >= 0 ? 1 : -1;
  if (!world.doubles) {
    return { x: clamp(ball.x * 0.6, -3.2, 3.2), y: side * 9.2 };
  }
  // Duplas: cada um cobre a sua metade; quem está do lado da bola sobe um
  // pouco para fechar o ângulo, o parceiro cobre o outro lado mais recuado.
  if (player.prefSide === nearSide) {
    return { x: clamp(ball.x * 0.5 + player.prefSide * 1.6, -3.6, 3.6), y: side * 8.2 };
  }
  return { x: player.prefSide * 2.8, y: side * 9.8 };
}
