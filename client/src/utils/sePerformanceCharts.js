/* ============================================================================
   SE Performance — the charts, as plain SVG strings.

   No library. Marks follow the data-viz house rules: bars capped at 24px with a
   4px rounded cap and a 2px surface gap in a stack, 2px lines with >=8px end
   markers ringed in the surface colour, a solid hairline grid, a legend
   whenever there is more than one series, and TEXT IN INK TOKENS rather than in
   the series colour. Every mark carries a <title>, which is the hover layer.

   NEVER a dual axis. Two measures of different scale are two charts — the
   alignment of two y-scales is arbitrary and invents a correlation that is not
   in the data.

   The palette is the validated categorical set (blue / orange / aqua), checked
   against this card's own surfaces in both themes. Aqua is sub-3:1 on the light
   surface, which obliges relief — the breakdown table above the charts is that
   relief, and every line also carries a direct end label.
   ========================================================================= */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const VW = 660;                                  // viewBox width of a half-width chart
const niceMax = (v) => {
  if (v <= 0) return 1;
  const e = 10 ** Math.floor(Math.log10(v)); const m = v / e;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e;
};
const ticksOf = (max, n = 4) => Array.from({ length: n + 1 }, (_, i) => (max * i) / n);
/** a bar with a rounded cap and a square foot */
const barPath = (x, y, w, h, r0) => {
  const r = Math.max(0, Math.min(r0, w / 2, h));
  return `M${x},${y + h}L${x},${y + r}Q${x},${y} ${x + r},${y}L${x + w - r},${y}Q${x + w},${y} ${x + w},${y + r}L${x + w},${y + h}Z`;
};
const sq = (x, y, w, h) => `M${x},${y}h${w}v${h}h${-w}Z`;
/** x labels thin out rather than collide */
const labelEvery = (n) => (n <= 8 ? 1 : n <= 14 ? 2 : n <= 22 ? 3 : Math.ceil(n / 8));

function chartFrame(H, max, cats, fmtY) {
  const pad = { l: 44, r: 52, t: 12, b: 28 };
  const pw = VW - pad.l - pad.r; const ph = H - pad.t - pad.b;
  const y = (v) => pad.t + ph - (v / max) * ph;
  let g = '';
  ticksOf(max).forEach((t) => {
    g += `<line x1="${pad.l}" x2="${VW - pad.r}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="var(--viz-grid)" stroke-width="1"/>`
      + `<text x="${pad.l - 7}" y="${(y(t) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--viz-mut)">${fmtY(t)}</text>`;
  });
  g += `<line x1="${pad.l}" x2="${VW - pad.r}" y1="${pad.t + ph}" y2="${pad.t + ph}" stroke="var(--viz-base)" stroke-width="1"/>`;
  const step = labelEvery(cats.length); const band = pw / cats.length;
  cats.forEach((c, i) => {
    if (i % step) return;
    g += `<text x="${(pad.l + band * (i + 0.5)).toFixed(1)}" y="${H - 9}" text-anchor="middle" font-size="10" fill="var(--viz-mut)">${esc(c)}</text>`;
  });
  return { pad, pw, ph, y, band, g };
}

