import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import * as XLSX from 'xlsx';

const themeColor = '#2f3192';

// ── Letterhead-band PDF rendering (mirrors Send Letter / MyPerformance) ──────────
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
    while (top + sliceHpx < H) {
        const proposed = top + sliceHpx;
        const minY = top + Math.floor(sliceHpx * 0.65);
        let cut = proposed;
        for (let y = proposed; y >= minY; y--) {
            if (darkInRow(y) <= BLANK_LIMIT) { cut = y; break; }
        }
        if (cut <= top) cut = proposed;
        cuts.push(cut);
        top = cut;
    }
    cuts.push(H);
    return cuts;
};

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

const generateBandedLetterPdf = async (bodyHtml) => {
    if (!window.html2canvas) await loadLetterScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    if (!window.jspdf) await loadLetterScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');

    const headerUrl = await loadLetterImageAsDataUrl(LETTER_HEADER_IMG);
    const footerUrl = await loadLetterImageAsDataUrl(LETTER_FOOTER_IMG);

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
        '  padding-top: 6px !important;' +
        '  padding-bottom: 8px !important;' +
        '  line-height: 1.15 !important;' +
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
            el.style.setProperty('padding-top', '6px', 'important');
            el.style.setProperty('padding-bottom', '8px', 'important');
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

// LetterSendRecord.created_at is stored UTC (naive). Mark it UTC, render in IST WITH time.
const fmtIstDateTime = (iso) => {
    if (!iso) return '-';
    const s = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z';
    const d = new Date(s);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
        timeZone: 'Asia/Kolkata'
    });
};

// IST calendar-date key (YYYY-MM-DD) for the date-range filter — matches the
// IST shown in "Sent At". String compare on this key is chronological.
const istDateKey = (iso) => {
    if (!iso) return null;
    const s = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z';
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
};

const COLS = ['Letter', 'S.No', 'Ref No', 'Instance ID', 'Customer', 'Phone', 'Sent By', 'Branch',
    'Format Type', 'Subject', 'Attachments', 'Channels', 'Email Sent', 'WhatsApp Sent', 'To', 'CC',
    'WhatsApp To', 'Status', 'Sent At'];

