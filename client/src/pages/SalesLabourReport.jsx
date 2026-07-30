import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  ChartBarSquareIcon, ArrowUpTrayIcon, DocumentMagnifyingGlassIcon,
  ClockIcon, PrinterIcon, BookmarkSquareIcon, XMarkIcon, TrashIcon,
  DocumentCheckIcon, TableCellsIcon, ArrowPathIcon,
} from '@heroicons/react/24/outline';

// ============================================================================
// PMS → Sales and Labour Report  (Performance Management System)
// Spare & Labour Sale — regional performance vs monthly targets.
//   ① Upload files (Part Sale + Labour Revenue Excel; dedupe on re-upload)
//   ② Preview stored data   ③ Generate report   ④ Save to History / Print
// Backend: server/app/routes/pms_routes.py (master admin only)
// ============================================================================

const API = import.meta.env.VITE_BACKEND_URL;

// -- Theme (same as Knowledge Bank) --------------------------------
const themeColor = '#2f3192';
const themeDark = '#23255f';
const themeSoft = 'rgba(47, 49, 146, 0.10)';

const authHeaders = () => {
  const u = JSON.parse(sessionStorage.getItem('user') || '{}');
  return { 'user-id': String(u.user_id || ''), 'user-role': u.role || '' };
};
const jsonHeaders = () => ({ ...authHeaders(), 'Content-Type': 'application/json' });

// ---- formatting helpers ----------------------------------------------------
const inr = (v) => (v == null ? '—' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 }));
// Lakh display for the summary tiles (mockup shows "30.93 L")
const lakh = (v) => {
  if (v == null) return '—';
  const n = Number(v);
  if (Math.abs(n) >= 10000000) return (n / 10000000).toFixed(2) + ' Cr';
  if (Math.abs(n) >= 100000) return (n / 100000).toFixed(2) + ' L';
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
};
const fmtDay = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};
const fmtFull = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
};
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const thCls =
  'px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap bg-gray-50 border-b border-gray-200';
const tdCls = 'px-2 py-1.5 whitespace-nowrap border-b border-gray-100';

const REPORT_TYPES = [
  { key: 'spare', name: 'Spare Part Sales' },
  { key: 'labour', name: 'Labour Sales' },
  { key: 'regional', name: 'Regional-wise Sales' },
  { key: 'segment', name: 'Segment-wise Sales' },
  { key: 'service_head', name: 'Service Report Type-wise Sales' },
];

const PREVIEW_COLS = [
  ['zone_name', 'Zone'], ['soid', 'SOID'], ['sd_name', 'SD Name'],
  ['branch_id', 'Branch ID'], ['branch_name', 'Branch Name'],
  ['claim_invoice_no', 'Claim Invoice No'], ['claim_invoice_date', 'Claim Invoice Date'],
  ['product_segment', 'Product Segment'], ['segment', 'Segment'],
  ['sr_type', 'Service Report Type'], ['net_taxable_amount', 'Net Taxable Amount'],
];

