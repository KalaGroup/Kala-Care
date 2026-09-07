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
  plain, plural, tenureOf, srOn, srInMonth, workDaysOf, convOn, convInMonth,
  cdiOn, cdiInMonth, cdiPct, efOn, efInMonth, pctOf, lbOn, lbInMonth, hhmm, ATT,
} from './sePerformanceModel';

const rng = (seed) => { let s = (seed >>> 0) || 1; return () => { s = (s * 1103515245 + 12345) >>> 0; return (s >>> 8) / 0xFFFFFF; }; };
const seedOf = (uid) => {
  const n = parseInt(String(uid).replace(/\D/g, ''), 10);
  if (Number.isFinite(n) && n > 0) return n;
  let h = 7; for (const ch of String(uid)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h || 1;
};
const monthDays = (y, m) => new Date(y, m + 1, 0).getDate();

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

/** An engineer's job mix is a PROPERTY OF THE ENGINEER, not noise: the same
    shares apply to every bucket, so the mix reads as a profile down the row. */
function mixOf(seed, n) {
  const r = rng(seed); const w = Array.from({ length: n }, () => 0.18 + r() * 1.0);
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / s);
}
/** Every bucket carries its own bifurcations, so a metric opens at any
    granularity without regenerating anything. */
function bifurcate(se, B) {
  const sd = seedOf(se.key);
  const srMix = mixOf(sd * 13 + 1, SR_TYPES.length);
  const partMix = mixOf(sd * 13 + 2, PART_CATS.length);
  const labMix = mixOf(sd * 13 + 3, SR_TYPES.length);
  B.forEach((b) => {
    b.srBy = {}; b.labourBy = {}; b.spareBy = {};
    const srSplit = spreadInt(b.sr, srMix);
    SR_TYPES.forEach((t, i) => {
      b.srBy[t] = srSplit[i];
      b.labourBy[t] = b.labour * labMix[i];
    });
    PART_CATS.forEach((c, i) => { b.spareBy[c] = b.spare * partMix[i]; });
  });
  return B;
}

/** ATTENDANCE OFF HR'S DAY-WISE FILE, one date at a time: [expected, worked].

    expected is 1 on a day he was meant to work and NULL on a day nobody
    expected him to - a weekly off, a c-off, a holiday, or a day the file says
    nothing about. That distinction is the whole point: a weekly off scored as a
    zero drags the attendance line to the floor every Sunday and on whatever
    weekday his rota gives him, and reads as an absence he never took.

    worked is a day for Present or Outdoor Duty, half a day for a Half Day, and
    nothing for Leave or Absent - which are the only two that cost him
    anything.

    null for a month with no day-wise file; the caller falls back to HR's month
    total spread over the master's man-days, which is all such a month has. */
const attOn = (se, iso) => {
  const s = se.at && se.at[iso.slice(0, 7)];
  if (!s) return null;                          // no day-wise file for the month
  const a = ATT[s[+iso.slice(8, 10) - 1]];
  // [0, 0] and NOT null for a weekly off, a c-off or a holiday: the file DOES
  // cover the day, it just says nobody expected him on it. Returning null there
  // handed the day to the fallback below, which spread the month total over the
  // master's man-days and printed 85% on a c-off - a figure for a day the file
  // had already answered.
  if (!a || a.worth === null) return [0, 0];
  return [1, a.worth];
};