const BranchLetterReportModal = ({ isOpen, onClose, branch, branchDisplayName, apiBaseUrl, userData, canExport = false }) => {
    const branchCode = branch?.branch || '';

    const [loading, setLoading] = useState(false);
    const [data, setData] = useState({ total: 0, sent: 0, draft: 0, letters: [] });

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');     // all | sent | draft
    const [employeeFilter, setEmployeeFilter] = useState('all');  // sender name | all
    const [fromDate, setFromDate] = useState('');                 // YYYY-MM-DD (IST)
    const [toDate, setToDate] = useState('');                     // YYYY-MM-DD (IST)

    const [visibleCount, setVisibleCount] = useState(50);

    // PDF viewer
    const [showPdf, setShowPdf] = useState(false);
    const [pdfUrl, setPdfUrl] = useState('');
    const [pdfName, setPdfName] = useState('letter');
    const [loadingPdf, setLoadingPdf] = useState(false);
    const pdfIframeRef = useRef(null);

    // Debounce search (250ms) so filtering doesn't run on every keystroke
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchTerm), 250);
        return () => clearTimeout(t);
    }, [searchTerm]);

    // Reset the progressive render whenever any filter changes
    useEffect(() => {
        setVisibleCount(50);
    }, [debouncedSearch, statusFilter, employeeFilter, fromDate, toDate]);

    const fetchRecords = useCallback(async () => {
        if (!branchCode || !userData) return;
        setLoading(true);
        try {
            const payload = {
                user_id: userData.user_id || userData.id,
                name: userData.name, role: userData.role, branch: userData.branch
            };
            const res = await axios.post(`${apiBaseUrl}/performance/branch-letter-records/${branchCode}`, payload);
            setData(res.data || { total: 0, sent: 0, draft: 0, letters: [] });
        } catch (e) {
            console.error('Error fetching branch letter records:', e);
            setData({ total: 0, sent: 0, draft: 0, letters: [] });
        } finally {
            setLoading(false);
        }
    }, [branchCode, apiBaseUrl, userData]);

    // Reset filters + fetch on open
    useEffect(() => {
        if (isOpen && branchCode) {
            setSearchTerm('');
            setDebouncedSearch('');
            setStatusFilter('all');
            setEmployeeFilter('all');
            setFromDate('');
            setToDate('');
            setVisibleCount(50);
            fetchRecords();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, branchCode]);

    // Employee dropdown options — unique senders from the loaded data (memoized)
    const employeeOptions = useMemo(() => {
        const set = new Set();
        (data.letters || []).forEach(l => { if (l.sent_by_name && l.sent_by_name !== '-') set.add(l.sent_by_name); });
        return Array.from(set).sort();
    }, [data.letters]);

    const anyFilterActive = !!(debouncedSearch.trim() || statusFilter !== 'all' || employeeFilter !== 'all' || fromDate || toDate);

    // Single memoized pass for ALL filters (status + employee + date range + search)
    const filteredLetters = useMemo(() => {
        const t = debouncedSearch.trim().toLowerCase();
        return (data.letters || []).filter(l => {
            if (statusFilter !== 'all' && (l.status || '').toLowerCase() !== statusFilter) return false;
            if (employeeFilter !== 'all' && (l.sent_by_name || '') !== employeeFilter) return false;

            if (fromDate || toDate) {
                const key = istDateKey(l.created_at);
                if (!key) return false;
                if (fromDate && key < fromDate) return false;
                if (toDate && key > toDate) return false;
            }

            if (t) {
                const m = (
                    (l.ref_no || '').toLowerCase().includes(t) ||
                    (l.instance_id || '').toString().toLowerCase().includes(t) ||
                    (l.customer_name || '').toLowerCase().includes(t) ||
                    (l.subject || '').toLowerCase().includes(t) ||
                    (l.format_type_name || '').toLowerCase().includes(t) ||
                    (l.sent_by_name || '').toLowerCase().includes(t) ||
                    (l.email_to || '').toLowerCase().includes(t) ||
                    (l.status || '').toLowerCase().includes(t)
                );
                if (!m) return false;
            }
            return true;
        });
    }, [data.letters, debouncedSearch, statusFilter, employeeFilter, fromDate, toDate]);

    const clearFilters = () => {
        setSearchTerm('');
        setStatusFilter('all');
        setEmployeeFilter('all');
        setFromDate('');
        setToDate('');
    };

    const handleView = async (row) => {
        if (!row || row.id == null) return;
        setLoadingPdf(true);
        try {
            const res = await axios.get(
                `${apiBaseUrl}/performance/branch-letter-pdf/${branchCode}/${row.id}`,
                { params: { user_id: userData.user_id || userData.id, role: userData.role, branch: userData.branch } }
            );
            const rawHtml = res.data?.letter_html || '';
            if (!rawHtml) { alert('This letter has no content to display.'); return; }
            const bodyHtml = rawHtml.replace(/<img\b[^>]*?(?:max-width\s*:\s*780px|width\s*:\s*100%)[^>]*?>/gi, '');
            const b64 = await generateBandedLetterPdf(bodyHtml);
            if (!b64) { alert('Could not render the letter.'); return; }
            const blobUrl = URL.createObjectURL(new Blob([letterBase64ToBytes(b64)], { type: 'application/pdf' }));
            if (pdfUrl) URL.revokeObjectURL(pdfUrl);
            setPdfUrl(blobUrl);
            setPdfName(row.ref_no && row.ref_no !== '-' ? row.ref_no : `letter_${row.id}`);
            setShowPdf(true);
        } catch (e) {
            console.error('Error loading letter:', e);
            alert('Could not load the letter.');
        } finally {
            setLoadingPdf(false);
        }
    };

    const handlePrint = () => {
        const f = pdfIframeRef.current;
        if (f && f.contentWindow) { f.contentWindow.focus(); f.contentWindow.print(); }
    };

    const handleClosePdf = () => {
        setShowPdf(false);
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        setPdfUrl('');
    };

    // Export the CURRENTLY FILTERED rows
    const exportToExcel = () => {
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
                'Sent By': l.sent_by_name || '-',
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
        XLSX.utils.book_append_sheet(wb, ws, 'Branch Letters');
        ws['!cols'] = Object.keys(rows[0]).map(() => ({ wch: 20 }));
        const safeBranch = (branchDisplayName || branchCode || 'branch').replace(/[^\w.-]+/g, '_');
        XLSX.writeFile(wb, `branch_letters_${safeBranch}_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <>
            <div className="fixed inset-0 backdrop-blur-sm bg-black/40 flex items-center justify-center z-[10000] p-3 max-md:p-1.5">
                <div className="bg-white rounded-xl shadow-xl max-w-7xl w-full max-h-[92vh] overflow-hidden flex flex-col max-lg:max-w-[95vw] max-lg:max-h-[90vh]">
                    <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap justify-between items-center gap-2 max-md:px-2"
                        style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #2c4a6e 100%)` }}>
                        <div>
                            <h3 className="text-base font-semibold text-white">
                                Letter Report — {branchDisplayName || branchCode}
                            </h3>
                            <p className="text-[11px] text-white/80 mt-0.5">
                                Showing {Math.min(visibleCount, filteredLetters.length)} of {filteredLetters.length} letter(s)
                                {data.total ? ` • ${data.total} total` : ''} • Sent {data.sent || 0} • Draft {data.draft || 0}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Sent At - From */}
                            <div className="flex items-center gap-1">
                                <label className="text-[11px] text-white whitespace-nowrap">From:</label>
                                <input
                                    type="date"
                                    value={fromDate}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setFromDate(v);
                                        if (toDate && v && toDate < v) setToDate('');
                                    }}
                                    max={toDate || undefined}
                                    className="border border-gray-300 rounded-md px-2 py-1 text-[11px] bg-white text-black"
                                />
                            </div>

                            {/* Sent At - To */}
                            <div className="flex items-center gap-1">
                                <label className="text-[11px] text-white whitespace-nowrap">To:</label>
                                <input
                                    type="date"
                                    value={toDate}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        if (fromDate && v && v < fromDate) return;
                                        setToDate(v);
                                    }}
                                    min={fromDate || undefined}
                                    className="border border-gray-300 rounded-md px-2 py-1 text-[11px] bg-white text-black"
                                />
                            </div>

                            {/* Employee dropdown */}
                            <div className="flex items-center gap-1">
                                <label className="text-[11px] text-white whitespace-nowrap">Employee:</label>
                                <div className="relative">
                                    <select
                                        value={employeeFilter}
                                        onChange={(e) => setEmployeeFilter(e.target.value)}
                                        className="border border-gray-300 rounded-md pl-2 pr-6 py-1 text-[11px] bg-white text-black appearance-none cursor-pointer focus:outline-none max-w-[160px]"
                                    >
                                        <option value="all">All</option>
                                        {employeeOptions.map(name => (
                                            <option key={name} value={name}>{name}</option>
                                        ))}
                                    </select>
                                    <svg className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-black pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </div>

                            {/* Status dropdown — All / Sent / Draft */}
                            <div className="flex items-center gap-1">
                                <label className="text-[11px] text-white whitespace-nowrap">Status:</label>
                                <div className="relative">
                                    <select
                                        value={statusFilter}
                                        onChange={(e) => setStatusFilter(e.target.value)}
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
                                placeholder="Search ref, customer, sender, subject..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="border border-gray-300 rounded-lg px-2 py-1 text-xs w-56 bg-white focus:outline-none max-sm:w-full"
                            />

                            {/* Clear filters */}
                            {anyFilterActive && (
                                <button
                                    onClick={clearFilters}
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
                                    onClick={exportToExcel}
                                    disabled={loading || filteredLetters.length === 0}
                                    className="export-btn px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5 text-xs whitespace-nowrap disabled:opacity-50"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    Export
                                </button>
                            )}

                            <button onClick={onClose}
                                className="w-7 h-7 sm:w-8 sm:h-8 bg-white rounded-lg flex items-center justify-center group flex-shrink-0">
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black group-hover:rotate-90 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto p-3 max-h-[70vh] max-md:p-2"
                        onScroll={(e) => {
                            const el = e.currentTarget;
                            if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
                                setVisibleCount(prev => prev < filteredLetters.length ? prev + 50 : prev);
                            }
                        }}>
                        {loading ? (
                            <div className="flex items-center justify-center py-10">
                                <div className="w-8 h-8 border-2 border-t-2 border-t-[#2f3192] border-gray-200 rounded-full animate-spin"></div>
                                <span className="ml-2 text-xs text-gray-600">Loading letters...</span>
                            </div>
                        ) : filteredLetters.length === 0 ? (
                            <div className="text-center py-10 text-xs text-gray-500">
                                {(data.letters || []).length === 0 ? 'No letters sent from this branch yet.' : 'No letters match the current filters.'}
                            </div>
                        ) : (
                            <div className="overflow-x-auto overflow-y-auto">
                                <table className="min-w-[1800px] w-full border-collapse text-[11px]">
                                    <thead className="bg-gray-100 sticky top-0 z-10">
                                        <tr>
                                            {COLS.map(h => (
                                                <th key={h} className="px-2 py-1.5 border border-gray-300 text-center font-semibold text-black whitespace-nowrap bg-gray-100">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredLetters.slice(0, visibleCount).map((l, idx) => {
                                            const attachmentNames = Array.isArray(l.attachment_names)
                                                ? l.attachment_names
                                                : (Array.isArray(l.attachments)
                                                    ? l.attachments.map(a => (typeof a === 'string' ? a : a?.name)).filter(Boolean)
                                                    : []);
                                            const statusL = (l.status || '').toLowerCase();
                                            return (
                                                <tr key={l.id ?? idx} className="hover:bg-blue-50 transition-colors">
                                                    <td className="px-2 py-1 border border-gray-200 text-center">
                                                        <button type="button" onClick={() => handleView(l)}
                                                            className="px-2 py-0.5 rounded-md text-[10px] font-semibold text-white inline-flex items-center gap-1 hover:opacity-90"
                                                            style={{ background: themeColor }} title="View letter as PDF">
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                            </svg>
                                                            View
                                                        </button>
                                                    </td>
                                                    <td className="px-2 py-1 border border-gray-200 text-center">{idx + 1}</td>
                                                    <td className="px-2 py-1 border border-gray-200 text-center font-medium">{l.ref_no ? highlightMatch(l.ref_no, debouncedSearch) : '-'}</td>
                                                    <td className="px-2 py-1 border border-gray-200 text-center">{l.instance_id ? highlightMatch(l.instance_id, debouncedSearch) : '-'}</td>
                                                    <td className="px-2 py-1 border border-gray-200 text-left">{l.customer_name ? highlightMatch(l.customer_name, debouncedSearch) : '-'}</td>
                                                    <td className="px-2 py-1 border border-gray-200 text-center">{l.phone_number || '-'}</td>
                                                    <td className="px-2 py-1 border border-gray-200 text-left">{l.sent_by_name ? highlightMatch(l.sent_by_name, debouncedSearch) : '-'}</td>
                                                    <td className="px-2 py-1 border border-gray-200 text-center">{l.branch_id || '-'}</td>
                                                    <td className="px-2 py-1 border border-gray-200 text-left">{l.format_type_name ? highlightMatch(l.format_type_name, debouncedSearch) : '-'}</td>
                                                    <td className="px-2 py-1 border border-gray-200 text-left max-w-[260px] truncate" title={l.subject || ''}>{l.subject ? highlightMatch(l.subject, debouncedSearch) : '-'}</td>
                                                    <td className="px-2 py-1 border border-gray-200 text-left align-top whitespace-normal break-words min-w-[200px]">
                                                        {attachmentNames.length ? attachmentNames.map((a, i) => <div key={i} className="leading-tight">{a}</div>) : '-'}
                                                    </td>
                                                    <td className="px-2 py-1 border border-gray-200 text-center capitalize">{Array.isArray(l.channels) && l.channels.length ? l.channels.join(', ') : '-'}</td>
                                                    <td className="px-2 py-1 border border-gray-200 text-center">{l.sent_email ? <span className="text-green-600 font-semibold">Yes</span> : <span className="text-gray-500">No</span>}</td>
                                                    <td className="px-2 py-1 border border-gray-200 text-center">{l.sent_whatsapp ? <span className="text-green-600 font-semibold">Yes</span> : <span className="text-gray-500">No</span>}</td>
                                                    <td className="px-2 py-1 border border-gray-200 text-left align-top whitespace-normal break-words min-w-[200px]">
                                                        {l.email_to ? l.email_to.split(',').map((e, i) => <div key={i} className="leading-tight">{e.trim()}</div>) : '-'}
                                                    </td>
                                                    <td className="px-2 py-1 border border-gray-200 text-left align-top whitespace-normal break-words min-w-[200px]">
                                                        {l.email_cc ? l.email_cc.split(',').map((e, i) => <div key={i} className="leading-tight">{e.trim()}</div>) : '-'}
                                                    </td>
                                                    <td className="px-2 py-1 border border-gray-200 text-center">{l.whatsapp_to || '-'}</td>
                                                    <td className="px-2 py-1 border border-gray-200 text-center capitalize">
                                                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${statusL === 'sent' ? 'bg-green-100 text-green-700' : statusL === 'failed' ? 'bg-rose-100 text-rose-800' : statusL === 'draft' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}`}>
                                                            {l.status ? highlightMatch(l.status, debouncedSearch) : '-'}
                                                        </span>
                                                    </td>
                                                    <td className="px-2 py-1 border border-gray-200 text-center whitespace-nowrap">{fmtIstDateTime(l.created_at)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                {visibleCount < filteredLetters.length && (
                                    <div className="text-center py-3 text-[11px] text-gray-500">Scroll down to load more…</div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex justify-end">
                        <button onClick={onClose} className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-white text-black">Close</button>
                    </div>
                </div>
            </div>

            {showPdf && (
                <div className="fixed inset-0 backdrop-blur-sm bg-black/50 flex items-center justify-center z-[10001] p-3 max-md:p-1.5">
                    <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full h-[92vh] overflow-hidden flex flex-col max-lg:max-w-[95vw] max-lg:h-[90vh]">
                        <div className="px-4 py-2.5 border-b border-gray-200 flex justify-between items-center gap-2 max-sm:flex-wrap max-md:px-2"
                            style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #2c4a6e 100%)` }}>
                            <h3 className="text-sm font-semibold text-white truncate">Letter — {pdfName}</h3>
                            <div className="flex items-center gap-2 max-sm:flex-wrap">
                                <button onClick={() => { const a = document.createElement('a'); a.href = pdfUrl; a.download = `${pdfName}.pdf`; a.click(); }}
                                    className="px-3 py-1.5 bg-white text-[#2f3192] rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-gray-100">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    Download
                                </button>
                                <button onClick={handlePrint}
                                    className="px-3 py-1.5 bg-white text-[#2f3192] rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-gray-100">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                    </svg>
                                    Print
                                </button>
                                <button onClick={handleClosePdf}
                                    className="w-8 h-8 bg-white rounded-lg flex items-center justify-center group flex-shrink-0">
                                    <svg className="w-4 h-4 text-black group-hover:rotate-90 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 bg-gray-200">
                            {pdfUrl ? <iframe ref={pdfIframeRef} src={`${pdfUrl}#toolbar=0&navpanes=0`} title="Letter PDF" className="w-full h-full border-0" />
                                : <div className="flex items-center justify-center h-full text-xs text-gray-500">No PDF loaded.</div>}
                        </div>
                    </div>
                </div>
            )}

            {loadingPdf && (
                <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[10002]">
                    <div className="bg-white rounded-lg px-4 py-3 flex items-center gap-2 shadow-lg">
                        <div className="w-5 h-5 border-2 border-t-2 border-t-[#2f3192] border-gray-200 rounded-full animate-spin"></div>
                        <span className="text-xs text-gray-700">Generating letter PDF...</span>
                    </div>
                </div>
            )}
        </>,
        document.body
    );
};

export default BranchLetterReportModal;