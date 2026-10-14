import { createMenu } from '../src/app/menu.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeView, drawHelp, drawLoading, drawGameOver, drawMenu, drawPlayers, drawSettings, drawPause, drawSetSummary } from '../src/render.js';
import { drawScoreboard } from '../src/view/hud.js';
import { createWorld } from '../src/sim/world.js';
import { setLang } from '../src/i18n.js';
function context(width, height) {
  const calls = []; const state = { font: '14px sans-serif', textAlign: 'left', calls,
    measureText(text) { return { width: String(text).length * (parseFloat(this.font.match(/\d+px/)?.[0]) || 14) * 0.52 }; },
    createLinearGradient: () => ({ addColorStop() {} }),
    fillText(text, x, y, maxWidth) { const w = Math.min(this.measureText(text).width, maxWidth ?? Infinity); const h = parseFloat(this.font.match(/\d+px/)?.[0]) || 14; calls.push({ text, left: x - (this.textAlign === 'center' ? w / 2 : this.textAlign === 'right' ? w : 0), right: x + (this.textAlign === 'center' ? w / 2 : this.textAlign === 'right' ? 0 : w), top: y - h / 2, bottom: y + h / 2 }); },
  };
  return new Proxy(state, { get: (s, k) => k in s ? s[k] : () => {}, set: (s, k, v) => (s[k] = v, true) });
}
test('textos de ajuda, carregamento e resultado cabem nos três viewports em PT/EN', () => {
  for (const lang of ['pt', 'en']) for (const [width, height] of [[1280, 720], [640, 360], [390, 844], [1280, 656], [640, 296], [390, 780]]) {
    setLang(lang); const view = computeView(width, height); const w = createWorld({ mode: 'demo', bestOf: 5 });
    w.score.winner = 'a'; w.setHistory = Array.from({ length: 5 }, () => structuredClone(w.stats));
    for (const screen of ['help', 'loading', 'over']) {
      const ctx = context(width, height);
      if (screen === 'help') { const pages = drawHelp(ctx, view); for (let i = 1; i < pages; i++) drawHelp(ctx, view, i); }
      if (screen === 'loading') drawLoading(ctx, view, w, { modeIndex: 3, bestOfIndex: 2, difficultyIndex: 1 });
      if (screen === 'over') for (let page = 0; page < 6; page++) drawGameOver(ctx, view, w, page);
      const outside = ctx.calls.filter(c => c.left < -1 || c.right > width + 1 || c.top < 0 || c.bottom > height);
      assert.deepEqual(outside, [], `${lang} ${screen} ${width}x${height}`);
    }
  }
  setLang('pt');
});

test('placar, pausa e resumo de set cabem no viewport com rodapé reservado', () => {
  for(const lang of ['pt','en']) for(const [width,height] of [[1280,656],[640,296],[390,780]]) for(const mode of ['coop','singles','versus','demo']) {
    setLang(lang);const view=computeView(width,height),world=createWorld({mode,bestOf:5});
    world.phase='pointover';world.setSummary=world.stats;world.setHistory=[world.stats];
    for(const draw of [drawScoreboard,drawPause,drawSetSummary]) {
      const ctx=context(width,height);draw(ctx,view,world);
      if(draw===drawScoreboard){world.score.tiebreak=true;world.score.tbSuper=true;draw(ctx,view,world);}
      assert.deepEqual(ctx.calls.filter(c=>c.left<-1||c.right>width+1||c.top<0||c.bottom>height),[],`${lang} ${draw.name} ${mode} ${width}x${height}`);
    }
  }
  setLang('pt');
});

test('menu, jogadores e todas as categorias de settings cabem em PT/EN', () => {
  for(const lang of ['pt','en']) for(const [width,height] of [[1280,720],[640,360],[390,844],[1280,656],[640,296],[390,780]]) {
    setLang(lang);const view=computeView(width,height),menu=createMenu({language:lang});
    for(const draw of [drawMenu,drawPlayers,drawSettings]) for(const category of [0,1,2]) {
      menu.settings.category=category;const ctx=context(width,height);draw(ctx,view,menu);
      assert.deepEqual(ctx.calls.filter(c=>c.left<-1||c.right>width+1||c.top<0||c.bottom>height),[],`${lang} ${draw.name} ${width}x${height} category ${category}`);
    }
  }
  setLang('pt');
});
