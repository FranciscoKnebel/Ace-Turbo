import { otherTeam } from './court-sides.js';
export function pickServer(world) {
  const team = world.score.server;
  const mates = world.players.filter((p) => p.team === team);
  // No tiebreak não há rotação de games: cada bloco de saque (1-2-2-2) conta
  // como o próximo game do time, para o parceiro rotacionar.
  const blocks = world.score.tiebreak ? (world.score.tbServeBlocks?.[team] ?? 0) : 0;
  const idx = (world.score.teamServeIndex[team] + blocks) % mates.length;
  return mates[idx];
}

// Preserve the logical score and every historical snapshot.
export function changeEnds(world) {
  world.endsSwapped = !world.endsSwapped;
  for (const player of world.players) {
    player.side = otherTeam(player.side ?? player.team);
    player.prefSide = -player.prefSide;
  }
}
