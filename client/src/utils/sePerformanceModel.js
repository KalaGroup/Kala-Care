/* ============================================================================
   SE Performance — the model behind the report.

   Everything on the page that is a NUMBER is decided here; the components only
   draw it. Kept out of the components on purpose: the twelve commitments, how
   a period resolves against them and how an engineer's figures roll up are
   business rules, and they have to be readable in one place when the business
   changes them.

   Layout and wording follow prototypes/SE Performance Report.html.

   WHAT IS REAL AND WHAT IS NOT
   ----------------------------
   REAL, from GET /pms/report/se-performance:
       branches (+ region)   the AOP master + the ERP list
       engineers             the SE UID Master — name, UID, branch, code
       trainings             the Training Report — skill, category, date
   GENERATED, deterministically, from the engineer's own UID:
       every one of the twelve commitment figures, and everything derived from
       them (score, grade, the money, the bifurcations, the day/week/month
       series). The counting rules are not agreed yet. When they are, the
       generator below is what gets deleted — nothing else in the page knows
       the difference, because it all reads se.base / se.v.
   ========================================================================= */

/* ---------------------------------------------------------------------------
   1. THE COMMITMENT MODEL — Annexure I, transcribed
   ------------------------------------------------------------------------ */

// dir: 'min'   -> at or above target is 100%
//      'range' -> inside [lo,hi] is 100%, outside falls away proportionally
// perMonth: the form writes this one "/ Month", so it scales with the period.
//      A percentage or a rating is a RATE — it means the same over a day, a
//      month or a year, and multiplying it would be nonsense.
// agg: how a branch / region roll-up combines its engineers
// info: a reference column, not a commitment — no target, never scored
export const KPIS = [
  { no: 1, key: 'sr', perMonth: true, name: 'CSP/PW BD/CM together Min SR Count', short: 'SR Count',
    head: 'SR Count', unit: 'count', fmt: 'int', target: 60, dir: 'min',
    commit: 'Minimum 60 SR’s', hint: 'UW / Bandhan / PM / CM / BD', agg: 'sum', sec: 'vol' },

  // --- reference columns, NOT commitments ---------------------------------
  { no: null, sortNo: 1.5, key: 'prod', name: 'Productivity — SR Close per Day Present',
    short: 'Productivity', head: 'Productivity', unit: 'SR / day', fmt: 'rate2',
    target: null, dir: null, commit: 'SR ÷ days present', hint: 'closed SRs per day worked',
    agg: 'derived', sec: 'vol', info: true, derive: (v) => (v.present ? v.sr / v.present : 0) },

  { no: 2, key: 'spare', perMonth: true, name: 'Spare Parts Sales / Month', short: 'Spare Sales',
    head: 'Spare Sales', unit: '₹', fmt: 'amt', target: 150000, dir: 'min',
    commit: 'Minimum ₹1,50,000', hint: 'part revenue booked by the engineer', agg: 'sum', sec: 'rev' },
  { no: 3, key: 'labour', perMonth: true, name: 'Labour Revenue Generation / Month', short: 'Labour Rev.',
    head: 'Labour Rev.', unit: '₹', fmt: 'amt', target: 60000, dir: 'min',
    commit: 'Minimum ₹60,000', hint: 'labour value on SRs closed', agg: 'sum', sec: 'rev' },

  { no: 4, key: 'amcLead', perMonth: true, name: 'AMC Lead Generation / Month', short: 'AMC Leads',
    head: 'AMC Leads', unit: 'count', fmt: 'int', target: 5, dir: 'min',
    commit: 'Minimum 5 Leads', hint: 'LMS leads, category AMC', agg: 'sum', sec: 'lead' },
  { no: 5, key: 'battery', perMonth: true, name: 'Battery Sell / Month', short: 'Battery',
    head: 'Battery', unit: 'count', fmt: 'int', target: 3, dir: 'min',
    commit: 'Minimum 3 Batteries', hint: 'converted battery leads', agg: 'sum', sec: 'lead' },
  { no: 12, key: 'lms', name: 'Leads to be updated on LMS', short: 'LMS Update', head: 'LMS Update',
    unit: '%', fmt: 'pct', target: 100, dir: 'min', commit: '100%',
    hint: 'leads raised vs leads eligible', agg: 'avg', sec: 'lead' },

  { no: 6, key: 'first', name: 'First Site Reporting Daily', short: '1st Site <10 AM', head: '1st Site',
    unit: '%', fmt: 'pct', target: 100, dir: 'min', commit: 'Before 10:00 AM',
    hint: '% of days reporting before 10:00', agg: 'avg', sec: 'disc' },
  { no: 8, key: 'sfTask', name: 'Salesforce Task Closure Daily', short: 'SF Task Closure', head: 'SF Task',
    unit: '%', fmt: 'pct', target: 100, dir: 'min', commit: 'Before Leaving Site',
    hint: '% of tasks closed on the visit day', agg: 'avg', sec: 'disc' },
  { no: 10, key: 'attend', name: 'Attendance & Discipline', short: 'Attendance', head: 'Attendance',
    unit: '%', fmt: 'pct', target: 95, dir: 'min', commit: 'Minimum 95%',
    hint: 'days present ÷ working days', agg: 'avg', sec: 'disc' },

  { no: 7, key: 'closure', name: 'SR / eFSR Closure Daily', short: 'SR Closure', head: 'SR Closure',
    unit: '%', fmt: 'pct', target: 95, dir: 'min', commit: '95% Within Timeline',
    hint: '% closed inside MaxTTR', agg: 'avg', sec: 'qual' },
  { no: 9, key: 'cdi', name: 'Customer Satisfaction — CDI', short: 'CDI Rating', head: 'CDI',
    unit: '/10', fmt: 'rate', target: 9, dir: 'min', commit: 'Minimum 9/10 Rating',
    hint: 'engineer’s CDI rating', agg: 'avg', sec: 'qual' },
  { no: 11, key: 'wetPm', name: 'Min. Time Spent for Wet PM SR’s', short: 'Wet PM Hrs', head: 'Wet PM Hrs',
    unit: 'hrs', fmt: 'hrs', target: [1.5, 2.0], dir: 'range', commit: '1.5 to 2.0 Hrs',
    hint: 'avg on-site hours, Wet PM SRs', agg: 'avg', sec: 'qual' },
];