/** Columns — one series, or several stacked. One y axis, always. */
export function colChart(cats, series, opts = {}) {
  const H = opts.h || 168;
  const totals = cats.map((_, i) => series.reduce((a, s) => a + (s.values[i] || 0), 0));
  const max = niceMax(Math.max(opts.target || 0, ...totals) * 1.08) || 1;
  const F = chartFrame(H, max, cats, opts.fmtY || ((v) => Math.round(v)));
  const bw = Math.min(24, Math.max(3, F.band - 6));
  let m = '';
  cats.forEach((c, i) => {
    let acc = 0;
    series.forEach((s, si) => {
      const v = s.values[i] || 0;
      if (v <= 0) { acc += v; return; }
      const y0 = F.y(acc + v); const y1 = F.y(acc);
      const gap = si < series.length - 1 ? 2 : 0;          // 2px surface gap in a stack
      const h = Math.max(1, y1 - y0 - gap);
      const x = F.pad.l + F.band * (i + 0.5) - bw / 2;
      const top = si === series.length - 1;
      m += `<path d="${top ? barPath(x, y0, bw, h, 4) : sq(x, y0 + gap, bw, h)}" fill="${s.color}">`
        + `<title>${esc(c)} · ${esc(s.name)}: ${esc(opts.fmtV ? opts.fmtV(v) : Math.round(v))}</title></path>`;
      acc += v;
    });
  });
  let t = '';
  if (opts.target) {
    const ty = F.y(opts.target);
    t = `<line x1="${F.pad.l}" x2="${VW - F.pad.r}" y1="${ty.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="var(--viz-ink)" stroke-width="1" stroke-dasharray="5 3" opacity=".55"/>`
      + `<text x="${VW - F.pad.r}" y="${(ty - 5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="var(--viz-mut)">${esc(opts.targetLabel || 'target')}</text>`;
  }
  return `<svg viewBox="0 0 ${VW} ${H}" role="img" aria-label="${esc(opts.aria || '')}">${F.g}${m}${t}</svg>`;
}

/** Lines — every series on ONE scale, each direct-labelled at its end. */
export function lineChart(cats, series, opts = {}) {
  const H = opts.h || 168;
  const max = opts.max || niceMax(Math.max(...series.flatMap((s) => s.values)) * 1.12) || 1;
  const F = chartFrame(H, max, cats, opts.fmtY || ((v) => Math.round(v)));
  const px = (i) => F.pad.l + F.band * (i + 0.5);
  let m = '';
  if (opts.ref != null) {
    const ry = F.y(opts.ref);
    m += `<line x1="${F.pad.l}" x2="${VW - F.pad.r}" y1="${ry.toFixed(1)}" y2="${ry.toFixed(1)}" stroke="var(--viz-ink)" stroke-width="1" stroke-dasharray="5 3" opacity=".55"/>`
      + `<text x="${VW - F.pad.r}" y="${(ry - 5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="var(--viz-mut)">${esc(opts.refLabel || 'target')}</text>`;
  }
  series.forEach((s) => {
    const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${F.y(v).toFixed(1)}`).join('');
    m += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    s.values.forEach((v, i) => {
      m += `<circle cx="${px(i).toFixed(1)}" cy="${F.y(v).toFixed(1)}" r="7" fill="transparent">`
        + `<title>${esc(cats[i])} · ${esc(s.name)}: ${esc(opts.fmtV ? opts.fmtV(v) : v.toFixed(1))}</title></circle>`;
    });
    const li = s.values.length - 1;
    m += `<circle cx="${px(li).toFixed(1)}" cy="${F.y(s.values[li]).toFixed(1)}" r="4.5" fill="${s.color}" stroke="var(--viz-surf)" stroke-width="2"/>`;
  });
  // one end label per series, in INK — never in the series colour. Pushed apart
  // only as far as needed, with a leader when moved, so a label never floats
  // free of its own line.
  const li2 = cats.length - 1;
  const ends = series.map((s) => ({ s, y0: F.y(s.values[li2]), v: s.values[li2] })).sort((a, b) => a.y0 - b.y0);
  let prev = F.pad.t;
  ends.forEach((e) => { e.y = Math.max(e.y0, prev + 11); prev = e.y; });
  ends.forEach((e) => {
    const lx = px(li2) + 8;
    if (Math.abs(e.y - e.y0) > 2) {
      m += `<path d="M${(px(li2) + 5).toFixed(1)},${e.y0.toFixed(1)}L${lx.toFixed(1)},${e.y.toFixed(1)}" stroke="${e.s.color}" stroke-width="1" fill="none" opacity=".7"/>`;
    }
    m += `<text x="${(lx + 2).toFixed(1)}" y="${(e.y + 3.5).toFixed(1)}" font-size="9.5" fill="var(--viz-ink)" font-weight="600">${esc(opts.fmtV ? opts.fmtV(e.v) : e.v.toFixed(1))}</text>`;
  });
  return `<svg viewBox="0 0 ${VW} ${H}" role="img" aria-label="${esc(opts.aria || '')}">${F.g}${m}</svg>`;
}
