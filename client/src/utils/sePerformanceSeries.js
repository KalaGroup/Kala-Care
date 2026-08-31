/* ============================================================================
   SE Performance — the day / week / month / quarter / year series, their
   bifurcations, and the review that turns a shortfall into a sentence.

   The series always ADD BACK to the engineer's own period figures: a drill-down
   that does not reconcile with the row it came from is worse than no
   drill-down. Everything here is generated (see sePerformanceModel.js) until
   the counting rules are agreed.
   ========================================================================= */

import {
  S, COMMITMENTS, SUPPORT, COMPLY, SR_TYPES, PART_CATS, TRAIN_FOR, MON,
  pdate, isoOf, addD, periodSpan, achieve, targetFor, iN, iL, i1, trim2,
  fmtVal, plain, plural, tenureOf,
} from './sePerformanceModel';

const rng = (seed) => { let s = (seed >>> 0) || 1; return () => { s = (s * 1103515245 + 12345) >>> 0; return (s >>> 8) / 0xFFFFFF; }; };
const seedOf = (uid) => {
  const n = parseInt(String(uid).replace(/\D/g, ''), 10);
  if (Number.isFinite(n) && n > 0) return n;
  let h = 7; for (const ch of String(uid)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h || 1;
};
const monthDays = (y, m) => new Date(y, m + 1, 0).getDate();
const sundaysIn = (y, m) => { let n = 0; const d = monthDays(y, m); for (let k = 1; k <= d; k++) if (new Date(y, m, k).getDay() === 0) n++; return n; };

/** Spread a total across weighted slots so the parts add back to the whole. */
export function spreadInt(total, w) {
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  const raw = w.map((x) => (total * x) / sum);
  const out = raw.map(Math.floor);
  const rem = Math.round(total) - out.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  for (let i = 0; i < rem; i++) out[order[i % order.length][1]]++;
  return out;
}
const spreadNum = (total, w) => { const sum = w.reduce((a, b) => a + b, 0) || 1; return w.map((x) => (total * x) / sum); };

/** A rate varies day to day around the engineer's own figure. The deviations
    sum to zero and stay inside the headroom, so nothing needs clamping and the
    mean stays exactly the period figure. */
function wobble(base, n, r, cap) {
  const head = Math.min(base, cap - base) * 0.55;
  const d = Array.from({ length: n }, () => (r() - 0.5) * 2 * head);
  const mean = d.reduce((a, b) => a + b, 0) / n;
  return d.map((x) => base + x - mean);
}

/** An engineer's job mix is a PROPERTY OF THE ENGINEER, not noise: the same
    shares apply to every bucket, so the mix reads as a profile down the row. */
function mixOf(seed, n) {
  const r = rng(seed); const w = Array.from({ length: n }, () => 0.18 + r() * 1.0);
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / s);
}
/** Deviations that come to zero under the mix's own weights. */
function devFor(mix, base, r, cap) {
  const head = Math.min(base, cap - base) * 0.5;
  const d = mix.map(() => (r() - 0.5) * 2 * head);
  const m = d.reduce((a, x, i) => a + x * mix[i], 0);
  return d.map((x) => x - m);
}

/** Every bucket carries its own bifurcations, so a metric opens at any
    granularity without regenerating anything. */
function bifurcate(se, B) {
  const sd = seedOf(se.key);
  const srMix = mixOf(sd * 13 + 1, SR_TYPES.length);
  const partMix = mixOf(sd * 13 + 2, PART_CATS.length);
  const labMix = mixOf(sd * 13 + 3, SR_TYPES.length);
  const closeDev = devFor(srMix, se.v.closure, rng(sd * 13 + 4), 100);
  B.forEach((b) => {
    b.srBy = {}; b.labourBy = {}; b.spareBy = {}; b.closeBy = {};
    const srSplit = spreadInt(b.sr, srMix);
    SR_TYPES.forEach((t, i) => {
      b.srBy[t] = srSplit[i];
      b.labourBy[t] = b.labour * labMix[i];
      b.closeBy[t] = Math.max(0, Math.min(100, b.closure + closeDev[i]));
    });
    PART_CATS.forEach((c, i) => { b.spareBy[c] = b.spare * partMix[i]; });
  });
  // CDI feedback: struck ONCE over the whole period and then spread. Struck per
  // bucket it degenerates — a day carries one feedback, and one feedback always
  // lands in whichever share is largest, so a 7.4 engineer shows promotors only.
  const nAll = Math.max(3, Math.round(B.reduce((a, b) => a + b.sr, 0) / 4));
  const rate = B.reduce((a, b) => a + b.cdi * b.days, 0) / (B.reduce((a, b) => a + b.days, 0) || 1);
  const pSh = Math.max(0.06, Math.min(0.94, (rate - 4.5) / 5.5));
  const dSh = (1 - pSh) * 0.45;
  const [Pall, PaAll, Dall] = spreadInt(nAll, [pSh, 1 - pSh - dSh, dSh]);
  const w = B.map((b) => b.sr + 0.35);                 // feedback follows the load
  const pB = spreadInt(Pall, w); const paB = spreadInt(PaAll, w); const dB = spreadInt(Dall, w);
  B.forEach((b, i) => { b.cdiP = pB[i]; b.cdiPa = paB[i]; b.cdiD = dB[i]; b.cdiN = pB[i] + paB[i] + dB[i]; });
  return B;
}

