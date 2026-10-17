import { otherTeam } from './court-sides.js';
// All service rotation operates on stable team ids; score owns the counters.
export function serviceTeamForPoint(n, first) {
  if (n <= 0) return first;
  return Math.floor((n + 1) / 2) % 2 === 1 ? otherTeam(first) : first;
}
export function partnerIndex(score, team, count) {
  const blocks = score.tiebreak ? (score.tbServeBlocks?.[team] ?? 0) : 0;
  return (score.teamServeIndex[team] + blocks) % count;
}
export function advanceTiebreakServer(score) {
  const next = serviceTeamForPoint(score.tbPoints.a + score.tbPoints.b, score.tbFirstServer);
  if (score.tbLastServer && next !== score.tbLastServer) score.tbServeBlocks[next]++;
  score.tbLastServer = score.server = next;
}
export function rotateGameServer(score) {
  score.server = otherTeam(score.server); score.teamServeIndex[score.server]++;
}
export function rotateAfterTiebreak(score, opener) {
  score.server = otherTeam(opener); score.teamServeIndex[score.server]++;
}
