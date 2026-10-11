import { COURT, NET } from '../constants.js';
import { clamp } from '../math.js';
import { DEFAULT_TRAITS } from '../stats.js';
import { sideOf, handFrame } from '../court-sides.js';
// Posição para sair da frente de uma bola que não vai ser jogada (vai sair).
export function dodgeSpot(player, ball) {
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
