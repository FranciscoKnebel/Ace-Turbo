// Camada WebGL com PixiJS 8 (vendado em /assets/vendor/pixi.min.js, sem
// build): o pintor (painter.js) fala Canvas 2D e este adaptador traduz as
// primitivas para Graphics/Sprite/Text reutilizando objetos entre quadros.
// O desenho da cena (`drawScene` em match.js) continua o mesmo código usado
// pelo fallback 2D: só o "ctx" muda. Sem WebGL ou sem o módulo vendado, o
// import falha e o chamador segue no Canvas 2D.

import { PaintRunner } from './painter.js';
import { drawScene } from '../match.js';

const PIXI_URL = new URL('../../../assets/vendor/pixi.min.js', import.meta.url).href;

// Converte as cores da cena (#hex e rgb/rgba dinâmicos de partículas) para
// hex + alpha separado. O Pixi recebe hex como cor e o alpha multiplicado
// pelo globalAlpha do quadro, então o resultado não depende do parser de CSS.
function colorOf(value) {
  if (typeof value === 'number') return { fill: value, alpha: 1 };
  if (typeof value !== 'string') return { fill: '#ffffff', alpha: 1 };
  const s = value.trim().toLowerCase();
  if (s[0] === '#') {
    if (s.length === 4) return { fill: `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`, alpha: 1 };
    if (s.length === 7) return { fill: s, alpha: 1 };
    if (s.length === 9) return { fill: s.slice(0, 7), alpha: Number.parseInt(s.slice(7), 16) / 255 };
    return { fill: '#ffffff', alpha: 1 };
  }
  const fn = s.match(/^rgba?\(([^)]*)\)$/);
  if (fn) {
    const parts = fn[1].trim().split(/[\s,/]+/).filter(Boolean);
    if (parts.length >= 3) {
      // Canais sem '%' chegam em 0-255; com '%' chegam em 0-100. Ambos
      // viram byte 0-255 para compor o hex final.
      const chan = (v) => {
        const n = v.endsWith('%') ? ((Number.parseFloat(v) || 0) / 100) * 255 : Number.parseFloat(v) || 0;
        return Math.min(255, Math.max(0, Math.round(n)));
      };
      const r = chan(parts[0]);
      const g = chan(parts[1]);
      const b = chan(parts[2]);
      let a = 1;
      if (parts[3] !== undefined) {
        a = parts[3].endsWith('%') ? (Number.parseFloat(parts[3]) || 0) / 100 : Number.parseFloat(parts[3]) || 0;
        a = Math.max(0, Math.min(1, a));
      }
      const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      return { fill: hex, alpha: a };
    }
  }
  return { fill: '#ffffff', alpha: 1 };
}

function parseFont(font = '') {
  const m = String(font).match(/^(?:(\w+)\s+)?(\d+(?:\.\d+)?)px\s*(.*)$/);
  if (!m) return { fontWeight: 'normal', fontSize: 12, fontFamily: 'system-ui, sans-serif' };
  const [, rawWeight, size, family] = m;
  const weight = Number.parseInt(rawWeight ?? '400', 10);
  const bold = rawWeight === 'bold' || weight >= 700;
  return {
    fontWeight: bold ? 'bold' : 'normal',
    fontSize: Math.round(Number(size)),
    fontFamily: family && family.trim() ? family.trim() : 'system-ui, sans-serif',
  };
}

const ANCHOR_X = { left: 0, start: 0, right: 1, end: 1, center: 0.5 };
const ANCHOR_Y = { middle: 0.5, top: 0.05, alphabetic: 0.82, bottom: 1, hanging: 0.05, ideographic: 1 };

export class PixiPaintAdapter {
  constructor(PIXI, host) {
    this.PIXI = PIXI;
    this.host = host;
    this.gfxPool = [];
    this.spritePool = [];
    this.texts = new Map(); // chave -> Text reutilizável entre quadros
    this.texs = new WeakMap(); // img -> Texture
    this.grads = new Map(); // chave -> FillGradient
    this.cur = null; // Graphics corrente (camadas de path)
  }

  // Cria as alças de gradiente que o pintor costura nos fills; a conversão
  // em FillGradient do Pixi acontece por demanda dentro de _gradientOf.
  createLinearGradient(x0, y0, x1, y1) {
    return {
      kind: 'linear',
      coords: [x0, y0, x1, y1],
      stops: [],
      addColorStop(offset, color) {
        this.stops.push([offset, color]);
      },
    };
  }

