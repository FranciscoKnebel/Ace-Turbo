// Pintor com subconjunto de semântica Canvas 2D que o desenho da cena usa
// (fill/stroke comPaths, retângulos, elipses, gradientes lineares e radiais,
// texto com strokeText+fillText emparelhados, drawImage de ícones e pilha de
// save/translate/restore). Emitirá primitivas num adaptador injetado entre
// beginPath e fill/stroke; no modo WebGL o adaptador é o PixiJS (scene.js) e
// tudo pode ser testado com um adaptador que apenas grava chamadas.

// Fatia o comprimento total em segmentos alternando traço e intervalo,
// percorrendo o padrão do setLineDash (a cena usa [4, 4]).

function* dashSlices(total, pattern) {
  let s = 0;
  let i = 0;
  while (s < total - 1e-9) {
    const seg = Math.max(0.001, Math.min(pattern[i % pattern.length], total - s));
    yield { start: s, end: s + seg, on: i % 2 === 0 };
    s += seg;
    i += 1;
  }
}

function pointOnEllipse(x, y, rx, ry, rot, t) {
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  const ex = rx * Math.cos(t);
  const ey = ry * Math.sin(t);
  return { x: x + ex * cosR - ey * sinR, y: y + ex * sinR + ey * cosR };
}

// Recorta o buffer de comandos aplicado (coords de tela) em traços. Arcos e
// elipses viram sub-arcos, cada um precedido de um moveTo no seu ponto de
// partida (evita linha de conexão atravessando o intervalo). Curvas de
// controle e retângulos passam intatos (traço sólido).
function dashify(cmds, pattern) {
  const cycle = pattern.reduce((s, v) => s + Math.abs(v), 0);
  if (!(cycle > 0)) return cmds;
  const out = [];
  let cursor = null;
  for (const c of cmds) {
    switch (c.m) {
      case 'M': {
        cursor = { x: c.x, y: c.y };
        out.push(c);
        break;
      }
      case 'L': {
        if (cursor) {
          const dx = c.x - cursor.x;
          const dy = c.y - cursor.y;
          const len = Math.hypot(dx, dy);
          if (len > 1e-6) {
            const ux = dx / len;
            const uy = dy / len;
            for (const sl of dashSlices(len, pattern)) {
              if (!sl.on) continue;
              out.push({ m: 'M', x: cursor.x + ux * sl.start, y: cursor.y + uy * sl.start });
              out.push({ m: 'L', x: cursor.x + ux * sl.end, y: cursor.y + uy * sl.end });
            }
          } else {
            out.push(c);
          }
        } else {
          out.push(c);
        }
        cursor = { x: c.x, y: c.y };
        break;
      }
      case 'A': {
        const dir = c.ccw ? -1 : 1;
        let sweep = (c.a1 - c.a0) * dir;
        while (sweep < 0) sweep += Math.PI * 2;
        // Comprimento de arco tratado como círculo perfeito (r constante).
        for (const sl of dashSlices(sweep * c.r, pattern)) {
          if (!sl.on) continue;
          const a0 = c.a0 + dir * (sl.start / c.r);
          const a1 = c.a0 + dir * (sl.end / c.r);
          out.push({ m: 'M', x: c.x + c.r * Math.cos(a0), y: c.y + c.r * Math.sin(a0) });
          out.push({ m: 'A', x: c.x, y: c.y, r: c.r, a0, a1, ccw: c.ccw });
        }
        cursor = { x: c.x + c.r * Math.cos(c.a1), y: c.y + c.r * Math.sin(c.a1) };
        break;
      }
      case 'E': {
        const dir = c.ccw ? -1 : 1;
        let sweep = (c.a1 - c.a0) * dir;
        while (sweep < 0) sweep += Math.PI * 2;
        // Perímetro aproximado de elipse (Ramanujan curto) para o passo.
        const h = ((c.rx - c.ry) / (c.rx + c.ry)) ** 2;
        const per = Math.PI * (c.rx + c.ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h))) || (c.rx + c.ry) * Math.PI;
        for (const sl of dashSlices((sweep / (Math.PI * 2)) * per, pattern)) {
          if (!sl.on) continue;
          const t0 = c.a0 + dir * ((sl.start * (Math.PI * 2)) / per);
          const t1 = c.a0 + dir * ((sl.end * (Math.PI * 2)) / per);
          const p0 = pointOnEllipse(c.x, c.y, c.rx, c.ry, c.rot, t0);
          out.push({ m: 'M', x: p0.x, y: p0.y });
          out.push({ m: 'E', x: c.x, y: c.y, rx: c.rx, ry: c.ry, rot: c.rot, a0: t0, a1: t1, ccw: c.ccw });
        }
        cursor = pointOnEllipse(c.x, c.y, c.rx, c.ry, c.rot, c.a1);
        break;
      }
      default:
        out.push(c);
        if (c.x !== undefined && c.y !== undefined) cursor = { x: c.x, y: c.y };
    }
  }
  return out;
}

