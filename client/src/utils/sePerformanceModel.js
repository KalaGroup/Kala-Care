/* ============================================================================
   SE Performance — the model behind the report.

   Everything on the page that is a NUMBER is decided here; the components only
   draw it. Kept out of the components on purpose: the commitments, how
   a period resolves against them and how an engineer's figures roll up are
   business rules, and they have to be readable in one place when the business
   changes them.

   Layout and wording follow prototypes/SE Performance Report.html.

   WHAT IS REAL AND WHAT IS NOT
   ----------------------------
   REAL, from GET /pms/report/se-performance:
       branches (+ region)   the AOP master + the ERP list
       engineers             the Training Report, ACTIVE ONLY — name, UID NO,
                             job title, branch, hire date
       employee id (code)    HR's employee code, the one the SE UID Master shows
       trainings             the Training Report — skill, category, date
       SPARE / LABOUR        the LMS file's PART and LABOUR INVOICE AMOUNTS on
                             the engineer's converted leads, dated on the
                             ORDER's creation date — Employee Productivity's
                             'Spare Conv. Amount' and 'Labour Conv. Amount',
                             rule for rule. READ THE NOTE ON convDay: most of
                             this money carries no engineer UID at all, so the
                             per-engineer figures are a fraction of the branch's.
       AMC LEADS             the LMS file, LEAD RAISED FOR mapped through the
                             Lead Category Master to 'AMC', on LEAD CREATED
                             DATE, by SERVICE ENGINEER UID.
       BATTERY SELL          the PART SALE records — part_category 'Battery',
                             QUANTITY summed on CLAIM INVOICE DATE, by that
                             file's own SE NAME. A SALE, so not the leads: only
                             4 battery leads in the whole file ever converted.
       1st SITE / SF TASK    the EFSR file. First site is a question about a
                             DAY — the earliest TASK START DATE of each day
                             against 10:00 — and SF Task Closure is measured as
                             SAME-DAY closure, the commitment's own 'Before
                             Leaving Site'. See efDay.
       SR COUNT              the EFSR file: one row per SERVICE ENGINEER UID
                             with a TASK END DATE, on that date — exactly the
                             way the SR Allocation report counts a closure.
                             This is the SR COUNT COMMITMENT.
       MaxTTR SR CLOSED      the 'Response Time & MaxTTR Details' import, day by
                             day, counted the way Employee Productivity counts
                             it. An engineer that file has never named carries
                             NULL, not zero, and is not scored on it — see srDay.
       WORKING DAYS          the month-wise working-days master (AOP Master),
                             per region, with the month's non-Sunday count as
                             the fallback — the same precedence EP uses.
       DAYS PRESENT          HR's monthly Attendance Summary. A WHOLE-MONTH
                             figure, so it is only offered for a period that IS
                             one uploaded month, and NULL for a month HR has
                             not sent — see hrPresent.
       PRODUCTIVITY          SR CLOSED / WORKING DAYS, which is Employee
                             Productivity's definition of it. Not per day
                             PRESENT: the target is the available man-days, and
                             an engineer cannot be credited for a rate he only
                             reached by being absent.
   GENERATED, deterministically, from the engineer's own UID:
       every one of the commitment figures, and everything derived from
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
//
// DROPPED from the signed set on the business's word (2026-09-02): 'SR / eFSR
// Closure Daily', 'Min. Time Spent for Wet PM SR’s' and 'Leads to be updated on
// LMS'. Nine commitments remain and the Sr. numbers were closed up so the
// printed Annexure has no holes in it. Removing one of these means deleting its
// KPIS entry, its TRAIN_FOR line, its key in the generator and in periodOf(),
// and whatever the series and the charts read off it — the score is a weighted
// mean over COMMITMENTS, so it re-bases itself.
/* ---------------------------------------------------------------------------
   THE COLOUR BANDS

   The Ach. % and Status columns on the signed matrix are coloured per KPI, to
   the business's own thresholds (2026-09-03) rather than to one generic
   at-target / near / short ladder. They were not derivable from the targets:
   Spare's middle band is a full ₹50,000 wide while Labour's is ₹5,000, and
   First Site is banded on the CLOCK, not on its percentage.

   Four tones, in order: ok, warn, amber, bad. Three thresholds were given per
   KPI, so `bad` is the floor below the last one — except where the business's
   own floor was already the third tone, and there amber IS the floor.

   A perMonth KPI's thresholds scale with the period exactly as its target
   does, so a two-month view bands against 120 SRs and not 60. Every period
   this page offers is one month, but the two must not be able to disagree.
   ------------------------------------------------------------------------ */
const ladder = (v, tiers, floor) => {
  for (const [t, tone] of tiers) if (v >= t) return tone;
  return floor;
};
/** Minutes past midnight, from 'HH:MM'. */