/* ---- day ---------------------------------------------------------------- */
export function dayBuckets(se) {
  const days = [];
  for (let d = S.from; d <= S.to && days.length < 400; d = addD(d, 1)) days.push(d);
  // SR CLOSED is the day's own count out of the MaxTTR file — never a share of
  // a period total spread over the days, which is what every other row here
  // still is. A Sunday with a call-out shows the call-out.
  const sr = days.map((d) => srOn(se, d));
  // the MaxTTR close count rides along: nothing on the columns divides by it,
  // but the productivity chart above them does
  const maxSr = days.map((d) => (se.maxDay ? (se.maxDay[d] || 0) : 0));
  const alloc = days.map((d) => (se.allocDay ? (se.allocDay[d] || [0, 0]) : [0, 0]));
  // the day's own conversion amounts, out of the LMS file — not a period total
  // spread over the days, which is what these two used to be
  const spare = days.map((d) => convOn(se, d)[0]);
  const labour = days.map((d) => convOn(se, d)[1]);
  // the day's own AMC leads and batteries, out of their two files
  const leads = days.map((d) => lbOn(se, d)[0]);
  const batt = days.map((d) => lbOn(se, d)[1]);

  /* WORKING DAYS and DAYS PRESENT are both MONTHLY figures — the AOP master
     gives a count for the month and never says which days, and HR's file has
     one row per month and no day detail at all. Neither can be turned into a
     truthful per-day mark, so both are spread evenly across the month's
     non-Sundays: the day and week columns then ADD BACK to the month's real
     total, which is this file's whole contract, and no single day is claimed
     to be the one he was absent on.
     A Sunday carries none of either — it is not a working day. */
  // WHOLE DAYS, and they add up to the month's own figure. The master gives a
  // COUNT and never says which days, so the count is laid on the month's
  // non-Sundays oldest first — which on this data lands exactly right, because
  // the reason August is 20 rather than 26 is that the files stop on the 24th,
  // and it is the days after it that are not working days.
  //
  // Fractions were tried here and are worse than wrong, they are unreadable: a
  // day worth 0.77 of a man-day turned 5 SRs into a productivity of 6.46.
  const wdTotal = Math.round(se.workDays || 0);
  const workIdx = new Set(days
    .map((d, i) => (pdate(d).getDay() === 0 ? -1 : i)).filter((i) => i >= 0)
    .slice(0, wdTotal));
  const work = days.map((_d, i) => (workIdx.has(i) ? 1 : 0));
  // HR's attendance is a MONTH's total with no day detail, so it is spread
  // evenly across those working days: the columns add back to it, and no single
  // day is claimed to be the one he missed.
  const prShare = (se.present == null || !wdTotal) ? null : se.present / wdTotal;
  const pres = days.map((_d, i) => (workIdx.has(i) && prShare != null ? prShare : 0));
  // the fraction of a MONTH each column is worth, so a quarter or a year can
  // report the average month instead of a total nobody can hold in their head
  const mfShare = 1 / (days.length || 1);
  const hrOk = se.present != null;

  const att = days.map((d) => attOn(se, d));
  // the day's own EFSR counts and CDI feedback
  const ef = days.map((d) => efOn(se, d));
  const cdi = days.map((d) => cdiOn(se, d));
  return bifurcate(se, days.map((d, i) => ({
    key: d,
    label: pdate(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    sub: pdate(d).toLocaleDateString('en-GB', { weekday: 'short' }),
    off: pdate(d).getDay() === 0,
    sr: sr[i], maxSr: maxSr[i], alloc: alloc[i][0], allocOk: alloc[i][1],
    spare: spare[i], labour: labour[i], leads: leads[i], batt: batt[i],
    work: work[i], pres: pres[i],
    mf: mfShare, hrMf: hrOk ? mfShare : 0,
    /* the day's OWN attendance where HR sent it day by day, and the month
       total spread over the man-days where it did not */
    attD: att[i] ? att[i][0] : 0, attP: att[i] ? att[i][1] : 0,
    attend: att[i] ? (att[i][0] ? att[i][1] * 100 : null)
      : (work[i] && hrOk ? (pres[i] / work[i]) * 100 : null),
    days: 1,
    fsOn: ef[i][0], fsD: ef[i][1], tcOk: ef[i][2], tcN: ef[i][3], fsMin: ef[i][4],
    first: pctOf(ef[i][0], ef[i][1]), sfTask: pctOf(alloc[i][1], alloc[i][0]),
    cdiP: cdi[i][0], cdiD: cdi[i][1], cdiPa: cdi[i][2],
    cdiN: cdi[i][0] + cdi[i][1] + cdi[i][2],
    cdi: cdiPct(cdi[i]),
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
        leads: 0, batt: 0, work: 0, pres: 0, mf: 0, hrMf: 0, days: 0, maxSr: 0,
        alloc: 0, allocOk: 0, attD: 0, attP: 0,
        fsOn: 0, fsD: 0, tcOk: 0, tcN: 0, fsMin: 0,
        cdiP: 0, cdiD: 0, cdiPa: 0, cdiN: 0 };
      out.push(b);
    }
    ['sr', 'maxSr', 'alloc', 'allocOk', 'spare', 'labour', 'leads', 'batt', 'work', 'pres', 'mf', 'hrMf',
      'attD', 'attP', 'fsOn', 'fsD', 'tcOk', 'tcN', 'fsMin',
      'cdiP', 'cdiD', 'cdiPa', 'cdiN'].forEach((k) => { b[k] += d[k]; });
    b.days++; b.end = d.key;
  });
  out.forEach((b) => {
    b.first = pctOf(b.fsOn, b.fsD);
    b.sfTask = pctOf(b.allocOk, b.alloc);
    // the percentage is struck from the week's OWN counts, never averaged from
    // the days' percentages — a day with one detractor is -100% and would drag
    // a week of promotors below zero
    b.cdi = cdiPct([b.cdiP, b.cdiD, b.cdiPa]);
    // the week's OWN days out of HR's day-wise file, and only where it has
    // none does the month total spread over the man-days answer instead
    b.attend = b.attD ? (b.attP / b.attD) * 100
      : ((b.work && b.hrMf) ? (b.pres / b.work) * 100 : null);
    // the first and last week of a period are CLIPPED to it
    const st = b.ws < S.from ? S.from : b.ws;
    b.sub = `${pdate(st).getDate()}–${pdate(b.end).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;
  });
  return bifurcate(se, out);
}

/* ---- months, and the quarters and years folded from them ---------------- */
function rawMonths(se, N) {
  const end = pdate(S.to); const out = [];
  for (let i = N - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    const dim = monthDays(d.getFullYear(), d.getMonth());
    const m = {
      key: isoOf(d), label: MON[d.getMonth()], sub: String(d.getFullYear()).slice(2),
      cur: i === 0, days: dim,
      sr: 0,                                   // set from the month's own P days
      leads: 0, batt: 0,
    };
    const mk = m.key.slice(0, 7);
    // the month's own counted SRs, the master's own man-days and HR's own days
    // present; the quarters and financial years fold from these, so every
    // granularity reads the same three sources
    m.sr = srInMonth(se, mk);
    m.maxSr = se.maxMonth ? (se.maxMonth[mk] || 0) : 0;
    const am = se.allocMonth ? (se.allocMonth[mk] || [0, 0]) : [0, 0];
    m.alloc = am[0]; m.allocOk = am[1];
    const cv = convInMonth(se, mk);
    m.spare = cv[0]; m.labour = cv[1];
    const cd = cdiInMonth(se, mk);
    m.cdiP = cd[0]; m.cdiD = cd[1]; m.cdiPa = cd[2];
    m.cdiN = cd[0] + cd[1] + cd[2];
    m.cdi = cdiPct(cd);
    const lb = lbInMonth(se, mk);
    m.leads = lb[0]; m.batt = lb[1];
    const ef = efInMonth(se, mk);
    m.fsOn = ef[0]; m.fsD = ef[1]; m.tcOk = ef[2]; m.tcN = ef[3]; m.fsMin = ef[4];
    m.first = pctOf(ef[0], ef[1]);
    m.sfTask = pctOf(m.allocOk, m.alloc);   // closed ON the day allocated
    // the month's attendance, day by day, out of HR's own file
    const acodes = se.at && se.at[mk];
    let aD = 0; let aP = 0;
    if (acodes) {
      for (const ch of acodes) {
        const a = ATT[ch];
        if (a && a.worth !== null) { aD += 1; aP += a.worth; }
      }
    }
    m.attD = aD; m.attP = aP;
    m.work = workDaysOf(se.region, d.getFullYear(), d.getMonth());
    const hr = se.hr && (mk in se.hr) ? se.hr[mk] : null;
    m.pres = hr == null ? 0 : hr;
    m.mf = 1;
    m.hrMf = hr == null ? 0 : 1;
    m.attend = aD ? (aP / aD) * 100
      : ((hr == null || !m.work) ? null : (hr / m.work) * 100);
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
        leads: 0, batt: 0, work: 0, pres: 0, mf: 0, hrMf: 0, maxSr: 0, alloc: 0, allocOk: 0,
        attD: 0, attP: 0,
        fsOn: 0, fsD: 0, tcOk: 0, tcN: 0, fsMin: 0,
        cdiP: 0, cdiD: 0, cdiPa: 0, cdiN: 0 };
      byKey.set(k, g); out.push(g);
    }
    ['sr', 'maxSr', 'alloc', 'allocOk', 'spare', 'labour', 'leads', 'batt', 'work', 'pres', 'mf', 'hrMf',
      'days', 'attD', 'attP', 'fsOn', 'fsD', 'tcOk', 'tcN', 'fsMin',
      'cdiP', 'cdiD', 'cdiPa', 'cdiN'].forEach((f) => { g[f] += m[f]; });
  });
  out.forEach((g) => {
    g.first = pctOf(g.fsOn, g.fsD);
    g.sfTask = pctOf(g.allocOk, g.alloc);
    g.cdi = cdiPct([g.cdiP, g.cdiD, g.cdiPa]);
    // over the months HR actually sent, never over all of them
    g.attend = g.attD ? (g.attP / g.attD) * 100
      : ((g.hrMf && g.work) ? (g.pres / (g.work * (g.hrMf / g.mf))) * 100 : null);
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
    days: 0, sr: 0, maxSr: 0, alloc: 0, allocOk: 0, spare: 0, labour: 0, leads: 0, batt: 0,
    work: 0, pres: 0, mf: 0, hrMf: 0, attend: null, attD: 0, attP: 0,
    fsOn: 0, fsD: 0, tcOk: 0, tcN: 0, fsMin: 0, first: null, sfTask: null,
    cdiP: 0, cdiD: 0, cdiPa: 0, cdiN: 0, cdi: null,
  }));
  // 24 months back is more than one financial year, so whichever of them fall
  // inside THIS one are the only ones taken
  rawMonths(se, 24).forEach((m) => {
    const d = pdate(m.key);
    if (FYof(d) !== fy) return;
    const g = out[FYQ(d.getMonth())];
    g.empty = false;
    ['sr', 'maxSr', 'alloc', 'allocOk', 'spare', 'labour', 'leads', 'batt', 'work', 'pres', 'mf', 'hrMf',
      'days', 'attD', 'attP', 'fsOn', 'fsD', 'tcOk', 'tcN', 'fsMin',
      'cdiP', 'cdiD', 'cdiPa', 'cdiN'].forEach((f) => { g[f] += m[f]; });
  });
  out.forEach((g) => {
    g.first = pctOf(g.fsOn, g.fsD);
    g.sfTask = pctOf(g.allocOk, g.alloc);
    g.cdi = cdiPct([g.cdiP, g.cdiD, g.cdiPa]);
    g.attend = g.attD ? (g.attP / g.attD) * 100
      : ((g.hrMf && g.work) ? (g.pres / (g.work * (g.hrMf / g.mf))) * 100 : null);
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

export const DT_ROWS = [
  // the EFSR closure count — this is the SR Count commitment
  { id: 'sr', lab: 'SR closed (EFSR)', u: 'count', mid: true, val: (b) => b.sr, f: iN,
    tot: (B) => iN(sumB(B, (b) => b.sr)),
    kids: () => SR_TYPES.map((t) => ({ lab: t, u: 'count', mid: true, val: (b) => b.srBy[t], f: iN,
      tot: (B) => iN(sumB(B, (b) => b.srBy[t])) })) },

  /* NO PRODUCTIVITY ROW, and no paid-days row either. Productivity divides the
     MaxTTR close count while the SR row above is the EFSR closure count, so a
     row here would have put one file's numerator over the other's definition
     and invited exactly the comparison that is wrong. It is stated once, in the
     header tile, which names the file it uses. */

  { id: 'spare', lab: 'Spare parts sales (LMS)', u: '₹ Lakh', val: (b) => b.spare, f: iL,
    tot: (B) => iL(sumB(B, (b) => b.spare)),
    kids: () => PART_CATS.map((c) => ({ lab: c, u: '₹ Lakh', val: (b) => b.spareBy[c], f: iL,
      tot: (B) => iL(sumB(B, (b) => b.spareBy[c])) })) },

  { id: 'labour', lab: 'Labour revenue (LMS)', u: '₹ Lakh', val: (b) => b.labour, f: iL,
    tot: (B) => iL(sumB(B, (b) => b.labour)),
    kids: () => SR_TYPES.map((t) => ({ lab: t, u: '₹ Lakh', val: (b) => b.labourBy[t], f: iL,
      tot: (B) => iL(sumB(B, (b) => b.labourBy[t])) })) },

  { id: 'leads', lab: 'AMC Generation', u: 'count', mid: true, val: (b) => b.leads, f: (v) => String(Math.round(v)),
    tot: (B) => String(sumB(B, (b) => b.leads)) },
  { id: 'batt', lab: 'Battery sold', u: 'count', mid: true, val: (b) => b.batt, f: (v) => String(Math.round(v)),
    tot: (B) => String(sumB(B, (b) => b.batt)) },

  // Attendance has no row of its own here: the days present are already what
  // Productivity divides by, and the Present tile in the summary carries the
  // ratio. A P/A mark per day belonged to the attendance register, not to a
  // performance breakdown.
  // both struck from their own counts — a day is one day whatever it holds,
  // and averaging percentages would weight a one-task day like a six-task one
  /* THE CLOCK, not the percentage, and one row with no children.
     A day column now shows the TIME he started his first job that day, out of
     the EFSR file's own task start; a week, month, quarter or year column shows
     the AVERAGE of those times over its days. That is the figure the business
     bands this commitment on (10:00 green, 10:30 yellow, later amber), and it
     is the one a reader can act on — '12.5%' told nobody what time he arrived.
     The percentage is still what the KPI is SCORED on; it lives on the signed
     matrix, not here.
     Averaged over the days he actually WORKED, never over the calendar: a day
     with no task of his has no arrival time to average in. */
  { id: 'first', lab: 'First site — start time', u: 'avg time', mid: true,
    val: (b) => (b.fsD ? b.fsMin / b.fsD : null), f: hhmm,
    tot: (B) => { const d = sumB(B, (b) => b.fsD);
      return d ? hhmm(sumB(B, (b) => b.fsMin) / d) : '–'; } },

  /* The commitment's own name, and a TICK rather than a figure when it is met.
     '100.0' in a percentage column invites the reader to compare it with 99.4
     and 87.1 and rank them; the commitment is not a rank, it is a daily habit
     that was either kept or was not. So a met day is a tick and a missed day
     keeps its number, which is the only one worth reading.

     Beneath it, the day's two SR movements — ALLOCATED on the task assigned
     date and CLOSED on the task end date, the same pair the SR Allocation
     report prints. They are not the parent's arithmetic (that is closed-same-
     day over tasks); they are the context it needs, because a 60% closure rate
     on two tasks and on twenty are different conversations. */
  /* CLOSED over ALLOCATED, as a percentage everywhere — 100 included. A tick
     for a met day was tried and taken out again: a column of figures with the
     good ones replaced by a symbol cannot be scanned for a trend, and 100 next
     to 92 and 78 is the comparison a reader wants. The total is struck from the
     period's OWN two counts, never averaged from the days'. */
  { id: 'sfTask', lab: 'Salesforce Task Closure Daily', u: '%', mid: true,
    val: (b) => pctOf(b.allocOk, b.alloc), f: i1,
    tot: (B) => { const v = pctOf(sumB(B, (b) => b.allocOk), sumB(B, (b) => b.alloc));
      return v == null ? '–' : i1(v); },
    kids: () => [
      { lab: 'Allocated', u: 'count', mid: true, val: (b) => b.alloc, f: iN,
        tot: (B) => iN(sumB(B, (b) => b.alloc)) },
      { lab: 'Closed same day', u: 'count', mid: true, val: (b) => b.allocOk, f: iN,
        tot: (B) => iN(sumB(B, (b) => b.allocOk)) },
    ] },

  // a rating out of 10 is a small figure like a count, not a money column —
  // it reads centred, and its children are counts
  // struck from the counts at every level, never averaged from percentages
  { id: 'cdi', lab: 'Customer delight (CDI)', u: '%', val: (b) => b.cdi, f: i1,
    tot: (B) => { const v = cdiPct([sumB(B, (b) => b.cdiP), sumB(B, (b) => b.cdiD),
      sumB(B, (b) => b.cdiPa)]); return v == null ? '–' : i1(v); },
    /* PASSIVE and DETRACTOR, and nothing else — the two Employee Productivity
       opens, for the reason it gives: the row above IS the percentage, and the
       percentage is what Promotor already speaks for. Passive is the bucket
       nobody could see; Detractor is the one that costs. All three are still
       COUNTED and the formula is untouched — only the two worth reading are
       drawn. Feedback (N) came off with Promotor: it is the sum of buckets the
       reader can see plus the one the percentage implies, and this table is
       eleven rows deep before anything is unfolded. */
    kids: () => [
      { lab: 'Passive', u: 'count', mid: true, val: (b) => b.cdiPa, f: (v) => String(v),
        tot: (B) => String(sumB(B, (b) => b.cdiPa)) },
      { lab: 'Detractor', u: 'count', mid: true, val: (b) => b.cdiD, f: (v) => String(v),
        tot: (B) => String(sumB(B, (b) => b.cdiD)) },
    ] },
];

/* ---------------------------------------------------------------------------
   The conversation — a gap the manager cannot put into a sentence is a gap
   nobody acts on. Counts come off the engineer's own figures, so the sentence
   survives being read out in front of him.
   ------------------------------------------------------------------------ */

/** THE FOUR POINTS.

    What replaced the old "what the shortfall is worth" section, and why: that
    block priced every gap in rupees and then read the price out as a sentence.
    It was built when the figures were generated and it does not survive real
    data. A man the LMS file attributes no conversion to had "₹1,50,000 at
    stake", "earns ₹0 a job", "attaches ₹0 of parts a job where the branch
    attaches ₹0" and an ask to "raise one AMC on every 2th job". Every one of
    those is a null read as a zero, dressed up as advice.

    Four points instead, each one thing a manager can act on, each built ONLY
    from figures the files actually carry, and each carrying its own comparison
    so the number means something. A point whose source has nothing to say
    prints what is missing and what to upload — never a zero.

    The four are chosen to cover the nine commitments without repeating them:
    what he DID, what it EARNED, whether he was THERE, and how the work LANDED.
*/
function pointsOf(se, br) {
  const P = [];
  const cmp = (v, t) => (v == null ? 'na' : (v >= t ? 'ok' : (v >= t * 0.85 ? 'near' : 'miss')));
  /* The EFSR file answers two questions and can answer one without the other:
     an engineer has days he worked but no task with an end date on it, so
     first-site exists and same-day closure does not. Each clause is therefore
     built only where its own figure is. */
  const disc = () => {
    const bits = [];
    if (se.v.first != null) {
      bits.push(`first site before 10:00 on <b>${se.fsOn} of ${se.fsDays}</b> days`);
    }
    if (se.v.sfTask != null) {
      bits.push(`<b>${se.v.sfTask}%</b> of the SRs allocated to him closed the same day`);
    }
    return bits.length ? bits.join(' and ') : '';
  };

  // 1 — OUTPUT. The volume commitment and the rate it was done at, against
  // the branch, because a number with nothing beside it is not a reading.
  const srT = targetFor(COMMITMENTS.find((k) => k.key === 'sr'));
  P.push(se.v.sr == null ? {
    k: 'out', lab: 'Work done', tone: 'na', big: '–',
    sub: 'not in the MaxTTR file',
    say: 'The \'Response Time & MaxTTR Details\' import does not name this engineer, so his SR '
      + 'count and productivity are blank and both are left out of his score. Check how his name '
      + 'is spelt in that file against the SE UID Master.',
  } : {
    k: 'out', lab: 'Work done', tone: cmp(se.v.sr, srT), big: iN(se.v.sr),
    sub: `SRs closed · commitment ${iN(srT)}`,
    say: `${iN(se.v.sr)} SRs over ${trim2(Math.round(se.workDays))} working days — `
      + `<b>${trim2(se.v.prod)} a working day</b>`
      + (br.prod != null ? `, against <b>${trim2(br.prod)}</b> for the rest of ${se.branch}.` : '.')
      + (se.v.sr < srT ? ` ${iN(srT - se.v.sr)} short of the ${iN(srT)} committed.` : ' Commitment met.'),
  });

  // 2 — WHAT IT EARNED. Spare and labour together, because the commitment is
  // read as revenue and one without the other is half the answer.
  const spT = targetFor(COMMITMENTS.find((k) => k.key === 'spare'));
  const lbT = targetFor(COMMITMENTS.find((k) => k.key === 'labour'));
  const rev = (se.v.spare == null && se.v.labour == null)
    ? null : (se.v.spare || 0) + (se.v.labour || 0);
  P.push(rev == null ? {
    k: 'rev', lab: 'Revenue attributed', tone: 'na', big: '–',
    sub: 'no converted lead on his UID',
    say: 'The LMS file attributes no converted lead to this engineer in the period, so spare and '
      + 'labour are blank rather than zero. Most conversion money in that file carries no Service '
      + 'Engineer UID at all — it belongs to the branch and to nobody in it.',
  } : {
    k: 'rev', lab: 'Revenue attributed', tone: cmp(rev, spT + lbT),
    big: `₹${iL(rev)}L`, sub: `spare + labour · commitment ₹${iL(spT + lbT)}L`,
    say: `Spare <b>₹${iN(se.v.spare || 0)}</b> of ₹${iN(spT)} and labour `
      + `<b>₹${iN(se.v.labour || 0)}</b> of ₹${iN(lbT)}, on his own converted LMS leads`
      + ((se.v.sr && rev) ? ` — ₹${iN(rev / se.v.sr)} a job.` : '.')
      + ` AMC generation ${se.v.amcLead == null ? 'not attributable' : `${se.v.amcLead} of ${targetFor(COMMITMENTS.find((k) => k.key === 'amcLead'))}`}`
      + `, batteries ${se.v.battery == null ? 'not attributable' : `${trim2(se.v.battery)} of ${targetFor(COMMITMENTS.find((k) => k.key === 'battery'))}`}.`,
  });

  // 3 — WAS HE THERE. Attendance is the one commitment a man can be dismissed
  // over, so it is never inferred: HR said it or it is blank.
  const atT = targetFor(COMMITMENTS.find((k) => k.key === 'attend'));
  P.push(se.present == null ? {
    k: 'att', lab: 'Days worked', tone: 'na', big: '–',
    sub: 'HR attendance not uploaded',
    say: `The period holds <b>${trim2(Math.round(se.workDays))} working days</b> from the AOP `
      + 'master, but HR has not sent the Attendance Summary for it, so attendance is blank and is '
      + 'left out of his score.'
      + (se.taskEnd != null ? ` The EFSR file does show him finishing a job on <b>${se.taskEnd} days</b>.` : ''),
  } : {
    k: 'att', lab: 'Days worked', tone: cmp(se.v.attend, atT),
    big: `${trim2(se.present)}/${trim2(Math.round(se.workDays))}`,
    sub: `days present · ${se.v.attend}% against ${atT}%`,
    say: `Present <b>${trim2(se.present)}</b> of ${trim2(Math.round(se.workDays))} working days `
      + `(<b>${se.v.attend}%</b>), on HR's own attendance`
      + (se.taskEnd != null ? `, and finishing a job in the field on <b>${se.taskEnd}</b> of them.` : '.'),
  });

  // 4 — HOW THE WORK LANDED. The customer's verdict and the two habits that
  // decide it, together: they are one conversation, not three.
  const cdT = targetFor(COMMITMENTS.find((k) => k.key === 'cdi'));
  P.push(se.v.cdi == null ? {
    k: 'qual', lab: 'How it landed', tone: 'na', big: '–',
    sub: 'no customer feedback on record',
    say: 'The CDI Detail Report holds no feedback for this engineer in the period.'
      + (disc() ? ` On discipline: ${disc()}.` : ''),
  } : {
    k: 'qual', lab: 'How it landed', tone: cmp(se.v.cdi, cdT), big: `${se.v.cdi}%`,
    sub: `CDI from ${plural(se.cdiN, 'feedback')} · target ${cdT}%`,
    say: `<b>${se.cdiP}</b> promotor${se.cdiP === 1 ? '' : 's'} and <b>${se.cdiD}</b> detractor`
      + `${se.cdiD === 1 ? '' : 's'} of ${plural(se.cdiN, 'customer')}.`
      + (disc() ? ` On discipline: ${disc()}.`
        : ' The EFSR file has no task of his in the period, so the discipline figures are blank.'),
  });

  return P;
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
  // null, not a number, when HR has not sent the month: 'absent every day' is
  // what a missing file would otherwise assert
  const absent = se.present == null ? null
    : Math.max(0, +(Math.round(se.workDays || 0) - se.present).toFixed(1));

  // How he sits against the people doing the same job in the same branch — the
  // only fair comparison, and the one he will make himself.
  const peers = (allSes || []).filter((x) => x.bid === se.bid && x.key !== se.key);
  // over the peers who HAVE the figure — SR CLOSED is null for an engineer the
  // MaxTTR file never names, and one such peer would make the branch average
  // NaN and print as nothing at all
  const pAvg = (f) => {
    const k = peers.map(f).filter((x) => x != null && isFinite(x));
    return k.length ? k.reduce((a, x) => a + x, 0) / k.length : null;
  };
  const branch = {
    n: peers.length + 1,
    rank: (allSes || []).filter((x) => x.bid === se.bid).sort((a, b) => b.score - a.score)
      .findIndex((x) => x.key === se.key) + 1,
    sr: pAvg((x) => x.v.sr), prod: pAvg((x) => x.v.prod),
    spareSr: pAvg((x) => (x.v.sr ? x.v.spare / x.v.sr : 0)),
    labSr: pAvg((x) => (x.v.sr ? x.v.labour / x.v.sr : 0)),
  };

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

  // Skill gap, application gap or discipline — three problems, three answers.
  // Kept because the KPI table's own Status column reads it; the paragraphs it
  // used to feed are gone (see pointsOf).
  const actions = miss.map((k) => {
    const t = hasTraining(k);
    if (t === null) return { k, type: 'Discipline', tone: 'bad' };
    if (t) return { k, type: 'Application', tone: 'warn' };
    return { k, type: 'Skill', tone: 'warn' };
  });

  return { met, miss, near, comply, support, tr, branch,
    points: pointsOf(se, branch),
    rev, perSR, perDay, absent, verdict, tone, why, actions, tenure: tenureOf(se) };
}

/** The short summary that sits between the numbers and the charts. */
export function summaryOf(se, B) {
  const T = (k) => B.reduce((a, b) => a + (b[k] || 0), 0);
  const sr = T('sr'); const pres = T('pres'); const work = T('work');
  // How many MONTHS the columns are worth, and how many of them HR has sent.
  // A quarter or a financial year is read as its average month — 484 of 626
  // days is not a figure anyone holds in their head — and the average has to
  // be taken over the months there is attendance FOR, not over all of them.
  const mf = T('mf') || 1; const hrMf = T('hrMf');
  const workM = work / mf;                       // man-days in an average month
  const presM = hrMf ? pres / hrMf : null;       // days present in an average month
  const workHr = work * (hrMf / mf);             // man-days of the covered months
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

  const say = [];
  // An engineer with no row in the MaxTTR file has no SR figure at all, and the
  // buckets carry zeroes for him because a bucket has to carry a number. Saying
  // "closed 0 SRs" out of those zeroes turns a gap in the data into an
  // accusation, so the sentence says what is actually true instead.
  say.push(se.srDay
    ? `Closed <b>${sr} SRs</b> over <b>${pres} days present</b> — <b>${pres ? (sr / pres).toFixed(2) : '–'} a day present</b>, `
      + `against the ${iN(S.targets.sr)}-a-month commitment (${(S.targets.sr * nMonths).toFixed(0)} over the ${nMonths < 1.02 ? 'month' : `${nMonths.toFixed(0)} months`} shown).`
    : '<b>No SR history.</b> The \'Response Time &amp; MaxTTR Details\' import does not name this '
      + 'engineer, so his SR count, his productivity and everything priced off them are blank '
      + 'rather than zero — and the SR commitment is left out of his score. Check the spelling of '
      + 'his name in that file against the SE UID Master.');
  if (srMix[0] && srMix[0].n) {
    say.push(`The load is mostly <b>${srMix[0].t}</b> (${Math.round((srMix[0].n / Math.max(1, sr)) * 100)}% of SRs)`
      + (srMix[1] && srMix[1].n ? `, then ${srMix[1].t} (${Math.round((srMix[1].n / Math.max(1, sr)) * 100)}%)` : '') + '.');
  }
  say.push(`Revenue <b>₹${(rev / 1e5).toFixed(2)} L</b> — spare ₹${(T('spare') / 1e5).toFixed(2)} L`
    + (partMix[0] && partMix[0].v ? ` (mostly ${partMix[0].c})` : '')
    + `, labour ₹${(T('labour') / 1e5).toFixed(2)} L — against ₹${((revT * nMonths) / 1e5).toFixed(2)} L committed.`);
  const attPct = (workHr && hrMf) ? ((pres / workHr) * 100).toFixed(1) : null;
  say.push(hrMf === 0
    ? `The period holds <b>${trim2(workM)} working days</b> from the AOP master, but HR has not `
      + 'uploaded the Attendance Summary for it — days present and attendance are blank rather '
      + 'than zero, and Attendance is left out of his score.'
    : mf > 1.2
      ? `Over ${Math.round(mf)} months: <b>${trim2(work)} working days</b>, present on <b>${trim2(pres)}</b> `
        + `(${attPct}%) — an average of <b>${trim2(presM)} of ${trim2(workM)}</b> a month`
        + (hrMf < mf - 0.01 ? `, from the ${Math.round(hrMf)} month${Math.round(hrMf) === 1 ? '' : 's'} HR has sent.` : '.')
      : `The period holds <b>${trim2(workM)} working days</b> — present on <b>${trim2(pres)}</b>, `
        + `absent on <b>${trim2(Math.max(0, workM - pres))}</b> (${attPct}%).`);
  say.push(`Customer feedback: <b>${P} promotor · ${Pa} passive · ${Dt} detractor</b> out of ${N}.`);
  say.push(missed.length
    ? `Strongest on <b>${plain(best.short)}</b>; short on <b>${missed.slice(0, 3).map((k) => plain(k.short)).join('</b>, <b>')}</b>.`
    : `Every commitment kept — strongest on <b>${plain(best.short)}</b>.`);

  return { sr, pres, work, rev, revT, nMonths, met, say,
    mf, hrMf, workM, presM, workHr, attPct };
}
