import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchScore } from '../src/sim/score.js';

function winGame(score, team) {
  for (let i = 0; i < 4; i++) score.awardPoint(team);
}

function winSet(score, team, games = 6) {
  for (let i = 0; i < games; i++) winGame(score, team);
}

test('game simples: 4 pontos seguidos fecham o game e giram o saque', () => {
  const s = new MatchScore();
  for (let i = 0; i < 3; i++) s.awardPoint('a');
  assert.deepEqual(s.points, { a: 3, b: 0 });
  assert.equal(s.pointsLabel('a'), '40');
  assert.equal(s.pointsLabel('b'), '0');
  s.awardPoint('a');
  assert.deepEqual(s.games, { a: 1, b: 0 });
  assert.deepEqual(s.points, { a: 0, b: 0 });
  assert.equal(s.server, 'b');
  assert.equal(s.teamServeIndex.b, 1);
});

test('deuce e vantagem', () => {
  const s = new MatchScore();
  for (let i = 0; i < 3; i++) {
    s.awardPoint('a');
    s.awardPoint('b');
  }
  assert.equal(s.isDeuce(), true);
  assert.equal(s.pointsLabel('a'), '40');
  s.awardPoint('a');
  assert.equal(s.advantageTeam(), 'a');
  assert.equal(s.pointsLabel('a'), 'AD');
  assert.equal(s.games.a, 0);
  s.awardPoint('b'); // volta ao deuce
  assert.equal(s.isDeuce(), true);
  s.awardPoint('a');
  s.awardPoint('a'); // vantagem + ponto = game
  assert.equal(s.games.a, 1);
  assert.equal(s.advantageTeam(), null);
});

test('set 6-0', () => {
  const s = new MatchScore();
  for (let g = 0; g < 6; g++) winGame(s, 'a');
  assert.deepEqual(s.sets, [{ a: 6, b: 0 }]);
  assert.equal(s.setsWon.a, 1);
  assert.equal(s.winner, null);
  assert.deepEqual(s.games, { a: 0, b: 0 });
});

test('set 7-5 (precisa de 2 de diferença)', () => {
  const s = new MatchScore();
  for (let g = 0; g < 5; g++) {
    winGame(s, 'a');
    winGame(s, 'b');
  }
  assert.deepEqual(s.games, { a: 5, b: 5 });
  winGame(s, 'a');
  assert.equal(s.sets.length, 0);
  winGame(s, 'a');
  assert.deepEqual(s.sets, [{ a: 7, b: 5 }]);
});

test('tiebreak em 6-6 fecha o set em 7-6', () => {
  const s = new MatchScore();
  for (let g = 0; g < 6; g++) {
    winGame(s, 'a');
    winGame(s, 'b');
  }
  assert.equal(s.tiebreak, true);
  assert.equal(s.server, s.tbFirstServer);
  for (let i = 0; i < 6; i++) {
    s.awardPoint('a');
    s.awardPoint('b');
  }
  assert.equal(s.tiebreak, true);
  s.awardPoint('a');
  assert.equal(s.tiebreak, true, '7-6 no tiebreak ainda não fecha');
  s.awardPoint('a');
  assert.deepEqual(s.sets, [{ a: 7, b: 6, tiebreak: { a: 8, b: 6 } }]);
  assert.equal(s.tiebreak, false);
});

test('rotação de saque no tiebreak: 1-2-2-2...', () => {
  const s = new MatchScore();
  assert.equal(s.serviceTeamForPoint(0, 'a'), 'a');
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7].map((n) => s.serviceTeamForPoint(n, 'a')),
    ['b', 'b', 'a', 'a', 'b', 'b', 'a'],
  );
});

test('lado do saque alterna com a paridade dos pontos', () => {
  const s = new MatchScore();
  assert.equal(s.serveSideSign('a'), 1); // 0-0: deuce, lado direito de A (+x)
  s.awardPoint('a');
  assert.equal(s.serveSideSign('a'), -1); // 15-0: ad
  s.awardPoint('b');
  assert.equal(s.serveSideSign('a'), 1); // 15-15
  assert.equal(s.serveSideSign('b'), -1); // B enxerga espelhado
});

test('melhor de 3: dois sets vencem a partida', () => {
  const s = new MatchScore();
  winSet(s, 'a');
  winSet(s, 'b');
  assert.equal(s.setsWon.a, 1);
  assert.equal(s.setsWon.b, 1);
  winSet(s, 'a');
  assert.equal(s.winner, 'a');
  const before = JSON.stringify(s.sets);
  s.awardPoint('b');
  assert.equal(s.winner, 'a');
  assert.equal(JSON.stringify(s.sets), before, 'pontos após o fim são ignorados');
});

test('rodízio de saque entre games e sets', () => {
  const s = new MatchScore();
  assert.equal(s.server, 'a');
  winGame(s, 'a');
  assert.equal(s.server, 'b');
  winGame(s, 'b');
  assert.equal(s.server, 'a');
  // fecha o set e continua alternando
  for (let g = 0; g < 5; g++) winGame(s, 'a');
  assert.equal(s.sets.length, 1);
  assert.deepEqual(s.sets[0], { a: 6, b: 1 });
  const serverAfterSet = s.server;
  winGame(s, serverAfterSet);
  assert.notEqual(s.server, serverAfterSet);
});
