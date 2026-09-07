import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import SE_PERFORMANCE_CSS from './sePerformance/styles';
import {
  COMMITMENTS, SUPPORT, COMPLY, RG_NAME, S, branchOrder,
  setPeriod, rollup, achieve, targetText, bandOf, BAND_LABEL,
  fmtVal, fmtDay, iN, trim2, dashZero, plain, fmtTrainDate, hhmm,
  ATT, ATT_ORDER, DASH, attDays, attendanceOf,
  buildEngineers,
} from '../utils/sePerformanceModel';
import { DT_ROWS, bucketsFor, reviewOf } from '../utils/sePerformanceSeries';
import { colChart, lineChart } from '../utils/sePerformanceCharts';

/* ============================================================================
   SE Performance — the report.

   Three things live on this page and nothing else:
     the EXPLORER   every branch, Maharashtra left and Karnataka right, each
                    unfolding its engineers in place like a sitemap
     the REPORT     one engineer, day / week / month / quarter / year, with the
                    breakdown, a short summary and four charts
     one PANEL      the signed Annexure I matrix, opened from the report's
                    own header. 'Training & Skill' and 'Employee assets' were
                    two more; both are gone from this page — the training a man
                    has done is the Training Report's own subject, and nothing
                    counted the asset checklist's ticks.

   Layout follows prototypes/SE Performance Report.html. The numbers all come
   from utils/sePerformanceModel + sePerformanceSeries; this file only draws.
   ========================================================================= */

const CHEV = (cls = 'pn-go') => (
  <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m8.25 4.5 7.5 7.5-7.5 7.5" />
  </svg>
);
const TICK = (
  <svg className="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4.5 12.75 6 6 9-13.5" /></svg>
);
// The BAR is a fill: green, yellow, then amber deepening — the ladder the ERP's
// own percentage cells use, at a saturation that still reads at 8px. The bottom
// band is a DEEP AMBER and not red: a score is a standing to improve, not an
// alarm, and the whole PMS palette already speaks in ok/near/miss ambers.
const scoreFill = (v) => (v >= 90 ? '#16a34a' : v >= 80 ? '#4ade80'
  : v >= 70 ? '#facc15' : v >= 60 ? '#fb923c' : '#d97706');
// The big number on the matrix is TEXT on the sheet, so it keeps an ink colour
// — a yellow numeral on paper cannot be read. It reads the SHEET's own tokens
// (styles.js) and not --pms-*-ink: those flip with the theme, and while the
// sheet was literal white in dark mode this printed a pale dark-theme green on
// white. The --sh-score-* pair is defined for light, dark and print.
const scoreInk = (v) => (v >= 90 ? 'var(--sh-score-ok)' : v >= 80 ? 'var(--sh-score-b)'
  : v >= 70 ? 'var(--sh-score-warn)' : 'var(--sh-score-bad)');

const html = (s) => ({ __html: s });
/** An id the masters do not carry prints as a dash. A number that looks real
    but is not sends nobody to the SE UID Master to fix it. */
const orDash = (v) => (v && String(v).trim() ? String(v).trim() : '—');

/* ---- one row of the explorer tree ---------------------------------------- */
const ExRow = ({ o, onClick }) => (
  /* --i is the row's place in its branch: the unfold animation staggers off it,
     so the engineers arrive in rank order instead of all at once */
  <div className={`pn-row ${o.kind}${o.cls || ''}${o.open ? ' open' : ''}`}
    style={o.i == null ? undefined : { '--i': Math.min(o.i, 9) }}
    onClick={onClick} title={o.title || undefined}>
    <span className="pn-rank">{o.rank}</span>
    <span className="pn-name"><b>{o.name}</b><span>{o.sub}</span></span>
    <span className="pn-met" title="parameters met">{o.met}/{COMMITMENTS.length}</span>
    <span className="pn-bar"><i style={{ width: `${Math.min(100, o.score)}%`, background: scoreFill(o.score) }} /></span>
    {/* the figure itself stays ink: the BAR carries the colour, and a number
        that is also coloured makes the reader decode two things to read one */}
    <span className="pn-score">{o.score.toFixed(1)}<i>%</i></span>
    <span><span className={`gr gr-${o.grade}`}>{o.grade}</span></span>
    {o.kind === 'br' ? CHEV(`pn-go tw${o.open ? ' open' : ''}`) : CHEV()}
  </div>
);