export const KPIS = [
  { no: 1, key: 'sr', perMonth: true, name: 'CSP/PW BD/CM together Min SR Count', short: 'SR Count',
    head: 'SR Count', unit: 'count', fmt: 'int', target: 60, dir: 'min',
    commit: 'Minimum 60 SR’s', hint: 'UW / Bandhan / PM / CM / BD', agg: 'sum', sec: 'vol',
    band: (se, v) => ladder(v, [[60 * S.months, 'ok'], [55 * S.months, 'warn'],
      [50 * S.months, 'amber']], 'amber') },

  // --- reference columns, NOT commitments ---------------------------------
  // Employee Productivity's own definition, so the two reports cannot quote
  // different rates for the same engineer: SR CLOSED over WORKING DAYS — the
  // available man-days from the AOP master — and NOT over days present. Days
  // present is attendance; dividing by it pays an absent engineer a bonus for
  // the days he was not there.
  { no: null, sortNo: 1.5, key: 'prod', name: 'Productivity — SR Close per Working Day',
    short: 'Productivity', head: 'Productivity', unit: 'SR / working day', fmt: 'rate2',
    target: null, dir: null, commit: 'MaxTTR close SR ÷ working days',
    hint: 'MaxTTR close SR ÷ available man-days',
    agg: 'derived', sec: 'vol', info: true,
    // workSr, not work: the divisor has to be the man-days of the engineers
    // whose SRs are IN the numerator. A branch where four of fifteen are absent
    // from the MaxTTR file would otherwise divide eleven engineers' SRs by
    // fifteen engineers' days and report a third of the real rate.
    derive: (v) => (v.workSr && v.maxSr != null ? v.maxSr / Math.round(v.workSr) : null) },

  // BOTH ARE LMS ONLY, and the hints say so because the wording used to imply
  // otherwise. 'Part revenue booked by the engineer' and 'labour value on SRs
  // closed' read as though they came off the invoice or the SR file; they do
  // not. They are the PART and LABOUR INVOICE AMOUNTS on the engineer's own
  // CONVERTED LMS leads — the same two figures Employee Productivity prints as
  // Spare / Labour Conv. Amount. Note that Battery Sell alone is NOT from LMS:
  // it is a unit count out of the part-sale file, because only four battery
  // leads in the whole file ever converted. See _se_performance_conversions
  // and _se_performance_leads_battery.
  { no: 2, key: 'spare', perMonth: true, name: 'Spare Parts Sales / Month', short: 'Spare Sales',
    head: 'Spare Sales', unit: '₹', fmt: 'amt', target: 150000, dir: 'min',
    commit: 'Minimum ₹1,50,000', hint: 'LMS part invoice on his converted leads',
    agg: 'sum', sec: 'rev',
    // the business's own floor is the third tone here, so amber is the floor
    band: (se, v) => ladder(v, [[150000 * S.months, 'ok'], [100000 * S.months, 'warn']], 'amber') },
  { no: 3, key: 'labour', perMonth: true, name: 'Labour Revenue Generation / Month', short: 'Labour Rev.',
    head: 'Labour Rev.', unit: '₹', fmt: 'amt', target: 60000, dir: 'min',
    commit: 'Minimum ₹60,000', hint: 'LMS labour invoice on his converted leads',
    agg: 'sum', sec: 'rev',
    band: (se, v) => ladder(v, [[60000 * S.months, 'ok'], [55000 * S.months, 'warn'],
      [50000 * S.months, 'amber']], 'amber') },

  // TARGET LOWERED 5 -> 3 on the business's word (2026-09-03).
  { no: 4, key: 'amcLead', perMonth: true, name: 'AMC Lead Generation / Month', short: 'AMC Generation',
    head: 'AMC Generation', unit: 'count', fmt: 'int', target: 3, dir: 'min',
    commit: 'Minimum 3 Leads', hint: 'LMS leads, category AMC', agg: 'sum', sec: 'lead',
    band: (se, v) => ladder(v, [[3 * S.months, 'ok'], [2 * S.months, 'warn']], 'amber') },
  { no: 5, key: 'battery', perMonth: true, name: 'Battery Sell / Month', short: 'Battery',
    head: 'Battery', unit: 'count', fmt: 'int', target: 3, dir: 'min',
    commit: 'Minimum 3 Batteries', hint: 'part-sale battery quantity', agg: 'sum', sec: 'lead',
    band: (se, v) => ladder(v, [[3 * S.months, 'ok'], [2 * S.months, 'warn']], 'amber') },

  /* THE COMMITMENT IS A CLOCK, so the figure held against it is a clock too:
     his AVERAGE first-site start time, against 10:00 AM, and the bands read off
     that same average — 10:00 green, 10:30 yellow, later amber.
     It used to be the PERCENTAGE OF DAYS that beat 10 o'clock, which was a
     third quantity nobody had asked for: the target read '100%', the
     achievement read a percentage, and the colour came from the average
     underneath — three different measurements in one row, and on a row where
     the percentage was null it printed a dash beside an amber SHORT.
     dir 'under' is what makes the achievement fall as he gets later: the
     target divided by the actual, so 10:00 against a 10:00 average is 100%,
     and a 1:32 PM average is 74%. 600 = 10:00, 630 = 10:30. */
  { no: 6, key: 'first', name: 'First Site Reporting Daily', short: '1st Site <10 AM', head: '1st Site',
    unit: 'clock time', fmt: 'time', target: 600, dir: 'under',
    commit: 'Before 10:00 AM',
    hint: 'average time his first site of the day started', agg: 'avg', sec: 'disc',
    band: (se, v) => (v == null ? 'na' : (v <= 600 ? 'ok' : (v <= 630 ? 'warn' : 'amber'))) },
  { no: 7, key: 'sfTask', name: 'Salesforce Task Closure Daily', short: 'SF Task Closure', head: 'SF Task',
    unit: '%', fmt: 'pct', target: 100, dir: 'min', commit: 'Before Leaving Site',
    hint: 'closed the same day it was allocated', agg: 'avg', sec: 'disc',
    // met or not met — there is no middle band for a daily habit
    band: (se, v) => (v >= 100 ? 'ok' : 'amber') },
  { no: 9, key: 'attend', name: 'Attendance & Discipline', short: 'Attendance', head: 'Attendance',
    unit: '%', fmt: 'pct', target: 95, dir: 'min', commit: 'Minimum 95%',
    hint: 'days present ÷ working days', agg: 'avg', sec: 'disc' },

  // EP's CDI, and therefore a NET-PROMOTER PERCENTAGE — (Promotor − Detractor)
  // / all feedback × 100 — not a mean rating out of ten.
  //
  // THE TARGET IS A READING OF THE FORM, NOT A FACT FROM IT. Annexure I says
  // 'Minimum 9/10 Rating'; there is no 0-10 rating in the CDI Detail Report to
  // hold him to, so 9 out of 10 is taken as 90%. Confirm that with the business
  // — the AOP master already keeps CDI percentage targets per FY and scope
  // (pms_cdi_targets), and if an engineer-level target belongs there instead,
  // this is the line that reads it.
  { no: 8, key: 'cdi', name: 'Customer Satisfaction — CDI', short: 'CDI %', head: 'CDI',
    unit: '%', fmt: 'pct', target: 90, dir: 'min', commit: 'Minimum 90%',
    hint: '(promotor − detractor) ÷ all feedback', agg: 'avg', sec: 'qual',
    band: (se, v) => ladder(v, [[90, 'ok'], [80, 'warn']], 'amber') },
];

KPIS.forEach((k) => { if (k.sortNo === undefined) k.sortNo = k.no; });

