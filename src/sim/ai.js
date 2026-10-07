import { COURT, JUDGE, NET, PHYS, PLAYER, STAMINA } from './constants.js';
import { clamp } from './math.js';
import { predictTrajectory } from './physics.js';
import { DEFAULT_TRAITS, staminaMaxOf, tirednessOf } from './stats.js';

export const sideOf = (team) => (team === 'a' ? -1 : 1);
// Referencial da mão: lateral > 0 é forehand (a bola à direita do jogador).
export const handFrame = (team) => (team === 'a' ? 1 : -1);
// Deslocamento para o lado do forehand: a IA não fica na linha da bola, e sim
// um pouco ao lado, para bater de forehand em vez de "no corpo" (neutro).
const FOREHAND_OFFSET = 0.9;
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
    tossCharge: 0.75,
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
  const ballOnMySide = teamOfSide(ball.y) === player.team;
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
export function isBallIncoming(player, ball) {
  const bx = player.x - ball.x;
  const by = player.y - ball.y;
  const db = Math.hypot(bx, by);
  // Taxa de aproximação (positiva = chegando).
  const closing = (ball.vx * bx + ball.vy * by) / Math.max(0.2, db);
  return !ball.heldBy && db < 5 && closing > 2 && ball.z < 1.6;
}

// Primeiro ponto da trajetória (no lado do jogador) em que a bola está
// alcançável. Cobre voleio e devolução depois do quique. Devolve
// { intercept, goingOut }: goingOut indica que a bola vai quicar fora e o
// melhor é deixar passar para ganhar o ponto.
export function planIntercept(world, player, ball) {
  // Preparação do saque (bola na mão ou no toss): a bola ainda não está em
  // jogo, ninguém planeja interceptação.
  if (world.phase === 'serve' && !world.serve.inFlight) {
    return { intercept: null, goingOut: false, doubtful: false };
  }
  // Em duplas, só o recebedor designado pode devolver o saque: o parceiro não
  // corre atrás da bola (ele não pode rebater mesmo).
  if (
    world.serve.returnPending &&
    world.serve.receiverId &&
    player.id !== world.serve.receiverId &&
    player.team === world.serve.receiverTeam
  ) {
    return { intercept: null, goingOut: false, doubtful: false };
  }
  const pred = predictTrajectory(ball, {
    maxT: 4.5,
    step: 0.02,
    doubles: world.doubles,
  });
  let goingOut = false;
  let doubtful = false;
  if (ball.bounces.length === 0) {
    const first = pred.bounces.find((b) => teamOfSide(b.y) === player.team);
    if (first) {
      const isServe = ball.lastHit && ball.lastHit.isServe;
      // No saque, "fora" é fora da caixa de serviço; no rally, fora da quadra.
      // Perto da linha o jogador não arrisca deixar passar: só desiste quando a
      // bola está bem fora (com uma variação de julgamento).
      // A margem é sorteada uma vez por golpe recebido (cacheada no stepAI):
      // reamostrar a cada recálculo faria a IA alternar entre ir e deixar.
      const margin = player.ai?.outMargin ?? JUDGE.OUT_MARGIN;
      const outDist = isServe
        ? boxOutDistance(first.x, first.y, world.serve.box)
        : courtOutDistance(first.x, first.y, world.doubles);
      if (outDist > margin) goingOut = true;
      else if (outDist > 0) doubtful = true; // cairia fora, mas por pouco
    }
  }
  if (goingOut) return { intercept: null, goingOut: true, doubtful: false };
  const side = sideOf(player.team);
  // O recebedor designado tem a preferência e espera a bola na linha de fundo.
  const returningServe = world.serve.returnPending && world.serve.receiverId === player.id;
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
        // Fica um pouco atrás do quique. A escolha da mão:
        // - bola no lado do forehand (ou tempo de sobra): "abre" para bater de
        //   forehand, deslocando para o lado;
        // - bola no backhand e sem tempo: encaixa o backhand, ficando um pouco
        //   à frente da linha da bola (do lado do forehand).
        const baseY = s.y + side * 1.2;
        const travel =
          Math.hypot(s.x - player.x, baseY - player.y) / Math.max(1, player.maxSpeed * 1.45);
        const slack = s.t - travel;
        const ballSide = (s.x - player.x) * handFrame(player.team);
        const goForehand = ballSide >= -0.3 || slack > 0.95;
        const offset = goForehand
          ? slack > 0.3
            ? FOREHAND_OFFSET
            : slack > 0.12
              ? FOREHAND_OFFSET * 0.6
              : FOREHAND_OFFSET * 0.3
          : -0.45; // backhand encaixado
        // `shared` é o ponto de contato comum (sem o deslocamento de mão), usado
        // na arbitragem das duplas; `personal` é o alvo já deslocado.
        return {
          shared: { x: s.x, y: baseY, t: s.t },
          personal: { x: s.x - handFrame(player.team) * offset, y: baseY, t: s.t },
        };
      }
    }
    return null;
  };
  // Prefere bater na altura confortável (0,55 a 1,1 m); se não der, aceita
  // bola baixa (meio-voleio) ou alta (voleio/smash).
  // Golpe rasteiro perto do quique (chega a tempo); se não der, aceita uma bola
  // mais alta. O gatilho do meio-voleio é estrito, então isso não vira
  // "meio-voleio" no placar.
  // Devolução de saque: favorece esperar a bola na altura da linha de fundo
  // (a bola vem até o recebedor) em vez de correr para dentro da quadra. A
  // referência é a posição de FORMAÇÃO, não a posição atual: senão o alvo
  // "anda" junto com o jogador e ele acaba correndo até a linha de saque.
  // Voleio: quem está adiantado ataca a bola antes do quique, em vez de
  // recuar para o fundo. Só vale se a bola passa na altura de voleio e dá tempo
  // de chegar; senão a IA cai no golpe de fundo normal.
  const volleyPick = () => {
    if (Math.abs(player.y) > NET.VOLLEY_Y) return null;
    const bounceT = bounce ? bounce.t : Infinity;
    for (const s of pred.samples) {
      if (teamOfSide(s.y) !== player.team) continue;
      if (s.t >= bounceT - 0.02) break;
      if (s.z < 0.25 || s.z > PLAYER.REACH_HEIGHT - 0.1) continue;
      if (Math.abs(s.y) > NET.VOLLEY_BALL_Y) continue;
      const travel =
        Math.hypot(s.x - player.x, s.y - player.y) / Math.max(1, player.maxSpeed * 1.45);
      if (s.t - travel < 0.05) continue;
      return {
        shared: { x: s.x, y: s.y, t: s.t },
        personal: { x: s.x - handFrame(player.team) * 0.3, y: s.y, t: s.t },
      };
    }
    return null;
  };
  const deepY = Math.abs(player.homeY ?? player.y);
  const deepPick = () => {
    for (const s of pred.samples) {
      if (teamOfSide(s.y) !== player.team) continue;
      if (s.t < minT) continue;
      if (s.z < 0.2 || s.z > PLAYER.REACH_HEIGHT - 0.1) continue;
      if (Math.abs(s.y) >= deepY - 1.5) {
        // Devolução: deslocamento menor (o saque vem rápido).
        return {
          shared: { x: s.x, y: s.y, t: s.t },
          personal: { x: s.x - handFrame(player.team) * 0.35, y: s.y, t: s.t },
        };
      }
    }
    return null;
  };
  const chosen = returningServe
    ? deepPick() ?? pick(0, 0.9) ?? pick(0, PLAYER.REACH_HEIGHT - 0.1)
    : volleyPick() ?? pick(0, 0.9) ?? pick(0, PLAYER.REACH_HEIGHT - 0.1);
  if (!chosen) return { intercept: null, goingOut: false, doubtful: false };
  const { shared, personal } = chosen;
  // Em duplas, só o parceiro mais perto persegue a bola (o outro cobre a
  // outra metade), evitando os dois irem juntos e ficarem colados. Na devolução
  // do saque o recebedor designado tem a preferência: o parceiro não pode
  // rebater, então não pode "roubar" o claim.
  if (world.doubles && !returningServe) {
    // A arbitragem usa a MESMA referência para os dois: o quique previsto no
    // nosso lado. Cada parceiro pode ter escolhido um contato diferente (voleio
    // x golpe de fundo), então o ponto de contato não serve; senão os dois se
    // acham os mais perto e correm juntos.
    const mates = world.players.filter((q) => q.team === player.team && q.id !== player.id && q.ai);
    const ref = bounce ?? shared;
    const mine = Math.hypot(ref.x - player.x, ref.y - player.y);
    for (const mate of mates) {
      const theirs = Math.hypot(ref.x - mate.x, ref.y - mate.y);
      if (theirs < mine - 0.05 || (Math.abs(theirs - mine) <= 0.05 && mate.id < player.id)) {
        return { intercept: null, goingOut: false };
      }
    }
  }
  return { intercept: personal, goingOut: false, doubtful };
}

