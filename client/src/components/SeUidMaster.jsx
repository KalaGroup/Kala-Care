import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import {
    FaPlus, FaSave, FaTimes, FaEdit, FaTrash, FaSearch, FaIdCard, FaSyncAlt, FaUpload,
} from 'react-icons/fa';
import { CiImport } from 'react-icons/ci';
import { MdOutlineFileDownload, MdOutlineFileUpload } from 'react-icons/md';
import { canExportExcel } from '../utils/exportPermission';
import { dateOnly, finishDateColumns } from '../utils/excelDateColumns';

/* ---------------------------------------------------------------------------
   SE UID Master — Service Engineer NAME <-> UID, edited from the Profile page
   (Master Admin only).

   Why it exists: the Employee Productivity report joins files that name the
   same engineer differently. 'Response Time & MaxTTR Details' carries only the
   SE NAME, while the LMS and EFSR files identify them by SERVICE ENGINEER UID.
   This master is the ONLY place the report reads a UID from.

   The roster is STORED: the page reads the master table straight off (instant).
   'Reload from data' re-scans the MaxTTR / LMS / EFSR files, pulls in any new
   engineer and saves them — UIDs are only ever added, so hand edits survive.
   One engineer may hold several UIDs (comma separated) when the files disagree
   or two people share a name.

   Import also takes HR's monthly 'Attendance Summary' export — the one file
   that carries BOTH identities (E Code = the KalaCare login id, UID = the
   Service Engineer UID). It is recognised by its own columns, stores the month
   in pms_attendance_summary, and FILLS BLANKS in this master from it.

   Backend: /pms/se-uid (GET ?sync, POST, DELETE /{id}) and /se-uid/import.
--------------------------------------------------------------------------- */

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;
const themeColor = '#2f3192';

// Grid-style table cells — dark grey lines on every cell, same as the AOP
// Master's SR Type grid.
const thCls = 'px-2 py-1.5 text-center text-[11px] font-semibold text-black uppercase tracking-wide whitespace-nowrap bg-gray-50 border border-gray-400';
const tdCls = 'px-2 py-1 border border-gray-400';

// Attendance Summary figures -> the column heads of the Edit dialog's month
// table. Order comes from the server (`figures`), which is the model's own.
/* The columns 'Attendance <Month>' carries, spelt as it spells them. The order
   is the server's (_ATT_FIGURES) - this only names them. The older export's
   Payable Days / Leave & Absent / LOP / Allowed Leave / Total Payable and its
   EmpStatus are gone: HR does not send them, so nothing prints them. */
const FIG_LABELS = {
    total_days_month: 'Total Days',
    present: 'Present',
    out_door_duty: 'Outdoor Duty',
    half_day: 'Half Day',
    absent: 'Absent',
    leave: 'Leave',
    weekly_off: 'Weekly Off',
    c_off: 'C Off',
    holiday: 'Holiday',
    na: 'NA',
};

// '2026-03-19' -> '19-03-2026'. Sliced, not parsed: the server sends a plain
// calendar date and new Date() would drag a timezone into it.
const dmy = (iso) => {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : (iso || '');
};

// A day count. 31.0 prints as '31', 2.5 keeps its half — JS numbers already
// drop a trailing .0, so nothing has to be rounded away here.
const num = (v) => String(v);

