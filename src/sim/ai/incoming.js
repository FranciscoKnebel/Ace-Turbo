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
