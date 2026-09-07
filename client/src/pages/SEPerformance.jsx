import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  ClipboardDocumentCheckIcon, CalendarDaysIcon, ChevronDownIcon,
  ChevronLeftIcon, ChevronRightIcon,
} from '@heroicons/react/24/outline';
import SEPerformanceReport from '../components/SEPerformanceReport';

// ============================================================================
// PMS → SE Performance
//
// The Annexure I "Service Engineer Performance Commitment & Accountability
// Matrix", per engineer: the commitments he signed, what he actually
// did against them over the selected period, what the shortfall is worth, and
// the printable signed form.
//
// This page owns the REPORTING MONTH; the branch board, the engineer report
// and the panels live in components/SEPerformanceReport.
//
// THE PERIOD IS A WHOLE MONTH AND NOTHING ELSE. Every commitment on the signed
// form is written "/ Month" — 60 SRs a month, ₹1,50,000 a month — so a period
// that is not a month is a period the form cannot be read against. The picker
// therefore offers a year and a month and never a date range; it stops at the
// month now running, because a monthly target cannot be judged against a month
// that has not finished happening; and it opens on LAST month, which is the
// one a manager is actually reviewing.
//
// Backend: GET /pms/report/se-performance — real branches with their region,
// the TRAINING REPORT's ACTIVE engineers with their UID NO and every training
// on record, HR's EMPLOYEE CODE joined on (the employee id the SE UID Master
// shows — NOT the training file's KOEL ticket number), and SR CLOSED day by
// day out of the 'Response Time & MaxTTR Details' import, counted the way
// Employee Productivity counts it. The other commitment figures are still
// generated in the browser; see sePerformanceModel.js.
// ============================================================================

const API = import.meta.env.VITE_BACKEND_URL;

// -- Theme (same as the other PMS pages) --------------------------------
const themeColor = '#2f3192';
const themeDark = '#23255f';

const authHeaders = () => {
  const u = JSON.parse(sessionStorage.getItem('user') || '{}');
  return { 'user-id': String(u.user_id || ''), 'user-role': u.role || '' };
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MON3 = MONTHS.map((m) => m.slice(0, 3));

// ---- month helpers (ISO strings, local time) ----
const pad = (n) => String(n).padStart(2, '0');
const firstOf = (y, m) => `${y}-${pad(m + 1)}-01`;
const lastOf = (y, m) => `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}`;
/** The month before a given one, as {y, m}. */
const prevMonth = (y, m) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 });

