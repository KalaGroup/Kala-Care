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

/** A value the data actually HAS.

    A series may carry gaps, and they are not zeroes: HR has not uploaded every
    month's attendance, and the MaxTTR file does not name every engineer. A
    chart that plots a missing month at the floor draws a collapse that never
    happened, and one that hands null to a caller's formatter takes the page
    down with it — which is exactly what it did.

    So: a non-finite value is MISSING. It breaks the line rather than dropping
    it, it gets no hover dot, and it is never passed to fmtV or fmtY. Those two
    callbacks are guaranteed a finite number, and may format without guarding. */
const has = (v) => v !== null && v !== undefined && Number.isFinite(+v);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* viewBox width. The four charts sit ONE PER ROW at the full width of the
   report, so this is wide: a month is 31 categories, and at 660 they had 19px
   each - too narrow for a bar, and narrow enough that only every fourth day
   could be labelled. The height stays where it was, so the aspect ratio does
   the work: 1320 x 168 renders about 180px tall in a 1400px column, where 660
   would have been 356px and swallowed the page. */
const VW = 1320;
const niceMax = (v) => {
  if (v <= 0) return 1;
  const e = 10 ** Math.floor(Math.log10(v)); const m = v / e;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e;
};
const ticksOf = (min, max, n = 4) =>
  Array.from({ length: n + 1 }, (_, i) => min + ((max - min) * i) / n);
/** a bar with a rounded cap and a square foot */
const barPath = (x, y, w, h, r0) => {
  const r = Math.max(0, Math.min(r0, w / 2, h));
  return `M${x},${y + h}L${x},${y + r}Q${x},${y} ${x + r},${y}L${x + w - r},${y}Q${x + w},${y} ${x + w},${y + r}L${x + w},${y + h}Z`;
};
const sq = (x, y, w, h) => `M${x},${y}h${w}v${h}h${-w}Z`;
/** x labels thin out rather than collide - on the WIDTH each one has, not on
    how many there are. '31 Jul' needs about 38px; give the categories 38px each
    and every day of the month is labelled, which is the whole point of the
    charts being full width. */
const labelEvery = (band) => Math.max(1, Math.ceil(38 / Math.max(1, band)));

/** min defaults to 0, which is the only honest floor for a COUNT or an AMOUNT:
    a bar chart that starts at 40 makes a 5% difference look like a doubling.
    It is passed non-zero only for a scale where zero is not a quantity at all —
    a CLOCK, where the zero is midnight and an axis from midnight spends
    two-thirds of the chart on hours nobody works and flattens the half-hour
    that matters into nothing. */
function chartFrame(H, max, cats, fmtY, min = 0) {
  const span = (max - min) || 1;
  const ticks = ticksOf(min, max);
  /* A LABEL THAT REPEATS IS NOT A LABEL. On a small-money chart the y axis read
     '0.1 0.1 0.1 0.0 0.0', because one decimal cannot separate 0.05 from 0.10 —
     five gridlines carrying three distinct numbers. The caller's own formatter
     is tried first; where it collapses two ticks into one string, precision
     rises until every tick reads differently. */
  let labels = ticks.map((t) => String(fmtY(t)));
  if (new Set(labels).size < ticks.length) {
    for (const dp of [1, 2, 3, 4]) {
      const t = ticks.map((v) => v.toFixed(dp));
      if (new Set(t).size === ticks.length) { labels = t; break; }
    }
  }
  /* THE GUTTER IS AS WIDE AS THE WIDEST LABEL. It was a flat 44px, which fits
     '100' and '12.5' and clips anything longer against the left edge of the
     viewBox — a clock axis lost the '1' off '10:00 AM' and printed '0:00 AM',
     a time that is not on the chart and that nobody works at. 5.9px per
     character is the measured advance of this font at 10px, and 44 stays the
     floor so every numeric chart keeps the proportions it had. */
  const wide = Math.max(...labels.map((t) => t.length));
  const pad = { l: Math.max(44, Math.ceil(wide * 5.9) + 11), r: 52, t: 12, b: 28 };
  const pw = VW - pad.l - pad.r; const ph = H - pad.t - pad.b;
  const y = (v) => pad.t + ph - ((v - min) / span) * ph;
  let g = '';
  ticks.forEach((t, i) => {
    g += `<line x1="${pad.l}" x2="${VW - pad.r}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="var(--viz-grid)" stroke-width="1"/>`
      + `<text x="${pad.l - 7}" y="${(y(t) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--viz-mut)">${esc(labels[i])}</text>`;
  });
  g += `<line x1="${pad.l}" x2="${VW - pad.r}" y1="${pad.t + ph}" y2="${pad.t + ph}" stroke="var(--viz-base)" stroke-width="1"/>`;
  const band = pw / cats.length; const step = labelEvery(band);
  cats.forEach((c, i) => {
    if (i % step) return;
    g += `<text x="${(pad.l + band * (i + 0.5)).toFixed(1)}" y="${H - 9}" text-anchor="middle" font-size="10" fill="var(--viz-mut)">${esc(c)}</text>`;
  });
  return { pad, pw, ph, y, band, g };
}