/** The signed commitments — what the score, the grade and the matrix are made
    of. The reference columns are deliberately outside it. */
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
  cdi: ['Brand Ambassador'],
  spare: ['Brand Ambassador', 'KCC'],
  labour: ['LkVA', 'MkVA', 'HkVA', 'Industrial', 'CPCB'],
  amcLead: ['Brand Ambassador'],
  battery: ['Inverter', 'Jump Start', 'KCC'],
  first: null, sfTask: null, attend: null,
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
  // the month-wise WORKING DAYS master, straight off the payload
  wd: { months: {}, universal: {} },
  // the last date the PMS files have any data for; working days are prorated
  // to it, so a month the data only half covers only offers half its man-days
  dataMax: '',
  // the months the lead file and the part-sale file can attribute anything to
  // anybody. Outside them the two figures are BLANK, not zero — August's
  // battery lines all carry an empty SE NAME, and 'nobody sold one' is not
  // what that means.
  amcMonths: null, battMonths: null,
  // the months HR's DAY-WISE attendance file has been uploaded for. Needed to
  // tell the two silences apart: a month with no file at all, and a month
  // whose file simply does not list this engineer.
  attMonths: [],
  targets: Object.fromEntries(KPIS.map((k) => [k.key, Array.isArray(k.target) ? k.target.slice() : k.target])),
  weights: Object.fromEntries(KPIS.map((k) => [k.key, 1])),
};

/** The AOP master's WORKING DAYS for one month, for one region — and for the
    month NOW RUNNING, only the part of it that has happened.

    Precedence for the month's figure is the same one every other PMS report
    uses: the saved row for that exact month ('2026-07'), then the universal
    per-calendar-month row ('ALL-07'), then the month's own non-Sunday day
    count. The last is a calendar fact rather than a business figure, which is
    why it is last.

    ==================================================================
    ONE DEFINITION, TWO REPORTS. Employee Productivity quotes the same
    engineer's productivity for the same month, and the business's instruction
    is that the two must not differ. So this is EP's arithmetic, verbatim:

        working days = master figure x (days of the month IN THE DATA
                                        / days in the month)

    CALENDAR days, not working days. Prorating by non-Sunday days is arguably
    the better measure and was written here first, but it puts the two reports
    a day apart in some months, and two rates that disagree is a worse fault
    than a rate that is a day coarse. EmployeeProductivityReport's wdOf() holds
    the other copy of this rule; CHANGE BOTH OR NEITHER.
    ==================================================================

    PRORATED TO WHERE THE DATA STOPS — not to today, and not to the end of the
    month the user picked. The master's figure is the WHOLE month's available
    man-days; the files reach the 24th of August, so six of them have not been
    reported on by anything. Selecting the whole month does not change that,
    which is why the clamp is on the DATA and not on the selection: a reader
    who picks 01-31 August must not be handed a lower rate than one who picks
    01-24 August, because it is the same work either way.

    Dividing by all 26 read one engineer at 21/26 = 0.81 where EP, whose period
    ends at the data, had him at 21/20 = 1.05. A month the data covers entirely
    is untouched; a month it has not reached at all offers no man-days at all,
    and productivity for it is blank rather than infinite. */
export function workDaysOf(region, y, m) {
  const key = `${y}-${String(m + 1).padStart(2, '0')}`;
  const r = String(region).toUpperCase() === 'KA' ? 'ka' : 'mh';
  const row = S.wd.months[key] || S.wd.universal[String(m + 1).padStart(2, '0')];
  const full = (row && row[r]) || (monthDays(y, m) - sundaysIn(y, m));

  const dim = monthDays(y, m);
  if (!S.dataMax || !dim) return Math.round(full);
  const dm = pdate(S.dataMax);
  const my = dm.getFullYear(); const mm = dm.getMonth();
  if (y < my || (y === my && m < mm)) return Math.round(full);   // wholly in the data
  if (y > my || (y === my && m > mm)) return 0;                  // never got here
  // A WHOLE NUMBER. A working day is a day: 01–24 August is 20 working days,
  // not 20.13 of them, and a man-day figure carrying two decimals is not a
  // figure anybody can check or argue with. EP rounds at the same point — it
  // prints Math.round(t.work) and divides by it — so rounding here keeps the
  // two reports identical and stops the fraction leaking into the header tile,
  // the period line and the breakdown's own divisor.
  return Math.round(full * (dm.getDate() / dim));                // the month it stops in
}

/** {iso day: [spare, labour]} and {'YYYY-MM': [spare, labour]} from the
    payload's conversion amounts.

    A WARNING, not a footnote: on real data most conversion money has NO
    Service Engineer UID on the lead, so it belongs to a branch and to no
    engineer. Employee Productivity keeps it in a per-branch 'Other' pair of
    columns; this report has no branch row to put it on, and drops it. So an
    engineer's spare and labour here are what the LMS file could ATTRIBUTE to
    him, which on the August window is ~₹1.3 lakh across the whole roster
    against ₹38 lakh unattributed. Both reports show the same small figures for
    the same reason. meta.conv carries the unattributed totals. */
function convMapsOf(pairs) {
  if (!pairs) return [null, null];
  const day = Object.create(null);
  const month = Object.create(null);
  for (const [iso, v] of Object.entries(pairs)) {
    day[iso] = v;
    const mk = iso.slice(0, 7);
    const m = month[mk] || (month[mk] = [0, 0]);
    m[0] += v[0]; m[1] += v[1];
  }
  return [day, month];
}
/** [spare, labour] between two ISO dates, inclusive. Null when the engineer has
    no conversion rows at all. */
export function convBetween(se, from, to) {
  if (!se.convDay) return null;
  const out = [0, 0];
  for (let d = from; d && d <= to; d = addD(d, 1)) {
    const v = se.convDay[d];
    if (v) { out[0] += v[0]; out[1] += v[1]; }
  }
  return out;
}
/** One day's [spare, labour]. */
export const convOn = (se, iso) => (se.convDay && se.convDay[iso]) || [0, 0];
/** One month's, keyed 'YYYY-MM'. */
export const convInMonth = (se, mk) => (se.convMonth && se.convMonth[mk]) || [0, 0];