const SEPerformance = () => {
  const [roster, setRoster] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ---- the reporting month -------------------------------------------------
  // LAST month by default: the current one is still being worked, and half a
  // month measured against a whole month's commitment reads as a shortfall
  // that is not one.
  const now = new Date();
  const thisY = now.getFullYear();
  const thisM = now.getMonth();
  const [sel, setSel] = useState(() => prevMonth(thisY, thisM));
  const [open, setOpen] = useState(false);
  const [browseY, setBrowseY] = useState(sel.y);   // the year the panel is showing
  const boxRef = useRef(null);

  const fromDate = firstOf(sel.y, sel.m);
  const toDate = lastOf(sel.y, sel.m);

  const load = useCallback(async (quiet = false) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/pms/report/se-performance`, { headers: authHeaders() });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.message || d.detail || 'Failed to load');
      setRoster(d);
      if (!quiet) toast.success('SE Performance loaded');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(true); }, [load]);

  // ---- which years the picker offers --------------------------------------
  // Bounded by the DATA, not by the calendar: the first month the MaxTTR file
  // has an SR closed in, up to the year now running. Offering 2019 against a
  // file that starts in 2024 is offering five years of empty reports.
  const minYear = useMemo(() => {
    const f = roster?.meta?.sr?.from;
    const y = f ? Number(f.slice(0, 4)) : NaN;
    return Number.isFinite(y) ? Math.min(y, sel.y) : Math.min(thisY - 2, sel.y);
  }, [roster, sel.y, thisY]);

  // a month that has not finished happening cannot be judged against a monthly
  // commitment — the one now running is offered, everything after it is not
  const isFuture = (y, m) => (y > thisY || (y === thisY && m > thisM));
  const canPrevYear = browseY > minYear;
  const canNextYear = browseY < thisY;

  // the panel always opens on the year that is selected, wherever it was left
  useEffect(() => { if (open) setBrowseY(sel.y); }, [open, sel.y]);

  // click away closes, exactly as the granularity picker in the report does
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const pick = (y, m) => {
    if (isFuture(y, m)) return;
    setSel({ y, m });
    setOpen(false);
  };

  const engineers = roster?.engineers?.length || 0;
  // the branches that actually CARRY an engineer — the payload lists every
  // branch the masters know, and the explorer drops the empty ones, so
  // counting the payload's list here would promise rows that are not drawn
  const branches = new Set((roster?.engineers || [])
    .map((e) => e.branch_id).filter(Boolean)).size;

  return (
    <div className="min-h-screen font-sans">
      <div className="max-w-[1500px] mx-auto px-3 sm:px-5 pb-2 max-md:px-2">

        {/* ===== Hero header — the month picker lives on its RIGHT ===== */}
        <div className="rounded-2xl px-3 sm:px-5 py-3 mb-3 text-white relative sep-hide-print"
          style={{ background: `linear-gradient(120deg, ${themeColor} 0%, ${themeDark} 100%)` }}>
          <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
            <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
            <div className="absolute right-16 -bottom-12 h-24 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
          </div>
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-white/15 backdrop-blur-sm">
                <ClipboardDocumentCheckIcon className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold leading-tight">SE Performance</h1>
                <p className="text-[11px] text-white/70 leading-tight">
                  {loading ? 'Loading…'
                    : error ? 'Could not load the roster'
                      : <>Annexure&nbsp;I commitment &amp; accountability matrix · {engineers} active engineers across {branches} branches</>}
                </p>
              </div>
            </div>

            {/* ---- the month picker: a year, and the twelve months of it ----
                Opens on hover like the other PMS pickers, and a click on a
                month applies it and closes — there is no Apply button because
                there is nothing to compose: one click IS the whole choice. */}
            <div ref={boxRef} className="relative w-[240px] max-w-full"
              onMouseEnter={() => setOpen(true)}
              onMouseLeave={() => setOpen(false)}>
              <button onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white shadow-md hover:bg-white/90 transition-all"
                style={{ color: themeColor }}>
                <CalendarDaysIcon className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{MONTHS[sel.m]} {sel.y}</span>
                <ChevronDownIcon className={`h-3 w-3 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>

              {open && (
                /* pt-2 (not a margin) keeps the hover unbroken across the gap */
                <div className="absolute z-50 left-0 right-0 sm:left-auto sm:right-0 top-full pt-2">
                  <div className="w-[268px] max-w-[92vw] bg-white rounded-xl shadow-xl border border-gray-200 text-gray-800">
                    {/* the year, with its own two arrows */}
                    <div className="flex items-center justify-between px-2.5 py-2 border-b border-gray-100">
                      <button type="button" disabled={!canPrevYear}
                        onClick={() => canPrevYear && setBrowseY(browseY - 1)}
                        className="p-1 rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                        title={canPrevYear ? `Go to ${browseY - 1}` : 'No data before this year'}>
                        <ChevronLeftIcon className="h-4 w-4" />
                      </button>
                      <span className="text-sm font-bold tabular-nums" style={{ color: themeColor }}>{browseY}</span>
                      <button type="button" disabled={!canNextYear}
                        onClick={() => canNextYear && setBrowseY(browseY + 1)}
                        className="p-1 rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                        title={canNextYear ? `Go to ${browseY + 1}` : 'That year has not happened yet'}>
                        <ChevronRightIcon className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 p-2.5">
                      {MON3.map((mm, i) => {
                        const on = sel.y === browseY && sel.m === i;
                        const future = isFuture(browseY, i);
                        const running = browseY === thisY && i === thisM;
                        return (
                          <button key={mm} type="button" disabled={future}
                            onClick={() => pick(browseY, i)}
                            title={future ? 'This month has not happened yet'
                              : running ? 'The month now running — still incomplete'
                                : `${MONTHS[i]} ${browseY}`}
                            className={`relative px-2 py-2 rounded-lg text-xs font-semibold transition-all ${on ? 'text-white shadow-sm'
                              : future ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'}`}
                            style={on ? { backgroundColor: themeColor } : {}}>
                            {mm}
                            {/* the month in progress is MARKED, not withheld:
                                it is selectable, it is simply not a full month */}
                            {running && (
                              <i className={`absolute top-1 right-1 h-1.5 w-1.5 rounded-full ${on ? 'bg-white/80' : 'bg-amber-400'}`} />
                            )}
                          </button>
                        );
                      })}
                    </div>

                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ============ The report ============ */}
        {loading && !roster ? (
          <div className="flex justify-center py-12">
            <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-gray-200"
              style={{ borderTopColor: themeColor }} />
          </div>
        ) : error ? (
          <div className="px-3 py-6 text-center text-sm text-red-600">{error}</div>
        ) : !roster?.engineers?.length ? (
          <div className="bg-white rounded-2xl border border-gray-200 px-4 py-10 text-center">
            <p className="text-sm font-semibold text-gray-800">No active engineers on the roster yet</p>
            <p className="text-xs text-gray-500 mt-1">
              This report reads the <b>Training Report</b> (PMS → Training Report) and shows its
              <b> Active</b> engineers only. Upload the Training Report there; if it is already
              uploaded, everybody in it is either marked <b>Inactive</b> or has no employment
              status set.
            </p>
          </div>
        ) : (
          <SEPerformanceReport roster={roster} periodFrom={fromDate} periodTo={toDate} />
        )}

      </div>
    </div>
  );
};

export default SEPerformance;