/* ---- the single-choice dropdown the granularity picker uses -------------- */
const Picker = ({ label, value, options, onPick }) => {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const cur = options.find((o) => o.v === value) || options[0];
  return (
    <div ref={box} className={`ms${open ? ' on-open' : ''}`}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="btn" onClick={() => setOpen((v) => !v)}>
        {label} <span className="cnt">{cur.label}</span>
        <svg className="i sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
      </button>
      <div className="ms-pop pick">
        <div className="ms-list">
          {options.map((o) => (
            <div key={o.v} className={`pick-item${value === o.v ? ' on' : ''}`}
              onClick={() => { onPick(o.v); setOpen(false); }}>
              {TICK}
              <span className="lbl">{o.label}{o.sub && <span className="sub">{o.sub}</span>}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* The Revenue chart's two tabs. Keyed on the bucket field so the chart reads
   b[k] directly — add a third money column here and it needs nothing else. */
const REV_TABS = [
  // Labour is the GREEN of the categorical set, not the orange. Orange does a
  // second job on this page — it is the shortfall tone on the four points and
  // on the KPI status cells — so a bar wearing it read as a warning about
  // itself. Blue and green are the two colours here that only ever mean
  // 'this series'.
  { k: 'spare', lab: 'Spare parts', color: 'var(--viz-1)' },
  { k: 'labour', lab: 'Labour', color: 'var(--viz-3)' },
];

/* THE FIRST SITE OF THE MORNING, and nothing else on this chart.
   It used to be drawn as the percentage of days that beat 10 o'clock, which
   answers a different question from the one the commitment asks and from the
   one the table above prints. It is the average START TIME now, as bars on an
   axis of hours with 10:00 as the dashed line: a bar that stops under the line
   is a morning he was on site in time, one that crosses it is a morning he was
   not, and how far over is the size of the miss.
   Bars and not a line: a day either has a start time or it has none, and a line
   drawn across the days he was never on site invents a trend between one
   morning and the next.
   ATTENDANCE WAS THE OTHER HALF OF THIS CHART and has been taken off it — it is
   on the signed matrix as a commitment and, day by day, in the attendance table
   above, which is HR's file drawn in full rather than one number off it. */
const FIRST_CHART = {
  lab: '1st site — start time', color: 'var(--viz-3)',
  ref: 600, refLabel: '10:00 AM',
  val: (b) => (b.fsD ? b.fsMin / b.fsD : null),
};

const GRANS = [
  { v: 'day', label: 'Day wise', sub: 'every day of the period' },
  { v: 'week', label: 'Week wise', sub: 'calendar weeks, Mon–Sun' },
  { v: 'month', label: 'Month wise', sub: 'trailing 12 months' },
  { v: 'quarter', label: 'Quarterly', sub: 'financial quarters, 2 years back' },
  { v: 'year', label: 'Yearly', sub: 'financial years, 4 years back' },
];

/* ========================================================================== */
const SEPerformanceReport = ({ roster, periodFrom, periodTo }) => {
  const [openBr, setOpenBr] = useState(() => new Set());   // PINNED by a click
  const [hoverBr, setHoverBr] = useState(() => new Set()); // unfolded under the pointer
  const [revTab, setRevTab] = useState('spare');           // Revenue: which of the two
  const [openSe, setOpenSe] = useState(null);
  const [gran, setGran] = useState('day');
  const [dtOpen, setDtOpen] = useState(() => new Set());
  const [panel, setPanel] = useState(null);          // the signed matrix, which is a document
  const [printing, setPrinting] = useState(false);  // the signed matrix is going to the printer
  const detailRef = useRef(null);
  const rootRef = useRef(null);
  const boxRef = useRef(null);
  const barRef = useRef(null);
  const innerRef = useRef(null);
  const colsRef = useRef(null);      // the explorer's own scrollport
  const hoverIn = useRef(null);      // the intent timer
  const hoverId = useRef(null);      // the branch that timer belongs to
  const settling = useRef(false);    // a fold is still moving rows under the pointer
  const settleT = useRef(null);
  const anchor = useRef(null);       // the row whose position must not move
  const growTimer = useRef(null);    // the breakdown box's grow animation
  const hoverRg = useRef(null);      // which region the open branches belong to
  const driver = useRef(null);       // which of the two scrollbars is being used
  const settle = useRef(null);
  const quiet = useRef(false);

  // the roster is built once; the PERIOD then re-resolves every engineer
  const { branches, ses } = useMemo(() => buildEngineers(roster || {}), [roster]);
  useMemo(() => {
    if (periodFrom && periodTo) setPeriod(ses, periodFrom, periodTo);
    return null;
  }, [ses, periodFrom, periodTo]);
  S.gran = gran;

  const se = openSe ? ses.find((x) => x.key === openSe) : null;
  const B = useMemo(() => (se ? bucketsFor(se) : []), [se, gran, periodFrom, periodTo]);
  const R = useMemo(() => (se ? reviewOf(se, ses) : null), [se, ses, periodFrom, periodTo]);

  /* ---- where the pinned header actually has to stop ----------------------
     `position: sticky; top: 0` pins to the scrollport's PADDING box, and the
     application's page container carries a padding of its own — so the block
     came to rest that far down and the table scrolled through the strip above
     it. Rather than hard-code the padding (and break the day someone changes
     it), find the scrolling ancestor and pin against its actual value. */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let p = el.parentElement;
    while (p && p !== document.body) {
      const oy = window.getComputedStyle(p).overflowY;
      if (oy === 'auto' || oy === 'scroll') break;
      p = p.parentElement;
    }
    const pad = (p && p !== document.body)
      ? parseFloat(window.getComputedStyle(p).paddingTop) || 0 : 0;
    el.style.setProperty('--sep-pin-top', `${-pad}px`);
  }, []);

  /* ---- the mirrored scrollbar above the breakdown ------------------------
     The strip above the table is a second scrollbar for the same content, so
     the reader can move the columns without scrolling to the bottom of a tall
     table to find a bar. Two things have to be true of it, and neither was.

     ITS RANGE MUST EQUAL THE BOX'S, not its width. A scrollbar's travel is
     scrollWidth - clientWidth, and the box loses its VERTICAL scrollbar's
     width off clientWidth while the bare strip does not — so setting the
     strip's inner width to the table's width gave the two bars different
     travel, and dragging one to its end left the other short of its own.
     Measured: 1px apart with no vertical bar, a full scrollbar's width with
     one. The strip's inner width is therefore built FROM the box's range.

     AND ONE OF THEM OWNS THE POSITION AT A TIME. Each bar's scroll handler
     wrote the other's scrollLeft, which fired that one's handler, which wrote
     back: measured, ten wheel ticks on the box arrived as five events, and a
     drag of the strip near the end left the two 23px apart because the box's
     scroll-snap correction had nowhere to go. Whichever bar the reader is
     actually using now owns the position until it goes quiet, and then the two
     are reconciled to whatever the BOX settled on — a snap, a clamp, the end
     of the travel — because the box is the thing with the content in it. */
  const syncBar = useCallback(() => {
    const box = boxRef.current; const bar = barRef.current; const inner = innerRef.current;
    if (!box || !bar || !inner) return;
    // The box's own scrollWidth is the truth, but it is only right once the
    // table has been laid out — a frame too early it reads as the box's width
    // and the thumb spans the whole strip. So the TABLE is measured as well,
    // and trusted only when it says the box has not caught up yet; ceil()ing
    // it unconditionally was the source of the last stray pixel of travel.
    const table = box.querySelector('table');
    const tw = table ? table.getBoundingClientRect().width : 0;
    const w = box.scrollWidth >= tw - 1 ? box.scrollWidth : Math.ceil(tw);

    /* ---- the last period column has to be able to clear PERIOD -----------
       PERIOD is frozen against the right edge, so it FLOATS OVER the days
       until the scroll reaches its very end: measured, the last day is still
       twelve pixels underneath it at 98% of the way across, and only an exact
       hard-right lands it clear — which is a thing no one scrolls onto by
       hand. The table now SNAPS to that last position when a scroll finishes
       near it (see the scroll-snap rules in sePerformance/styles), and this is
       the width it has to snap clear of.

       A spare cell after PERIOD was tried first and is the wrong answer: it
       lengthens the row, so at the end of the scroll PERIOD's own edge is
       already inside the scrollport, sticky stops holding it — stickiness
       holds an element back, it never pulls one to the edge — and the frozen
       column drifts off the edge leaving 56px of dead column beside it. */
    const totTh = box.querySelector('thead th.tot');
    if (totTh) box.style.setProperty('--sep-totw', `${totTh.getBoundingClientRect().width}px`);

    const range = Math.max(0, w - box.clientWidth);
    const need = range > 1;
    bar.classList.toggle('hide', !need);
    // range + the strip's OWN visible width, so the strip's travel is the
    // box's travel exactly and the two thumbs reach their ends together
    inner.style.width = need ? `${range + bar.clientWidth}px` : '100%';
    if (Math.abs(bar.scrollLeft - box.scrollLeft) > 0.5) {
      quiet.current = true;
      bar.scrollLeft = box.scrollLeft;
      requestAnimationFrame(() => { quiet.current = false; });
    }
  }, []);

  /** One of the two bars is being used; the other follows it. */
  const mirrorScroll = useCallback((from) => {
    const box = boxRef.current; const bar = barRef.current;
    if (!box || !bar || quiet.current) return;
    if (driver.current && driver.current !== from) return;   // the other owns it
    driver.current = from;
    const src = from === 'bar' ? bar : box;
    const dst = from === 'bar' ? box : bar;
    if (Math.abs(dst.scrollLeft - src.scrollLeft) > 0.5) dst.scrollLeft = src.scrollLeft;
    // Dragging the STRIP must not make the box snap: the snap would pull the
    // content away from under the drag and the thumb would jump back. It is
    // handed back the moment the strip goes quiet.
    if (from === 'bar') box.classList.add('nosnap');
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      settle.current = null;
      driver.current = null;
      box.classList.remove('nosnap');
      // the box settled somewhere of its own (a snap, the end of the travel);
      // the strip is corrected to it, quietly, so it cannot drive back
      if (Math.abs(bar.scrollLeft - box.scrollLeft) > 0.5) {
        quiet.current = true;
        bar.scrollLeft = box.scrollLeft;
        requestAnimationFrame(() => { quiet.current = false; });
      }
    }, 160);
  }, []);
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);
  useEffect(() => {
    syncBar();
    const id = requestAnimationFrame(syncBar);
    window.addEventListener('resize', syncBar);
    // the table settles after fonts land and after a row is opened; an observer
    // catches both without guessing at a delay
    const box = boxRef.current;
    const table = box && box.querySelector('table');
    const ro = table && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncBar) : null;
    if (ro && table) ro.observe(table);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', syncBar);
      if (ro) ro.disconnect();
    };
  }, [syncBar, se, gran, dtOpen, B]);

  /* ---- the box is as tall as the rows that are open ----------------------
     The breakdown used to be a fixed 62vh window with its own scrollbar, so
     opening a bifurcation did not make the table taller — it only gave you
     more to scroll through inside the same frame, and folding it back left
     the frame just as tall around half-empty space. It now takes exactly the
     height its rows need and hands it back when they fold.

     The change is ANIMATED because it is large: expanding all four
     bifurcations adds twenty-three rows, and a table that jumps three hundred
     pixels on a click takes the reader's place on the page with it.

     A CEILING stays, and not as a leftover. The box has to remain a scroll
     box: the period header and the metric column pin against it, and CSS
     cannot pair a horizontal scroll with a visible vertical overflow, so
     there is nowhere else for them to pin. Under the ceiling the height is
     the content's; over it, the box behaves exactly as it always did. */
  const fitBox = useCallback(() => {
    const box = boxRef.current;
    const table = box && box.querySelector('table');
    if (!box || !table) return;
    const prev = box.style.height;
    box.style.height = 'auto';                          // measure the rows as they are
    const content = Math.ceil(box.scrollHeight);
    const hbar = box.offsetHeight - box.clientHeight;   // the horizontal bar, when there is one
    box.style.height = prev;                            // the transition needs a from-value
    const cap = Math.max(240, Math.round(window.innerHeight * 0.78));
    // the spare pixel keeps a sub-pixel row height from opening a 1px scroll
    const want = Math.min(content + hbar + 1, cap);
    // While the box is still growing it is SHORTER than its rows, so a vertical
    // scrollbar would flash down the side for the length of the animation and
    // vanish again. Hidden for the duration, and then handed back — if the
    // height landed on the ceiling the bar is real and has to come back.
    if (want > parseFloat(prev || '0')) {
      box.classList.add('growing');
      if (growTimer.current) clearTimeout(growTimer.current);
      growTimer.current = setTimeout(() => {
        growTimer.current = null;
        if (boxRef.current) boxRef.current.classList.remove('growing');
      }, 340);
    }
    box.style.height = `${want}px`;
  }, []);
  useLayoutEffect(() => {
    fitBox();
    window.addEventListener('resize', fitBox);
    return () => window.removeEventListener('resize', fitBox);
  }, [fitBox, se, gran, dtOpen, B, printing]);
  useEffect(() => () => { if (growTimer.current) clearTimeout(growTimer.current); }, []);

  useEffect(() => {
    if (se && detailRef.current) detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [openSe]);          // eslint-disable-line react-hooks/exhaustive-deps


  /* ---- the explorer unfolds under the pointer ----------------------------
     A branch opens when the pointer rests on it, and it STAYS open while you
     work down that region's column. It does not fold behind you, and that is
     deliberate rather than lax: a branch folding above the pointer pulls the
     whole column up, the row you were reading slides out from under the
     cursor, and the board walks away down the list. Nothing above the pointer
     ever moves now, because nothing above the pointer ever closes.

     THE REGION IS THE BOUNDARY. Crossing from Maharashtra to Karnataka folds
     everything Maharashtra had open, and back again folds Karnataka's — so a
     column is only ever as long as one region's worth of reading, and the two
     halves never grow into each other. Leaving the board folds the lot.

     A CLICK still means something: it PINS a branch, and a pin survives the
     region change and the pointer leaving altogether. Picking an engineer pins
     his branch for the same reason — his report is open below, and the board
     has to keep showing where he came from.

     One timer, for intent: a branch has to be under the pointer for a moment
     before it unfolds, or sweeping the column to reach the bottom would open
     every branch on the way. */
  const HOVER_IN_MS = 120;
  // how long after a fold that could not be anchored a hover is ignored for.
  // Long enough to cover the re-target, short enough that a deliberate move
  // never waits on it.
  const SETTLE_MS = 180;
  /* A FLAG, not a clock reading: the handlers below only ever read a ref, so
     nothing in the render path calls an impure function. */
  const armSettle = () => {
    settling.current = true;
    if (settleT.current) clearTimeout(settleT.current);
    settleT.current = setTimeout(() => {
      settling.current = false; settleT.current = null;
    }, SETTLE_MS);
  };

  const stopTimers = () => {
    if (hoverIn.current) { clearTimeout(hoverIn.current); hoverIn.current = null; }
    hoverId.current = null;
    if (settleT.current) { clearTimeout(settleT.current); settleT.current = null; }
    settling.current = false;
  };
  useEffect(() => stopTimers, []);

  /** Remember where a branch row sits before the fold state changes, so the
      layout can be anchored back to it afterwards. */
  const capture = (id) => {
    const box = colsRef.current;
    const el = box && box.querySelector(`[data-br="${id}"]`);
    anchor.current = el ? { id, top: el.getBoundingClientRect().top } : null;
  };
  /* The scrollport that owns a row — its OWN region's column. The two regions
     used to share one, which is what made the board unreliable: folding MH
     changed the height of the one scrollport both columns lived in, so the KA
     row under the pointer moved even though nothing about KA had changed. */
  const portOf = (el) => (el && el.closest('.ex-col')) || colsRef.current;

  /* Folding a branch that sits ABOVE the pointer pulls everything under it up
     — the row you were pointing at slides out from under the cursor, which
     then lands on a different branch and opens THAT one, and the board walks
     away down the column. So the row that caused the change is pinned to the
     pixel it was on and the scrollport absorbs the difference. */
  useLayoutEffect(() => {
    const a = anchor.current; anchor.current = null;
    const box = colsRef.current;
    if (!a || !box) return;
    const el = box.querySelector(`[data-br="${a.id}"]`);
    if (!el) return;
    const moved = el.getBoundingClientRect().top - a.top;
    if (Math.abs(moved) <= 0.5) return;
    const port = portOf(el);
    if (port) port.scrollTop += moved;
    /* WHATEVER IS LEFT OVER MOVED THE POINTER'S TARGET WITHOUT THE POINTER
       MOVING. A scrollport already at its end cannot absorb the difference, so
       the rows slide under a cursor that is standing still and the browser
       fires enter for whichever branch arrived there. Left alone that opens a
       branch nobody pointed at, and the board walks off down the column — the
       exact 'sometimes it does not work'. So the residual arms a short deaf
       window, and only a residual does: when the anchor holds, nothing is
       suppressed and the next hover is instant. */
    const left = el.getBoundingClientRect().top - a.top;
    if (Math.abs(left) > 0.5) armSettle();
  }, [hoverBr, openBr]);

  /* Moving into the other region's column folds this one AT ONCE, wherever in
     the column the pointer crossed — over a branch, over the header, or over
     the empty space under the last row. Waiting for the pointer to land on a
     branch row was why MH sometimes stayed open all the way across KA. */
  const enterRegion = (rg) => {
    if (hoverRg.current === rg || settling.current) return;
    stopTimers();
    hoverRg.current = rg;
    setHoverBr((cur) => (cur.size ? new Set() : cur));
  };

  const enterBranch = (id, rg) => {
    // see the layout effect: the board is still settling under a stationary
    // pointer, so this enter is the board's doing and not the user's
    if (settling.current) return;
    stopTimers();
    if (hoverBr.has(id)) return;
    hoverId.current = id;
    hoverIn.current = setTimeout(() => {
      hoverIn.current = null; hoverId.current = null;
      // anchored on the row the pointer is ON, so the other region folding
      // away underneath cannot move it
      capture(id);
      const crossed = hoverRg.current !== rg;
      hoverRg.current = rg;
      // A NEW REGION starts from nothing — that is the whole of "MH closes
      // when you move to KA". Inside one region the set only ever grows.
      setHoverBr((cur) => (crossed ? new Set([id]) : new Set(cur).add(id)));
    }, HOVER_IN_MS);
  };
  /* A BRANCH THE POINTER ONLY PASSED OVER MUST NOT OPEN. Its timer used to
     survive the pointer moving off it — nothing cancelled an armed intent
     except entering another branch — so sweeping the list and coming to rest on
     the region header, on the empty space under the last row, or on a branch
     already open, opened whichever branch had been crossed last, 120ms after
     the pointer had left it. Nothing is folded here: within a region the set
     only ever grows, and this only withdraws an intent that was never
     completed. */
  const leaveBranch = (id) => {
    if (hoverId.current === id) stopTimers();
  };
  // leaving the board itself folds everything the pointer opened; the pins stay
  const leaveCols = () => {
    stopTimers();
    const first = hoverBr.values().next().value;
    if (first) capture(first);
    hoverRg.current = null;
    setHoverBr(new Set());
  };

  const toggleBranch = (id) => {
    const wasPinned = openBr.has(id);
    stopTimers();
    capture(id);
    setOpenBr((prev) => {
      const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
    });
    // Un-pinning has to fold the branch there and then, or the click would do
    // nothing visible while the pointer is still sitting inside it.
    if (wasPinned) setHoverBr((cur) => { const n = new Set(cur); n.delete(id); return n; });
  };
  const pinBranch = (id) => setOpenBr((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  const toggleRow = (id) => setDtOpen((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  /* The rows that HAVE a bifurcation — SR closed by SR type, spare sales by
     part category, and so on. Read off DT_ROWS rather than listed here, so a
     row that gains or loses its children is carried by this button on its own. */
  const KID_ROWS = useMemo(() => DT_ROWS.filter((r) => r.kids).map((r) => r.id), []);
  const anyRowOpen = dtOpen.size > 0;
  const toggleAllRows = () => setDtOpen(anyRowOpen ? new Set() : new Set(KID_ROWS));

  /* ---- print --------------------------------------------------------------
     The block being printed is marked in the DOM first and printed on the NEXT
     render — the print stylesheet keys off that class, so it has to be on the
     element before the dialog opens. */
  useEffect(() => {
    if (!printing) return undefined;
    document.body.classList.add('sep-printing');
    const id = setTimeout(() => {
      window.print();
      document.body.classList.remove('sep-printing');
      setPrinting(false);
    }, 80);
    return () => { clearTimeout(id); document.body.classList.remove('sep-printing'); };
  }, [printing]);
  const printIt = () => setPrinting(true);

  /* ---- export: the same table, in Excel's own colours -------------------- */
  const exportXls = () => {
    if (!se) return;
    const C = { head: '#cbe1f5', headInk: '#12224a', metric: '#eaf4fd', tot: '#dcebf9',
      kid: '#f5faff', zebra: '#f7fbff', band: '#23255f',
      line: '#9fc0df', ink: '#111827', mut: '#6b7280' };
    const B0 = `border:1px solid ${C.line};font-family:Calibri,Arial;font-size:10pt;`;
    const num = `${B0}text-align:right;`;
    const head = `${B0}background:${C.head};color:${C.headInk};font-weight:bold;text-align:center;`;
    const metS = `${B0}background:${C.metric};color:${C.ink};font-weight:bold;`;
    const kidS = `${B0}background:${C.kid};color:${C.mut};`;
    const totS = `${B0}background:${C.tot};color:${C.ink};font-weight:bold;text-align:right;`;
    const lbl = `font-family:Calibri,Arial;font-size:10pt;color:${C.mut};border:0;`;
    const val = `font-family:Calibri,Arial;font-size:10pt;color:${C.ink};font-weight:bold;border:0;`;
    const txt = (v) => String(v).replace(/<[^>]*>/g, '').replace(/–|&ndash;/g, '-').trim();
    // a 31-column grid needs a zebra or the eye loses its row
    const zebra = (i) => (i % 2 ? `background:${C.zebra};` : '');
    const mid = `${B0}text-align:center;`;
    const td = (v, st, span) => `<td style="${st}"${span ? ` colspan="${span}"` : ''}>`
      + `${v === '' || v == null ? '&nbsp;' : v}</td>`;
    /* AN IDENTIFIER IS TEXT, NOT A QUANTITY. Left to itself Excel reads
       4204350186 and 31250105 as numbers and pushes them to the right of the
       cell, where they line up with nothing and where a longer code would turn
       into 4.2E+09. mso-number-format:'\@' is Excel's own instruction to keep
       the cell as text. */
    // the backslash is written by code point: Excel wants the two characters
    // \@ in the format string, and every layer between here and the file
    // (JS template, the tool that writes it) has its own opinion about a
    // backslash in a string literal.
    // Excel's instruction to keep a cell as TEXT
    const AS_TEXT = `mso-number-format:'${String.fromCharCode(92)}@';`;
    const idv = `${val}${AS_TEXT}text-align:left;`;
    /* A CLOCK TIME MUST STAY TEXT TOO. Left alone, Excel reads '7:03 PM' as a
       time, turns it into a serial number, gives the cell its own time format —
       and then the 52px column is too narrow for what that format wants to
       print, so the whole row came out as ######## with a few survivors. As
       text it is the seven characters this page wrote and it fits.
       Matched on the VALUE rather than flagged on the row, so any row that
       comes to print a clock is carried without being listed here. */
    const CLOCK = /^\d{1,2}:\d{2}\s?(AM|PM)$/i;
    const asTyped = (t, st) => (CLOCK.test(t) ? st + AS_TEXT : st);
    /* THE VALUE SPANS FOUR COLUMNS. All of these sit in column B, which is the
       UNIT column of the table below — and a column has one width, so
       'Ch.Sambhaji Nagar (420435_1) · MH' was making Unit five times wider than
       the word 'count' needs. Spanning B:E keeps the text readable and leaves
       column B its own width. */
    const info = (a, b, st) => `<tr>${td(a, lbl)}${td(b, st || val, 4)}</tr>`;
    const met = COMMITMENTS.filter((k) => achieve(k, se.v[k.key]) >= 100).length;

    /* EXPLICIT COLUMN WIDTHS, because Excel otherwise sizes each column to its
       widest cell and a 31-day grid comes out far wider than the screen. */
    let h = '<table cellspacing="0" cellpadding="4">'
      + '<colgroup><col style="width:186px"/><col style="width:62px"/>'
      // 58 and not 52: a clock time is the widest thing a day column carries
      // ('11:52 AM'), and a column that has to clip it is how this row came out
      // unreadable in the first place
      + B.map(() => '<col style="width:58px"/>').join('')
      + '<col style="width:70px"/></colgroup>'
      + info('Engineer', se.name)
      + info('Branch', `${se.branch} (${se.bid}) &middot; ${se.region}`)
      + info('SE UID', orDash(se.uid), idv)
      + info('Employee ID', orDash(se.code), idv)
      + info('Period', `${fmtDay(S.from)} &ndash; ${fmtDay(S.to)} &middot; ${gran} wise`)
      + info('Score', `${se.score.toFixed(1)} ${se.grade} &middot; ${met} of ${COMMITMENTS.length} parameters met`)
      + '<tr><td style="border:0;height:8pt;"></td></tr>'
      + `<tr>${td('Metric', `${head}text-align:left;`)}${td('Unit', head)}`
        + B.map((b) => td(b.label + (b.sub ? `<br>${b.sub}` : ''), head)).join('')
        + td('Total / Avg', head) + '</tr>';

    let ri = 0;
    DT_ROWS.forEach((row) => {
      h += `<tr>${td(row.lab, `${metS}${zebra(ri)}`)}`
        + td(row.u, `${metS}${zebra(ri)}font-weight:normal;color:${C.mut};text-align:center;`)
        + B.map((b) => {
          const raw = row.cell ? row.cell(b)
            : (() => { const v = row.val(b); return (v == null || v === 0) ? '-' : dashZero(row.f(v)); })();
          const t = txt(raw) || '-';
          // a dash has no digits to line up with, so it is centred whatever the
          // row's own alignment is — the same rule the table on screen follows
          return td(t, asTyped(t, (t === '-' ? mid : (row.mid ? mid : num)) + zebra(ri)));
        }).join('')
        + ((tt) => td(tt, asTyped(tt, tt === '-' ? `${totS}text-align:center;` : totS)))(txt(dashZero(row.tot(B))) || '-')
        + '</tr>';
      ri += 1;
      if (row.kids) {
        row.kids().forEach((k) => {
          h += `<tr>${td(`&nbsp;&nbsp;&nbsp;${k.lab}`, kidS)}${td(k.u, `${kidS}text-align:center;`)}`
            + B.map((b) => {
              const v = k.val(b);
              const t = (v == null || v === 0) ? '-' : (txt(dashZero(k.f(v))) || '-');
              return td(t, asTyped(t, `${kidS}text-align:${t === '-' || k.mid ? 'center' : 'right'};`));
            }).join('')
            + ((tt) => td(tt, asTyped(tt, tt === '-' ? `${totS}text-align:center;` : totS)))(txt(dashZero(k.tot(B))) || '-')
            + '</tr>';
        });
      }
    });
    h += '</table>';

    const doc = `<html><head><meta charset="utf-8"></head><body>${h}</body></html>`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`﻿${doc}`], { type: 'application/vnd.ms-excel' }));
    a.download = `${se.name.replace(/[^A-Za-z0-9]+/g, '-')}_${gran}-wise_${S.from}_${S.to}.xls`;
    a.click();
  };

  /* ---- the breakdown's cells -------------------------------------------- */
  const cellsOf = (row, kid, bs = B) => bs.map((b, i) => {
    // a zero reads as a dash across the sheet: nothing happened is easier to
    // skim as an absence than as a row of 0.00s
    const raw = row.cell ? row.cell(b)
      : (() => { const v = row.val(b); return (v == null || v === 0) ? '–' : dashZero(row.f(v)); })();
    const plainTxt = String(raw).replace(/<[^>]*>/g, '');
    /* A DASH IS CENTRED, whatever the row's own alignment is. The figures stay
       right-aligned so their digits line up down the column — that is what
       makes a money or percentage column readable — but a dash has no digits
       to align, and hanging it on the right edge left every empty cell looking
       ragged against a row of full ones. Only the placeholder moves; a cell
       with a number in it is untouched. */
    const isDash = plainTxt.trim() === '–';
    return (
      <td key={i} className={`${b.off ? 'off ' : ''}${kid ? 'k ' : ''}`
        + `${row.mid ? 'mid' : ''}${isDash ? ' nil' : ''}`}
        title={`${b.label}${b.sub ? ` ${b.sub}` : ''} · ${row.lab}: ${plainTxt} ${row.u}`}
        dangerouslySetInnerHTML={html(String(raw))} />
    );
  });

  /* ---- the breakdown, over any slice of the buckets ---------------------- */
  const granTitle = { day: 'Day', week: 'Week', month: 'Month', quarter: 'Quarter', year: 'Year' }[gran];
  const breakdownTable = (bs, showTotal) => (
    <table className="dt-t">
      <thead>
        <tr>
          <th className="m">{granTitle} →</th>
          {bs.map((b, i) => (
            /* the LAST period carries the snap point, and only when PERIOD is
               there to be snapped clear of — a print chunk has no frozen
               column and nothing to scroll */
            <th key={i} className={`${b.off ? 'off' : ''}${b.cur ? ' cur' : ''}`
              + `${showTotal && i === bs.length - 1 ? ' snapend' : ''}`}>
              <b>{b.label}</b>{b.sub && <span>{b.sub}</span>}
            </th>
          ))}
          {showTotal && <th className="tot">Total / Avg</th>}
        </tr>
      </thead>
      <tbody>
        {DT_ROWS.map((row) => {
          const kids = row.kids ? row.kids() : null;
          const isOpen = kids && dtOpen.has(row.id);
          return (
            <React.Fragment key={row.id}>
              <tr className={`par${kids ? ' has' : ''}`}>
                <th className="m" onClick={kids ? () => toggleRow(row.id) : undefined}>
                  <span className="mw">
                    {kids ? (
                      <svg className={`dtc${isOpen ? ' open' : ''}`} viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
                        aria-hidden="true"><path d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                    ) : <i className="dtc-gap" />}
                    <span className="ml">{row.lab}<em>{row.u}</em></span>
                  </span>
                </th>
                {cellsOf(row, false, bs)}
                {/* The total is rendered as MARKUP, exactly as the period cells
                    are — a row's tot() may return markup, and as a plain text
                    child it once arrived on screen as its own source. */}
                {showTotal && (() => { const t = String(dashZero(row.tot(B)));
                  return <td className={`tot${row.mid ? ' mid' : ''}`
                    + `${t.trim() === '–' ? ' nil' : ''}`}
                  dangerouslySetInnerHTML={html(t)} />; })()}
              </tr>
              {isOpen && kids.map((k, ki) => (
                <tr className="kid" key={ki}>
                  {/* the unit is only worth stating where it CHANGES */}
                  <th className="m"><span className="mw"><i className="dtc-gap" />
                    <span className="ml">{k.lab}{k.u !== row.u && <em>{k.u}</em>}</span></span></th>
                  {cellsOf(k, true, bs)}
                  {showTotal && (() => { const t = String(dashZero(k.tot(B)));
                    return <td className={`tot${k.mid ? ' mid' : ''}`
                      + `${t.trim() === '–' ? ' nil' : ''}`}
                    dangerouslySetInnerHTML={html(t)} />; })()}
                </tr>
              ))}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );

  /* ---- the explorer ------------------------------------------------------ */
  const anyOpen = openBr.size > 0;
  const explorer = ['MH', 'KA'].map((rg) => {
    const bs = branches.filter((b) => b.region === rg)
      .map((b) => ({ b, mem: ses.filter((s) => s.bid === b.id) }))
      .filter((x) => x.mem.length)
      .map((x) => ({ ...x, r: rollup(x.mem) }))
      // by BRANCH CODE, not by score: the board is a map of the region, and a
      // map that reorders itself every period is not a map
      .sort((a, b) => branchOrder(a.b.id) - branchOrder(b.b.id));
    return (
      <div key={rg} className="ex-col" onMouseEnter={() => enterRegion(rg)}>
        <div className="ex-h">{RG_NAME[rg] || rg}
          <span>{bs.length} branch{bs.length === 1 ? '' : 'es'} · {bs.reduce((a, x) => a + x.mem.length, 0)} engineers</span>
        </div>
        {bs.length ? bs.map((x, i) => {
          const pinned = openBr.has(x.b.id);
          const isOpen = pinned || hoverBr.has(x.b.id);
          const mem = x.mem.slice().sort((a, b) => b.score - a.score);
          return (
            /* the row and its engineers share ONE hover target, so moving
               down off the branch onto its own list is not read as leaving it.
               No onMouseLeave: within a region nothing folds behind you. */
            <div key={x.b.id} className="ex-br" data-br={x.b.id}
              onMouseEnter={() => enterBranch(x.b.id, rg)}
              onMouseLeave={() => leaveBranch(x.b.id)}>
              <ExRow onClick={() => toggleBranch(x.b.id)} o={{
                key: x.b.id, kind: 'br', open: isOpen, rank: i + 1, name: x.b.name,
                sub: `${x.b.id} · ${x.mem.length} engineer${x.mem.length > 1 ? 's' : ''}`,
                met: COMMITMENTS.filter((c) => achieve(c, x.r.v[c.key]) >= 100).length,
                score: x.r.score, grade: x.r.grade,
                cls: pinned ? ' pin' : '',
                title: pinned ? 'Pinned open — click to unpin'
                  : 'Click to pin this branch open',
              }} />
              {isOpen && (
                <div className="ex-kids">
                  {mem.map((m, j) => (
                    <ExRow key={m.key} onClick={() => { pinBranch(x.b.id); setOpenSe(m.key); }} o={{
                      key: m.key, kind: 'se', rank: j + 1, name: m.name, i: j,
                      // both identities the Training Report carries, in the
                      // order the business quotes them
                      sub: `UID ${orDash(m.uid)} · Emp ID ${orDash(m.code)}`,
                      met: COMMITMENTS.filter((k) => achieve(k, m.v[k.key]) >= 100).length,
                      score: m.score, grade: m.grade,
                      cls: (openSe === m.key ? ' on' : '')
                        + (mem.length > 4 ? (j === 0 ? ' top1' : (j === mem.length - 1 ? ' bot1' : '')) : ''),
                    }} />
                  ))}
                </div>
              )}
            </div>
          );
        }) : <div className="pn-empty">No branch in this region yet.</div>}
      </div>
    );
  });

  /* ---- the charts -------------------------------------------------------- */
  const cats = B.map((b) => b.label);
  // the MONTHLY commitment spread over ONE bucket, whatever a bucket is: a
  // month gets the whole of it, a day or a week its share, a quarter three
  const perBucketTarget = (k) => (S.targets[k]
    * (B.reduce((a, b) => a + b.days, 0) / (B.length || 1))) / 30.44;

  const fyOfTo = S.to ? (Number(S.to.slice(0, 4)) - (Number(S.to.slice(5, 7)) >= 4 ? 0 : 1)) : 0;
  const scope = (gran === 'day' || gran === 'week')
    ? `${fmtDay(S.from)} – ${fmtDay(S.to)} · ${B.length} ${gran === 'day' ? 'days' : 'weeks'}`
    : gran === 'quarter'
      ? `FY ${String(fyOfTo).slice(2)}–${String(fyOfTo + 1).slice(2)} · all four quarters`
      : `${B.length} ${({ month: 'months', year: 'financial years' })[gran]} to ${fmtDay(S.to)}`;
  /* The WORKING DAYS said again, next to the period, and deliberately not as
     part of it: '31 days' is the calendar, and 20 working days is what the AOP
     master made available inside those 31 — the two are different facts and the
     productivity figure divides by the second one. It reads off the columns on
     show, so it follows the day / month / quarter view like the period does. */
  const scopeWd = se && B.length ? B.reduce((a, b) => a + (b.work || 0), 0) : 0;

  return (
    <div className="sep" ref={rootRef}>
      <style>{SE_PERFORMANCE_CSS}</style>

      {/* ===================== the branch board ===================== */}
      <section className="panel sep-hide-print">
        <div className="pn-head">
          <h3>Performance explorer <span className="sm">
            {anyOpen ? 'click an engineer for the full report'
              : 'point at a branch to unfold it · they stay open down the column · click to pin'}
          </span></h3>
          <nav className="crumbs">
            {/* where the roster comes from, on the box that shows it — an
                engineer missing here is missing from the Training Report, or
                marked left in it, and that is where he is put right */}
            <span className="ex-src" title="Active engineers of the Training Report, with the UID NO that file carries and the Employee ID from the SE UID Master. A leaver keeps his training history but leaves this report.">
              {ses.length} active {ses.length === 1 ? 'engineer' : 'engineers'} · Training Report
            </span>
            <button type="button" className="ex-back" onClick={() => setOpenBr(anyOpen ? new Set()
              : new Set(branches.filter((b) => ses.some((s) => s.bid === b.id)).map((b) => b.id)))}>
              {anyOpen ? 'Collapse all' : 'Expand all branches'}
            </button>
          </nav>
        </div>
        <div className="ex-cols" ref={colsRef} onMouseLeave={leaveCols}>{explorer}</div>
      </section>

      {/* ===================== the engineer report ===================== */}
      <section className="detail" ref={detailRef}>
        {!se ? (
          <div className="dt-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
            <b>Pick a service engineer</b>
            <span>Choose one in the explorer above — their day, week and month report opens here,
              with the charts of how the period actually ran.</span>
          </div>
        ) : (
          <>
            <div className="dt-pin">
            <div className="dt-top">
              <div className="dt-id">
                <h3>{se.name}</h3>
                <p>{se.branch} · SE UID <b>{orDash(se.uid)}</b> · Employee ID <b>{orDash(se.code)}</b> · {se.region}
                  {se.title ? <> · {se.title}</> : null}</p>
              </div>
              <div className="dt-kpis">
                <div className="dt-k"><div className="l">Score</div>
                  <div className="v">{se.score.toFixed(1)}<i>%</i></div></div>
                <div className="dt-k"><div className="l">Grade</div><div className="v">{se.grade}</div></div>
                <div className="dt-k"><div className="l">Parameter met</div>
                  <div className="v">{R.met.length}/{COMMITMENTS.length}</div></div>
                {/* PRODUCTIVITY LIVES HERE AND NOWHERE ELSE, and it names its
                    file: the SR Count commitment is the EFSR closure count, but
                    productivity is defined on the MaxTTR close count, so the two
                    numbers on this page come from two files and the label has to
                    say which. The breakdown's productivity row was removed for
                    the same reason. */}
                <div className="dt-k" title="MaxTTR close SR ÷ the AOP master's working days for the period — a different SR count from the EFSR one the SR Count commitment uses">
                  <div className="l">SR / working day</div>
                  <div className="v">{trim2(se.v.prod)}</div>
                  <div className="dt-src">on MaxTTR close SR</div></div>
                {/* THE THREE DAY FIGURES, kept apart the way Employee
                    Productivity keeps them apart — they answer three different
                    questions and collapsing them loses all three:
                      Working days   the man-days the AOP master made available,
                                     prorated to where the data stops
                      HR present     what HR's Attendance Summary says he was
                                     paid for, present + out-door duty
                      Task end       the days the MaxTTR file shows him ENDING a
                                     job in the field
                    A dash is a source that has not been uploaded, never a zero. */}
                <div className="dt-k dt-k-day" title="Available man-days from the AOP master, prorated to the last date the data covers">
                  <div className="l">Working days</div>
                  <div className="v">{trim2(se.workDays)}</div></div>
                <div className="dt-k dt-k-day" title="HR's Attendance Summary: present + out-door duty + half days. A whole-month figure.">
                  <div className="l">HR present</div>
                  <div className="v">{trim2(se.present)}</div></div>
                <div className="dt-k dt-k-day" title="Distinct SR TASK END dates — the days he finished a job in the field. Not the SR close date, which is an office event.">
                  <div className="l">Days present on task end</div>
                  <div className="v">{trim2(se.taskEnd)}</div></div>
              </div>
            </div>

            {/* the actions sit with the view control, not up in the title bar:
                they act on WHAT IS BELOW them, and that is where the eye is */}
            <div className="dt-bar sep-hide-print">
              <Picker label="View:" value={gran} options={GRANS} onPick={setGran} />
              {/* it unfolds the table below, so it belongs beside the control
                  that decides what the table shows */}
              <button type="button" className="btn" onClick={toggleAllRows}
                title={anyRowOpen ? 'Fold every metric back to its own line'
                  : 'Open every metric that splits — SR by SR type, spare sales by part category, labour by SR type, CDI by feedback'}>
                {anyRowOpen ? 'Collapse all' : 'Expand all'}
              </button>
              <span className="dt-scope">{scope}
                {scopeWd ? <b className="dt-wd" title="Available man-days from the AOP master, prorated to the last date the data covers — the divisor under SR / working day">
                  {trim2(scopeWd)} working days</b> : null}
              </span>
              <div className="dt-acts">
                  {/* NO PRINT HERE (removed 2026-09-03). The report is a
                      thirty-one-column screen instrument: on paper it had to be
                      cut into stacked blocks, and a block of figures is not
                      what anyone signs. Export gives the same table to Excel,
                      where a reader can size it themselves, and the SIGNED
                      MATRIX is the one thing meant to leave the building on
                      paper — it carries the only Print button on this page. */}
                  <button type="button" className="btn" onClick={exportXls}>Export</button>
                  <button type="button" className="btn" onClick={() => setPanel('matrix')}>Signed matrix</button>
                {/* Close LEAVES the engineer — the one button on the bar that
                    undoes the others, so it is the one that is not grey */}
                <button type="button" className="btn amber" onClick={() => setOpenSe(null)}>Close</button>
              </div>
            </div>
            </div>

            <div className="dt-body">
              <div className="dt-frame">
                <div className="dt-topbar" ref={barRef} onScroll={() => mirrorScroll('bar')}>
                  <div ref={innerRef} />
                </div>
                <div className="dt-tblbox" ref={boxRef} onScroll={() => mirrorScroll('box')}>
                  {breakdownTable(B, true)}
                </div>
              </div>

              {/* ---- HR's ATTENDANCE, DAY BY DAY ---------------------------
                  Its own table and its own columns: the breakdown above can be
                  showing weeks or quarters, and attendance is only ever a
                  statement about days. It always draws the month the period
                  picker is on. */}
              {(() => {
                const month = S.from.slice(0, 7);
                const label = new Date(`${month}-01T00:00:00`)
                  .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
                const A = attendanceOf(se, month);
                return (
                  <div className="at-box">
                    <div className="at-h">
                      <span className="at-t">Attendance</span>
                      <span className="at-s">{label} · HR&rsquo;s day-wise file</span>
                      {A && (
                        <span className="at-chips">
                          {ATT_ORDER.filter((c) => A.counts[c]).map((c) => (
                            <span key={c} className={`at-chip ${ATT[c].cls}`}>
                              <i>{ATT[c].tag}</i>{ATT[c].lab}
                              <b>{A.counts[c]}</b>
                            </span>
                          ))}
                        </span>
                      )}
                      {A && (
                        <span className="at-k">
                          <b>{attDays(A.worked)}</b> day{A.worked === 1 ? '' : 's'} worked
                          <em>{iN(Math.round(se.workDays || 0))} working days on the AOP master</em>
                        </span>
                      )}
                    </div>
                    {A ? (
                      <>
                        <div className="at-tblbox">
                          <table className="dt-t at-tbl">
                            <thead>
                              <tr>
                                <th className="m">Day &rarr;</th>
                                {A.days.map((d) => (
                                  <th key={d.d} className={d.sunday ? 'off' : ''}>
                                    <b>{String(d.d).padStart(2, '0')}</b><span>{d.dow}</span>
                                  </th>
                                ))}
                                <th className="tot">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="par">
                                <th className="m"><span className="mw"><i className="dtc-gap" />
                                  <span className="ml">Attendance<em>HR</em></span></span></th>
                                {A.days.map((d) => (
                                  <td key={d.d} className={`mid ${d.cls}`} title={`${d.iso} · ${d.lab}`}>
                                    {d.tag}
                                  </td>
                                ))}
                                <td className="tot mid">{iN(A.days.length)}</td>
                              </tr>
                              <tr className="kid">
                                <th className="m"><span className="mw"><i className="dtc-gap" />
                                  <span className="ml">Counts as<em>days</em></span></span></th>
                                {A.days.map((d) => (
                                  <td key={d.d} className={`mid${d.worth ? '' : ' nil'}`}
                                    title={`${d.iso} · ${d.lab}`}>
                                    {d.worth ? attDays(d.worth) : DASH}
                                  </td>
                                ))}
                                <td className="tot mid">{attDays(A.worked)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      /* TWO DIFFERENT SILENCES, and they must not read the
                         same. A month with no file at all is waiting for an
                         upload; a month whose file does not name this engineer
                         is HR's own answer, and no upload will change it. */
                      <div className="at-none">
                        {S.attMonths.includes(month) ? (
                          <>HR&rsquo;s {label} attendance file does not list this engineer.
                            It carried {S.attMonths.length === 1 ? 'the month' : 'that month'}&rsquo;s
                            attendance for everyone on the payroll that month, and he is not among them
                            &mdash; nothing here is missing, HR has simply not accounted for him.</>
                        ) : (
                          <>HR has not uploaded a day-wise attendance file for {label}.
                            It is imported from the SE UID Master on the Profile page &mdash;
                            the &lsquo;Attendance {label.split(' ')[0]}&rsquo; export, with the month chosen
                            in the dialog.</>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="dt-charts">
                <figure className="ch">
                  <figcaption><span className="ch-t">SR closed</span>
                    <span className="ch-s">EFSR closures · against the {iN(S.targets.sr)}-a-month commitment</span></figcaption>
                  <div dangerouslySetInnerHTML={html(colChart(cats,
                    [{ name: 'SR closed', color: 'var(--viz-1)', values: B.map((b) => b.sr) }],
                    { target: perBucketTarget('sr'), targetLabel: 'commitment', aria: `SR closed per ${gran}` }))} />
                </figure>

                <figure className="ch">
                  {/* ONE AT A TIME, on a tab. Spare and labour are two
                      commitments with two targets, and drawing them together —
                      stacked or side by side — asks the reader to compare two
                      figures that are not measured against each other. A tab
                      gives each the whole chart and the whole y scale: labour is
                      a third of spare's commitment, so sharing an axis flattened
                      it to nothing. */}
                  <figcaption><span className="ch-t">Revenue</span><span className="ch-s">₹ lakh</span>
                    <span className="ch-tabs" role="tablist">
                      {REV_TABS.map((t) => (
                        <button key={t.k} type="button" role="tab"
                          aria-selected={revTab === t.k}
                          className={`ch-tab${revTab === t.k ? ' on' : ''}`}
                          onClick={() => setRevTab(t.k)}
                          title={`${t.lab} — commitment ₹${iN(S.targets[t.k])} a month`}>
                          <i style={{ background: t.color }} />{t.lab}
                        </button>
                      ))}
                    </span></figcaption>
                  {(() => {
                    const t = REV_TABS.find((x) => x.k === revTab) || REV_TABS[0];
                    return (
                      <div dangerouslySetInnerHTML={html(colChart(cats,
                        [{ name: t.lab, color: t.color, values: B.map((b) => b[t.k] / 1e5) }],
                        { fmtY: (v) => v.toFixed(1), fmtV: (v) => `₹${v.toFixed(2)} L`,
                          aria: `${t.lab} revenue per ${gran}` }))} />
                    );
                  })()}
                </figure>

                <figure className="ch">
                  <figcaption><span className="ch-t">Productivity</span>
                    <span className="ch-s">MaxTTR close SR per working day</span></figcaption>
                  <div dangerouslySetInnerHTML={html(lineChart(cats,
                    /* the master's man-days, the same divisor the figure above
                       uses; null where a column has none, so the line breaks
                       instead of diving to the floor */
                    [{ name: 'SR / working day', color: 'var(--viz-1)', values: B.map((b) => (b.work ? b.maxSr / b.work : null)) }],
                    /* no period-average line: the average of the columns on
                       show is not a target, and a dashed line across a chart
                       reads as one */
                    { fmtY: (v) => v.toFixed(1),
                      fmtV: (v) => v.toFixed(2), aria: 'Productivity trend' }))} />
                </figure>

                <figure className="ch">
                  <figcaption><span className="ch-t">Quality &amp; discipline</span>
                    <span className="ch-s">1st site &mdash; start time · against the 10:00 commitment</span>
                  </figcaption>
                  {(() => {
                    const t = FIRST_CHART;
                    const vals = B.map(t.val);
                    /* A CLOCK AXIS IS NOT ANCHORED AT ZERO. Midnight is not a
                       start time anybody has, and an axis from it spends
                       two-thirds of the chart on hours nobody works and
                       flattens the half-hour that decides this commitment. The
                       window is the whole hours around what he actually did,
                       always wide enough to hold the 10 o'clock line. */
                    const seen = vals.filter((v) => v != null && isFinite(v));
                    const lo = Math.min(t.ref, ...seen);
                    const hi = Math.max(t.ref, ...seen);
                    return (
                      <div dangerouslySetInnerHTML={html(colChart(cats,
                        [{ name: t.lab, color: t.color, values: vals }],
                        { min: seen.length ? Math.floor((lo - 20) / 60) * 60 : 0,
                          max: seen.length ? Math.ceil((hi + 20) / 60) * 60 : 0,
                          fmtY: hhmm, target: t.ref, targetLabel: t.refLabel,
                          fmtV: hhmm, aria: `First site start time by ${gran}` }))} />
                    );
                  })()}
                </figure>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ===================== the three panels ===================== */}
      {se && panel === 'matrix' && (
        <div className="mask open" onClick={(e) => { if (e.target === e.currentTarget) setPanel(null); }}>
          <div className={`sheet${printing ? ' sep-print-area' : ''}`}>
            <SignedMatrix se={se} R={R} onPrint={printIt} onClose={() => setPanel(null)} />
          </div>
        </div>
      )}
    </div>
  );
};

/* ---- the signed Annexure I ------------------------------------------------ */
const SignedMatrix = ({ se, R, onPrint, onClose }) => {
  const A = (k) => achieve(k, se.v[k.key]);
  return (
    <>
      <div className="sh-pin">
        <div className="sh-top">
          <div>
            <h2>Service Engineer Performance Commitment &amp; Accountability Matrix</h2>
            <div className="s2">Annexure – I · KALA Care Global Services LLP · period {fmtDay(S.from)} – {fmtDay(S.to)}</div>
          </div>
          <div style={{ display: 'flex', gap: 7 }} className="sep-hide-print">
            <button type="button" className="sh-x" onClick={onPrint}>Print</button>
            <button type="button" className="sh-x" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="sh-id">
          <div className="f"><div className="l">Employee Name</div><div className="v" title={se.name}>{se.name}</div></div>
          <div className="f"><div className="l">Employee ID</div><div className="v">{orDash(se.code)}</div></div>
          <div className="f"><div className="l">Branch / Outlet</div><div className="v">{se.branch}</div></div>
          <div className="f"><div className="l">SE UID · Region</div><div className="v">{orDash(se.uid)} · {se.region}</div></div>
          {/* counted from the TRAINING REPORT'S HIRE DATE, which is one of the
              nine fixed columns of that import. HR's Attendance Summary has a
              date of joining too and the two disagree on 95 of 119 engineers,
              so HR is the fallback only — for a man the training file gives no
              date — and a fallback is marked with a * and named in the tip. */}
          <div className="f" title={R.tenure && R.tenure.src === 'hr'
            ? 'From HR’s date of joining — the Training Report has no hire date for him'
            : 'From the Training Report’s HIRE DATE column'}>
            <div className="l">With KCGL</div><div className="v">{R.tenure ? R.tenure.label : '—'}
            <span className="vs">{R.tenure
              ? `since ${fmtTrainDate(R.tenure.from)}${R.tenure.src === 'hr' ? ' *' : ''}`
              : ''}</span></div></div>
          <div className="f"><div className="l">Trainings on record</div><div className="v">{R.tr.length}
            <span className="vs">{R.tr.length ? `last ${fmtTrainDate(R.tr[0][2])}` : 'none'}</span></div></div>
        </div>

        <div className={`sh-verdict v-${R.tone}`}>
          <div className="sc"><div className="l">Commitment score</div>
            <div className="big" style={{ color: scoreInk(se.score) }}>{se.score.toFixed(1)}<span>%</span></div>
            <span className={`gr gr-${se.grade}`}>{se.grade}</span></div>
          <div className="vd">
            <div className="l">Recommendation</div>
            <div className="h">{R.verdict}</div>
            <div className="w">{R.why}</div>
          </div>
          <div className="vm">
            <div><b>{R.met.length}</b> of {COMMITMENTS.length} parameters met</div>
            <div><b>{R.comply}</b> of {COMPLY.length} mandatory items in order</div>
            <div><b>{R.support}</b> of {SUPPORT.length} support items issued</div>
            <div>{se.present == null
              ? <><b>Attendance –</b> HR has not sent this month</>
              : <><b>{trim2(se.present)} P · {trim2(R.absent)} A</b> of {trim2(se.workDays)} working days</>}</div>
          </div>
        </div>
      </div>

      <div className="sh-body">
        <div className="sh-h">Minimum Monthly Performance Commitments <span>actuals for the selected period</span></div>
        <table className="sh-t">
          <colgroup><col className="w-n" /><col className="w-k" /><col className="w-c" /><col className="w-a" /><col className="w-p" /><col className="w-s" /></colgroup>
          <thead><tr><th>Sr.</th><th style={{ textAlign: 'left' }}>KPI</th><th>Target</th><th>Achievement</th><th>Ach. %</th><th>Status</th></tr></thead>
          <tbody>
            {COMMITMENTS.slice().sort((x, y) => x.no - y.no).map((k) => {
              /* Ach. % and Status are coloured by the KPI'S OWN BAND, not by
                 the generic ladder — the thresholds differ per commitment and
                 First Site's are on the clock. See bandOf(). */
              const v = se.v[k.key]; const p = A(k); const st = bandOf(k, se);
              return (
                <tr key={k.key}>
                  <td className="n">{k.no}</td>
                  <td className="k"><div>{plain(k.name)}</div>{k.hint && <div className="sub2">{plain(k.hint)}</div>}</td>
                  <td className="c"><b>{targetText(k)}</b>
                    <div className="sub2">{k.commit}{k.perMonth && S.months > 1.02 ? ` · ×${S.months.toFixed(S.months % 1 ? 1 : 0)} months` : ''}</div></td>
                  <td className="a">{fmtVal(k, v).replace(/%|₹/g, '')}
                    {/* the Achievement IS the average now, so the sub-line
                        says what it is an average OF rather than repeating it */}
                    {k.key === 'first' && se.v.first != null && (
                      <div className="sub2">avg of {iN(se.fsDays)} day{se.fsDays === 1 ? '' : 's'}</div>
                    )}
                    {k.key === 'attend' && <div className="sub2">{se.present == null
                      ? 'HR attendance not uploaded'
                      : `${trim2(se.present)} P · ${trim2(R.absent)} A of ${trim2(se.workDays)}`}</div>}
                  </td>
                  <td className={`p sh-${st}`}>{p == null ? '–' : Math.round(p)}</td>
                  <td className={`s sh-${st}`}>{BAND_LABEL[st]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* ---- FOUR POINTS ------------------------------------------------
            What replaced the priced-up "shortfall" section. That block read
            every gap out as money and advice, and on real data it asserted
            things like "₹1,50,000 at stake", "earns ₹0 a job", "the branch
            attaches ₹0" and "one AMC ask on every 2th job" — every one of them
            a missing figure printed as a zero.

            Four things a manager can act on instead: what he DID, what it
            EARNED, whether he was THERE, and how the work LANDED. Each carries
            its own comparison, and a point whose file has nothing to say names
            the file instead of showing a zero. Built in pointsOf(). */}
        <div className="sh-h">Four points on this engineer
          <span>each from the file that knows it · his own period</span></div>

        <div className="pts">
          {R.points.map((p) => (
            <div className={`pt p-${p.tone}`} key={p.k}>
              <div className="pt-h">
                <span className="pt-l">{p.lab}</span>
                <span className="pt-n">{p.big}</span>
              </div>
              <div className="pt-s">{p.sub}</div>
              <div className="pt-b" dangerouslySetInnerHTML={html(p.say)} />
            </div>
          ))}
        </div>

        {/* ---- ACKNOWLEDGEMENT, print only -------------------------------
            On screen this panel is a report and the reader is already looking
            at it. On paper it is Annexure I to a commitment letter — the thing
            that gets read out, agreed and signed — so the print carries the
            lines for that and the screen does not (.sh-sign is display:none
            outside the print stylesheet). Roles, not names, in the labels: the
            engineer's own name is the one fact the sheet already knows. */}
        <div className="sh-sign">
          <div className="sh-h">Acknowledgement <span>to be signed on review</span></div>
          <p className="sh-sign-p">
            The commitments above, and the actuals recorded against them for
            {' '}{fmtDay(S.from)} &ndash; {fmtDay(S.to)}, have been read and discussed with the
            engineer named on this sheet.
          </p>
          <div className="sh-sign-g">
            {[['Service Engineer', se.name],
              ['Branch Manager', se.branch],
              ['HOD &ndash; Service', '']].map(([lab, sub]) => (
                <div className="sl" key={lab}>
                  <div className="sl-line" />
                  <div className="sl-l" dangerouslySetInnerHTML={html(lab)} />
                  <div className="sl-s">{sub || '\u00a0'}</div>
                  <div className="sl-d">Date</div>
                </div>
            ))}
          </div>
          <div className="sh-sign-f">
            KALA Care Global Services LLP &middot; Annexure &ndash; I &middot; printed
            {' '}{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            {' '}&middot; figures from the PMS files of record
          </div>
        </div>
      </div>
    </>
  );
};

export default SEPerformanceReport;