/** {iso day: [a, b]} and the same by month, from a payload map of pairs. */
function pairMapsOf(rows) {
  if (!rows) return [null, null];
  const day = Object.create(null);
  const month = Object.create(null);
  for (const [iso, v] of Object.entries(rows)) {
    /* The server sends a PAIR per date - [allocated, closed that same day].
       A bare number is the OLD shape (an allocation count, from before the
       same-day pairing) and an out-of-date backend still serves it. Its second
       half is not a zero, it is UNKNOWN, so such a date is dropped entirely
       rather than reported as 'nothing was closed' - the row then prints a
       dash, which is true, instead of a 0% nobody earned. */
    if (!Array.isArray(v) || v.length < 2) continue;
    const a = Number(v[0]); const c = Number(v[1]);
    if (!isFinite(a) || !isFinite(c)) continue;
    day[iso] = [a, c];
    const mk = iso.slice(0, 7);
    const m = month[mk] || (month[mk] = [0, 0]);
    m[0] += a; m[1] += c;
  }
  return [day, month];
}

/** {iso day: n} and {'YYYY-MM': n} from a plain {iso: n} payload map. */
function countMapsOf(rows) {
  if (!rows) return [null, null];
  const day = Object.create(null);
  const month = Object.create(null);
  for (const [iso, n] of Object.entries(rows)) {
    day[iso] = (day[iso] || 0) + n;
    const mk = iso.slice(0, 7);
    month[mk] = (month[mk] || 0) + n;
  }
  return [day, month];
}

/** {iso day: [amc leads, batteries]} and the same by month. */
function lbMapsOf(rows) {
  if (!rows) return [null, null];
  const day = Object.create(null);
  const month = Object.create(null);
  for (const [iso, v] of Object.entries(rows)) {
    day[iso] = v;
    const mk = iso.slice(0, 7);
    const m = month[mk] || (month[mk] = [0, 0]);
    m[0] += v[0]; m[1] += v[1];
  }
  return [day, month];
}
export const lbOn = (se, iso) => (se.lbDay && se.lbDay[iso]) || [0, 0];
export const lbInMonth = (se, mk) => (se.lbMonth && se.lbMonth[mk]) || [0, 0];
/** Is this month one the source can attribute a record in? A month it cannot
    is a month the figure is unknown for, and unknown prints as a dash. */
const monthKnown = (list, mk) => (!list ? true : list.includes(mk));
export const amcMonthKnown = (mk) => monthKnown(S.amcMonths, mk);
export const battMonthKnown = (mk) => monthKnown(S.battMonths, mk);
/** AMC leads / batteries over a span, each null where no month of the span is
    one its source can speak for. */
export function lbBetween(se, span) {
  let a = 0; let b = 0; let aOk = false; let bOk = false;
  for (const x of span) {
    const mk = `${x.y}-${String(x.m + 1).padStart(2, '0')}`;
    const v = lbInMonth(se, mk);
    a += v[0]; b += v[1];
    if (amcMonthKnown(mk)) aOk = true;
    if (battMonthKnown(mk)) bOk = true;
  }
  return [aOk ? a : null, bOk ? b : null];
}

/** {iso day: [first-site on time, days, closed same day, tasks]}, and the same
    by month, from the EFSR file.

    FIRST SITE is a per-DAY fact and the payload has already reduced it to one:
    each day carries 1 or 0 for whether the engineer's EARLIEST task started
    before ten, and a 1 for the day itself. The percentage is therefore on-time
    days over days worked, struck from those counts at whatever grain is asked
    — never averaged from other percentages.

    SF TASK CLOSURE is a per-TASK fact: how many of the day's tasks were closed
    on the day they were worked, out of how many there were. */
function efMapsOf(rows) {
  if (!rows) return [null, null];
  const day = Object.create(null);
  const month = Object.create(null);
  for (const [iso, v] of Object.entries(rows)) {
    day[iso] = v;
    const mk = iso.slice(0, 7);
    const m = month[mk] || (month[mk] = [0, 0, 0, 0, 0]);
    for (let i = 0; i < 5; i++) m[i] += (v[i] || 0);
  }
  return [day, month];
}
/** [on time, days, closed same day, tasks, first-start minutes] over a span;
    null when the EFSR
    file has never named the engineer. */
export function efBetween(se, from, to) {
  if (!se.efDay) return null;
  const out = [0, 0, 0, 0, 0];
  for (let d = from; d && d <= to; d = addD(d, 1)) {
    const v = se.efDay[d];
    if (v) for (let i = 0; i < 5; i++) out[i] += (v[i] || 0);
  }
  return out;
}
export const efOn = (se, iso) => (se.efDay && se.efDay[iso]) || [0, 0, 0, 0, 0];
export const efInMonth = (se, mk) => (se.efMonth && se.efMonth[mk]) || [0, 0, 0, 0, 0];
/** Minutes past midnight as 'HH:MM'. */
/** Minutes past midnight as a 12-HOUR clock time: 918 -> '3:18 PM'.

    The whole business reads times this way, and a site-arrival figure judged
    against 'before 10:00 AM' has to be written the way the commitment is
    written. Noon and midnight are the two the 24-hour form gets wrong when it
    is converted carelessly: hour 0 is 12 AM and hour 12 is 12 PM, not 0 and 0.
    The hour is NOT zero-padded — '9:45 AM', not '09:45 AM' — because that is
    how a clock is read aloud. */
export const hhmm = (mins) => {
  const t = Math.round(mins);
  const h24 = Math.floor(t / 60) % 24;
  const m = t % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
};
/** A percentage struck from a count over a count — null when the denominator is
    nothing, because a percentage of no days is not 0%. */
export const pctOf = (a, b) => (b ? +((a / b) * 100).toFixed(1) : null);

/** {iso day: [promotor, detractor, passive]} and the same by month. */
function cdiMapsOf(rows) {
  if (!rows) return [null, null];
  const day = Object.create(null);
  const month = Object.create(null);
  for (const [iso, v] of Object.entries(rows)) {
    day[iso] = v;
    const mk = iso.slice(0, 7);
    const m = month[mk] || (month[mk] = [0, 0, 0]);
    m[0] += v[0]; m[1] += v[1]; m[2] += v[2];
  }
  return [day, month];
}
/** [promotor, detractor, passive] between two ISO dates, inclusive; null when
    the CDI file has never named the engineer. */
