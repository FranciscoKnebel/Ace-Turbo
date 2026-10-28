import test from 'node:test';
import assert from 'node:assert/strict';
import { PixiPaintAdapter } from '../src/view/pixi/scene.js';

function fixture() {
  const host = { children: [], addChild(c) { this.children.push(c); }, removeChildren() { const children=this.children;this.children=[];return children; } };
  return new PixiPaintAdapter({}, host);
}

test('adaptador preserva elipses parciais, tracejadas e rotacionadas do Canvas', () => {
  const adapter = fixture();
  for (const ccw of [false, true]) for (const rot of [0, .7]) {
    const calls=[];
    const graph = { beginPath() {}, moveTo: (...args)=>calls.push(['M',...args]), bezierCurveTo: (...args)=>calls.push(['C',...args]), ellipse: (...args)=>calls.push(['E',...args]) };
    const a0 = .4, a1 = a0 + (ccw ? -1 : 1) * Math.PI / 2;
    adapter._path(graph, [{m:'E', x:10,y:20,rx:40,ry:17,rot,a0,a1,ccw}]);
    assert.equal(calls.length,2);assert.equal(calls[1][0],'C');
    const x=10+40*Math.cos(a1)*Math.cos(rot)-17*Math.sin(a1)*Math.sin(rot);
    const y=20+40*Math.cos(a1)*Math.sin(rot)+17*Math.sin(a1)*Math.cos(rot);
    assert.ok(Math.abs(calls[1].at(-2)-x)<1e-8);assert.ok(Math.abs(calls[1].at(-1)-y)<1e-8);
    assert.ok(!calls.some(([m])=>m==='E'), 'sub-arcos não viram elipses completas no Pixi');
  }
});

test('descarte libera objetos anexados e caches/pools destacados exatamente uma vez', () => {
  const adapter=fixture();
  const object=()=>({destroyed:0,destroy(){this.destroyed++;}});
  const active=object(),pooled=object(),text=object(),sprite=object(),gradient=object();
  adapter.host.addChild(active);adapter.host.addChild(text);
  adapter.gfxPool.push(pooled);adapter.spritePool.push(sprite);adapter.texts.set('label',text);adapter.grads.set('gradient',gradient);
  adapter.destroy();adapter.destroy();
  for(const item of [active,pooled,text,sprite,gradient]) assert.equal(item.destroyed,1);
});
