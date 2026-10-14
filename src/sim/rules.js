import { teamAt, otherTeam } from './court-sides.js';
import { registerFault, replayServe } from './serve.js';
import { enterRally } from './systems/phases.js';
import { awardPoint } from './systems/points.js';
import { observeTelemetry } from './systems/telemetry.js';
import { message } from './contracts.js';
import { setMessage } from './systems/messages.js';
import { PHYS } from './constants.js';
import { pointInBox, pointSegmentDistance } from './math.js';
export function checkBallStopped(world) {
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
      observeTelemetry(world, { type: 'let' });
      setMessage(world, message('msg.let'), 1.5);
      replayServe(world);
    } else {
      registerFault(world);
    }
    return;
  }
  if (inBox) {
    enterRally(world);
    return;
  }
  registerFault(world);
}

export function handleFence(world, ev) {
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