// Escolha do tipo de batida da CPU: top spin agressivo na maioria das vezes,
// flat como opção segura, slice e lob como variação; smash na bola alta.
export function chooseShot(world, player, ball) {
  const traits = player.traits ?? DEFAULT_TRAITS;
  const smash = ball.z > 1.3 && Math.abs(player.y) < 5;
  if (smash) return { type: 'flat', depth: 1, hold: 0.32 };
  const r = world.rng();
  // Reação à rede: com um adversário adiantado, o lob vira arma (é o contra
  // clássico do net rusher). O resto da escolha segue os traços da classe.
  const netOpp = netOpponents(world, player).length;
  // A classe desloca as probabilidades: agressivos batem mais flat/top spin,
  // defensivos usam mais slice e lob. Cansada, a IA fica conservadora: mais
  // slice/lob (que erram menos), menos força e alvo mais curto (sem subir à
  // rede e com mais margem até a linha de fundo).
  const tiredness = tirednessOf(player);
  // Bola duvidosa (cairia fora por pouco): o jogador foi nela, mas joga seguro
  // em vez de arriscar de uma posição ruim.
  const doubtful = player.ai?.doubtful ? 1 : 0;
  // Teto: cansaço, reação à rede e bola duvidosa somam, mas ninguém vira uma
  // máquina de lobs.
  const lobP = Math.min(
    0.45,
    0.04 + traits.lob * 0.1 + tiredness * 0.14 + netOpp * NET.COUNTER_LOB + doubtful * 0.2,
  );
  const sliceP = lobP + 0.08 + traits.slice * 0.14 + tiredness * 0.14 + doubtful * 0.2;
  const flatP = sliceP + 0.16 + (1 - traits.spin) * 0.14;
  const power = (traits.aggression - 0.5) * 0.2 - tiredness * 0.15;
  const holdMul = (1 - 0.25 * tiredness) * (1 - 0.2 * doubtful);
  const depth = tiredness > 0.35 && world.rng() < 0.45 ? 0 : 1;
  if (r < lobP) return { type: 'lob', depth: 1, hold: (0.3 + world.rng() * 0.2) * holdMul };
  if (r < sliceP) {
    return { type: 'slice', depth: 0, hold: (0.55 + world.rng() * 0.25) * holdMul };
  }
  if (r < flatP) {
    return {
      type: 'flat',
      depth,
      hold: clamp(
        (0.45 + player.ai.skill * 0.4 + world.rng() * 0.2 + power) * holdMul,
        0.3,
        0.95,
      ),
    };
  }
  return {
    type: 'topspin',
    depth,
    hold: clamp(
      (0.55 + player.ai.skill * 0.4 + world.rng() * 0.2 + power) * holdMul,
      0.4,
      1.05,
    ),
  };
}