  createRadialGradient(x0, y0, r0, x1, y1, r1) {
    return {
      kind: 'radial',
      coords: [x0, y0, r0, x1, y1, r1],
      stops: [],
      addColorStop(offset, color) {
        this.stops.push([offset, color]);
      },
    };
  }

  reset() {
    for (const child of this.host.children.slice()) {
      if (child.__kind === 'gfx') {
        child.clear();
        this.gfxPool.push(child);
      } else if (child.__kind === 'sprite') {
        this.spritePool.push(child);
      }
      // Text fica no cache para reuso entre quadros.
    }
    for (const child of this.gfxPool.splice(256)) child.destroy(true);
    for (const child of this.spritePool.splice(64)) child.destroy();
    this.host.removeChildren();
    this.cur = null;
    this.frame = (this.frame ?? 0) + 1;
    // Evita crescimento infinito de gradientes/textos estranhos.
    if (this.grads.size > 64) {
      for (const [key, grad] of this.grads) {
        grad?.destroy?.(true);
        this.grads.delete(key);
        if (this.grads.size <= 48) break;
      }
    }
    if (this.texts.size > 160) {
      let overflow = this.texts.size - 160;
      for (const [key, text] of this.texts) {
        if (overflow-- <= 0) break;
        this.texts.delete(key);
        text.destroy();
      }
    }
  }

  destroy() {
    // app.destroy only visits attached children; pools and cached Text can be
    // detached after reset and still own GPU resources.
    const children = new Set([...this.host.removeChildren(), ...this.gfxPool, ...this.spritePool, ...this.texts.values()]);
    for (const child of children) child.destroy(true);
    for (const grad of this.grads.values()) grad.destroy(true);
    this.gfxPool.length = 0;
    this.spritePool.length = 0;
    this.texts.clear(); this.grads.clear(); this.cur = null;
  }

  _graph() {
    if (!this.cur) {
      this.cur = this.gfxPool.pop() ?? new this.PIXI.Graphics();
      this.cur.__kind = 'gfx';
      this.host.addChild(this.cur);
      this.cur.clear();
    }
    return this.cur;
  }

  _dropGraph() {
    // Próximo desenho nasce num Graphics acima: preserva a ordem quando um
    // sprite ou texto entra no meio do fluxo de formas.
    this.cur = null;
  }

  _path(g, cmds) {
    g.beginPath();
    for (const c of cmds) {
      switch (c.m) {
        case 'M':
          g.moveTo(c.x, c.y);
          break;
        case 'L':
          g.lineTo(c.x, c.y);
          break;
        case 'Q':
          g.quadraticCurveTo(c.cx, c.cy, c.x, c.y);
          break;
        case 'C':
          g.bezierCurveTo(c.c1x, c.c1y, c.c2x, c.c2y, c.x, c.y);
          break;
        case 'AT':
          g.arcTo(c.x1, c.y1, c.x2, c.y2, c.r);
          break;
        case 'A':
          g.arc(c.x, c.y, c.r, c.a0, c.a1, c.ccw);
          break;
        case 'E':
          // Pixi ellipse accepts only center/radii. Preserve Canvas partial
          // arcs (turbo, dashed serve target) and rotation with cubic segments.
          if (!c.rot && Math.abs(c.a1 - c.a0) >= Math.PI * 2) {
            g.ellipse(c.x, c.y, c.rx, c.ry);
          } else {
            const tau = Math.PI * 2;
            let sweep = c.a1 - c.a0;
            if (!c.ccw && sweep >= tau) sweep = tau;
            else if (c.ccw && sweep <= -tau) sweep = -tau;
            else if (c.ccw) sweep = -(((-sweep % tau) + tau) % tau);
            else sweep = ((sweep % tau) + tau) % tau;
            const count = Math.ceil(Math.abs(sweep) / (Math.PI / 2));
            const point = (a) => ({
              x: c.x + c.rx * Math.cos(a) * Math.cos(c.rot) - c.ry * Math.sin(a) * Math.sin(c.rot),
              y: c.y + c.rx * Math.cos(a) * Math.sin(c.rot) + c.ry * Math.sin(a) * Math.cos(c.rot),
            });
            const tangent = (a) => ({
              x: -c.rx * Math.sin(a) * Math.cos(c.rot) - c.ry * Math.cos(a) * Math.sin(c.rot),
              y: -c.rx * Math.sin(a) * Math.sin(c.rot) + c.ry * Math.cos(a) * Math.cos(c.rot),
            });
            const start = point(c.a0);
            g.moveTo(start.x, start.y);
            for (let i = 0; i < count; i++) {
              const a = c.a0 + sweep * i / count, b = c.a0 + sweep * (i + 1) / count;
              const p = point(a), q = point(b), u = tangent(a), v = tangent(b);
              const k = 4 / 3 * Math.tan((b - a) / 4);
              g.bezierCurveTo(p.x + k * u.x, p.y + k * u.y, q.x - k * v.x, q.y - k * v.y, q.x, q.y);
            }
          }
          break;
        case 'R':
          g.rect(c.x, c.y, c.w, c.h);
          break;
        case 'Z':
          g.closePath();
          break;
        default:
          break;
      }
    }
  }