/** Columns — one series, several STACKED, or several SIDE BY SIDE. One y axis,
    always.

    `grouped: true` puts each series in its own bar within the category's band
    instead of stacking them. Stacking answers 'what did the two come to
    together'; grouping answers 'how did the two compare' — and for spare
    against labour that is the question, because they are two commitments with
    two targets, not one total. The y scale follows: stacked measures the sum,
    grouped measures the tallest single bar. */
export function colChart(cats, series, opts = {}) {
  const H = opts.h || 168;
  const val = (s, i) => (has(s.values[i]) ? +s.values[i] : 0);
  const peaks = cats.map((_, i) => (opts.grouped
    ? Math.max(0, ...series.map((s) => val(s, i)))
    : series.reduce((a, s) => a + val(s, i), 0)));
  /* A BAR NORMALLY GROWS FROM ZERO, and for a count or an amount that is the
     only honest floor. A CLOCK has no such zero: midnight is not a quantity, so
     bars measured from it are all the same length to the eye - 9:30 and 10:30
     differ by 4% of the day. `min` moves the floor to a whole hour under the
     earliest reading, and then the bar's TOP is what is being read, against the
     dashed line the commitment sets. The x axis is still labelled, the value is
     still on the bar, and nothing is implied about the length. */
  const min = has(opts.min) ? +opts.min : 0;
  const max = opts.max || niceMax(Math.max(opts.target || 0, ...peaks) * 1.08) || 1;
  const F = chartFrame(H, max, cats, opts.fmtY || ((v) => Math.round(v)), min);
  const n = series.length || 1;
  const slot = Math.min(24, Math.max(2, (F.band - 6) / (opts.grouped ? n : 1)));
  const bw = slot;
  const pitch = bw + (n > 1 ? 1.5 : 0);                  // a hairline between neighbours
  const groupW = opts.grouped ? bw * n + 1.5 * (n - 1) : bw;
  let m = '';
  cats.forEach((c, i) => {
    let acc = 0;
    series.forEach((s, si) => {
      if (!has(s.values[i])) return;
      const v = +s.values[i];
      if (v <= min) { if (!opts.grouped) acc += v; return; }
      const tip = `<title>${esc(c)} · ${esc(s.name)}: `
        + `${esc(opts.fmtV ? opts.fmtV(v) : Math.round(v))}</title>`;
      if (opts.grouped) {
        const y0 = F.y(v);
        const h = Math.max(1, F.y(min) - y0);
        const x = F.pad.l + F.band * (i + 0.5) - groupW / 2 + si * pitch;
        m += `<path d="${barPath(x, y0, bw, h, Math.min(3, bw / 2))}" fill="${s.color}">${tip}</path>`;
        return;
      }
      const y0 = F.y(acc + v); const y1 = F.y(acc || min);
      const gap = si < series.length - 1 ? 2 : 0;          // 2px surface gap in a stack
      const h = Math.max(1, y1 - y0 - gap);
      const x = F.pad.l + F.band * (i + 0.5) - bw / 2;
      const top = si === series.length - 1;
      m += `<path d="${top ? barPath(x, y0, bw, h, 4) : sq(x, y0 + gap, bw, h)}" fill="${s.color}">${tip}</path>`;
      acc += v;
    });
  });
  let t = '';
  if (opts.target) {
    const ty = F.y(opts.target);
    /* THE LABEL SITS IN THE RIGHT MARGIN, not over the plot. Anchored at the
       plot's right edge it lay across whichever bars reach that far — on the
       clock chart '10:00 AM' printed straight through the last three mornings.
       The margin beside a column chart is empty, and level with the line the
       label reads as belonging to it. */
    t = `<line x1="${F.pad.l}" x2="${VW - F.pad.r}" y1="${ty.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="var(--viz-ink)" stroke-width="1" stroke-dasharray="5 3" opacity=".55"/>`
      + `<text x="${(VW - F.pad.r + 5).toFixed(1)}" y="${(ty + 3.4).toFixed(1)}" text-anchor="start" font-size="9.5" fill="var(--viz-mut)">${esc(opts.targetLabel || 'target')}</text>`;
  }
  return `<svg viewBox="0 0 ${VW} ${H}" role="img" aria-label="${esc(opts.aria || '')}">${F.g}${m}${t}</svg>`;
}

