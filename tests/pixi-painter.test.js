// Testes do pintor da cena WebGL: semântica Canvas 2D traduzida para um
// adaptador de primitivas. O adaptador gravado permite validar sem PixiJS
// (o módulo do Pixi é exclusivo do browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PaintRunner } from '../src/view/pixi/painter.js';
import { drawScene } from '../src/view/match.js';
import { computeView } from '../src/view/camera.js';
import { createWorld, stepWorld } from '../src/sim/world.js';

// Contexto de efeitos igual ao dos testes de render, com as famílias extras
// que drawEffects aceita (impactos, poeira, faíscas e rótulos).
function makeFx() {
  return {
    trail: [{ x: 0, y: 2, z: 1, life: 0.2, max: 0.3, rgb: '253,224,71' }],
    marks: [{ x: 1, y: -3, life: 0.3, max: 0.5 }],
    shake: 0,
  };
}

// Adaptador que apenas grava as chamadas do pintor.
function fresh() {
  const ad = recordingAdapter();
  const p = new PaintRunner(ad); // dispara adapter.reset() na gravação
  ad.calls.length = 0; // ignora o reset inicial nos índices dos testes
  return [ad, p];
}

function recordingAdapter() {
  const calls = [];
  const grads = [];
  return {
    calls,
    grads,
    reset() {
      calls.push(['reset']);
    },
    createLinearGradient(x0, y0, x1, y1) {
      const g = {
        kind: 'linear',
        coords: [x0, y0, x1, y1],
        stops: [],
        addColorStop(offset, color) {
          this.stops.push([offset, color]);
        },
      };
      grads.push(g);
      return g;
    },
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
      const g = {
        kind: 'radial',
        coords: [x0, y0, r0, x1, y1, r1],
        stops: [],
        addColorStop(offset, color) {
          this.stops.push([offset, color]);
        },
      };
      grads.push(g);
      return g;
    },
    fillPath(cmds, paint, alpha) {
      calls.push(['fillPath', cmds, paint, alpha]);
    },
    strokePath(cmds, paint, alpha, width, cap) {
      calls.push(['strokePath', cmds, paint, alpha, width, cap]);
    },
    drawImage(img, x, y, w, h, alpha) {
      calls.push(['drawImage', img, x, y, w, h, alpha]);
    },
    drawText(info) {
      calls.push(['drawText', { ...info }]);
    },
  };
}

test('pintor: polígono emite fillPath com aplicadas e closePath', () => {
  const [ad, p] = fresh();
  p.beginPath();
  p.moveTo(10, 20);
  p.lineTo(50, 20);
  p.lineTo(50, 90);
  p.closePath();
  p.fillStyle = 'rgba(20,180,60,0.9)';
  p.fill();
  const [, cmds, paint, alpha] = ad.calls.at(-1);
  assert.equal(ad.calls.at(-1)[0], 'fillPath');
  assert.equal(paint, 'rgba(20,180,60,0.9)');
  assert.equal(alpha, 1);
  assert.deepEqual(cmds, [
    { m: 'M', x: 10, y: 20 },
    { m: 'L', x: 50, y: 20 },
    { m: 'L', x: 50, y: 90 },
    { m: 'Z' },
  ]);
});

test('pintor: translate salvo afeta os pontos e restore desfaz', () => {
  const [ad, p] = fresh();
  p.save();
  p.translate(12, -3);
  p.fillStyle = '#38bdf8';
  p.fillRect(0, 0, 10, 5);
  p.restore();
  p.fillRect(0, 0, 10, 5);
  const [fora, cmdsFora] = ad.calls[0];
  assert.equal(fora, 'fillPath');
  assert.deepEqual(cmdsFora, [{ m: 'R', x: 12, y: -3, w: 10, h: 5 }]);
  const [, cmdsDentro] = ad.calls[1];
  assert.deepEqual(cmdsDentro, [{ m: 'R', x: 0, y: 0, w: 10, h: 5 }]);
});

test('pintor: fill e stroke usam o mesmo path sem beginPath no meio', () => {
  const [ad, p] = fresh();
  p.beginPath();
  p.moveTo(0, 0);
  p.lineTo(30, 40);
  p.fillStyle = '#111111';
  p.fill();
  p.strokeStyle = '#222222';
  p.lineWidth = 3;
  p.lineCap = 'round';
  p.stroke();
  const fillCall = ad.calls.find((c) => c[0] === 'fillPath');
  const strokeCall = ad.calls.find((c) => c[0] === 'strokePath');
  assert.ok(fillCall && strokeCall);
  assert.deepEqual(fillCall[1], strokeCall[1]);
  assert.equal(strokeCall[4], 3); // lineWidth
  assert.equal(strokeCall[5], 'round'); // cap
});