  _gradientOf(paint) {
    if (!paint || typeof paint !== 'object' || (paint.kind !== 'linear' && paint.kind !== 'radial')) return null;
    const key = `${paint.kind}|${paint.coords.map((n) => Math.round(n * 100)).join(',')}|${paint.stops
      .map(([o, c]) => `${o}:${c}`)
      .join(',')}`;
    let grad = this.grads.get(key);
    if (!grad) {
      const stops = paint.stops.map(([offset, color]) => ({ offset, color }));
      grad =
        paint.kind === 'linear'
          ? new this.PIXI.FillGradient({
              type: 'linear',
              start: { x: paint.coords[0], y: paint.coords[1] },
              end: { x: paint.coords[2], y: paint.coords[3] },
              colorStops: stops,
              textureSpace: 'global',
              textureSize: 256,
            })
          : new this.PIXI.FillGradient({
              type: 'radial',
              center: { x: paint.coords[0], y: paint.coords[1] },
              outerCenter: { x: paint.coords[3], y: paint.coords[4] },
              innerRadius: paint.coords[2],
              outerRadius: paint.coords[5],
              colorStops: stops,
              textureSpace: 'global',
              textureSize: 256,
            });
      if (paint.kind === 'radial') {
        // Pixi 8.22 prepaints the last stop behind a radial gradient. With
        // transparent stops that leaves a flat dark veil under the vignette.
        // Keep Pixi's texture/transform, but repaint with Canvas semantics.
        grad.buildGradient();
        const canvas = grad.texture.source.resource;
        const ctx = canvas.getContext('2d');
        const [x0, y0, r0, x1, y1, r1] = paint.coords;
        const scale = canvas.width / (r1 * 2);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const radial = ctx.createRadialGradient((x0 - x1 + r1) * scale, (y0 - y1 + r1) * scale, r0 * scale,
          canvas.width / 2, canvas.height / 2, r1 * scale);
        for (const [offset, color] of paint.stops) radial.addColorStop(offset, color);
        ctx.fillStyle = radial;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        grad.texture.source.update();
      }
      if (this.grads.size >= 48) {
        // Só descarta gradientes que não foram usados nos últimos 2 quadros:
        // instruções do quadro corrente ainda apontam para seus objetos e um
        // destroy dentro do quadro deixa texture.source nulo no render.
        for (const [oldKey, oldGrad] of this.grads) {
          if (this.frame - (oldGrad.__frame ?? -99) < 2) continue;
          oldGrad?.destroy?.(true);
          this.grads.delete(oldKey);
          if (this.grads.size < 48) break;
        }
      }
      this.grads.set(key, grad);
    }
    grad.__frame = this.frame;
    return grad;
  }

  fillPath(cmds, paint, alpha) {
    const g = this._graph();
    this._path(g, cmds);
    const grad = this._gradientOf(paint);
    if (grad) {
      g.fill({ fill: grad, alpha });
    } else {
      // Cuidado com a chave 'fill' aqui: no Pixi vendado (8.22), fill({ fill:
      // '<css>', alpha }) ignora a cor e pinta branco (validado por repro com
      // extract e com o compositor). A chave 'color' aceita string hex e números.
      const { fill, alpha: colorAlpha } = colorOf(paint);
      g.fill({ color: fill, alpha: colorAlpha * alpha });
    }
  }

