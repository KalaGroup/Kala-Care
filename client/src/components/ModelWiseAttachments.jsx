import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { openInNewTab } from '../utils/openInNewTab';
import toast from 'react-hot-toast';
import {
    ChevronDownIcon, XMarkIcon, PlusIcon, CheckIcon, TrashIcon, EyeIcon,
    ArrowDownTrayIcon, PaperClipIcon, ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

/* ============================================================================
   Engine model -> attachment master.

   ONE master, two places: the Welcome Letter's Master Setup and the drive
   Letter Master both render this component and both talk to the same
   /welcome-letter/master/model-* endpoints, so they are backed by the same
   welcome_letter_model_rules + welcome_letter_attachments rows. Map a model in
   either screen and the other shows it immediately.

   An engine model can belong to ONE attachment only (engine_model is UNIQUE),
   which is what lets the dropdown drop a model once it is mapped and hand it
   back when it is unmapped.
   ========================================================================== */

const API = import.meta.env.VITE_BACKEND_URL;
const WL = `${API}/welcome-letter`;

const themeColor = '#2f3192';
const themeSoft = 'rgba(47,49,146,0.10)';

const authHeaders = () => {
    const u = JSON.parse(sessionStorage.getItem('user') || '{}');
    return { 'user-id': String(u.user_id || ''), 'user-role': u.role || '' };
};
const jsonHeaders = () => ({ ...authHeaders(), 'Content-Type': 'application/json' });

const inputSmCls = 'rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[12px] outline-none focus:ring-2 focus:ring-indigo-200';
const btnSmCls = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-[11.5px] font-semibold transition';
const pillCls = 'inline-block rounded-full px-2.5 py-0.5 text-[10.5px] font-bold';
const fileExt = (n) => String(n || '').split('.').pop().toUpperCase().slice(0, 4);

/* Searchable checkbox dropdown of the engine models that are still unmapped.

   `info` maps a model to the KVA rating(s) and emission norm(s) its assets
   carry in the Asset Detailed file — printed under the model, and what the
   KVA / emission-norm filters match on. A model the asset file has never seen
   has no entry and simply shows the bare name (and only the "All …" filter
   rows include it). */
function ModelMultiSelect({ models, info = {}, selected, onChange, disabled }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [kvaF, setKvaF] = useState('');
    const [normsF, setNormsF] = useState([]);   // emission norms — several can be ticked at once
    const [normOpen, setNormOpen] = useState(false);
    const boxRef = useRef(null);
    const normBoxRef = useRef(null);
    useEffect(() => {
        const close = (e) => {
            if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
            // the norm dropdown sits INSIDE the model dropdown, so it needs its
            // own outside-click check — the outer one keeps the panel open
            if (normBoxRef.current && !normBoxRef.current.contains(e.target)) setNormOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    /* every KVA / emission norm seen across the offered models, for the filters */
    const kvaOptions = useMemo(() => {
        const seen = new Set();
        models.forEach((m) => (info[m]?.kvas || []).forEach((k) => seen.add(k)));
        return [...seen].sort((a, b) => {
            const na = parseFloat(a); const nb = parseFloat(b);
            const aNum = !Number.isNaN(na); const bNum = !Number.isNaN(nb);
            if (aNum && bNum) return na - nb;
            if (aNum !== bNum) return aNum ? -1 : 1;
            return String(a).localeCompare(String(b));
        });
    }, [models, info]);
    const normOptions = useMemo(() => {
        const seen = new Set();
        models.forEach((m) => (info[m]?.norms || []).forEach((n) => seen.add(n)));
        return [...seen].sort((a, b) => String(a).localeCompare(String(b)));
    }, [models, info]);

    const shown = useMemo(() => {
        const t = q.trim().toLowerCase();
        return models.filter((m) => {
            if (t && !m.toLowerCase().includes(t)) return false;
            if (kvaF && !(info[m]?.kvas || []).includes(kvaF)) return false;
            // several norms ticked = OR — a model matching any of them stays
            if (normsF.length && !(info[m]?.norms || []).some((n) => normsF.includes(n))) return false;
            return true;
        });
    }, [models, q, kvaF, normsF, info]);

    const toggleNorm = (n) =>
        setNormsF((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]));

    const toggle = (m) =>
        onChange(selected.includes(m) ? selected.filter((x) => x !== m) : [...selected, m]);

    /* select-all works on the rows as filtered right now — filter to a KVA or
       an emission norm and one click maps that whole family */
    const allShownSelected = shown.length > 0 && shown.every((m) => selected.includes(m));
    const toggleAllShown = () => {
        if (allShownSelected) onChange(selected.filter((m) => !shown.includes(m)));
        else onChange([...new Set([...selected, ...shown])]);
    };

    const subLabel = (m) => {
        const i = info[m];
        if (!i) return '';
        const parts = [];
        if (i.kvas?.length) {
            const kv = i.kvas.slice(0, 3).join(', ') + (i.kvas.length > 3 ? ` +${i.kvas.length - 3}` : '');
            parts.push(`${kv} KVA`);
        }
        if (i.norms?.length) parts.push(i.norms.join(', '));
        return parts.join(' · ');
    };

    const filtered = Boolean(q.trim() || kvaF || normsF.length);
    const label = selected.length === 0
        ? (models.length ? 'Select engine model(s)' : 'No unmapped engine model left')
        : `${selected.length} engine model${selected.length === 1 ? '' : 's'} selected`;
    return (
        <div className="relative" ref={boxRef}>
            <button type="button" disabled={disabled || models.length === 0}
                onClick={() => setOpen((o) => !o)}
                className={`${inputSmCls} flex min-w-[230px] items-center justify-between gap-1.5 disabled:cursor-not-allowed disabled:opacity-50`}>
                <span className={`truncate ${selected.length ? 'font-semibold' : 'text-gray-500'}`}>{label}</span>
                <ChevronDownIcon className="h-3.5 w-3.5 flex-none text-gray-400" />
            </button>
            {open && (
                <div className="absolute z-[70] mt-1 flex w-80 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
                    style={{ maxHeight: 'min(480px, 66vh)' }}>
                    <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} type="search"
                        placeholder="Search engine model…" className={`${inputSmCls} w-full`} />
                    {(kvaOptions.length > 0 || normOptions.length > 0) && (
                        /* the KVA select and the emission-norm dropdown share one row;
                           the norm one is a checkbox dropdown — several norms can be
                           ticked at once (a model matching ANY ticked norm stays) */
                        <div className="mt-1 flex items-center gap-1 px-0.5">
                            {kvaOptions.length > 0 && (
                                <select value={kvaF} onChange={(e) => setKvaF(e.target.value)}
                                    title="Only models with this KVA rating"
                                    className={`${inputSmCls} min-w-0 flex-1`}>
                                    <option value="">All KVA</option>
                                    {kvaOptions.map((k) => <option key={k} value={k}>{k} KVA</option>)}
                                </select>
                            )}
                            {normOptions.length > 0 && (
                                <div className="relative min-w-0 flex-1" ref={normBoxRef}>
                                    <button type="button" onClick={() => setNormOpen((o) => !o)}
                                        title="Only models with these emission norms — tick more than one to combine"
                                        className={`${inputSmCls} flex w-full items-center justify-between gap-1`}>
                                        <span className={`truncate ${normsF.length ? 'font-semibold' : ''}`}>
                                            {normsF.length ? normsF.join(', ') : 'All Norms'}
                                        </span>
                                        <ChevronDownIcon className="h-3 w-3 flex-none text-gray-400" />
                                    </button>
                                    {normOpen && (
                                        <div className="absolute left-0 right-0 z-[75] mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                                            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-[11.5px] hover:bg-gray-50">
                                                <input type="checkbox" className="h-3 w-3 accent-indigo-700"
                                                    checked={normsF.length === 0}
                                                    onChange={() => setNormsF([])} />
                                                All Norms
                                            </label>
                                            {normOptions.map((n) => (
                                                <label key={n}
                                                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-[11.5px] hover:bg-gray-50">
                                                    <input type="checkbox" className="h-3 w-3 accent-indigo-700"
                                                        checked={normsF.includes(n)} onChange={() => toggleNorm(n)} />
                                                    <span className="truncate" title={n}>{n}</span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    <div className="px-1 py-1 text-[10px] text-gray-400">
                        {filtered
                            ? `${shown.length} of ${models.length} models`
                            : `${models.length} model${models.length === 1 ? '' : 's'}`}
                        {selected.length > 0 && ` · ${selected.length} selected`}
                    </div>
                    {shown.length > 0 && (
                        <label className="flex w-fit cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-0.5 text-[10.5px] font-semibold hover:bg-gray-50">
                            <input type="checkbox" className="h-3 w-3 accent-indigo-700"
                                checked={allShownSelected} onChange={toggleAllShown} />
                            <span style={{ color: themeColor }}>
                                {allShownSelected ? 'Unselect all' : 'Select all'}
                                {filtered ? ` (${shown.length} filtered)` : ` (${shown.length})`}
                            </span>
                        </label>
                    )}
                    <div className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                        {shown.map((m, i) => (
                            <label key={m}
                                className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] hover:bg-gray-50">
                                {/* position in the list as it currently reads — with a
                                    search or filter set the numbers follow the matches,
                                    so the count on screen always agrees with the rows */}
                                <span className="w-6 shrink-0 text-right text-[10.5px] tabular-nums text-gray-400">
                                    {i + 1}.
                                </span>
                                <input type="checkbox" className="accent-indigo-700"
                                    checked={selected.includes(m)} onChange={() => toggle(m)} />
                                <span className="min-w-0">
                                    <span className="block truncate" title={m}>{m}</span>
                                    {subLabel(m) && (
                                        <span className="block truncate text-[10.5px] text-gray-400"
                                            title={subLabel(m)}>
                                            {subLabel(m)}
                                        </span>
                                    )}
                                </span>
                            </label>
                        ))}
                        {shown.length === 0 && (
                            <div className="px-2.5 py-3 text-[12px] text-gray-400">
                                {models.length === 0
                                    ? 'Every engine model is already mapped.'
                                    : 'No engine model matches that search / filter.'}
                            </div>
                        )}
                    </div>
                    {selected.length > 0 && (
                        <button type="button" onClick={() => onChange([])}
                            className="mt-1 w-full rounded-md px-2.5 py-1.5 text-left text-[11.5px] font-semibold text-gray-500 hover:bg-gray-50">
                            Clear selection
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

/* The engine models mapped to one file, clamped to a SINGLE row.

   A chart covering a whole engine family can carry twenty-odd models, which
   pushed every other file off the screen. The chips are all rendered — the row
   is just clipped to one line — and how many that hides is MEASURED (the chips
   beyond the first row's offsetTop), because chip widths vary with the model
   name and no fixed "show N" count would be right at every window width. */
function ModelChips({ models, canEdit, onRemove }) {
    const wrapRef = useRef(null);
    const [expanded, setExpanded] = useState(false);
    const [rowH, setRowH] = useState(0);
    const [hidden, setHidden] = useState(0);

    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return undefined;
        const measure = () => {
            const kids = Array.from(el.children);
            if (!kids.length) { setRowH(0); setHidden(0); return; }
            // clipping with overflow:hidden does not reflow, so the natural
            // offsetTop of every chip stays readable while collapsed
            const top0 = kids[0].offsetTop;
            const inFirstRow = kids.filter((k) => k.offsetTop === top0).length;
            setRowH(kids[0].offsetHeight);
            setHidden(Math.max(0, kids.length - inFirstRow));
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        window.addEventListener('resize', measure);
        return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
    }, [models]);

    return (
        <div className="mt-1.5 pl-[42px]">
            <div ref={wrapRef} className="flex flex-wrap items-center gap-1.5"
                style={expanded || !rowH ? undefined : { maxHeight: rowH, overflow: 'hidden' }}>
                {models.map((m) => (
                    <span key={m.id}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] font-medium"
                        style={{ background: 'rgba(5,150,105,0.10)', color: '#047857' }}>
                        {m.engine_model}
                        {canEdit && (
                            <button type="button" onClick={() => onRemove(m)}
                                title="Unmap this engine model — it goes back into the dropdown"
                                className="rounded-full p-0.5 hover:bg-white/70">
                                <XMarkIcon className="h-3 w-3" />
                            </button>
                        )}
                    </span>
                ))}
            </div>
            {(hidden > 0 || expanded) && (
                <button type="button" onClick={() => setExpanded((v) => !v)}
                    className="mt-1 text-[11px] font-semibold hover:underline"
                    style={{ color: themeColor }}>
                    {expanded ? 'See less' : `See more (${hidden})`}
                </button>
            )}
        </div>
    );
}

export default function ModelWiseAttachments({ canEdit = true, onChanged }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState([]);
    const [file, setFile] = useState(null);
    const [saving, setSaving] = useState(false);
    const fileRef = useRef(null);
    const [addFor, setAddFor] = useState(null);
    const [addModels, setAddModels] = useState([]);
    const [confirmBox, setConfirmBox] = useState(null);
    const [confirmBusy, setConfirmBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${WL}/master`, { headers: authHeaders() });
            const d = await res.json();
            if (!res.ok) throw new Error(d.detail || 'Could not load the attachment master');
            setData(d);
        } catch (e) { toast.error(e.message); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const refresh = () => { load(); onChanged?.(); };

    const save = async () => {
        if (!file) { toast.error('Choose a file to upload'); return; }
        if (!selected.length) { toast.error('Select at least one engine model'); return; }
        const fd = new FormData();
        fd.append('file', file);
        fd.append('engine_models', selected.join(','));
        setSaving(true);
        try {
            const res = await fetch(`${WL}/master/model-attachments`, {
                method: 'POST', headers: authHeaders(), body: fd,
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.detail || 'Could not save the mapping');
            toast.success(d.message || 'Mapping saved');
            setFile(null); setSelected([]);
            if (fileRef.current) fileRef.current.value = '';
            refresh();
        } catch (e) { toast.error(e.message); }
        finally { setSaving(false); }
    };

    const addModelsTo = async (attId) => {
        if (!addModels.length) { toast.error('Select at least one engine model'); return; }
        try {
            const res = await fetch(`${WL}/master/model-attachments/${attId}/models`, {
                method: 'POST', headers: jsonHeaders(),
                body: JSON.stringify({ engine_models: addModels }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.detail || 'Could not add the engine models');
            toast.success(d.message || 'Engine models added');
            setAddFor(null); setAddModels([]);
            refresh();
        } catch (e) { toast.error(e.message); }
    };

    const removeRule = async (ruleId, model) => {
        try {
            const res = await fetch(`${WL}/master/model-rules/${ruleId}`, {
                method: 'DELETE', headers: authHeaders(),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.detail || 'Could not unmap the engine model');
            toast.success(`${model} unmapped`);
            refresh();
        } catch (e) { toast.error(e.message); }
    };

    const removeAttachment = async (attId) => {
        try {
            const res = await fetch(`${WL}/master/model-attachments/${attId}`, {
                method: 'DELETE', headers: authHeaders(),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.detail || 'Delete failed');
            toast.success('Model-wise attachment deleted');
            refresh();
        } catch (e) { toast.error(e.message); }
    };

    const openFile = async (id, name, download) => {
        try {
            const res = await fetch(`${WL}/master/files/${id}`, { headers: authHeaders() });
            if (!res.ok) throw new Error('File not available');
            const url = URL.createObjectURL(await res.blob());
            if (download) {
                const a = document.createElement('a');
                a.href = url; a.download = name || 'attachment'; a.click();
            } else {
                openInNewTab(url);
            }
        } catch (e) { toast.error(e.message); }
    };

    /* ---- guarded deletes: nothing here is removed on a single click ---- */
    const askDeleteAttachment = (g) => setConfirmBox({
        title: 'Delete this model-wise attachment?',
        lines: [
            <><b>{g.file_name}</b> and all {g.engine_models.length} engine model
                mapping{g.engine_models.length === 1 ? '' : 's'} will be removed.</>,
            <>Customers on {g.engine_models.slice(0, 4).map((m) => m.engine_model).join(', ')}
                {g.engine_models.length > 4 ? ` and ${g.engine_models.length - 4} more` : ''} will
                no longer receive this file — in the welcome letter AND in drive letters.</>,
            'This cannot be undone.',
        ],
        label: 'Delete attachment',
        onYes: () => removeAttachment(g.attachment_id),
    });

    const askRemoveRule = (g, m) => {
        const last = g.engine_models.length === 1;
        setConfirmBox({
            title: last ? 'Unmap the last engine model?' : 'Unmap this engine model?',
            lines: last
                ? [
                    <><b>{m.engine_model}</b> is the only model mapped to <b>{g.file_name}</b>.</>,
                    'Unmapping it deletes the file too — with no model pointing at it, nothing would ever attach it.',
                    'This cannot be undone.',
                ]
                : [
                    <>Customers on <b>{m.engine_model}</b> will stop receiving <b>{g.file_name}</b>.</>,
                    <>The file stays — {g.engine_models.length - 1} other engine
                        model{g.engine_models.length - 1 === 1 ? '' : 's'} still use
                        {g.engine_models.length - 1 === 1 ? 's' : ''} it.</>,
                    'The model goes back into the dropdown, so it can be mapped again.',
                ],
            label: last ? 'Unmap and delete file' : 'Unmap model',
            onYes: () => removeRule(m.id, m.engine_model),
        });
    };

    const runConfirm = async () => {
        if (!confirmBox || confirmBusy) return;
        setConfirmBusy(true);
        try { await confirmBox.onYes(); setConfirmBox(null); }
        finally { setConfirmBusy(false); }
    };

    const groups = data?.model_attachments || [];
    const available = data?.available_models || [];
    /* model -> {kvas, norms} from the Asset Detailed file; an older backend
       that does not send available_model_info yet just yields an empty map
       and the dropdown shows bare model names, as before */
    const modelInfo = useMemo(() => {
        const map = {};
        (data?.available_model_info || []).forEach((r) => { map[r.model] = r; });
        return map;
    }, [data]);

    return (
        /* min-height reserves room for the engine-model dropdown. Without it a
           master with few mappings makes a short panel, the modal shrinks to
           fit, and the dropdown opens straight through the bottom of the box. */
        <div className="min-h-[400px]">
            {/* one master, two screens — say so, or nobody expects the side effect */}
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 px-3.5 py-1.5 text-[11px] text-gray-500">
                <span className={`${pillCls}`} style={{ background: themeSoft, color: themeColor }}>
                    Shared master
                </span>
                These mappings are used by the Welcome Letter and by drive letters — changing them
                here changes them everywhere.
            </div>

            {canEdit && (
                <div className="flex flex-wrap items-end gap-x-2.5 gap-y-1.5 border-b border-gray-200 bg-indigo-50/40 px-3.5 py-2">
                    <label className="flex flex-col gap-0.5 text-[9.5px] font-bold uppercase tracking-wide text-gray-500">
                        File
                        <span className={`${btnSmCls} max-w-[260px] cursor-pointer text-white ${saving ? 'cursor-not-allowed opacity-50' : ''}`}
                            style={{ background: themeColor }}>
                            <PaperClipIcon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate normal-case">{file ? file.name : 'Choose File'}</span>
                            <input ref={fileRef} type="file" disabled={saving}
                                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                                className="sr-only"
                                onChange={(e) => setFile(e.target.files?.[0] || null)} />
                        </span>
                    </label>
                    <label className="flex flex-col gap-0.5 text-[9.5px] font-bold uppercase tracking-wide text-gray-500">
                        Engine Models
                        <ModelMultiSelect models={available} info={modelInfo} selected={selected}
                            onChange={setSelected} disabled={saving} />
                    </label>
                    <button onClick={save} disabled={saving || !file || !selected.length}
                        className={`${btnSmCls} text-white disabled:opacity-40 disabled:cursor-not-allowed`}
                        style={{ background: '#059669' }}>
                        <CheckIcon className="h-3.5 w-3.5" /> {saving ? 'Saving…' : 'Save Mapping'}
                    </button>
                    <span className="ml-auto self-center text-[11px] text-gray-500">
                        {available.length} model(s) unmapped · {data?.assigned_model_count ?? 0} mapped
                    </span>
                </div>
            )}

            {canEdit && selected.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-100 px-3.5 py-2">
                    <span className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400">
                        Will be mapped
                    </span>
                    {selected.map((m) => (
                        <span key={m} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] font-medium"
                            style={{ background: themeSoft, color: themeColor }}>
                            {m}
                            <button type="button" title="Remove"
                                onClick={() => setSelected((cur) => cur.filter((x) => x !== m))}
                                className="rounded-full p-0.5 hover:bg-white/70">
                                <XMarkIcon className="h-3 w-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {groups.map((g) => (
                <div key={g.attachment_id} className="border-b border-gray-100 px-3.5 py-2.5">
                    <div className="flex items-center gap-2.5 text-[12.5px]">
                        <span className="h-8 w-8 shrink-0 rounded-lg grid place-items-center text-[9px] font-extrabold"
                            style={{ background: themeSoft, color: themeColor }}>
                            {fileExt(g.file_name)}
                        </span>
                        <span className="truncate font-semibold" title={g.file_name}>{g.file_name}</span>
                        <span className={`${pillCls} shrink-0 bg-gray-100 text-gray-600`}>
                            {g.engine_models.length} model{g.engine_models.length === 1 ? '' : 's'}
                        </span>
                        {canEdit && (
                            <button onClick={() => { setAddFor(addFor === g.attachment_id ? null : g.attachment_id); setAddModels([]); }}
                                title="Map more engine models to this file"
                                className={`${btnSmCls} ml-auto shrink-0 border border-gray-300 text-gray-700 hover:bg-gray-50`}>
                                <PlusIcon className="h-3.5 w-3.5" /> Add Models
                            </button>
                        )}
                        <button onClick={() => openFile(g.attachment_id, g.file_name, false)} title="View"
                            className={`shrink-0 rounded p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 ${canEdit ? '' : 'ml-auto'}`}>
                            <EyeIcon className="h-4 w-4" />
                        </button>
                        <button onClick={() => openFile(g.attachment_id, g.file_name, true)} title="Download"
                            className="shrink-0 rounded p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50">
                            <ArrowDownTrayIcon className="h-4 w-4" />
                        </button>
                        {canEdit && (
                            <button onClick={() => askDeleteAttachment(g)}
                                title="Delete the file and every engine model mapped to it"
                                className="shrink-0 rounded p-1 text-gray-400 hover:text-red-600 hover:bg-red-50">
                                <TrashIcon className="h-4 w-4" />
                            </button>
                        )}
                    </div>

                    {canEdit && addFor === g.attachment_id && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-indigo-50/60 px-2.5 py-2">
                            <ModelMultiSelect models={available} info={modelInfo} selected={addModels} onChange={setAddModels} />
                            <button onClick={() => addModelsTo(g.attachment_id)} disabled={!addModels.length}
                                className={`${btnSmCls} text-white disabled:opacity-40`}
                                style={{ background: themeColor }}>
                                <CheckIcon className="h-3.5 w-3.5" /> Add
                            </button>
                            <button onClick={() => { setAddFor(null); setAddModels([]); }}
                                className={`${btnSmCls} border border-gray-300 bg-white text-gray-600`}>
                                Cancel
                            </button>
                        </div>
                    )}

                    <ModelChips models={g.engine_models} canEdit={canEdit}
                        onRemove={(m) => askRemoveRule(g, m)} />
                </div>
            ))}

            {groups.length === 0 && (
                <div className="flex min-h-[180px] flex-col items-center justify-center gap-1 px-3 text-center text-[12.5px] text-gray-400">
                    <span>{loading ? 'Loading…' : 'No engine model is mapped yet.'}</span>
                    {!loading && canEdit && (
                        <span className="max-w-[52ch]">
                            Upload a file above and pick the engine models it belongs to — every customer on
                            those models gets it attached automatically.
                        </span>
                    )}
                </div>
            )}

            {confirmBox && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-gray-900/50 p-4"
                    onClick={(e) => { if (e.target === e.currentTarget && !confirmBusy) setConfirmBox(null); }}>
                    <div className="w-full max-w-[460px] overflow-hidden rounded-2xl bg-white shadow-2xl">
                        <div className="flex items-start gap-3 px-5 pt-5">
                            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-50 text-red-600">
                                <ExclamationTriangleIcon className="h-5 w-5" />
                            </span>
                            <div className="min-w-0">
                                <h2 className="text-[15px] font-bold text-gray-900">{confirmBox.title}</h2>
                                <div className="mt-1.5 space-y-1.5 text-[12.5px] leading-[1.5] text-gray-600">
                                    {confirmBox.lines.map((ln, i) => <p key={i}>{ln}</p>)}
                                </div>
                            </div>
                        </div>
                        <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">
                            <button onClick={() => setConfirmBox(null)} disabled={confirmBusy}
                                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-gray-700 disabled:opacity-50">
                                Cancel
                            </button>
                            <button onClick={runConfirm} disabled={confirmBusy} autoFocus
                                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-[12.5px] font-semibold text-white transition hover:bg-red-700 disabled:opacity-50">
                                <TrashIcon className="h-4 w-4" />
                                {confirmBusy ? 'Working…' : confirmBox.label}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
