import { blankInput } from '../contracts.js';
import { JUDGE, NET, PLAYER, STAMINA } from '../constants.js';
import { clamp } from '../math.js';
import { DEFAULT_TRAITS, staminaMaxOf, tirednessOf } from '../stats.js';
import { sideOf, teamOfSide } from '../court-sides.js';
import { isBallIncoming } from './incoming.js';
import { planIntercept } from './planner.js';
import { chooseShot } from './shots.js';
import { chooseAimX } from './aim.js';
import { dodgeSpot, homeSpot } from './position.js';
export function setInput(player, input) {
  if (!player.input) player.input = blankInput();
  Object.assign(player.input, input);
}

export function inputToward(player, dx, dy) {
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

export function stepAI(world, player, dt) {
  const ai = player.ai;
  const ball = world.ball;
  const side = sideOf(player.side ?? player.team);
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
    // O saque-e-voleio vale só para o saque decidido agora: sem isso o approach
    // fica alto entre pontos e todo saque seguinte vira saque-e-voleio.
    ai.approach = 0;
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
      // Carga do toss: habilidade leva para a zona ideal (0,6 a 0,9).
      ai.tossCharge = clamp(0.62 + ai.skill * 0.22 + (world.rng() - 0.5) * 0.3, 0.3, 0.99);
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
        // 2º saque é seguro: nada de power.
        ai.serveShot = r < 0.4 ? 'slice' : r < 0.7 ? 'flat' : 'topspin';
      } else {
        // 1º saque: mistura flat, kick, slice e arrisca um power.
        ai.serveShot = r < 0.3 ? 'flat' : r < 0.62 ? 'topspin' : r < 0.85 ? 'slice' : 'lob';
      }
    }
    ai.serveWait -= dt;
    if (ai.serveWait <= 0) {
      // Mira fina via input.aim (o sacador não se move durante o saque).
      const aim = { x: ai.serveAimX, depth: ai.serveDepth };
      const hold = () => {
        base.aim = aim;
        base.swing = true;
        base.shot = ai.serveShot;
        setInput(player, base);
      };
      const release = () => {
        base.aim = aim;
        base.swing = false;
        base.shot = ai.serveShot;
        setInput(player, base);
      };
      if (!world.serve.toss) {
        // Estágio 1: carrega o toss até a zona ideal e solta.
        if (player.charge >= ai.tossCharge) release();
        else hold();
        return;
      }
      // Estágio 2: espera a bola passar pelo alto e solta NA QUEDA, na altura
      // ideal (com erro de timing conforme a habilidade). Bater na subida é
      // punido, então a IA nunca solta enquanto a bola está subindo.
      const ball = world.ball;
      const ideal = (world.serve.toss.idealZ ?? 2.4) * (0.92 + (1 - ai.skill) * 0.16 * world.rng());
      const ready = ball.vz < 0 && ball.z <= ideal;
      if (ready) {
        release();
        // Saque-e-voleio: classes de rede sobem depois de sacar.
        const traits = player.traits ?? DEFAULT_TRAITS;
        if (traits.net >= NET.SERVE_VOLLEY_NET && world.rng() < NET.SERVE_VOLLEY_CHANCE) {
          ai.approach = 1;
        }
        return;
      }
      hold();
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

  // O avanço à rede vai decaindo: quem tem traço de rede sobe depois de um
  // golpe profundo e volta a recuar com o tempo (o lob do adversário é coberto
  // pela interceptação, que manda o jogador para trás).
  ai.approach = Math.max(0, (ai.approach ?? 0) - dt * NET.DECAY);

  const myTurn = !ball.lastHit || ball.lastHit.team !== player.team;

  const hitKey = `${ball.lastHit ? ball.lastHit.player : 'nenhum'}:${ball.bounces.length}`;
  if (hitKey !== ai.lastHitKey) {
    ai.lastHitKey = hitKey;
    ai.reactTimer = ai.reaction * (0.7 + world.rng() * 0.6);
    ai.decideTimer = 0;
    ai.pendingShot = null;
    // Julgamento da linha: sorteado uma vez por golpe recebido (insegurança).
    ai.outMargin = JUDGE.OUT_MARGIN * (1 + (world.rng() - 0.5) * JUDGE.OUT_JITTER);
    // Julgar imediatamente se a bola vai sair (não é questão de reação):
    // evita volear um saque/golpe que cairia fora. Se a bola é do próprio
    // time (minha vez ainda não chegou), não persegue: volta para a posição.
    if (myTurn) {
      const plan = planIntercept(world, player, ball);
      ai.goingOut = plan.goingOut;
      ai.doubtful = plan.doubtful;
      ai.intercept = plan.goingOut ? null : plan.intercept;
    } else {
      ai.goingOut = false;
      ai.doubtful = false;
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
      ai.doubtful = plan.doubtful;
      ai.intercept = plan.goingOut ? null : plan.intercept;
    } else {
      ai.goingOut = false;
      ai.doubtful = false;
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
  const ballOnMySide = teamOfSide(ball.y) === (player.side ?? player.team);
  // Só vale carregar se realmente dá para chegar na bola: evita gastar vigor
  // com bolas que não vão na direção do jogador (ou que são do parceiro).
  const reach = ai.intercept
    ? Math.hypot(ai.intercept.x - player.x, ai.intercept.y - player.y)
    : Infinity;
  const reachTime = Math.max(0.15, ai.intercept?.t ?? 0);
  // Folga generosa: o golpe acontece quando a bola entra no alcance da raquete,
  // então o jogador não precisa chegar exatamente no ponto de interceptação.
  // Bola rápida encolhe a folga (não dá para chegar "esticado" de graça), menos
  // na devolução de saque, que já vem rápida por natureza.
  const incomingSpeed = Math.hypot(ball.vx, ball.vy, ball.vz);
  const returningServe =
    world.serve.returnPending && world.serve.receiverId === player.id;
  // A folga generosa (1,5 m) entra ANTES do desconto por velocidade: bola lenta
  // mantém o buffer cheio e só a rápida encolhe (a devolução de saque fica
  // intacta).
  const speedFactor = clamp((incomingSpeed - 12) / 10, 0, 1);
  const baseAllowance = player.maxSpeed * 1.45 * reachTime + PLAYER.REACH + 1.5;
  const reachAllowance = returningServe
    ? baseAllowance
    : baseAllowance * (1 - 0.35 * speedFactor);
  const canReach = Boolean(ai.intercept) && reach <= reachAllowance;
  const canHit =
    ballOnMySide &&
    myTurn &&
    !ball.heldBy &&
    !ai.goingOut &&
    canReach &&
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
      // Golpe profundo com traço de rede: sobe para fechar o ponto. Cansada, a
      // IA fica conservadora e não arrisca a rede (o approach decai sozinho).
      const traits = player.traits ?? DEFAULT_TRAITS;
      if (
        ai.aimDepth === 1 &&
        (ai.shotType === 'flat' || ai.shotType === 'topspin') &&
        (ai.holdTarget ?? 0) >= 0.6 && // só sobe depois de um golpe sólido
        tirednessOf(player) < 0.4
      ) {
        ai.approach = Math.min(1, (ai.approach ?? 0) + 0.5 + traits.net * 0.5);
      }
    } else if (ai.holdT > ai.holdTarget + 0.35) {
      ai.holding = false; // desistiu (não vai chegar)
    } else {
      input.swing = true;
      // Mira explícita: carrega sem andar para a rede; o movimento serve para
      // se posicionar (interceptação ou posição de espera).
      input.aim = { x: ai.aimX, depth: ai.aimDepth };
      if (ai.intercept) {
        const ix = ai.intercept.x - player.x;
        const iy = ai.intercept.y - player.y;
        if (Math.hypot(ix, iy) > 0.25) {
          Object.assign(input, inputToward(player, ix, iy));
        }
      } else if (!ai.intercept) {
        const home = homeSpot(world, player, ball);
        Object.assign(input, inputToward(player, home.x - player.x, home.y - player.y));
      }
    }
  } else if (ai.intercept) {
    const dx = ai.intercept.x - player.x;
    const dy = ai.intercept.y - player.y;
    // A IA também usa o vigor: corre quando precisa cobrir distância. O
    // limiar usa a barra efetiva (fadiga e queima encolhem a barra).
    input.sprint =
      Math.hypot(dx, dy) > 2.5 && player.stamina > staminaMaxOf(player) * STAMINA.LOW;
    Object.assign(input, inputToward(player, dx, dy));
  } else {
    // Posição de espera: sai da frente da bola quando ela vai sair (goingOut)
    // ou quando vem em cima do jogador e ele não vai jogá-la (evita o toque no
    // corpo, que custa o ponto).
    const home =
      (ai.goingOut && myTurn) || isBallIncoming(player, ball)
        ? dodgeSpot(player, ball)
        : homeSpot(world, player, ball);
    Object.assign(input, inputToward(player, home.x - player.x, home.y - player.y));
  }
  setInput(player, input);
}

// A bola está vindo em cima do jogador (fechando a distância)? Usada para sair
// da frente de bolas que ele não vai jogar, evitando o toque no corpo.