  strokePath(cmds, paint, alpha, lineWidth, cap) {
    const g = this._graph();
    this._path(g, cmds);
    const grad = this._gradientOf(paint);
    let style;
    if (grad) {
      style = { fill: grad, width: lineWidth, alpha, cap, join: 'miter' };
    } else {
      const { fill, alpha: colorAlpha } = colorOf(paint);
      style = { color: fill, width: lineWidth, alpha: colorAlpha * alpha, cap, join: 'miter' };
    }
    g.stroke(style);
  }

  drawImage(img, dx, dy, dw, dh, alpha) {
    this._dropGraph();
    let tex = this.texs.get(img);
    if (!tex) {
      tex = this.PIXI.Texture.from(img);
      this.texs.set(img, tex);
    }
    const sprite = this.spritePool.pop() ?? new this.PIXI.Sprite();
    sprite.__kind = 'sprite';
    sprite.texture = tex;
    sprite.position.set(dx, dy);
    sprite.width = dw;
    sprite.height = dh;
    sprite.alpha = alpha;
    this.host.addChild(sprite);
  }

  drawText(info) {
    this._dropGraph();
    const base = parseFont(info.font);
    const hasStroke = info.stroke != null && info.strokeWidth > 0;
    const key = [info.text, info.font, info.align, info.baseline, info.fill ?? '', hasStroke ? `${info.stroke}:${info.strokeWidth}` : ''].join(
      '|',
    );
    let text = this.texts.get(key);
    if (!text) {
      const style = {
        fontFamily: base.fontFamily,
        fontSize: base.fontSize,
        fontWeight: base.fontWeight,
        align: 'left',
        // Strings CSS entram cruas: o Color do Pixi preserva o alpha do rgba.
        fill: info.fill ? info.fill : 'rgba(0,0,0,0)',
      };
      if (hasStroke) style.stroke = { color: info.stroke, width: info.strokeWidth };
      text = new this.PIXI.Text({ text: info.text, style });
      text.anchor.set(ANCHOR_X[info.align] ?? 0, ANCHOR_Y[info.baseline] ?? 0.8);
      this.texts.set(key, text);
    }
    text.position.set(info.x, info.y);
    text.alpha = info.alpha;
    this.host.addChild(text);
  }
}

export async function createPixiScene({ canvas = null, width = 800, height = 600, resolution = 1, preference = 'webgl' } = {}) {
  const PIXI = await import(PIXI_URL);
  const app = new PIXI.Application();
  try {
  await app.init({
    canvas,
    width,
    height,
    resolution,
    autoDensity: true,
    backgroundAlpha: 0,
    antialias: true,
    autoStart: false,
    preference,
    // The native HTML controls own accessibility; this decorative layer must
    // not install Pixi's global Tab listener or create a second control tree.
    accessibilityOptions: { activateOnTab: false, enabledByDefault: false },
  });
  } catch (error) {
    try { app.destroy(true, { children: true }); } catch { /* Partially initialized renderer. */ }
    throw error;
  }
  // Desenho sob demanda: o loop do browser chama scene.render() por quadro.
  app.ticker.stop();
  // This scene is decorative and renders on the client's RAF. The vendored
  // Pixi scheduler otherwise keeps a second system ticker alive per mount.
  // Keep GC housekeeping on that same client frame, without global RAF work.
  app.renderer.events.setTargetElement(null);
  PIXI.Ticker.system.remove(app.renderer.scheduler._update, app.renderer.scheduler);
  app.stage.eventMode = 'none';
  app.stage.interactiveChildren = false;
  const adapter = new PixiPaintAdapter(PIXI, app.stage);
  const painter = new PaintRunner(adapter);
  return {
    app,
    canvas: app.canvas,
    painter,
    render(world, view, fx) {
      // WebGL context loss can make Pixi skip rendering without throwing.
      if (app.renderer.gl.isContextLost()) throw new Error('WebGL context lost');
      app.renderer.scheduler._update();
      painter.reset();
      drawScene(painter, world, view, fx);
      app.renderer.render(app.stage);
    },
    resize(width, height, res) {
      app.renderer.resize(width, height, res);
      app.ticker.stop();
    },
    destroy() {
      try { adapter.destroy(); } finally { app.destroy(true, { children: true }); }
    },
  };
}
