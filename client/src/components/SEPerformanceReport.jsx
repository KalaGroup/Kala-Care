import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import SE_PERFORMANCE_CSS from './sePerformance/styles';
import {
  COMMITMENTS, SUPPORT, COMPLY, RG_NAME, S, branchOrder,
  setPeriod, rollup, achieve, targetText, statusOf,
  fmtVal, fmtDay, iN, trim2, dashZero, plain, firstName, fmtTrainDate,
  buildEngineers,
} from '../utils/sePerformanceModel';
import { DT_ROWS, bucketsFor, reviewOf, summaryOf } from '../utils/sePerformanceSeries';
import { colChart, lineChart } from '../utils/sePerformanceCharts';

/* ============================================================================
   SE Performance — the report.

   Three things live on this page and nothing else:
     the EXPLORER   every branch, Maharashtra left and Karnataka right, each
                    unfolding its engineers in place like a sitemap
     the REPORT     one engineer, day / week / month / quarter / year, with the
                    breakdown, a short summary and four charts
     three PANELS   the signed Annexure I matrix, Employee assets, Training &
                    Skill — each opened from the report's own header

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
// The BAR is a fill: green, yellow, orange, red — the ladder the ERP's own
// percentage cells use, at a saturation that still reads at 8px.
const scoreFill = (v) => (v >= 90 ? '#16a34a' : v >= 80 ? '#4ade80'
  : v >= 70 ? '#facc15' : v >= 60 ? '#fb923c' : '#ef4444');
// The big number on the printed matrix is TEXT on white, so it keeps an ink
// colour — a yellow numeral on paper cannot be read.
const scoreInk = (v) => (v >= 90 ? 'var(--pms-ok-ink)' : v >= 80 ? '#3f7a2e'
  : v >= 70 ? 'var(--pms-near-ink)' : 'var(--pms-miss-ink)');

const html = (s) => ({ __html: s });
/** An id the masters do not carry prints as a dash. A number that looks real
    but is not sends nobody to the SE UID Master to fix it. */
const orDash = (v) => (v && String(v).trim() ? String(v).trim() : '—');

