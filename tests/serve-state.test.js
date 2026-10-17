import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, resetForServe, startServeToss, registerFault, processBounce, serveAimTarget, normalizeServeType } from '../src/sim/world.js';

test('novo ponto, toss, fault e let removem estado transitório da bola', () => {
  const w = createWorld({ weather: 'windy', seed: 2 });
  const wind = w.ball.wind;
  const dirty = () => Object.assign(w.ball, { curve: 3.2, sinceBounce: 0, lastHit: { isServe: true }, dead: true });
  const clean = () => {
    assert.equal(w.ball.curve, 0);
    assert.equal(w.ball.sinceBounce, 99);
    assert.equal(w.ball.lastHit, null);
    assert.equal(w.ball.dead, false);
    assert.equal(w.ball.wind, wind);
  };
  dirty(); resetForServe(w); clean();
  dirty(); startServeToss(w, w.byId.a1, .75, 'flat'); clean();
  dirty(); registerFault(w); clean();
  dirty();
  Object.assign(w.serve, { inFlight: true, box: { xMin: -4, xMax: 0, yMin: 0, yMax: 6.4 } });
  Object.assign(w.ball, { touchedNet: true, lastHit: { isServe: true } });
  processBounce(w, { x: -2, y: 4 });
  clean();
  assert.equal(w.serve.attempt, 2);
  assert.equal(w.serve.stage, 'toss');
});

test('preview usa o mesmo alvo canônico de execução para todos os saques', () => {
  const w = createWorld(); const p = w.byId.a1;
  for (const shot of ['flat', 'topspin', 'slice', 'lob']) {
    for (const depth of [-1, 0, 1]) for (const attempt of [1, 2]) {
      p.input.aim = { x: .6, depth }; w.serve.attempt = attempt;
      assert.deepEqual(serveAimTarget(w, p, shot), serveAimTarget(w, p, normalizeServeType(shot)));
    }
  }
});