KPIS.forEach((k) => { if (k.sortNo === undefined) k.sortNo = k.no; });

/** The twelve signed commitments — what the score, the grade and the matrix are
    made of. The reference columns are deliberately outside it. */
export const COMMITMENTS = KPIS.filter((k) => !k.info);

/** What the branch issues. [short label, the full wording]. */
export const SUPPORT = [
  ['Uniform', 'Uniform issued'],
  ['ID card', 'ID card issued'],
  ['PPE set', 'PPE set — helmet, gloves, safety shoes'],
  ['Tool kit', 'Tool kit issued'],
  ['Measuring instruments', 'Measuring instruments issued'],
  ['eFSR app access', 'Mobile / eFSR app access'],
  ['Travel & conveyance', 'Travel & conveyance support'],
  ['Coordinator support', 'Coordinator / back-office support'],
];

/** The tick list under the KPI table on the paper form. */
export const COMPLY = [
  'Uniform, ID Card & PPE Usage at all times',
  'Proper Tool Kit Availability',
  'Machine Health Check During Every Visit',
  'Promote Spare Parts, Batteries, Coolant, Filters & AMC',
  'Explain Work Done and Site Status to Customer',
  'Maintain Professional Behaviour & Safety Standards',
  'No Repeat Complaints Due to Poor Workmanship',
  'Timely Response to Coordinator and Customer Communication',
];

/** The dimensions each metric bifurcates on. SR TYPE follows the 'SR Type
    Master (MaxTTR)' heads the reports already use; the part categories are the
    Part Sale file's own PART CATEGORY. */
export const SR_TYPES = ['Warranty', 'PW', 'AMC', 'KOEL AMC', 'CSP', 'Others'];
export const PART_CATS = ['Filters', 'Battery', 'Coolant', 'K-Oil', 'DEF', 'Spares', 'Others'];

/** Which trainings bear on which commitment. The point is not to score the
    training — it is to tell a SKILL gap from an APPLICATION gap from a
    DISCIPLINE gap, because the three have three different answers. `null`
    marks the ones no course can fix. */
export const TRAIN_FOR = {
  sr: ['LkVA', 'MkVA', 'HkVA', 'Industrial', 'CPCB', 'BS V', 'BSIV', 'CRDI', 'Engine', 'R550', 'K4300', 'Power Car', 'Bio Gas'],
  closure: ['Breakdown', 'Industrial', 'CRDI', 'Engine', 'R550', 'K4300', 'CPCB'],
  wetPm: ['PM'],
  cdi: ['Brand Ambassador'],
  spare: ['Brand Ambassador', 'KCC'],
  labour: ['LkVA', 'MkVA', 'HkVA', 'Industrial', 'CPCB'],
  amcLead: ['Brand Ambassador'],
  battery: ['Inverter', 'Jump Start', 'KCC'],
  first: null, sfTask: null, lms: null, attend: null,
};

