import { COURT, MATCH, PLAYER, STAMINA, TURBO } from '../constants.js';
import { sideOf } from '../court-sides.js';
import { clamp } from '../math.js';
import { staminaDrainMul, staminaMaxOf, tirednessOf, sprintDrainMul, staminaRegenMul } from '../stats.js';
import { spendStamina } from '../systems/energy.js';
import { clampPlayerToCourt } from '../systems/movement.js';
import { classifyShot } from '../systems/shot-model.js';
export function advancePlayer(world, p, dt, frozen, { release, tryHit }) {
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
  // Cansaço gradual: abaixo de TIRED_FROM a velocidade e o ritmo de carga caem
  // proporcionalmente, até LOW_SPEED/LOW_CHARGE com a barra vazia.
  const tiredness = tirednessOf(p);
  let maxSpeed = p.maxSpeed * (1 - (1 - STAMINA.LOW_SPEED) * tiredness);
  const staminaMaxValue = staminaMaxOf(p);
  const relSpeed = Math.min(1, Math.hypot(p.vx, p.vy) / Math.max(0.01, p.maxSpeed));
  if (wantsSprint && canSprint) {
    p.sprinting = true;
    maxSpeed *= STAMINA.SPEED_MULT;
    spendStamina(p, STAMINA.DRAIN * sprintDrainMul(p.stats) * dt, true);
  } else {
    p.sprinting = false;
    if (relSpeed > STAMINA.RUN_SPEED) {
      // Corrida normal em alta velocidade também cansa (menos que o sprint).
      const k = (relSpeed - STAMINA.RUN_SPEED) / (1 - STAMINA.RUN_SPEED);
      spendStamina(p, STAMINA.RUN_DRAIN * k * staminaDrainMul(p.stats) * dt);
    } else if (world.phase === 'rally' && !p.charging) {
      // Em ritmo lento a barra recarrega (a recarga pausa no saque; a IA
      // recarrega mais devagar ainda).
      const regen =
        STAMINA.REGEN * staminaRegenMul(p.stats) * (p.human ? 1 : STAMINA.AI_REGEN);
      p.stamina = Math.min(staminaMaxValue, p.stamina + regen * dt);
    }
  }
  // Pausa entre pontos: recuperação extra de 12% a 28% da barra conforme o
  // stat de vigor (e o sacador do ponto recupera em dobro). Vale mesmo
  // correndo: o gasto do sprint desconta em paralelo.
  if (world.phase === 'pointover') {
    const k = clamp(((p.stats?.stamina ?? 75) - 50) / 49, 0, 1);
    const amount =
      (STAMINA.PAUSE_REGEN_MIN + (STAMINA.PAUSE_REGEN_MAX - STAMINA.PAUSE_REGEN_MIN) * k) *
      staminaMaxValue;
    // O sacador do ponto recupera em dobro: ele gastou no saque e ainda joga o
    // rally em desvantagem em relação a quem só esperou.
    const boost = p.id === world.serve?.serverId ? STAMINA.PAUSE_REGEN_SERVER : 1;
    const pause = Math.max(0.5, world.pauseDuration || MATCH.POINT_PAUSE);
    p.stamina = Math.min(staminaMaxValue, p.stamina + ((amount * boost) / pause) * dt);
  }
  const spd = Math.hypot(p.vx, p.vy);
  if (spd > maxSpeed) {
    p.vx *= maxSpeed / spd;
    p.vy *= maxSpeed / spd;
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  clampPlayerToCourt(p);
  // Durante o saque (bola em voo), o recebedor espera atrás da linha de saque:
  // nada de invadir a caixa de serviço antes do quique.
  if (world.serve.inFlight && world.serve.receiverId === p.id) {
    const side = sideOf(p.team);
    if (side > 0) p.y = Math.max(p.y, COURT.SERVICE_LINE);
    else p.y = Math.min(p.y, -COURT.SERVICE_LINE);
  }

  p.turbo = Math.min(TURBO.MAX, p.turbo + TURBO.REGEN * dt);

  if (p.swingCooldown > 0) p.swingCooldown = Math.max(0, p.swingCooldown - dt);

  if (frozen) {
    p.charging = false;
    p.charge = 0;
    return;
  }

  // Carga e soltura (o saque ou o golpe começam no release). O tipo de batida
  // é memorizado enquanto a tecla está pressionada, porque no release a tecla
  // já foi solta. No saque, a primeira carga é o toss e a segunda é a batida.
  // Na pausa do ponto (ou no fim de jogo) não há carga: nada de gastar vigor
  // com a bola morta.
  const canPlay = world.phase === 'serve' || world.phase === 'rally';
  if (canPlay) {
    if (input.swing) {
      if (!p.charging && p.swingCooldown <= 0 && !p.swing) {
        p.charging = true;
        p.charge = 0;
        p.chargeShot = classifyShot(input);
      } else if (p.charging) {
        // Cansado carrega mais devagar; carregar gasta vigor, mas só até a
        // carga encher (segurar depois não custa) e o toss do saque é leve.
        const rate = 1 - (1 - STAMINA.LOW_CHARGE) * tiredness;
        p.charge = Math.min(1, p.charge + (dt / PLAYER.CHARGE_TIME) * rate);
        p.chargeShot = classifyShot(input);
        if (p.charge < 1) {
          // As cargas do saque (toss e batida) são bem mais baratas: o saque
          // não pode deixar o sacador com metade da barra no começo do ponto.
          const isServerServe =
            world.phase === 'serve' && world.serve.serverId === p.id;
          const cost =
            STAMINA.CHARGE_DRAIN * (isServerServe ? STAMINA.SERVE_CHARGE_MUL : 1);
          spendStamina(p, cost * staminaDrainMul(p.stats) * dt);
        }
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