// Mira: prefere o lado oposto ao adversário, mas nem sempre na linha: parte
// das bolas vai pelo centro para não estourar a lateral com o erro somado.
// Distância além da quadra (0 quando dentro). A linha vale como dentro, então
// desconta o raio da bola.
function courtOutDistance(x, y, doubles) {
  const hw = (doubles ? COURT.DOUBLES_HALF_WIDTH : COURT.SINGLES_HALF_WIDTH) + PHYS.BALL_RADIUS;
  const hl = COURT.HALF_LENGTH + PHYS.BALL_RADIUS;
  const dx = Math.max(0, Math.abs(x) - hw);
  const dy = Math.max(0, Math.abs(y) - hl);
  return Math.hypot(dx, dy);
}

// Distância além da caixa de serviço (com a mesma tolerância de pointInBox).
function boxOutDistance(x, y, box) {
  if (!box) return 0;
  const tol = 0.03;
  const dx = Math.max(0, box.xMin - tol - x, x - (box.xMax + tol));
  const dy = Math.max(0, box.yMin - tol - y, y - (box.yMax + tol));
  return Math.hypot(dx, dy);
}

// Adversários adiantados (em posição de rede). A IA reage a eles: mais lob e
// passada, menos bola no centro.
export function netOpponents(world, player) {
  const oppTeam = otherTeam(player.team);
  return world.players.filter((p) => p.team === oppTeam && Math.abs(p.y) < NET.VOLLEY_Y);
}

