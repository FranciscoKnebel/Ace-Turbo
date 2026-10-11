import { wrapText } from './layout.js';
import { drawContain, media } from '../media.js';
import { t } from '../i18n.js';
import { drawIcon, icon } from '../icons.js';
import { C } from './palette.js';
export function drawHelp(ctx, v, page = 0) {
  ctx.fillStyle = '#07211a';
  ctx.fillRect(0, 0, v.width, v.height);
  ctx.fillStyle = 'rgba(2,6,23,0.55)';
  ctx.fillRect(0, 0, v.width, v.height);
  const narrow = v.width < 600;
  const smallLogo = narrow || v.height < 400;
  drawContain(ctx, media.logoShort, smallLogo ? v.width - 28 : v.width - 66, smallLogo ? 32 : 56, smallLogo ? 40 : 88, smallLogo ? 40 : 88, 0.9);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = narrow ? 'bold 26px system-ui, sans-serif' : 'bold 40px system-ui, sans-serif';
  ctx.fillStyle = C.ball;
  ctx.fillText(t('help.title'), narrow ? v.cx - 24 : v.cx, Math.min(52, v.height * 0.08), narrow ? v.width - 96 : v.width - 180);

  const columns = [
    [
      {
        title: t('help.controls.title'),
        lines: [
          t('help.controls.p1'),
          t('help.controls.p2'),
          t('help.controls.menu'),
          t('help.controls.game'),
        ],
      },
      {
        title: t('help.shots.title'),
        lines: [
          { icon: 'shot-flat', text: t('help.shots.flat') },
          { icon: 'shot-topspin', text: t('help.shots.topspin') },
          { icon: 'shot-slice', text: t('help.shots.slice') },
          { icon: 'shot-lob', text: t('help.shots.lob') },
          t('help.shots.hand'),
          { icon: 'turbo', text: t('help.shots.turbo') },
        ],
      },
      {
        title: t('help.serve.title'),
        lines: [
          { icon: 'serve-flat', text: t('help.serve.flat') },
          { icon: 'serve-flat-plus', text: t('help.serve.power') },
          t('help.serve.release'),
          t('help.serve.fault'),
          t('help.serve.let'),
        ],
      },
    ],
    [
      {
        title: t('help.strokes.title'),
        lines: [
          t('help.strokes.forehand'),
          t('help.strokes.backhand'),
          t('help.strokes.volley'),
          t('help.strokes.smash'),
          t('help.strokes.halfvolley'),
          t('help.strokes.return'),
        ],
      },
      {
        title: t('help.score.title'),
        lines: [
          t('help.score.points'),
          t('help.score.game'),
          t('help.score.set'),
          { icon: 'tiebreak', text: t('help.score.tiebreak') },
          t('help.score.match'),
        ],
      },
      {
        title: t('help.rules.title'),
        lines: [
          t('help.rules.bounce'),
          { icon: 'net', text: t('help.rules.out') },
          t('help.rules.double'),
          t('help.rules.receiver'),
          t('help.rules.partner'),
          t('help.rules.ends'),
          { icon: 'stamina', text: t('help.rules.stamina') },
        ],
      },
    ],
  ];

  const count = v.width >= 1000 ? 2 : 1;
  const colW = (v.width - 64 - (count - 1) * 24) / count;
  const lineH = 21, top = 80;
  const capacity = Math.max(1, Math.floor((v.height - top - 60) / lineH));
  const lines = [];
  for (const section of columns.flat()) {
    ctx.font = 'bold 17px system-ui, sans-serif';
    for (const text of wrapText(ctx, section.title, colW)) lines.push({ text, title: true });
    ctx.font = '14px system-ui, sans-serif';
    for (const line of section.lines) {
      const entry = typeof line === 'string' ? { text: line } : line;
      const wrapped = wrapText(ctx, entry.text, colW - 24);
      wrapped.forEach((text, i) => lines.push({ text, icon: i === 0 ? entry.icon : null }));
    }
    lines.push({ text: '' });
  }
  const pages = Math.max(1, Math.ceil(lines.length / (capacity * count)));
  const offset = ((page % pages) + pages) % pages * capacity * count;
  lines.slice(offset, offset + capacity * count).forEach((line, i) => {
    const x = 32 + Math.floor(i / capacity) * (colW + 24);
    const y = top + i % capacity * lineH;
    ctx.textAlign = 'left'; ctx.font = line.title ? 'bold 17px system-ui, sans-serif' : '14px system-ui, sans-serif';
    ctx.fillStyle = line.title ? C.ball : C.text;
    if (line.icon) drawIcon(ctx, icon(line.icon), x + 9, y, 20, 0.95);
    ctx.fillText(line.text, x + (line.title ? 0 : 24), y);
  });
  ctx.textAlign = 'center'; ctx.font = 'bold 14px system-ui, sans-serif'; ctx.fillStyle = C.dim;
  ctx.fillText(t('help.back'), v.cx, v.height - 36, v.width - 32);
  if (pages > 1) ctx.fillText(`← / →  ${Math.floor(offset / (capacity * count)) + 1} / ${pages}`, v.cx, v.height - 16);
  return pages;
}