export const RG_NAME = { MH: 'Maharashtra', KA: 'Karnataka' };

/** Branch codes are '420435_1' … '420435_14'. Sorted as text that puts 10
    before 2, so the number is pulled out and compared as a number — the board
    then reads in the order the business numbers its branches. */
export const branchOrder = (id) => {
  const m = /_(\d+)\s*$/.exec(String(id || ''));
  return m ? +m[1] : 9999;
};
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ---------------------------------------------------------------------------
   2. THE PERIOD

   One SE Performance page is open at a time, so the period lives here as module
   state rather than being threaded through forty functions. setPeriod() is the
   only way in, and it re-resolves every engineer.
   ------------------------------------------------------------------------ */

const MSD = 86400000;
export const pdate = (d) => new Date(d + 'T00:00:00');
export const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addD = (s, n) => { const d = pdate(s); d.setDate(d.getDate() + n); return isoOf(d); };
const daysBetween = (a, b) => Math.round((pdate(b) - pdate(a)) / MSD) + 1;
const monthDays = (y, m) => new Date(y, m + 1, 0).getDate();
const sundaysIn = (y, m) => {
  let n = 0; const d = monthDays(y, m);
  for (let k = 1; k <= d; k++) if (new Date(y, m, k).getDay() === 0) n++;
  return n;
};

export const S = {
  from: '', to: '',
  gran: 'day',
  months: 1,                       // how many months the period is worth
  targets: Object.fromEntries(KPIS.map((k) => [k.key, Array.isArray(k.target) ? k.target.slice() : k.target])),
  weights: Object.fromEntries(KPIS.map((k) => [k.key, 1])),
};

/** The months the period touches, each with the fraction of it that falls
    inside and the Sundays in the overlap. */
export function periodSpan() {
  const out = [];
  if (!S.from || !S.to) return out;
  let d = pdate(S.from);
  d = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = pdate(S.to);
  while (d <= end && out.length < 60) {
    const y = d.getFullYear(); const m = d.getMonth(); const dim = monthDays(y, m);
    const a = isoOf(new Date(y, m, 1)) > S.from ? isoOf(new Date(y, m, 1)) : S.from;
    const b = isoOf(new Date(y, m, dim)) < S.to ? isoOf(new Date(y, m, dim)) : S.to;
    const over = daysBetween(a, b);
    if (over > 0) {
      let sun = 0;
      for (let k = pdate(a).getDate(); k <= pdate(b).getDate(); k++) {
        if (new Date(y, m, k).getDay() === 0) sun++;
      }
      out.push({ y, m, dim, from: a, to: b, days: over, f: over / dim, sun });
    }
    d = new Date(y, m + 1, 1);
  }
  return out;
}

/** The commitment AS IT APPLIES TO THE SELECTED PERIOD. 60 SRs a month is 180
    over a quarter; 95% within timeline is 95% however long you look. */
export function targetFor(k) {
  const t = S.targets[k.key];
  return k.perMonth ? t * S.months : t;
}

export function achieve(k, v) {
  if (k.info) return null;                       // a reference column has no target
  if (v === null || v === undefined || !isFinite(v)) return null;
  const t = targetFor(k);
  if (k.dir === 'range') {
    const [lo, hi] = t;
    if (v >= lo && v <= hi) return 100;
    return v < lo ? (lo ? (v / lo) * 100 : 0) : (v ? (hi / v) * 100 : 0);
  }
  return t ? (v / t) * 100 : 0;
}

export const statusOf = (p) => (p === null ? 'na' : (p >= 100 ? 'ok' : (p >= 85 ? 'near' : 'miss')));
export const gradeOf = (s) => (s >= 90 ? 'A' : s >= 80 ? 'B' : s >= 70 ? 'C' : s >= 60 ? 'D' : 'E');

export function scoreOf(row) {
  let num = 0; let den = 0;
  for (const k of COMMITMENTS) {
    const w = +S.weights[k.key] || 0;
    if (!w) continue;
    const p = achieve(k, row.v[k.key]);
    if (p === null) continue;
    num += Math.min(100, p) * w; den += w;
  }
  return den ? +(num / den).toFixed(1) : 0;
}

