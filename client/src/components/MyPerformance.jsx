import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Bar, Pie, Line } from 'react-chartjs-2';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { warmKey, readWarmCache, writeWarmCache } from '../utils/warmCache';
import { reflowLetterReferencesHtml } from '../utils/letterReferences';
import { dateOnly, finishDateColumns } from '../utils/excelDateColumns';

const themeColor = '#2f3192';
const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;
const DEFAULT_PERFORMANCE = {
    total_followups: 0,
    wip_count: 0,
    completed_count: 0,
    rejected_count: 0,
    rescheduled_count: 0,
    followup_type_breakdown: {},
    recent_activities: [],
    top_campaigns: []
};

// Helper function - format a stored timestamp as IST time.
// Timestamps are stored as NAIVE IST (app-wide standard) — show the wall-clock
// as-is. Strings with an explicit timezone (Z / +hh:mm) are converted to IST.
const convertUTCToIST = (dateTimeString) => {
    if (!dateTimeString) return '-';
    const s = String(dateTimeString);
    const date = new Date(s);
    if (isNaN(date.getTime())) return '-';
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
        return date.toLocaleTimeString('en-IN', {
            hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
        }).toUpperCase();
    }
    // Naive string = stored IST wall-clock; new Date() parsed it as local time
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const period = hours >= 12 ? 'PM' : 'AM';
    let displayHours = hours % 12;
    displayHours = displayHours === 0 ? 12 : displayHours;
    const formattedMinutes = minutes.toString().padStart(2, '0');
    return `${displayHours}:${formattedMinutes} ${period}`;
};

// Short status labels used across ALL report status columns:
// wip→WIP, rescheduled→Followups, completed→Completed, not_connected→NC, rejected→Rejected
const statusLabel = (s) => {
    const map = {
        wip: 'WIP',
        rescheduled: 'Followups',
        completed: 'Completed',
        not_connected: 'NC',
        rejected: 'Rejected',
        pending: 'Pending',
    };
    return map[(s || '').trim().toLowerCase()] || (s || '-');
};

// CSP tables — extra columns showing the instance's latest CSP-drive followup
const CSP_FU_HEADERS = ['Last Follow-up Date', 'Drive', 'SR Subtype', 'Follow-up Mode', 'Flag', 'Status', 'Next Follow-up', 'Activity', 'Reject Reason', 'Remark', 'Quote Sent', 'Quote No.', 'Quote Value', 'Last Letter Sent Date'];

// CSP modals — date columns selectable for the top date-range filter
const CSP_DATE_FIELDS = [
    { key: 'due', label: 'Due Date' },
    { key: 'sr_open', label: 'SR Open Date' },
    { key: 'fu_date', label: 'Last Follow-up Date' },
    { key: 'fu_next', label: 'Next Follow-up' },
];

// Short date for the CSP followup columns (naive IST ISO → "09 Jul 2026")
const fmtFuDate = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Helper function - Convert decimal hours (e.g. 3.75) to "Xh Ym" (e.g. "3h 45m")
const formatWorkingHours = (decimalHours) => {
    const num = parseFloat(decimalHours);
    if (!num || isNaN(num) || num <= 0) return '-';
    const totalMinutes = Math.round(num * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
};

// Robust date parser for SR Open / warranty values. Handles:
//   YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, and DD-MMM-YYYY (e.g. 05-Jan-2025)
const parseAnyDate = (val) => {
    if (!val) return null;
    const s = String(val).trim();

    let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

    m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);

    m = s.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,})[-/\s](\d{4})$/);
    if (m) {
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const mon = months.indexOf(m[2].slice(0, 3).toLowerCase());
        if (mon >= 0) return new Date(+m[3], mon, +m[1]);
    }

    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
};

// Highlight a search term inside a cell value with a yellow background.
// No term or no match → returns the plain text unchanged.
const highlightMatch = (value, term) => {
    const text = value == null ? '' : String(value);
    const q = (term || '').trim();
    if (!q) return text;
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.split(new RegExp(`(${escaped})`, 'gi')).map((part, i) =>
        part.toLowerCase() === q.toLowerCase()
            ? <mark key={i} style={{ backgroundColor: '#fde047', color: 'inherit', padding: '0 1px', borderRadius: '2px' }}>{part}</mark>
            : part
    );
};

// LetterSendRecord.created_at is stored as NAIVE IST — render the wall-clock
// as-is; only strings with an explicit timezone are converted to IST.
const fmtIstDateTime = (iso) => {
    if (!iso) return '-';
    const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso);
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
        ...(hasTz ? { timeZone: 'Asia/Kolkata' } : {})
    });
};

// IST calendar-date key (YYYY-MM-DD) for the date-range filter — matches the IST in "Sent At".
const istDateKey = (iso) => {
    if (!iso) return null;
    if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso)) return String(iso).slice(0, 10); // naive IST — date part as stored
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
};

// ── Letter PDF rendering (matches the Send Letter letterhead format) ──────────
// Stored letter HTML already contains the header/footer bands inline. For a clean
// multi-page PDF we STRIP those inline bands and re-stamp the header on top + footer
// on bottom of EVERY page, cutting pages on safe rows so a table row is never split.
const LETTER_HEADER_IMG = '/letter-header-band.png';
const LETTER_FOOTER_IMG = '/letter-footer-band.png';

const loadLetterScriptOnce = (src) => new Promise((resolve, reject) => {
    if (Array.from(document.scripts).some(s => s.src === src)) return resolve();
    const el = document.createElement('script');
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(el);
});

const loadLetterImg = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
});

const loadLetterImageAsDataUrl = async (path) => {
    try {
        const res = await fetch(path);
        if (!res.ok) return '';
        const blob = await res.blob();
        return await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onloadend = () => resolve(r.result);
            r.onerror = reject;
            r.readAsDataURL(blob);
        });
    } catch (e) { return ''; }
};

const letterBase64ToBytes = (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
};

// Page-cut Y positions that don't slice through a table row.
const letterComputeSafeCuts = (canvas, sliceHpx) => {
    const W = canvas.width, H = canvas.height;
    if (sliceHpx >= H) return [0, H];
    let data;
    try { data = canvas.getContext('2d').getImageData(0, 0, W, H).data; }
    catch (e) {
        const out = [0]; let t = 0;
        while (t + sliceHpx < H) { t += sliceHpx; out.push(t); }
        out.push(H); return out;
    }
    const BUSY = Math.floor(W * 0.04);
    const BLANK_LIMIT = Math.max(2, Math.floor(W * 0.02));
    const darkInRow = (y) => {
        const base = y * W * 4; let dark = 0;
        for (let x = 0; x < W; x++) {
            const i = base + x * 4;
            if (data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235) {
                if (++dark > BUSY) return dark;
            }
        }
        return dark;
    };
    const cuts = [0];
    let top = 0;
    // STRICTLY blank row = nothing on it at all (couple of anti-alias px allowed).
    // Rows inside a table always contain its vertical border pixels, so pass 1 can
    // never split a table: when a boundary lands mid-table the search walks up past
    // the whole table and cuts in the gap above it — the ENTIRE table moves to the
    // next page. Pass 2 (old near-blank behavior) only runs when no blank gap exists
    // at all, e.g. a table taller than one page that must be cut somewhere.
    const STRICT_BLANK = 2;
    while (top + sliceHpx < H) {
        const proposed = top + sliceHpx;
        let cut = -1;
        const deepMin = top + Math.floor(sliceHpx * 0.25);
        for (let y = proposed; y >= deepMin; y--) {
            if (darkInRow(y) <= STRICT_BLANK) { cut = y; break; }
        }
        if (cut === -1) {
            const minY = top + Math.floor(sliceHpx * 0.65);
            for (let y = proposed; y >= minY; y--) {
                if (darkInRow(y) <= BLANK_LIMIT) { cut = y; break; }
            }
        }
        if (cut === -1 || cut <= top) cut = proposed;
        cuts.push(cut);
        top = cut;
    }
    cuts.push(H);
    return cuts;
};

// True when a slice is essentially all-white (drop blank pages).
const letterSliceBlank = (cnv) => {
    try {
        const d = cnv.getContext('2d').getImageData(0, 0, cnv.width, cnv.height).data;
        const need = Math.max(20, Math.floor(cnv.width * cnv.height * 0.0002));
        let dark = 0;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) {
                if (++dark > need) return false;
            }
        }
        return true;
    } catch (e) { return false; }
};