test('pintor: fillRect no meio de um path não apaga o buffer', () => {
  const [ad, p] = fresh();
  p.beginPath();
  p.moveTo(5, 5);
  p.lineTo(9, 9);
  p.fillStyle = '#abcdef';
  p.fillRect(0, 0, 2, 2);
  p.fill();
  assert.equal(ad.calls.length, 2);
  assert.deepEqual(ad.calls[0][1], [{ m: 'R', x: 0, y: 0, w: 2, h: 2 }]);
  assert.deepEqual(ad.calls[1][1], [
    { m: 'M', x: 5, y: 5 },
    { m: 'L', x: 9, y: 9 },
  ]);
});

test('pintor: gradiente linear guardado no adaptador com stops', () => {
  const [ad, p] = fresh();
  p.fillStyle = p.createLinearGradient(0, 0, 0, 100);
  p.fillStyle.addColorStop(0, '#0f172a');
  p.fillStyle.addColorStop(1, '#38bdf8');
  p.fillRect(0, 0, 10, 100);
  const [, , paint] = ad.calls[0];
  assert.equal(paint.kind, 'linear');
  assert.deepEqual(paint.coords, [0, 0, 0, 100]);
  assert.deepEqual(paint.stops, [
    [0, '#0f172a'],
    [1, '#38bdf8'],
  ]);
});

test('pintor: arco e elipse preservam raios, ângulos e sentido', () => {
  const [ad, p] = fresh();
  p.beginPath();
  p.arc(50, 60, 12, 0, Math.PI * 2);
  p.fillStyle = '#ffffff';
  p.fill();
  p.beginPath();
  p.ellipse(50, 60, 20, 8, 0, 0, Math.PI * 2);
  p.fill();
  assert.deepEqual(ad.calls[0][1], [
    { m: 'A', x: 50, y: 60, r: 12, a0: 0, a1: Math.PI * 2, ccw: false },
  ]);
  assert.deepEqual(ad.calls[1][1], [
    { m: 'E', x: 50, y: 60, rx: 20, ry: 8, rot: 0, a0: 0, a1: Math.PI * 2, ccw: false },
  ]);
});

test('pintor: strokeText + fillText em pares viram um drawText com contorno', () => {
  const [ad, p] = fresh();
  p.textAlign = 'center';
  p.textBaseline = 'middle';
  p.font = 'bold 15px system-ui, sans-serif';
  p.lineWidth = 4;
  p.strokeStyle = 'rgba(2,6,23,0.8)';
  p.strokeText('SEGURE', 400, 200);
  p.fillStyle = 'rgba(229,231,235,0.85)';
  p.fillText('SEGURE', 400, 200);
  assert.equal(ad.calls.length, 1);
  const [, info] = ad.calls[0];
  assert.equal(info.text, 'SEGURE');
  assert.equal(info.fill, 'rgba(229,231,235,0.85)');
  assert.equal(info.stroke, 'rgba(2,6,23,0.8)');
  assert.equal(info.strokeWidth, 4);
  assert.equal(info.align, 'center');
  assert.equal(info.baseline, 'middle');
  assert.equal(info.alpha, 1);
});

test('pintor: strokeText sem par sai como texto de contorno', () => {
  const [ad, p] = fresh();
  p.font = 'bold 15px system-ui, sans-serif';
  p.strokeText('sozinho', 8, 8);
  p.fillText('outro', 20, 20);
  assert.equal(ad.calls.length, 2);
  assert.equal(ad.calls[0][1].fill, null);
  assert.equal(ad.calls[0][1].stroke, '#000000');
  assert.equal(ad.calls[1][1].text, 'outro');
  assert.equal(ad.calls[1][1].stroke, null);
});

test('pintor: setLineDash recorteia arco em traços com moveTo por trato', () => {
  const [ad, p] = fresh();
  p.setLineDash([4, 4]);
  p.beginPath();
  p.ellipse(500, 300, 40, 17, 0, 0, Math.PI * 2);
  p.strokeStyle = 'rgba(253,224,71,0.9)';
  p.lineWidth = 2;
  p.stroke();
  const cmds = ad.calls[0][1];
  const starts = cmds.filter((c) => c.m === 'M');
  const arcs = cmds.filter((c) => c.m === 'E');
  assert.ok(starts.length > 8, `esperava traços vários, veio ${starts.length}`);
  assert.equal(starts.length, arcs.length);
  // Os raio/centro ficam nos sub-arcos; os ângulos são fatias do círculo.
  for (const a of arcs) {
    assert.equal(a.x, 500);
    assert.equal(a.rx, 40);
    assert.equal(a.ry, 17);
    assert.ok(Math.abs(a.a1 - a.a0) > 0);
  }
  // reset do dash volta ao sólido
  p.setLineDash([]);
  p.beginPath();
  p.arc(0, 0, 10, 0, Math.PI * 2);
  p.stroke();
  assert.deepEqual(ad.calls[1][1], [{ m: 'A', x: 0, y: 0, r: 10, a0: 0, a1: Math.PI * 2, ccw: false }]);
});