// ---- one upload box (Part Sale / Labour Revenue) ---------------------------
const UploadBox = ({ label, recordType, onUploaded }) => {
  const [file, setFile] = useState(null);
  const [checking, setChecking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const inputRef = useRef(null);

  const send = async (validateOnly) => {
    if (!file) { toast.error('Choose a file first'); return; }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('record_type', recordType);
    fd.append('validate_only', validateOnly ? 'true' : 'false');
    validateOnly ? setChecking(true) : setUploading(true);
    try {
      const res = await fetch(`${API}/pms/upload`, { method: 'POST', headers: authHeaders(), body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.message || 'Request failed');
      if (validateOnly) {
        setCheckResult(data);
        data.success ? toast.success(`${label}: format OK (${data.rows} rows × ${data.columns} cols)`)
          : toast.error(data.message);
      } else {
        if (!data.success) throw new Error(data.message);
        toast.success(`${label}: ${data.inserted} new, ${data.duplicates} duplicates skipped`);
        setCheckResult(null);
        setFile(null);
        if (inputRef.current) inputRef.current.value = '';
        onUploaded?.();
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      validateOnly ? setChecking(false) : setUploading(false);
    }
  };

  return (
    <div className="flex-1 min-w-[260px] border border-dashed border-gray-300 rounded-lg p-3">
      <p className="text-xs font-semibold text-gray-800">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <input ref={inputRef} type="file" accept=".xlsx,.xls"
          onChange={(e) => { setFile(e.target.files?.[0] || null); setCheckResult(null); }}
          className="text-[11px] text-gray-600 file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:text-[11px] file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 w-full" />
      </div>
      <div className="mt-2 flex gap-1.5">
        <button onClick={() => send(true)} disabled={checking || !file}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">
          <DocumentCheckIcon className="h-3 w-3" /> {checking ? 'Checking…' : 'Check file format'}
        </button>
        <button onClick={() => send(false)} disabled={uploading || !file}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white rounded hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: themeColor }}>
          <ArrowUpTrayIcon className="h-3 w-3" /> {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </div>
      {checkResult && (
        <div className={`mt-2 text-[11px] rounded p-1.5 ${checkResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
          {checkResult.message}
          {checkResult.success && (
            <span className="text-gray-500"> — {checkResult.rows} rows × {checkResult.columns} columns</span>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

const SalesLabourReport = () => {
  // stored-data summary + preview
  const [summary, setSummary] = useState(null);
  const [previewType, setPreviewType] = useState('part');
  const [previewRows, setPreviewRows] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [batches, setBatches] = useState([]);
  const [showBatches, setShowBatches] = useState(false);

  // report
  const [asOn, setAsOn] = useState(todayISO());
  const [report, setReport] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [reportType, setReportType] = useState('spare');
  const [regionFilter, setRegionFilter] = useState('All');
  const [savingReport, setSavingReport] = useState(false);

  // history
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch(`${API}/pms/data/summary`, { headers: authHeaders() });
      const data = await res.json();
      if (res.ok && data.success) setSummary(data.summary);
    } catch { /* non-fatal */ }
  }, []);

  const loadPreview = useCallback(async (rt) => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`${API}/pms/data/preview?record_type=${rt}&limit=50`, { headers: authHeaders() });
      const data = await res.json();
      if (res.ok && data.success) setPreviewRows(data.items || []);
    } catch { setPreviewRows([]); }
    finally { setPreviewLoading(false); }
  }, []);

  const loadBatches = useCallback(async () => {
    try {
      const res = await fetch(`${API}/pms/uploads`, { headers: authHeaders() });
      const data = await res.json();
      if (res.ok && data.success) setBatches(data.items || []);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { loadSummary(); loadBatches(); }, [loadSummary, loadBatches]);
  useEffect(() => { loadPreview(previewType); }, [previewType, loadPreview]);

  const onUploaded = () => { loadSummary(); loadBatches(); loadPreview(previewType); };

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`${API}/pms/report?as_on=${asOn}`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Report failed');
      setReport(data);
      if (!data.spare_rows.length && !data.labour_rows.length) {
        toast('No data / targets found for ' + data.month, { icon: 'ℹ️' });
      } else {
        toast.success('Report generated');
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const saveToHistory = async () => {
    if (!report) return;
    setSavingReport(true);
    try {
      const res = await fetch(`${API}/pms/report/save`, {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({
          as_on: report.as_on,
          title: `PMS Report as on ${fmtFull(report.as_on)}`,
          payload: report,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Save failed');
      toast.success('Report saved to history');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingReport(false);
    }
  };

  const openHistory = async () => {
    setShowHistory(true);
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API}/pms/report/history`, { headers: authHeaders() });
      const data = await res.json();
      if (res.ok && data.success) setHistory(data.items || []);
    } catch { /* non-fatal */ }
    finally { setHistoryLoading(false); }
  };

  const openHistoryItem = async (id) => {
    try {
      const res = await fetch(`${API}/pms/report/history/${id}`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Could not open report');
      setReport(data.payload);
      setAsOn(data.payload.as_on);
      setShowHistory(false);
      toast.success(`Opened: ${data.title}`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const deleteHistoryItem = async (id) => {
    try {
      const res = await fetch(`${API}/pms/report/history/${id}`, { method: 'DELETE', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Delete failed');
      setHistory((prev) => prev.filter((h) => h.id !== id));
      toast.success('Deleted');
    } catch (e) {
      toast.error(e.message);
    }
  };

  // ---- report table data with region filter ----
  const branchRows = report
    ? (reportType === 'labour' ? report.labour_rows : report.spare_rows)
        .filter((r) => regionFilter === 'All' || r.region === regionFilter)
    : [];
  const totals = branchRows.reduce((a, r) => ({
    monthly_target: a.monthly_target + (r.monthly_target || 0),
    daily_target: a.daily_target + (r.daily_target || 0),
    achieved_on: a.achieved_on + (r.achieved_on || 0),
    target_till: a.target_till + (r.target_till || 0),
    achieved_till: a.achieved_till + (r.achieved_till || 0),
    invoice_count_till: a.invoice_count_till + (r.invoice_count_till || 0),
  }), { monthly_target: 0, daily_target: 0, achieved_on: 0, target_till: 0, achieved_till: 0, invoice_count_till: 0 });

  const breakdownRows = report && ['regional', 'segment', 'service_head'].includes(reportType)
    ? report[reportType] : null;

  const dayLabel = report ? fmtDay(report.as_on) : '';

  return (
    <div className="min-h-screen font-sans">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 pb-10 max-md:px-2">
      {/* Print: only the generated report section prints */}
      <style>{`@media print {
        .pms-no-print { display: none !important; }
        .pms-print-area { box-shadow: none !important; border: none !important; }
      }`}</style>

      {/* ===== Hero header (same style as Knowledge Bank) ===== */}
      <div className="pms-no-print rounded-2xl px-3 sm:px-5 py-3 mb-3 text-white relative overflow-hidden"
        style={{ background: `linear-gradient(120deg, ${themeColor} 0%, ${themeDark} 100%)` }}>
        <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
        <div className="absolute right-16 -bottom-12 h-24 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-white/15 backdrop-blur-sm">
              <ChartBarSquareIcon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold leading-tight">Performance Management System</h1>
              <p className="text-[11px] text-white/70 leading-tight">
                Spare &amp; Labour Sale — regional performance vs monthly targets
              </p>
            </div>
          </div>
          <div className="flex items-center flex-wrap gap-2">
            {summary && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium bg-white/15 text-white">
                Part rows: <b className="font-bold">{inr(summary.part?.rows)}</b>
              </span>
            )}
            {summary && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium bg-white/15 text-white">
                Labour rows: <b className="font-bold">{inr(summary.labour?.rows)}</b>
              </span>
            )}
            <button onClick={openHistory}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-semibold transition hover:bg-white/90"
              style={{ color: themeColor }}>
              <ClockIcon className="h-3.5 w-3.5" /> History
            </button>
          </div>
        </div>
      </div>

      {/* ============ ① Report Setup ============ */}
      <div className="pms-no-print bg-white rounded-2xl border border-gray-200 mb-3 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
          <ArrowUpTrayIcon className="h-4 w-4" style={{ color: themeColor }} />
          <h2 className="text-sm font-semibold text-gray-900">Report Setup</h2>
          <span className="text-[11px] text-gray-400">
            Upload the source files → ② preview data → ③ generate the report → ④ save
          </span>
        </div>
        <div className="p-3 flex flex-wrap gap-3">
          <UploadBox label="Part Sale file" recordType="part" onUploaded={onUploaded} />
          <UploadBox label="Labour Revenue file" recordType="labour" onUploaded={onUploaded} />
          {/* Generate */}
          <div className="flex-1 min-w-[220px] border border-dashed border-gray-300 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-800">Generate report</p>
            <div className="mt-2 flex items-end gap-2 flex-wrap">
              <div className="flex flex-col">
                <label className="text-[10px] font-medium text-gray-500 mb-0.5">As on date</label>
                <input type="date" value={asOn} onChange={(e) => setAsOn(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-xs text-black focus:outline-none focus:ring-1"
                  style={{ '--tw-ring-color': themeColor }} />
              </div>
              <button onClick={generate} disabled={generating}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-md hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: themeColor }}>
                {generating ? 'Generating…' : 'Generate →'}
              </button>
            </div>
            {summary && (
              <div className="mt-2 text-[11px] text-gray-500 space-y-0.5">
                <div>Part sale data: <b>{inr(summary.part?.rows)}</b> rows
                  {summary.part?.from_date && <> ({fmtDay(summary.part.from_date)} → {fmtDay(summary.part.to_date)})</>}</div>
                <div>Labour data: <b>{inr(summary.labour?.rows)}</b> rows
                  {summary.labour?.from_date && <> ({fmtDay(summary.labour.from_date)} → {fmtDay(summary.labour.to_date)})</>}</div>
              </div>
            )}
          </div>
        </div>
        {/* Recent uploads */}
        <div className="px-4 pb-3">
          <button onClick={() => setShowBatches(!showBatches)}
            className="text-[11px] font-medium text-gray-500 hover:text-gray-800">
            {showBatches ? '▾' : '▸'} Recent uploads ({batches.length})
          </button>
          {showBatches && batches.length > 0 && (
            <div className="mt-1.5 overflow-x-auto border border-gray-200 rounded">
              <table className="w-full text-[11px] border-collapse min-w-[640px]">
                <thead><tr>
                  <th className={thCls}>File</th><th className={thCls}>Type</th>
                  <th className={thCls}>Total</th><th className={thCls}>New</th>
                  <th className={thCls}>Duplicates</th><th className={thCls}>Skipped</th>
                  <th className={thCls}>Uploaded</th>
                </tr></thead>
                <tbody>
                  {batches.slice(0, 10).map((b) => (
                    <tr key={b.id} className="border-b border-gray-100">
                      <td className={tdCls}>{b.file_name}</td>
                      <td className={tdCls}>{b.record_type === 'part' ? 'Part Sale' : 'Labour'}</td>
                      <td className={tdCls}>{inr(b.total_rows)}</td>
                      <td className={`${tdCls} text-green-700 font-medium`}>{inr(b.inserted_rows)}</td>
                      <td className={tdCls}>{inr(b.duplicate_rows)}</td>
                      <td className={tdCls}>{inr(b.skipped_rows)}</td>
                      <td className={tdCls}>{b.uploaded_at ? new Date(b.uploaded_at).toLocaleString('en-GB') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ============ ② Uploaded data preview ============ */}
      <div className="pms-no-print bg-white rounded-2xl border border-gray-200 mb-3 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex flex-wrap items-center gap-2">
          <TableCellsIcon className="h-4 w-4" style={{ color: themeColor }} />
          <h2 className="text-sm font-semibold text-gray-900">Uploaded File Preview</h2>
          <span className="text-[11px] text-gray-400">latest 50 stored rows</span>
          <div className="flex-1" />
          {[['part', 'Part Sale'], ['labour', 'Labour']].map(([k, n]) => (
            <button key={k} onClick={() => setPreviewType(k)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium border ${previewType === k
                ? 'text-white border-transparent' : 'text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              style={previewType === k ? { backgroundColor: themeColor } : {}}>
              {n}
            </button>
          ))}
          <button onClick={() => loadPreview(previewType)} title="Refresh"
            className="p-1 rounded border border-gray-300 text-gray-500 hover:bg-gray-50">
            <ArrowPathIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
          <table className="w-full text-[11px] border-collapse min-w-[1050px]">
            <thead className="sticky top-0"><tr>
              {PREVIEW_COLS.map(([k, label]) => <th key={k} className={thCls}>{label}</th>)}
            </tr></thead>
            <tbody>
              {previewLoading ? (
                <tr><td colSpan={PREVIEW_COLS.length} className="text-center py-6 text-gray-500">Loading…</td></tr>
              ) : previewRows.length === 0 ? (
                <tr><td colSpan={PREVIEW_COLS.length} className="text-center py-6 text-gray-500">
                  No {previewType === 'part' ? 'Part Sale' : 'Labour'} data uploaded yet.
                </td></tr>
              ) : previewRows.map((r, i) => (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50/60">
                  {PREVIEW_COLS.map(([k]) => (
                    <td key={k} className={`${tdCls} ${k === 'net_taxable_amount' ? 'text-right font-medium' : ''}`}>
                      {k === 'net_taxable_amount' ? inr(r[k]) : (r[k] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============ ③ Generated Report ============ */}
      {report && (
        <div className="pms-print-area bg-white rounded-2xl border border-gray-200 mb-3 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex flex-wrap items-center gap-2">
            <DocumentMagnifyingGlassIcon className="h-4 w-4 pms-no-print" style={{ color: themeColor }} />
            <h2 className="text-sm font-semibold text-gray-900">
              Generated Report : As on {fmtFull(report.as_on)}
            </h2>
            <div className="flex-1" />
            <button onClick={saveToHistory} disabled={savingReport}
              className="pms-no-print flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">
              <BookmarkSquareIcon className="h-3.5 w-3.5" /> {savingReport ? 'Saving…' : 'Save to History'}
            </button>
            <button onClick={() => window.print()}
              className="pms-no-print flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
              <PrinterIcon className="h-3.5 w-3.5" /> Print / PDF
            </button>
          </div>

          {/* Summary tiles */}
          <div className="p-3 grid grid-cols-4 max-md:grid-cols-2 gap-2">
            {[
              ['Total Spare Sale', '₹ ' + lakh(report.summary.total_spare_sale)],
              ['Total Labour Sale', '₹ ' + lakh(report.summary.total_labour_sale)],
              ['Overall % Achieved', report.summary.overall_pct_achieved != null
                ? report.summary.overall_pct_achieved + ' %' : '— (no targets)'],
              ['Total Invoices', inr(report.summary.total_invoices)],
            ].map(([label, value]) => (
              <div key={label} className="border border-gray-200 rounded-lg px-3 py-2">
                <p className="text-[11px] text-gray-500">{label}</p>
                <p className="text-lg font-bold" style={{ color: themeColor }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Report type + region filter */}
          <div className="px-3 pb-2 flex flex-wrap items-end gap-2">
            <div className="flex flex-col">
              <label className="text-[10px] font-medium text-gray-500 mb-0.5">Select report type</label>
              <select value={reportType} onChange={(e) => setReportType(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-xs text-black bg-white focus:outline-none focus:ring-1"
                style={{ '--tw-ring-color': themeColor }}>
                {REPORT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
              </select>
            </div>
            {!breakdownRows && (
              <div className="flex gap-1">
                {['All', 'MH', 'KA'].map((r) => (
                  <button key={r} onClick={() => setRegionFilter(r)}
                    className={`px-3 py-1 rounded-md text-[11px] font-medium border ${regionFilter === r
                      ? 'text-white border-transparent' : 'text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                    style={regionFilter === r ? { backgroundColor: themeColor } : {}}>
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Branch table (Spare / Labour) */}
          {!breakdownRows && (
            <div className="px-3 pb-3 overflow-x-auto">
              <table className="w-full text-[11px] border-collapse min-w-[980px]">
                <thead><tr>
                  <th className={thCls}>Responsible Person</th>
                  <th className={thCls}>Branch</th>
                  <th className={thCls}>Region</th>
                  <th className={`${thCls} text-right`}>Monthly Target</th>
                  <th className={`${thCls} text-right`}>Daily Target</th>
                  <th className={`${thCls} text-right`}>Achi. on {dayLabel}</th>
                  <th className={`${thCls} text-right`}>Target Till {dayLabel}</th>
                  <th className={`${thCls} text-right`}>Achi. Till {dayLabel}</th>
                  <th className={`${thCls} text-right`}>Invoice Count Till {dayLabel}</th>
                  <th className={`${thCls} text-right`}>% Achieved Till Date</th>
                </tr></thead>
                <tbody>
                  {branchRows.length === 0 ? (
                    <tr><td colSpan={10} className="text-center py-6 text-gray-500">
                      No rows — upload data and set AOP targets for {report.month}.
                    </td></tr>
                  ) : branchRows.map((r, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50/60">
                      <td className={tdCls}>{r.responsible_person}</td>
                      <td className={tdCls}>{r.branch_name}</td>
                      <td className={tdCls}>{r.region}</td>
                      <td className={`${tdCls} text-right`}>{inr(r.monthly_target)}</td>
                      <td className={`${tdCls} text-right`}>{inr(r.daily_target)}</td>
                      <td className={`${tdCls} text-right`}>{inr(r.achieved_on)}</td>
                      <td className={`${tdCls} text-right`}>{inr(r.target_till)}</td>
                      <td className={`${tdCls} text-right font-medium`}>{inr(r.achieved_till)}</td>
                      <td className={`${tdCls} text-right`}>{inr(r.invoice_count_till)}</td>
                      <td className={`${tdCls} text-right font-semibold`}
                        style={{ color: r.pct_achieved == null ? undefined : r.pct_achieved >= 100 ? '#15803d' : r.pct_achieved >= 70 ? '#a16207' : '#b91c1c' }}>
                        {r.pct_achieved == null ? '—' : r.pct_achieved + ' %'}
                      </td>
                    </tr>
                  ))}
                  {branchRows.length > 0 && (
                    <tr className="bg-gray-50 font-semibold">
                      <td className={tdCls} colSpan={3}>Total ({regionFilter})</td>
                      <td className={`${tdCls} text-right`}>{inr(totals.monthly_target)}</td>
                      <td className={`${tdCls} text-right`}>{inr(totals.daily_target)}</td>
                      <td className={`${tdCls} text-right`}>{inr(totals.achieved_on)}</td>
                      <td className={`${tdCls} text-right`}>{inr(totals.target_till)}</td>
                      <td className={`${tdCls} text-right`}>{inr(totals.achieved_till)}</td>
                      <td className={`${tdCls} text-right`}>{inr(totals.invoice_count_till)}</td>
                      <td className={`${tdCls} text-right`}>
                        {totals.monthly_target ? (totals.achieved_till / totals.monthly_target * 100).toFixed(1) + ' %' : '—'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Breakdown tables (Regional / Segment / Service head) */}
          {breakdownRows && (
            <div className="px-3 pb-3 overflow-x-auto">
              <table className="w-full text-[11px] border-collapse min-w-[560px]">
                <thead><tr>
                  <th className={thCls}>
                    {reportType === 'regional' ? 'Region' : reportType === 'segment' ? 'Segment' : 'Service Head'}
                  </th>
                  <th className={`${thCls} text-right`}>Spare Sale</th>
                  <th className={`${thCls} text-right`}>Labour Sale</th>
                  <th className={`${thCls} text-right`}>Total</th>
                  <th className={`${thCls} text-right`}>Invoices</th>
                </tr></thead>
                <tbody>
                  {breakdownRows.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-6 text-gray-500">No data for {report.month}.</td></tr>
                  ) : breakdownRows.map((r, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50/60">
                      <td className={`${tdCls} font-medium`}>{r.name}</td>
                      <td className={`${tdCls} text-right`}>{inr(r.part)}</td>
                      <td className={`${tdCls} text-right`}>{inr(r.labour)}</td>
                      <td className={`${tdCls} text-right font-semibold`}>{inr(r.total)}</td>
                      <td className={`${tdCls} text-right`}>{inr(r.invoices)}</td>
                    </tr>
                  ))}
                  {breakdownRows.length > 0 && (
                    <tr className="bg-gray-50 font-semibold">
                      <td className={tdCls}>Total</td>
                      <td className={`${tdCls} text-right`}>{inr(breakdownRows.reduce((s, r) => s + r.part, 0))}</td>
                      <td className={`${tdCls} text-right`}>{inr(breakdownRows.reduce((s, r) => s + r.labour, 0))}</td>
                      <td className={`${tdCls} text-right`}>{inr(breakdownRows.reduce((s, r) => s + r.total, 0))}</td>
                      <td className={`${tdCls} text-right`}>{inr(breakdownRows.reduce((s, r) => s + r.invoices, 0))}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ============ History modal ============ */}
      {showHistory && (
        <div className="pms-no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900">Report History</h2>
              <button onClick={() => setShowHistory(false)} className="p-1 rounded hover:bg-gray-100">
                <XMarkIcon className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {historyLoading ? (
                <p className="text-center py-6 text-xs text-gray-500">Loading…</p>
              ) : history.length === 0 ? (
                <p className="text-center py-6 text-xs text-gray-500">No saved reports yet.</p>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead><tr>
                    <th className={thCls}>Title</th>
                    <th className={thCls}>As on</th>
                    <th className={thCls}>Saved</th>
                    <th className={thCls} style={{ width: 90 }}>Action</th>
                  </tr></thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} className="border-b border-gray-100 hover:bg-gray-50/60">
                        <td className={tdCls}>
                          <button onClick={() => openHistoryItem(h.id)}
                            className="font-medium hover:underline" style={{ color: themeColor }}>
                            {h.title}
                          </button>
                        </td>
                        <td className={tdCls}>{fmtFull(h.as_on_date)}</td>
                        <td className={tdCls}>{h.created_at ? new Date(h.created_at).toLocaleString('en-GB') : '—'}</td>
                        <td className={`${tdCls} text-center`}>
                          <button onClick={() => deleteHistoryItem(h.id)} title="Delete"
                            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default SalesLabourReport;