export function cdiBetween(se, from, to) {
  if (!se.cdiDay) return null;
  const out = [0, 0, 0];
  for (let d = from; d && d <= to; d = addD(d, 1)) {
    const v = se.cdiDay[d];
    if (v) { out[0] += v[0]; out[1] += v[1]; out[2] += v[2]; }
  }
  return out;
}
export const cdiOn = (se, iso) => (se.cdiDay && se.cdiDay[iso]) || [0, 0, 0];
export const cdiInMonth = (se, mk) => (se.cdiMonth && se.cdiMonth[mk]) || [0, 0, 0];
/** EP's figure: (P − D) / all feedback × 100. Null on no feedback at all —
    a percentage of nothing is not 0%, it is not a percentage. */
export const cdiPct = (b) => {
  const n = b[0] + b[1] + b[2];
  return n ? +(((b[0] - b[1]) / n) * 100).toFixed(1) : null;
};

/** DAYS PRESENT ON TASK END for the period, or null.

    Employee Productivity's third day figure: the distinct days the engineer
    ENDED at least one task, out of the MaxTTR file. Unlike HR's attendance
    this is a per-day fact, so it sums cleanly over any span of whole months —
    which is every period this page offers. Null only when the file has never
    named him. */
export function teFor(se, span) {
  if (!se.te) return null;
  let n = 0;
  for (const x of span) {
    const k = `${x.y}-${String(x.m + 1).padStart(2, '0')}`;
    n += se.te[k] || 0;
  }
  return n;
}

/** HR's days present for the period, or NULL.

    Attendance is a WHOLE-MONTH figure — HR's file has one row per person per
    month and no day detail — so it is only offered when the period IS one
    uploaded calendar month, exactly the rule Employee Productivity states for
    its own HR column. A part month would divide that month's work by a full
    month of attendance and read low. Null means HR has not sent that month;
    it does not mean nobody came in. */
export function hrPresentFor(se, span) {
  if (!se.hr || span.length !== 1) return null;
  const x = span[0];
  if (x.days !== x.dim) return null;              // a part month is not a month
  const k = `${x.y}-${String(x.m + 1).padStart(2, '0')}`;
  return (k in se.hr) ? se.hr[k] : null;
}

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
  // 'under' — the actual has to come in BELOW the target, so the ratio is the
  // other way up. A clock is the case: 10:00 against a 10:00 average is 100%,
  // an average half an hour later is 95%, one at 1:32 PM is 74%.
  if (k.dir === 'under') return v ? (t / v) * 100 : null;
  return t ? (v / t) * 100 : 0;
}

export const statusOf = (p) => (p === null ? 'na' : (p >= 100 ? 'ok' : (p >= 85 ? 'near' : 'miss')));

/** The KPI's own colour band for this engineer: 'ok' | 'warn' | 'amber' |
    'na'. A KPI with no band of its own falls back to the generic
    at-target / within-15% ladder, which is what Attendance still uses.

    THERE IS NO RED BAND ON THE MATRIX (2026-09-04, the business's own call).
    SHORT and MISSED were two tones for one verdict — under the commitment —
    and six of the nine rows already had amber as their floor, so a shortfall
    was drawn red on three rows and orange on six for no reason a reader could
    see. Every floor is amber now, and 'bad' is left in BAND_LABEL and in the
    stylesheet because the grade chip and the four points still use that tone
    on their own scales. */
export function bandOf(k, se) {
  const v = se.v[k.key];
  // THE MISSING-FIGURE CHECK COMES FIRST, and it has to. Handing null to a
  // ladder makes every threshold fail and returns the floor — so an engineer
  // no file names showed a red MISSED on the commitment his data is absent
  // from, which is the one thing this page must never do.
  if (v === null || v === undefined || !isFinite(v)) return 'na';
  if (k.band) return k.band(se, v) || 'na';
  const p = achieve(k, v);
  return p == null ? 'na' : (p >= 100 ? 'ok' : (p >= 85 ? 'warn' : 'amber'));
}
/** What the Status cell says for each band. */
export const BAND_LABEL = { ok: 'MET', warn: 'NEAR', amber: 'SHORT', bad: 'MISSED', na: '–' };
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