test('pintor: drawImage recebe aplicadas com translate', () => {
  const [ad, p] = fresh();
  const img = { id: 'icone' };
  p.save();
  p.translate(30, 40);
  p.drawImage(img, 5, 6, 20, 14);
  p.restore();
  const [, aimg, x, y, w, h, alpha] = ad.calls[0];
  assert.equal(aimg, img);
  assert.deepEqual([x, y, w, h], [35, 46, 20, 14]);
  assert.equal(alpha, 1);
});

test('pintor: drawScene inteiro (código real da cena) alimenta o painter', () => {
  const [ad, p] = fresh();
  const view = computeView(1280, 720);

  // Mundo aguardando o sacador humano: mira tracejada da cena.
  const serveWorld = createWorld({ mode: 'singles', seed: 7 });
  stepWorld(serveWorld, 1 / 120);
  assert.doesNotThrow(() => drawScene(p, serveWorld, view, makeFx()));
  assert.ok(ad.calls.length > 40, `cena de saque gerou só ${ad.calls.length} emissões`);
  // Mira do saque: elipse tracejada chega como sub-arcos com sub-arcos com moveTo.
  const dashed = ad.calls.find((c) => c[0] === 'strokePath' && (c[1] ?? []).length > 4);
  assert.ok(dashed, 'esperava a mira tracejada entre os strokes');
  const slices = (dashed[1] ?? []);
  assert.ok(slices.some((c) => c.m === 'E') && slices.some((c) => c.m === 'M'), 'mira cheia em sub-arcos com moveTo');

  // Rally em andamento: poeira, faíscas, impacto, rótulo e shake ativos.
  const world = createWorld({ mode: 'demo', seed: 2 });
  for (let i = 0; i < 600; i++) stepWorld(world, 1 / 120);
  ad.calls.length = 0;
  const fx = makeFx();
  fx.shake = 6;
  fx.impacts = [{ x: 1, y: 2, z: 0.6, life: 0.2, max: 0.4, rgb: '255,255,255' }];
  fx.dust = [{ x: 1, y: 2, z: 0.1, life: 0.3, max: 0.5, rgb: '148,163,184' }];
  fx.sparks = [{ x: 1, y: 2, z: 0.6, vx: 2, vy: 1, vz: 0.2, life: 0.2, max: 0.3, rgb: '253,224,71' }];
  fx.labels = [
    {
      playerId: 'a1',
      action: '',
      text: 'TOPSPIN',
      caption: '',
      rgb: '253,224,71',
      life: 0.5,
      max: 1,
      hand: '',
      turbo: false,
    },
  ];
  assert.doesNotThrow(() => drawScene(p, world, view, fx));
  const fills = ad.calls.filter((c) => c[0] === 'fillPath').length;
  const strokes = ad.calls.filter((c) => c[0] === 'strokePath').length;
  const texts2 = ad.calls.filter((c) => c[0] === 'drawText').length;
  assert.ok(fills > 60, `esperava muitos fills, veio ${fills}`);
  assert.ok(strokes > 20, `esperava traços, veio ${strokes}`);
  assert.ok(texts2 >= 1, `rótulo TOPSPIN deveria emitir texto, veio ${texts2}`);
  const grads2 = ad.calls.filter((c) => (c[2] ?? {}).kind === 'linear').length;
  assert.ok(grads2 > 0, 'esperava gradiente (céu) na cena');
});

test('pintor: reset avisa o adaptador e volta ao estado inicial', () => {
  const ad = recordingAdapter();
  const p = new PaintRunner(ad);
  p.translate(9, 9);
  p.fillText('olá', 1, 1);
  p.reset();
  assert.equal(ad.calls.at(-1)[0], 'reset');
  assert.equal(p.state.tx, 0);
  assert.equal(p.state.ty, 0);
  assert.deepEqual(p.path, []);
});

test('pintor: globalAlpha multiplicado nas emissões', () => {
  const [ad, p] = fresh();
  p.globalAlpha = 0.5;
  p.fillStyle = '#aabbcc';
  p.fillRect(0, 0, 4, 4);
  p.strokeStyle = '#ddeeff';
  p.lineWidth = 1;
  p.beginPath();
  p.ellipse(0, 0, 5, 5, 0, 0, Math.PI * 2);
  p.stroke();
  assert.equal(ad.calls[0][3], 0.5);
  assert.equal(ad.calls[1][3], 0.5);
});