/* ---------------------------------------------------------------------------
   3. THE GENERATOR — deterministic, and the only part that is not real
   ------------------------------------------------------------------------ */

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1103515245 + 12345) >>> 0; return (s >>> 8) / 0xFFFFFF; };
}
const pick = (r, lo, hi, step) => { const v = lo + r() * (hi - lo); return step ? Math.round(v / step) * step : v; };
// a "100% or nothing" commitment is met outright often enough in real life that
// the roster has to show both outcomes
const pctVal = (r, lo, hitChance) => (r() < hitChance ? 100 : +pick(r, lo, 99.4).toFixed(1));

/** Turn the engineer's key into a stable number for the generator. */
export const seedOf = (uid) => {
  const n = parseInt(String(uid).replace(/\D/g, ''), 10);
  if (Number.isFinite(n) && n > 0) return n;
  let h = 7;
  for (const ch of String(uid)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h || 1;
};

/** Build the roster the page works on. `roster` is the API payload. */
export function buildEngineers(roster) {
  const branches = (roster.branches || []).map((b) => ({
    id: b.branch_id, name: b.branch_name, region: (b.region || 'MH').toUpperCase(),
  }));
  const byId = Object.fromEntries(branches.map((b) => [b.id, b]));

  const ses = (roster.engineers || [])
    .filter((e) => byId[e.branch_id] && e.name)
    .map((e, i) => {
      // the generator is seeded on the report's own key, so an engineer whose
      // UID has not been filled in yet still gets stable figures
      const key = e.key || e.uid || `row${i}`;
      const r = rng(seedOf(key) * 7919 + i * 13);
      const br = byId[e.branch_id];
      const row = {
        key, name: e.name, bid: e.branch_id,
        uid: e.uid || '', code: e.code || '',
        region: br.region, branch: br.name,
        hired: e.hired || '',
        trainings: e.trainings || [],
        base: {
          // PRODUCTIVITY is what is generated — 1.0 to 1.5 SRs a day present,
          // the band the business asked for — and the SR count follows from it
          // and the days he was present. Generating SR directly and dividing
          // gave whatever productivity fell out.
          prodRate: +pick(r, 1.0, 1.5).toFixed(2),
          sr: 0,                                    // set per period by setPeriod()
          spare: pick(r, 20000, 340000, 5000),
          labour: pick(r, 8000, 165000, 2000),
          amcLead: Math.round(pick(r, 0, 12)),
          battery: Math.round(pick(r, 0, 9)),
          lms: pctVal(r, 46, 0.34),
          first: pctVal(r, 50, 0.30),
          sfTask: pctVal(r, 55, 0.32),
          attend: +pick(r, 62, 100).toFixed(1),
          closure: +pick(r, 60, 100).toFixed(1),
          cdi: +pick(r, 5.2, 10).toFixed(1),
          wetPm: +pick(r, 0.7, 2.9).toFixed(2),
        },
        // avg first-site arrival, shown on the matrix under KPI 6
        firstAvg: (() => {
          const m = Math.round(pick(r, 530, 650));
          return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        })(),
        comply: COMPLY.map(() => r() > 0.16),
        support: Array.from({ length: SUPPORT.length }, () => r() > 0.13),
      };
      row.base.sr = Math.round(row.base.prodRate * 22);   // a nominal month
      row.base.prod = row.base.prodRate;
      row.v = row.base;
      return row;
    });

  return { branches, ses };
}

/** One engineer's figures FOR THE PERIOD. Counts and money scale with the
    months; rates and ratings carry across as they are; working days and days
    present are counted off the calendar — every day but Sunday is worked. */
function periodOf(se) {
  const span = periodSpan();
  const months = span.reduce((a, x) => a + x.f, 0) || 1;
  const b = se.base;
  const work = span.reduce((a, x) => a + (x.days - x.sun), 0);
  const present = Math.min(work, Math.round((work * b.attend) / 100));
  const v = {
    sr: Math.max(1, Math.round(b.prodRate * present)),
    spare: b.spare * months,
    labour: b.labour * months,
    amcLead: Math.round(b.amcLead * months),
    battery: Math.round(b.battery * months),
    lms: b.lms, first: b.first, sfTask: b.sfTask, closure: b.closure, cdi: b.cdi, wetPm: b.wetPm,
    attend: work ? +((present / work) * 100).toFixed(1) : 0,
    present,
  };
  v.prod = +(present ? v.sr / present : 0).toFixed(2);
  return { v, months, work, present };
}

/** Set the period and re-resolve every engineer. Nothing on the page is scored
    against a commitment that has not been resolved to the period first. */
export function setPeriod(ses, from, to) {
  S.from = from; S.to = to;
  S.months = periodSpan().reduce((a, x) => a + x.f, 0) || 1;
  ses.forEach((se) => {
    const P = periodOf(se);
    se.v = P.v; se.workDays = P.work; se.present = P.present;
    se.score = scoreOf(se); se.grade = gradeOf(se.score);
  });
  return ses;
}

/** A branch / region roll-up. Counts sum, rates average, ratios recompute from
    the level's OWN totals — a branch's productivity is its SRs over its days
    present, never the mean of its engineers' rates. */
export function rollup(list) {
  const v = {};
  for (const k of KPIS) {
    if (k.agg === 'derived') continue;
    if (!list.length) { v[k.key] = null; continue; }
    if (k.agg === 'sum') v[k.key] = list.reduce((a, s) => a + s.v[k.key], 0);
    else v[k.key] = +(list.reduce((a, s) => a + s.v[k.key], 0) / list.length).toFixed(2);
  }
  v.present = list.reduce((a, s) => a + (s.present || 0), 0);
  for (const k of KPIS) {
    if (k.agg !== 'derived') continue;
    v[k.key] = list.length ? +k.derive(v).toFixed(2) : null;
  }
  const score = list.length ? +(list.reduce((a, s) => a + s.score, 0) / list.length).toFixed(1) : 0;
  return {
    v, score, grade: gradeOf(score), n: list.length,
    workDays: list.reduce((a, s) => a + (s.workDays || 0), 0),
    present: v.present,
  };
}

/* ---------------------------------------------------------------------------
   4. FORMATTING
   ------------------------------------------------------------------------ */

export const inr = (v) => Math.round(v).toLocaleString('en-IN');
export const iN = inr;
export const iL = (v) => (v / 1e5).toFixed(2);
export const i1 = (v) => v.toFixed(1);
/** 2.00 SRs a day is 2 SRs a day — decimals only when there are decimals. */
export const trim2 = (v) => (Number.isInteger(+v.toFixed(2)) ? String(+v.toFixed(2)) : v.toFixed(2));

/** The FULL figure with its unit — tooltips, the export and the matrix. */
export function fmtVal(k, v) {
  if (v === null || v === undefined || v === 0) return '–';
  switch (k.fmt) {
    case 'amt': return `₹${inr(v)}`;
    case 'pct': return `${v.toFixed(1)}%`;
    case 'rate': return v.toFixed(1);
    case 'rate2': return `${trim2(v)} SR/day`;
    case 'hrs': return v.toFixed(2);
    default: return Math.round(v).toLocaleString('en-IN');
  }
}
export function fmtTarget(k) {
  const t = targetFor(k);
  if (k.dir === 'range') return `${t[0].toFixed(1)}–${t[1].toFixed(1)} h`;
  return fmtVal(k, +t);
}
export const fmtPct = (p) => (p === null ? '–' : (p >= 999 ? '999+' : `${p.toFixed(0)}%`));
export const fmtDay = (s) => (s ? pdate(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '');

/** Inside the matrix every column is headed by its unit, so the cells carry the
    bare figure. */
export const bare = (t) => String(t).replace(/%/g, '').replace(/₹/g, '').replace(/ h$/, '').replace(/ SR\/day/, '').trim();
export const targetText = (k) => (k.dir === 'range'
  ? `${S.targets[k.key][0]}–${S.targets[k.key][1]}`
  : bare(fmtVal(k, targetFor(k))));

/** '0', '0.0', '0.00', '0%' — a formatted nothing. A compound cell like
    '0 / 5' is left alone: that zero is half a fact. */
export const dashZero = (t) => (/^0(\.0+)?%?$/.test(String(t).replace(/<[^>]*>/g, '').trim()) ? '–' : t);

export const plain = (t) => String(t).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
export const firstName = (n) => { const w = String(n).split(' '); return (w[0].length <= 3 && w[1]) ? `${w[0]} ${w[1]}` : w[0]; };
export const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || `${one}s`)}`;
export const fmtTrainDate = (d) => (d ? `${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : '—');

export function tenureOf(se) {
  if (!se.hired) return null;
  const y = (pdate(S.to) - pdate(se.hired)) / (365.25 * MSD);
  if (!isFinite(y) || y < 0) return null;
  return { from: se.hired, years: y, label: y >= 1 ? `${y.toFixed(1)} yrs` : `${Math.round(y * 12)} mo` };
}