// Render letter BODY html to a banded multi-page A4 PDF; returns base64 (no prefix).
const generateBandedLetterPdf = async (bodyHtml) => {
    if (!window.html2canvas) await loadLetterScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    if (!window.jspdf) await loadLetterScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');

    // Both loaders are self-contained (own try/catch, return '' on failure) and
    // independent of each other, so fetch them in parallel.
    const [headerUrl, footerUrl] = await Promise.all([
        loadLetterImageAsDataUrl(LETTER_HEADER_IMG),
        loadLetterImageAsDataUrl(LETTER_FOOTER_IMG)
    ]);

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    let headerH = 0, footerH = 0;
    if (headerUrl) { try { const h = await loadLetterImg(headerUrl); if (h.width) headerH = pageW * (h.height / h.width); } catch (e) { headerH = 0; } }
    if (footerUrl) { try { const f = await loadLetterImg(footerUrl); if (f.width) footerH = pageW * (f.height / f.width); } catch (e) { footerH = 0; } }
    const SAFE_MM = 4;
    const contentTop = headerH;
    const contentH = Math.max(20, pageH - headerH - footerH - SAFE_MM);

    const holder = document.createElement('div');
    holder.style.position = 'fixed';
    holder.style.left = '-10000px';
    holder.style.top = '0';
    holder.style.width = '780px';
    holder.style.background = '#ffffff';
    holder.className = 'keep-light'; // letter = paper — stays white in dark mode
    // Center table cell content in the PDF. html2canvas (which rasterizes this letter)
    // does NOT reliably honor `vertical-align: middle`, so cells with a fixed HEIGHT from
    // the letter template render with their text stuck to the top. Fix: drop the fixed
    // row/cell height and apply top/bottom padding — the row collapses to
    // "content + padding", so the text sits centered. Zero inner-element margins so a
    // stray <p>/<div> can't add lopsided space. !important beats the template's inline CSS.
    // Use EQUAL top/bottom padding and a compact, content-height row so the single line of
    // text sits in the optical center of the cell. A TIGHT line-height (≈1.15) is essential:
    // html2canvas renders each glyph at the TOP of its line box, so any extra line-height
    // "leading" pools BELOW the text and makes it look top-stuck no matter how even the
    // padding is. Collapsing the line box to ≈ the glyph height lets the padding center it.
    holder.innerHTML =
        '<style>' +
        'table { border-collapse: collapse !important; }' +
        'tr { height: auto !important; }' +
        'td, th {' +
        '  vertical-align: middle !important;' +
        '  height: auto !important;' +
        '  min-height: 0 !important;' +
        '  padding-top: 3px !important;' +
        '  padding-bottom: 10px !important;' +
        '  line-height: 1.15 !important;' +
        '  border-color: #9ca3af !important;' +
        '  box-sizing: border-box !important;' +
        '}' +
        'td > *, th > * { margin-top: 0 !important; margin-bottom: 0 !important; }' +
        'td p, th p { margin: 0 !important; }' +
        '</style>' +
        bodyHtml;
    document.body.appendChild(holder);

    // Strip presentational attributes that force top-alignment / fixed heights.
    // Letter table templates often use <th valign="top"> and <tr height="40">.
    // html2canvas reads these attributes DIRECTLY and they override our CSS — which
    // is why the header cells kept rendering top-aligned no matter what vertical-align
    // or height CSS we applied. Removing them lets the CSS centering take over.
    holder.querySelectorAll('[valign]').forEach(el => el.removeAttribute('valign'));
    holder.querySelectorAll('[height]').forEach(el => el.removeAttribute('height'));

    holder.querySelectorAll('*').forEach(el => {
        const tag = el.tagName;
        if (tag === 'IMG' || tag === 'BR' || tag === 'HR') return;
        const disp = window.getComputedStyle(el).display;

        // 1) kill fixed heights on anything that lays out as a block/cell/row
        if (disp !== 'inline') {
            el.style.setProperty('height', 'auto', 'important');
            el.style.setProperty('min-height', '0', 'important');
        }

        // 2) center the cells (real <td>/<th> OR div cells using display:table-cell)
        if (tag === 'TD' || tag === 'TH' || disp === 'table-cell') {
            el.style.setProperty('vertical-align', 'middle', 'important');
            el.style.setProperty('padding-top', '3px', 'important');
            el.style.setProperty('padding-bottom', '10px', 'important');
            el.style.setProperty('line-height', '1.15', 'important');
        }
    });

    // ── Keep cell text off the bottom border ───────────────────────────────────────
    // html2canvas paints each line of text at the BOTTOM of its line box (it drops the
    // half-leading a browser adds above the glyph). So a cell — or any wrapper inside it
    // — that uses the `line-height: <rowHeight>px` trick to center a single line renders
    // that line glued to the bottom edge. Forcing a NORMAL line-height on the cells AND
    // every element inside them collapses each line to its natural height, so the equal
    // top/bottom padding above actually centers it.
    holder.querySelectorAll('td, th, td *, th *, [style*="table-cell"], [style*="table-cell"] *').forEach(el => {
        const t = el.tagName;
        if (t === 'IMG' || t === 'BR' || t === 'HR') return;
        el.style.setProperty('line-height', '1.15', 'important');
    });

    // Zero top/bottom margins AND padding on wrappers directly inside cells, so only the
    // cell's own symmetric padding controls the vertical position of the text.
    holder.querySelectorAll('td > *, th > *, [style*="table-cell"] > *').forEach(el => {
        el.style.setProperty('margin-top', '0', 'important');
        el.style.setProperty('margin-bottom', '0', 'important');
        el.style.setProperty('padding-top', '0', 'important');
        el.style.setProperty('padding-bottom', '0', 'important');
    });

    const imgs = Array.from(holder.querySelectorAll('img'));
    await Promise.all(imgs.map(im => im.complete ? Promise.resolve()
        : new Promise(res => { im.onload = res; im.onerror = res; })));

    try {
        const canvas = await window.html2canvas(holder, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
        const W = canvas.width;
        const pxPerMm = W / pageW;
        const sliceHpx = Math.max(1, Math.floor(contentH * pxPerMm));
        const cuts = letterComputeSafeCuts(canvas, sliceHpx);

        let firstPage = true;
        for (let p = 0; p < cuts.length - 1; p++) {
            const sourceY = cuts[p];
            const thisSliceHpx = cuts[p + 1] - sourceY;
            if (thisSliceHpx <= 0) continue;

            const c = document.createElement('canvas');
            c.width = W;
            c.height = thisSliceHpx;
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.drawImage(canvas, 0, sourceY, W, thisSliceHpx, 0, 0, W, thisSliceHpx);
            if (letterSliceBlank(c)) continue;

            if (!firstPage) pdf.addPage();
            firstPage = false;

            const sliceData = c.toDataURL('image/jpeg', 0.92);
            const sliceHmm = thisSliceHpx / pxPerMm;
            pdf.addImage(sliceData, 'JPEG', 0, contentTop, pageW, sliceHmm);
            if (headerUrl && headerH > 0) pdf.addImage(headerUrl, 'PNG', 0, 0, pageW, headerH);
            if (footerUrl && footerH > 0) pdf.addImage(footerUrl, 'PNG', 0, pageH - footerH, pageW, footerH);
        }
        if (firstPage) {
            if (headerUrl && headerH > 0) pdf.addImage(headerUrl, 'PNG', 0, 0, pageW, headerH);
            if (footerUrl && footerH > 0) pdf.addImage(footerUrl, 'PNG', 0, pageH - footerH, pageW, footerH);
        }
        return pdf.output('datauristring').split(',')[1];
    } finally {
        document.body.removeChild(holder);
    }
};

const MyPerformance = ({ userData, timePeriod, customStartDate, customEndDate, isBranchAdmin, isMasterAdmin, isITAdmin }) => {
    const navigate = useNavigate();

    // Yellow highlight for time-dependent counts. 'all' (Calendar) = no highlight.
    const isTimeFiltered = timePeriod !== 'all';
    const TimeValue = ({ children }) => (
        isTimeFiltered
            ? <span style={{ backgroundColor: '#fde047', borderRadius: '4px', padding: '0 4px' }}>{children}</span>
            : <>{children}</>
    );

    const handleOpenCustomerFromFollowup = (followup) => {
        if (!followup) return;
        setShowAllFollowupsModal(false);
        // Drive follow-ups open the Drive Data page — it falls back to the
        // Non-Drive page by itself when the customer is not in drive data.
        // "other" rows have no campaign and go straight to the Non-Drive page.
        const isDrive = !!followup.campaign_id;
        navigate(isDrive ? '/customer-engagement' : '/customer-engagement-2', {
            state: {
                openCustomerInstanceId: followup.customer_instance_id,
                openCustomerId: isDrive ? (followup.customer_id || null) : null
            }
        });
    };

    // Open one non-drive customer on the Non-Drive Data page
    const handleOpenCustomerFromNonDrive = (row) => {
        if (!row || !row.instance_id) return;
        setShowNonCampaignModal(false);
        navigate('/customer-engagement-2', {
            state: { openCustomerInstanceId: row.instance_id }
        });
    };

    const handleOpenCustomerFromCsp = (row) => {
        if (!row || !row.instance_id) return;
        setShowCspModal(false);
        setShowOpenCspModal(false);
        navigate('/customer-engagement', {
            state: {
                openCustomerInstanceId: row.instance_id,
                openCustomerId: null
            }
        });
    };

    const [performance, setPerformance] = useState(DEFAULT_PERFORMANCE);
    const [dailyPerformance, setDailyPerformance] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [tableTimeFilter, setTableTimeFilter] = useState('all');
    const fetchingRef = useRef(false);
    // True once a real fetch has populated `performance` — warm-cache paint is
    // only allowed while the state is still empty/initial (first load).
    const hasPerformanceDataRef = useRef(false);
    const topScrollRef = useRef(null);
    const bottomScrollRef = useRef(null);
    const tableRef = useRef(null);
    // State (not a ref) so the top scrollbar spacer re-renders when the
    // table's real scroll width changes (e.g. wide drive-name column).
    const [tableScrollWidth, setTableScrollWidth] = useState('100%');
    const [nonFollowupCount, setNonFollowupCount] = useState(0);
    const [branchAssetCount, setBranchAssetCount] = useState(0);
    const [nonFollowupCustomerStats, setNonFollowupCustomerStats] = useState(null);
    const [createdFromDate, setCreatedFromDate] = useState('');
    const [createdToDate, setCreatedToDate] = useState('');
    const [quotationFilterActive, setQuotationFilterActive] = useState(false);
    const [quotationSentFilterActive, setQuotationSentFilterActive] = useState(false);
    const [canExport, setCanExport] = useState(false);

    const [showAllFollowupsModal, setShowAllFollowupsModal] = useState(false);
    const [allFollowupsData, setAllFollowupsData] = useState([]);
    const [loadingAllFollowups, setLoadingAllFollowups] = useState(false);
    // Progressive rendering for the All-Follow-ups table: only this many rows are
    // put in the DOM at once (grows as the user scrolls). Keeps the table snappy
    // even with 100k+ rows without changing markup, filtering, or export (export
    // still uses the full `displayedFollowups` list).
    const FOLLOWUP_RENDER_STEP = 150;
    const [followupRenderLimit, setFollowupRenderLimit] = useState(FOLLOWUP_RENDER_STEP);
    const [followupView, setFollowupView] = useState('all'); // All-Follow-ups view: 'all' | 'unique' | 'unique_drive'
    const [followupSearchTerm, setFollowupSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [statusLocked, setStatusLocked] = useState(false); // true = a status card opened the modal, so hide the Status dropdown
    // true = modal opened from a Daily Breakdown date — non-drive rows of EVERY
    // status are merged in so the clicked day shows drive + non-drive together
    const [dateViewActive, setDateViewActive] = useState(false);
    const [showCancelledCspModal, setShowCancelledCspModal] = useState(false);

    // ── Letter Report (letters sent BY this employee) ──────────────────────
    const [showLetterModal, setShowLetterModal] = useState(false);
    const [letterData, setLetterData] = useState({ total: 0, letters: [] });
    const [loadingLetters, setLoadingLetters] = useState(false);
    const [letterCount, setLetterCount] = useState(0);            // card value (cheap count, fetched on mount)
    const [letterSentCount, setLetterSentCount] = useState(0);    // sent letters count
    const [letterDraftCount, setLetterDraftCount] = useState(0);  // draft letters count
    const [cspLetterCount, setCspLetterCount] = useState(0);      // CSP letters count (Format Type starts with "CSP")
    const [letterCspOnly, setLetterCspOnly] = useState(false);    // when true, the letter modal shows ONLY CSP letters
    const [letterSearchTerm, setLetterSearchTerm] = useState('');
    const [letterDebouncedSearch, setLetterDebouncedSearch] = useState('');
    const [letterStatusFilter, setLetterStatusFilter] = useState('all'); // all | sent | draft
    const [letterFromDate, setLetterFromDate] = useState('');            // YYYY-MM-DD (IST)
    const [letterToDate, setLetterToDate] = useState('');                // YYYY-MM-DD (IST)
    const [letterVisibleCount, setLetterVisibleCount] = useState(50); // progressive (lazy) render

    // ── Letter PDF viewer (per-letter, generated on demand) ────────────────
    const [showLetterPdfModal, setShowLetterPdfModal] = useState(false);
    const [letterPdfUrl, setLetterPdfUrl] = useState('');
    const [letterPdfName, setLetterPdfName] = useState('letter');
    const [loadingLetterPdf, setLoadingLetterPdf] = useState(false);
    const letterPdfIframeRef = useRef(null);

    // Non-Campaign Customers modal
    const [showNonCampaignModal, setShowNonCampaignModal] = useState(false);
    const [nonCampaignData, setNonCampaignData] = useState({ total_customers: 0, customers: [] });
    const [loadingNonCampaign, setLoadingNonCampaign] = useState(false);
    const [nonCampaignSearchTerm, setNonCampaignSearchTerm] = useState('');
    const [nonCampaignStatusFilter, setNonCampaignStatusFilter] = useState('all');
    const [nonCampaignServiceFilter, setNonCampaignServiceFilter] = useState('all');
    // 'all' = every taken record; 'unique' = latest record per customer (old behavior)
    const [nonCampaignViewMode, setNonCampaignViewMode] = useState('all');
    const [nonCampaignFromDate, setNonCampaignFromDate] = useState('');   // last follow-up date range (YYYY-MM-DD)
    const [nonCampaignToDate, setNonCampaignToDate] = useState('');

    const [showCspModal, setShowCspModal] = useState(false);
    const [cspData, setCspData] = useState({ total_instances: 0, total_rows: 0, rows: [] });
    const [loadingCsp, setLoadingCsp] = useState(false);
    const [warrantyMap, setWarrantyMap] = useState({}); // instance_id -> warranty_expiry (YYYY-MM-DD)
    const [cspSearchTerm, setCspSearchTerm] = useState('');
    const [cspDueFromDate, setCspDueFromDate] = useState('');
    const [cspDueToDate, setCspDueToDate] = useState('');
    const [cspSegmentFilter, setCspSegmentFilter] = useState('all');
    const [cspStatusFilter, setCspStatusFilter] = useState('all'); // latest CSP follow-up status
    const [cspDateField, setCspDateField] = useState('due'); // which date the range filter applies to

    // Open CSP modal
    const [showOpenCspModal, setShowOpenCspModal] = useState(false);
    const [openCspSearchTerm, setOpenCspSearchTerm] = useState('');
    const [openCspDueFromDate, setOpenCspDueFromDate] = useState('');
    const [openCspDueToDate, setOpenCspDueToDate] = useState('');
    const [openCspSegmentFilter, setOpenCspSegmentFilter] = useState('all');
    const [openCspStatusFilter, setOpenCspStatusFilter] = useState('all');
    const [openCspDateField, setOpenCspDateField] = useState('due');
    const [cspQuotationFilterActive, setCspQuotationFilterActive] = useState(false);
    const [cspDaysSort, setCspDaysSort] = useState('desc'); // 'desc' = overdue first, 'asc' = due last first
    const [openCspDaysSort, setOpenCspDaysSort] = useState('desc');
    const [cspQuotationSentFilterActive, setCspQuotationSentFilterActive] = useState(false);

    // Add SR in CSP modal
    const [showAddSrModal, setShowAddSrModal] = useState(false);
    const [openCspCampaigns, setOpenCspCampaigns] = useState([]);
    const [selectedCspCampaignId, setSelectedCspCampaignId] = useState('');
    const [addSrLoading, setAddSrLoading] = useState(false);
    const [userCspSrCount, setUserCspSrCount] = useState(0);
    const [srForm, setSrForm] = useState({
        asset_number: '',
        branch_id: '',   // ← was userData?.branch || ''
        goem_oem: '',
        sr_number: '',
        sr_open_date: '',
        sr_close_date: '',
        sr_type: 'CSP',
        sr_subtype: '',
        sr_status: 'Open',
        segment: '',
        application_code: ''
    });
    // Debounce search input by 250ms
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(followupSearchTerm), 250);
        return () => clearTimeout(t);
    }, [followupSearchTerm]);

    // Debounce the Letter Report search (250ms)
    useEffect(() => {
        const t = setTimeout(() => setLetterDebouncedSearch(letterSearchTerm), 250);
        return () => clearTimeout(t);
    }, [letterSearchTerm]);

    // Reset the progressive render whenever any letter filter changes
    useEffect(() => {
        setLetterVisibleCount(50);
    }, [letterDebouncedSearch, letterStatusFilter, letterFromDate, letterToDate]);

    // Reset the view dropdown whenever the All-Follow-ups modal closes
    useEffect(() => {
        if (!showAllFollowupsModal) {
            setFollowupView('all');
            setStatusFilter('all');
            setStatusLocked(false);
            setDateViewActive(false);
        }
    }, [showAllFollowupsModal]);

    // Format date for API — use LOCAL (IST) date parts so the chosen day isn't
    // shifted to the previous day by UTC conversion (toISOString shifts IST dates back).
    const formatDateForAPI = useCallback((date) => {
        if (!date) return null;
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }, []);

    // Get date range text for display (for the stats section)
    const getDateRangeText = useCallback(() => {
        if (timePeriod === 'custom' && customStartDate && customEndDate) {
            return `${formatDateForAPI(customStartDate)} to ${formatDateForAPI(customEndDate)}`;
        }
        switch (timePeriod) {
            case 'month': return 'Last 30 Days';
            case '3months': return 'Last 3 Months';
            case '6months': return 'Last 6 Months';
            case 'year': return 'Last 12 Months';
            default: return 'All Time';
        }
    }, [timePeriod, customStartDate, customEndDate, formatDateForAPI]);

    // Fetch daily details - ALWAYS WITH NO TIME FILTER (ALL TIME)
    const fetchDailyDetails = useCallback(async () => {
        if (!userData || !userData.user_id) return [];

        try {
            const payload = {
                user_id: userData.user_id || userData.id,
                name: userData.name,
                role: userData.role,
                branch: userData.branch
            };

            let url = `${API_BASE_URL}/performance/my-performance/daily-details?time_period=all`;

            const response = await axios.post(url, payload);

            if (response.data && response.data.length > 0) {
                const dailyData = response.data.map(day => ({
                    date: day.date,
                    first_followup_time: day.first_followup_time,
                    last_followup_time: day.last_followup_time,
                    total_working_hours: day.total_working_hours,
                    total_followups: day.total_followups || 0,
                    completed_count: day.completed_count || 0,
                    followup_by_call: day.followup_by_call || 0,
                    followup_by_whatsapp: day.followup_by_whatsapp || 0,
                    followup_by_email: day.followup_by_email || 0,
                    followup_by_visit: day.followup_by_visit || 0,
                    call_completed: day.call_completed || 0,
                    call_wip: day.call_wip || 0,
                    call_rejected: day.call_rejected || 0,
                    call_rescheduled: day.call_rescheduled || 0,
                    whatsapp_completed: day.whatsapp_completed || 0,
                    whatsapp_wip: day.whatsapp_wip || 0,
                    whatsapp_rejected: day.whatsapp_rejected || 0,
                    whatsapp_rescheduled: day.whatsapp_rescheduled || 0,
                    email_completed: day.email_completed || 0,
                    email_wip: day.email_wip || 0,
                    email_rejected: day.email_rejected || 0,
                    email_rescheduled: day.email_rescheduled || 0,
                    visit_completed: day.visit_completed || 0,
                    visit_wip: day.visit_wip || 0,
                    visit_rejected: day.visit_rejected || 0,
                    visit_rescheduled: day.visit_rescheduled || 0,
                    call_not_connected: day.call_not_connected || 0,
                    whatsapp_not_connected: day.whatsapp_not_connected || 0,
                    email_not_connected: day.email_not_connected || 0,
                    visit_not_connected: day.visit_not_connected || 0,
                    campaign_name: day.campaign_name || 'N/A'
                }));
                setDailyPerformance(dailyData);
                return dailyData;
            } else {
                setDailyPerformance([]);
                return [];
            }
        } catch (error) {
            console.error('Error fetching daily details:', error);
            setDailyPerformance([]);
            return [];
        }
    }, [userData]);

    // Fetch main performance data - THIS respects the time filter
    const fetchMyPerformance = useCallback(async () => {
        // NOTE: do NOT early-return on fetchingRef here. A filter change can fire while
        // the initial-mount fetch is still in flight; bailing out silently dropped the
        // refetch, so counts only updated after a tab switch remounted the component.
        if (!userData || !userData.user_id) {
            setLoading(false);
            return;
        }

        try {
            fetchingRef.current = true;

            // Warm-cache-first paint: on a repeat visit, instantly repaint with the
            // last data shown for this EXACT user + period while the normal fetch
            // below still runs unchanged and overwrites with fresh data.
            const cacheKey = warmKey('my-performance-summary', {
                uid: userData.user_id || userData.id,
                timePeriod,
                start: timePeriod === 'custom' ? formatDateForAPI(customStartDate) : null,
                end: timePeriod === 'custom' ? formatDateForAPI(customEndDate) : null
            });
            const warm = readWarmCache(cacheKey);
            if (warm && !hasPerformanceDataRef.current) {
                setPerformance(warm);
                setDailyPerformance(warm.daily_performance || []);
                setLoading(false); // paint warm data instead of the skeleton; fetch continues
            } else {
                setLoading(true);
            }
            setError(null);

            const payload = {
                user_id: userData.user_id || userData.id,
                name: userData.name,
                role: userData.role,
                branch: userData.branch
            };

            let url = `${API_BASE_URL}/performance/my-performance?time_period=${timePeriod}`;

            if (timePeriod === 'custom' && customStartDate && customEndDate) {
                const startDate = formatDateForAPI(customStartDate);
                const endDate = formatDateForAPI(customEndDate);
                if (startDate && endDate) {
                    url += `&start_date=${startDate}&end_date=${endDate}`;
                }
            }

            const response = await axios.post(url, payload);
            const data = response.data || DEFAULT_PERFORMANCE;
            setPerformance(data);
            setDailyPerformance(data.daily_performance || []);
            hasPerformanceDataRef.current = true;
            writeWarmCache(cacheKey, data);

        } catch (error) {
            console.error('Error fetching performance:', error);
            setError(error.response?.data?.detail || error.message);
            setPerformance(DEFAULT_PERFORMANCE);
        } finally {
            setLoading(false);
            fetchingRef.current = false;
        }
    }, [userData, timePeriod, customStartDate, customEndDate, formatDateForAPI, fetchDailyDetails]);

    // Add custom scrollbar styles
    useEffect(() => {
        const styleId = 'custom-scrollbar-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .custom-scrollbar-top::-webkit-scrollbar {
                    height: 8px;
                }
                .custom-scrollbar-top::-webkit-scrollbar-track {
                    background: #f1f1f1;
                    border-radius: 4px;
                }
                .custom-scrollbar-top::-webkit-scrollbar-thumb {
                    background: #888;
                    border-radius: 4px;
                }
                .custom-scrollbar-top::-webkit-scrollbar-thumb:hover {
                    background: #555;
                }
            `;
            document.head.appendChild(style);
        }
        return () => {
            const styleElement = document.getElementById(styleId);
            if (styleElement) {
                styleElement.remove();
            }
        };
    }, []);

    const fetchBranchAssetCount = useCallback(async () => {
        if (!userData || !userData.user_id) return;
        try {
            const response = await axios.get(`${API_BASE_URL}/v1/engagement/customers`);
            const data = response.data;
            const allCustomers = (data.customers || []).filter(c => c.campaigns && c.campaigns.length > 0);
            const activeCampaigns = data.active_campaigns || [];
            const isMaster = userData.role === 'master_admin';
            const userBranch = userData.branch;

            let filtered = allCustomers;
            if (!isMaster && userBranch) {
                filtered = allCustomers.filter(c => !c.branch_id || String(c.branch_id) === String(userBranch));
            }

            // Asset count = sum of campaign memberships (same as the Assets button in CustomerEng)
            const assetCount = activeCampaigns.reduce((sum, campaign) => {
                return sum + filtered.filter(c => c.campaigns?.includes(campaign)).length;
            }, 0);

            setBranchAssetCount(assetCount);
        } catch (err) {
            console.error('Error fetching branch asset count:', err);
        }
    }, [userData]);

    // silent=true refreshes in the background without the blocking spinner —
    // used when the modal already has rows to show from the mount-time prefetch.
    const fetchAllFollowups = useCallback(async (silent = false) => {
        if (!userData || !userData.user_id) return;
        if (!silent) setLoadingAllFollowups(true);
        try {
            const payload = {
                user_id: userData.user_id || userData.id,
                name: userData.name,
                role: userData.role,
                branch: userData.branch
            };

            let url = `${API_BASE_URL}/performance/my-performance/all-followups?time_period=${timePeriod}`;

            if (timePeriod === 'custom' && customStartDate && customEndDate) {
                const sd = formatDateForAPI(customStartDate);
                const ed = formatDateForAPI(customEndDate);
                if (sd && ed) url += `&start_date=${sd}&end_date=${ed}`;
            }

            const response = await axios.post(url, payload);
            setAllFollowupsData(response.data?.followups || []);
        } catch (error) {
            console.error('Error fetching all followups:', error);
            if (!silent) setAllFollowupsData([]);
        } finally {
            if (!silent) setLoadingAllFollowups(false);
        }
    }, [userData, timePeriod, customStartDate, customEndDate, formatDateForAPI]);

    const handleOpenAllFollowups = () => {
        setQuotationFilterActive(false);
        setQuotationSentFilterActive(false);
        setCspQuotationFilterActive(false);
        setCspQuotationSentFilterActive(false);
        setShowAllFollowupsModal(true);
        setFollowupSearchTerm('');
        setCreatedFromDate('');
        setCreatedToDate('');
        setStatusFilter('all');
        setStatusLocked(false);
        // Rows are prefetched on mount — show them instantly, refresh silently
        fetchAllFollowups(allFollowupsData.length > 0);
    };

    // Open the All-Follow-ups modal filtered to ONE status (C / WIP / R / F / NC).
    // status must be: 'completed' | 'wip' | 'rejected' | 'rescheduled' | 'not_connected'
    // The Status dropdown is hidden because the status is fixed by the clicked card.
    const handleOpenStatusFollowups = (status) => {
        setQuotationFilterActive(false);
        setQuotationSentFilterActive(false);
        setCspQuotationFilterActive(false);
        setCspQuotationSentFilterActive(false);
        setShowAllFollowupsModal(true);
        setFollowupSearchTerm('');
        setCreatedFromDate('');
        setCreatedToDate('');
        setStatusFilter(status);
        setStatusLocked(true);
        // Rows are prefetched on mount — show them instantly, refresh silently
        fetchAllFollowups(allFollowupsData.length > 0);
    };

    const handleOpenQuotationFollowups = () => {
        setQuotationFilterActive(true);
        setQuotationSentFilterActive(false);
        setShowAllFollowupsModal(true);
        setFollowupSearchTerm('');
        setCreatedFromDate('');
        setCreatedToDate('');
        if (allFollowupsData.length === 0) {
            fetchAllFollowups();
        }
    };

    const handleOpenQuotationSentFollowups = () => {
        setQuotationFilterActive(false);
        setQuotationSentFilterActive(true);
        setShowAllFollowupsModal(true);
        setFollowupSearchTerm('');
        setCreatedFromDate('');
        setCreatedToDate('');
        setStatusFilter('all'); // status is locked to WIP for this view
        if (allFollowupsData.length === 0) {
            fetchAllFollowups();
        }
    };

    const handleOpenCspQuotationFollowups = () => {
        setQuotationFilterActive(false);
        setQuotationSentFilterActive(false);
        setCspQuotationFilterActive(true);
        setCspQuotationSentFilterActive(false);
        setShowAllFollowupsModal(true);
        setFollowupSearchTerm('');
        setCreatedFromDate('');
        setCreatedToDate('');
        setStatusFilter('all');
        if (allFollowupsData.length === 0) {
            fetchAllFollowups();
        }
    };

    const handleOpenCspQuotationSentFollowups = () => {
        setQuotationFilterActive(false);
        setQuotationSentFilterActive(false);
        setCspQuotationFilterActive(false);
        setCspQuotationSentFilterActive(true);
        setShowAllFollowupsModal(true);
        setFollowupSearchTerm('');
        setCreatedFromDate('');
        setCreatedToDate('');
        setStatusFilter('all');
        if (allFollowupsData.length === 0) {
            fetchAllFollowups();
        }
    };

    // Get latest followup per unique (instance_id + campaign_name) combination
    const getLatestFollowupsPerInstanceCampaign = (followups) => {
        const map = new Map();
        followups.forEach(fu => {
            const key = `${fu.customer_instance_id || ''}__${fu.campaign_name || ''}`;
            const existing = map.get(key);
            if (!existing) {
                map.set(key, fu);
            } else {
                const existingDate = new Date(existing.created_at || existing.followup_date || 0);
                const currentDate = new Date(fu.created_at || fu.followup_date || 0);
                if (currentDate > existingDate) {
                    map.set(key, fu);
                }
            }
        });
        return Array.from(map.values());
    };

    // Latest follow-up per UNIQUE instance_id (campaign ignored) — for the "Unique" toggle
    const getLatestFollowupsPerInstance = (followups) => {
        const map = new Map();
        followups.forEach((fu, i) => {
            const key = fu.customer_instance_id ? String(fu.customer_instance_id) : `__no_id_${fu.id ?? i}`;
            const existing = map.get(key);
            if (!existing) {
                map.set(key, fu);
            } else {
                const existingDate = new Date(existing.created_at || existing.followup_date || 0);
                const currentDate = new Date(fu.created_at || fu.followup_date || 0);
                if (currentDate > existingDate) map.set(key, fu);
            }
        });
        return Array.from(map.values());
    };

    const fetchCspStatus = useCallback(async () => {
        if (!userData || !userData.user_id) return;
        setLoadingCsp(true);
        try {
            const params = new URLSearchParams({
                branch_id: userData.branch || '',
                role: userData.role || ''
            });
            const response = await axios.get(`${API_BASE_URL}/v1/engagement/csp-status?${params.toString()}`);
            const data = response.data || { total_instances: 0, total_rows: 0, rows: [] };
            setCspData(data);

            // ONE batch call to fetch warranty expiry for every CSP instance_id,
            // used to cap the 30-day due date. Non-blocking for the table render.
            const ids = [...new Set((data.rows || []).map(r => r.instance_id).filter(Boolean))];
            if (ids.length > 0) {
                try {
                    const wRes = await axios.post(`${API_BASE_URL}/v1/engagement/warranty-expiry-map`, {
                        instance_ids: ids
                    });
                    setWarrantyMap(wRes.data?.warranty_map || {});
                } catch (werr) {
                    console.error('Error fetching warranty map:', werr);
                    setWarrantyMap({});
                }
            } else {
                setWarrantyMap({});
            }
        } catch (error) {
            console.error('Error fetching CSP status:', error);
            setCspData({ total_instances: 0, total_rows: 0, rows: [] });
        } finally {
            setLoadingCsp(false);
        }
    }, [userData]);

    // Format a yyyy-mm-dd input into DD-MMM-YYYY (matches bulk-upload format)
    const formatSrDate = (val) => {
        if (!val) return null;
        const d = new Date(val);
        if (isNaN(d.getTime())) return val;
        const day = String(d.getDate()).padStart(2, '0');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${day}-${months[d.getMonth()]}-${d.getFullYear()}`;
    };

    const fetchUserCspSrCount = useCallback(async () => {
        if (!userData?.user_id && !userData?.id) return;
        try {
            const uid = userData.user_id || userData.id;
            const res = await axios.get(`${API_BASE_URL}/v1/campaigns/csp/user-sr-count`, {
                params: { user_id: uid }
            });
            setUserCspSrCount(res.data?.count || 0);
        } catch (e) {
            console.error('Error fetching user CSP SR count:', e);
            setUserCspSrCount(0);
        }
    }, [userData]);

    // Cheap count for the card — runs on mount alongside the other counts.
    const fetchLetterCount = useCallback(async () => {
        if (!userData?.user_id && !userData?.id) return;
        try {
            const payload = {
                user_id: userData.user_id || userData.id,
                name: userData.name, role: userData.role, branch: userData.branch
            };
            const res = await axios.post(`${API_BASE_URL}/performance/my-performance/letter-count`, payload);
            setLetterCount(res.data?.count || 0);
            setLetterSentCount(res.data?.sent || 0);
            setLetterDraftCount(res.data?.draft || 0);
            setCspLetterCount(res.data?.csp || 0);
        } catch (e) {
            console.error('Error fetching letter count:', e);
            setLetterCount(0);
            setLetterSentCount(0);
            setLetterDraftCount(0);
            setCspLetterCount(0);
        }
    }, [userData]);

    // Full rows — fetched LAZILY, only when the card is clicked.
    const fetchLetterRecords = useCallback(async () => {
        if (!userData?.user_id && !userData?.id) return;
        setLoadingLetters(true);
        try {
            const payload = {
                user_id: userData.user_id || userData.id,
                name: userData.name, role: userData.role, branch: userData.branch
            };
            const res = await axios.post(`${API_BASE_URL}/performance/my-performance/letter-records`, payload);
            setLetterData(res.data || { total: 0, letters: [] });
        } catch (e) {
            console.error('Error fetching letter records:', e);
            setLetterData({ total: 0, letters: [] });
        } finally {
            setLoadingLetters(false);
        }
    }, [userData]);

    const handleOpenLetterModal = () => {
        setShowLetterModal(true);
        setLetterCspOnly(false);
        setLetterSearchTerm('');
        setLetterDebouncedSearch('');
        setLetterStatusFilter('all');
        setLetterFromDate('');
        setLetterToDate('');
        setLetterVisibleCount(50);
        fetchLetterRecords();
    };

    // Letter For Warranty Lapse card → same letter modal, pre-filtered to CSP letters only.
    const handleOpenCspLetterModal = () => {
        setShowLetterModal(true);
        setLetterCspOnly(true);
        setLetterSearchTerm('');
        setLetterDebouncedSearch('');
        setLetterStatusFilter('all');
        setLetterFromDate('');
        setLetterToDate('');
        setLetterVisibleCount(50);
        fetchLetterRecords();
    };

    const handleOpenCustomerFromLetter = (row) => {
        if (!row || !row.instance_id || row.instance_id === '-') return;
        setShowLetterModal(false);
        navigate('/customer-engagement', {
            state: { openCustomerInstanceId: row.instance_id, openCustomerId: row.customer_id || null }
        });
    };

    const filteredLetters = useMemo(() => {
        const list = letterData.letters || [];
        const t = letterDebouncedSearch.trim().toLowerCase();
        return list.filter(l => {
            // CSP-only mode (Letter For Warranty Lapse card): keep letters whose
            // Format Type name starts with "CSP".
            if (letterCspOnly && !(l.format_type_name || '').toLowerCase().startsWith('csp')) return false;
            if (letterStatusFilter !== 'all' && (l.status || '').toLowerCase() !== letterStatusFilter) return false;
            if (letterFromDate || letterToDate) {
                const key = istDateKey(l.created_at);
                if (!key) return false;
                if (letterFromDate && key < letterFromDate) return false;
                if (letterToDate && key > letterToDate) return false;
            }
            if (t) {
                const m = (
                    (l.ref_no || '').toLowerCase().includes(t) ||
                    (l.instance_id || '').toString().toLowerCase().includes(t) ||
                    (l.customer_name || '').toLowerCase().includes(t) ||
                    (l.subject || '').toLowerCase().includes(t) ||
                    (l.format_type_name || '').toLowerCase().includes(t) ||
                    (l.email_to || '').toLowerCase().includes(t) ||
                    (l.status || '').toLowerCase().includes(t)
                );
                if (!m) return false;
            }
            return true;
        });
    }, [letterData.letters, letterDebouncedSearch, letterStatusFilter, letterFromDate, letterToDate, letterCspOnly]);

    // Fetch the letter's stored HTML, render it to a properly-formatted PDF
    // (same letterhead bands as the Send Letter feature), then show it.
    const handleViewLetter = async (row) => {
        if (!row || row.id == null) return;
        const uid = userData.user_id || userData.id;
        setLoadingLetterPdf(true);
        try {
            // 1) get the stored letter HTML for this one letter
            const res = await axios.get(
                `${API_BASE_URL}/performance/my-performance/letter-pdf/${row.id}`,
                { params: { user_id: uid } }
            );
            // Re-flow the stored References table (3 pairs per row when they fit, else 2)
            const rawHtml = reflowLetterReferencesHtml(res.data?.letter_html || '');
            if (!rawHtml) { alert('This letter has no content to display.'); return; }

            // 2) strip the inline header/footer bands, then re-stamp them per page
            const bodyHtml = rawHtml.replace(/<img\b[^>]*?(?:max-width\s*:\s*780px|width\s*:\s*100%)[^>]*?>/gi, '');
            const b64 = await generateBandedLetterPdf(bodyHtml);
            if (!b64) { alert('Could not render the letter.'); return; }

            // 3) base64 -> blob -> object URL for the iframe / download
            const blobUrl = URL.createObjectURL(new Blob([letterBase64ToBytes(b64)], { type: 'application/pdf' }));
            if (letterPdfUrl) URL.revokeObjectURL(letterPdfUrl); // free the previous one
            setLetterPdfUrl(blobUrl);
            setLetterPdfName(row.ref_no && row.ref_no !== '-' ? row.ref_no : `letter_${row.id}`);
            setShowLetterPdfModal(true);
        } catch (e) {
            console.error('Error loading letter:', e);
            alert('Could not load the letter.');
        } finally {
            setLoadingLetterPdf(false);
        }
    };

    const handlePrintLetterPdf = () => {
        const f = letterPdfIframeRef.current;
        if (f && f.contentWindow) {
            f.contentWindow.focus();
            f.contentWindow.print();
        }
    };

    const handleCloseLetterPdf = () => {
        setShowLetterPdfModal(false);
        if (letterPdfUrl) URL.revokeObjectURL(letterPdfUrl);
        setLetterPdfUrl('');
    };

    // Export the CURRENTLY FILTERED letters to Excel
    const exportLettersToExcel = () => {
        if (!filteredLetters.length) return;
        const rows = filteredLetters.map((l, idx) => {
            const attachmentNames = Array.isArray(l.attachment_names)
                ? l.attachment_names
                : (Array.isArray(l.attachments)
                    ? l.attachments.map(a => (typeof a === 'string' ? a : a?.name)).filter(Boolean)
                    : []);
            return {
                'S.No': idx + 1,
                'Ref No': l.ref_no || '-',
                'Instance ID': l.instance_id || '-',
                'Customer': l.customer_name || '-',
                'Phone': l.phone_number || '-',
                'Branch': l.branch_id || '-',
                'Format Type': l.format_type_name || '-',
                'Subject': l.subject || '-',
                'Attachments': attachmentNames.length ? attachmentNames.join(', ') : '-',
                'Channels': Array.isArray(l.channels) && l.channels.length ? l.channels.join(', ') : '-',
                'Email Sent': l.sent_email ? 'Yes' : 'No',
                'WhatsApp Sent': l.sent_whatsapp ? 'Yes' : 'No',
                'To': l.email_to || '-',
                'CC': l.email_cc || '-',
                'WhatsApp To': l.whatsapp_to || '-',
                'Status': l.status || '-',
                'Sent At (IST)': fmtIstDateTime(l.created_at),
            };
        });
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'My Letters');
        ws['!cols'] = Object.keys(rows[0]).map(() => ({ wch: 20 }));
        XLSX.writeFile(wb, `my_letters_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handleOpenAddSrModal = async () => {
        setSrForm({
            asset_number: '', branch_id: '', goem_oem: '',   // ← was branch_id: userData?.branch || ''
            sr_number: '', sr_open_date: '', sr_close_date: '', sr_type: 'CSP',
            sr_subtype: '', sr_status: 'Open', segment: '', application_code: ''
        });
        setSelectedCspCampaignId('');
        setShowAddSrModal(true);
        try {
            const res = await axios.get(`${API_BASE_URL}/v1/campaigns/csp/open-campaigns`);
            const list = res.data || [];
            setOpenCspCampaigns(list);
            if (list.length === 1) setSelectedCspCampaignId(String(list[0].id));
        } catch (e) {
            console.error('Error fetching open CSP drives:', e);
            setOpenCspCampaigns([]);
        }
    };

    // Auto-fill GOEM/OEM + Segment from asset_detailed when Asset No. is entered
    useEffect(() => {
        if (!showAddSrModal) return;
        const term = srForm.asset_number.trim();
        if (!term) return;

        const handle = setTimeout(async () => {
            try {
                const res = await axios.get(`${API_BASE_URL}/performance/asset-lookup`, {
                    params: { instance_id: term }
                });
                if (res.data?.found) {
                    setSrForm(prev => ({
                        ...prev,
                        goem_oem: res.data.goem_oem || prev.goem_oem,
                        segment: res.data.segment || prev.segment,
                        branch_id: res.data.branch_id || prev.branch_id
                    }));
                }
            } catch (e) {
                console.error('Asset lookup failed:', e);
            }
        }, 500);

        return () => clearTimeout(handle);
    }, [srForm.asset_number, showAddSrModal]);

    const handleSubmitSr = async () => {
        if (!selectedCspCampaignId) {
            alert('Please select which CSP drive to add this SR into.');
            return;
        }
        if (!srForm.asset_number.trim()) { alert('Asset Number is required.'); return; }
        if (!srForm.sr_number.trim()) { alert('SR Number is required.'); return; }

        setAddSrLoading(true);
        try {
            const payload = {
                ...srForm,
                instance_id: srForm.asset_number.trim(),
                sr_open_date: formatSrDate(srForm.sr_open_date),
                sr_close_date: formatSrDate(srForm.sr_close_date)
            };
            const headers = {
                'X-User-Id': userData.user_id || userData.id || '',
                'X-User-Name': userData.name || ''
            };
            await axios.post(
                `${API_BASE_URL}/v1/campaigns/${selectedCspCampaignId}/csp/add-sr`,
                payload,
                { headers }
            );
            setShowAddSrModal(false);
            fetchUserCspSrCount();
            fetchCspStatus();
        } catch (e) {
            alert(e.response?.data?.detail || 'Failed to add SR.');
        } finally {
            setAddSrLoading(false);
        }
    };

    const handleOpenCspModal = () => {
        setShowCspModal(true);
        setCspSearchTerm('');
        setCspDueFromDate('');
        setCspDueToDate('');
        setCspSegmentFilter('all');
        setCspStatusFilter('all');
        setCspDateField('due');
        fetchCspStatus();
    };

    const handleOpenOpenCspModal = () => {
        setShowOpenCspModal(true);
        setOpenCspSearchTerm('');
        setOpenCspDueFromDate('');
        setOpenCspDueToDate('');
        setOpenCspSegmentFilter('all');
        setOpenCspStatusFilter('all');
        setOpenCspDateField('due');
        if (!cspData.rows || cspData.rows.length === 0) {
            fetchCspStatus();
        }
    };

    // Parse a "DD-MM-YYYY" due-date string (the backend's output format) into a Date
    const parseCspDueDate = (str) => {
        if (!str) return null;
        const m = String(str).trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
        if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
        const d = new Date(str);
        return isNaN(d.getTime()) ? null : d;
    };

    // Due Date = SR Open Date + 30 days.
    // If the asset's warranty expiry (looked up by instance_id) falls WITHIN that
    // window (on/after SR open date and on/before the +30-day date), the warranty
    // expiry date becomes the due date instead.
    const getCspDueDate = useCallback((row) => {
        const open = parseAnyDate(row?.sr_open_date);
        if (!open) return null;
        open.setHours(0, 0, 0, 0);

        const due = new Date(open);
        due.setDate(due.getDate() + 30);

        const warranty = parseAnyDate(warrantyMap[row?.instance_id]);
        if (warranty) {
            warranty.setHours(0, 0, 0, 0);
            if (warranty >= open && warranty <= due) return warranty;
        }
        return due;
    }, [warrantyMap]);

    // Format a computed due Date back to DD-MM-YYYY for display
    const fmtCspDueDate = (d) => {
        if (!d) return '-';
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}-${mm}-${d.getFullYear()}`;
    };

    // Due/Overdue Days relative to the COMPUTED due date.
    // Positive = overdue, negative = days left. todayStartMs computed once per render.
    const todayStartMs = useMemo(() => {
        const t = new Date();
        t.setHours(0, 0, 0, 0);
        return t.getTime();
    }, []);

    const getCspDaysPass = useCallback((row) => {
        const due = getCspDueDate(row);
        if (!due) return null;
        due.setHours(0, 0, 0, 0);
        return Math.round((todayStartMs - due.getTime()) / (1000 * 60 * 60 * 24));
    }, [todayStartMs, getCspDueDate]);

    // Shared filter: search + segment + follow-up status + date range on the
    // SELECTED date column (Due / SR Open / Follow-up / Next Follow-up)
    const applyCspFilters = useCallback((rows, search, segment, fromDate, toDate, dateField = 'due', statusFilter = 'all') => {
        const dateOf = (row) => {
            if (dateField === 'sr_open') return parseAnyDate(row.sr_open_date);
            if (dateField === 'fu_date') return row.fu_date ? new Date(row.fu_date) : null;
            if (dateField === 'fu_next') return row.fu_next_date ? new Date(row.fu_next_date) : null;
            return getCspDueDate(row);
        };
        return (rows || []).filter(row => {
            if (search.trim()) {
                const t = search.toLowerCase();
                const matches =
                    (row.instance_id || '').toString().toLowerCase().includes(t) ||
                    (row.customer_name || '').toLowerCase().includes(t) ||
                    (row.branch_id || '').toString().toLowerCase().includes(t) ||
                    (row.sr_number || '').toString().toLowerCase().includes(t) ||
                    (row.goem_oem || '').toLowerCase().includes(t) ||
                    (row.segment || '').toLowerCase().includes(t) ||
                    (row.application_code || '').toLowerCase().includes(t);
                if (!matches) return false;
            }
            if (segment && segment !== 'all') {
                if ((row.segment || '') !== segment) return false;
            }
            if (statusFilter && statusFilter !== 'all') {
                if ((row.fu_status || '').trim().toLowerCase() !== statusFilter) return false;
            }
            if (fromDate || toDate) {
                const dv = dateOf(row);
                if (!dv || isNaN(dv.getTime())) return false;
                dv.setHours(0, 0, 0, 0);
                if (fromDate) {
                    const from = new Date(fromDate);
                    from.setHours(0, 0, 0, 0);
                    if (dv < from) return false;
                }
                if (toDate) {
                    const to = new Date(toDate);
                    to.setHours(23, 59, 59, 999);
                    if (dv > to) return false;
                }
            }
            return true;
        });
    }, [getCspDueDate]);

    // ONE row per instance: among duplicate instance_ids (same SR in several
    // CSP drives, or multiple SRs per asset) keep the row with the NEWEST
    // SR Open Date. O(n) single pass.
    const dedupeByInstance = useCallback((rows) => {
        const best = new Map();
        (rows || []).forEach((r, idx) => {
            const key = r.instance_id ? String(r.instance_id) : `__noid_${idx}`;
            const prev = best.get(key);
            if (!prev) { best.set(key, r); return; }
            const dNew = parseAnyDate(r.sr_open_date)?.getTime() ?? -Infinity;
            const dOld = parseAnyDate(prev.sr_open_date)?.getTime() ?? -Infinity;
            if (dNew > dOld) best.set(key, r);
        });
        return Array.from(best.values());
    }, []);

    // Total CSP box: unique instances only
    const uniqueCspRows = useMemo(
        () => dedupeByInstance(cspData.rows),
        [cspData.rows, dedupeByInstance]
    );

    // Segment options (shared by both modals) — derived from the already-fetched rows
    const cspSegmentOptions = useMemo(() => {
        const set = new Set();
        (cspData.rows || []).forEach(r => { if (r.segment) set.add(r.segment); });
        return Array.from(set).sort();
    }, [cspData.rows]);

    // Open-only rows (SR Status === open), one row per instance, and records
    // whose latest CSP follow-up is Completed/Rejected are removed entirely.
    const openCspRows = useMemo(
        () => dedupeByInstance(
            (cspData.rows || []).filter(r => (r.sr_status || '').trim().toLowerCase() === 'open')
        ).filter(r => !['completed', 'rejected'].includes((r.fu_status || '').trim().toLowerCase())),
        [cspData.rows, dedupeByInstance]
    );

    // Unique open instances (parallels Total CSP = total_instances)
    const openCspInstanceCount = useMemo(
        () => new Set(openCspRows.map(r => r.instance_id).filter(Boolean)).size,
        [openCspRows]
    );

    // Total CSP modal rows (unique instances; segment + status + selectable-date filtered)
    const filteredCspRows = useMemo(
        () => applyCspFilters(uniqueCspRows, cspSearchTerm, cspSegmentFilter, cspDueFromDate, cspDueToDate, cspDateField, cspStatusFilter),
        [uniqueCspRows, cspSearchTerm, cspSegmentFilter, cspDueFromDate, cspDueToDate, cspDateField, cspStatusFilter, applyCspFilters]
    );

    // Open CSP modal rows
    const filteredOpenCspRows = useMemo(
        () => applyCspFilters(openCspRows, openCspSearchTerm, openCspSegmentFilter, openCspDueFromDate, openCspDueToDate, openCspDateField, openCspStatusFilter),
        [openCspRows, openCspSearchTerm, openCspSegmentFilter, openCspDueFromDate, openCspDueToDate, openCspDateField, openCspStatusFilter, applyCspFilters]
    );
    // Sorted CSP rows for Total CSP modal
    const sortedCspRows = useMemo(() => {
        return [...filteredCspRows].sort((a, b) => {
            const da = getCspDaysPass(a);
            const db = getCspDaysPass(b);
            const valA = da === null ? -Infinity : da;
            const valB = db === null ? -Infinity : db;
            return cspDaysSort === 'desc' ? valB - valA : valA - valB;
        });
    }, [filteredCspRows, cspDaysSort, getCspDaysPass]);

    // Sorted CSP rows for Open CSP modal
    const sortedOpenCspRows = useMemo(() => {
        return [...filteredOpenCspRows].sort((a, b) => {
            const da = getCspDaysPass(a);
            const db = getCspDaysPass(b);
            const valA = da === null ? -Infinity : da;
            const valB = db === null ? -Infinity : db;
            return openCspDaysSort === 'desc' ? valB - valA : valA - valB;
        });
    }, [filteredOpenCspRows, openCspDaysSort, getCspDaysPass]);

    // Latest unique followups (one per instance_id + campaign_name)
    const latestUniqueFollowups = useMemo(
        () => getLatestFollowupsPerInstanceCampaign(allFollowupsData),
        [allFollowupsData]
    );

    // IDs of latest rows that have "quotation" in activity_content,
    // quotation NOT yet sent, AND status is 'rescheduled'
    const quotationFollowupIds = useMemo(() => new Set(
        latestUniqueFollowups
            .filter(fu =>
                (fu.activity_content || '').toLowerCase().includes('quotation') &&
                !fu.quotation_sent &&
                fu.status === 'rescheduled'
            )
            .map(fu => fu.id)
    ), [latestUniqueFollowups]);

    // Count for the front box
    const quotationCount = quotationFollowupIds.size;

    // NC (Not Connected) count for the top card — derived from already-fetched
    // follow-ups (status is its own value now). No backend change needed.
    const notConnectedCount = useMemo(
        () => allFollowupsData.filter(fu => (fu.status || '').trim().toLowerCase() === 'not_connected').length,
        [allFollowupsData]
    );

    // Quotation Sent box: LATEST followup per instance+drive with a quotation
    // sent and still WIP — customers whose quotation later Completed (or moved
    // to any other status) no longer count, so count == visible records.
    const quotationSentIds = useMemo(() => new Set(
        latestUniqueFollowups
            .filter(fu => fu.quotation_sent && (fu.status || '').toLowerCase() === 'wip')
            .map(fu => fu.id)
    ), [latestUniqueFollowups]);
    const quotationSentCount = quotationSentIds.size;

    // True if a follow-up belongs to a CSP campaign / service
    const isCspFollowup = useCallback((fu) =>
        (fu.campaign_service || '').toLowerCase().includes('csp') ||
        (fu.campaign_name || '').toLowerCase().includes('csp'),
        []);
    // CSP "Quotation Required" — same rule as quotationFollowupIds but CSP-only
    const cspQuotationFollowupIds = useMemo(() => new Set(
        latestUniqueFollowups
            .filter(fu =>
                (fu.activity_content || '').toLowerCase().includes('quotation') &&
                !fu.quotation_sent &&
                fu.status === 'rescheduled' &&
                isCspFollowup(fu)
            )
            .map(fu => fu.id)
    ), [latestUniqueFollowups]);

    const cspQuotationCount = cspQuotationFollowupIds.size;

    // CSP "Quotation Sent" — LATEST followup per instance+drive with quotation
    // sent, CSP service, and not Completed/Rejected (those drop out).
    const cspQuotationSentIds = useMemo(() => new Set(
        latestUniqueFollowups
            .filter(fu =>
                fu.quotation_sent &&
                isCspFollowup(fu) &&
                !['completed', 'rejected'].includes((fu.status || '').toLowerCase())
            )
            .map(fu => fu.id)
    ), [latestUniqueFollowups, isCspFollowup]);
    const cspQuotationSentCount = cspQuotationSentIds.size;

    // Non-campaign COMPLETED customers, reshaped as follow-up rows under campaign "other"
    const otherCompletedFollowups = useMemo(() => {
        return (nonCampaignData.customers || [])
            // Endpoint now returns EVERY record — keep only the latest per customer
            // here (is_latest), matching the old one-row-per-customer behavior.
            .filter(c => c.is_latest !== false && (c.last_status || '').toLowerCase() === 'completed')
            .map((c, i) => ({
                id: `other_${c.instance_id || i}`,
                followup_date: c.last_followup_date || null,
                customer_instance_id: c.instance_id || '',
                customer_id: null,
                customer_name: c.customer_name || '',
                phone_number: c.phone_number || '',
                email: c.email || '',
                branch_id: c.branch_id || '',
                campaign_name: 'other',
                campaign_service: c.service || '',
                csp_subtype: c.csp_subtype || '',
                followup_by: c.followup_by || '',
                followup_flag: (c.latest_flag && c.latest_flag !== 'N/A') ? c.latest_flag : '',
                status: 'completed',
                next_followup_date: c.next_followup_date || null,
                activity_content: c.activity_content || c.latest_activity || c.activity || '',
                rr_content: c.rr_content || '',
                followup_remark: c.latest_remark || '',
                quotation_sent: !!c.quotation_sent,
                quotation_no: c.quotation_no || '',
                quotation_value: c.quotation_value || 0,
                created_at: c.last_followup_date || null,
            }));
    }, [nonCampaignData.customers]);

    // EVERY non-campaign record (all statuses), reshaped the same way — used by
    // the per-date view so a clicked day shows drive + non-drive follow-ups together
    const allNonDriveFollowups = useMemo(() => {
        return (nonCampaignData.customers || []).map((c, i) => ({
            id: `other_${c.instance_id || 'x'}_${i}`,
            followup_date: c.last_followup_date || null,
            customer_instance_id: c.instance_id || '',
            customer_id: null,
            customer_name: c.customer_name || '',
            phone_number: c.phone_number || '',
            email: c.email || '',
            branch_id: c.branch_id || '',
            campaign_name: 'other',
            campaign_service: c.service || '',
            csp_subtype: c.csp_subtype || '',
            followup_by: c.followup_by || '',
            followup_flag: (c.latest_flag && c.latest_flag !== 'N/A') ? c.latest_flag : '',
            status: (c.last_status || '').toLowerCase(),
            next_followup_date: c.next_followup_date || null,
            activity_content: c.activity_content || c.latest_activity || c.activity || '',
            rr_content: c.rr_content || '',
            followup_remark: c.latest_remark || '',
            quotation_sent: !!c.quotation_sent,
            quotation_no: c.quotation_no || '',
            quotation_value: c.quotation_value || 0,
            created_at: c.created_at || c.last_followup_date || null,
        }));
    }, [nonCampaignData.customers]);

    // Only the plain "All Follow-ups" view (opened from Total Calls and Follow-ups)
    // gets the "other" completed rows appended. Quotation/CSP filtered views do not.
    const isPlainAllView =
        !quotationFilterActive && !quotationSentFilterActive &&
        !cspQuotationFilterActive && !cspQuotationSentFilterActive;

    // Header label for the All-Follow-ups modal when a status card opened it
    const lockedStatusLabel = {
        completed: 'Completed',
        wip: 'WIP',
        rejected: 'Rejected',
        rescheduled: 'Followups',
        not_connected: 'NC (Not Connected)',
    }[statusFilter] || 'Follow-ups';

    const mergedFollowups = useMemo(
        () => dateViewActive
            ? [...allFollowupsData, ...allNonDriveFollowups]
            : (isPlainAllView ? [...allFollowupsData, ...otherCompletedFollowups] : allFollowupsData),
        [dateViewActive, isPlainAllView, allFollowupsData, allNonDriveFollowups, otherCompletedFollowups]
    );

    // Memoized filtered follow-ups for the All-Follow-ups modal
    const visibleFollowups = useMemo(() => {
        return mergedFollowups.filter(fu => {
            if (quotationFilterActive && !quotationFollowupIds.has(fu.id)) return false;
            // Quotation Sent / CSP Quotation Sent views: same latest-unique id
            // sets as the cards, so the modal shows exactly the counted rows
            if (quotationSentFilterActive && !quotationSentIds.has(fu.id)) return false;
            if (cspQuotationFilterActive && !cspQuotationFollowupIds.has(fu.id)) return false;
            if (cspQuotationSentFilterActive && !cspQuotationSentIds.has(fu.id)) return false;
            if (statusFilter !== 'all') {
                if (statusFilter === 'not_connected') {
                    const status = (fu.status || '').trim().toLowerCase();
                    const remark = (fu.followup_remark || '').toLowerCase();
                    const flag = (fu.followup_flag || '').trim().toLowerCase();
                    const isNC = status === 'not_connected' ||
                        remark.includes('not connected') || flag === 'nc' || flag.includes('not connected');
                    if (!isNC) return false;
                } else if ((fu.status || '').toLowerCase() !== statusFilter) {
                    return false;
                }
            }
            if (debouncedSearch.trim()) {
                const t = debouncedSearch.toLowerCase();
                const matchesSearch = (
                    (fu.customer_name || '').toLowerCase().includes(t) ||
                    (fu.campaign_name || '').toLowerCase().includes(t) ||
                    (fu.followup_remark || '').toLowerCase().includes(t) ||
                    (fu.customer_instance_id || '').toString().toLowerCase().includes(t) ||
                    (fu.phone_number || '').toString().toLowerCase().includes(t) ||
                    (fu.email || '').toLowerCase().includes(t)
                );
                if (!matchesSearch) return false;
            }
            if (createdFromDate || createdToDate) {
                if (!fu.created_at) return false;
                const created = new Date(fu.created_at);
                created.setHours(0, 0, 0, 0);
                if (createdFromDate) {
                    const from = new Date(createdFromDate);
                    from.setHours(0, 0, 0, 0);
                    if (created < from) return false;
                }
                if (createdToDate) {
                    const to = new Date(createdToDate);
                    to.setHours(23, 59, 59, 999);
                    if (created > to) return false;
                }
            }
            return true;
        });
    }, [mergedFollowups, quotationFilterActive, quotationSentFilterActive,
        cspQuotationFilterActive, cspQuotationSentFilterActive, statusFilter,
        debouncedSearch, createdFromDate, createdToDate,
        quotationFollowupIds, cspQuotationFollowupIds,
        quotationSentIds, cspQuotationSentIds]);

    const displayedFollowups = useMemo(() => {
        // 'unique'       → latest row per unique Instance ID (drive ignored)
        // 'unique_drive' → latest row per unique Drive + Instance ID combination
        if (followupView === 'unique') return getLatestFollowupsPerInstance(visibleFollowups);
        if (followupView === 'unique_drive') return getLatestFollowupsPerInstanceCampaign(visibleFollowups);
        return visibleFollowups;
    }, [followupView, visibleFollowups]);

    // Whenever the underlying list changes (new filter / search / data / view),
    // reset the progressive-render window back to the first page.
    useEffect(() => {
        setFollowupRenderLimit(FOLLOWUP_RENDER_STEP);
    }, [displayedFollowups]);

    // Only the first `followupRenderLimit` rows are actually rendered as <tr>.
    const renderedFollowups = useMemo(
        () => displayedFollowups.slice(0, followupRenderLimit),
        [displayedFollowups, followupRenderLimit]
    );

    // Grow the window as the user nears the bottom of the scroll container.
    const handleFollowupTableScroll = useCallback((e) => {
        const el = e.currentTarget;
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 400) {
            setFollowupRenderLimit(prev =>
                prev < displayedFollowups.length ? prev + FOLLOWUP_RENDER_STEP : prev
            );
        }
    }, [displayedFollowups.length]);

    // Quotation sent count grouped by local date (YYYY-MM-DD) — derived from allFollowupsData
    const quotationSentByDate = useMemo(() => {
        const toLocalDateKey = (dateInput) => {
            if (!dateInput) return null;
            const d = new Date(dateInput);
            if (isNaN(d.getTime())) return null;
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };
        const map = {};
        allFollowupsData.forEach(fu => {
            if (fu.quotation_sent) {
                const key = toLocalDateKey(fu.followup_date || fu.created_at);
                if (key) map[key] = (map[key] || 0) + 1;
            }
        });
        return map;
    }, [allFollowupsData]);

    // Helper for a specific daily row
    const getQuotationSentForDay = useCallback((dayDate) => {
        if (!dayDate) return 0;
        const d = new Date(dayDate);
        if (isNaN(d.getTime())) return 0;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return quotationSentByDate[key] || 0;
    }, [quotationSentByDate]);

    const fetchNonFollowupCount = useCallback(async () => {
        if (!userData || !userData.user_id) return;

        try {
            const payload = {
                user_id: userData.user_id || userData.id,
                name: userData.name,
                role: userData.role,
                branch: userData.branch
            };

            const response = await axios.post(`${API_BASE_URL}/performance/my-performance/non-followup-count`, payload);
            setNonFollowupCount(response.data.non_followup_count || 0);
        } catch (error) {
            console.error('Error fetching non-followup count:', error);
            setNonFollowupCount(0);
        }
    }, [userData]);

    const statusBarData = useMemo(() => ({
        labels: ['Completed', 'WIP', 'Rejected', 'Followups', 'NC'],
        datasets: [{
            label: 'Status Count',
            data: [
                performance.completed_count || 0,
                performance.wip_count || 0,
                performance.rejected_count || 0,
                performance.rescheduled_count || 0,
                performance.not_connected_count || notConnectedCount || 0
            ],
            backgroundColor: [
                'rgba(34, 197, 94, 0.85)',
                'rgba(234, 179, 8, 0.85)',
                'rgba(220, 100, 40, 0.85)',
                'rgba(168, 85, 247, 0.85)',
                'rgba(107, 114, 128, 0.85)'
            ],
            borderColor: ['#22c55e', '#eab308', '#dc6428', '#a855f7', '#6b7280'],
            borderWidth: 2,
            borderRadius: 12,
            barPercentage: 0.7,
            categoryPercentage: 0.8,
            shadowOffsetX: 2,
            shadowOffsetY: 2,
            shadowBlur: 4,
            shadowColor: 'rgba(0, 0, 0, 0.1)'
        }]
    }), [performance.completed_count, performance.wip_count, performance.rejected_count, performance.rescheduled_count, performance.not_connected_count, notConnectedCount]);

    const statusBarOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    usePointStyle: true,
                    boxWidth: 10,
                    boxHeight: 10,
                    font: { size: 11, weight: '500' },
                    padding: 12
                }
            },
            tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                titleColor: '#fff',
                bodyColor: '#e5e7eb',
                borderColor: '#3b82f6',
                borderWidth: 1,
                cornerRadius: 8,
                callbacks: {
                    label: function (context) {
                        const value = context.raw;
                        const ncTotal = performance.not_connected_count || notConnectedCount || 0;
                        const total = (performance.completed_count || 0) + (performance.wip_count || 0) +
                            (performance.rejected_count || 0) + (performance.rescheduled_count || 0) + ncTotal;
                        const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                        return `${value.toLocaleString()} (${percentage}%)`;
                    }
                }
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { font: { size: 12, weight: '600' }, color: '#374151' }
            },
            y: {
                beginAtZero: true,
                grid: { color: '#f0f0f0', dash: [5, 5] },
                ticks: {
                    font: { size: 11 },
                    callback: function (value) { return value.toLocaleString(); }
                }
            }
        }
    }), [performance.completed_count, performance.wip_count, performance.rejected_count, performance.rescheduled_count, performance.not_connected_count, notConnectedCount]);

    const followupTypeChartData = useMemo(() => {
        const breakdown = performance?.followup_type_breakdown || {};
        const hasData = Object.keys(breakdown).length > 0;

        const labels = hasData
            ? Object.keys(breakdown).map(t => t.charAt(0).toUpperCase() + t.slice(1))
            : ['Call', 'WhatsApp', 'Email', 'Visit'];
        const data = hasData ? Object.values(breakdown) : [0, 0, 0, 0];

        const colors = {
            'call': '#2563EB',
            'whatsapp': '#10B981',
            'email': '#F97316',
            'visit': '#7C3AED',
        };

        return {
            labels,
            datasets: [{
                data,
                backgroundColor: labels.map(l => colors[l.toLowerCase()] || '#A0AEC0'),
                borderWidth: 0
            }]
        };
    }, [performance?.followup_type_breakdown]);

    const fetchExportPermission = useCallback(async () => {
        // Check the LOGGED-IN user's permission, not the viewed profile's —
        // when a master admin opens an employee's dashboard through Employee
        // Progress, userData is the EMPLOYEE, but export rights must follow
        // the person actually logged in (from sessionStorage).
        let loggedInUser = null;
        try {
            loggedInUser = JSON.parse(sessionStorage.getItem('user') || 'null');
        } catch (e) { /* corrupted session entry — fall back to userData */ }
        const uid = loggedInUser?.user_id || loggedInUser?.id || userData?.user_id || userData?.id;
        if (!uid) return;
        try {
            // Use the SAME endpoint the Customer Engagement pages use — a simple
            // GET by user_id. This route works on both local and hosted backends,
            // whereas the older POST /performance/check-export-permission route
            // was not reliably available on the hosted server, so the export
            // button never appeared there. Switching to this GET fixes that.
            const response = await axios.get(
                `${API_BASE_URL}/v1/engagement/check-export-permission`,
                { params: { user_id: uid } }
            );
            setCanExport(Boolean(response.data?.can_export));
        } catch (error) {
            console.error('Error fetching export permission:', error);
            setCanExport(false);
        }
    }, [userData]);

    // Handle scroll synchronization
    const handleTopScroll = (e) => {
        if (bottomScrollRef.current && topScrollRef.current) {
            bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
        }
    };

    const handleBottomScroll = (e) => {
        if (topScrollRef.current && bottomScrollRef.current) {
            topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft;
        }
    };

    // Update table width on mount, resize, and whenever the rendered rows change
    useEffect(() => {
        const updateTableWidth = () => {
            if (tableRef.current) {
                setTableScrollWidth(`${tableRef.current.scrollWidth}px`);
            }
        };
        updateTableWidth();
        window.addEventListener('resize', updateTableWidth);
        return () => window.removeEventListener('resize', updateTableWidth);
    }, [dailyPerformance, tableTimeFilter]);

    // Export to Excel
    const exportToExcel = () => {
        if (!filteredDailyPerformance.length) return;

        const exportData = filteredDailyPerformance.map((day, idx) => ({
            'S.NO': idx + 1,
            'Date': new Date(day.date).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            }),
            'Drive Name': day.campaign_name || 'N/A',
            'Start Time (IST)': day.first_followup_time ? convertUTCToIST(day.first_followup_time) : '-',
            'End Time (IST)': day.last_followup_time ? convertUTCToIST(day.last_followup_time) : '-',
            'Working Hours': formatWorkingHours(day.total_working_hours),
            'Toal Calls and Follow-ups': day.total_followups || 0,
            'By Call': day.followup_by_call || 0,
            'Call Completed': day.call_completed || 0,
            'Call WIP': day.call_wip || 0,
            'Call Rejected': day.call_rejected || 0,
            'Call Followups': day.call_rescheduled || 0,
            'Call Not Connected': day.call_not_connected || 0,
            'By WhatsApp': day.followup_by_whatsapp || 0,
            'WhatsApp Completed': day.whatsapp_completed || 0,
            'WhatsApp WIP': day.whatsapp_wip || 0,
            'WhatsApp Rejected': day.whatsapp_rejected || 0,
            'WhatsApp Followups': day.whatsapp_rescheduled || 0,
            'WhatsApp Not Connected': day.whatsapp_not_connected || 0,
            'By Email': day.followup_by_email || 0,
            'Email Completed': day.email_completed || 0,
            'Email WIP': day.email_wip || 0,
            'Email Rejected': day.email_rejected || 0,
            'Email Followups': day.email_rescheduled || 0,
            'Email Not Connected': day.email_not_connected || 0,
            'By Visit': day.followup_by_visit || 0,
            'Visit Completed': day.visit_completed || 0,
            'Visit WIP': day.visit_wip || 0,
            'Visit Rejected': day.visit_rejected || 0,
            'Visit Followups': day.visit_rescheduled || 0,
            'Visit Not Connected': day.visit_not_connected || 0,
            'Quotation Sent': getQuotationSentForDay(day.date)
        }));

        // Add total row
        const totalRow = {
            'S.NO': '',
            'Date': 'TOTAL',
            'Drive Name': '',
            'Start Time (IST)': '',
            'End Time (IST)': '',
            'Working Hours': '',
            'Toal Calls and Follow-ups': dailyTotals.total_followups,
            'By Call': dailyTotals.by_call,
            'Call Completed': dailyTotals.call_completed,
            'Call WIP': dailyTotals.call_wip,
            'Call Rejected': dailyTotals.call_rejected,
            'Call Followups': dailyTotals.call_rescheduled,
            'Call Not Connected': dailyTotals.call_not_connected,
            'By WhatsApp': dailyTotals.by_whatsapp,
            'WhatsApp Completed': dailyTotals.whatsapp_completed,
            'WhatsApp WIP': dailyTotals.whatsapp_wip,
            'WhatsApp Rejected': dailyTotals.whatsapp_rejected,
            'WhatsApp Followups': dailyTotals.whatsapp_rescheduled,
            'WhatsApp Not Connected': dailyTotals.whatsapp_not_connected,
            'By Email': dailyTotals.by_email,
            'Email Completed': dailyTotals.email_completed,
            'Email WIP': dailyTotals.email_wip,
            'Email Rejected': dailyTotals.email_rejected,
            'Email Followups': dailyTotals.email_rescheduled,
            'Email Not Connected': dailyTotals.email_not_connected,
            'By Visit': dailyTotals.by_visit,
            'Visit Completed': dailyTotals.visit_completed,
            'Visit WIP': dailyTotals.visit_wip,
            'Visit Rejected': dailyTotals.visit_rejected,
            'Visit Followups': dailyTotals.visit_rescheduled,
            'Visit Not Connected': dailyTotals.visit_not_connected,
            'Quotation Sent': dailyTotals.quotation_sent
        };

        exportData.push(totalRow);

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Daily Performance');
        ws['!cols'] = Object.keys(exportData[0]).map(() => ({ wch: 20 }));

        XLSX.writeFile(wb, `daily_performance_${filterLabel}_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const fetchNonCampaignCustomers = useCallback(async (silent = false) => {
        if (!userData || !userData.user_id) return;
        if (!silent) setLoadingNonCampaign(true);
        try {
            const payload = {
                user_id: userData.user_id || userData.id,
                name: userData.name,
                role: userData.role,
                branch: userData.branch
            };
            const response = await axios.post(
                `${API_BASE_URL}/performance/my-performance/non-campaign-customers`,
                payload
            );
            setNonCampaignData(response.data || { total_customers: 0, customers: [] });
        } catch (error) {
            console.error('Error fetching non-campaign customers:', error);
            if (!silent) setNonCampaignData({ total_customers: 0, customers: [] });
        } finally {
            if (!silent) setLoadingNonCampaign(false);
        }
    }, [userData]);

    const handleOpenNonCampaignModal = () => {
        setShowNonCampaignModal(true);
        setNonCampaignSearchTerm('');
        setNonCampaignStatusFilter('all');
        setNonCampaignServiceFilter('all');
        setNonCampaignFromDate('');
        setNonCampaignToDate('');
        setNonCampaignViewMode('all');
        // Rows are prefetched on mount — show them instantly, refresh silently
        fetchNonCampaignCustomers(nonCampaignData.customers.length > 0);
    };

    // Open the Non-Drive Customers modal pre-filtered to one status
    // (clicked from a status pill on the Reached Count card).
    const handleOpenNonCampaignStatus = (e, status) => {
        e.stopPropagation(); // don't trigger the card's own "view all" click
        setShowNonCampaignModal(true);
        setNonCampaignSearchTerm('');
        setNonCampaignStatusFilter(status);
        setNonCampaignServiceFilter('all');
        setNonCampaignFromDate('');
        setNonCampaignToDate('');
        // Status pills count ALL records — open in All so counts match
        setNonCampaignViewMode('all');
        fetchNonCampaignCustomers(nonCampaignData.customers.length > 0);
    };

    // Open the All-Follow-ups modal locked to ONE day (a clicked Daily Performance
    // Breakdown date). Drive + non-drive rows are both shown and every top filter
    // (date range / status / view / search / export) stays available.
    const handleOpenDateFollowups = (date) => {
        const d = String(date).split('T')[0];
        setQuotationFilterActive(false);
        setQuotationSentFilterActive(false);
        setCspQuotationFilterActive(false);
        setCspQuotationSentFilterActive(false);
        setDateViewActive(true);
        setShowAllFollowupsModal(true);
        setFollowupSearchTerm('');
        setCreatedFromDate(d);
        setCreatedToDate(d);
        setStatusFilter('all');
        setStatusLocked(false);
        fetchAllFollowups(allFollowupsData.length > 0);
        fetchNonCampaignCustomers(nonCampaignData.customers.length > 0);
    };

    // Base list for the Non-Campaign modal — completed is hidden here (it now
    // appears in the All-Follow-ups modal under campaign name "other")
    const nonCampaignBase = useMemo(
        () => (nonCampaignData.customers || []).filter(c => {
            // Completed is never shown here (it rolls into the Completed card)
            if ((c.last_status || '').toLowerCase() === 'completed') return false;
            // 'unique' keeps only the latest record per customer; 'all' keeps every record
            if (nonCampaignViewMode === 'unique' && c.is_latest === false) return false;
            return true;
        }),
        [nonCampaignData.customers, nonCampaignViewMode]
    );

    // Service/product dropdown options
    const nonCampaignServiceOptions = useMemo(() => {
        const set = new Set();
        nonCampaignBase.forEach(c => {
            if (c.service && c.service !== 'N/A') set.add(c.service);
        });
        return Array.from(set).sort();
    }, [nonCampaignBase]);

    // Search + status + service filtered rows (completed already excluded by nonCampaignBase)
    const filteredNonCampaignCustomers = useMemo(() => {
        return nonCampaignBase.filter(c => {
            if (nonCampaignStatusFilter !== 'all') {
                if ((c.last_status || '').toLowerCase() !== nonCampaignStatusFilter) return false;
            }
            if (nonCampaignServiceFilter !== 'all') {
                if ((c.service || '') !== nonCampaignServiceFilter) return false;
            }
            if (nonCampaignFromDate || nonCampaignToDate) {
                if (!c.last_followup_date) return false;
                const d = new Date(c.last_followup_date);
                d.setHours(0, 0, 0, 0);
                if (nonCampaignFromDate) {
                    const from = new Date(nonCampaignFromDate);
                    from.setHours(0, 0, 0, 0);
                    if (d < from) return false;
                }
                if (nonCampaignToDate) {
                    const to = new Date(nonCampaignToDate);
                    to.setHours(23, 59, 59, 999);
                    if (d > to) return false;
                }
            }
            if (nonCampaignSearchTerm.trim()) {
                const t = nonCampaignSearchTerm.toLowerCase();
                const m = (
                    (c.customer_name || '').toLowerCase().includes(t) ||
                    (c.instance_id || '').toString().toLowerCase().includes(t) ||
                    (c.phone_number || '').toString().toLowerCase().includes(t) ||
                    (c.email || '').toLowerCase().includes(t) ||
                    (c.service || '').toLowerCase().includes(t) ||
                    (c.latest_remark || '').toLowerCase().includes(t)
                );
                if (!m) return false;
            }
            return true;
        });
    }, [nonCampaignBase, nonCampaignStatusFilter, nonCampaignServiceFilter, nonCampaignSearchTerm, nonCampaignFromDate, nonCampaignToDate]);

    const exportNonCampaignToExcel = () => {
        if (!filteredNonCampaignCustomers.length) return;
        const exportData = filteredNonCampaignCustomers.map((c, idx) => ({
            'S.No': idx + 1,
            'Instance ID': c.instance_id || '-',
            'Customer Name': c.customer_name || '-',
            'Phone': c.phone_number || '-',
            'Email': c.email || '-',
            'Branch': c.branch_id || '-',
            'Service / Product': c.service || '-',
            'Activity': c.activity_content || '-',
            'Reject Reason': c.rr_content || '-',
            'Remark Type': c.remark_type || '-',
            'Follow-up By': c.followup_by || '-',
            'Status': statusLabel(c.last_status),
            'Flag': c.latest_flag || '-',
            'Remark': c.latest_remark || '-',
            'Quotation Sent': c.quotation_sent ? 'Yes' : 'No',
            'Quotation No': c.quotation_no || '-',
            'Quotation Value': c.quotation_value || 0,
            // Real Date cells (not text) so Excel's filter groups Year → Month
            'Last Follow-up': dateOnly(c.last_followup_date),
            'Next Follow-up': dateOnly(c.next_followup_date),
        }));
        const ws = XLSX.utils.json_to_sheet(exportData, { cellDates: true });
        finishDateColumns(ws);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Non-Drive Customers');
        ws['!cols'] = Object.keys(exportData[0]).map(() => ({ wch: 20 }));
        XLSX.writeFile(wb, `non_campaign_customers_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    // Export the All-Follow-ups modal — only the rows currently visible after filters
    const exportFollowupsToExcel = () => {
        if (!displayedFollowups.length) return;
        const exportData = displayedFollowups.map((fu, idx) => ({
            'S.No': idx + 1,
            // Real Date cell (not text) so Excel's filter groups Year → Month
            'Follow-up Date': dateOnly(fu.followup_date),
            'Instance ID': fu.customer_instance_id || '-',
            'Customer Name': fu.customer_name || '-',
            'Phone': fu.phone_number || '-',
            'Email': fu.email || '-',
            'Branch': fu.branch_id || '-',
            'Drive': fu.campaign_name || '-',
            'Service': fu.campaign_service || '-',
            'Subtype': fu.csp_subtype || '-',
            'Follow-up By': fu.followup_by || '-',
            'Flag': fu.followup_flag || '-',
            'Status': statusLabel(fu.status),
            'Next Follow-up': dateOnly(fu.next_followup_date),
            'Activity': fu.activity_content || '-',
            'Reject Reason': fu.rr_content || '-',
            'Remark': fu.followup_remark || '-',
            'Quotation Sent': fu.quotation_sent ? 'Yes' : 'No',
            'Quotation No': fu.quotation_no || '-',
            'Quotation Value': fu.quotation_value || 0,
            'Created At': dateOnly(fu.created_at),
        }));

        const ws = XLSX.utils.json_to_sheet(exportData, { cellDates: true });
        finishDateColumns(ws);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Follow-ups');
        ws['!cols'] = Object.keys(exportData[0]).map(() => ({ wch: 20 }));

        // Filename reflects which box opened the modal
        const labelPart = quotationFilterActive
            ? 'quotation_required'
            : quotationSentFilterActive
                ? 'quotation_sent'
                : cspQuotationFilterActive
                    ? 'csp_quotation_required'
                    : cspQuotationSentFilterActive
                        ? 'csp_quotation_sent'
                        : 'all_followups';

        XLSX.writeFile(wb, `${labelPart}_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    // Export the Total Calls and Follow-ups box — the full list (all follow-ups +
    // non-drive "other" completed rows), independent of any modal filter state.
    const exportTotalFollowupsToExcel = () => {
        const rows = [...allFollowupsData, ...otherCompletedFollowups];
        if (!rows.length) return;

        const exportData = rows.map((fu, idx) => ({
            'S.No': idx + 1,
            // Real Date cell (not text) so Excel's filter groups Year → Month
            'Follow-up Date': dateOnly(fu.followup_date),
            'Instance ID': fu.customer_instance_id || '-',
            'Customer Name': fu.customer_name || '-',
            'Phone': fu.phone_number || '-',
            'Email': fu.email || '-',
            'Branch': fu.branch_id || '-',
            'Drive': fu.campaign_name || '-',
            'Service': fu.campaign_service || '-',
            'Subtype': fu.csp_subtype || '-',
            'Follow-up By': fu.followup_by || '-',
            'Flag': fu.followup_flag || '-',
            'Status': statusLabel(fu.status),
            'Next Follow-up': dateOnly(fu.next_followup_date),
            'Activity': fu.activity_content || '-',
            'Reject Reason': fu.rr_content || '-',
            'Remark': fu.followup_remark || '-',
            'Quotation Sent': fu.quotation_sent ? 'Yes' : 'No',
            'Quotation No': fu.quotation_no || '-',
            'Quotation Value': fu.quotation_value || 0,
            'Created At': dateOnly(fu.created_at),
        }));

        const ws = XLSX.utils.json_to_sheet(exportData, { cellDates: true });
        finishDateColumns(ws);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Total Follow-ups');
        ws['!cols'] = Object.keys(exportData[0]).map(() => ({ wch: 20 }));
        XLSX.writeFile(wb, `total_calls_followups_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const fetchNonFollowupCustomerStats = useCallback(async () => {
        if (!userData || !userData.user_id) return;
        try {
            const payload = {
                user_id: userData.user_id || userData.id,
                name: userData.name,
                role: userData.role,
                branch: userData.branch
            };
            const response = await axios.post(
                `${API_BASE_URL}/performance/my-performance/non-followup-unique-customer-stats`,
                payload
            );
            setNonFollowupCustomerStats(response.data);
        } catch (error) {
            console.error('Error fetching non-followup customer stats:', error);
            setNonFollowupCustomerStats(null);
        }
    }, [userData]);

    useEffect(() => {
        if (!userData?.user_id) return;
        Promise.all([
            fetchMyPerformance(),
            fetchNonFollowupCount(),
            fetchBranchAssetCount(),
            fetchNonFollowupCustomerStats(),
            fetchNonCampaignCustomers(),
            fetchExportPermission(),
            fetchCspStatus(),
            fetchUserCspSrCount(),
            fetchLetterCount(),
        ]).catch(err => console.error('Parallel fetch error:', err));
    }, [userData?.user_id, timePeriod, customStartDate, customEndDate]);

    // Always load all follow-ups on mount / filter change so the
    // Quotation Sent / CSP quotation counts show without opening a modal
    useEffect(() => {
        if (!userData?.user_id) return;
        fetchAllFollowups();
    }, [userData?.user_id, timePeriod, customStartDate, customEndDate, fetchAllFollowups]);

    const { filteredDailyPerformance, filterLabel } = useMemo(() => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (tableTimeFilter === 'all') {
            return { filteredDailyPerformance: dailyPerformance, filterLabel: 'All Time' };
        }

        const days = tableTimeFilter === 'lastMonth' ? 30 : 90;
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - days);

        const filtered = dailyPerformance.filter(day => {
            const d = new Date(day.date);
            d.setHours(0, 0, 0, 0);
            return d >= startDate && d <= today;
        });

        const fmt = (date) => date.toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric'
        });

        return {
            filteredDailyPerformance: filtered,
            filterLabel: `Last ${days} Days (${fmt(startDate)} to ${fmt(today)})`
        };
    }, [dailyPerformance, tableTimeFilter]);

    const getFilterLabel = useCallback(() => filterLabel, [filterLabel]);

    // Precomputed daily-table totals (used by <tfoot> and exportToExcel)
    const dailyTotals = useMemo(() => {
        const sum = (fn) => filteredDailyPerformance.reduce((s, day) => s + fn(day), 0);
        return {
            total_followups: sum(d => d.total_followups || 0),
            completed_all: sum(d => (d.call_completed || 0) + (d.whatsapp_completed || 0) + (d.email_completed || 0) + (d.visit_completed || 0)),
            wip_all: sum(d => (d.call_wip || 0) + (d.whatsapp_wip || 0) + (d.email_wip || 0) + (d.visit_wip || 0)),
            rejected_all: sum(d => (d.call_rejected || 0) + (d.whatsapp_rejected || 0) + (d.email_rejected || 0) + (d.visit_rejected || 0)),
            rescheduled_all: sum(d => (d.call_rescheduled || 0) + (d.whatsapp_rescheduled || 0) + (d.email_rescheduled || 0) + (d.visit_rescheduled || 0)),
            not_connected_all: sum(d => (d.call_not_connected || 0) + (d.whatsapp_not_connected || 0) + (d.email_not_connected || 0) + (d.visit_not_connected || 0)),
            by_call: sum(d => d.followup_by_call || 0),
            call_completed: sum(d => d.call_completed || 0),
            call_wip: sum(d => d.call_wip || 0),
            call_rejected: sum(d => d.call_rejected || 0),
            call_rescheduled: sum(d => d.call_rescheduled || 0),
            call_not_connected: sum(d => d.call_not_connected || 0),
            by_whatsapp: sum(d => d.followup_by_whatsapp || 0),
            whatsapp_completed: sum(d => d.whatsapp_completed || 0),
            whatsapp_wip: sum(d => d.whatsapp_wip || 0),
            whatsapp_rejected: sum(d => d.whatsapp_rejected || 0),
            whatsapp_rescheduled: sum(d => d.whatsapp_rescheduled || 0),
            whatsapp_not_connected: sum(d => d.whatsapp_not_connected || 0),
            by_email: sum(d => d.followup_by_email || 0),
            email_completed: sum(d => d.email_completed || 0),
            email_wip: sum(d => d.email_wip || 0),
            email_rejected: sum(d => d.email_rejected || 0),
            email_rescheduled: sum(d => d.email_rescheduled || 0),
            email_not_connected: sum(d => d.email_not_connected || 0),
            by_visit: sum(d => d.followup_by_visit || 0),
            visit_completed: sum(d => d.visit_completed || 0),
            visit_wip: sum(d => d.visit_wip || 0),
            visit_rejected: sum(d => d.visit_rejected || 0),
            visit_rescheduled: sum(d => d.visit_rescheduled || 0),
            visit_not_connected: sum(d => d.visit_not_connected || 0),
            quotation_sent: filteredDailyPerformance.reduce((s, day) => s + getQuotationSentForDay(day.date), 0),
        };
    }, [filteredDailyPerformance, getQuotationSentForDay]);

    const chartOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    usePointStyle: true,
                    boxWidth: 8,
                    font: { size: 11 }
                }
            },
            tooltip: {
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                titleColor: '#2D4059',
                bodyColor: '#4A5568',
                borderColor: '#E2E8F0',
                borderWidth: 1,
                padding: 8,
                boxPadding: 4,
                usePointStyle: true,
                titleFont: { size: 12 },
                bodyFont: { size: 11 }
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { font: { size: 10 } }
            },
            y: {
                beginAtZero: true,
                grid: { color: '#EDF2F7' },
                ticks: { font: { size: 10 } }
            }
        }
    }), []);

    // Non-Drive Reached card counts — ALL taken records (not unique customers),
    // completed records excluded (completed rolls into the top Completed card).
    // Computed from the same all-records list the modal shows, prefetched on mount.
    const nonDriveRecordStats = useMemo(() => {
        const rows = (nonCampaignData.customers || []).filter(
            c => (c.last_status || '').toLowerCase() !== 'completed'
        );
        const count = (s) => rows.filter(c => (c.last_status || '').toLowerCase() === s).length;
        const wip = count('wip');
        const rejected = count('rejected');
        const rescheduled = count('rescheduled');
        const not_connected = count('not_connected');
        return {
            total: rows.length,
            wip,
            rejected,
            rescheduled,
            not_connected,
            pending: rows.length - wip - rejected - rescheduled - not_connected,
        };
    }, [nonCampaignData.customers]);
    const nonDriveReachedTotal = nonDriveRecordStats.total;

    // Loading state — show skeleton cards instead of full-page spinner
    if (loading) {
        return (
            <div>
                {/* Skeleton stat cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5 sm:gap-3 mb-4">
                    {Array.from({ length: 7 }).map((_, i) => (
                        <div key={i} className="bg-white rounded-lg shadow-sm p-3 border border-gray-200 min-h-[90px] flex flex-col justify-between animate-pulse">
                            <div className="h-3 bg-gray-200 rounded w-3/4 mx-auto"></div>
                            <div className="h-6 bg-gray-200 rounded w-1/2 mx-auto mt-2"></div>
                        </div>
                    ))}
                </div>

                {/* Skeleton charts */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                    {Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} className="bg-white rounded-xl shadow-lg p-5 border border-gray-100 animate-pulse">
                            <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
                            <div className="h-56 bg-gray-100 rounded"></div>
                        </div>
                    ))}
                </div>

                {/* Skeleton table */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 mt-5 animate-pulse">
                    <div className="px-4 py-3 border-b border-gray-200">
                        <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                    </div>
                    <div className="p-4 space-y-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-8 bg-gray-100 rounded"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                <svg className="w-14 h-14 text-red-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-base font-semibold text-red-800 mb-1.5">Error</h3>
                <p className="text-xs text-red-600">{error}</p>
                <button
                    onClick={() => fetchMyPerformance()}
                    className="mt-3 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700 transition-colors"
                >
                    Retry
                </button>
            </div>
        );
    }

    // Main render
    return (
        <div>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5 sm:gap-3 mb-4">
                <div
                    onClick={handleOpenAllFollowups}
                    className="group relative bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md hover:border-[#2f3192] transition-all text-center cursor-pointer flex flex-col justify-between min-h-[90px]"
                >

                    <h3 className="text-[11px] sm:text-[12px] font-semibold leading-tight group-hover:font-bold transition-all" style={{ color: themeColor }}>
                        Total Calls and Follow-ups
                        {otherCompletedFollowups.length > 0 && (
                            <span className="ml-1 text-[10px] text-gray-500 font-semibold whitespace-nowrap">
                                ({performance.total_followups || 0} + {otherCompletedFollowups.length} Non-Drive)
                            </span>
                        )}
                        {branchAssetCount > 0 && (
                            <span className="block text-[10px] text-black font-semibold mt-0.5">
                                ({branchAssetCount} assets)
                            </span>
                        )}
                    </h3>
                    <p className="text-base sm:text-lg font-semibold text-black mt-1">
                        <TimeValue>{(performance.total_followups || 0) + otherCompletedFollowups.length}</TimeValue>
                    </p>

                    {/* Hover Tooltip */}
                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                        <div className="bg-black text-white text-[10px] font-medium rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
                            Click to view all follow-ups
                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black"></div>
                        </div>
                    </div>
                </div>

                <div
                    onClick={() => handleOpenStatusFollowups('wip')}
                    className="group relative bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md hover:border-[#2f3192] transition-all text-center cursor-pointer flex flex-col justify-between min-h-[90px]"
                >
                    <h3 className="text-[11px] sm:text-[12px] font-semibold leading-tight group-hover:font-bold transition-all" style={{ color: themeColor }}>Work In Progress</h3>
                    <p className="text-base sm:text-lg font-semibold text-black mt-1"><TimeValue>{performance.wip_count || 0}</TimeValue></p>
                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                        <div className="bg-black text-white text-[10px] font-medium rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
                            Click to view WIP follow-ups
                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black"></div>
                        </div>
                    </div>
                </div>

                <div
                    onClick={() => handleOpenStatusFollowups('rescheduled')}
                    className="group relative bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md hover:border-[#2f3192] transition-all text-center cursor-pointer flex flex-col justify-between min-h-[90px]"
                >
                    <h3 className="text-[11px] sm:text-[12px] font-semibold leading-tight group-hover:font-bold transition-all" style={{ color: themeColor }}>Followups</h3>
                    <p className="text-base sm:text-lg font-semibold text-black mt-1"><TimeValue>{performance.rescheduled_count || 0}</TimeValue></p>
                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                        <div className="bg-black text-white text-[10px] font-medium rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
                            Click to view Followups
                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black"></div>
                        </div>
                    </div>
                </div>

                <div
                    onClick={() => handleOpenStatusFollowups('rejected')}
                    className="group relative bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md hover:border-[#2f3192] transition-all text-center cursor-pointer flex flex-col justify-between min-h-[90px]"
                >
                    <h3 className="text-[11px] sm:text-[12px] font-semibold leading-tight group-hover:font-bold transition-all" style={{ color: themeColor }}>Rejected</h3>
                    <p className="text-base sm:text-lg font-semibold text-black mt-1"><TimeValue>{performance.rejected_count || 0}</TimeValue></p>
                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                        <div className="bg-black text-white text-[10px] font-medium rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
                            Click to view rejected follow-ups
                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black"></div>
                        </div>
                    </div>
                </div>

                <div
                    onClick={() => handleOpenStatusFollowups('not_connected')}
                    className="group relative bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md hover:border-[#2f3192] transition-all text-center cursor-pointer flex flex-col justify-between min-h-[90px]"
                >
                    <h3 className="text-[11px] sm:text-[12px] font-semibold leading-tight group-hover:font-bold transition-all" style={{ color: themeColor }}>Not Connected</h3>
                    <p className="text-base sm:text-lg font-semibold text-black mt-1"><TimeValue>{notConnectedCount}</TimeValue></p>
                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                        <div className="bg-black text-white text-[10px] font-medium rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
                            Click to view not connected (NC) follow-ups
                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black"></div>
                        </div>
                    </div>
                </div>

                <div
                    onClick={() => handleOpenStatusFollowups('completed')}
                    className="group relative bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md hover:border-[#2f3192] transition-all text-center cursor-pointer flex flex-col justify-between min-h-[90px]"
                >
                    <h3 className="text-[11px] sm:text-[12px] font-semibold leading-tight group-hover:font-bold transition-all" style={{ color: themeColor }}>
                        Completed
                        {(nonFollowupCustomerStats?.completed || 0) > 0 && (
                            <span className="block text-[10px] text-gray-500 font-semibold mt-0.5 whitespace-nowrap">
                                ({performance.completed_count || 0} + {nonFollowupCustomerStats.completed} Non-Drive)
                            </span>
                        )}
                    </h3>
                    <p className="text-base sm:text-lg font-semibold text-black mt-1">
                        <TimeValue>{(performance.completed_count || 0) + (nonFollowupCustomerStats?.completed || 0)}</TimeValue>
                    </p>
                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                        <div className="bg-black text-white text-[10px] font-medium rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
                            Click to view completed follow-ups
                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black"></div>
                        </div>
                    </div>
                </div>

                <div
                    onClick={handleOpenQuotationFollowups}
                    className="group relative bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md hover:border-[#2f3192] transition-all text-center cursor-pointer flex flex-col justify-between min-h-[90px]"
                >
                    <h3 className="text-[11px] sm:text-[12px] font-semibold leading-tight group-hover:font-bold transition-all" style={{ color: themeColor }}>
                        Quotation Required
                    </h3>
                    <p className="text-base sm:text-lg font-semibold text-black mt-1">
                        <TimeValue>{quotationCount}</TimeValue>
                    </p>

                    {/* Hover Tooltip */}
                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                        <div className="bg-black text-white text-[10px] font-medium rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
                            Click to view quotation follow-ups
                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black"></div>
                        </div>
                    </div>
                </div>
                <div
                    onClick={handleOpenQuotationSentFollowups}
                    className="group relative bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md hover:border-[#2f3192] transition-all text-center cursor-pointer flex flex-col justify-between min-h-[90px]"
                >
                    <h3 className="text-[11px] sm:text-[12px] font-semibold leading-tight group-hover:font-bold transition-all" style={{ color: themeColor }}>
                        Quotation Sent
                    </h3>
                    <p className="text-base sm:text-lg font-semibold text-black mt-1">
                        <TimeValue>{quotationSentCount}</TimeValue>
                    </p>

                    {/* Hover Tooltip */}
                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                        <div className="bg-black text-white text-[10px] font-medium rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
                            Click to view quotation sent customers
                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black"></div>
                        </div>
                    </div>
                </div>
                <div
                    onClick={handleOpenAddSrModal}
                    className="group relative bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md hover:border-[#2f3192] transition-all text-center cursor-pointer flex flex-col justify-between min-h-[90px]"
                >
                    <h3 className="text-[11px] sm:text-[12px] font-semibold leading-tight group-hover:font-bold transition-all" style={{ color: themeColor }}>
                        Add New CSP SR
                    </h3>
                    <p className="text-base sm:text-lg font-semibold text-black mt-1">
                        {userCspSrCount}
                    </p>

                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                        <div className="bg-black text-white text-[10px] font-medium rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
                            Click to manually add an SR to a CSP Drive
                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black"></div>
                        </div>
                    </div>
                </div>
                <div
                    onClick={handleOpenCspModal}
                    className="group relative bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md hover:border-[#2f3192] transition-all text-center cursor-pointer flex flex-col justify-between min-h-[90px]"
                >
                    <h3 className="text-[11px] sm:text-[12px] font-semibold leading-tight group-hover:font-bold transition-all" style={{ color: themeColor }}>
                        Total CSP
                    </h3>
                    <p className="text-base sm:text-lg font-semibold text-black mt-1">
                        {cspData.total_instances}
                    </p>

                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                        <div className="bg-black text-white text-[10px] font-medium rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
                            Click to view CSP customers & due dates
                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black"></div>
                        </div>
                    </div>
                </div>
                <div
                    onClick={handleOpenOpenCspModal}
                    className="group relative bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md hover:border-[#2f3192] transition-all text-center cursor-pointer flex flex-col justify-between min-h-[90px]"
                >
                    <h3 className="text-[11px] sm:text-[12px] font-semibold leading-tight group-hover:font-bold transition-all" style={{ color: themeColor }}>
                        Open CSP
                    </h3>
                    <p className="text-base sm:text-lg font-semibold text-black mt-1">
                        {openCspInstanceCount}
                    </p>

                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                        <div className="bg-black text-white text-[10px] font-medium rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
                            Click to view open SR CSP records
                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black"></div>
                        </div>
                    </div>
                </div>
                <div
                    onClick={handleOpenCspQuotationFollowups}
                    className="group relative bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md hover:border-[#2f3192] transition-all text-center cursor-pointer flex flex-col justify-between min-h-[90px]"
                >
                    <h3 className="text-[11px] sm:text-[12px] font-semibold leading-tight group-hover:font-bold transition-all" style={{ color: themeColor }}>
                        CSP Quotation Required
                    </h3>
                    <p className="text-base sm:text-lg font-semibold text-black mt-1">
                        {cspQuotationCount}
                    </p>

                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                        <div className="bg-black text-white text-[10px] font-medium rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
                            Click to view CSP quotation follow-ups
                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black"></div>
                        </div>
                    </div>
                </div>
                <div
                    onClick={handleOpenCspQuotationSentFollowups}
                    className="group relative bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md hover:border-[#2f3192] transition-all text-center cursor-pointer flex flex-col justify-between min-h-[90px]"
                >
                    <h3 className="text-[11px] sm:text-[12px] font-semibold leading-tight group-hover:font-bold transition-all" style={{ color: themeColor }}>
                        CSP Quotation Sent
                    </h3>
                    <p className="text-base sm:text-lg font-semibold text-black mt-1">
                        {cspQuotationSentCount}
                    </p>

                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                        <div className="bg-black text-white text-[10px] font-medium rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
                            Click to view CSP quotation sent customers
                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black"></div>
                        </div>
                    </div>
                </div>
                <div
                    onClick={handleOpenCspLetterModal}
                    className="group relative bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md hover:border-[#2f3192] transition-all text-center cursor-pointer flex flex-col justify-between min-h-[90px]"
                >
                    <h3 className="text-[11px] sm:text-[12px] font-semibold leading-tight group-hover:font-bold transition-all" style={{ color: themeColor }}>
                        Letter For Warranty Lapse
                    </h3>
                    <p className="text-base sm:text-lg font-semibold text-black mt-1">
                        {cspLetterCount}
                    </p>

                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                        <div className="bg-black text-white text-[10px] font-medium rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
                            Click to view CSP letters sent
                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black"></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">

                <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-lg p-5 border border-gray-100">
                    {/* Header with stats summary */}
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h3 className="text-base font-bold text-gray-800">Status Comparison</h3>
                            <p className="text-xs text-gray-500 mt-0.5">Distribution of all follow-up statuses</p>
                        </div>
                        <div className="rounded-lg px-3 py-1.5">
                            <span className="text-xs font-semibold text-black">
                                Total: {((performance.completed_count || 0) + (performance.wip_count || 0) +
                                    (performance.rejected_count || 0) + (performance.rescheduled_count || 0) +
                                    (performance.not_connected_count || notConnectedCount || 0)).toLocaleString()}
                            </span>
                        </div>
                    </div>

                    {/* Chart Container */}
                    <div className="h-56 w-full">
                        <Bar data={statusBarData} options={statusBarOptions} />
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
                    <h3 className="text-sm font-bold text-black mb-3">Follow-up Type Distribution</h3>
                    <div className="h-56 w-full flex items-center justify-center">
                        <div className="w-full h-full max-w-[260px] mx-auto">
                            {performance.total_followups > 0 ? (
                                <Pie data={followupTypeChartData} options={chartOptions} />
                            ) : (
                                <div className="flex items-center justify-center h-full text-xs text-gray-400">
                                    No data to display
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Non-Drive + Letter Report — side by side (half / half) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 items-stretch">
                {/* Non-Campaign Unique Customers Card */}
                {nonFollowupCustomerStats && (
                    <div
                        onClick={handleOpenNonCampaignModal}
                        className="group bg-white rounded-lg shadow-sm p-2.5 sm:p-3 border border-gray-200 hover:shadow-md hover:border-[#2f3192] transition-all cursor-pointer h-full"
                        title="Click to view all non-drive customers"
                    >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">

                            {/* Title + Total (completed excluded — it now rolls into the top Completed card) */}
                            <div className="flex items-center gap-2 shrink-0">
                                <h3 className="text-[11px] sm:text-sm font-semibold leading-tight group-hover:font-bold transition-all" style={{ color: themeColor }}>
                                    Non-Drive/PW Customers<br />Reached Count
                                </h3>
                                <span
                                    className="text-sm sm:text-base font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                                    style={{ backgroundColor: `${themeColor}15`, color: themeColor }}
                                >
                                    {nonDriveReachedTotal}
                                </span>
                            </div>

                            {/* Status Breakdown Pills (Completed removed) — tidy 2×2 grid */}
                            <div className="grid grid-cols-2 gap-1.5 shrink-0">

                                {/* WIP */}
                                <div
                                    onClick={(e) => handleOpenNonCampaignStatus(e, 'wip')}
                                    title="Click to view WIP non-drive customers"
                                    className="flex items-center justify-center gap-1 bg-yellow-50 border border-yellow-200 rounded-full px-2.5 py-0.5 cursor-pointer hover:bg-yellow-100"
                                >
                                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block"></span>
                                    <span className="text-[10px] sm:text-[11px] font-medium text-yellow-700">W</span>
                                    <span className="text-[10px] sm:text-[11px] font-bold text-yellow-800">
                                        {nonDriveRecordStats.wip}
                                    </span>
                                    {nonDriveReachedTotal > 0 && (
                                        <span className="text-[9px] text-yellow-600">
                                            ({((nonDriveRecordStats.wip / nonDriveReachedTotal) * 100).toFixed(0)}%)
                                        </span>
                                    )}
                                </div>

                                {/* Rejected */}
                                <div
                                    onClick={(e) => handleOpenNonCampaignStatus(e, 'rejected')}
                                    title="Click to view rejected non-drive customers"
                                    className="flex items-center justify-center gap-1 bg-red-50 border border-red-200 rounded-full px-2.5 py-0.5 cursor-pointer hover:bg-red-100"
                                >
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>
                                    <span className="text-[10px] sm:text-[11px] font-medium text-red-700">R</span>
                                    <span className="text-[10px] sm:text-[11px] font-bold text-red-800">
                                        {nonDriveRecordStats.rejected}
                                    </span>
                                    {nonDriveReachedTotal > 0 && (
                                        <span className="text-[9px] text-red-600">
                                            ({((nonDriveRecordStats.rejected / nonDriveReachedTotal) * 100).toFixed(0)}%)
                                        </span>
                                    )}
                                </div>

                                {/* Followups */}
                                <div
                                    onClick={(e) => handleOpenNonCampaignStatus(e, 'rescheduled')}
                                    title="Click to view rescheduled non-drive customers"
                                    className="flex items-center justify-center gap-1 bg-purple-50 border border-purple-200 rounded-full px-2.5 py-0.5 cursor-pointer hover:bg-purple-100"
                                >
                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block"></span>
                                    <span className="text-[10px] sm:text-[11px] font-medium text-purple-700">Followups</span>
                                    <span className="text-[10px] sm:text-[11px] font-bold text-purple-800">
                                        {nonDriveRecordStats.rescheduled}
                                    </span>
                                    {nonDriveReachedTotal > 0 && (
                                        <span className="text-[9px] text-purple-600">
                                            ({((nonDriveRecordStats.rescheduled / nonDriveReachedTotal) * 100).toFixed(0)}%)
                                        </span>
                                    )}
                                </div>

                                {/* NC (Not Connected) */}
                                <div
                                    onClick={(e) => handleOpenNonCampaignStatus(e, 'not_connected')}
                                    title="Click to view not-connected non-drive customers"
                                    className="flex items-center justify-center gap-1 bg-gray-50 border border-gray-300 rounded-full px-2.5 py-0.5 cursor-pointer hover:bg-gray-100"
                                >
                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500 inline-block"></span>
                                    <span className="text-[10px] sm:text-[11px] font-medium text-gray-700">NC</span>
                                    <span className="text-[10px] sm:text-[11px] font-bold text-gray-800">
                                        {nonDriveRecordStats.not_connected}
                                    </span>
                                    {nonDriveReachedTotal > 0 && (
                                        <span className="text-[9px] text-gray-600">
                                            ({((nonDriveRecordStats.not_connected / nonDriveReachedTotal) * 100).toFixed(0)}%)
                                        </span>
                                    )}
                                </div>

                                {/* Pending - only show if > 0 */}
                                {nonDriveRecordStats.pending > 0 && (
                                    <div className="col-span-2 flex items-center justify-center gap-1 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-0.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block"></span>
                                        <span className="text-[10px] sm:text-[11px] font-medium text-gray-600">P</span>
                                        <span className="text-[10px] sm:text-[11px] font-bold text-gray-700">
                                            {nonDriveRecordStats.pending}
                                        </span>
                                    </div>
                                )}

                            </div>
                        </div>
                    </div>
                )}

                {/* Letter Report — letters sent BY this employee (lazy: rows load on click) */}
                <div
                    onClick={handleOpenLetterModal}
                    className="group bg-white rounded-lg shadow-sm p-2.5 sm:p-3 border border-gray-200 hover:shadow-md hover:border-[#2f3192] transition-all cursor-pointer h-full"
                    title="Click to view all letters you have sent"
                >
                    <div className="flex items-center justify-between gap-2 max-sm:flex-wrap">
                        <div className="flex items-center gap-2">
                            <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${themeColor}15` }}>
                                <svg className="w-4 h-4" fill="none" stroke={themeColor} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                            </span>
                            <div>
                                <h3 className="text-[11px] sm:text-sm font-semibold group-hover:font-bold transition-all" style={{ color: themeColor }}>
                                    Letter Report
                                </h3>
                                <p className="text-[10px] text-gray-500">Letters sent by you — click to view details</p>
                            </div>
                        </div>
                        <div className="grid grid-rows-2 gap-1.5 shrink-0">
                            {/* Sent */}
                            <div className="flex items-center justify-center gap-1 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5">
                                <span className="text-[10px] sm:text-[11px] font-medium text-green-700">Sent</span>
                                <span className="text-[11px] sm:text-sm font-bold text-green-800">{letterSentCount}</span>
                            </div>
                            {/* Draft */}
                            <div className="flex items-center justify-center gap-1 bg-yellow-50 border border-yellow-200 rounded-full px-2.5 py-0.5">
                                <span className="text-[10px] sm:text-[11px] font-medium text-yellow-700">Draft</span>
                                <span className="text-[11px] sm:text-sm font-bold text-yellow-800">{letterDraftCount}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Daily Performance Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mt-5">
                <div className="px-3 sm:px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                        <div className="flex-1">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div>
                                    <h3 className="text-sm sm:text-base font-semibold text-black">Daily Performance Breakdown</h3>
                                    <p className="text-[11px] sm:text-xs text-black mt-0.5">
                                        {filterLabel} • {filteredDailyPerformance.length} days data
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 max-md:flex-wrap max-md:gap-2">
                                    {/* Filter Dropdown */}
                                    <div className="relative">
                                        <select
                                            value={tableTimeFilter}
                                            onChange={(e) => setTableTimeFilter(e.target.value)}
                                            className="px-3 py-1.5 pr-8 rounded-lg text-xs font-medium bg-white border border-gray-300 text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none cursor-pointer"
                                        >
                                            <option value="all">All Time</option>
                                            <option value="lastMonth">Last 30 Days</option>
                                            <option value="last3Months">Last 90 Days</option>
                                        </select>
                                        <svg className="absolute right-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-black pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>

                                    {/* Export Button - only show if user has export permission */}
                                    {canExport && (
                                        <button
                                            onClick={exportToExcel}
                                            className="export-btn px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5 text-xs whitespace-nowrap"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                                            </svg>
                                            Export
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="relative">
                    {/* Top scrollbar */}
                    <div
                        ref={topScrollRef}
                        className="overflow-x-auto overflow-y-hidden mb-0.5 custom-scrollbar-top hidden sm:block"
                        style={{ direction: 'ltr' }}
                        onScroll={handleTopScroll}
                    >
                        <div className="h-2" style={{ width: tableScrollWidth }}></div>
                    </div>

                    {/* Main table container */}
                    <div
                        ref={bottomScrollRef}
                        className="overflow-x-auto max-h-[500px] overflow-y-auto"
                        style={{ direction: 'ltr', WebkitOverflowScrolling: 'touch' }}
                        onScroll={handleBottomScroll}
                    >
                        <table className="min-w-[1200px] sm:min-w-full divide-y divide-gray-200 border-collapse" ref={tableRef}>
                            <thead className="bg-gray-50 sticky top-0 z-10">
                                <tr>
                                    <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300 bg-gray-50 w-[50px]">S.NO</th>
                                    <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300 bg-gray-50 w-[90px]">Date</th>
                                    <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300 bg-gray-50 w-[220px]">
                                        <div>Drive</div>
                                        <div>Name</div>
                                    </th>
                                    <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300 bg-gray-50 w-[100px]">
                                        <div>Start Time</div>
                                    </th>
                                    <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300 bg-gray-50 w-[100px]">
                                        <div>End Time</div>
                                    </th>
                                    <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300 bg-gray-50 w-[100px]">
                                        <div>Working</div>
                                        <div>Hours</div>
                                    </th>
                                    <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300 bg-gray-50 w-[60px]">Total Calls</th>
                                    <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300 bg-gray-50 w-[150px]">
                                        <div>By Call</div>
                                        <div>(C/W/R/F/NC)</div>
                                    </th>
                                    <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300 bg-gray-50 w-[170px]">
                                        <div>By WhatsApp</div>
                                        <div>(C/W/R/F/NC)</div>
                                    </th>
                                    <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300 bg-gray-50 w-[150px]">
                                        <div>By Email</div>
                                        <div>(C/W/R/F/NC)</div>
                                    </th>
                                    <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300 bg-gray-50 w-[150px]">
                                        <div>By Visit</div>
                                        <div>(C/W/R/F/NC)</div>
                                    </th>
                                    <th className="px-2 py-1 text-center text-[11px] font-semibold text-black uppercase tracking-wider border border-gray-300 bg-gray-50 w-[90px]">
                                        <div>QT</div>
                                        <div>Sent</div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {filteredDailyPerformance.length > 0 ? (
                                    filteredDailyPerformance.map((day, index) => (
                                        <tr key={index} className="hover:bg-gray-50 transition-colors duration-150">
                                            <td className="px-2 py-1 whitespace-nowrap text-[11px] text-black border border-gray-200 text-center">{index + 1}</td>
                                            <td
                                                onClick={() => handleOpenDateFollowups(day.date)}
                                                title="Click to view all drive + non-drive follow-ups on this date"
                                                className="px-2 py-1 whitespace-nowrap text-[11px] font-medium border border-gray-200 text-center cursor-pointer text-[#2f3192] hover:underline hover:bg-indigo-50"
                                            >
                                                {new Date(day.date).toLocaleDateString('en-IN', {
                                                    day: '2-digit',
                                                    month: 'short',
                                                    year: 'numeric'
                                                })}
                                            </td>
                                            <td className="px-2 py-1 text-[11px] text-black border border-gray-200 text-center align-middle">
                                                {day.campaign_name ? (
                                                    // One drive name per line (names come comma-separated)
                                                    String(day.campaign_name)
                                                        .split(',')
                                                        .map(s => s.trim())
                                                        .filter(Boolean)
                                                        .map((name, i, arr) => (
                                                            <span key={i} className="block whitespace-nowrap">
                                                                {name}{i < arr.length - 1 ? ',' : ''}
                                                            </span>
                                                        ))
                                                ) : (
                                                    <span className="block">N/A</span>
                                                )}
                                            </td>
                                            <td className="px-2 py-1 whitespace-nowrap text-[11px] text-black border border-gray-200 text-center">
                                                {day.first_followup_time ? convertUTCToIST(day.first_followup_time) : '-'}
                                            </td>
                                            <td className="px-2 py-1 whitespace-nowrap text-[11px] text-black border border-gray-200 text-center">
                                                {day.last_followup_time ? convertUTCToIST(day.last_followup_time) : '-'}
                                            </td>
                                            <td className="px-2 py-1 whitespace-nowrap text-[11px] border border-gray-200 text-center text-black">
                                                {formatWorkingHours(day.total_working_hours)}
                                            </td>
                                            <td className="px-2 py-1 whitespace-nowrap border border-gray-200 text-center">
                                                <div className="flex flex-col items-center gap-0.5">
                                                    <span className="px-1.5 py-0.5 text-[11px] font-medium rounded-full inline-block" style={{ backgroundColor: `${themeColor}15`, color: themeColor }}>
                                                        {day.total_followups || 0}
                                                    </span>
                                                    <span className="text-[10px] text-black hidden sm:block whitespace-nowrap">
                                                        (C-{(day.call_completed || 0) + (day.whatsapp_completed || 0) + (day.email_completed || 0) + (day.visit_completed || 0)},
                                                        W-{(day.call_wip || 0) + (day.whatsapp_wip || 0) + (day.email_wip || 0) + (day.visit_wip || 0)},
                                                        R-{(day.call_rejected || 0) + (day.whatsapp_rejected || 0) + (day.email_rejected || 0) + (day.visit_rejected || 0)},
                                                        F-{(day.call_rescheduled || 0) + (day.whatsapp_rescheduled || 0) + (day.email_rescheduled || 0) + (day.visit_rescheduled || 0)},
                                                        NC-{(day.call_not_connected || 0) + (day.whatsapp_not_connected || 0) + (day.email_not_connected || 0) + (day.visit_not_connected || 0)})
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-2 py-1 whitespace-nowrap text-[11px] border border-gray-200 text-center">
                                                <div className="flex flex-col items-center">
                                                    <span className="font-medium text-black">{day.followup_by_call || 0}</span>
                                                    <span className="text-[10px] text-black hidden sm:inline">
                                                        (C-{day.call_completed || 0}, W-{day.call_wip || 0}, R-{day.call_rejected || 0}, F-{day.call_rescheduled || 0}, NC-{day.call_not_connected || 0})
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-2 py-1 whitespace-nowrap text-[11px] border border-gray-200 text-center">
                                                <div className="flex flex-col items-center">
                                                    <span className="font-medium text-black">{day.followup_by_whatsapp || 0}</span>
                                                    <span className="text-[10px] text-black hidden sm:inline">
                                                        (C-{day.whatsapp_completed || 0}, W-{day.whatsapp_wip || 0}, R-{day.whatsapp_rejected || 0}, F-{day.whatsapp_rescheduled || 0}, NC-{day.whatsapp_not_connected || 0})
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-2 py-1 whitespace-nowrap text-[11px] border border-gray-200 text-center">
                                                <div className="flex flex-col items-center">
                                                    <span className="font-medium text-black">{day.followup_by_email || 0}</span>
                                                    <span className="text-[10px] text-black hidden sm:inline">
                                                        (C-{day.email_completed || 0}, W-{day.email_wip || 0}, R-{day.email_rejected || 0}, F-{day.email_rescheduled || 0}, NC-{day.email_not_connected || 0})
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-2 py-1 whitespace-nowrap text-[11px] border border-gray-200 text-center">
                                                <div className="flex flex-col items-center">
                                                    <span className="font-medium text-black">{day.followup_by_visit || 0}</span>
                                                    <span className="text-[10px] text-black hidden sm:inline">
                                                        (C-{day.visit_completed || 0}, W-{day.visit_wip || 0}, R-{day.visit_rejected || 0}, F-{day.visit_rescheduled || 0}, NC-{day.visit_not_connected || 0})
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-2 py-1 whitespace-nowrap text-[11px] border border-gray-200 text-center">
                                                <span
                                                    className="px-1.5 py-0.5 text-[11px] font-medium rounded-full inline-block"
                                                    style={{ backgroundColor: `${themeColor}15`, color: themeColor }}
                                                >
                                                    {getQuotationSentForDay(day.date)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="12" className="px-3 py-8 text-center text-xs text-gray-400 border border-gray-200">
                                            No daily performance data available for selected period
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            {filteredDailyPerformance.length > 0 && (
                                <tfoot className="bg-gray-100 border-t-2 border-gray-300 sticky bottom-0">
                                    <tr>
                                        <td className="px-2 py-1 whitespace-nowrap text-[11px] font-bold text-black border border-gray-300 bg-gray-100 text-center">-</td>
                                        <td className="px-2 py-1 whitespace-nowrap text-[11px] font-bold text-black border border-gray-300 bg-gray-100 text-center">TOTAL</td>
                                        <td className="px-2 py-1 whitespace-nowrap text-[11px] text-black border border-gray-300 bg-gray-100 text-center">-</td>
                                        <td className="px-2 py-1 whitespace-nowrap text-[11px] text-black border border-gray-300 bg-gray-100 text-center">-</td>
                                        <td className="px-2 py-1 whitespace-nowrap text-[11px] text-black border border-gray-300 bg-gray-100 text-center">-</td>
                                        <td className="px-2 py-1 whitespace-nowrap text-[11px] text-black border border-gray-300 bg-gray-100 text-center">-</td>
                                        <td className="px-2 py-1 border border-gray-300 bg-gray-100 text-center">
                                            <div className="flex flex-col items-center gap-0.5">
                                                <span className="px-1.5 py-0.5 text-[11px] font-bold rounded-full" style={{ backgroundColor: `${themeColor}25`, color: themeColor }}>
                                                    {dailyTotals.total_followups}
                                                </span>
                                                <span className="text-[10px] text-black hidden sm:block whitespace-nowrap">
                                                    (C-{dailyTotals.completed_all},
                                                    W-{dailyTotals.wip_all},
                                                    R-{dailyTotals.rejected_all},
                                                    F-{dailyTotals.rescheduled_all},
                                                    NC-{dailyTotals.not_connected_all})
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-2 py-1 whitespace-nowrap text-[11px] border border-gray-300 bg-gray-100 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className="font-bold text-black">
                                                    {dailyTotals.by_call}
                                                </span>
                                                <span className="text-[10px] text-black hidden sm:inline">
                                                    (C-{dailyTotals.call_completed},
                                                    W-{dailyTotals.call_wip},
                                                    R-{dailyTotals.call_rejected},
                                                    F-{dailyTotals.call_rescheduled},
                                                    NC-{dailyTotals.call_not_connected})
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-2 py-1 whitespace-nowrap text-[11px] border border-gray-300 bg-gray-100 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className="font-bold text-black">
                                                    {dailyTotals.by_whatsapp}
                                                </span>
                                                <span className="text-[10px] text-black hidden sm:inline">
                                                    (C-{dailyTotals.whatsapp_completed},
                                                    W-{dailyTotals.whatsapp_wip},
                                                    R-{dailyTotals.whatsapp_rejected},
                                                    F-{dailyTotals.whatsapp_rescheduled},
                                                    NC-{dailyTotals.whatsapp_not_connected})
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-2 py-1 whitespace-nowrap text-[11px] border border-gray-300 bg-gray-100 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className="font-bold text-black">
                                                    {dailyTotals.by_email}
                                                </span>
                                                <span className="text-[10px] text-black hidden sm:inline">
                                                    (C-{dailyTotals.email_completed},
                                                    W-{dailyTotals.email_wip},
                                                    R-{dailyTotals.email_rejected},
                                                    F-{dailyTotals.email_rescheduled},
                                                    NC-{dailyTotals.email_not_connected})
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-2 py-1 whitespace-nowrap text-[11px] border border-gray-300 bg-gray-100 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className="font-bold text-black">
                                                    {dailyTotals.by_visit}
                                                </span>
                                                <span className="text-[10px] text-black hidden sm:inline">
                                                    (C-{dailyTotals.visit_completed},
                                                    W-{dailyTotals.visit_wip},
                                                    R-{dailyTotals.visit_rejected},
                                                    F-{dailyTotals.visit_rescheduled},
                                                    NC-{dailyTotals.visit_not_connected})
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-2 py-1 whitespace-nowrap text-[11px] border border-gray-300 bg-gray-100 text-center">
                                            <span
                                                className="px-1.5 py-0.5 text-[11px] font-bold rounded-full"
                                                style={{ backgroundColor: `${themeColor}25`, color: themeColor }}
                                            >
                                                {dailyTotals.quotation_sent}
                                            </span>
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>

                {filteredDailyPerformance.length > 0 && (
                    <div className="px-3 sm:px-4 py-2 bg-gray-50 border-t border-gray-200 text-[11px] text-black flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1.5">
                        <span className="flex flex-wrap items-center justify-center gap-2">
                            <span className="flex items-center gap-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#2f3192]"></span>
                                <span className="text-[11px]">Call</span>
                            </span>
                            <span className="flex items-center gap-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#25D366]"></span>
                                <span className="text-[11px]">WhatsApp</span>
                            </span>
                            <span className="flex items-center gap-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#F5A623]"></span>
                                <span className="text-[11px]">Email</span>
                            </span>
                            <span className="flex items-center gap-0.5">
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: themeColor }}></span>
                                <span className="text-[11px]">Visit</span>
                            </span>
                            <span className="text-[10px] text-black hidden sm:inline">C=Completed, W=In Progress, R=Rejected, F=Followup, NC=Not Connected</span>
                        </span>
                        <span className="text-[10px] text-black text-center">
                            Showing {filteredDailyPerformance.length} of {dailyPerformance.length} total days
                        </span>
                    </div>
                )}
            </div>

            {/* Additional Performance Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
                {performance.recent_activities && performance.recent_activities.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
                        <h3 className="text-sm font-semibold text-black mb-3">Recent Activities</h3>
                        <div className="space-y-2.5">
                            {performance.recent_activities.slice(0, 5).map((activity, index) => (
                                <div key={index} className="flex items-center justify-between py-1.5 border-b border-gray-200">
                                    <div>
                                        <p className="text-xs font-medium text-black">{activity.activity_name}</p>
                                    </div>
                                    <span className="px-1.5 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: `${themeColor}20`, color: themeColor }}>
                                        {activity.count} times
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {performance.top_campaigns && performance.top_campaigns.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
                        <h3 className="text-sm font-semibold text-black mb-3">Top Performing Drives</h3>
                        <div className="space-y-2.5">
                            {performance.top_campaigns.map((campaign, index) => (
                                <div key={index} className="flex items-center justify-between py-1.5 border-b border-gray-200">
                                    <div>
                                        <p className="text-xs font-medium text-black">{campaign.campaign_name}</p>
                                        <p className="text-[11px] text-black">{campaign.service}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs font-bold" style={{ color: themeColor }}>{campaign.completed_count} completed</p>
                                        <p className="text-[11px] text-black">out of {campaign.total_followups}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {showCspModal && ReactDOM.createPortal(
                    <div className="fixed inset-0 backdrop-blur-sm bg-black/40 flex items-center justify-center z-[10000] p-3 max-md:px-2">
                        <div className="bg-white rounded-xl shadow-xl max-w-[95vw] w-full max-h-[92vh] overflow-hidden flex flex-col">
                            <div
                                className="px-4 py-3 border-b border-gray-200 flex flex-wrap justify-between items-center gap-2"
                                style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #2c4a6e 100%)` }}
                            >
                                <div className="max-w-[240px] max-sm:max-w-full flex-shrink-0">
                                    <h3 className="text-base font-semibold text-white">
                                        CSP Status {userData?.branch ? `— ${userData.branch}` : ''}
                                    </h3>
                                    <p className="text-[11px] text-white/80 mt-0.5">
                                        {cspData.total_instances} instance(s) • Showing {filteredCspRows.length} of {uniqueCspRows.length} row(s) • One row per instance (latest SR)
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 justify-end flex-1 min-w-0">
                                    {/* Date column selector for the range filter */}
                                    <select
                                        value={cspDateField}
                                        onChange={(e) => setCspDateField(e.target.value)}
                                        title="Choose which date the range filter applies to"
                                        className="border border-gray-300 rounded-md px-1.5 py-1 text-[11px] bg-white text-black cursor-pointer focus:outline-none"
                                    >
                                        {CSP_DATE_FIELDS.map(f => (
                                            <option key={f.key} value={f.key}>{f.label}</option>
                                        ))}
                                    </select>

                                    {/* Date range - From */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">From:</label>
                                        <input
                                            type="date"
                                            value={cspDueFromDate}
                                            onChange={(e) => {
                                                const newFrom = e.target.value;
                                                setCspDueFromDate(newFrom);
                                                if (cspDueToDate && newFrom && new Date(cspDueToDate) < new Date(newFrom)) {
                                                    setCspDueToDate('');
                                                }
                                            }}
                                            max={cspDueToDate || undefined}
                                            className="border border-gray-300 rounded-md px-2 py-1 text-[11px] bg-white text-black"
                                        />
                                    </div>

                                    {/* Due Date - To */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">To:</label>
                                        <input
                                            type="date"
                                            value={cspDueToDate}
                                            onChange={(e) => {
                                                const newTo = e.target.value;
                                                if (cspDueFromDate && newTo && new Date(newTo) < new Date(cspDueFromDate)) {
                                                    return;
                                                }
                                                setCspDueToDate(newTo);
                                            }}
                                            min={cspDueFromDate || undefined}
                                            className="border border-gray-300 rounded-md px-2 py-1 text-[11px] bg-white text-black"
                                        />
                                    </div>

                                    {(cspSearchTerm || cspDueFromDate || cspDueToDate || cspSegmentFilter !== 'all' || cspStatusFilter !== 'all' || cspDateField !== 'due') && (
                                        <button
                                            onClick={() => {
                                                setCspSearchTerm('');
                                                setCspDueFromDate('');
                                                setCspDueToDate('');
                                                setCspSegmentFilter('all');
                                                setCspStatusFilter('all');
                                                setCspDateField('due');
                                            }}
                                            className="px-2 py-1 text-[11px] text-white border border-white/40 rounded-md bg-white/10 hover:bg-white/20 flex items-center gap-1"
                                            title="Clear filters"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                            Clear
                                        </button>
                                    )}

                                    {/* Status filter — latest CSP follow-up status */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">Status:</label>
                                        <div className="relative">
                                            <select
                                                value={cspStatusFilter}
                                                onChange={(e) => setCspStatusFilter(e.target.value)}
                                                className="border border-gray-300 rounded-md pl-2 pr-6 py-1 text-[11px] bg-white text-black appearance-none cursor-pointer focus:outline-none"
                                            >
                                                <option value="all">All</option>
                                                <option value="wip">WIP</option>
                                                <option value="rescheduled">Followups</option>
                                                <option value="not_connected">NC</option>
                                                <option value="rejected">Rejected</option>
                                                <option value="completed">Completed</option>
                                            </select>
                                            <svg className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-black pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>

                                    {/* Segment filter */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">Segment:</label>
                                        <div className="relative">
                                            <select
                                                value={cspSegmentFilter}
                                                onChange={(e) => setCspSegmentFilter(e.target.value)}
                                                className="border border-gray-300 rounded-md pl-2 pr-6 py-1 text-[11px] bg-white text-black appearance-none cursor-pointer focus:outline-none"
                                            >
                                                <option value="all">All</option>
                                                {cspSegmentOptions.map(seg => (
                                                    <option key={seg} value={seg}>{seg}</option>
                                                ))}
                                            </select>
                                            <svg className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-black pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>

                                    {/* Search */}
                                    <input
                                        type="text"
                                        placeholder="Search instance, customer, SR..."
                                        value={cspSearchTerm}
                                        onChange={(e) => setCspSearchTerm(e.target.value)}
                                        className="border border-gray-300 rounded-lg px-2 py-1 text-xs w-40 max-md:w-full max-md:min-w-0 bg-white focus:outline-none"
                                    />

                                    <button
                                        onClick={() => setShowCspModal(false)}
                                        className="w-7 h-7 sm:w-8 sm:h-8 bg-white rounded-lg flex items-center justify-center transition-all duration-200 group flex-shrink-0"
                                    >
                                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black group-hover:rotate-90 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-auto p-3 max-h-[70vh]">
                                {loadingCsp ? (
                                    <div className="flex items-center justify-center py-10">
                                        <div className="w-8 h-8 border-2 border-t-2 border-t-[#2f3192] border-gray-200 rounded-full animate-spin"></div>
                                        <span className="ml-2 text-xs text-gray-600">Loading CSP data...</span>
                                    </div>
                                ) : filteredCspRows.length === 0 ? (
                                    <div className="text-center py-10 text-xs text-gray-500">
                                        {cspData.rows.length === 0
                                            ? 'No CSP data found for your branch.'
                                            : 'No CSP rows match the current filters.'}
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
                                        <table className="min-w-[1250px] w-full border-collapse text-[11px]">
                                            <thead className="bg-gray-100 sticky top-0 z-10">
                                                <tr>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">S.No</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Instance ID</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Customer</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Branch</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">GOEM/OEM</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">SR Number</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">SR Open Date</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">SR Subtype</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">SR Status</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Segment</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Due Date</th>
                                                    <th
                                                        className="px-2 py-0 border border-gray-300 text-center font-semibold text-black bg-gray-100 cursor-pointer select-none hover:bg-gray-200"
                                                        onClick={() => setCspDaysSort(s => s === 'desc' ? 'asc' : 'desc')}
                                                    >
                                                        <div className="flex items-center justify-center gap-1">
                                                            <div className="flex flex-col items-center">
                                                                <span>Due/Overdue</span>
                                                                <span>Days</span>
                                                            </div>
                                                            <div className="flex flex-col items-center leading-none">
                                                                <span className={cspDaysSort === 'asc' ? 'text-black' : 'text-gray-300'}>▲</span>
                                                                <span className={cspDaysSort === 'desc' ? 'text-black' : 'text-gray-300'}>▼</span>
                                                            </div>
                                                        </div>
                                                    </th>
                                                    {CSP_FU_HEADERS.map(h => (
                                                        <th key={h} className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {sortedCspRows.map((row, idx) => {
                                                    const dueDate = getCspDueDate(row);
                                                    const dp = getCspDaysPass(row);
                                                    return (
                                                        <tr
                                                            key={idx}
                                                            className={`transition-colors ${dp > 0 ? 'bg-orange-300 hover:bg-orange-400' : 'hover:bg-gray-200'}`}
                                                        >
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{idx + 1}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">
                                                                {row.instance_id ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleOpenCustomerFromCsp(row)}
                                                                        className="font-medium text-[#2f3192] underline hover:text-[#1f2061] hover:font-bold cursor-pointer" title="Click to open customer details"
                                                                    >
                                                                        {highlightMatch(row.instance_id, cspSearchTerm)}
                                                                    </button>
                                                                ) : '-'}
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left" title={row.customer_name || ''}>
                                                                <div className="max-w-[180px] truncate">{row.customer_name ? highlightMatch(row.customer_name, cspSearchTerm) : '-'}</div>
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{row.branch_id ? highlightMatch(row.branch_id, cspSearchTerm) : '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center" title={row.goem_oem || ''}>
                                                                <div className="max-w-[160px] truncate mx-auto">{row.goem_oem ? highlightMatch(row.goem_oem, cspSearchTerm) : '-'}</div>
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{row.sr_number ? highlightMatch(row.sr_number, cspSearchTerm) : '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{row.sr_open_date || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{row.sr_subtype || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{row.sr_status || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{row.segment ? highlightMatch(row.segment, cspSearchTerm) : '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center font-bold whitespace-nowrap" style={{ backgroundColor: dp > 0 ? 'transparent' : (dueDate ? '#ffdb62' : 'transparent') }}>
                                                                {fmtCspDueDate(dueDate)}
                                                            </td>
                                                            <td
                                                                className="px-2 py-1 border border-gray-200 text-center font-semibold whitespace-nowrap"
                                                                style={{ color: dp === null ? '#6b7280' : dp > 0 ? '#dc2626' : '#16a34a' }}
                                                            >
                                                                {dp === null ? '-' : dp > 0 ? `${dp} overdue` : dp === 0 ? 'Due today' : `${Math.abs(dp)} left`}
                                                            </td>
                                                            {/* Latest CSP-drive followup — bg-white keeps these cells
                                                                out of the due-date row coloring */}
                                                            <td className="px-2 py-1 border border-gray-200 text-center bg-white whitespace-nowrap">{fmtFuDate(row.fu_date)}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center bg-white" title={row.fu_drive || ''}>
                                                                <div className="max-w-[140px] truncate mx-auto">{row.fu_drive || '-'}</div>
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center bg-white">{row.fu_subtype || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center bg-white capitalize">{row.fu_by || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center bg-white">{row.fu_flag || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center bg-white">{row.fu_status ? statusLabel(row.fu_status) : '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center bg-white whitespace-nowrap">{fmtFuDate(row.fu_next_date)}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left bg-white" title={row.fu_activity || ''}>
                                                                <div className="max-w-[150px] truncate">{row.fu_activity || '-'}</div>
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left bg-white" title={row.fu_reject_reason || ''}>
                                                                <div className="max-w-[150px] truncate">{row.fu_reject_reason || '-'}</div>
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left bg-white" title={row.fu_remark || ''}>
                                                                <div className="max-w-[160px] truncate">{row.fu_remark || '-'}</div>
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center bg-white">{row.fu_quote_sent ? 'Yes' : '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center bg-white">{row.fu_quote_no || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center bg-white whitespace-nowrap">{(row.fu_quote_value ?? null) !== null ? row.fu_quote_value.toLocaleString('en-IN') : '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center bg-white whitespace-nowrap">{fmtFuDate(row.csp_last_letter_date)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex justify-end">
                                <button
                                    onClick={() => setShowCspModal(false)}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-white text-black"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {showOpenCspModal && ReactDOM.createPortal(
                    <div className="fixed inset-0 backdrop-blur-sm bg-black/40 flex items-center justify-center z-[10000] p-3 max-md:px-2">
                        <div className="bg-white rounded-xl shadow-xl max-w-[95vw] w-full max-h-[92vh] overflow-hidden flex flex-col">
                            <div
                                className="px-4 py-3 border-b border-gray-200 flex flex-wrap justify-between items-center gap-2"
                                style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #2c4a6e 100%)` }}
                            >
                                <div className="max-w-[240px] max-sm:max-w-full flex-shrink-0">
                                    <h3 className="text-base font-semibold text-white">
                                        Open CSP Status {userData?.branch ? `— ${userData.branch}` : ''}
                                    </h3>
                                    <p className="text-[11px] text-white/80 mt-0.5">
                                        {openCspInstanceCount} open instance(s) • Showing {filteredOpenCspRows.length} of {openCspRows.length} open row(s)
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 justify-end flex-1 min-w-0">
                                    {/* Date column selector for the range filter */}
                                    <select
                                        value={openCspDateField}
                                        onChange={(e) => setOpenCspDateField(e.target.value)}
                                        title="Choose which date the range filter applies to"
                                        className="border border-gray-300 rounded-md px-1.5 py-1 text-[11px] bg-white text-black cursor-pointer focus:outline-none"
                                    >
                                        {CSP_DATE_FIELDS.map(f => (
                                            <option key={f.key} value={f.key}>{f.label}</option>
                                        ))}
                                    </select>

                                    {/* Date range - From */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">From:</label>
                                        <input
                                            type="date"
                                            value={openCspDueFromDate}
                                            onChange={(e) => {
                                                const newFrom = e.target.value;
                                                setOpenCspDueFromDate(newFrom);
                                                if (openCspDueToDate && newFrom && new Date(openCspDueToDate) < new Date(newFrom)) {
                                                    setOpenCspDueToDate('');
                                                }
                                            }}
                                            max={openCspDueToDate || undefined}
                                            className="border border-gray-300 rounded-md px-2 py-1 text-[11px] bg-white text-black"
                                        />
                                    </div>

                                    {/* Due Date - To */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">To:</label>
                                        <input
                                            type="date"
                                            value={openCspDueToDate}
                                            onChange={(e) => {
                                                const newTo = e.target.value;
                                                if (openCspDueFromDate && newTo && new Date(newTo) < new Date(openCspDueFromDate)) {
                                                    return;
                                                }
                                                setOpenCspDueToDate(newTo);
                                            }}
                                            min={openCspDueFromDate || undefined}
                                            className="border border-gray-300 rounded-md px-2 py-1 text-[11px] bg-white text-black"
                                        />
                                    </div>

                                    {/* Status filter — latest CSP follow-up status */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">Status:</label>
                                        <div className="relative">
                                            <select
                                                value={openCspStatusFilter}
                                                onChange={(e) => setOpenCspStatusFilter(e.target.value)}
                                                className="border border-gray-300 rounded-md pl-2 pr-6 py-1 text-[11px] bg-white text-black appearance-none cursor-pointer focus:outline-none"
                                            >
                                                {/* Completed/Rejected rows are excluded from this box entirely */}
                                                <option value="all">All</option>
                                                <option value="wip">WIP</option>
                                                <option value="rescheduled">Followups</option>
                                                <option value="not_connected">NC</option>
                                            </select>
                                            <svg className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-black pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>

                                    {/* Segment filter */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">Segment:</label>
                                        <div className="relative">
                                            <select
                                                value={openCspSegmentFilter}
                                                onChange={(e) => setOpenCspSegmentFilter(e.target.value)}
                                                className="border border-gray-300 rounded-md pl-2 pr-6 py-1 text-[11px] bg-white text-black appearance-none cursor-pointer focus:outline-none"
                                            >
                                                <option value="all">All</option>
                                                {cspSegmentOptions.map(seg => (
                                                    <option key={seg} value={seg}>{seg}</option>
                                                ))}
                                            </select>
                                            <svg className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-black pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>

                                    {/* Clear filters */}
                                    {(openCspSearchTerm || openCspDueFromDate || openCspDueToDate || openCspSegmentFilter !== 'all' || openCspStatusFilter !== 'all' || openCspDateField !== 'due') && (
                                        <button
                                            onClick={() => {
                                                setOpenCspSearchTerm('');
                                                setOpenCspDueFromDate('');
                                                setOpenCspDueToDate('');
                                                setOpenCspSegmentFilter('all');
                                                setOpenCspStatusFilter('all');
                                                setOpenCspDateField('due');
                                            }}
                                            className="px-2 py-1 text-[11px] text-white border border-white/40 rounded-md bg-white/10 hover:bg-white/20 flex items-center gap-1"
                                            title="Clear filters"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                            Clear
                                        </button>
                                    )}

                                    {/* Search */}
                                    <input
                                        type="text"
                                        placeholder="Search instance, customer, SR..."
                                        value={openCspSearchTerm}
                                        onChange={(e) => setOpenCspSearchTerm(e.target.value)}
                                        className="border border-gray-300 rounded-lg px-2 py-1 text-xs w-40 max-md:w-full max-md:min-w-0 bg-white focus:outline-none"
                                    />

                                    <button
                                        onClick={() => setShowOpenCspModal(false)}
                                        className="w-7 h-7 sm:w-8 sm:h-8 bg-white rounded-lg flex items-center justify-center transition-all duration-200 group flex-shrink-0"
                                    >
                                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black group-hover:rotate-90 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-auto p-3 max-h-[70vh]">
                                {loadingCsp ? (
                                    <div className="flex items-center justify-center py-10">
                                        <div className="w-8 h-8 border-2 border-t-2 border-t-[#2f3192] border-gray-200 rounded-full animate-spin"></div>
                                        <span className="ml-2 text-xs text-gray-600">Loading CSP data...</span>
                                    </div>
                                ) : filteredOpenCspRows.length === 0 ? (
                                    <div className="text-center py-10 text-xs text-gray-500">
                                        {openCspRows.length === 0
                                            ? 'No open SR CSP records found for your branch.'
                                            : 'No open CSP rows match the current filters.'}
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
                                        <table className="min-w-[1250px] w-full border-collapse text-[11px]">
                                            <thead className="bg-gray-100 sticky top-0 z-10">
                                                <tr>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">S.No</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Instance ID</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Customer</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Branch</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">GOEM/OEM</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">SR Number</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">SR Open Date</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">SR Subtype</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">SR Status</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Segment</th>
                                                    <th className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Due Date</th>
                                                    <th
                                                        className="px-2 py-0 border border-gray-300 text-center font-semibold text-black bg-gray-100 cursor-pointer select-none hover:bg-gray-200"
                                                        onClick={() => setOpenCspDaysSort(s => s === 'desc' ? 'asc' : 'desc')}
                                                    >
                                                        <div className="flex items-center justify-center gap-1">
                                                            <div className="flex flex-col items-center">
                                                                <span>Due/Overdue</span>
                                                                <span>Days</span>
                                                            </div>
                                                            <div className="flex flex-col items-center leading-none">
                                                                <span className={openCspDaysSort === 'asc' ? 'text-black' : 'text-gray-300'}>▲</span>
                                                                <span className={openCspDaysSort === 'desc' ? 'text-black' : 'text-gray-300'}>▼</span>
                                                            </div>
                                                        </div>
                                                    </th>
                                                    {CSP_FU_HEADERS.map(h => (
                                                        <th key={h} className="px-2 py-0 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {sortedOpenCspRows.map((row, idx) => {
                                                    const dueDate = getCspDueDate(row);
                                                    const dp = getCspDaysPass(row);
                                                    return (
                                                        <tr key={idx} className={`transition-colors ${dp > 0 ? 'bg-orange-300 hover:bg-orange-400' : 'hover:bg-gray-50'}`}>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{idx + 1}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">
                                                                {row.instance_id ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleOpenCustomerFromCsp(row)}
                                                                        className="font-medium text-[#2f3192] underline hover:text-[#1f2061] hover:font-bold cursor-pointer"
                                                                        title="Click to open customer details"
                                                                    >
                                                                        {highlightMatch(row.instance_id, openCspSearchTerm)}
                                                                    </button>
                                                                ) : '-'}
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left" title={row.customer_name || ''}>
                                                                <div className="max-w-[180px] truncate">{row.customer_name ? highlightMatch(row.customer_name, openCspSearchTerm) : '-'}</div>
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{row.branch_id ? highlightMatch(row.branch_id, openCspSearchTerm) : '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center" title={row.goem_oem || ''}>
                                                                <div className="max-w-[160px] truncate mx-auto">{row.goem_oem ? highlightMatch(row.goem_oem, openCspSearchTerm) : '-'}</div>
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{row.sr_number ? highlightMatch(row.sr_number, openCspSearchTerm) : '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{row.sr_open_date || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{row.sr_subtype || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{row.sr_status || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{row.segment ? highlightMatch(row.segment, openCspSearchTerm) : '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center font-bold whitespace-nowrap" style={{ backgroundColor: dp > 0 ? 'transparent' : (dueDate ? '#ffdb62' : 'transparent') }}>
                                                                {fmtCspDueDate(dueDate)}
                                                            </td>
                                                            <td
                                                                className="px-2 py-1 border border-gray-200 text-center font-semibold whitespace-nowrap"
                                                                style={{ color: dp === null ? '#6b7280' : dp > 0 ? '#dc2626' : '#16a34a' }}
                                                            >
                                                                {dp === null ? '-' : dp > 0 ? `${dp} overdue` : dp === 0 ? 'Due today' : `${Math.abs(dp)} left`}
                                                            </td>
                                                            {/* Latest CSP-drive followup — bg-white keeps these cells
                                                                out of the due-date row coloring */}
                                                            <td className="px-2 py-1 border border-gray-200 text-center bg-white whitespace-nowrap">{fmtFuDate(row.fu_date)}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center bg-white" title={row.fu_drive || ''}>
                                                                <div className="max-w-[140px] truncate mx-auto">{row.fu_drive || '-'}</div>
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center bg-white">{row.fu_subtype || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center bg-white capitalize">{row.fu_by || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center bg-white">{row.fu_flag || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center bg-white">{row.fu_status ? statusLabel(row.fu_status) : '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center bg-white whitespace-nowrap">{fmtFuDate(row.fu_next_date)}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left bg-white" title={row.fu_activity || ''}>
                                                                <div className="max-w-[150px] truncate">{row.fu_activity || '-'}</div>
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left bg-white" title={row.fu_reject_reason || ''}>
                                                                <div className="max-w-[150px] truncate">{row.fu_reject_reason || '-'}</div>
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left bg-white" title={row.fu_remark || ''}>
                                                                <div className="max-w-[160px] truncate">{row.fu_remark || '-'}</div>
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center bg-white">{row.fu_quote_sent ? 'Yes' : '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center bg-white">{row.fu_quote_no || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center bg-white whitespace-nowrap">{(row.fu_quote_value ?? null) !== null ? row.fu_quote_value.toLocaleString('en-IN') : '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center bg-white whitespace-nowrap">{fmtFuDate(row.csp_last_letter_date)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex justify-between items-center gap-2 flex-wrap">
                                <p className="text-[11px] text-gray-500">
                                    Note: one row per instance (latest SR) • records whose follow-up status is Completed or Rejected are not shown
                                </p>
                                <button
                                    onClick={() => setShowOpenCspModal(false)}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-white text-black"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {showAllFollowupsModal && ReactDOM.createPortal(
                    <div className="fixed inset-0 backdrop-blur-sm bg-black/40 flex items-center justify-center z-[10000] p-3 max-md:px-2">
                        <div className="bg-white rounded-xl shadow-xl max-w-7xl w-full max-h-[92vh] max-lg:w-[95vw] max-lg:max-w-[95vw] max-lg:max-h-[90vh] overflow-hidden flex flex-col">
                            {/* Header — themed gradient like BranchCustomersModal */}
                            <div
                                className="px-4 py-3 border-b border-gray-200 flex justify-between items-center max-lg:flex-wrap max-lg:gap-2 max-md:px-2"
                                style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #2c4a6e 100%)` }}
                            >
                                <div>
                                    <h3 className="text-base font-semibold text-white">
                                        {statusLocked
                                            ? `${lockedStatusLabel} Follow-ups`
                                            : dateViewActive
                                            ? `Daily Follow-ups (Drive + Non-Drive) — ${createdFromDate ? new Date(createdFromDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}`
                                            : quotationFilterActive
                                                ? 'Quotation Follow-ups'
                                                : quotationSentFilterActive
                                                    ? 'Quotation Sent Customers'
                                                    : cspQuotationFilterActive
                                                        ? 'CSP Quotation Follow-ups'
                                                        : cspQuotationSentFilterActive
                                                            ? 'CSP Quotation Sent Customers'
                                                            : 'All Follow-ups'} by {userData?.name || 'User'}
                                    </h3>
                                    <p className="text-[11px] text-white/80 mt-0.5">
                                        {getDateRangeText()} • Total: {displayedFollowups.length} {followupView === 'unique' ? 'unique ' : followupView === 'unique_drive' ? 'unique drive ' : ''}follow-up(s)
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 max-lg:flex-wrap">
                                    {/* Created At range — hidden in the per-date view (the clicked
                                        Daily Breakdown date locks the range to that one day) */}
                                    {!dateViewActive && (
                                        <>
                                            {/* Created At - From */}
                                            <div className="flex items-center gap-1">
                                                <label className="text-[11px] text-white whitespace-nowrap">Created From:</label>
                                                <input
                                                    type="date"
                                                    value={createdFromDate}
                                                    onChange={(e) => {
                                                        const newFrom = e.target.value;
                                                        setCreatedFromDate(newFrom);
                                                        if (createdToDate && newFrom && new Date(createdToDate) < new Date(newFrom)) {
                                                            setCreatedToDate('');
                                                        }
                                                    }}
                                                    max={createdToDate || undefined}
                                                    className="border border-gray-300 rounded-md px-2 py-1 text-[11px] bg-white text-black"
                                                />
                                            </div>

                                            {/* Created At - To */}
                                            <div className="flex items-center gap-1">
                                                <label className="text-[11px] text-white whitespace-nowrap">To:</label>
                                                <input
                                                    type="date"
                                                    value={createdToDate}
                                                    onChange={(e) => {
                                                        const newTo = e.target.value;
                                                        if (createdFromDate && newTo && new Date(newTo) < new Date(createdFromDate)) {
                                                            return;
                                                        }
                                                        setCreatedToDate(newTo);
                                                    }}
                                                    min={createdFromDate || undefined}
                                                    className="border border-gray-300 rounded-md px-2 py-1 text-[11px] bg-white text-black"
                                                />
                                            </div>
                                        </>
                                    )}
                                    {!quotationSentFilterActive && !statusLocked && (
                                        <div className="flex items-center gap-1">
                                            <label className="text-[11px] text-white whitespace-nowrap">Status:</label>
                                            <div className="relative">
                                                <select
                                                    value={statusFilter}
                                                    onChange={(e) => setStatusFilter(e.target.value)}
                                                    className="border border-gray-300 rounded-md pl-2 pr-6 py-1 text-[11px] bg-white text-black appearance-none cursor-pointer focus:outline-none"
                                                >
                                                    <option value="all">All</option>
                                                    <option value="completed">Completed</option>
                                                    <option value="wip">WIP</option>
                                                    <option value="rejected">Rejected</option>
                                                    <option value="rescheduled">Followups</option>
                                                    <option value="not_connected">NC (Not Connected)</option>
                                                </select>
                                                <svg
                                                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-black pointer-events-none"
                                                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </div>
                                        </div>
                                    )}

                                    {/* View dropdown — All / Unique (latest per Instance ID) / Unique with Drive (latest per Drive + Instance ID) */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">
                                            View{followupView !== 'all' ? ` (${displayedFollowups.length})` : ''}:
                                        </label>
                                        <div className="relative">
                                            <select
                                                value={followupView}
                                                onChange={(e) => setFollowupView(e.target.value)}
                                                title="All • Unique (latest per Instance ID) • Unique with Drive (latest per Drive + Instance ID)"
                                                className="border border-gray-300 rounded-md pl-2 pr-6 py-1 text-[11px] bg-white text-black appearance-none cursor-pointer focus:outline-none"
                                            >
                                                <option value="all">All</option>
                                                <option value="unique">Unique</option>
                                                <option value="unique_drive">Unique with Drive</option>
                                            </select>
                                            <svg className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-black pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>

                                    {/* Search */}
                                    <input
                                        type="text"
                                        placeholder="Search customer, drive, remark..."
                                        value={followupSearchTerm}
                                        onChange={(e) => setFollowupSearchTerm(e.target.value)}
                                        className="border border-gray-300 rounded-lg px-2 py-1 text-xs w-64 max-md:w-full max-md:min-w-0 bg-white focus:outline-none"
                                    />

                                    {/* Clear filters — status resets only when its dropdown is
                                        visible (a status card locks it as the report's subject) */}
                                    {(followupSearchTerm || (!dateViewActive && (createdFromDate || createdToDate))
                                        || (!quotationSentFilterActive && !statusLocked && statusFilter !== 'all')) && (
                                        <button
                                            onClick={() => {
                                                setFollowupSearchTerm('');
                                                // per-date view: the clicked day stays locked — Clear
                                                // only resets search / status there
                                                if (!dateViewActive) {
                                                    setCreatedFromDate('');
                                                    setCreatedToDate('');
                                                }
                                                if (!quotationSentFilterActive && !statusLocked) setStatusFilter('all');
                                            }}
                                            className="px-2 py-1 text-[11px] text-white border border-white/40 rounded-md bg-white/10 hover:bg-white/20 flex items-center gap-1"
                                            title="Clear filters"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                            Clear
                                        </button>
                                    )}

                                    {/* Export — permission-gated, exports only the filtered rows */}
                                    {canExport && (
                                        <button
                                            onClick={exportFollowupsToExcel}
                                            className="export-btn px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5 text-xs whitespace-nowrap"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                                            </svg>
                                            Export
                                        </button>
                                    )}

                                    {/* Close button — white square like BranchCustomersModal */}
                                    <button
                                        onClick={() => setShowAllFollowupsModal(false)}
                                        className="w-7 h-7 sm:w-8 sm:h-8 bg-white rounded-lg flex items-center justify-center transition-all duration-200 group flex-shrink-0"
                                    >
                                        <svg
                                            className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black group-hover:rotate-90 transition-transform duration-200"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* Body */}
                            <div className="flex-1 overflow-auto p-3 max-h-[70vh]">
                                {loadingAllFollowups ? (
                                    <div className="flex items-center justify-center py-10">
                                        <div className="w-8 h-8 border-2 border-t-2 border-t-[#2f3192] border-gray-200 rounded-full animate-spin"></div>
                                        <span className="ml-2 text-xs text-gray-600">Loading follow-ups...</span>
                                    </div>
                                ) : allFollowupsData.length === 0 ? (
                                    <div className="text-center py-10 text-xs text-gray-500">
                                        No follow-ups found for the selected time period.
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto overflow-y-auto max-h-[60vh]" onScroll={handleFollowupTableScroll}>
                                        <table className="min-w-[2000px] w-full border-collapse text-[11px]">
                                            <thead className="bg-gray-100 sticky top-0 z-10">
                                                <tr>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">S.No</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Follow-up Date</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Instance ID</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Customer Name</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Phone</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Email</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Branch</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Drive</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Service</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Subtype</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Follow-up By</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Flag</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Status</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Next Follow-up</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Activity</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Reject Reason</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Remark</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Quote Sent</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Quote No.</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Quote Value</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Created At</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {renderedFollowups
                                                    .map((fu, idx) => (
                                                        <tr
                                                            key={fu.id}
                                                            className="hover:bg-blue-50 cursor-pointer transition-colors"
                                                            onDoubleClick={() => handleOpenCustomerFromFollowup(fu)}
                                                            title="Double-click to open customer details"
                                                        >
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{idx + 1}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center whitespace-nowrap">
                                                                {fu.followup_date ? new Date(fu.followup_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{fu.customer_instance_id ? highlightMatch(fu.customer_instance_id, debouncedSearch) : '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left">{fu.customer_name ? highlightMatch(fu.customer_name, debouncedSearch) : '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{fu.phone_number ? highlightMatch(fu.phone_number, debouncedSearch) : '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left">{fu.email ? highlightMatch(fu.email, debouncedSearch) : '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{fu.branch_id || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left">{fu.campaign_name ? highlightMatch(fu.campaign_name, debouncedSearch) : '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left">{fu.campaign_service || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{fu.csp_subtype || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center capitalize">{fu.followup_by || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">
                                                                {fu.followup_flag ? (
                                                                    <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">{fu.followup_flag}</span>
                                                                ) : '-'}
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center capitalize">
                                                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${fu.status === 'completed' ? 'bg-green-100 text-green-700' :
                                                                    fu.status === 'wip' ? 'bg-yellow-100 text-yellow-700' :
                                                                        fu.status === 'rejected' ? 'bg-rose-100 text-rose-800' :
                                                                            fu.status === 'rescheduled' ? 'bg-purple-100 text-purple-700' :
                                                                                'bg-gray-100 text-gray-700'
                                                                    }`}>
                                                                    {statusLabel(fu.status)}
                                                                </span>
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center whitespace-nowrap">
                                                                {fu.next_followup_date ? new Date(fu.next_followup_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left max-w-[200px] truncate" title={fu.activity_content || ''}>{fu.activity_content || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left max-w-[200px] truncate" title={fu.rr_content || ''}>{fu.rr_content || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left max-w-[250px] truncate" title={fu.followup_remark || ''}>{fu.followup_remark ? highlightMatch(fu.followup_remark, debouncedSearch) : '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">
                                                                {fu.quotation_sent ? <span className="text-green-600 font-semibold">Yes</span> : <span className="text-gray-500">No</span>}
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{fu.quotation_no || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-right">
                                                                {fu.quotation_value ? `₹${parseFloat(fu.quotation_value).toLocaleString('en-IN')}` : '-'}
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center whitespace-nowrap">
                                                                {fu.created_at ? new Date(fu.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex justify-end">
                                <button
                                    onClick={() => setShowAllFollowupsModal(false)}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-white text-black"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {showCancelledCspModal && ReactDOM.createPortal(
                    <div className="fixed inset-0 backdrop-blur-sm bg-black/40 flex items-center justify-center z-[10000] p-3 max-md:px-2">
                        <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden flex flex-col">
                            <div
                                className="px-4 py-3 border-b border-gray-200 flex justify-between items-center"
                                style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #2c4a6e 100%)` }}
                            >
                                <h3 className="text-base font-semibold text-white">
                                    Letter For Warranty Lapse
                                </h3>
                                <button
                                    onClick={() => setShowCancelledCspModal(false)}
                                    className="w-7 h-7 sm:w-8 sm:h-8 bg-white rounded-lg flex items-center justify-center transition-all duration-200 group flex-shrink-0"
                                >
                                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black group-hover:rotate-90 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                                <svg className="w-12 h-12 mb-3" fill="none" stroke={themeColor} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <p className="text-sm font-semibold text-black">Coming soon...</p>
                                <p className="text-xs text-gray-500 mt-1">This feature is under development.</p>
                            </div>

                            <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex justify-end">
                                <button
                                    onClick={() => setShowCancelledCspModal(false)}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-white text-black"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {showAddSrModal && ReactDOM.createPortal(
                    <div className="fixed inset-0 backdrop-blur-sm bg-black/40 flex items-center justify-center z-[10000] p-3 max-md:px-2">
                        <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[88vh] overflow-hidden flex flex-col">
                            <div className="px-3 py-2 border-b border-gray-200 flex justify-between items-center"
                                style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #2c4a6e 100%)` }}>
                                <div>
                                    <h3 className="text-sm font-semibold text-white">Add SR to CSP Drive</h3>
                                    <p className="text-[10px] text-white/80">
                                        You have added {userCspSrCount} SR so far
                                    </p>
                                </div>
                                <button onClick={() => setShowAddSrModal(false)}
                                    className="w-7 h-7 bg-white rounded-md flex items-center justify-center group flex-shrink-0">
                                    <svg className="w-3.5 h-3.5 text-black group-hover:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div className="flex-1 overflow-auto p-3 space-y-2">
                                <div>

                                    {openCspCampaigns.length === 0 ? (
                                        <p className="text-[11px] text-red-600">No active CSP drives available.</p>
                                    ) : (
                                        <select
                                            value={selectedCspCampaignId}
                                            onChange={(e) => setSelectedCspCampaignId(e.target.value)}
                                            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm bg-white text-black"
                                        >
                                            <option value="">Select a drive…</option>
                                            {openCspCampaigns.map(c => (
                                                <option key={c.id} value={c.id}>
                                                    {c.name} - {c.asset_count} assets
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-sm:grid-cols-1">
                                    <div>
                                        <label className="block text-[11px] font-semibold text-black mb-0.5">Asset No. (Instance ID) *</label>
                                        <input type="text" value={srForm.asset_number}
                                            onChange={(e) => setSrForm({ ...srForm, asset_number: e.target.value })}
                                            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm bg-white text-black" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-black mb-0.5">Branch Code</label>
                                        <input type="text" value={srForm.branch_id} readOnly disabled
                                            placeholder="Auto-filled from Asset No."
                                            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm bg-gray-100 text-black cursor-not-allowed" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-black mb-0.5">GOEM / OEM</label>
                                        <input type="text" value={srForm.goem_oem} readOnly disabled
                                            placeholder="Auto-filled from Asset No."
                                            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm bg-gray-100 text-black cursor-not-allowed" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-black mb-0.5">SR Number *</label>
                                        <input type="text" value={srForm.sr_number}
                                            onChange={(e) => setSrForm({ ...srForm, sr_number: e.target.value })}
                                            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm bg-white text-black" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-black mb-0.5">SR Open Date</label>
                                        <input type="date" value={srForm.sr_open_date}
                                            onChange={(e) => setSrForm({ ...srForm, sr_open_date: e.target.value })}
                                            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm bg-white text-black" />
                                    </div>

                                    {/* SR Type — locked to CSP, non-editable */}
                                    <div>
                                        <label className="block text-[11px] font-semibold text-black mb-0.5">SR Type</label>
                                        <input type="text" value="CSP" readOnly disabled
                                            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm bg-gray-100 text-black cursor-not-allowed" />
                                    </div>

                                    {/* SR Subtype — dropdown */}
                                    <div>
                                        <label className="block text-[11px] font-semibold text-black mb-0.5">SR Subtype</label>
                                        <select value={srForm.sr_subtype}
                                            onChange={(e) => setSrForm({ ...srForm, sr_subtype: e.target.value })}
                                            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm bg-white text-black">
                                            <option value="">Select…</option>
                                            <option value="A Check">A Check</option>
                                            <option value="B Check">B Check</option>
                                            <option value="C Check">C Check</option>
                                            <option value="D Check">D Check</option>
                                        </select>
                                    </div>

                                    {/* SR Status — default Open */}
                                    <div>
                                        <label className="block text-[11px] font-semibold text-black mb-0.5">
                                            SR Status
                                        </label>

                                        <input
                                            type="text"
                                            value="Open"
                                            readOnly
                                            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm bg-gray-100 text-black"
                                        />
                                    </div>

                                    {/* Segment — auto-filled from asset, non-editable */}
                                    <div>
                                        <label className="block text-[11px] font-semibold text-black mb-0.5">Segment</label>
                                        <input type="text" value={srForm.segment} readOnly disabled
                                            placeholder="Auto-filled from Asset No."
                                            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm bg-gray-100 text-black cursor-not-allowed" />
                                    </div>
                                </div>
                            </div>

                            <div className="px-3 py-2 border-t border-gray-200 bg-gray-50 flex justify-end gap-2 max-md:flex-wrap">
                                <button onClick={() => setShowAddSrModal(false)}
                                    className="px-3 py-1 border border-gray-300 rounded-md text-xs font-medium hover:bg-white text-black">
                                    Cancel
                                </button>
                                <button onClick={handleSubmitSr} disabled={addSrLoading || openCspCampaigns.length === 0}
                                    className="px-4 py-1 rounded-md text-xs font-medium text-white disabled:opacity-50"
                                    style={{ background: themeColor }}>
                                    {addSrLoading ? 'Adding…' : 'Add'}
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {showLetterModal && ReactDOM.createPortal(
                    <div className="fixed inset-0 backdrop-blur-sm bg-black/40 flex items-center justify-center z-[10000] p-3 max-md:px-2">
                        <div className="bg-white rounded-xl shadow-xl max-w-7xl w-full max-h-[92vh] max-lg:w-[95vw] max-lg:max-w-[95vw] max-lg:max-h-[90vh] overflow-hidden flex flex-col">
                            <div
                                className="px-4 py-3 border-b border-gray-200 flex flex-wrap justify-between items-center gap-2"
                                style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #2c4a6e 100%)` }}
                            >
                                <div>
                                    <h3 className="text-base font-semibold text-white">
                                        {letterCspOnly ? 'CSP Letters' : 'Letter Report'} — {userData?.name || 'User'}
                                    </h3>
                                    <p className="text-[11px] text-white/80 mt-0.5">
                                        Showing {Math.min(letterVisibleCount, filteredLetters.length)} of {filteredLetters.length} letter(s)
                                        {!letterCspOnly && letterData.total ? ` • ${letterData.total} total sent` : ''}
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {/* Sent At - From */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">From:</label>
                                        <input
                                            type="date"
                                            value={letterFromDate}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setLetterFromDate(v);
                                                if (letterToDate && v && letterToDate < v) setLetterToDate('');
                                            }}
                                            max={letterToDate || undefined}
                                            className="border border-gray-300 rounded-md px-2 py-1 text-[11px] bg-white text-black"
                                        />
                                    </div>

                                    {/* Sent At - To */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">To:</label>
                                        <input
                                            type="date"
                                            value={letterToDate}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                if (letterFromDate && v && v < letterFromDate) return;
                                                setLetterToDate(v);
                                            }}
                                            min={letterFromDate || undefined}
                                            className="border border-gray-300 rounded-md px-2 py-1 text-[11px] bg-white text-black"
                                        />
                                    </div>

                                    {/* Status dropdown — All / Sent / Draft */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">Status:</label>
                                        <div className="relative">
                                            <select
                                                value={letterStatusFilter}
                                                onChange={(e) => setLetterStatusFilter(e.target.value)}
                                                className="border border-gray-300 rounded-md pl-2 pr-6 py-1 text-[11px] bg-white text-black appearance-none cursor-pointer focus:outline-none"
                                            >
                                                <option value="all">All</option>
                                                <option value="sent">Sent</option>
                                                <option value="draft">Draft</option>
                                            </select>
                                            <svg className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-black pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>

                                    {/* Search */}
                                    <input
                                        type="text"
                                        placeholder="Search ref, instance, subject..."
                                        value={letterSearchTerm}
                                        onChange={(e) => setLetterSearchTerm(e.target.value)}
                                        className="border border-gray-300 rounded-lg px-2 py-1 text-xs w-56 max-md:w-full max-md:min-w-0 bg-white focus:outline-none"
                                    />

                                    {/* Clear filters */}
                                    {(letterSearchTerm || letterStatusFilter !== 'all' || letterFromDate || letterToDate) && (
                                        <button
                                            onClick={() => {
                                                setLetterSearchTerm('');
                                                setLetterStatusFilter('all');
                                                setLetterFromDate('');
                                                setLetterToDate('');
                                            }}
                                            className="px-2 py-1 text-[11px] text-white border border-white/40 rounded-md bg-white/10 hover:bg-white/20 flex items-center gap-1"
                                            title="Clear filters"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                            Clear
                                        </button>
                                    )}

                                    {/* Export — permission-gated, exports only the filtered rows */}
                                    {canExport && (
                                        <button
                                            onClick={exportLettersToExcel}
                                            disabled={loadingLetters || filteredLetters.length === 0}
                                            className="export-btn px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5 text-xs whitespace-nowrap disabled:opacity-50"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                                            </svg>
                                            Export
                                        </button>
                                    )}

                                    <button
                                        onClick={() => setShowLetterModal(false)}
                                        className="w-7 h-7 sm:w-8 sm:h-8 bg-white rounded-lg flex items-center justify-center transition-all duration-200 group flex-shrink-0"
                                    >
                                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black group-hover:rotate-90 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            <div
                                className="flex-1 overflow-auto p-3 max-h-[70vh]"
                                onScroll={(e) => {
                                    const el = e.currentTarget;
                                    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
                                        setLetterVisibleCount(prev => prev < filteredLetters.length ? prev + 50 : prev);
                                    }
                                }}
                            >
                                {loadingLetters ? (
                                    <div className="flex items-center justify-center py-10">
                                        <div className="w-8 h-8 border-2 border-t-2 border-t-[#2f3192] border-gray-200 rounded-full animate-spin"></div>
                                        <span className="ml-2 text-xs text-gray-600">Loading letters...</span>
                                    </div>
                                ) : filteredLetters.length === 0 ? (
                                    <div className="text-center py-10 text-xs text-gray-500">
                                        {letterData.letters.length === 0 ? 'No letters sent yet.' : 'No letters match the current filters.'}
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto overflow-y-auto">
                                        <table className="min-w-[1700px] w-full border-collapse text-[11px]">
                                            <thead className="bg-gray-100 sticky top-0 z-10">
                                                <tr>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Letter</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">S.No</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Ref No</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Instance ID</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Customer</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Phone</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Branch</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Format Type</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Subject</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Attachments</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Channels</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Email Sent</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">WhatsApp Sent</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">To</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">CC</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">WhatsApp To</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Status</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Sent At</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {filteredLetters.slice(0, letterVisibleCount).map((l, idx) => {
                                                    // Attachment FILE NAMES only — never render the base64 content.
                                                    // Supports both `attachment_names` (list of strings from backend)
                                                    // and the raw `attachments` array [{name, content, type}].
                                                    const attachmentNames = Array.isArray(l.attachment_names)
                                                        ? l.attachment_names
                                                        : (Array.isArray(l.attachments)
                                                            ? l.attachments.map(a => (typeof a === 'string' ? a : a?.name)).filter(Boolean)
                                                            : []);

                                                    return (
                                                        <tr key={l.id ?? idx} className="hover:bg-blue-50 transition-colors">
                                                            <td className="px-2 py-1 border border-gray-200 text-center">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleViewLetter(l)}
                                                                    className="px-2 py-0.5 rounded-md text-[10px] font-semibold text-white inline-flex items-center gap-1 hover:opacity-90"
                                                                    style={{ background: themeColor }}
                                                                    title="View letter as PDF"
                                                                >
                                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                    </svg>
                                                                    View
                                                                </button>
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{idx + 1}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center font-medium">{l.ref_no ? highlightMatch(l.ref_no, letterSearchTerm) : '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">
                                                                {l.instance_id && l.instance_id !== '-' ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleOpenCustomerFromLetter(l)}
                                                                        className="font-medium text-[#2f3192] underline hover:text-[#1f2061] hover:font-bold cursor-pointer"
                                                                        title="Click to open customer details"
                                                                    >
                                                                        {highlightMatch(l.instance_id, letterSearchTerm)}

                                                                    </button>
                                                                ) : '-'}
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left">{l.customer_name ? highlightMatch(l.customer_name, letterSearchTerm) : '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{l.phone_number || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{l.branch_id || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left">{l.format_type_name ? highlightMatch(l.format_type_name, letterSearchTerm) : '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left max-w-[260px] truncate" title={l.subject || ''}>{l.subject ? highlightMatch(l.subject, letterSearchTerm) : '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left align-top whitespace-normal break-words min-w-[200px]">
                                                                {attachmentNames.length ? attachmentNames.map((a, i) => <div key={i} className="leading-tight">{a}</div>) : '-'}
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center capitalize">
                                                                {Array.isArray(l.channels) && l.channels.length ? l.channels.join(', ') : '-'}
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">
                                                                {l.sent_email ? <span className="text-green-600 font-semibold">Yes</span> : <span className="text-gray-500">No</span>}
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">
                                                                {l.sent_whatsapp ? <span className="text-green-600 font-semibold">Yes</span> : <span className="text-gray-500">No</span>}
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left align-top whitespace-normal break-words min-w-[200px]">
                                                                {l.email_to
                                                                    ? l.email_to.split(',').map((e, i) => (
                                                                        <div key={i} className="leading-tight">{e.trim()}</div>
                                                                    ))
                                                                    : '-'}
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-left align-top whitespace-normal break-words min-w-[200px]">
                                                                {l.email_cc
                                                                    ? l.email_cc.split(',').map((e, i) => (
                                                                        <div key={i} className="leading-tight">{e.trim()}</div>
                                                                    ))
                                                                    : '-'}
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center">{l.whatsapp_to || '-'}</td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center capitalize">
                                                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${(l.status || '').toLowerCase() === 'sent' ? 'bg-green-100 text-green-700' :
                                                                    (l.status || '').toLowerCase() === 'failed' ? 'bg-rose-100 text-rose-800' :
                                                                        (l.status || '').toLowerCase() === 'draft' ? 'bg-yellow-100 text-yellow-700' :
                                                                            'bg-gray-100 text-gray-700'}`}>
                                                                    {l.status ? highlightMatch(l.status, letterSearchTerm) : '-'}

                                                                </span>
                                                            </td>
                                                            <td className="px-2 py-1 border border-gray-200 text-center whitespace-nowrap">
                                                                {fmtIstDateTime(l.created_at)}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                        {letterVisibleCount < filteredLetters.length && (
                                            <div className="text-center py-3 text-[11px] text-gray-500">Scroll down to load more…</div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex justify-end">
                                <button
                                    onClick={() => setShowLetterModal(false)}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-white text-black"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {showLetterPdfModal && ReactDOM.createPortal(
                    <div className="fixed inset-0 backdrop-blur-sm bg-black/50 flex items-center justify-center z-[10001] p-3 max-md:px-2">
                        <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full h-[92vh] max-lg:w-[95vw] max-lg:max-w-[95vw] max-lg:max-h-[90vh] overflow-hidden flex flex-col">
                            <div
                                className="px-4 py-2.5 border-b border-gray-200 flex justify-between items-center gap-2 max-md:flex-wrap max-md:gap-2"
                                style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #2c4a6e 100%)` }}
                            >
                                <h3 className="text-sm font-semibold text-white truncate">Letter — {letterPdfName}</h3>
                                <div className="flex items-center gap-2 max-md:flex-wrap">
                                    <button
                                        onClick={() => {
                                            const link = document.createElement('a');
                                            link.href = letterPdfUrl;
                                            link.download = `${letterPdfName}.pdf`;
                                            link.click();
                                        }}
                                        className="px-3 py-1.5 bg-white text-[#2f3192] rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-gray-100 max-sm:px-2"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        Download
                                    </button>
                                    <button
                                        onClick={handlePrintLetterPdf}
                                        className="px-3 py-1.5 bg-white text-[#2f3192] rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-gray-100 max-sm:px-2"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                        </svg>
                                        Print
                                    </button>
                                    <button
                                        onClick={handleCloseLetterPdf}
                                        className="w-8 h-8 bg-white rounded-lg flex items-center justify-center group flex-shrink-0"
                                    >
                                        <svg className="w-4 h-4 text-black group-hover:rotate-90 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 bg-gray-200">
                                {letterPdfUrl ? (
                                    <iframe
                                        ref={letterPdfIframeRef}
                                        src={`${letterPdfUrl}#toolbar=0&navpanes=0`}
                                        title="Letter PDF"
                                        className="w-full h-full border-0"
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-xs text-gray-500">No PDF loaded.</div>
                                )}
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {loadingLetterPdf && ReactDOM.createPortal(
                    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[10002]">
                        <div className="bg-white rounded-lg px-4 py-3 flex items-center gap-2 shadow-lg">
                            <div className="w-5 h-5 border-2 border-t-2 border-t-[#2f3192] border-gray-200 rounded-full animate-spin"></div>
                            <span className="text-xs text-gray-700">Generating letter PDF...</span>
                        </div>
                    </div>,
                    document.body
                )}

                {showNonCampaignModal && ReactDOM.createPortal(
                    <div className="fixed inset-0 backdrop-blur-sm bg-black/40 flex items-center justify-center z-[10000] p-3 max-md:px-2">
                        <div className="bg-white rounded-xl shadow-xl max-w-7xl w-full max-h-[92vh] max-lg:w-[95vw] max-lg:max-w-[95vw] max-lg:max-h-[90vh] overflow-hidden flex flex-col">
                            <div
                                className="px-4 py-3 border-b border-gray-200 flex flex-wrap justify-between items-center gap-2"
                                style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #2c4a6e 100%)` }}
                            >
                                <div>
                                    <h3 className="text-base font-semibold text-white">
                                        Non-Drive Customers by {userData?.name || 'User'}
                                    </h3>
                                    <p className="text-[11px] text-white/80 mt-0.5">
                                        Showing {filteredNonCampaignCustomers.length} of {nonCampaignBase.length} {nonCampaignViewMode === 'all' ? 'record(s)' : 'customer(s)'}
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
                                    {/* Follow-up date range — From */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">From:</label>
                                        <input
                                            type="date"
                                            value={nonCampaignFromDate}
                                            onChange={(e) => {
                                                const newFrom = e.target.value;
                                                setNonCampaignFromDate(newFrom);
                                                if (nonCampaignToDate && newFrom && new Date(nonCampaignToDate) < new Date(newFrom)) {
                                                    setNonCampaignToDate('');
                                                }
                                            }}
                                            max={nonCampaignToDate || undefined}
                                            className="border border-gray-300 rounded-md px-2 py-1 text-[11px] bg-white text-black"
                                        />
                                    </div>

                                    {/* Follow-up date range — To */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">To:</label>
                                        <input
                                            type="date"
                                            value={nonCampaignToDate}
                                            onChange={(e) => {
                                                const newTo = e.target.value;
                                                if (nonCampaignFromDate && newTo && new Date(newTo) < new Date(nonCampaignFromDate)) {
                                                    return;
                                                }
                                                setNonCampaignToDate(newTo);
                                            }}
                                            min={nonCampaignFromDate || undefined}
                                            className="border border-gray-300 rounded-md px-2 py-1 text-[11px] bg-white text-black"
                                        />
                                    </div>

                                    {/* All records vs latest-per-customer toggle */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">View:</label>
                                        <div className="flex rounded-md overflow-hidden border border-white/40">
                                            <button
                                                onClick={() => setNonCampaignViewMode('all')}
                                                className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${nonCampaignViewMode === 'all' ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}
                                                title="Every follow-up record taken (customers repeat)"
                                            >
                                                All
                                            </button>
                                            <button
                                                onClick={() => setNonCampaignViewMode('unique')}
                                                className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${nonCampaignViewMode === 'unique' ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}
                                                title="Latest record per customer"
                                            >
                                                Unique
                                            </button>
                                        </div>
                                    </div>

                                    {/* Service / Product filter */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">Service:</label>
                                        <div className="relative">
                                            <select
                                                value={nonCampaignServiceFilter}
                                                onChange={(e) => setNonCampaignServiceFilter(e.target.value)}
                                                className="border border-gray-300 rounded-md pl-2 pr-6 py-1 text-[11px] bg-white text-black appearance-none cursor-pointer focus:outline-none"
                                            >
                                                <option value="all">All</option>
                                                {nonCampaignServiceOptions.map(s => (
                                                    <option key={s} value={s}>{s}</option>
                                                ))}
                                            </select>
                                            <svg className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-black pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>

                                    {/* Status filter */}
                                    <div className="flex items-center gap-1">
                                        <label className="text-[11px] text-white whitespace-nowrap">Status:</label>
                                        <div className="relative">
                                            <select
                                                value={nonCampaignStatusFilter}
                                                onChange={(e) => setNonCampaignStatusFilter(e.target.value)}
                                                className="border border-gray-300 rounded-md pl-2 pr-6 py-1 text-[11px] bg-white text-black appearance-none cursor-pointer focus:outline-none"
                                            >
                                                <option value="all">All</option>
                                                <option value="wip">WIP</option>
                                                <option value="rejected">Rejected</option>
                                                <option value="rescheduled">Followups</option>
                                                <option value="not_connected">NC (Not Connected)</option>
                                            </select>
                                            <svg className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-black pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>

                                    {/* Clear filters */}
                                    {(nonCampaignSearchTerm || nonCampaignStatusFilter !== 'all' || nonCampaignServiceFilter !== 'all' || nonCampaignFromDate || nonCampaignToDate) && (
                                        <button
                                            onClick={() => {
                                                setNonCampaignSearchTerm('');
                                                setNonCampaignStatusFilter('all');
                                                setNonCampaignServiceFilter('all');
                                                setNonCampaignFromDate('');
                                                setNonCampaignToDate('');
                                            }}
                                            className="px-2 py-1 text-[11px] text-white border border-white/40 rounded-md bg-white/10 hover:bg-white/20 flex items-center gap-1"
                                            title="Clear filters"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                            Clear
                                        </button>
                                    )}

                                    {/* Search */}
                                    <input
                                        type="text"
                                        placeholder="Search customer, instance, service..."
                                        value={nonCampaignSearchTerm}
                                        onChange={(e) => setNonCampaignSearchTerm(e.target.value)}
                                        className="border border-gray-300 rounded-lg px-2 py-1 text-xs w-56 max-md:w-full max-md:min-w-0 bg-white focus:outline-none"
                                    />

                                    {/* Export — permission-gated */}
                                    {canExport && (
                                        <button
                                            onClick={exportNonCampaignToExcel}
                                            className="export-btn px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5 text-xs whitespace-nowrap"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                                            </svg>
                                            Export
                                        </button>
                                    )}

                                    <button
                                        onClick={() => setShowNonCampaignModal(false)}
                                        className="w-7 h-7 sm:w-8 sm:h-8 bg-white rounded-lg flex items-center justify-center transition-all duration-200 group flex-shrink-0"
                                    >
                                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black group-hover:rotate-90 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-auto p-3 max-h-[70vh]">
                                {loadingNonCampaign ? (
                                    <div className="flex items-center justify-center py-10">
                                        <div className="w-8 h-8 border-2 border-t-2 border-t-[#2f3192] border-gray-200 rounded-full animate-spin"></div>
                                        <span className="ml-2 text-xs text-gray-600">Loading customers...</span>
                                    </div>
                                ) : filteredNonCampaignCustomers.length === 0 ? (
                                    <div className="text-center py-10 text-xs text-gray-500">
                                        {nonCampaignData.customers.length === 0
                                            ? 'No non-drive customers found.'
                                            : 'No customers match the current filters.'}
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
                                        <table className="min-w-[1600px] w-full border-collapse text-[11px]">
                                            <thead className="bg-gray-100 sticky top-0 z-10">
                                                <tr>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">S.No</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Instance ID</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Customer Name</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Phone</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Email</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Branch</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Service / Product</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Activity</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Reject Reason</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Follow-up By</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Flag</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Status</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Last Follow-up</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Next Follow-up</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Remark</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Quote Sent</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Quote No.</th>
                                                    <th className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">Quote Value</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {filteredNonCampaignCustomers.map((c, idx) => (
                                                    <tr
                                                        key={c.record_id || c.instance_id || idx}
                                                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                                                        onDoubleClick={() => handleOpenCustomerFromNonDrive(c)}
                                                        title="Double-click to open customer details"
                                                    >
                                                        <td className="px-2 py-1 border border-gray-200 text-center">{idx + 1}</td>
                                                        <td className="px-2 py-1 border border-gray-200 text-center">{c.instance_id ? highlightMatch(c.instance_id, nonCampaignSearchTerm) : '-'}</td>
                                                        <td className="px-2 py-1 border border-gray-200 text-left">{c.customer_name ? highlightMatch(c.customer_name, nonCampaignSearchTerm) : '-'}</td>
                                                        <td className="px-2 py-1 border border-gray-200 text-center">{c.phone_number ? highlightMatch(c.phone_number, nonCampaignSearchTerm) : '-'}</td>
                                                        <td className="px-2 py-1 border border-gray-200 text-left">{c.email ? highlightMatch(c.email, nonCampaignSearchTerm) : '-'}</td>
                                                        <td className="px-2 py-1 border border-gray-200 text-center">{c.branch_id || '-'}</td>
                                                        <td className="px-2 py-1 border border-gray-200 text-left">{c.service ? highlightMatch(c.service, nonCampaignSearchTerm) : '-'}</td>
                                                        <td className="px-2 py-1 border border-gray-200 text-left max-w-[200px] truncate" title={c.activity_content || ''}>{c.activity_content ? highlightMatch(c.activity_content, nonCampaignSearchTerm) : '-'}</td>
                                                        <td className="px-2 py-1 border border-gray-200 text-left max-w-[200px] truncate" title={c.rr_content || ''}>{c.rr_content || '-'}</td>
                                                        <td className="px-2 py-1 border border-gray-200 text-center capitalize">{c.followup_by || '-'}</td>
                                                        <td className="px-2 py-1 border border-gray-200 text-center">
                                                            {c.latest_flag && c.latest_flag !== 'N/A' ? (
                                                                <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">{c.latest_flag}</span>
                                                            ) : '-'}
                                                        </td>
                                                        <td className="px-2 py-1 border border-gray-200 text-center capitalize">
                                                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${c.last_status === 'completed' ? 'bg-green-100 text-green-700' :
                                                                c.last_status === 'wip' ? 'bg-yellow-100 text-yellow-700' :
                                                                    c.last_status === 'rejected' ? 'bg-rose-100 text-rose-800' :
                                                                        c.last_status === 'rescheduled' ? 'bg-purple-100 text-purple-700' :
                                                                            'bg-gray-100 text-gray-700'
                                                                }`}>
                                                                {statusLabel(c.last_status)}
                                                            </span>
                                                        </td>
                                                        <td className="px-2 py-1 border border-gray-200 text-center whitespace-nowrap">
                                                            {c.last_followup_date ? new Date(c.last_followup_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                                        </td>
                                                        <td className="px-2 py-1 border border-gray-200 text-center whitespace-nowrap">
                                                            {c.next_followup_date ? new Date(c.next_followup_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                                        </td>
                                                        <td className="px-2 py-1 border border-gray-200 text-left max-w-[250px] truncate" title={c.latest_remark || ''}>{c.latest_remark ? highlightMatch(c.latest_remark, nonCampaignSearchTerm) : '-'}</td>
                                                        <td className="px-2 py-1 border border-gray-200 text-center">
                                                            {c.quotation_sent ? <span className="text-green-600 font-semibold">Yes</span> : <span className="text-gray-500">No</span>}
                                                        </td>
                                                        <td className="px-2 py-1 border border-gray-200 text-center">{c.quotation_no || '-'}</td>
                                                        <td className="px-2 py-1 border border-gray-200 text-right">
                                                            {c.quotation_value ? `₹${parseFloat(c.quotation_value).toLocaleString('en-IN')}` : '-'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex justify-end">
                                <button
                                    onClick={() => setShowNonCampaignModal(false)}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-white text-black"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
            </div>

        </div >
    );
};

export default React.memo(MyPerformance);