// Text wrapping uses real canvas metrics and keeps long tokens inside the column.
export function wrapText(ctx, text, width) {
  const lines = []; let current = '';
  for (const word of String(text).split(/\s+/)) {
    if (ctx.measureText((current ? current + ' ' : '') + word).width <= width) { current += (current ? ' ' : '') + word; continue; }
    if (current) lines.push(current); current = '';
    for (const char of word) {
      if (current && ctx.measureText(current + char).width > width) { lines.push(current); current = ''; }
      current += char;
    }
  }
  if (current) lines.push(current);
  return lines;
}
export const compactScreen = v => v.width < 600 || v.height < 600;