const SeUidMaster = ({ user, showToast }) => {
    const [items, setItems] = useState([]);
    const [branches, setBranches] = useState([]); // KALA branches for the picker
    const [dupUids, setDupUids] = useState([]);   // one UID on >1 engineer
    const [stats, setStats] = useState({ total: 0, with_uid: 0, missing: 0,
        with_branch: 0, in_maxttr: 0, in_lms: 0, in_efsr: 0, in_hr: 0, left: 0 });
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [search, setSearch] = useState('');
    const [view, setView] = useState('all');        // all | missing | linked | nobranch | left
    const [brSel, setBrSel] = useState('');         // '' = every branch, '-' = no branch

    const [draft, setDraft] = useState(null);       // the engineer open in the Edit dialog
    const [detail, setDetail] = useState(null);    // his HR record + attendance months
    const [detailBusy, setDetailBusy] = useState(false);
    // The employment status is edited here but LIVES in the Training Report's
    // override table, so it gets its own form and its own Save.
    const [statusForm, setStatusForm] = useState(null);
    const [statusBusy, setStatusBusy] = useState(false);
    const [addForm, setAddForm] = useState(null);   // Add SE modal
    const [importFile, setImportFile] = useState(null);
    const [showImport, setShowImport] = useState(false);
    // The Import button takes TWO different files. 'seuid' is this master's own
    // export; 'attendance' is HR's monthly Attendance Summary, which carries no
    // month of its own, so attMonth has to be picked before it can be sent.
    const [fileKind, setFileKind] = useState(null);   // null | 'seuid' | 'attendance'
    const [attMonth, setAttMonth] = useState('');     // 'YYYY-MM'
    // Which attendance months are already stored, newest first — so the Import
    // dialog can say what is in rather than leaving it to be remembered.
    const [attMonths, setAttMonths] = useState([]);
    /* THE BRANCH REVIEW. An HR file names the branch in its own words, and
       those words sometimes disagree with this master: a spelling that is no
       KALA branch at all, or a real branch that is not the one the row holds.
       The import never overwrites a branch, so it hands the disagreements back
       here and they are answered with a branch dropdown. Kept in state after
       the dialog is closed, so the banner can re-open it. */
    const [review, setReview] = useState([]);         // rows the import asks about
    const [showReview, setShowReview] = useState(false);
    const [picks, setPicks] = useState({});           // row_id -> branch id
    const [grpPicks, setGrpPicks] = useState({});     // HR's spelling -> branch id
    const [remember, setRemember] = useState({});     // HR's spelling -> save alias
    const [reviewBusy, setReviewBusy] = useState(false);

    const headers = useMemo(() => ({
        'user-id': user?.user_id,
        'user-role': user?.role,
    }), [user]);

    const apply = (d) => {
        setItems(d?.items || []);
        if (d?.branches) setBranches(d.branches);
        if (d?.attendance_months) setAttMonths(d.attendance_months);
        if (d?.stats) setStats(d.stats);
        setDupUids(d?.duplicate_uids || []);
    };

    // sync=false reads the stored master (instant). sync=true re-scans the
    // uploaded files and SAVES whatever is new before returning.
    const load = useCallback(async (sync = false, quiet = true) => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_BASE_URL}/pms/se-uid`, { headers, params: { sync } });
            apply(res.data);
            const s = res.data?.synced;
            if (!quiet) {
                const bits = [];
                if (s?.added) bits.push(`${s.added} new engineer${s.added > 1 ? 's' : ''}`);
                if (s?.filled) bits.push(`${s.filled} UID${s.filled > 1 ? 's' : ''} filled`);
                if (s?.branched) bits.push(`${s.branched} branch${s.branched > 1 ? 'es' : ''} filled`);
                showToast?.('success', bits.length
                    ? `Loaded from data — ${bits.join(', ')} (saved)`
                    : 'Already up to date with the uploaded data');
            }
        } catch (e) {
            showToast?.('error', e.response?.data?.detail || 'Could not load the SE UID master');
        } finally {
            setLoading(false);
        }
    }, [headers, showToast]);

    /* THE QUESTIONS THE STORED ATTENDANCE STILL RAISES. The review opens by
       itself right after an upload, but a month imported before this existed —
       or a dialog closed with 'Later' — would otherwise never be asked again,
       so the banner is fed from the server on every visit. */
    const loadReview = useCallback(async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/pms/se-uid/branch-review`,
                { headers });
            setReview(res.data?.items || []);
        } catch {
            /* the master itself is what this page is for — a review that cannot
               be fetched is not worth an error toast over */
        }
    }, [headers]);

    useEffect(() => { load(false, true); }, [load]);
    useEffect(() => { loadReview(); }, [loadReview]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return items.filter((r) => {
            if (view === 'missing' && r.se_uid) return false;
            if (view === 'linked' && !r.se_uid) return false;
            // the engineers no uploaded file could place in a KALA branch — the
            // PMS reports fall back to this field, so these are the rows to fix
            if (view === 'nobranch' && r.branch_id) return false;
            // Everyone the Training Report says has gone — the list to work
            // from when someone leaves.
            if (view === 'left' && r.status !== 'Inactive') return false;
            // '-' picks the engineers no file could place — the rows to fix
            if (brSel === '-' && r.branch_id) return false;
            if (brSel && brSel !== '-' && r.branch_id !== brSel) return false;
            if (!q) return true;
            return `${r.se_name} ${r.se_uid} ${r.e_code} ${r.branch_id} ${r.branch_name}`
                .toLowerCase().includes(q);
        });
    }, [items, search, view, brSel]);

    // Engineers with no branch at all. Counted from the rows themselves rather
    // than stats.with_branch, so the tab and its list can never disagree.
    const noBranch = useMemo(() => items.filter((r) => !r.branch_id).length, [items]);

    // How many engineers sit in each branch — shown in the filter so the counts
    // are readable without picking one.
    const brCounts = useMemo(() => {
        const c = { '-': 0 };
        items.forEach((r) => {
            const k = r.branch_id || '-';
            c[k] = (c[k] || 0) + 1;
        });
        return c;
    }, [items]);

    // Shared save for the inline editor and the Add modal.
    const persist = async (row, done) => {
        if (!row?.se_name?.trim()) {
            showToast?.('warning', 'SE Name is required');
            return;
        }
        setBusy(true);
        try {
            const res = await axios.post(`${API_BASE_URL}/pms/se-uid`, {
                id: row.id || null,
                se_name: row.se_name.trim(),
                se_uid: (row.se_uid || '').trim(),
                branch_id: (row.branch_id || '').trim(),
            }, { headers });
            if (res.data?.success === false) {
                // A duplicate UID is a real mistake — make it unmissable and
                // leave the form open so it can be corrected.
                await Swal.fire({
                    title: 'Cannot save',
                    text: res.data?.message || 'Could not save',
                    icon: 'warning',
                    confirmButtonColor: themeColor,
                });
                return;
            }
            apply(res.data);
            done?.();
            showToast?.('success', 'SE UID master updated');
        } catch (e) {
            showToast?.('error', e.response?.data?.detail || 'Could not save');
        } finally {
            setBusy(false);
        }
    };

    /* Open one engineer. The three editable fields come straight off the row so
       the dialog paints immediately; his HR record and attendance months are
       fetched behind it and fill in when they land. */
    const openEdit = async (row) => {
        setDraft({ id: row.id, se_name: row.se_name, se_uid: row.se_uid,
            branch_id: row.branch_id, srcRow: row });
        setDetail(null);
        setDetailBusy(true);
        try {
            const res = await axios.get(`${API_BASE_URL}/pms/se-uid/${row.id}/detail`,
                { headers });
            if (res.data?.success) {
                setDetail(res.data);
                const t = res.data.training || {};
                setStatusForm({ status: t.status || '', left_on: t.left_on || '',
                    reason: t.reason || '' });
            }
        } catch {
            setDetail(null);                 // the editable half still works
        } finally {
            setDetailBusy(false);
        }
    };

    const closeEdit = () => { setDraft(null); setDetail(null); setStatusForm(null); };

    /* Save the employment status. It goes to the SAME row the Training Report
       writes, so whatever is set here appears there and the other way round. */
    const saveStatus = async (override) => {
        if (!draft || !statusForm) return;
        const body = override || statusForm;
        setStatusBusy(true);
        try {
            const res = await axios.post(
                `${API_BASE_URL}/pms/se-uid/${draft.id}/status`,
                { status: body.status || null,
                    left_on: body.left_on || null,
                    reason: body.reason || null }, { headers });
            if (res.data?.success === false) {
                showToast?.('warning', res.data.message || 'Could not save the status');
                return;
            }
            showToast?.('success', res.data?.message || 'Status saved');
            // Re-read both: the dialog's own copy and the list behind it, so the
            // row's badge and the Left tab's count move at the same moment.
            const [d, l] = await Promise.all([
                axios.get(`${API_BASE_URL}/pms/se-uid/${draft.id}/detail`, { headers }),
                axios.get(`${API_BASE_URL}/pms/se-uid`, { headers, params: { sync: false } }),
            ]);
            if (d.data?.success) setDetail(d.data);
            apply(l.data);
        } catch (e) {
            showToast?.('error', e.response?.data?.detail || 'Could not save the status');
        } finally {
            setStatusBusy(false);
        }
    };

    const remove = async (row) => {
        const ok = await Swal.fire({
            title: 'Remove from master?',
            html: `<div style="font-size:13px">${row.se_name}</div>`
                + '<div style="font-size:11px;color:#6b7280;margin-top:6px">'
                + 'Their leads and conversion amounts will stop being counted. If the engineer is '
                + 'still in the uploaded files the row comes back on the next Reload from data.</div>',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: themeColor,
            confirmButtonText: 'Remove',
        });
        if (!ok.isConfirmed) return;
        try {
            const res = await axios.delete(`${API_BASE_URL}/pms/se-uid/${row.id}`, { headers });
            apply(res.data);
            showToast?.('success', 'Removed');
        } catch (e) {
            showToast?.('error', e.response?.data?.detail || 'Could not remove');
        }
    };

    // Export = the roster as it stands, which doubles as the import template.
    /* Export = the table as it stands, columns in the same order.
       Only SE Name / SE UID / Branch Code come back in on a re-import — E Code
       and Joining Date are HR's, carried here for reference and IGNORED by the
       importer, which reads those three headers by name. The sheet is still a
       clean round trip because of that: edit the UIDs, import the same file. */
    const EXPORT_HEADER = ['SE Name', 'E Code', 'SE UID', 'Joining Date',
        'Branch Code', 'Status'];

    const downloadTemplate = () => {
        const src = (view === 'missing' || view === 'nobranch') ? filtered : items;
        const rows = (src.length ? src : [{}]).map((r) => ({
            'SE Name': r.se_name || '',
            'E Code': r.e_code || '',
            'SE UID': r.se_uid || '',
            // A real Date, not text — finishDateColumns() turns it into a clean
            // Excel serial so the column filters by Year → Month → Day.
            'Joining Date': dateOnly(r.joining_date),
            'Branch Code': r.branch_id || '',
            'Status': r.status === 'Inactive' ? 'Left' : (r.status || ''),
        }));
        const ws = XLSX.utils.json_to_sheet(rows,
            { header: EXPORT_HEADER, cellDates: true });
        ws['!cols'] = [{ wch: 38 }, { wch: 14 }, { wch: 22 }, { wch: 14 },
            { wch: 16 }, { wch: 10 }];
        finishDateColumns(ws);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'SE UID Master');
        XLSX.writeFile(wb, 'SE_UID_Master.xlsx');
        showToast?.('success', `Downloaded ${rows.length} row${rows.length === 1 ? '' : 's'}`);
    };

    // ---- file sniffing: which of the two layouts was picked? ---------------
    const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
        'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

    /* 'Attendance Summary July.xlsx' -> '2026-07'. The file names its month but
       never its year, so the most recent July that has already begun is the
       default; the picker below lets it be corrected before importing. */
    const monthFromName = (name) => {
        const hit = String(name || '').match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i);
        if (!hit) return '';
        const idx = MONTHS.indexOf(hit[1].toLowerCase());
        const now = new Date();
        const year = String(name).match(/(20\d{2})/);
        const y = year ? Number(year[1]) : (idx > now.getMonth() ? now.getFullYear() - 1
            : now.getFullYear());
        return `${y}-${String(idx + 1).padStart(2, '0')}`;
    };

    /* Read only the header row and decide which file this is — the same test the
       server makes ('E Code' plus one attendance figure), so the dialog can ask
       for a month BEFORE the upload rather than rejecting it afterwards. */
    const pickFile = async (f) => {
        setImportFile(f || null);
        setFileKind(null);
        setAttMonth('');
        if (!f) return;
        try {
            const wb = XLSX.read(await f.arrayBuffer(), { sheetRows: 1 });
            const hdr = (XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],
                { header: 1 })[0] || [])
                .map((h) => String(h ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase());
            /* TWO attendance exports, and either one is accepted:
                 'Attendance July'          Code + D_01 .. D_31, day by day
                 'Attendance Summary July'  E Code + a month total
               The day-wise one is recognised by its day columns, because it
               heads its employee code plainly 'Code' and would otherwise fall
               through to the SE-UID branch and be uploaded with no month. */
            const dayCols = hdr.filter((h) => /^D0*\d{1,2}$/.test(h)).length;
            const isAtt = dayCols >= 20
                || (hdr.includes('ECODE')
                    && ['EMPSTATUS', 'TOTALDAYSMONTH', 'PAYABLEDAYS', 'TOTALPAYABLEDAYS']
                        .some((h) => hdr.includes(h)));
            setFileKind(isAtt ? 'attendance' : 'seuid');
            if (isAtt) setAttMonth(monthFromName(f.name));
        } catch {
            setFileKind('seuid');   // unreadable here — let the server decide
        }
    };

    const monthLabel = (ym) => {
        const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
        return m ? `${['January', 'February', 'March', 'April', 'May', 'June', 'July',
            'August', 'September', 'October', 'November', 'December'][Number(m[2]) - 1]} ${m[1]}`
            : ym;
    };

    const closeImport = () => {
        setShowImport(false);
        setImportFile(null);
        setFileKind(null);
        setAttMonth('');
    };

    const runImport = async () => {
        if (!importFile) return;
        if (fileKind === 'attendance' && !attMonth) {
            showToast?.('warning', 'Choose the month this attendance file covers');
            return;
        }
        const form = new FormData();
        form.append('file', importFile);
        if (attMonth) form.append('month', attMonth);
        setBusy(true);
        try {
            const res = await axios.post(`${API_BASE_URL}/pms/se-uid/import`, form, { headers });
            const d = res.data || {};
            if (d.success === false) {
                showToast?.('warning', d.message || 'Import failed');
                return;
            }
            apply(d);
            const att = d.attendance;
            closeImport();
            const conflicts = d.conflicts || [];
            showToast?.('success', att
                ? `${monthLabel(att.month)} — ${att.stored} employee${att.stored === 1 ? '' : 's'} stored`
                    + `${att.days ? `, ${att.days.toLocaleString('en-IN')} days` : ''}`
                    + `${att.replaced ? ` (replaced ${att.replaced.toLocaleString('en-IN')})` : ''}`
                    + `; master: ${d.inserted} added, ${d.uid_filled} UID filled,`
                    + ` ${d.branch_filled} branch filled`
                : `Imported — ${d.inserted} added, ${d.updated} updated${d.skipped ? `, ${d.skipped} skipped` : ''}`);
            if (conflicts.length) {
                await Swal.fire({
                    title: att
                        ? `${conflicts.length} thing${conflicts.length > 1 ? 's' : ''} to know`
                        : `${conflicts.length} UID${conflicts.length > 1 ? 's' : ''} skipped`,
                    html: '<div style="font-size:12px;text-align:left;max-height:220px;overflow:auto">'
                        + conflicts.slice(0, 20).map((c) => `• ${c}`).join('<br>')
                        + (conflicts.length > 20 ? `<br>… ${conflicts.length - 20} more` : '')
                        + '</div><div style="font-size:11px;color:#6b7280;margin-top:8px">'
                        + (att
                            ? 'The attendance itself was stored in full. The master only ever '
                              + 'FILLS blanks, so anything that disagreed with a value already '
                              + 'there is listed instead of applied.'
                            : 'One UID can belong to only one engineer, so these were left unchanged.')
                        + '</div>',
                    icon: 'warning',
                    confirmButtonColor: themeColor,
                });
            }
            // asked LAST, after the counts and the notes: it is the one thing
            // that wants an answer rather than an acknowledgement
            if ((d.branch_review || []).length) openReview(d.branch_review);
        } catch (e2) {
            showToast?.('error', e2.response?.data?.detail || 'Import failed');
        } finally {
            setBusy(false);
        }
    };

    /* ---- the branch review -------------------------------------------------
       Grouped by the file's OWN spelling of the branch, because that is the
       shape of the question: HR calls a branch something, and either it is not
       a KALA branch name at all ('unknown') or it is a different branch from
       the one the engineer's row holds ('different'). One dropdown answers a
       whole group; a single engineer who really has moved can still be set on
       his own row. */
    const reviewGroups = useMemo(() => {
        const by = new Map();
        review.forEach((r) => {
            const k = r.hr_branch || '—';
            if (!by.has(k)) by.set(k, { hr_branch: k, kind: r.kind, rows: [] });
            const g = by.get(k);
            g.rows.push(r);
            if (r.kind === 'unknown') g.kind = 'unknown';   // one is enough
        });
        return [...by.values()];
    }, [review]);

    const openReview = (rows) => {
        const list = rows || review;
        setReview(list);
        // The default answer is the branch HR names when it IS a KALA branch,
        // and otherwise the branch the row already holds. Nothing is written
        // until Save — closing the dialog changes nothing.
        const p = {}; const g = {}; const rem = {};
        list.forEach((r) => {
            p[r.row_id] = r.hr_branch_id || r.current_branch_id || '';
            if (!(r.hr_branch in g)) g[r.hr_branch] = r.hr_branch_id || '';
            if (r.kind === 'unknown') rem[r.hr_branch] = true;
        });
        setPicks(p); setGrpPicks(g); setRemember(rem);
        setShowReview(true);
    };

    const pickGroup = (hrBranch, bid) => {
        setGrpPicks((prev) => ({ ...prev, [hrBranch]: bid }));
        setPicks((prev) => {
            const next = { ...prev };
            review.filter((r) => r.hr_branch === hrBranch)
                .forEach((r) => { next[r.row_id] = bid; });
            return next;
        });
    };

    const saveReview = async () => {
        // A row left on '— leave as is —' is not sent at all: the master keeps
        // what it had and the question comes back with next month's file.
        const engineers = review
            .filter((r) => (picks[r.row_id] || '') !== '')
            .map((r) => ({ row_id: r.row_id, branch_id: picks[r.row_id] }));
        const aliases = reviewGroups
            .filter((g) => remember[g.hr_branch] && (grpPicks[g.hr_branch] || ''))
            .map((g) => ({ hr_branch: g.hr_branch, branch_id: grpPicks[g.hr_branch] }));
        if (!engineers.length && !aliases.length) {
            showToast?.('warning', 'Pick a branch first');
            return;
        }
        setReviewBusy(true);
        try {
            const res = await axios.post(`${API_BASE_URL}/pms/se-uid/branch-review`,
                { engineers, aliases }, { headers });
            const d = res.data || {};
            if (d.success === false) {
                showToast?.('warning', d.message || 'Could not save the branches');
                return;
            }
            apply(d);
            setShowReview(false);
            loadReview();          // whatever was left on 'leave as is'
            showToast?.('success',
                `${d.pinned} engineer${d.pinned === 1 ? '' : 's'} placed`
                + (d.aliased
                    ? `, ${d.aliased} HR branch name${d.aliased === 1 ? '' : 's'} remembered`
                    : ''));
        } catch (e2) {
            showToast?.('error', e2.response?.data?.detail || 'Could not save the branches');
        } finally {
            setReviewBusy(false);
        }
    };

    // Branch picker. Only a REAL KALA branch can be pinned, so this is a fixed
    // list, never free text — the reports group on the branch id.
    const branchSelect = (value, onChange, cls) => (
        <select value={value || ''} onChange={(e) => onChange(e.target.value)} className={cls}>
            <option value="">— none —</option>
            {branches.map((b) => (
                <option key={b.branch_id} value={b.branch_id}>
                    {b.branch_name} ({b.branch_id})
                </option>
            ))}
        </select>
    );
    const btnCls = 'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50';

    // Which uploaded file the engineer was found in. 'Manual' = added by hand
    // and present in neither file.
    //
    // Each file keeps its OWN fixed slot (MaxTTR | LMS | EFSR) so the tags line
    // up down the column — a missing file leaves its slot blank instead of
    // sliding the others left.
    const SRC_SLOTS = [
        ['in_maxttr', 'MaxTTR', 'bg-indigo-50 text-indigo-700 border-indigo-200'],
        ['in_lms', 'LMS', 'bg-sky-50 text-sky-700 border-sky-200'],
        ['in_efsr', 'EFSR', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
        // Not a KOEL data file — the HR Attendance Summary. A row wearing ONLY
        // this badge is somebody HR employs who has never appeared in the
        // service data: a new joiner, or one of the non-engineer staff.
        ['in_hr', 'HR', 'bg-amber-50 text-amber-700 border-amber-200'],
    ];

    /* Employment status as the TRAINING REPORT holds it — this master never sets
       it. 'Inactive' is shown as 'Left' because that is what it means to the
       people reading this page; a dot marks the ones typed by hand there, which
       beat the uploaded file. Blank = the Training Report has no word on them. */
    const statusLabel = (row) => {
        if (!row.status) {
            return <span className="text-gray-300" title="No employment status in the Training Report">—</span>;
        }
        const left = row.status === 'Inactive';
        const manual = row.status_source === 'manual';
        return (
            <span
                title={`${left ? 'Left' : 'Active'} — ${manual
                    ? 'typed on the Training Report' : 'from the uploaded training file'}`
                    + (row.left_on ? `, last day ${dmy(row.left_on)}` : '')
                    + (row.reason ? ` — ${row.reason}` : '')}
                className={`text-[9px] leading-[13px] px-1.5 py-px rounded border ${left
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : 'bg-green-50 text-green-700 border-green-200'}`}>
                {left ? 'Left' : 'Active'}{manual ? ' •' : ''}
            </span>
        );
    };

    const srcLabel = (row) => {
        const none = !SRC_SLOTS.some(([key]) => row[key]);
        if (none) {
            return (
                <span className="text-[9px] px-1 py-px rounded border bg-gray-100 text-gray-500 border-gray-300">
                    Manual
                </span>
            );
        }
        return (
            <span className="inline-grid gap-1 align-middle"
                style={{ gridTemplateColumns: '44px 27px 32px 22px' }}>
                {SRC_SLOTS.map(([key, label, cls]) => (
                    row[key] ? (
                        <span key={key}
                            className={`text-[9px] leading-[13px] px-1 py-px rounded border text-center ${cls}`}>
                            {label}
                        </span>
                    ) : <span key={key} />
                ))}
            </span>
        );
    };

    // One engineer row. `no` is its Sr. No. in the filtered list.
    const renderRow = (row, no) => {
        return (
            <tr key={row.id} className="hover:bg-gray-50/60">
                <td className={`${tdCls} text-center text-gray-500 tabular-nums`}>{no}</td>
                <td className={`${tdCls} text-gray-800 font-medium`}>{row.se_name}</td>
                <td className={`${tdCls} text-center text-black tabular-nums`}>
                    {row.e_code || <span className="text-gray-300">—</span>}
                </td>
                <td className={`${tdCls} text-center text-black tabular-nums`}>
                    {row.uids?.length ? row.uids.join(', ') : <span className="text-amber-600">—</span>}
                </td>
                <td className={`${tdCls} text-center text-[11px] text-black tabular-nums whitespace-nowrap`}>
                    {row.joining_date ? dmy(row.joining_date) : <span className="text-gray-300">—</span>}
                </td>
                <td className={`${tdCls} text-center text-[11px] text-black tabular-nums`}>
                    {row.branch_id || <span className="text-amber-600">—</span>}
                </td>
                <td className={`${tdCls} text-[11px] text-gray-700`}>
                    {row.branch_name || (row.branch_id
                        ? <span className="text-gray-400">not in the branch master</span>
                        : <span className="text-amber-600" title="No KALA branch in any uploaded file — set it here so the PMS reports can place this engineer">—</span>)}
                </td>
                <td className={`${tdCls} text-center`}>{statusLabel(row)}</td>
                <td className={`${tdCls} text-center`}>{srcLabel(row)}</td>
                <td className={`${tdCls} text-center whitespace-nowrap`}>
                    <button onClick={() => openEdit(row)}
                        title="Open this engineer" className="p-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">
                        <FaEdit className="text-[11px]" />
                    </button>
                    <button onClick={() => remove(row)} title="Remove"
                        className="ml-1 p-1 rounded bg-red-50 text-red-600 hover:bg-red-100">
                        <FaTrash className="text-[11px]" />
                    </button>
                </td>
            </tr>
        );
    };

    return (
        <div>
            {/* ---- header ---- */}
            <div className="flex flex-wrap items-start gap-3 mb-3">
                <div className="mr-auto min-w-[240px]">
                    <h3 className="text-sm sm:text-base font-semibold text-black flex items-center gap-2">
                        <FaIdCard style={{ color: themeColor }} />
                        <span>SE UID Master</span>
                    </h3>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                        Saved engineer list. The Employee Productivity report reads each
                        engineer&apos;s UID from here.
                    </p>
                    {/* WHICH MONTH IS IN. The attendance is uploaded month by
                        month from the Import button, and the one question that
                        was impossible to answer without opening a report was
                        'did July go in?'. */}
                    {attMonths.length > 0 && (
                        <p className="text-[11px] text-gray-600 mt-0.5">
                            HR attendance &mdash; last month added:{' '}
                            <b className="text-gray-800">{monthLabel(attMonths[0].month)}</b>
                            <span className="text-gray-500">
                                {' '}({attMonths[0].employees} employee{attMonths[0].employees === 1 ? '' : 's'}
                                {attMonths[0].last_at ? ` on ${dmy(attMonths[0].last_at.slice(0, 10))}` : ''})
                            </span>
                            {attMonths.length > 1 && (
                                <span className="text-gray-400">
                                    {' '}&middot; {attMonths.length} months on record
                                </span>
                            )}
                        </p>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => load(true, false)} disabled={loading || busy} className={btnCls}
                        title="Re-scan the MaxTTR, LMS & EFSR files — adds new engineers, fills missing UIDs and branches, and saves. Nothing already filled in is overwritten.">
                        <FaSyncAlt className={`text-[11px] ${loading ? 'animate-spin' : ''}`} /> Reload from data
                    </button>
                    {canExportExcel(user) && (
                        <button onClick={downloadTemplate} disabled={busy} className={btnCls}>
                            <MdOutlineFileUpload className="text-sm" /> Export
                        </button>
                    )}
                    <button onClick={() => setShowImport(true)} disabled={busy} className={btnCls}>
                        <MdOutlineFileDownload className="text-sm" /> Import Excel
                    </button>
                    <button onClick={() => setAddForm({ se_name: '', se_uid: '', branch_id: '' })}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg hover:opacity-90"
                        style={{ backgroundColor: themeColor }}>
                        <FaPlus className="text-[10px]" /> Add SE
                    </button>
                </div>
            </div>

            {review.length > 0 && !showReview && (
                <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 flex flex-wrap items-center gap-2">
                    <span>
                        <b>{review.length} engineer{review.length > 1 ? 's' : ''}</b> &mdash; the HR attendance
                        file names a branch that is not the one on the master row, or a branch name that is
                        no KALA branch. Nothing was overwritten.
                    </span>
                    <button onClick={() => openReview()}
                        className="ml-auto px-2.5 py-1 rounded-md text-[11px] font-medium text-white"
                        style={{ backgroundColor: themeColor }}>
                        Review branches
                    </button>
                </div>
            )}

            {dupUids.length > 0 && (
                <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                    <b>{dupUids.length} UID{dupUids.length > 1 ? 's are' : ' is'} on more than one engineer.</b>{' '}
                    The report resolves a lead by UID, so those leads land on only one of them — clear the
                    duplicate from whichever row is wrong.
                    <div className="mt-1 space-y-0.5">
                        {dupUids.map((d) => (
                            <div key={d.uid}>
                                <span className="font-semibold tabular-nums">{d.uid}</span> — {d.names.join(', ')}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ---- toolbar ---- */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
                <div className="inline-flex items-center bg-gray-100 rounded-lg p-0.5">
                    {[['all', `All (${stats.total})`],
                    ['missing', `UID missing (${stats.missing})`],
                    ['linked', `UID linked (${stats.with_uid})`],
                    ['nobranch', `Branch missing (${noBranch})`],
                    ['left', `Left (${stats.left || 0})`]].map(([k, label]) => (
                        <button key={k}
                            onClick={() => { setView(k); if (k === 'nobranch') setBrSel(''); }}
                            className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${view === k
                                ? 'bg-white shadow border border-gray-200 text-gray-900'
                                : 'text-gray-500 hover:text-gray-800'}`}>
                            {label}
                        </button>
                    ))}
                </div>
                <select value={brSel} onChange={(e) => setBrSel(e.target.value)}
                    title="Show only the engineers of one branch"
                    className={`ml-auto px-2 py-1.5 text-xs border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#2f3192] ${
                        brSel ? 'border-[#2f3192] text-[#2f3192] font-medium' : 'border-gray-300 text-gray-700'}`}>
                    <option value="">All branches ({items.length})</option>
                    {branches.map((b) => (
                        <option key={b.branch_id} value={b.branch_id}>
                            {b.branch_name} ({brCounts[b.branch_id] || 0})
                        </option>
                    ))}
                    <option value="-">No branch — ({brCounts['-'] || 0})</option>
                </select>
                <div className="relative">
                    <FaSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search name, E Code or UID"
                        className="pl-7 pr-2 py-1.5 w-52 text-xs border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-[#2f3192]" />
                </div>
            </div>

            {/* ---- grid: ONE table, every engineer in one continuous list ---- */}
            {loading ? (
                <div className="h-56 flex flex-col items-center justify-center gap-2 text-gray-400">
                    <FaSyncAlt className="h-6 w-6 animate-spin" />
                    <p className="text-sm">Loading engineers…</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="h-56 flex flex-col items-center justify-center gap-2 text-gray-400">
                    <FaIdCard className="h-7 w-7" />
                    <p className="text-sm">
                        {items.length === 0
                            ? 'No engineers yet — upload the MaxTTR, LMS & EFSR files, then Reload from data.'
                            : 'No engineer matches this filter.'}
                    </p>
                </div>
            ) : (
                /* The list is long, so it scrolls inside its own box with the
                   header pinned — one continuous table beats two half-tables the
                   eye has to jump between, and the Sr. No. now simply counts. */
                <div className="overflow-auto max-h-[70vh] rounded-lg border border-gray-400">
                    <table className="w-full text-xs border-collapse min-w-[1060px]">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th className={thCls} style={{ width: 58 }}>Sr. No.</th>
                                <th className={thCls}>SE Name</th>
                                {/* Both come from the HR Attendance Summary upload, not
                                    from this master — blank until a month is imported
                                    that reaches this engineer. */}
                                <th className={thCls} style={{ width: 96 }}>E Code</th>
                                <th className={thCls} style={{ width: 150 }}>SE UID</th>
                                <th className={thCls} style={{ width: 104 }}>Joining Date</th>
                                <th className={thCls} style={{ width: 96 }}>Branch Code</th>
                                <th className={thCls} style={{ width: 150 }}>Branch</th>
                                <th className={thCls} style={{ width: 88 }}>Status</th>
                                <th className={thCls} style={{ width: 140 }}>From File</th>
                                <th className={thCls} style={{ width: 80 }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((row, i) => renderRow(row, i + 1))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="mt-2 text-[11px] text-gray-500 space-y-0.5">
                <p>
                    Showing {filtered.length} of {items.length} engineers · {stats.with_branch || 0} with
                    a branch{stats.left ? ` · ${stats.left} left` : ''}
                </p>
                <p>
                    <b>E Code</b> &amp; <b>Joining Date</b> from the HR Attendance import ·
                    <b> Status</b> from the Training Report ·
                    <span className="text-gray-400 font-semibold"> —</span> = that source has no row
                </p>
                <p>
                    <b>Import</b> and <b>Reload from data</b> only fill blanks — nothing you set here
                    is ever overwritten
                </p>
            </div>

            {/* ================= EDIT / DETAIL MODAL ================= */}
            {draft && (
                <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center p-4 max-md:p-2 z-50">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">
                        {/* ---- header ---- */}
                        <div className="flex justify-between items-start gap-3 p-5 pb-3 border-b border-gray-200">
                            <div className="min-w-0">
                                <h3 className="text-base sm:text-lg font-semibold text-black flex items-center gap-2">
                                    <FaIdCard className="text-[#2f3192] shrink-0" />
                                    <span className="truncate">{draft.se_name || 'Service Engineer'}</span>
                                </h3>
                                <div className="flex items-center gap-2 mt-1">
                                    {srcLabel(draft.srcRow || {})}
                                    <span className="text-[11px] text-gray-500">
                                        {detailBusy ? 'loading HR record…'
                                            : detail?.hr
                                                ? `${detail.hr.months} month${detail.hr.months > 1 ? 's' : ''} of attendance on record`
                                                : 'no HR attendance uploaded for this engineer'}
                                    </span>
                                </div>
                            </div>
                            <button onClick={closeEdit}
                                className="text-black hover:text-gray-600 transition-colors p-1 shrink-0">
                                <FaTimes />
                            </button>
                        </div>

                        <div className="overflow-y-auto p-5 space-y-4">
                            {/* ---- the three fields this master owns ---- */}
                            <div>
                                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                    Master record — editable
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-xs text-black mb-1">
                                            SE Name <span className="text-red-500">*</span>
                                        </label>
                                        <input autoFocus value={draft.se_name}
                                            onChange={(e) => setDraft({ ...draft, se_name: e.target.value })}
                                            className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-[#2f3192]" />
                                        <p className="text-[10px] text-gray-500 mt-1">
                                            Spelt as the MaxTTR file spells it.
                                        </p>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-black mb-1">SE UID</label>
                                        <input value={draft.se_uid || ''}
                                            onChange={(e) => setDraft({ ...draft, se_uid: e.target.value })}
                                            placeholder="UID (comma-separate if more than one)"
                                            className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-black tabular-nums focus:outline-none focus:ring-2 focus:ring-[#2f3192]" />
                                        <p className="text-[10px] text-gray-500 mt-1">
                                            One UID can belong to only one engineer.
                                        </p>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-black mb-1">Branch</label>
                                        {branchSelect(draft.branch_id,
                                            (v) => setDraft({ ...draft, branch_id: v }),
                                            'w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-black bg-white focus:outline-none focus:ring-2 focus:ring-[#2f3192]')}
                                        <p className="text-[10px] text-gray-500 mt-1">
                                            {draft.branch_id
                                                ? <>Branch Code: <b className="tabular-nums">{draft.branch_id}</b></>
                                                : 'Fallback for engineers no file places in a KALA branch.'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* ---- the HR half: read-only, it belongs to the upload ---- */}
                            <div>
                                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                    HR record — from the monthly attendance upload
                                </p>
                                {detailBusy && (
                                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-xs text-gray-500">
                                        Loading…
                                    </div>
                                )}
                                {!detailBusy && !detail?.hr && (
                                    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-center">
                                        <p className="text-xs text-gray-600">
                                            No attendance row matched this engineer.
                                        </p>
                                        <p className="text-[11px] text-gray-500 mt-1">
                                            The import matches by UID first and by name second — so either
                                            no month has been uploaded yet, or HR spells the name
                                            differently and this row carries no UID to link them.
                                        </p>
                                    </div>
                                )}
                                {!detailBusy && detail?.hr && (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2">
                                            {[
                                                ['E Code', detail.hr.e_code],
                                                ['UID', detail.hr.uid],
                                                ['Name in HR file', detail.hr.employee_name],
                                                ['Designation', detail.hr.designation],
                                                ['Joining Date', dmy(detail.hr.joining_date)],
                                                ['Branch (HR)', detail.hr.branch],
                                                ['Branch Code', detail.hr.branch_id],
                                            ].map(([label, value]) => (
                                                <div key={label} className="min-w-0">
                                                    <p className="text-[10px] uppercase tracking-wide text-amber-700/80">{label}</p>
                                                    <p className="text-xs text-black font-medium break-words">
                                                        {value || <span className="text-gray-400">—</span>}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-[10px] text-amber-700 mt-2">
                                            Matched to this engineer by <b>{detail.hr.matched_by === 'uid' ? 'UID' : 'name'}</b>.
                                            Read-only — it changes only when a new attendance file is imported.
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* ---- employment status: edited here, stored by the
                                 Training Report, so both pages show one answer ---- */}
                            {!detailBusy && !!statusForm && (() => {
                                const t = detail?.training || {};
                                const manual = t.status_source === 'manual';
                                // What is SAVED, versus what is in the boxes below.
                                // Shown apart so a half-typed change is never mistaken
                                // for the standing answer.
                                const dirty = (statusForm.status || '') !== (t.status || '')
                                    || (statusForm.left_on || '') !== (t.left_on || '')
                                    || (statusForm.reason || '') !== (t.reason || '');
                                return (
                                    <div>
                                        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                            Employment status — shared with the Training Report
                                        </p>

                                        {/* ---- what is on record now ---- */}
                                        <div className="rounded-t-lg border border-b-0 border-indigo-200 bg-white px-3 py-2.5">
                                            {!t.status ? (
                                                <p className="text-[11px] text-gray-500">
                                                    No status on record — this engineer follows whatever the
                                                    uploaded training file says.
                                                </p>
                                            ) : (
                                                /* One fact per LINE, label beside value — the four
                                                   read as a record, not as a squeezed toolbar. */
                                                <dl className="grid gap-y-1.5"
                                                    style={{ gridTemplateColumns: 'max-content minmax(0,1fr)' }}>
                                                    <dt className="text-[11px] font-semibold text-black pr-5 self-center">On record</dt>
                                                    <dd className="m-0 self-center flex flex-wrap items-center gap-2">
                                                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${t.status === 'Inactive'
                                                            ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                                            {t.status === 'Inactive' ? 'Left' : 'Active'}
                                                        </span>
                                                        {/* Coming back is one click. The same choice is in the
                                                            dropdown below, but a rejoining engineer should not
                                                            need three steps to be put back on the roster. */}
                                                        {t.status === 'Inactive' && (
                                                            <button
                                                                onClick={() => saveStatus({ status: 'Active', left_on: '', reason: '' })}
                                                                disabled={statusBusy || !draft.se_uid}
                                                                title="Put this engineer back on the roster — the last working day is cleared"
                                                                className="px-2 py-0.5 rounded-full text-[10px] font-semibold border
                                                                    border-green-300 text-green-800 bg-green-50 hover:bg-green-100
                                                                    disabled:opacity-40">
                                                                {statusBusy ? 'Saving…' : 'Make active again'}
                                                            </button>
                                                        )}
                                                    </dd>

                                                    {t.left_on && (
                                                        <>
                                                            <dt className="text-[11px] font-semibold text-black pr-5">Last working day</dt>
                                                            <dd className="m-0 text-xs text-black tabular-nums">{dmy(t.left_on)}</dd>
                                                        </>
                                                    )}

                                                    {t.reason && (
                                                        <>
                                                            <dt className="text-[11px] font-semibold text-black pr-5">Reason</dt>
                                                            <dd className="m-0 text-xs text-black break-words">{t.reason}</dd>
                                                        </>
                                                    )}

                                                    <dt className="text-[11px] font-semibold text-black pr-5">Set by</dt>
                                                    <dd className="m-0 text-xs text-gray-600">
                                                        {manual ? 'Hand' : 'Training file'}
                                                        {manual && t.set_by ? ` · ${t.set_by}` : ''}
                                                        {manual && t.set_at ? ` · ${dmy(t.set_at)}` : ''}
                                                    </dd>
                                                </dl>
                                            )}
                                        </div>

                                        {/* ---- change it ---- */}
                                        <div className="rounded-b-lg border border-indigo-200 bg-indigo-50/60 p-3">
                                            <div className="flex flex-wrap items-end gap-3">
                                                {/* Wide enough for the longest option —
                                                    'Not set — use the file' was being cut off. */}
                                                <div className="w-52">
                                                    <label className="block text-[10px] uppercase tracking-wide text-indigo-700/80 mb-1">
                                                        Status
                                                    </label>
                                                    <select value={statusForm.status}
                                                        onChange={(e) => setStatusForm({ ...statusForm,
                                                            status: e.target.value,
                                                            left_on: e.target.value === 'Inactive' ? statusForm.left_on : '' })}
                                                        className="w-full px-2 py-1 text-xs border border-indigo-300 rounded text-black bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500">
                                                        <option value="">Not set — use the file</option>
                                                        <option value="Active">Active</option>
                                                        <option value="Inactive">Left</option>
                                                    </select>
                                                </div>
                                                {statusForm.status === 'Inactive' && (
                                                    <>
                                                        <div className="w-40">
                                                            <label className="block text-[10px] uppercase tracking-wide text-indigo-700/80 mb-1">
                                                                Last working day
                                                            </label>
                                                            <input type="date" value={statusForm.left_on || ''}
                                                                onChange={(e) => setStatusForm({ ...statusForm, left_on: e.target.value })}
                                                                className="w-full px-2 py-1 text-xs border border-indigo-300 rounded text-black bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                                                        </div>
                                                        <div className="flex-1 min-w-[180px]">
                                                            <label className="block text-[10px] uppercase tracking-wide text-indigo-700/80 mb-1">
                                                                Reason (optional)
                                                            </label>
                                                            <input value={statusForm.reason || ''}
                                                                onChange={(e) => setStatusForm({ ...statusForm, reason: e.target.value })}
                                                                placeholder="Resigned, transferred…"
                                                                className="w-full px-2 py-1 text-xs border border-indigo-300 rounded text-black bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                                                        </div>
                                                    </>
                                                )}
                                                <button onClick={saveStatus}
                                                    disabled={statusBusy || !draft.se_uid || !dirty}
                                                    title={!draft.se_uid
                                                        ? 'Give this engineer a UID first — the status is stored against the UID'
                                                        : dirty ? 'Save the status' : 'Nothing changed yet'}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40 flex items-center gap-1.5"
                                                    style={{ backgroundColor: themeColor }}>
                                                    <FaSave className="text-[11px]" />
                                                    {statusBusy ? 'Saving…' : 'Save status'}
                                                </button>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mt-2.5 pt-2
                                                border-t border-indigo-200/70">
                                                <span className="text-[10px] text-indigo-700/80">
                                                    Ticket No.{' '}
                                                    <b className="text-black tabular-nums">{t.ticket_no || '—'}</b>
                                                </span>
                                                {dirty && (
                                                    <span className="text-[10px] font-semibold text-amber-700">
                                                        Not saved yet — press Save status
                                                    </span>
                                                )}
                                                {!draft.se_uid && (
                                                    <span className="text-[10px] text-red-600 font-medium">
                                                        No UID on this engineer — add one above and save before
                                                        setting a status.
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-gray-500 mt-1.5">
                                            One status, one place. Saving here is the same as saving it in
                                            <b> PMS → Training Report</b> — each page shows what the other
                                            set. <b>Not set</b> clears it and hands the engineer back to
                                            whatever the uploaded training file says.
                                        </p>
                                    </div>
                                );
                            })()}

                            {/* ---- month by month ---- */}
                            {!detailBusy && !!detail?.months?.length && (
                                <div>
                                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                        Attendance, month by month
                                    </p>
                                    <div className="overflow-x-auto border border-gray-400 rounded">
                                        <table className="text-xs border-collapse w-full">
                                            <thead>
                                                <tr>
                                                    <th className={thCls}>Month</th>
                                                    {detail.figures.map((f) => (
                                                        <th key={f} className={thCls}>{FIG_LABELS[f] || f}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {detail.months.map((m) => (
                                                    <tr key={m.period_month} className="hover:bg-gray-50/60">
                                                        <td className={`${tdCls} whitespace-nowrap font-medium text-gray-800`}>
                                                            {monthLabel(m.period_month)}
                                                        </td>
                                                        {detail.figures.map((f) => (
                                                            <td key={f} className={`${tdCls} text-center tabular-nums text-black`}>
                                                                {m[f] == null ? <span className="text-gray-300">—</span> : num(m[f])}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-1.5">
                                        Half days are kept as fractions, exactly as HR sends them. A blank
                                        cell is a figure the file did not carry — not a zero.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* ---- footer ---- */}
                        <div className="flex items-center gap-2 p-5 pt-3 border-t border-gray-200">
                            <button onClick={() => { const r = draft.srcRow; closeEdit(); remove(r); }}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 flex items-center gap-1.5">
                                <FaTrash className="text-[11px]" /> Remove
                            </button>
                            <button onClick={closeEdit}
                                className="ml-auto px-4 py-1.5 rounded-lg text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200">
                                Cancel
                            </button>
                            <button onClick={() => persist(draft, closeEdit)}
                                disabled={busy || !draft.se_name?.trim()}
                                className="px-4 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50 flex items-center justify-center gap-2"
                                style={{ backgroundColor: themeColor }}>
                                <FaSave className="text-[11px]" /> {busy ? 'Saving…' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ================= ADD SE MODAL ================= */}
            {addForm && (
                <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center p-4 max-md:p-2 z-50">
                    <div className="bg-white rounded-xl p-5 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-base sm:text-lg font-semibold text-black flex items-center space-x-2">
                                <FaIdCard className="text-[#2f3192]" />
                                <span>Add Service Engineer</span>
                            </h3>
                            <button onClick={() => setAddForm(null)}
                                className="text-black hover:text-gray-600 transition-colors p-1">
                                <FaTimes />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs text-black mb-1">
                                    SE Name <span className="text-red-500">*</span>
                                </label>
                                <input autoFocus value={addForm.se_name}
                                    onChange={(e) => setAddForm({ ...addForm, se_name: e.target.value })}
                                    placeholder="Exactly as spelt in the MaxTTR file"
                                    className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-[#2f3192]" />
                            </div>
                            <div>
                                <label className="block text-xs text-black mb-1">SE UID</label>
                                <input value={addForm.se_uid}
                                    onChange={(e) => setAddForm({ ...addForm, se_uid: e.target.value })}
                                    placeholder="LMS Service Engineer UID"
                                    className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-[#2f3192]" />
                                <p className="text-[11px] text-gray-500 mt-1">
                                    Comma-separate to give one engineer several UIDs. Adding a name that
                                    already exists updates that row instead of duplicating it.
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs text-black mb-1">Branch</label>
                                {branchSelect(addForm.branch_id,
                                    (v) => setAddForm({ ...addForm, branch_id: v }),
                                    'w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-black bg-white focus:outline-none focus:ring-2 focus:ring-[#2f3192]')}
                                {addForm.branch_id && (
                                    <p className="text-[11px] text-gray-600 mt-1">
                                        Branch Code: <b className="tabular-nums">{addForm.branch_id}</b>
                                    </p>
                                )}
                                <p className="text-[11px] text-gray-500 mt-1">
                                    Only needed when the uploaded files never give this engineer a valid
                                    KALA branch code — the PMS reports read the files first and fall back
                                    to this. Leave it blank otherwise.
                                </p>
                            </div>
                        </div>

                        <div className="flex space-x-2 mt-5">
                            <button onClick={() => setAddForm(null)}
                                className="flex-1 py-1.5 rounded-lg text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200">
                                Cancel
                            </button>
                            <button onClick={() => persist(addForm, () => setAddForm(null))}
                                disabled={busy || !addForm.se_name.trim()}
                                className="flex-1 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50 flex items-center justify-center gap-2"
                                style={{ backgroundColor: themeColor }}>
                                <FaSave className="text-[11px]" /> {busy ? 'Saving…' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ================= IMPORT MODAL ================= */}
            {showImport && (
                <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center p-4 max-md:p-2 z-50">
                    <div className="bg-white rounded-xl p-5 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-base sm:text-lg font-semibold text-black flex items-center space-x-2">
                                <CiImport className="text-[#2f3192]" />
                                <span>Import SE UID Master</span>
                            </h3>
                            <button onClick={closeImport}
                                className="text-black hover:text-gray-600 transition-colors p-1">
                                <FaTimes />
                            </button>
                        </div>

                        <div className="mb-4">
                            <p className="text-xs text-black mb-2">
                                Either of two files — the layout is recognised on its own:
                            </p>
                            <div className="bg-gray-50 p-2.5 rounded-lg text-xs overflow-x-auto space-y-1">
                                <p className="font-mono whitespace-nowrap">SE Name, SE UID, Branch Code (optional)</p>
                                <p className="font-mono whitespace-nowrap text-amber-700">E Code, UID, Employee Name, … (HR Attendance Summary)</p>
                            </div>
                            <p className="text-[11px] text-gray-500 mt-2">
                                An existing name updates its UID instead of adding a duplicate. Use
                                <b> Export</b> to download the current list, fill in the UIDs
                                and import the same file back.
                            </p>
                        </div>

                        {/* WHAT IS ALREADY IN, newest first — so a month is not
                            uploaded twice over and a missing one is visible
                            before the file is even picked. */}
                        {attMonths.length > 0 && (
                            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2">
                                <p className="text-[11px] text-gray-800">
                                    <b>Last attendance month added:</b>{' '}
                                    {monthLabel(attMonths[0].month)}
                                    <span className="text-gray-500">
                                        {' '}&middot; {attMonths[0].employees} employee{attMonths[0].employees === 1 ? '' : 's'}
                                        {' '}&middot; {attMonths[0].kind === 'day' ? 'day-wise file' : 'summary file'}
                                        {attMonths[0].last_at ? ` · uploaded ${dmy(attMonths[0].last_at.slice(0, 10))}` : ''}
                                    </span>
                                </p>
                                {attMonths.length > 1 && (
                                    <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
                                        Also on record:{' '}
                                        {attMonths.slice(1, 13).map((m) => monthLabel(m.month)).join(' · ')}
                                        {attMonths.length > 13 ? ` … ${attMonths.length - 13} more` : ''}
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                            <input type="file" accept=".xlsx,.xls" id="se-uid-import-file" className="hidden"
                                onChange={(e) => pickFile(e.target.files?.[0] || null)} />
                            <label htmlFor="se-uid-import-file" className="cursor-pointer flex flex-col items-center">
                                <FaUpload className="text-black text-2xl mb-2" />
                                <span className="text-xs text-black font-medium break-all text-center">
                                    {importFile ? importFile.name : 'Click to select file'}
                                </span>
                                {!importFile && <span className="text-xs text-black mt-1">Excel only</span>}
                            </label>
                        </div>

                        {/* The attendance file carries no month of its own, so it is
                            asked for here — pre-filled from the file name. */}
                        {fileKind === 'attendance' && (
                            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                                <p className="text-[11px] font-semibold text-amber-800 mb-2">
                                    HR Attendance Summary — which month does it cover?
                                </p>
                                <input type="month" value={attMonth}
                                    onChange={(e) => setAttMonth(e.target.value)}
                                    className="w-full px-2 py-1 text-xs border border-amber-300 rounded text-black bg-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
                                <p className="text-[10px] text-amber-700 mt-2 leading-relaxed">
                                    Attendance is stored month by month. Importing
                                    {attMonth ? ` ${monthLabel(attMonth)}` : ' a month'} again replaces
                                    only that month. The SE UID Master is then filled from the
                                    file — missing UIDs and empty branches only, never over a
                                    value already set here.
                                </p>
                            </div>
                        )}

                        <div className="flex space-x-2 mt-5">
                            <button onClick={closeImport}
                                className="flex-1 py-1.5 rounded-lg text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200">
                                Cancel
                            </button>
                            <button onClick={runImport}
                                disabled={!importFile || busy || (fileKind === 'attendance' && !attMonth)}
                                className="flex-1 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50 flex items-center justify-center gap-2"
                                style={{ backgroundColor: themeColor }}>
                                <CiImport className="text-sm" /> {busy ? 'Importing…' : 'Import'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* ================= BRANCH REVIEW ================= */}
            {showReview && review.length > 0 && (
                <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center p-4 max-md:p-2 z-50">
                    <div className="bg-white rounded-xl p-5 max-w-3xl w-full shadow-2xl max-h-[90vh] flex flex-col">
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <h3 className="text-base sm:text-lg font-semibold text-black flex items-center gap-2">
                                    <FaIdCard style={{ color: themeColor }} />
                                    <span>Branch is different &mdash; which one is right?</span>
                                </h3>
                                <p className="text-[11px] text-gray-500 mt-0.5">
                                    The HR file places {review.length} engineer{review.length > 1 ? 's' : ''} in a
                                    branch that is not the one on the master row. <b>Nothing was overwritten</b> &mdash;
                                    pick the branch each one belongs to and it is saved here for good.
                                </p>
                            </div>
                            <button onClick={() => setShowReview(false)}
                                className="text-black hover:text-gray-600 transition-colors p-1">
                                <FaTimes />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-3 pr-0.5">
                            {reviewGroups.map((g) => (
                                <div key={g.hr_branch} className="rounded-lg border border-gray-300">
                                    {/* One answer for the whole branch: HR renaming a
                                        branch is the common case, an engineer really
                                        being posted elsewhere is the rare one. */}
                                    <div className={`px-3 py-2 border-b flex flex-wrap items-center gap-2 ${
                                        g.kind === 'unknown'
                                            ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-300'}`}>
                                        <div className="min-w-[220px]">
                                            <p className="text-[11px] text-gray-500">HR&apos;s file says</p>
                                            <p className="text-xs font-semibold text-black">{g.hr_branch}</p>
                                            <p className="text-[10px] text-gray-500">
                                                {g.kind === 'unknown'
                                                    ? 'not a KALA branch name'
                                                    : 'a KALA branch, but not the one on the row'}
                                                {' '}&middot; {g.rows.length} engineer{g.rows.length > 1 ? 's' : ''}
                                            </p>
                                        </div>
                                        <div className="ml-auto flex flex-wrap items-center gap-2">
                                            <span className="text-[11px] text-gray-600">Map all to</span>
                                            {branchSelect(grpPicks[g.hr_branch],
                                                (v) => pickGroup(g.hr_branch, v),
                                                'px-2 py-1 text-xs border border-gray-300 rounded-lg text-black bg-white focus:outline-none focus:ring-1 focus:ring-[#2f3192]')}
                                            <label className="flex items-center gap-1 text-[10px] text-gray-600"
                                                title="Remember this spelling, so the next month resolves it on its own">
                                                <input type="checkbox"
                                                    checked={!!remember[g.hr_branch]}
                                                    onChange={(e) => setRemember((prev) => ({
                                                        ...prev, [g.hr_branch]: e.target.checked }))} />
                                                remember this name
                                            </label>
                                        </div>
                                    </div>
                                    <table className="w-full text-xs border-collapse">
                                        <thead>
                                            <tr>
                                                <th className={thCls}>SE Name</th>
                                                <th className={thCls} style={{ width: 96 }}>E Code</th>
                                                <th className={thCls} style={{ width: 150 }}>On the master now</th>
                                                <th className={thCls} style={{ width: 210 }}>Belongs to</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {g.rows.map((r) => (
                                                <tr key={r.row_id} className="hover:bg-gray-50/60">
                                                    <td className={`${tdCls} text-gray-800 font-medium`}>
                                                        {r.se_name}
                                                        {r.se_uid && (
                                                            <span className="text-[10px] text-gray-400 ml-1 tabular-nums">
                                                                {r.se_uid}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className={`${tdCls} text-center text-black tabular-nums`}>
                                                        {r.e_code || <span className="text-gray-300">&mdash;</span>}
                                                    </td>
                                                    <td className={`${tdCls} text-[11px] text-gray-700`}>
                                                        {r.current_branch_name || r.current_branch_id
                                                            || <span className="text-amber-600">no branch</span>}
                                                    </td>
                                                    <td className={`${tdCls}`}>
                                                        {branchSelect(picks[r.row_id],
                                                            (v) => setPicks((prev) => ({ ...prev, [r.row_id]: v })),
                                                            'w-full px-2 py-1 text-xs border border-gray-300 rounded-lg text-black bg-white focus:outline-none focus:ring-1 focus:ring-[#2f3192]')}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ))}
                        </div>

                        <p className="text-[10px] text-gray-500 mt-3 leading-relaxed">
                            A branch saved here is <b>pinned</b>: later monthly uploads neither change it nor ask
                            about it again. Leave a row on <b>&mdash; none &mdash;</b> to decide it next month
                            instead &mdash; the master keeps what it has either way.
                        </p>
                        <div className="flex space-x-2 mt-3">
                            <button onClick={() => setShowReview(false)}
                                className="flex-1 py-1.5 rounded-lg text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200">
                                Later
                            </button>
                            <button onClick={saveReview} disabled={reviewBusy}
                                className="flex-1 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50 flex items-center justify-center gap-2"
                                style={{ backgroundColor: themeColor }}>
                                <FaSave className="text-[11px]" /> {reviewBusy ? 'Saving…' : 'Save branches'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SeUidMaster;
