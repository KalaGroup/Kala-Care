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

   Backend: /pms/se-uid (GET ?sync, POST, DELETE /{id}) and /se-uid/import.
--------------------------------------------------------------------------- */

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;
const themeColor = '#2f3192';

// Grid-style table cells — dark grey lines on every cell, same as the AOP
// Master's SR Type grid.
const thCls = 'px-2 py-1.5 text-center text-[11px] font-semibold text-black uppercase tracking-wide whitespace-nowrap bg-gray-50 border border-gray-400';
const tdCls = 'px-2 py-1 border border-gray-400';

const SeUidMaster = ({ user, showToast }) => {
    const [items, setItems] = useState([]);
    const [branches, setBranches] = useState([]); // KALA branches for the picker
    const [dupUids, setDupUids] = useState([]);   // one UID on >1 engineer
    const [stats, setStats] = useState({ total: 0, with_uid: 0, missing: 0,
        with_branch: 0, in_maxttr: 0, in_lms: 0, in_efsr: 0 });
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [search, setSearch] = useState('');
    const [view, setView] = useState('all');        // all | missing | linked | nobranch
    const [brSel, setBrSel] = useState('');         // '' = every branch, '-' = no branch

    const [draft, setDraft] = useState(null);       // inline edit of an existing row
    const [addForm, setAddForm] = useState(null);   // Add SE modal
    const [importFile, setImportFile] = useState(null);
    const [showImport, setShowImport] = useState(false);

    const headers = useMemo(() => ({
        'user-id': user?.user_id,
        'user-role': user?.role,
    }), [user]);

    const apply = (d) => {
        setItems(d?.items || []);
        if (d?.branches) setBranches(d.branches);
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

    useEffect(() => { load(false, true); }, [load]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return items.filter((r) => {
            if (view === 'missing' && r.se_uid) return false;
            if (view === 'linked' && !r.se_uid) return false;
            // the engineers no uploaded file could place in a KALA branch — the
            // PMS reports fall back to this field, so these are the rows to fix
            if (view === 'nobranch' && r.branch_id) return false;
            // '-' picks the engineers no file could place — the rows to fix
            if (brSel === '-' && r.branch_id) return false;
            if (brSel && brSel !== '-' && r.branch_id !== brSel) return false;
            if (!q) return true;
            return `${r.se_name} ${r.se_uid} ${r.branch_id} ${r.branch_name}`
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
    const downloadTemplate = () => {
        const src = (view === 'missing' || view === 'nobranch') ? filtered : items;
        const rows = (src.length ? src : [{ se_name: '', se_uid: '', branch_id: '' }])
            .map((r) => ({ 'SE Name': r.se_name, 'SE UID': r.se_uid,
                'Branch Code': r.branch_id || '' }));
        const ws = XLSX.utils.json_to_sheet(rows,
            { header: ['SE Name', 'SE UID', 'Branch Code'] });
        ws['!cols'] = [{ wch: 38 }, { wch: 22 }, { wch: 16 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'SE UID Master');
        XLSX.writeFile(wb, 'SE_UID_Master.xlsx');
        showToast?.('success', `Downloaded ${rows.length} row${rows.length === 1 ? '' : 's'}`);
    };

    const runImport = async () => {
        if (!importFile) return;
        const form = new FormData();
        form.append('file', importFile);
        setBusy(true);
        try {
            const res = await axios.post(`${API_BASE_URL}/pms/se-uid/import`, form, { headers });
            const d = res.data || {};
            if (d.success === false) {
                showToast?.('warning', d.message || 'Import failed');
                return;
            }
            apply(d);
            setShowImport(false);
            setImportFile(null);
            const conflicts = d.conflicts || [];
            showToast?.('success',
                `Imported — ${d.inserted} added, ${d.updated} updated${d.skipped ? `, ${d.skipped} skipped` : ''}`);
            if (conflicts.length) {
                await Swal.fire({
                    title: `${conflicts.length} UID${conflicts.length > 1 ? 's' : ''} skipped`,
                    html: '<div style="font-size:12px;text-align:left;max-height:220px;overflow:auto">'
                        + conflicts.slice(0, 20).map((c) => `• ${c}`).join('<br>')
                        + (conflicts.length > 20 ? `<br>… ${conflicts.length - 20} more` : '')
                        + '</div><div style="font-size:11px;color:#6b7280;margin-top:8px">'
                        + 'One UID can belong to only one engineer, so these were left unchanged.</div>',
                    icon: 'warning',
                    confirmButtonColor: themeColor,
                });
            }
        } catch (e2) {
            showToast?.('error', e2.response?.data?.detail || 'Import failed');
        } finally {
            setBusy(false);
        }
    };

    const inputCls = 'w-full px-2 py-1 text-xs border border-gray-300 rounded text-black bg-white focus:outline-none focus:ring-1 focus:ring-[#2f3192]';
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
    ];

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
                style={{ gridTemplateColumns: '44px 27px 32px' }}>
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
        const editing = draft && draft.id === row.id;
        if (editing) {
            return (
                <tr key={row.id} className="bg-[#2f3192]/5">
                    <td className={`${tdCls} text-center text-gray-500 tabular-nums`}>{no}</td>
                    <td className={tdCls}>
                        <input autoFocus value={draft.se_name} className={inputCls}
                            onChange={(e) => setDraft({ ...draft, se_name: e.target.value })} />
                    </td>
                    <td className={tdCls}>
                        <input value={draft.se_uid} className={inputCls}
                            placeholder="UID (comma-separate if more than one)"
                            onChange={(e) => setDraft({ ...draft, se_uid: e.target.value })} />
                    </td>
                    <td className={`${tdCls} text-center text-[11px] text-black tabular-nums`}>
                        {draft.branch_id || <span className="text-gray-400">—</span>}
                    </td>
                    <td className={tdCls}>
                        {branchSelect(draft.branch_id,
                            (v) => setDraft({ ...draft, branch_id: v }), inputCls)}
                    </td>
                    <td className={`${tdCls} text-center`}>{srcLabel(row)}</td>
                    <td className={`${tdCls} text-center whitespace-nowrap`}>
                        <button onClick={() => persist(draft, () => setDraft(null))} disabled={busy} title="Save"
                            className="p-1 rounded text-white disabled:opacity-50"
                            style={{ backgroundColor: themeColor }}><FaSave className="text-[11px]" /></button>
                        <button onClick={() => setDraft(null)} title="Cancel"
                            className="ml-1 p-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"><FaTimes className="text-[11px]" /></button>
                    </td>
                </tr>
            );
        }
        return (
            <tr key={row.id} className="hover:bg-gray-50/60">
                <td className={`${tdCls} text-center text-gray-500 tabular-nums`}>{no}</td>
                <td className={`${tdCls} text-gray-800 font-medium`}>{row.se_name}</td>
                <td className={`${tdCls} text-center text-black tabular-nums`}>
                    {row.uids?.length ? row.uids.join(', ') : <span className="text-amber-600">—</span>}
                </td>
                <td className={`${tdCls} text-center text-[11px] text-black tabular-nums`}>
                    {row.branch_id || <span className="text-amber-600">—</span>}
                </td>
                <td className={`${tdCls} text-[11px] text-gray-700`}>
                    {row.branch_name || (row.branch_id
                        ? <span className="text-gray-400">not in the branch master</span>
                        : <span className="text-amber-600" title="No KALA branch in any uploaded file — set it here so the PMS reports can place this engineer">—</span>)}
                </td>
                <td className={`${tdCls} text-center`}>{srcLabel(row)}</td>
                <td className={`${tdCls} text-center whitespace-nowrap`}>
                    <button onClick={() => setDraft({ id: row.id, se_name: row.se_name,
                        se_uid: row.se_uid, branch_id: row.branch_id })}
                        title="Edit" className="p-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">
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
                    ['nobranch', `Branch missing (${noBranch})`]].map(([k, label]) => (
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
                        placeholder="Search name or UID"
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
                    <table className="w-full text-xs border-collapse min-w-[740px]">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th className={thCls} style={{ width: 58 }}>Sr. No.</th>
                                <th className={thCls}>SE Name</th>
                                <th className={thCls} style={{ width: 150 }}>SE UID</th>
                                <th className={thCls} style={{ width: 96 }}>Branch Code</th>
                                <th className={thCls} style={{ width: 150 }}>Branch</th>
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

            <p className="mt-2 text-[11px] text-gray-500">
                Showing {filtered.length} of {items.length} engineers · {stats.with_branch || 0} with a
                branch · Import file needs <b>SE Name</b> and <b>SE UID</b>, and may add
                <b> Branch Code</b>. Reload from data adds new engineers and LMS UIDs; existing values
                are never overwritten. <b>Reload from data</b> also fills the Branch from the files;
                a <span className="text-amber-600 font-semibold">—</span> means no file places that
                engineer in a KALA branch, so set it here — the reports fall back to it.
            </p>

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
                            <button onClick={() => { setShowImport(false); setImportFile(null); }}
                                className="text-black hover:text-gray-600 transition-colors p-1">
                                <FaTimes />
                            </button>
                        </div>

                        <div className="mb-4">
                            <p className="text-xs text-black mb-2">
                                Upload an Excel file with the following columns:
                            </p>
                            <div className="bg-gray-50 p-2.5 rounded-lg text-xs overflow-x-auto">
                                <p className="font-mono whitespace-nowrap">SE Name, SE UID, Branch Code (optional)</p>
                            </div>
                            <p className="text-[11px] text-gray-500 mt-2">
                                An existing name updates its UID instead of adding a duplicate. Use
                                <b> Export</b> to download the current list, fill in the UIDs
                                and import the same file back.
                            </p>
                        </div>

                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                            <input type="file" accept=".xlsx,.xls" id="se-uid-import-file" className="hidden"
                                onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
                            <label htmlFor="se-uid-import-file" className="cursor-pointer flex flex-col items-center">
                                <FaUpload className="text-black text-2xl mb-2" />
                                <span className="text-xs text-black font-medium break-all text-center">
                                    {importFile ? importFile.name : 'Click to select file'}
                                </span>
                                {!importFile && <span className="text-xs text-black mt-1">Excel only</span>}
                            </label>
                        </div>

                        <div className="flex space-x-2 mt-5">
                            <button onClick={() => { setShowImport(false); setImportFile(null); }}
                                className="flex-1 py-1.5 rounded-lg text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200">
                                Cancel
                            </button>
                            <button onClick={runImport} disabled={!importFile || busy}
                                className="flex-1 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50 flex items-center justify-center gap-2"
                                style={{ backgroundColor: themeColor }}>
                                <CiImport className="text-sm" /> {busy ? 'Importing…' : 'Import'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SeUidMaster;