/* ---- day ---------------------------------------------------------------- */
export function dayBuckets(se) {
  const days = [];
  for (let d = S.from; d <= S.to && days.length < 400; d = addD(d, 1)) days.push(d);
  const n = days.length || 1;
  const r = rng(seedOf(se.key) * 31 + 17);
  // Sunday carries a token load, not none: emergency call-outs happen
  const w = days.map((d) => (pdate(d).getDay() === 0 ? 0.07 : 0.55 + r() * 1.0));
  const sr = spreadInt(se.v.sr, w);
  const spare = spreadNum(se.v.spare, w); const labour = spreadNum(se.v.labour, w);
  const leads = spreadInt(se.v.amcLead, w); const batt = spreadInt(se.v.battery, w);

  // EVERY day the branch works is marked P or A. Only a Sunday carries a dash,
  // because only a Sunday is not a working day.
  const work = days.map((d) => (pdate(d).getDay() === 0 ? 0 : 1));
  const wantWork = work.reduce((a, b) => a + b, 0);
  const pres = work.slice();
  const order = [...days.keys()].sort((a, b) => ((a * 2246822519) % 101) - ((b * 2246822519) % 101));
  let absent = wantWork - Math.max(0, Math.min(wantWork, Math.round((wantWork * se.v.attend) / 100)));
  for (const i of order) { if (absent <= 0) break; if (pres[i]) { pres[i] = 0; absent--; } }

  const closure = wobble(se.v.closure, n, r, 100);
  const first = wobble(se.v.first, n, r, 100);
  const cdi = wobble(se.v.cdi, n, r, 10);
  return bifurcate(se, days.map((d, i) => ({
    key: d,
    label: pdate(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    sub: pdate(d).toLocaleDateString('en-GB', { weekday: 'short' }),
    off: pdate(d).getDay() === 0,
    sr: sr[i], spare: spare[i], labour: labour[i], leads: leads[i], batt: batt[i],
    work: work[i], pres: pres[i],
    attend: work[i] ? pres[i] * 100 : se.v.attend,
    closure: closure[i], first: first[i], cdi: cdi[i], days: 1,
  })));
}

/* ---- week --------------------------------------------------------------- */
export function weekBuckets(se) {
  const days = dayBuckets(se); const out = [];
  days.forEach((d) => {
    const dow = (pdate(d.key).getDay() + 6) % 7;              // Mon = 0
    const ws = addD(d.key, -dow);
    let b = out[out.length - 1];
    if (!b || b.ws !== ws) {
      b = { ws, key: ws, label: `W${out.length + 1}`, sub: '', sr: 0, spare: 0, labour: 0,
        leads: 0, batt: 0, work: 0, pres: 0, closure: 0, first: 0, cdi: 0, days: 0 };
      out.push(b);
    }
    ['sr', 'spare', 'labour', 'leads', 'batt', 'work', 'pres'].forEach((k) => { b[k] += d[k]; });
    ['closure', 'first', 'cdi'].forEach((k) => { b[k] += d[k]; });
    b.days++; b.end = d.key;
  });
  out.forEach((b) => {
    ['closure', 'first', 'cdi'].forEach((k) => { b[k] /= b.days; });
    b.attend = b.work ? (b.pres / b.work) * 100 : 0;
    // the first and last week of a period are CLIPPED to it
    const st = b.ws < S.from ? S.from : b.ws;
    b.sub = `${pdate(st).getDate()}–${pdate(b.end).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;
  });
  return bifurcate(se, out);
}

/* ---- months, and the quarters and years folded from them ---------------- */
function rawMonths(se, N) {
  const end = pdate(S.to); const out = []; const r = rng(seedOf(se.key) * 7919 + 3);
  for (let i = N - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    const dim = monthDays(d.getFullYear(), d.getMonth());
    const f = i === 0 ? 1 : 0.62 + r() * 0.72;
    const m = {
      key: isoOf(d), label: MON[d.getMonth()], sub: String(d.getFullYear()).slice(2),
      cur: i === 0, days: dim,
      sr: 0,                                   // set from the month's own P days
      spare: se.base.spare * f, labour: se.base.labour * f,
      leads: Math.round(se.base.amcLead * f), batt: Math.round(se.base.battery * f),
      attend: Math.min(100, se.base.attend * (i === 0 ? 1 : 0.9 + r() * 0.2)),
      closure: Math.min(100, se.base.closure * (i === 0 ? 1 : 0.88 + r() * 0.24)),
      first: Math.min(100, se.base.first * (i === 0 ? 1 : 0.88 + r() * 0.24)),
      cdi: Math.min(10, se.base.cdi * (i === 0 ? 1 : 0.9 + r() * 0.2)),
    };
    m.work = dim - sundaysIn(d.getFullYear(), d.getMonth());
    m.pres = Math.round((m.work * m.attend) / 100);
    m.attend = m.work ? (m.pres / m.work) * 100 : 0;
    // productivity moves month to month, but stays inside the band
    const rate = Math.max(1.0, Math.min(1.5, se.base.prodRate * (0.92 + r() * 0.16)));
    m.sr = Math.max(1, Math.round(rate * m.pres));
    out.push(m);
  }
  return out;
}

export function monthBuckets(se) {
  const span = periodSpan();
  const out = rawMonths(se, Math.max(12, span.length));
  const keep = span.length > 1
    ? out.filter((m) => span.some((x) => x.y === pdate(m.key).getFullYear() && x.m === pdate(m.key).getMonth()))
    : out.slice(-12);
  return bifurcate(se, keep.length ? keep : out.slice(-12));
}

// Quarters follow the FINANCIAL year (Apr–Jun is Q1) — the year this business
// plans and reports in.
const FYQ = (m) => Math.floor(((m + 9) % 12) / 3);
const FYof = (d) => (d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1);

function foldMonths(se, months, keyOf, labelOf, subOf) {
  const out = []; const byKey = new Map();
  months.forEach((m) => {
    const d = pdate(m.key); const k = keyOf(d);
    let g = byKey.get(k);
    if (!g) {
      g = { key: k, label: labelOf(d), sub: subOf(d), days: 0, sr: 0, spare: 0, labour: 0,
        leads: 0, batt: 0, work: 0, pres: 0, closure: 0, first: 0, cdi: 0 };
      byKey.set(k, g); out.push(g);
    }
    ['sr', 'spare', 'labour', 'leads', 'batt', 'work', 'pres', 'days'].forEach((f) => { g[f] += m[f]; });
    ['closure', 'first', 'cdi'].forEach((f) => { g[f] += m[f] * m.days; });
  });
  out.forEach((g) => {
    ['closure', 'first', 'cdi'].forEach((f) => { g[f] = g.days ? g[f] / g.days : 0; });
    g.attend = g.work ? (g.pres / g.work) * 100 : 0;
  });
  return bifurcate(se, out);
}

/** The FOUR quarters of the financial year the period ends in — always four
    columns, in order, whether or not the year has reached them yet. A quarter
    with no months behind it stays empty and every metric in it prints a dash:
    a year that has not happened is not the same as a year of zeroes. */
export const QUARTER_SPANS = ['Apr–Jun', 'Jul–Sep', 'Oct–Dec', 'Jan–Mar'];
export function quarterBuckets(se) {
  const fy = FYof(pdate(S.to));
  const out = QUARTER_SPANS.map((span, q) => ({
    key: `${fy}Q${q}`, label: `Q${q + 1}`, sub: span, empty: true,
    days: 0, sr: 0, spare: 0, labour: 0, leads: 0, batt: 0,
    work: 0, pres: 0, closure: 0, first: 0, cdi: 0, attend: 0,
  }));
  // 24 months back is more than one financial year, so whichever of them fall
  // inside THIS one are the only ones taken
  rawMonths(se, 24).forEach((m) => {
    const d = pdate(m.key);
    if (FYof(d) !== fy) return;
    const g = out[FYQ(d.getMonth())];
    g.empty = false;
    ['sr', 'spare', 'labour', 'leads', 'batt', 'work', 'pres', 'days'].forEach((f) => { g[f] += m[f]; });
    ['closure', 'first', 'cdi'].forEach((f) => { g[f] += m[f] * m.days; });
  });
  out.forEach((g) => {
    ['closure', 'first', 'cdi'].forEach((f) => { g[f] = g.days ? g[f] / g.days : 0; });
    g.attend = g.work ? (g.pres / g.work) * 100 : 0;
  });
  return bifurcate(se, out);
}

export const yearBuckets = (se) => foldMonths(se, rawMonths(se, 48),
  (d) => String(FYof(d)),
  (d) => `FY ${String(FYof(d)).slice(2)}–${String(FYof(d) + 1).slice(2)}`,
  () => '');

export const bucketsFor = (se) => (S.gran === 'day' ? dayBuckets(se)
  : S.gran === 'week' ? weekBuckets(se)
    : S.gran === 'quarter' ? quarterBuckets(se)
      : S.gran === 'year' ? yearBuckets(se)
        : monthBuckets(se));

/* ---------------------------------------------------------------------------
   The breakdown's ROWS. Periods run across the head, these run down the side.
     sum    a total across the periods
     ratio  recomputed from the period's own totals, never an average of rates
     wavg   day-weighted, because a period's first and last week are partial
   ------------------------------------------------------------------------ */
export const sumB = (B, f) => B.reduce((a, b) => a + f(b), 0);
const wavgB = (B, f) => { const d = B.reduce((a, b) => a + b.days, 0) || 1; return B.reduce((a, b) => a + f(b) * b.days, 0) / d; };
// a per-SR-type closure averages under that type's OWN load, not under the days
const srwB = (B, f, t) => { const n = sumB(B, (b) => b.srBy[t]); return n ? B.reduce((a, b) => a + f(b) * b.srBy[t], 0) / n : null; };

export const DT_ROWS = [
  { id: 'sr', lab: 'SR closed', u: 'count', mid: true, val: (b) => b.sr, f: iN,
    tot: (B) => iN(sumB(B, (b) => b.sr)),
    kids: () => SR_TYPES.map((t) => ({ lab: t, u: 'count', mid: true, val: (b) => b.srBy[t], f: iN,
      tot: (B) => iN(sumB(B, (b) => b.srBy[t])) })) },

  // no paid-days row: the attendance marks below already carry it
  { id: 'prod', lab: 'Productivity', u: 'SR / day', mid: true, val: (b) => (b.pres ? b.sr / b.pres : null), f: trim2,
    tot: (B) => { const p = sumB(B, (b) => b.pres); return p ? trim2(sumB(B, (b) => b.sr) / p) : '–'; } },

  { id: 'spare', lab: 'Spare parts sales', u: '₹ Lakh', val: (b) => b.spare, f: iL,
    tot: (B) => iL(sumB(B, (b) => b.spare)),
    kids: () => PART_CATS.map((c) => ({ lab: c, u: '₹ Lakh', val: (b) => b.spareBy[c], f: iL,
      tot: (B) => iL(sumB(B, (b) => b.spareBy[c])) })) },

  { id: 'labour', lab: 'Labour revenue', u: '₹ Lakh', val: (b) => b.labour, f: iL,
    tot: (B) => iL(sumB(B, (b) => b.labour)),
    kids: () => SR_TYPES.map((t) => ({ lab: t, u: '₹ Lakh', val: (b) => b.labourBy[t], f: iL,
      tot: (B) => iL(sumB(B, (b) => b.labourBy[t])) })) },

  { id: 'leads', lab: 'AMC leads', u: 'count', mid: true, val: (b) => b.leads, f: (v) => String(Math.round(v)),
    tot: (B) => String(sumB(B, (b) => b.leads)) },
  { id: 'batt', lab: 'Battery sold', u: 'count', mid: true, val: (b) => b.batt, f: (v) => String(Math.round(v)),
    tot: (B) => String(sumB(B, (b) => b.batt)) },

  // Attendance has no row of its own here: the days present are already what
  // Productivity divides by, and the Present tile in the summary carries the
  // ratio. A P/A mark per day belonged to the attendance register, not to a
  // performance breakdown.
  { id: 'closure', lab: 'SR / eFSR closure', u: '%', val: (b) => b.closure, f: i1,
    tot: (B) => i1(wavgB(B, (b) => b.closure)),
    kids: () => SR_TYPES.map((t) => ({ lab: t, u: '%', val: (b) => (b.srBy[t] ? b.closeBy[t] : null), f: i1,
      tot: (B) => { const v = srwB(B, (b) => b.closeBy[t], t); return v == null ? '–' : i1(v); } })) },

  { id: 'first', lab: 'First site before 10:00', u: '%', val: (b) => b.first, f: i1,
    tot: (B) => i1(wavgB(B, (b) => b.first)) },

  // a rating out of 10 is a small figure like a count, not a money column —
  // it reads centred, and its children are counts
  { id: 'cdi', lab: 'Customer delight (CDI)', u: '/ 10', mid: true, val: (b) => b.cdi, f: i1,
    tot: (B) => i1(wavgB(B, (b) => b.cdi)),
    kids: () => [
      { lab: 'Promotor (P)', u: 'count', mid: true, val: (b) => b.cdiP, f: (v) => String(v), tot: (B) => String(sumB(B, (b) => b.cdiP)) },
      { lab: 'Passive (P)', u: 'count', mid: true, val: (b) => b.cdiPa, f: (v) => String(v), tot: (B) => String(sumB(B, (b) => b.cdiPa)) },
      { lab: 'Detractor (D)', u: 'count', mid: true, val: (b) => b.cdiD, f: (v) => String(v), tot: (B) => String(sumB(B, (b) => b.cdiD)) },
      // below three feedbacks the percentage swings between 0 and 100 and means
      // nothing — the counts above it are the honest reading for that bucket
      { lab: 'CDI %', u: '%', val: (b) => (b.cdiN >= 3 ? ((b.cdiP - b.cdiD) / b.cdiN) * 100 : null), f: i1,
        tot: (B) => { const n = sumB(B, (b) => b.cdiN); return n ? i1(((sumB(B, (b) => b.cdiP) - sumB(B, (b) => b.cdiD)) / n) * 100) : '–'; } },
    ] },
];

/* ---------------------------------------------------------------------------
   The conversation — a gap the manager cannot put into a sentence is a gap
   nobody acts on. Counts come off the engineer's own figures, so the sentence
   survives being read out in front of him.
   ------------------------------------------------------------------------ */

/** The CDI split, struck by the SAME rule the report uses, so the matrix and
    the report never quote different numbers. */
export function cdiSplit(sr, rating) {
  const N = Math.max(3, Math.round(sr / 4));
  const pSh = Math.max(0.06, Math.min(0.94, (rating - 4.5) / 5.5));
  const dSh = (1 - pSh) * 0.45;
  const [P, Pa, D] = spreadInt(N, [pSh, 1 - pSh - dSh, dSh]);
  return { P, Pa, D, N };
}

function talkFor(k, se, ctx) {
  const t = targetFor(k); const v = se.v[k.key];
  const gap = Array.isArray(t) ? 0 : Math.max(0, t - v);
  const wk = 4.3 * S.months;
  switch (k.key) {
    case 'sr': return { short: `${plural(gap, 'SR')} short`,
      say: `${iN(v)} SRs closed against ${iN(t)}. ${gap} short — about ${(gap / wk).toFixed(1)} a week.`,
      ask: `Close ${Math.ceil(gap / wk)} more SRs a week.` };
    case 'spare': return { short: `₹${iN(gap)} short`,
      say: `Spare parts billed ₹${iN(v)} against ₹${iN(t)}. That is ₹${iN(se.v.sr ? v / se.v.sr : 0)} of parts attached per SR`
        + (ctx.bSpareSr != null ? `, where the branch attaches ₹${iN(ctx.bSpareSr)}.` : '.'),
      ask: `Attach ₹${iN(se.v.sr ? gap / se.v.sr : gap)} more parts per SR — a filter set or a coolant on the jobs already booked.` };
    case 'labour': return { short: `₹${iN(gap)} short`,
      say: `Labour billed ₹${iN(v)} against ₹${iN(t)} — ₹${iN(se.v.sr ? v / se.v.sr : 0)} a job`
        + (ctx.bLabSr != null ? ` against the branch's ₹${iN(ctx.bLabSr)}.` : '.'),
      ask: `Bill the full labour line on every job; ₹${iN(gap)} over ${se.v.sr} SRs is ₹${iN(se.v.sr ? gap / se.v.sr : gap)} a job.` };
    case 'amcLead': return { short: `${plural(gap, 'lead')} short`,
      say: `${plural(v, 'AMC lead')} against ${t}. On ${se.v.sr} SRs that is one lead every ${se.v.amcLead ? Math.round(se.v.sr / se.v.amcLead) : se.v.sr} jobs.`,
      ask: `Raise ${gap} more — one AMC ask on every ${Math.max(1, Math.round(se.v.sr / Math.max(1, t)))}th job covers it.` };
    case 'battery': return { short: `${gap} batter${gap === 1 ? 'y' : 'ies'} short`,
      say: `${v} batteries sold against ${t}. Every wet PM is a battery check.`,
      ask: `${gap} more this month — check and quote on the PM visits already scheduled.` };
    case 'lms': return { short: `${(100 - v).toFixed(1)}% not updated`,
      say: `${v.toFixed(1)}% of leads updated on LMS. The commitment is every one of them.`,
      ask: 'Update the same day. An unlogged lead is a lead the branch cannot follow.' };
    case 'first': return { short: `${plural(Math.round((se.workDays * (100 - v)) / 100), 'day')} late`,
      say: `First site before 10:00 on ${v.toFixed(1)}% of days — roughly ${Math.round((se.workDays * (100 - v)) / 100)} of ${se.workDays} working days started late.`,
      ask: 'First call on site by 10:00 every day. Report the exception the evening before, not on the day.' };
    case 'sfTask': return { short: `${plural(Math.round((se.v.sr * (100 - v)) / 100), 'task')} left open`,
      say: `${v.toFixed(1)}% of tasks closed before leaving site — about ${Math.round((se.v.sr * (100 - v)) / 100)} of ${se.v.sr} tasks left open.`,
      ask: 'Close the task on the app before the vehicle moves.' };
    case 'attend': {
      const abs = Math.max(0, se.workDays - se.present);
      return { short: `${plural(abs, 'day')} absent`,
        say: `Present ${se.present} of ${se.workDays} working days — ${abs} absent. At his own billing that is ₹${iN(ctx.perDay)} a day of work not done.`,
        ask: `Attendance above ${targetFor(k)}% means no more than ${plural(Math.floor((se.workDays * (100 - S.targets.attend)) / 100), 'absent day')} in a month.` };
    }
    case 'closure': {
      const late = Math.round((se.v.sr * (100 - v)) / 100);
      return { short: `${plural(late, 'SR')} late`,
        say: `${v.toFixed(1)}% closed inside the timeline against ${t}% — about ${late} of ${se.v.sr} SRs ran past MaxTTR.`,
        ask: 'No SR past its timeline. Ask the coordinator to flag anything open on day two.' };
    }
    case 'cdi': {
      const c = ctx.cdi;
      return { short: `${(t - v).toFixed(1)} pts below`,
        say: `Rated ${v.toFixed(1)} of 10 against ${t}. ${c.D} of ${plural(c.N, 'customer')} came back as ${c.D === 1 ? 'a detractor' : 'detractors'} this period`
          + (c.P ? `, ${c.P} as promotors.` : '.'),
        ask: 'Explain the work done and the site status before leaving — that one habit moves the rating more than anything else.' };
    }
    case 'wetPm': {
      const [lo, hi] = S.targets.wetPm; const fast = v < lo;
      return { short: fast ? `${(lo - v).toFixed(2)} hrs under` : `${(v - hi).toFixed(2)} hrs over`,
        say: fast
          ? `Wet PM jobs average ${v.toFixed(2)} hrs against the ${lo}–${hi} hr window — under the time the checklist takes.`
          : `Wet PM jobs average ${v.toFixed(2)} hrs against the ${lo}–${hi} hr window — longer than the job should need.`,
        ask: fast
          ? 'Work the full PM checklist. A short PM is what comes back as a breakdown.'
          : 'Review the PM sequence with the branch — the time is going somewhere it should not.' };
    }
    default: return { short: '—', say: '', ask: '' };
  }
}

/** Everything the signed matrix asserts. */
export function reviewOf(se, allSes) {
  const A = (k) => achieve(k, se.v[k.key]);
  const met = COMMITMENTS.filter((k) => A(k) >= 100);
  const miss = COMMITMENTS.filter((k) => { const a = A(k); return a != null && a < 85; }).sort((a, b) => A(a) - A(b));
  const near = COMMITMENTS.filter((k) => { const a = A(k); return a != null && a >= 85 && a < 100; });
  const comply = se.comply.filter(Boolean).length;
  const support = se.support.filter(Boolean).length;

  // the file records a skill once per CATEGORY — one training to a reader
  const tr = (se.trainings || []).map((t) => [t[0], t[1] || '', t[2] || '']);
  const skills = tr.map((t) => String(t[0]).toLowerCase());
  const hasTraining = (k) => {
    const words = TRAIN_FOR[k.key];
    if (words === null || words === undefined) return null;         // discipline
    return words.some((w) => skills.some((s) => s.includes(w.toLowerCase())));
  };

  const rev = se.v.spare + se.v.labour;
  const perSR = se.v.sr ? rev / se.v.sr : 0;
  const perDay = se.present ? rev / se.present : 0;
  const absent = Math.max(0, se.workDays - se.present);

  // How he sits against the people doing the same job in the same branch — the
  // only fair comparison, and the one he will make himself.
  const peers = (allSes || []).filter((x) => x.bid === se.bid && x.key !== se.key);
  const pAvg = (f) => (peers.length ? peers.reduce((a, x) => a + f(x), 0) / peers.length : null);
  const branch = {
    n: peers.length + 1,
    rank: (allSes || []).filter((x) => x.bid === se.bid).sort((a, b) => b.score - a.score)
      .findIndex((x) => x.key === se.key) + 1,
    sr: pAvg((x) => x.v.sr), prod: pAvg((x) => x.v.prod),
    spareSr: pAvg((x) => (x.v.sr ? x.v.spare / x.v.sr : 0)),
    labSr: pAvg((x) => (x.v.sr ? x.v.labour / x.v.sr : 0)),
  };
  const ctx = { perSR, perDay, bSpareSr: branch.spareSr, bLabSr: branch.labSr, cdi: cdiSplit(se.v.sr, se.v.cdi) };

  // Money priced at the ENGINEER'S OWN rates, never a branch average. Where a
  // gap has no defensible rupee value it carries none rather than an invented one.
  const worthOf = (k) => {
    const t = targetFor(k); const v = se.v[k.key];
    if (k.key === 'sr') return Math.max(0, t - v) * perSR;
    if (k.key === 'spare' || k.key === 'labour') return Math.max(0, t - v);
    if (k.key === 'attend') return absent * perDay;
    return null;
  };
  const stake = COMMITMENTS
    .filter((k) => { const a = A(k); return a != null && a < 100; })
    .map((k) => ({ k, pct: A(k), worth: worthOf(k), ...talkFor(k, se, ctx) }))
    .sort((a, b) => (b.worth || 0) - (a.worth || 0) || a.pct - b.pct);
  const total = stake.reduce((a, x) => a + (x.worth || 0), 0);
  const focus = stake.find((x) => x.worth) || stake[0] || null;

  // The call. Compliance and the support the branch actually gave both weigh on
  // it: an engineer the branch never kitted out is not a performance case.
  let verdict; let tone; let why;
  const unsupported = SUPPORT.length - support;
  if (unsupported >= 3 && se.score < 80) {
    verdict = 'Branch action first'; tone = 'warn';
    why = `${unsupported} of ${SUPPORT.length} support items are not issued. Close that before the performance conversation — the commitments assume the kit.`;
  } else if (se.score >= 90 && comply === COMPLY.length) {
    verdict = 'Recommend — incentive / promotion review'; tone = 'good';
    why = `${met.length} of ${COMMITMENTS.length} commitments kept and every mandatory item in order.`;
  } else if (se.score >= 80) {
    const weakComply = comply <= COMPLY.length - 3;
    verdict = weakComply ? 'On track on the numbers — pull up the mandatory list' : 'On track — confirm';
    tone = weakComply ? 'warn' : 'good';
    why = (miss.length ? `Solid on the numbers; ${miss.length} commitment${miss.length > 1 ? 's' : ''} to close out.` : 'Every commitment kept.')
      + (weakComply ? ` But only ${comply} of ${COMPLY.length} mandatory items are in order — the score does not cover uniform, PPE, tool kit or workmanship.` : '');
  } else if (se.score >= 70) {
    verdict = 'Coach — focused support'; tone = 'warn';
    why = `Short on ${miss.slice(0, 2).map((k) => plain(k.short)).join(' and ')}. Set a 30-day target on ${miss.length > 1 ? 'both' : 'it'}.`;
  } else if (se.score >= 60) {
    verdict = 'Formal review'; tone = 'bad';
    why = `${miss.length} commitments missed by more than 15%. Review with the branch manager this month.`;
  } else {
    verdict = 'Performance improvement plan'; tone = 'bad';
    why = `Score ${se.score.toFixed(1)} with ${miss.length} commitments missed. Put a written plan and a review date in place.`;
  }

  // Skill gap, application gap or discipline — three problems, three answers
  const actions = miss.map((k) => {
    const t = hasTraining(k);
    if (t === null) return { k, type: 'Discipline', tone: 'bad', act: 'No training closes this — set the expectation and follow it daily.' };
    if (t) return { k, type: 'Application', tone: 'warn', act: 'Trained already — this is coaching and follow-up on site, not another course.' };
    return { k, type: 'Skill', tone: 'warn', act: 'No training on record that covers this — nominate for the next batch.' };
  });

  const skillGaps = actions.filter((a) => a.type === 'Skill').length;
  const catalogue = skillGaps >= 3
    ? `${skillGaps} of these have no course on record that covers them. The Training Report is almost entirely `
      + 'product training — worth checking the gap against the training plan before nominating him for anything.'
    : null;

  return { met, miss, near, comply, support, tr, stake, total, focus, branch,
    asks: stake.slice(0, 3).map((x) => x.ask),
    rev, perSR, perDay, absent, verdict, tone, why, actions, catalogue, tenure: tenureOf(se) };
}

/** The short summary that sits between the numbers and the charts. */
export function summaryOf(se, B) {
  const T = (k) => B.reduce((a, b) => a + b[k], 0);
  const sr = T('sr'); const pres = T('pres'); const work = T('work');
  const rev = T('spare') + T('labour');
  const revT = S.targets.spare + S.targets.labour;
  // how many months the WINDOW SHOWN is worth — a month view of a one-month
  // period still shows the trailing twelve, and the sentence has to say so
  const nMonths = B.reduce((a, b) => a + b.days, 0) / 30.44;
  const met = COMMITMENTS.filter((k) => achieve(k, se.v[k.key]) >= 100);
  const missed = COMMITMENTS.filter((k) => { const a = achieve(k, se.v[k.key]); return a != null && a < 85; })
    .sort((a, b) => achieve(a, se.v[a.key]) - achieve(b, se.v[b.key]));
  const best = COMMITMENTS.slice().sort((a, b) => achieve(b, se.v[b.key]) - achieve(a, se.v[a.key]))[0];

  const srMix = SR_TYPES.map((t) => ({ t, n: B.reduce((a, b) => a + b.srBy[t], 0) })).sort((a, b) => b.n - a.n);
  const partMix = PART_CATS.map((c) => ({ c, v: B.reduce((a, b) => a + b.spareBy[c], 0) })).sort((a, b) => b.v - a.v);
  const P = T('cdiP'); const Pa = T('cdiPa'); const Dt = T('cdiD'); const N = T('cdiN');
  const worstType = SR_TYPES.map((t) => {
    const n = B.reduce((a, b) => a + b.srBy[t], 0);
    return { t, n, c: n ? B.reduce((a, b) => a + b.closeBy[t] * b.srBy[t], 0) / n : null };
  }).filter((x) => x.n >= 3 && x.c != null).sort((a, b) => a.c - b.c)[0];

  const say = [];
  say.push(`Closed <b>${sr} SRs</b> over <b>${pres} days present</b> — <b>${pres ? (sr / pres).toFixed(2) : '–'} a day present</b>, `
    + `against the ${iN(S.targets.sr)}-a-month commitment (${(S.targets.sr * nMonths).toFixed(0)} over the ${nMonths < 1.02 ? 'month' : `${nMonths.toFixed(0)} months`} shown).`);
  if (srMix[0] && srMix[0].n) {
    say.push(`The load is mostly <b>${srMix[0].t}</b> (${Math.round((srMix[0].n / Math.max(1, sr)) * 100)}% of SRs)`
      + (srMix[1] && srMix[1].n ? `, then ${srMix[1].t} (${Math.round((srMix[1].n / Math.max(1, sr)) * 100)}%)` : '') + '.');
  }
  say.push(`Revenue <b>₹${(rev / 1e5).toFixed(2)} L</b> — spare ₹${(T('spare') / 1e5).toFixed(2)} L`
    + (partMix[0] && partMix[0].v ? ` (mostly ${partMix[0].c})` : '')
    + `, labour ₹${(T('labour') / 1e5).toFixed(2)} L — against ₹${((revT * nMonths) / 1e5).toFixed(2)} L committed.`);
  say.push(nMonths > 1.2
    ? `Over ${nMonths.toFixed(0)} months: <b>${work} working days</b>, present on <b>${pres}</b> `
      + `(${work ? ((pres / work) * 100).toFixed(1) : '0'}%) — an average of `
      + `<b>${Math.round(pres / nMonths)} of ${Math.round(work / nMonths)}</b> a month.`
    : `The period holds <b>${work} working days</b> — present on <b>${pres}</b>, absent on <b>${work - pres}</b> `
      + `(${work ? ((pres / work) * 100).toFixed(1) : '0'}%).`);
  say.push(`Customer feedback: <b>${P} promotor · ${Pa} passive · ${Dt} detractor</b> out of ${N}.`);
  if (worstType && worstType.c < S.targets.closure) {
    say.push(`Closure is weakest on <b>${worstType.t}</b> SRs at ${worstType.c.toFixed(1)}% against the ${S.targets.closure}% timeline.`);
  }
  say.push(missed.length
    ? `Strongest on <b>${plain(best.short)}</b>; short on <b>${missed.slice(0, 3).map((k) => plain(k.short)).join('</b>, <b>')}</b>.`
    : `Every commitment kept — strongest on <b>${plain(best.short)}</b>.`);

  return { sr, pres, work, rev, revT, nMonths, met, say };
}