export function chooseAimX(world, player) {
  const oppTeam = otherTeam(player.team);
  const opponents = world.players.filter((p) => p.team === oppTeam);
  if (!opponents.length) return world.rng() < 0.5 ? -1 : 1;
  const traits = player.traits ?? DEFAULT_TRAITS;
  // Cansado, a IA fica conservadora e joga mais pelo centro (menos ângulo e
  // menos risco de erro na linha). Contra um adversário na rede é o contrário:
  // o centro entrega a bola na raquete dele, então a mira vira passada.
  const tiredness = tirednessOf(player);
  const netOpp = netOpponents(world, player).length;
  if (
    world.rng() <
    0.35 - traits.aggression * 0.12 + tiredness * 0.35 - netOpp * NET.COUNTER_CENTER
  ) {
    return 0;
  }
  // Contra a rede, o lado aberto é medido só pelos adversários adiantados: o
  // parceiro fundo não pode cancelar a posição do net rusher e mandar a bola
  // justamente na raquete dele.
  const advanced = netOpp
    ? opponents.filter((p) => Math.abs(p.y) < NET.VOLLEY_Y)
    : opponents;
  const ref = advanced.length ? advanced : opponents;
  const avg = ref.reduce((s, p) => s + p.x, 0) / ref.length;
  const open = avg <= 0 ? 1 : -1; // lado aberto em coordenadas do mundo
  return open;
}

// Posição para sair da frente de uma bola que não vai ser jogada (vai sair).
function dodgeSpot(player, ball) {
  const side = sideOf(player.team);
  const dx = player.x - ball.x;
  const dir = Math.abs(dx) > 0.1 ? Math.sign(dx) : (player.pointSide ?? player.prefSide ?? 1);
  return { x: clamp(ball.x + dir * 2.2, -4.8, 4.8), y: side * 8.5 };
}

export function homeSpot(world, player, ball) {
  const side = sideOf(player.team);
  const traits = player.traits ?? DEFAULT_TRAITS;
  // Enquanto o saque não foi devolvido, quem não é o sacador espera na posição
  // de formação (o recebedor fundo, os parceiros na rede): sem seguir a bola,
  // que durante o toss está do outro lado da quadra.
  const servePending = world.phase === 'serve' || world.serve.returnPending;
  // Saque-e-voleio: o sacador com approach alto sobe à rede depois de sacar (em
  // vez de recuar para o centro da linha de fundo).
  const serving = player.id === world.serve.serverId;
  const serveVolley = serving && (player.ai?.approach ?? 0) >= 0.5;
  if (servePending && serving && !serveVolley) {
    // Sacador: recupera para o centro da linha de fundo, pronto para cobrir a
    // devolução cruzada (em vez de seguir a bola e ficar aberto no canto).
    return { x: 0, y: side * (COURT.HALF_LENGTH - 0.4) };
  }
  if (servePending && typeof player.homeX === 'number' && !serveVolley) {
    return { x: player.homeX, y: player.homeY };
  }
  const nearSide = ball.x >= 0 ? 1 : -1;
  // Profundidade da classe (atrás ou perto da linha) e avanço à rede.
  const baseY = 9.2 - traits.depth * 1.6;
  const approach = (player.ai?.approach ?? 0) * traits.net * NET.APPROACH;
  const deepY = Math.max(3.2, baseY - approach);
  if (!world.doubles) {
    // Deslocado para o forehand: a bola vem ao lado do corpo, não em cima.
    return {
      x: clamp(ball.x * 0.6 - handFrame(player.team) * 0.6, -3.2, 3.2),
      y: side * deepY,
    };
  }
  // Duplas: cada um cobre o seu lado do ponto (o da formação do saque, não o
  // preferido: a formação espelha os lados a cada ponto e ninguém cruza para
  // trocar de lado no meio do rally). Quem está do lado da bola sobe um pouco
  // para fechar o ângulo; o parceiro cobre o outro lado mais recuado.
  const mySide = player.pointSide ?? player.prefSide;
  if (mySide === nearSide) {
    return {
      x: clamp(ball.x * 0.5 + mySide * 1.6 - handFrame(player.team) * 0.35, -3.6, 3.6),
      y: side * Math.max(3.6, deepY - 0.6),
    };
  }
  return { x: mySide * 2.8, y: side * Math.max(4.2, deepY + 0.6 - approach * 0.4) };
}
