export const sideOf = (team) => (team === 'a' ? -1 : 1);
// Referencial da mão: lateral > 0 é forehand (a bola à direita do jogador).
export const handFrame = (team) => (team === 'a' ? 1 : -1);
// Deslocamento para o lado do forehand: a IA não fica na linha da bola, e sim
// um pouco ao lado, para bater de forehand em vez de "no corpo" (neutro).
export const FOREHAND_OFFSET = 0.9;
export const otherTeam = (team) => (team === 'a' ? 'b' : 'a');
export const teamOfSide = (y) => (y < 0 ? 'a' : 'b');


// Logical team is stable; physical side changes only at end changes.
export function teamAt(world, y) {
  const physical = teamOfSide(y);
  return world.endsSwapped ? otherTeam(physical) : physical;
}
export function serviceSign(score, physicalSide) {
  const total = score.tiebreak ? score.tbPoints.a + score.tbPoints.b : score.points.a + score.points.b;
  return (total % 2 === 0 ? 1 : -1) * (physicalSide === 'a' ? 1 : -1);
}