/** Lines — every series on ONE scale, each direct-labelled at its end. */
export function lineChart(cats, series, opts = {}) {
  const H = opts.h || 168;
  const known = series.flatMap((s) => s.values.filter(has).map(Number));
  const min = has(opts.min) ? +opts.min : 0;
  const max = opts.max || niceMax(Math.max(0, ...known) * 1.12) || 1;
  const F = chartFrame(H, max, cats, opts.fmtY || ((v) => Math.round(v)), min);
  const px = (i) => F.pad.l + F.band * (i + 0.5);
  let m = '';
  if (has(opts.ref)) {
    const ry = F.y(+opts.ref);
    m += `<line x1="${F.pad.l}" x2="${VW - F.pad.r}" y1="${ry.toFixed(1)}" y2="${ry.toFixed(1)}" stroke="var(--viz-ink)" stroke-width="1" stroke-dasharray="5 3" opacity=".55"/>`
      + `<text x="${VW - F.pad.r}" y="${(ry - 5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="var(--viz-mut)">${esc(opts.refLabel || 'target')}</text>`;
  }
  // the last point a series actually has a figure for — where its end marker
  // and its direct label belong, whatever trails after it
  const lastOf = (vals) => { for (let i = vals.length - 1; i >= 0; i--) if (has(vals[i])) return i; return -1; };

  series.forEach((s) => {
    // A GAP BREAKS THE LINE: each run of known points is its own move-to, so a
    // month nobody measured leaves a hole instead of a dive to the floor.
    let d = ''; let open = false;
    s.values.forEach((v, i) => {
      if (!has(v)) { open = false; return; }
      d += `${open ? 'L' : 'M'}${px(i).toFixed(1)},${F.y(+v).toFixed(1)}`;
      open = true;
    });
    if (d) {
      m += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    s.values.forEach((v, i) => {
      if (!has(v)) return;
      m += `<circle cx="${px(i).toFixed(1)}" cy="${F.y(+v).toFixed(1)}" r="7" fill="transparent">`
        + `<title>${esc(cats[i])} · ${esc(s.name)}: ${esc(opts.fmtV ? opts.fmtV(+v) : (+v).toFixed(1))}</title></circle>`;
    });
    const li = lastOf(s.values);
    if (li >= 0) {
      m += `<circle cx="${px(li).toFixed(1)}" cy="${F.y(+s.values[li]).toFixed(1)}" r="4.5" fill="${s.color}" stroke="var(--viz-surf)" stroke-width="2"/>`;
    }
  });
  // one end label per series, in INK — never in the series colour. Pushed apart
  // only as far as needed, with a leader when moved, so a label never floats
  // free of its own line.
  // A series with no figures at all gets no label — there is nothing to write.
  // One whose figures stop early is labelled at its OWN last point, not at the
  // right-hand edge where it has no line to be attached to.
  const ends = series
    .map((s) => { const i = lastOf(s.values); return i < 0 ? null : { s, i, v: +s.values[i], y0: F.y(+s.values[i]) }; })
    .filter(Boolean)
    .sort((a, b) => a.y0 - b.y0);
  let prev = F.pad.t;
  ends.forEach((e) => { e.y = Math.max(e.y0, prev + 11); prev = e.y; });
  ends.forEach((e) => {
    const lx = px(e.i) + 8;
    if (Math.abs(e.y - e.y0) > 2) {
      m += `<path d="M${(px(e.i) + 5).toFixed(1)},${e.y0.toFixed(1)}L${lx.toFixed(1)},${e.y.toFixed(1)}" stroke="${e.s.color}" stroke-width="1" fill="none" opacity=".7"/>`;
    }
    m += `<text x="${(lx + 2).toFixed(1)}" y="${(e.y + 3.5).toFixed(1)}" font-size="9.5" fill="var(--viz-ink)" font-weight="600">${esc(opts.fmtV ? opts.fmtV(e.v) : e.v.toFixed(1))}</text>`;
  });
  return `<svg viewBox="0 0 ${VW} ${H}" role="img" aria-label="${esc(opts.aria || '')}">${F.g}${m}</svg>`;
}