export class PaintRunner {
  constructor(adapter) {
    this.adapter = adapter;
    this.reset();
  }

  reset() {
    this.adapter.reset();
    this.stack = [
      {
        tx: 0,
        ty: 0,
        alpha: 1,
        fillStyle: '#000000',
        strokeStyle: '#000000',
        lineWidth: 1,
        lineCap: 'butt',
        font: '10px sans-serif',
        textAlign: 'left',
        textBaseline: 'alphabetic',
        lineDash: [],
      },
    ];
    this.state = { ...this.stack[0] };
    this.path = [];
    this.pendingStrokeText = null;
    this._tx = this.stack[0].tx;
    this._ty = this.stack[0].ty;
  }

  get top() {
    return this.state;
  }

  save() {
    this.stack.push({ ...this.state });
    return this;
  }

  restore() {
    if (this.stack.length > 1) this.state = this.stack.pop();
    return this;
  }

  translate(x, y) {
    this.state.tx += x;
    this.state.ty += y;
    return this;
  }

  // ---- estado de estilo (setado como no ctx 2D) ----
  get fillStyle() {
    return this.state.fillStyle;
  }
  set fillStyle(value) {
    this.state.fillStyle = value;
  }
  get strokeStyle() {
    return this.state.strokeStyle;
  }
  set strokeStyle(value) {
    this.state.strokeStyle = value;
  }
  get lineWidth() {
    return this.state.lineWidth;
  }
  set lineWidth(value) {
    this.state.lineWidth = value;
  }
  get lineCap() {
    return this.state.lineCap;
  }
  set lineCap(value) {
    this.state.lineCap = value;
  }
  get globalAlpha() {
    return this.state.alpha;
  }
  set globalAlpha(value) {
    this.state.alpha = value;
  }
  get font() {
    return this.state.font;
  }
  set font(value) {
    this.state.font = value;
  }
  get textAlign() {
    return this.state.textAlign;
  }
  set textAlign(value) {
    this.state.textAlign = value;
  }
  get textBaseline() {
    return this.state.textBaseline;
  }
  set textBaseline(value) {
    this.state.textBaseline = value;
  }

  // ---- gradientes (coordenadas já na tela: o desenho da cena só cria
  // gradientes sem translate pendente) ----
  createLinearGradient(x0, y0, x1, y1) {
    return this.adapter.createLinearGradient(x0 + this.state.tx, y0 + this.state.ty, x1 + this.state.tx, y1 + this.state.ty);
  }

  createRadialGradient(x0, y0, r0, x1, y1, r1) {
    return this.adapter.createRadialGradient(
      x0 + this.state.tx,
      y0 + this.state.ty,
      r0,
      x1 + this.state.tx,
      y1 + this.state.ty,
      r1,
    );
  }

  // ---- paths ----
  beginPath() {
    this.path = [];
    return this;
  }

  moveTo(x, y) {
    this.path.push({ m: 'M', x: x + this.state.tx, y: y + this.state.ty });
    return this;
  }

  lineTo(x, y) {
    this.path.push({ m: 'L', x: x + this.state.tx, y: y + this.state.ty });
    return this;
  }

  quadraticCurveTo(cx, cy, x, y) {
    this.path.push({ m: 'Q', cx: cx + this.state.tx, cy: cy + this.state.ty, x: x + this.state.tx, y: y + this.state.ty });
    return this;
  }

  bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
    this.path.push({
      m: 'C',
      c1x: c1x + this.state.tx,
      c1y: c1y + this.state.ty,
      c2x: c2x + this.state.tx,
      c2y: c2y + this.state.ty,
      x: x + this.state.tx,
      y: y + this.state.ty,
    });
    return this;
  }

  arc(x, y, radius, startAngle, endAngle, anticlockwise = false) {
    this.path.push({ m: 'A', x: x + this.state.tx, y: y + this.state.ty, r: radius, a0: startAngle, a1: endAngle, ccw: anticlockwise });
    return this;
  }

  ellipse(x, y, rx, ry, rotation = 0, startAngle = 0, endAngle = Math.PI * 2, anticlockwise = false) {
    this.path.push({ m: 'E', x: x + this.state.tx, y: y + this.state.ty, rx, ry, rot: rotation, a0: startAngle, a1: endAngle, ccw: anticlockwise });
    return this;
  }

  arcTo(x1, y1, x2, y2, radius) {
    this.path.push({ m: 'AT', x1: x1 + this.state.tx, y1: y1 + this.state.ty, x2: x2 + this.state.tx, y2: y2 + this.state.ty, r: radius });
    return this;
  }

  rect(x, y, width, height) {
    this.path.push({ m: 'R', x: x + this.state.tx, y: y + this.state.ty, w: width, h: height });
    return this;
  }

  closePath() {
    this.path.push({ m: 'Z' });
    return this;
  }

  // pintura do path atual; o buffer permanece até beginPath (como no 2D,
  // permite fill e stroke da mesma forma)
  fill() {
    if (this.path.length === 0) return;
    this.adapter.fillPath([...this.path], this.state.fillStyle, this.state.alpha);
    return this;
  }

  stroke() {
    if (this.path.length === 0) return;
    const dash = this.state.lineDash ?? [];
    const cmds = dash.length > 0 ? dashify(this.path, dash) : this.path;
    this.adapter.strokePath([...cmds], this.state.strokeStyle, this.state.alpha, this.state.lineWidth, this.state.lineCap);
    return this;
  }

  // setLineDash é método no Canvas 2D; entra no estado (save/restore cobrem).
  setLineDash(segments) {
    this.state.lineDash = Array.isArray(segments) ? segments.slice() : [];
    return this;
  }

  getLineDash() {
    return (this.state.lineDash ?? []).slice();
  }

  fillRect(x, y, width, height) {
    this.adapter.fillPath([{ m: 'R', x: x + this.state.tx, y: y + this.state.ty, w: width, h: height }], this.state.fillStyle, this.state.alpha);
    return this;
  }

  strokeRect(x, y, width, height) {
    this.adapter.strokePath(
      [{ m: 'R', x: x + this.state.tx, y: y + this.state.ty, w: width, h: height }],
      this.state.strokeStyle,
      this.state.alpha,
      this.state.lineWidth,
      this.state.lineCap,
    );
    return this;
  }

  // ---- texto: fillText simples, com strokeText anterior empareado quando
  // coincide text/font/x/y (o código da cena sempre usa esse par) ----
  strokeText(text, x, y) {
    this.pendingStrokeText = {
      text,
      x: x + this.state.tx,
      y: y + this.state.ty,
      font: this.state.font,
      align: this.state.textAlign,
      baseline: this.state.textBaseline,
      stroke: this.state.strokeStyle,
      strokeWidth: this.state.lineWidth,
      alpha: this.state.alpha,
    };
    return this;
  }

  fillText(text, x, y) {
    const px = x + this.state.tx;
    const py = y + this.state.ty;
    const pend = this.pendingStrokeText;
    this.pendingStrokeText = null;
    const matches =
      pend &&
      pend.text === text &&
      pend.x === px &&
      pend.y === py &&
      pend.font === this.state.font &&
      pend.align === this.state.textAlign &&
      pend.baseline === this.state.textBaseline;
    if (pend && !matches) {
      // stroke sem par: sai como texto só com contorno
      this.adapter.drawText({ ...pend, fill: null });
    }
    const base = {
      text,
      x: px,
      y: py,
      font: this.state.font,
      align: this.state.textAlign,
      baseline: this.state.textBaseline,
      alpha: this.state.alpha,
      fill: this._textColor(),
      stroke: null,
      strokeWidth: 0,
    };
    if (matches) {
      this.adapter.drawText({ ...base, stroke: pend.stroke, strokeWidth: pend.strokeWidth });
      return this;
    }
    this.adapter.drawText(base);
    return this;
  }

  // fill de texto recebe cor sólida: quando o fillStyle é gradiente, usa o
  // stop do meio como aproximação (texto da cena não usa gradiente).
  _textColor() {
    const style = this.state.fillStyle;
    if (typeof style === 'string') return style;
    if (style && typeof style === 'object' && Array.isArray(style.stops)) {
      const mid = style.stops[Math.floor((style.stops.length - 1) / 2)];
      return (mid && mid[1]) ?? '#ffffff';
    }
    return '#ffffff';
  }

  // ---- imagens (ícones de ação e marcador de stamina) ----
  drawImage(img, dx, dy, dw, dh) {
    this.adapter.drawImage(img, dx + this.state.tx, dy + this.state.ty, dw, dh, this.state.alpha);
    return this;
  }
}