/** Turn the engineer's key into a stable number for the generator. */
export const seedOf = (uid) => {
  const n = parseInt(String(uid).replace(/\D/g, ''), 10);
  if (Number.isFinite(n) && n > 0) return n;
  let h = 7;
  for (const ch of String(uid)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h || 1;
};

/** {iso day: SRs closed} and {'YYYY-MM': SRs closed} from the payload's
    compact [[days since sr_base, count]] pairs.

    Two maps rather than one because the report asks the question at two
    grains: the day columns want a single date, and the month / quarter / year
    columns want a whole month, and walking 30 days to answer each of 48 months
    is work that can be done once here.

    NULL, not an empty map, when the engineer has no pairs at all: he is
    missing from the MaxTTR file, which is not the same as having closed
    nothing, and every figure derived from it has to carry that difference. */
function srMapsOf(pairs, base) {
  if (!pairs || !pairs.length || !base) return [null, null];
  const day = Object.create(null);
  const month = Object.create(null);
  for (const [off, n] of pairs) {
    const iso = addD(base, off);
    day[iso] = (day[iso] || 0) + n;
    const mk = iso.slice(0, 7);
    month[mk] = (month[mk] || 0) + n;
  }
  return [day, month];
}

/** SRs closed between two ISO dates, inclusive. Null all the way through for
    an engineer the file does not know — a sum that starts at zero would turn
    'no data' into 'no work'. */
/** Sum a {iso: n} map between two ISO dates, inclusive. */
export function sumDays(map, from, to) {
  let n = 0;
  for (let d = from; d && d <= to; d = addD(d, 1)) n += map[d] || 0;
  return n;
}
export function srBetween(se, from, to) {
  if (!se.srDay) return null;
  return sumDays(se.srDay, from, to);
}
/** One day's SRs. 0 is a real zero for an engineer the file knows. */
export const srOn = (se, iso) => (se.srDay ? (se.srDay[iso] || 0) : 0);
/** One month's, keyed 'YYYY-MM'. */
export const srInMonth = (se, mk) => (se.srMonth ? (se.srMonth[mk] || 0) : 0);

/** Build the roster the page works on. `roster` is the API payload. */
export function buildEngineers(roster) {
  // the working-days master and the data window arrive with the roster and are
  // read by every figure priced in man-days, so both are installed before a
  // single engineer is built
  S.wd = roster.working_days || { months: {}, universal: {} };
  S.dataMax = roster.data_max || '';
  S.amcMonths = roster.amc_months || null;
  S.battMonths = roster.battery_months || null;
  S.attMonths = (roster.meta && roster.meta.attendance
                 && roster.meta.attendance.months) || [];
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
      const [maxDay, maxMonth] = srMapsOf(e.sr, roster.sr_base);
      const [srDay, srMonth] = countMapsOf(e.ec);
      const [allocDay, allocMonth] = pairMapsOf(e.ea);
      const [cvDay, cvMonth] = convMapsOf(e.cv);
      const [cdDay, cdMonth] = cdiMapsOf(e.cd);
      const [efD, efM] = efMapsOf(e.ef);
      const [lbD, lbM] = lbMapsOf(e.lb);
      const row = {
        // the name is TITLE CASED here and nowhere else: every row, header,
        // panel, chart caption and export on this page reads se.name
        key, name: titleName(e.name), bid: e.branch_id,
        // TWO SR COUNTS, deliberately. srDay is the EFSR one and is the SR
        // COUNT COMMITMENT; maxDay is the MaxTTR one and is what PRODUCTIVITY
        // divides. The two files disagree, so the page never mixes them: the
        // commitment row says EFSR, the productivity tile says MaxTTR, and
        // both say so on screen.
        srDay, srMonth,          // EFSR closes — null when that file has none
        allocDay, allocMonth,    // EFSR allocations, on the task ASSIGNED date
        maxDay, maxMonth,        // MaxTTR closes — for productivity only
        hr: e.hr || null,        // real DAYS PRESENT by month — null when HR has none
        at: e.at || null,        // HR's DAY-WISE attendance, a string per month
        te: e.te || null,        // real DAYS PRESENT ON TASK END by month
        convDay: cvDay, convMonth: cvMonth,   // real SPARE / LABOUR amounts
        cdiDay: cdDay, cdiMonth: cdMonth,     // real CDI feedback buckets
        efDay: efD, efMonth: efM,             // real 1st-site / SF-task counts
        lbDay: lbD, lbMonth: lbM,             // real AMC leads / batteries sold
        // UID NO and EMPLOYEE TICKET NUMBER — both the Training Report's own,
        // both shown as they stand. A blank prints as a dash; nothing here
        // guesses at an identity the file does not carry.
        uid: e.uid || '', code: e.code || '',
        region: br.region, branch: br.name,
        title: e.title || '', occupation: e.occupation || '',
        status: e.status || '',
        // DATE OF JOINING, and where it came from — HR's Attendance Summary
        // (the date the SE UID Master shows) or, for an engineer HR has not
        // sent, the Training Report's own HIRE DATE. The two disagree on
        // real people by months, so the page says which it is using.
        hired: e.hired || '', hiredSrc: e.hired_src || '',
        trainings: e.trainings || [],
        // NOTHING NUMERIC IS GENERATED ANY MORE. Every one of the nine
        // commitments, and the two reference figures beside them, is counted
        // off a file — see the source list at the top of this module. What is
        // left below is the two MANUAL CHECKLISTS, which no file can answer:
        // no upload knows whether a man wore his PPE. They are still seeded
        // from the engineer's own key so the signed matrix has something to
        // show, and they are the last fabricated thing on this page.
        comply: COMPLY.map(() => r() > 0.16),
        support: Array.from({ length: SUPPORT.length }, () => r() > 0.13),
      };
      row.v = {};                 // filled by setPeriod()
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
  // WORKING DAYS from the master, prorated by how much of each month the period
  // actually covers — a whole month takes all of it, which is every period this
  // page offers, but the proration is kept so a part month cannot lie.
  const work = span.reduce((a, x) => a + workDaysOf(se.region, x.y, x.m) * (x.days / x.dim), 0);
  // DAYS PRESENT from HR, or null. Never generated any more: an attendance
  // figure nobody has uploaded has to read as unknown, because attendance is
  // the one commitment a man can be dismissed over.
  const present = hrPresentFor(se, span);
  /* THE DAYS HR ACTUALLY EXPECTED HIM, out of the day-wise file: every day it
     marks except a weekly off, a c-off and a holiday. It is the honest
     denominator for an attendance percentage and the master's man-days are not
     — the master gives the BRANCH a count for the month, while a man's weekly
     off follows his own rota, so a man whose rota gave him fewer offs than the
     master assumed came out at 103, 104, even 107 per cent present. Seven of
     the ninety-five on the July file did. Null where the month has no day-wise
     file, and then the master's man-days are all there is. */
  const attDue = attDueFor(se, span);
  // and the days he ended a task in the field — a different question from
  // both of the above, and the one the MaxTTR file can answer per day
  const taskEnd = teFor(se, span);
  // SR CLOSED is COUNTED off the MaxTTR file for exactly this period. Null
  // for an engineer that file has never named: achieve() returns null for it,
  // scoreOf() leaves it out of the weighted mean, and the matrix prints a dash
  // — so a man the file does not cover is not marked down for it.
  // SPARE and LABOUR are the CONVERSION AMOUNTS the LMS file attributes to
  // him over exactly this period — Employee Productivity's two money columns.
  // Null, and unscored, only when he has no conversion rows at all.
  const cv = convBetween(se, S.from, S.to);
  // CDI is the real feedback for the period, read EP's way
  const cd = cdiBetween(se, S.from, S.to);
  // and the EFSR file's two discipline figures
  const ef = efBetween(se, S.from, S.to);
  // AMC leads raised and batteries sold, each blank where its source cannot
  // attribute anything in the period at all
  const lb = lbBetween(se, span);
  // SR COUNT is the EFSR closure count; the MaxTTR count rides alongside it
  // because productivity is defined on that one.
  const maxSr = se.maxDay ? sumDays(se.maxDay, S.from, S.to) : null;
  // the two EFSR SR movements: what he was GIVEN and what he CLEARED
  const closedSr = srBetween(se, S.from, S.to);
  // [allocated, closed that same day] over the period
  const al = se.allocDay
    ? Object.entries(se.allocDay).reduce((a, [d, v]) => (
      (d >= S.from && d <= S.to) ? [a[0] + v[0], a[1] + v[1]] : a), [0, 0])
    : null;
  const allocSr = al ? al[0] : null;
  const v = {
    sr: closedSr,
    spare: cv ? cv[0] : null,
    labour: cv ? cv[1] : null,
    amcLead: lb[0],
    battery: lb[1],
    // days he started his first job before ten, over days worked
    // the AVERAGE START TIME in minutes past midnight — the figure the
    // commitment, the achievement, the band and the chart all read
    first: (ef && ef[1]) ? ef[4] / ef[1] : null,
    /* CLOSED over ALLOCATED, the same relation the breakdown row prints, so
       the page carries ONE meaning for this commitment and not two. It was
       closed-same-day over tasks worked, which reads the same file but answers
       a different question; the business's basis is the two SR movements —
       what he was given and what he cleared. `alloc` is null-safe: an engineer
       with closures but no allocation in the period has no ratio, not 100%. */
    /* Of the SRs ALLOCATED to him, the share he closed ON THE DAY they were
       allocated — 'Before Leaving Site', and the same relation the breakdown
       row prints, so this page carries ONE meaning for the commitment. Both
       halves are the same appointments, so it cannot exceed 100%; dividing a
       day's closures by a different day's allocations could, and did. Null,
       not 100%, when he was allocated nothing: a ratio with no denominator is
       not a ratio. */
    sfTask: (al && al[0]) ? pctOf(al[1], al[0]) : null,
    cdi: cd ? cdiPct(cd) : null,
    // ATTENDANCE is HR's days present over the master's man-days. Null when HR
    // has not sent the month: an engineer must never be marked down to 0% by a
    // file that has not been uploaded.
    attend: (present == null) ? null
      : (attDue ? +((present / attDue) * 100).toFixed(1)
        : (work ? +((present / work) * 100).toFixed(1) : null)),
    present,
  };
  v.taskEnd = taskEnd;
  // the three counts behind the percentage, for the matrix and the breakdown
  se.cdiP = cd ? cd[0] : null; se.cdiD = cd ? cd[1] : null;
  se.cdiPa = cd ? cd[2] : null;
  se.cdiN = cd ? cd[0] + cd[1] + cd[2] : null;
  // the counts behind the two percentages, for the matrix's sub-lines
  se.fsOn = ef ? ef[0] : null; se.fsDays = ef ? ef[1] : null;
  se.tcOk = ef ? ef[2] : null; se.tcN = ef ? ef[3] : null;
  se.allocSr = allocSr; se.allocClosed = al ? al[1] : null;
  // his real average first-site time, out of the same EFSR starts
  // the MINUTES are the figure; the string is only how it is printed
  se.firstAvgMin = v.first;
  se.firstAvg = se.firstAvgMin == null ? null : hhmm(se.firstAvgMin);
  v.work = work;
  v.workSr = work;                // one engineer: his own man-days, always
  v.presentSr = present;
  // Rounded, like Employee Productivity rounds it, so a reader checking the
  // arithmetic by hand gets the printed figure back instead of one off by the
  // proration remainder.
  // PRODUCTIVITY divides the MaxTTR close count, not the EFSR one — the
  // business's instruction, and the tile on screen names the file.
  v.maxSr = maxSr;
  v.prod = (maxSr == null || !work) ? null : +(maxSr / Math.round(work)).toFixed(2);
  return { v, months, work, present, taskEnd };
}

/** Set the period and re-resolve every engineer. Nothing on the page is scored
    against a commitment that has not been resolved to the period first. */
export function setPeriod(ses, from, to) {
  S.from = from; S.to = to;
  S.months = periodSpan().reduce((a, x) => a + x.f, 0) || 1;
  ses.forEach((se) => {
    const P = periodOf(se);
    se.v = P.v; se.workDays = P.work; se.present = P.present;
    se.taskEnd = P.taskEnd;
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
    // A metric can be NULL for an engineer the source file does not cover (SR
    // CLOSED is), and a branch is not entitled to read that as a zero. The
    // engineers who DO have a figure make the branch's: a sum of the known, a
    // mean over the known, and null only when not one of them has it.
    const known = list.map((s) => s.v[k.key]).filter((x) => x != null && isFinite(x));
    if (!known.length) { v[k.key] = null; continue; }
    if (k.agg === 'sum') v[k.key] = known.reduce((a, x) => a + x, 0);
    else v[k.key] = +(known.reduce((a, x) => a + x, 0) / known.length).toFixed(2);
  }
  v.present = list.reduce((a, s) => a + (s.present || 0), 0);
  v.work = list.reduce((a, s) => a + (s.workDays || 0), 0);
  v.taskEnd = list.some((s) => s.taskEnd != null)
    ? list.reduce((a, s) => a + (s.taskEnd || 0), 0) : null;
  // and the man-days of only those engineers who HAVE an SR figure — see the
  // note on the productivity column
  v.maxSr = list.some((s) => s.v.maxSr != null)
    ? list.reduce((a, s) => a + (s.v.maxSr || 0), 0) : null;
  v.workSr = list.reduce((a, s) => a + (s.v.maxSr != null ? (s.workDays || 0) : 0), 0);
  v.presentSr = list.reduce((a, s) => a + (s.v.sr != null ? (s.present || 0) : 0), 0);
  for (const k of KPIS) {
    if (k.agg !== 'derived') continue;
    const d = list.length ? k.derive(v) : null;
    v[k.key] = (d == null || !isFinite(d)) ? null : +d.toFixed(2);
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

/** A figure the source has, or has not.

    Every formatter below is a DISPLAY function and every one of them can now be
    handed a null: SR CLOSED — and Productivity with it — is null for an
    engineer the MaxTTR file has never named, which is not the same as zero and
    must not print as one. A dash is what fmtVal already answers with, so they
    all answer the same way. NaN and Infinity go the same route: a divide by a
    missing denominator is a missing figure, not '∞'. */
const has = (v) => v !== null && v !== undefined && Number.isFinite(+v);
export const DASH = '–';

/* ---- HR's DAY-WISE ATTENDANCE -------------------------------------------
   The roster sends one string per uploaded month, a character per day of that
   month (see pms_attendance_day): position 0 is the 1st.

   THE CLASSIFICATION IS THE BUSINESS RULE, and it is the reason the raw word is
   kept on the server as well as this letter. A service engineer spends his day
   at a customer's site, so HR marks him OUT DOOR DUTY and leaves PRESENT at
   zero — across the 94 service-engineer rows in the July file PRESENT holds 500
   days and OUT DOOR DUTY holds 1,870. So both are a day WORKED. Only LEAVE and
   ABSENT cost a day. WEEKLY OFF, C OFF and HOLIDAY are days nobody was expected
   to work, and they are neither worked nor lost — they carry no value at all,
   which is why `worth` is null for them and not 0. */
export const ATT = {
  P: { lab: 'Present', tag: 'P', cls: 'atc-p', worth: 1 },
  O: { lab: 'Outdoor Duty', tag: 'OD', cls: 'atc-p', worth: 1 },
  H: { lab: 'Half Day', tag: '½', cls: 'atc-h', worth: 0.5 },
  L: { lab: 'Leave', tag: 'L', cls: 'atc-a', worth: 0 },
  A: { lab: 'Absent', tag: 'A', cls: 'atc-a', worth: 0 },
  W: { lab: 'Weekly Off', tag: 'WO', cls: 'atc-o', worth: null },
  C: { lab: 'C Off', tag: 'CO', cls: 'atc-o', worth: null },
  Y: { lab: 'Holiday', tag: 'HO', cls: 'atc-o', worth: null },
  '-': { lab: 'No data', tag: DASH, cls: 'atc-n', worth: null },
};
/** A number of DAYS, with no trailing zeros: 25.5 and not '25.50'.
    trim2 pads to two places because it formats money and rates; a day count
    only ever has a half in it. */
export const attDays = (v) => (v === null || v === undefined || !isFinite(v)
  ? DASH : String(+(+v).toFixed(2)));

// the order the summary chips read in: worked, then lost, then not expected
export const ATT_ORDER = ['P', 'O', 'H', 'L', 'A', 'W', 'C', 'Y', '-'];

/** The days HR EXPECTED an engineer over a period, out of the day-wise file:
    everything it marks except a weekly off, a c-off and a holiday. 0 when no
    month of the period has a day-wise file. */
export function attDueFor(se, span) {
  if (!se.at) return 0;
  let n = 0;
  for (const x of span) {
    const codes = se.at[`${x.y}-${String(x.m + 1).padStart(2, '0')}`];
    if (!codes) continue;
    for (const ch of codes) { const a = ATT[ch]; if (a && a.worth !== null) n += 1; }
  }
  return n;
}

/** One engineer's attendance for ONE month, or null if HR has not uploaded it.

    { month, days: [{d, iso, dow, code, ...ATT[code]}], counts: {code: n},
      worked, lost, off, nodata }
    `worked` is the figure the report divides by — P and O at a day each, H at
    half a day — and it is the same number the roster sends as `hr[month]`,
    struck from these very characters on the server. */
export function attendanceOf(se, month) {
  const s = se && se.at && se.at[month];
  if (!s) return null;
  const days = [];
  const counts = {};
  let worked = 0;
  for (let i = 0; i < s.length; i++) {
    const code = ATT[s[i]] ? s[i] : '-';
    const a = ATT[code];
    const d = new Date(`${month}-01T00:00:00`);
    d.setDate(i + 1);
    days.push({
      d: i + 1,
      iso: `${month}-${String(i + 1).padStart(2, '0')}`,
      dow: d.toLocaleDateString('en-GB', { weekday: 'short' }),
      sunday: d.getDay() === 0,
      code,
      ...a,
    });
    counts[code] = (counts[code] || 0) + 1;
    if (a.worth) worked += a.worth;
  }
  const n = (k) => counts[k] || 0;
  return {
    month,
    days,
    counts,
    worked: +worked.toFixed(2),
    lost: n('L') + n('A'),
    off: n('W') + n('C') + n('Y'),
    nodata: n('-'),
  };
}


export const inr = (v) => (has(v) ? Math.round(v).toLocaleString('en-IN') : DASH);
export const iN = inr;
export const iL = (v) => (has(v) ? (v / 1e5).toFixed(2) : DASH);
export const i1 = (v) => (has(v) ? v.toFixed(1) : DASH);
/** 2.00 SRs a day is 2 SRs a day — decimals only when there are decimals. */
export const trim2 = (v) => (has(v)
  ? (Number.isInteger(+(+v).toFixed(2)) ? String(+(+v).toFixed(2)) : (+v).toFixed(2))
  : DASH);

/** The FULL figure with its unit — tooltips, the export and the matrix. */
export function fmtVal(k, v) {
  if (v === null || v === undefined || v === 0) return '–';
  switch (k.fmt) {
    case 'amt': return `₹${inr(v)}`;
    case 'pct': return `${v.toFixed(1)}%`;
    case 'rate': return v.toFixed(1);
    case 'rate2': return `${trim2(v)} SR/working day`;
    case 'hrs': return v.toFixed(2);
    case 'time': return hhmm(v);
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

/** A name the way a name is written: 'AADESH GAIKWAD' and 'aadesh  gaikwad'
    both read as 'Aadesh Gaikwad'.

    KOEL's exports type a man's name in whatever case the branch felt like, and
    a board that mixes SHOUTING with Title Case reads as two different files
    rather than one roster. The capital goes after any separator, not just a
    space, so 'Afreen.MS Koppalad' and "O'BRIEN" survive as 'Afreen.Ms
    Koppalad' and "O'Brien" instead of collapsing to lower case. Doubled
    spaces close up on the way through. */
export const titleName = (n) => String(n || '').trim().replace(/\s+/g, ' ').toLowerCase()
  .replace(/(^|[\s\-'./])([a-zÀ-ɏ])/g, (_m, sep, ch) => sep + ch.toUpperCase());
export const firstName = (n) => { const w = String(n).split(' '); return (w[0].length <= 3 && w[1]) ? `${w[0]} ${w[1]}` : w[0]; };
export const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || `${one}s`)}`;
export const fmtTrainDate = (d) => (d ? `${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : '—');

export function tenureOf(se) {
  if (!se.hired) return null;
  const y = (pdate(S.to) - pdate(se.hired)) / (365.25 * MSD);
  if (!isFinite(y) || y < 0) return null;
  return { from: se.hired, years: y, src: se.hiredSrc,
    label: y >= 1 ? `${y.toFixed(1)} yrs` : `${Math.round(y * 12)} mo` };
}