/* ---- one row of the explorer tree ---------------------------------------- */
const ExRow = ({ o, onClick }) => (
  <div className={`pn-row ${o.kind}${o.cls || ''}${o.open ? ' open' : ''}`} onClick={onClick}>
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

const GRANS = [
  { v: 'day', label: 'Day wise', sub: 'every day of the period' },
  { v: 'week', label: 'Week wise', sub: 'calendar weeks, Mon–Sun' },
  { v: 'month', label: 'Month wise', sub: 'trailing 12 months' },
  { v: 'quarter', label: 'Quarterly', sub: 'financial quarters, 2 years back' },
  { v: 'year', label: 'Yearly', sub: 'financial years, 4 years back' },
];

/* ========================================================================== */
const SEPerformanceReport = ({ roster, periodFrom, periodTo }) => {
  const [openBr, setOpenBr] = useState(() => new Set());
  const [openSe, setOpenSe] = useState(null);
  const [gran, setGran] = useState('day');
  const [dtOpen, setDtOpen] = useState(() => new Set());
  const [panel, setPanel] = useState(null);          // the signed matrix, which is a document
  const [inline, setInline] = useState(null);       // 'assets' | 'training' — short forms, in the page
  const [tick, setTick] = useState(0);               // a manager's checkbox re-reads the panels
  const [printing, setPrinting] = useState(null);   // 'detail' | 'sheet' — what the page is printing
  const detailRef = useRef(null);
  const inlineRef = useRef(null);
  const rootRef = useRef(null);
  const boxRef = useRef(null);
  const barRef = useRef(null);
  const innerRef = useRef(null);

  // the roster is built once; the PERIOD then re-resolves every engineer
  const { branches, ses } = useMemo(() => buildEngineers(roster || {}), [roster]);
  useMemo(() => {
    if (periodFrom && periodTo) setPeriod(ses, periodFrom, periodTo);
    return null;
  }, [ses, periodFrom, periodTo]);
  S.gran = gran;

  const se = openSe ? ses.find((x) => x.key === openSe) : null;
  const B = useMemo(() => (se ? bucketsFor(se) : []), [se, gran, periodFrom, periodTo, tick]);
  const R = useMemo(() => (se ? reviewOf(se, ses) : null), [se, ses, periodFrom, periodTo, tick]);
  const SUM = useMemo(() => (se && B.length ? summaryOf(se, B) : null), [se, B]);

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

  /* ---- the mirrored scrollbar above the breakdown ------------------------ */
  const syncBar = useCallback(() => {
    const box = boxRef.current; const bar = barRef.current; const inner = innerRef.current;
    if (!box || !bar || !inner) return;
    // measure the TABLE, not the box: the box's scrollWidth is only right once
    // the table has been laid out, and reading it a frame too early makes the
    // thumb span the whole strip however wide the table really is
    const table = box.querySelector('table');
    const w = Math.max(box.scrollWidth, table ? Math.ceil(table.getBoundingClientRect().width) : 0);
    const need = w > box.clientWidth + 1;
    bar.classList.toggle('hide', !need);
    inner.style.width = need ? `${w}px` : '100%';
    bar.scrollLeft = box.scrollLeft;
  }, []);
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

  useEffect(() => {
    if (se && detailRef.current) detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [openSe]);          // eslint-disable-line react-hooks/exhaustive-deps

  // opening a form scrolls to it — but the header and its buttons are pinned,
  // so the control you just pressed is still under your hand
  useEffect(() => {
    if (inline && inlineRef.current) inlineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [inline]);

  // a different engineer closes whatever form was open on the last one
  useEffect(() => { setInline(null); }, [openSe]);

  const toggleBranch = (id) => setOpenBr((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const toggleRow = (id) => setDtOpen((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const bump = () => setTick((t) => t + 1);

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
      setPrinting(null);
    }, 80);
    return () => { clearTimeout(id); document.body.classList.remove('sep-printing'); };
  }, [printing]);
  const printIt = (what) => setPrinting(what);

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
    const td = (v, st) => `<td style="${st}">${v === '' || v == null ? '&nbsp;' : v}</td>`;
    const info = (a, b) => `<tr>${td(a, lbl)}${td(b, val)}</tr>`;
    const met = COMMITMENTS.filter((k) => achieve(k, se.v[k.key]) >= 100).length;

    let h = '<table cellspacing="0" cellpadding="4">'
      + info('Engineer', se.name)
      + info('Branch', `${se.branch} (${se.bid}) &middot; ${se.region}`)
      + info('SE UID', orDash(se.uid))
      + info('Employee code', orDash(se.code))
      + info('Period', `${fmtDay(S.from)} &ndash; ${fmtDay(S.to)} &middot; ${gran} wise`)
      + info('Score', `${se.score.toFixed(1)} ${se.grade} &middot; ${met} of ${COMMITMENTS.length} parameters met`)
      + '<tr><td style="border:0;height:8pt;"></td></tr>'
      + `<tr>${td('Metric', `${head}text-align:left;`)}${td('Unit', head)}`
        + B.map((b) => td(b.label + (b.sub ? `<br>${b.sub}` : ''), head)).join('')
        + td('Period', head) + '</tr>';

    let ri = 0;
    DT_ROWS.forEach((row) => {
      h += `<tr>${td(row.lab, `${metS}${zebra(ri)}`)}`
        + td(row.u, `${metS}${zebra(ri)}font-weight:normal;color:${C.mut};text-align:center;`)
        + B.map((b) => {
          const raw = row.cell ? row.cell(b)
            : (() => { const v = row.val(b); return (v == null || v === 0) ? '-' : dashZero(row.f(v)); })();
          return td(txt(raw) || '-', (row.mid ? mid : num) + zebra(ri));
        }).join('')
        + td(txt(dashZero(row.tot(B))) || '-', totS) + '</tr>';
      ri += 1;
      if (row.kids) {
        row.kids().forEach((k) => {
          h += `<tr>${td(`&nbsp;&nbsp;&nbsp;${k.lab}`, kidS)}${td(k.u, `${kidS}text-align:center;`)}`
            + B.map((b) => { const v = k.val(b); return td((v == null || v === 0) ? '-' : txt(dashZero(k.f(v))), `${kidS}${k.mid ? 'text-align:center;' : 'text-align:right;'}`); }).join('')
            + td(txt(dashZero(k.tot(B))) || '-', totS) + '</tr>';
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
    return (
      <td key={i} className={`${b.off ? 'off ' : ''}${kid ? 'k ' : ''}${row.mid ? 'mid' : ''}`}
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
            <th key={i} className={`${b.off ? 'off' : ''}${b.cur ? ' cur' : ''}`}>
              <b>{b.label}</b>{b.sub && <span>{b.sub}</span>}
            </th>
          ))}
          {showTotal && <th className="tot">Period<span>total / avg</span></th>}
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
                {showTotal && <td className={`tot${row.mid ? ' mid' : ''}`}>{dashZero(row.tot(B))}</td>}
              </tr>
              {isOpen && kids.map((k, ki) => (
                <tr className="kid" key={ki}>
                  {/* the unit is only worth stating where it CHANGES */}
                  <th className="m"><span className="mw"><i className="dtc-gap" />
                    <span className="ml">{k.lab}{k.u !== row.u && <em>{k.u}</em>}</span></span></th>
                  {cellsOf(k, true, bs)}
                  {showTotal && <td className={`tot${k.mid ? ' mid' : ''}`}>{dashZero(k.tot(B))}</td>}
                </tr>
              ))}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );

  // A4 landscape leaves room for about this many period columns beside the
  // metric column at print size. Fewer than a full block and it prints as one.
  const PRINT_COLS = 15;
  const printChunks = useMemo(() => {
    if (B.length <= PRINT_COLS) return [B];
    const out = [];
    for (let i = 0; i < B.length; i += PRINT_COLS) out.push(B.slice(i, i + PRINT_COLS));
    return out;
  }, [B]);

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
      <div key={rg}>
        <div className="ex-h">{RG_NAME[rg] || rg}
          <span>{bs.length} branch{bs.length === 1 ? '' : 'es'} · {bs.reduce((a, x) => a + x.mem.length, 0)} engineers</span>
        </div>
        {bs.length ? bs.map((x, i) => {
          const isOpen = openBr.has(x.b.id);
          const mem = x.mem.slice().sort((a, b) => b.score - a.score);
          return (
            <React.Fragment key={x.b.id}>
              <ExRow onClick={() => toggleBranch(x.b.id)} o={{
                key: x.b.id, kind: 'br', open: isOpen, rank: i + 1, name: x.b.name,
                sub: `${x.b.id} · ${x.mem.length} engineer${x.mem.length > 1 ? 's' : ''}`,
                met: COMMITMENTS.filter((c) => achieve(c, x.r.v[c.key]) >= 100).length,
                score: x.r.score, grade: x.r.grade,
              }} />
              {isOpen && (
                <div className="ex-kids">
                  {mem.map((m, j) => (
                    <ExRow key={m.key} onClick={() => setOpenSe(m.key)} o={{
                      key: m.key, kind: 'se', rank: j + 1, name: m.name,
                      sub: `UID ${orDash(m.uid)} · code ${orDash(m.code)}`,
                      met: COMMITMENTS.filter((k) => achieve(k, m.v[k.key]) >= 100).length,
                      score: m.score, grade: m.grade,
                      cls: (openSe === m.key ? ' on' : '')
                        + (mem.length > 4 ? (j === 0 ? ' top1' : (j === mem.length - 1 ? ' bot1' : '')) : ''),
                    }} />
                  ))}
                </div>
              )}
            </React.Fragment>
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

  return (
    <div className="sep" ref={rootRef}>
      <style>{SE_PERFORMANCE_CSS}</style>

      {/* ===================== the branch board ===================== */}
      <section className="panel sep-hide-print">
        <div className="pn-head">
          <h3>Performance explorer <span className="sm">
            {anyOpen ? 'click an engineer for the full report' : 'click a branch to unfold its service engineers'}
          </span></h3>
          <nav className="crumbs">
            <button type="button" className="ex-back" onClick={() => setOpenBr(anyOpen ? new Set()
              : new Set(branches.filter((b) => ses.some((s) => s.bid === b.id)).map((b) => b.id)))}>
              {anyOpen ? 'Collapse all' : 'Expand all branches'}
            </button>
          </nav>
        </div>
        <div className="ex-cols">{explorer}</div>
      </section>

      {/* ===================== the engineer report ===================== */}
      <section className={`detail${printing === 'detail' ? ' sep-print-area' : ''}`} ref={detailRef}>
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
                <p>{se.branch} · SE UID <b>{orDash(se.uid)}</b> · Employee Code <b>{orDash(se.code)}</b> · {se.region}</p>
              </div>
              <div className="dt-kpis">
                <div className="dt-k"><div className="l">Score</div>
                  <div className="v">{se.score.toFixed(1)}<i>%</i></div></div>
                <div className="dt-k"><div className="l">Grade</div><div className="v">{se.grade}</div></div>
                <div className="dt-k"><div className="l">Parameter met</div>
                  <div className="v">{R.met.length}/{COMMITMENTS.length}</div></div>
                <div className="dt-k"><div className="l">Productivity</div>
                  <div className="v">{trim2(se.v.prod)}</div></div>
              </div>
            </div>

            {/* the actions sit with the view control, not up in the title bar:
                they act on WHAT IS BELOW them, and that is where the eye is */}
            <div className="dt-bar sep-hide-print">
              <Picker label="View:" value={gran} options={GRANS} onPick={setGran} />
              <span className="dt-scope">{scope}</span>
              <div className="dt-acts">
                  <button type="button" className="btn" onClick={() => printIt('detail')}>Print</button>
                  <button type="button" className="btn" onClick={exportXls}>Export</button>
                  <button type="button" className="btn" onClick={() => setPanel('matrix')}>Signed matrix</button>
                  <button type="button" className={`btn${inline === 'assets' ? ' on' : ''}`}
                    onClick={() => setInline(inline === 'assets' ? null : 'assets')}>Employee assets</button>
                  <button type="button" className={`btn${inline === 'training' ? ' on' : ''}`}
                    onClick={() => setInline(inline === 'training' ? null : 'training')}>Training &amp; Skill</button>
                <button type="button" className="btn" onClick={() => setOpenSe(null)}>Close</button>
              </div>
            </div>
            </div>

            <div className="dt-body">
              {/* when the paper copy takes over, the scrolling one steps aside */}
              <div className={`dt-frame${printing === 'detail' && printChunks.length > 1 ? ' dt-frame-off' : ''}`}>
                <div className="dt-topbar" ref={barRef}
                  onScroll={() => { if (boxRef.current && barRef.current) boxRef.current.scrollLeft = barRef.current.scrollLeft; }}>
                  <div ref={innerRef} />
                </div>
                <div className="dt-tblbox" ref={boxRef}
                  onScroll={() => { if (boxRef.current && barRef.current) barRef.current.scrollLeft = boxRef.current.scrollLeft; }}>
                  {breakdownTable(B, true)}
                </div>
              </div>

              {/* On paper the columns cannot scroll, so the breakdown is cut
                  into blocks that fit the page and stacked. Every block carries
                  the metric column again — a block of figures with no labels
                  down its side is unreadable — and only the LAST one carries
                  the Period total, so no block reads as a subtotal of itself. */}
              {printing === 'detail' && printChunks.length > 1 && (
                <div className="dt-print-only">
                  {printChunks.map((chunk, ci) => (
                    <div className="dt-chunk" key={ci}>
                      <div className="dt-chunk-h">
                        {({ day: 'Days', week: 'Weeks', month: 'Months', quarter: 'Quarters', year: 'Years' })[gran]}
                        {' '}{chunk[0].label}{chunk.length > 1 ? ` – ${chunk[chunk.length - 1].label}` : ''}
                        <span>block {ci + 1} of {printChunks.length}</span>
                      </div>
                      {breakdownTable(chunk, ci === printChunks.length - 1)}
                    </div>
                  ))}
                </div>
              )}

              {inline && (
                <section className="inl" ref={inlineRef}>
                  <div className="inl-top">
                    <div>
                      <h4>{inline === 'assets' ? 'Employee assets' : 'Training & Skill'}</h4>
                      <div className="s2">{se.name} · {se.branch} · SE UID {orDash(se.uid)}</div>
                    </div>
                    <div className="inl-acts">
                      <button type="button" className="btn on" onClick={() => setInline(null)}>Save</button>
                      <button type="button" className="btn" onClick={() => setInline(null)}>Close</button>
                    </div>
                  </div>
                  <div className="inl-body">
                    {inline === 'assets'
                      ? <AssetsForm se={se} redraw={bump} />
                      : <TrainingForm se={se} R={R} />}
                  </div>
                </section>
              )}

              {SUM && (
                <section className="sm-box">
                  <h4>Summary <span>{firstName(se.name)} · {gran === 'day' || gran === 'week' ? 'the selected period' : scope}</span></h4>
                  <div className="sm-tiles">
                    <div className="sm-t"><span className="l">Parameter met</span>
                      <span className="v">{SUM.met.length} / {COMMITMENTS.length}</span>
                      <span className="h">score {se.score.toFixed(1)} · grade {se.grade}</span></div>
                    <div className="sm-t"><span className="l">SR closed</span>
                      <span className="v">{iN(SUM.sr)}</span>
                      <span className="h">{SUM.pres ? (SUM.sr / SUM.pres).toFixed(2) : '–'} per day present</span></div>
                    <div className="sm-t"><span className="l">Revenue</span>
                      <span className="v" style={{ color: SUM.rev >= SUM.revT * SUM.nMonths ? 'var(--pms-ok-ink)' : 'var(--pms-miss-ink)' }}>
                        ₹{(SUM.rev / 1e5).toFixed(2)} L</span>
                      <span className="h">committed ₹{((SUM.revT * SUM.nMonths) / 1e5).toFixed(2)} L</span></div>
                    {/* over a quarter or a year the raw totals mean nothing to read
                        — 484 of 626 days is not a figure anyone holds in their
                        head. Past a month the tile shows the MONTHLY AVERAGE. */}
                    <div className="sm-t"><span className="l">Present</span>
                      <span className="v" style={{ color: SUM.work && (SUM.pres / SUM.work) * 100 >= S.targets.attend ? 'var(--pms-ok-ink)' : 'var(--pms-miss-ink)' }}>
                        {SUM.nMonths > 1.2
                          ? `${Math.round(SUM.pres / SUM.nMonths)} / ${Math.round(SUM.work / SUM.nMonths)}`
                          : `${SUM.pres} / ${SUM.work}`}</span>
                      <span className="h">
                        {SUM.nMonths > 1.2
                          ? `avg a month over ${SUM.nMonths.toFixed(0)} · ${SUM.work ? ((SUM.pres / SUM.work) * 100).toFixed(1) : '0'}%`
                          : `of ${SUM.work} working days · ${SUM.work ? ((SUM.pres / SUM.work) * 100).toFixed(1) : '0'}%`}</span></div>
                  </div>
                  <ul className="sm-say">
                    {SUM.say.map((x, i) => <li key={i} dangerouslySetInnerHTML={html(x)} />)}
                  </ul>
                </section>
              )}

              <div className="dt-charts">
                <figure className="ch">
                  <figcaption><span className="ch-t">SR closed</span>
                    <span className="ch-s">against the {iN(S.targets.sr)}-a-month commitment</span></figcaption>
                  <div dangerouslySetInnerHTML={html(colChart(cats,
                    [{ name: 'SR closed', color: 'var(--viz-1)', values: B.map((b) => b.sr) }],
                    { target: perBucketTarget('sr'), targetLabel: 'commitment', aria: `SR closed per ${gran}` }))} />
                </figure>

                <figure className="ch">
                  <figcaption><span className="ch-t">Revenue</span><span className="ch-s">₹ lakh</span>
                    <span className="ch-lg">
                      <span><i style={{ background: 'var(--viz-1)' }} />Spare parts</span>
                      <span><i style={{ background: 'var(--viz-2)' }} />Labour</span>
                    </span></figcaption>
                  <div dangerouslySetInnerHTML={html(colChart(cats, [
                    { name: 'Spare parts', color: 'var(--viz-1)', values: B.map((b) => b.spare / 1e5) },
                    { name: 'Labour', color: 'var(--viz-2)', values: B.map((b) => b.labour / 1e5) },
                  ], { target: (perBucketTarget('spare') + perBucketTarget('labour')) / 1e5,
                    targetLabel: 'combined commitment', fmtY: (v) => v.toFixed(1),
                    fmtV: (v) => `₹${v.toFixed(2)} L`, aria: 'Spare and labour revenue' }))} />
                </figure>

                <figure className="ch">
                  <figcaption><span className="ch-t">Productivity</span>
                    <span className="ch-s">SR closed per day present</span></figcaption>
                  <div dangerouslySetInnerHTML={html(lineChart(cats,
                    [{ name: 'SR / day present', color: 'var(--viz-1)', values: B.map((b) => (b.pres ? b.sr / b.pres : 0)) }],
                    { ref: se.v.prod, refLabel: 'period average', fmtY: (v) => v.toFixed(1),
                      fmtV: (v) => v.toFixed(2), aria: 'Productivity trend' }))} />
                </figure>

                <figure className="ch">
                  <figcaption><span className="ch-t">Quality &amp; discipline</span><span className="ch-s">per cent</span>
                    <span className="ch-lg">
                      <span><i style={{ background: 'var(--viz-1)' }} />SR closure</span>
                      <span><i style={{ background: 'var(--viz-2)' }} />Attendance</span>
                      <span><i style={{ background: 'var(--viz-3)' }} />1st site before 10</span>
                    </span></figcaption>
                  <div dangerouslySetInnerHTML={html(lineChart(cats, [
                    { name: 'SR closure', color: 'var(--viz-1)', values: B.map((b) => b.closure) },
                    { name: 'Attendance', color: 'var(--viz-2)', values: B.map((b) => b.attend) },
                    { name: '1st site before 10', color: 'var(--viz-3)', values: B.map((b) => b.first) },
                  ], { max: 100, ref: 95, refLabel: '95%', fmtV: (v) => `${v.toFixed(1)}%`,
                    aria: 'Quality and discipline trend' }))} />
                </figure>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ===================== the three panels ===================== */}
      {se && panel === 'matrix' && (
        <div className="mask open" onClick={(e) => { if (e.target === e.currentTarget) setPanel(null); }}>
          <div className={`sheet${printing === 'sheet' ? ' sep-print-area' : ''}`}>
            <SignedMatrix se={se} R={R} onPrint={() => printIt('sheet')} onClose={() => setPanel(null)} />
          </div>
        </div>
      )}
    </div>
  );
};

/* ---- the signed Annexure I ------------------------------------------------ */
const SignedMatrix = ({ se, R, onPrint, onClose }) => {
  const A = (k) => achieve(k, se.v[k.key]);
  const kindOf = (k) => (R.actions.find((a) => a.k.key === k.key) || { type: 'Close out', tone: 'good' });
  const b = R.branch;
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
          <div className="f"><div className="l">Employee Code</div><div className="v">{orDash(se.code)}</div></div>
          <div className="f"><div className="l">Branch / Outlet</div><div className="v">{se.branch}</div></div>
          <div className="f"><div className="l">SE UID · Region</div><div className="v">{orDash(se.uid)} · {se.region}</div></div>
          <div className="f"><div className="l">With KCGL</div><div className="v">{R.tenure ? R.tenure.label : '—'}
            <span className="vs">{R.tenure ? `since ${fmtTrainDate(R.tenure.from)}` : ''}</span></div></div>
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
            <div><b>{se.present} P · {R.absent} A</b> of {se.workDays} working days</div>
          </div>
        </div>
      </div>

      <div className="sh-body">
        <div className="sh-h">Minimum Monthly Performance Commitments <span>actuals for the selected period</span></div>
        <table className="sh-t">
          <colgroup><col className="w-n" /><col className="w-k" /><col className="w-c" /><col className="w-a" /><col className="w-p" /><col className="w-s" /></colgroup>
          <thead><tr><th>Sr.</th><th style={{ textAlign: 'left' }}>KPI</th><th>Target</th><th>Actual</th><th>Ach. %</th><th>Status</th></tr></thead>
          <tbody>
            {COMMITMENTS.slice().sort((x, y) => x.no - y.no).map((k) => {
              const v = se.v[k.key]; const p = A(k); const st = statusOf(p);
              return (
                <tr key={k.key}>
                  <td className="n">{k.no}</td>
                  <td className="k"><div>{plain(k.name)}</div>{k.hint && <div className="sub2">{plain(k.hint)}</div>}</td>
                  <td className="c"><b>{targetText(k)}</b>
                    <div className="sub2">{k.commit}{k.perMonth && S.months > 1.02 ? ` · ×${S.months.toFixed(S.months % 1 ? 1 : 0)} months` : ''}</div></td>
                  <td className="a">{fmtVal(k, v).replace(/%|₹/g, '')}
                    {k.key === 'first' && <div className="sub2">avg {se.firstAvg}</div>}
                    {k.key === 'attend' && <div className="sub2">{se.present} P · {R.absent} A of {se.workDays}</div>}
                  </td>
                  <td className="p">{p == null ? '–' : Math.round(p)}</td>
                  <td className={`s sh-${st}`}>{st === 'ok' ? 'MET' : st === 'near' ? 'NEAR' : 'MISSED'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="sh-h">What the shortfall is worth — and what to say
          <span>priced at his own rates · read it out as it stands</span></div>

        <div className="sh-lede">
          <div className="ld-n">{R.total ? `₹${iN(R.total)}` : (R.stake.length || '✓')}</div>
          <div className="ld-t">
            {R.total
              ? `at stake this period${R.rev ? ` — ${Math.round((R.total / R.rev) * 100)}% of the ₹${iN(R.rev)} he did bill` : ''}.`
              : R.stake.length
                ? `commitment${R.stake.length === 1 ? '' : 's'} short. None of them bills a rupee directly — they are the habits that decide whether next month does.`
                : 'Every commitment kept.'}
            {' '}He earns <b>₹{iN(R.perSR)}</b> a job and <b>₹{iN(R.perDay)}</b> a day present.
            {R.focus && <> <b>Start with {plain(R.focus.k.short)}</b>{R.focus.worth ? ` — worth ₹${iN(R.focus.worth)} on its own` : ''}.</>}
          </div>
        </div>

        <div className="gaps">
          {R.stake.length ? R.stake.map((x) => {
            const kind = kindOf(x.k);
            return (
              <div className="gap" key={x.k.key}>
                <div className="gh">
                  <span className="gn">{x.k.no}</span>
                  <span className="gt" title={`${plain(x.k.name)} — ${plain(x.k.commit)}`}>{plain(x.k.name)}</span>
                  <span className={`tag t-${kind.tone}`}>{kind.type}</span>
                  <span className="gs">{x.short}</span>
                  <span className="gw">{x.worth ? `₹${iN(x.worth)}` : '—'}</span>
                </div>
                <div className="gb">{x.say}</div>
                <div className="ga"><b>Ask:</b> {x.ask}</div>
              </div>
            );
          }) : <div className="sh-none">Every commitment kept — nothing to raise.</div>}
        </div>

        {R.asks.length > 0 && <div className="sh-ask"><b>The 30-day ask.</b> {R.asks.join(' ')}</div>}
        {b.n > 1 && (
          <div className="sh-note">
            <b>Against his own branch.</b> {firstName(se.name)} ranks <b>{b.rank} of {b.n}</b> in {se.branch}.
            He closes <b>{iN(se.v.sr)}</b> SRs where the other {b.n - 1} average <b>{iN(b.sr)}</b>;
            attaches <b>₹{iN(se.v.sr ? se.v.spare / se.v.sr : 0)}</b> of parts a job against <b>₹{iN(b.spareSr)}</b>;
            productivity <b>{se.v.prod.toFixed(2)}</b> against <b>{b.prod.toFixed(2)}</b> SR a day present.
          </div>
        )}
        {R.catalogue && <div className="sh-note">{R.catalogue}</div>}
      </div>
    </>
  );
};

/* ---- Employee assets — the branch's own record ---------------------------- */
const AssetsForm = ({ se, redraw }) => {
  const issued = se.support.filter(Boolean).length;
  const missing = SUPPORT.filter((_, i) => !se.support[i]).map((c) => c[0]);
  return (
    <>
      <div className="inl-h">Issued to the engineer <span>{issued} of {SUPPORT.length} issued</span></div>
      <div className="inl-set">An engineer who has not been kitted out is not a performance case —
        this list is what the commitments assume.</div>
      <div className="chk big two">
        {SUPPORT.map((c, i) => (
          <label key={i} title={c[1]}>
            <input type="checkbox" checked={se.support[i]}
              onChange={(e) => { se.support[i] = e.target.checked; redraw(); }} />
            <span>{c[1]}</span>
          </label>
        ))}
      </div>
      <div className="inl-note">
        {issued === SUPPORT.length
          ? 'Fully issued — every commitment on the matrix is fair to hold him to.'
          : <><b>{SUPPORT.length - issued} not issued.</b> {missing.join(', ')}. Close these before the performance conversation.</>}
      </div>

      <div className="inl-h">Mandatory compliance <span>{se.comply.filter(Boolean).length} of {COMPLY.length} in order</span></div>
      <div className="inl-set">Tick each item the engineer has kept. Nothing counts these either —
        no file knows whether a man wore his PPE.</div>
      <div className="chk big two">
        {COMPLY.map((c, i) => (
          <label key={i} title={c}>
            <input type="checkbox" checked={se.comply[i]}
              onChange={(e) => { se.comply[i] = e.target.checked; redraw(); }} />
            <span>{c}</span>
          </label>
        ))}
      </div>
    </>
  );
};

/* ---- Training & Skill -----------------------------------------------------
   What he has been trained on, and how much of it — nothing more. The
   nomination list that used to sit here was a second thing on a panel that was
   asked one question. */
const TrainingForm = ({ se, R }) => (
  <>
    <div className="inl-h">Skills on record
      <span>{R.tr.length} training{R.tr.length === 1 ? '' : 's'} done · from the Training Report</span></div>
    {R.tr.length ? (
      <div className="skills">
        {R.tr.map((t, i) => (
          <span className="skill" key={i} title={t[1] ? `${t[0]} — ${t[1]}` : t[0]}>
            <b>{t[0]}</b>{t[2] ? <em>{fmtTrainDate(t[2])}</em> : null}
          </span>
        ))}
      </div>
    ) : (
      <div className="inl-none">
        No training on record for {se.name} in the Training Report.
      </div>
    )}
  </>
);

export default SEPerformanceReport;
