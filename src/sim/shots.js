import { clamp, pointSegmentDistance } from './math.js';
import { PLAYER } from './constants.js';
import { teamAt } from './court-sides.js';
import { classifyShot } from './systems/shot-model.js';
import { executeRallyShot } from './systems/rally.js';
import { applyHitCost } from './systems/energy.js';
import { startServeToss, executeServe } from './serve.js';
export function release(world, p) {
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
