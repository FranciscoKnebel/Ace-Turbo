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

test('melhor de 5: três sets vencem a partida', () => {
  const s = new MatchScore({ bestOf: 5 });
  assert.equal(s.setsToWin, 3);
  winSet(s, 'a');
  winSet(s, 'b');
  winSet(s, 'a');
  assert.equal(s.winner, null, '2-1 ainda não fecha');
  winSet(s, 'a');
  assert.equal(s.winner, 'a');
  assert.equal(s.setsWon.a, 3);
});

test('no-ad: em 40-40 o próximo ponto fecha o game', () => {
  const s = new MatchScore({ noAd: true });
  for (let i = 0; i < 3; i++) {
    s.awardPoint('a');
    s.awardPoint('b');
  }
  assert.equal(s.isDeuce(), true);
  assert.equal(s.advantageTeam(), null, 'no-ad não tem vantagem');
  s.awardPoint('a');
  assert.deepEqual(s.games, { a: 1, b: 0 }, 'o game fecha direto em 4-3');
  // Sem no-ad, 4-3 vira vantagem e o game continua.
  const normal = new MatchScore();
  for (let i = 0; i < 3; i++) {
    normal.awardPoint('a');
    normal.awardPoint('b');
  }
  normal.awardPoint('a');
  assert.deepEqual(normal.games, { a: 0, b: 0 });
  assert.equal(normal.advantageTeam(), 'a');
});

test('super tiebreak: o set decisivo é um tiebreak de 10 pontos', () => {
  const s = new MatchScore({ bestOf: 3, superTiebreak: true });
  winSet(s, 'a');
  winSet(s, 'b');
  assert.equal(s.setsWon.a, 1);
  assert.equal(s.setsWon.b, 1);
  assert.equal(s.tiebreak, true, 'o set decisivo é o super tiebreak');
  assert.equal(s.tbSuper, true);
  assert.equal(s.tbTarget, 10);
  for (let i = 0; i < 8; i++) {
    s.awardPoint('a');
    s.awardPoint('b');
  }
  assert.equal(s.winner, null, '8-8 continua');
  s.awardPoint('a');
  s.awardPoint('a');
  assert.equal(s.winner, 'a');
  assert.deepEqual(s.sets.at(-1), { a: 1, b: 0, tiebreak: { a: 10, b: 8 } });
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

test('super tiebreak só no set decisivo (melhor de 5)', () => {
  const s = new MatchScore({ bestOf: 5, superTiebreak: true });
  winSet(s, 'a');
  winSet(s, 'b');
  assert.equal(s.tiebreak, false, '1-1 ainda é set normal no melhor de 5');
  winSet(s, 'a');
  winSet(s, 'b');
  assert.equal(s.setsWon.a, 2);
  assert.equal(s.setsWon.b, 2);
  assert.equal(s.tiebreak, true, '2-2 é o set decisivo');
  assert.equal(s.tbTarget, 10);
});

test('tiebreak: quem saca primeiro é quem sacaria o game seguinte', () => {
  const s = new MatchScore();
  for (let g = 0; g < 6; g++) {
    winGame(s, 'a');
    winGame(s, 'b');
  }
  // O 12º game foi sacado por 'b' (games pares); o próximo seria 'a'.
  assert.equal(s.tiebreak, true);
  assert.equal(s.tbFirstServer, 'a');
  assert.equal(s.server, 'a');
  assert.equal(s.serviceTeamForPoint(0, s.tbFirstServer), 'a');
});

test('tiebreak: o próximo parceiro da rotação abre e o set seguinte troca o time', () => {
  const s = new MatchScore({ bestOf: 3 });
  s.games = { a: 5, b: 6 };
  s.points = { a: 3, b: 0 };
  s.teamServeIndex = { a: 5, b: 6 };
  s.server = 'a';
  s.awardPoint('a'); // 6-6
  assert.equal(s.tiebreak, true);
  assert.equal(s.tbFirstServer, 'b');
  assert.equal(s.tbServeBlocks.a, 1, 'o bloco 1 avança o parceiro');
  assert.equal(s.tbServeBlocks.b, 1);
  // Fecha o tiebreak (7-5) e o set: o set seguinte começa com o time que
  // recebeu o primeiro ponto do tiebreak.
  s.tbPoints = { a: 6, b: 5 };
  s.awardPoint('a');
  assert.equal(s.tiebreak, false, 'tiebreak fechado');
  assert.equal(s.setsWon.a, 1);
  assert.equal(s.server, 'a', 'o set seguinte começa com quem recebeu o 1º ponto');
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
