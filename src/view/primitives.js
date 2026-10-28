import { C } from './palette.js';
import { project } from './camera.js';
export function poly(ctx, points, fill, stroke = null, width = 1) {
  const pts = points.filter(Boolean);
  if (pts.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}


export function line3(ctx, view, a, b, color = C.line, width = 2) {
  const pa = project(view, a.x, a.y, a.z ?? 0);
  const pb = project(view, b.x, b.y, b.z ?? 0);
  if (!pa || !pb) return;
  ctx.beginPath();
  ctx.moveTo(pa.x, pa.y);
  ctx.lineTo(pb.x, pb.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}


export function fillRect3(ctx, view, x0, x1, y0, y1, fill) {
  poly(
    ctx,
    [
      project(view, x0, y0, 0),
      project(view, x1, y0, 0),
      project(view, x1, y1, 0),
      project(view, x0, y1, 0),
    ],
    fill,
  );
}


export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}


// Elipse com borda difusa: gradiente radial quando disponível (navegador) e
// elipse translúcida plana como fallback (contexto falsificado nos testes).

export function softEllipse(ctx, x, y, rx, ry, rgb = '0,0,0', strength = 0.45) {
  if (rx <= 0 || ry <= 0) return;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  const g = ctx.createRadialGradient && ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  if (g?.addColorStop) {
    g.addColorStop(0, `rgba(${rgb},${strength})`);
    g.addColorStop(0.65, `rgba(${rgb},${strength * 0.55})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = `rgba(${rgb},${strength * 0.7})`;
  }
  ctx.fill();
}


export function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(2,6,23,0.72)';
  ctx.strokeStyle = 'rgba(148,163,184,0.35)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
}

