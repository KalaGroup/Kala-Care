/* Authority Matrix — the COO's master for the whole approval rule set:

   1. Approver Authority & Limits (branch-wise): give a user BA / HOD / COO
      authority and set how much they may approve per type (Discounting %,
      Credit days, Expense amount). An approver whose limit covers the record
      FINALIZES it; a bigger value escalates to the next level.
   2. Employee Flow Rules (branch-wise): per employee decide whether their
      applications need the Branch Admin step and/or the HOD step at all.
   3. HOD Category Approvers: who approves Spares / Services /
      Spares & Services at the HOD level (HOD & COO see all branches). */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import { X, Network, UserCog, GitBranch, Layers, Wallet, Trash2, Pencil, Search, ChevronDown, ChevronUp } from 'lucide-react';
import {
    getMatrix, setAuthority, setEmployeeRule, setHodCategory,
    addExpenseType, removeExpenseType, renameExpenseType,
    setApproverExclusion, errText,
} from './approvalApi';
import { BRAND, CATEGORY_OPTIONS, catLabel } from './ApprovalShared';

const LEVELS = [
    { value: 'user', label: 'Employee' },
    { value: 'branch', label: 'Branch Admin (BA)' },
    { value: 'hod', label: 'HOD' },
    { value: 'coo', label: 'COO' },
];

const input = 'w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300';
/* border-b/-r only (with border-separate tables): collapsed borders don't
   stick with position:sticky in Chrome, which left a gap over the frozen
   header. The container's own border supplies the top/left edges. */
const th = 'px-2.5 py-2 border-b border-r border-gray-200 bg-gray-50 text-gray-800 font-semibold text-center text-[11px] uppercase tracking-wide whitespace-nowrap';
const td = 'px-2.5 py-1.5 border-b border-r border-gray-200 text-center align-middle text-xs';

export default function AuthorityMatrix({ onClose }) {
    const [data, setData] = useState({ users: [], branches: [], hod_categories: {}, expense_types: [], chain_data: null, exclusions: {} });
    const [expandedFlow, setExpandedFlow] = useState(null);   // user_id whose approval tree is open
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('authority');   // authority | rules | hod | expense
    const [branchFilter, setBranchFilter] = useState('');
    const [search, setSearch] = useState('');
    // Local editable copies keyed by user_id
    const [edits, setEdits] = useState({});
    const [savingId, setSavingId] = useState(null);
    // Expense-types tab state
    const [newTypeName, setNewTypeName] = useState('');
    // Which row's per-type expense dropdown is open (closes on mouse-leave)
    const [openExpenseFor, setOpenExpenseFor] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const d = await getMatrix();
            setData({
                users: d.users || [], branches: d.branches || [],
                hod_categories: d.hod_categories || {}, expense_types: d.expense_types || [],
                chain_data: d.chain_data || null,
                exclusions: d.exclusions || {},
            });
            setEdits({});
        } catch (err) {
            toast.error(errText(err, 'Failed to load authority matrix'));
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const visibleUsers = useMemo(() =>
        data.users.filter(u =>
            (!branchFilter || u.branch === branchFilter) &&
            (!search || u.name.toLowerCase().includes(search.toLowerCase())
                || u.user_id.toLowerCase().includes(search.toLowerCase()))),
        [data.users, branchFilter, search]);

    // Flow rules apply to record CREATORS only — Employee and Branch Admin
    // levels. HOD / COO users only approve, so they are not listed there.
    const creatorUsers = useMemo(() =>
        visibleUsers.filter(u => u.level === 'user' || u.level === 'branch'),
        [visibleUsers]);

    const hodUsers = useMemo(() =>
        data.users.filter(u => u.level === 'hod'),
        [data.users]);

    const val = (u, key) => {
        const e = edits[u.user_id];
        return e && key in e ? e[key] : (u[key] ?? '');
    };
    const setVal = (u, key, v) =>
        setEdits(prev => ({ ...prev, [u.user_id]: { ...prev[u.user_id], [key]: v } }));

    // Per-expense-type amounts live in the same row (key exp_<typeId>);
    // default (blank) = Unlimited, which is also what a NEW type starts as.
    const expVal = (u, t) => {
        const k = `exp_${t.id}`;
        const e = edits[u.user_id];
        return e && k in e ? e[k] : (u.expense_limits?.[t.id] ?? '');
    };

    // AUTO-SAVE: level changes save instantly; limit inputs save on blur.
    // `overrides` carries the just-changed value (state updates are async).
    // A dirty check keeps no-change blurs from firing requests.
    const saveAuthority = async (u, overrides = {}) => {
        const get = (k) => (k in overrides ? overrides[k] : val(u, k));
        const payload = {
            user_id: u.user_id,
            level: get('level') || 'user',
            max_discount_percent: get('max_discount_percent'),
            max_credit_days: get('max_credit_days'),
            expense_type_limits: data.expense_types.map(t => ({
                expense_type_id: t.id,
                max_amount: `exp_${t.id}` in overrides ? overrides[`exp_${t.id}`] : expVal(u, t),
            })),
        };
        const same = (a, b) => String(a ?? '') === String(b ?? '');
        const unchanged =
            same(payload.level, u.level) &&
            same(payload.max_discount_percent, u.max_discount_percent) &&
            same(payload.max_credit_days, u.max_credit_days) &&
            payload.expense_type_limits.every(l => same(l.max_amount, u.expense_limits?.[l.expense_type_id]));
        if (unchanged) return;

        setSavingId(u.user_id);
        try {
            const res = await setAuthority(payload);
            if (res?.impact?.message) {
                // pending records affected by this change — tell the admin
                await Swal.fire({
                    title: 'Authority saved',
                    text: res.impact.message,
                    icon: 'info',
                    confirmButtonColor: BRAND,
                });
            } else {
                toast.success(`Saved — ${u.name}`);
            }
            await load();
        } catch (err) {
            toast.error(errText(err, 'Failed to save authority'));
        } finally { setSavingId(null); }
    };

    // AUTO-SAVE: each toggle click stores immediately (optimistic UI first)
    const saveRule = async (u, overrides = {}) => {
        const get = (k, cur) => (k in overrides ? overrides[k] : cur);
        setSavingId(u.user_id);
        try {
            const res = await setEmployeeRule({
                user_id: u.user_id,
                require_branch: get('require_branch', val(u, 'require_branch') !== false),
                require_hod: get('require_hod', val(u, 'require_hod') !== false),
            });
            if (res?.impact?.message) {
                await Swal.fire({
                    title: 'Approval hierarchy saved',
                    text: res.impact.message,
                    icon: 'info',
                    confirmButtonColor: BRAND,
                });
            } else {
                toast.success(`Saved — ${u.name}`);
            }
            await load();
        } catch (err) {
            toast.error(errText(err, 'Failed to save approval hierarchy'));
        } finally { setSavingId(null); }
    };

    const approvers = useMemo(() =>
        data.users.filter(u => u.level !== 'user'),
        [data.users]);

    const addType = async (e) => {
        e.preventDefault();
        if (!newTypeName.trim()) return toast.error('Enter an expense type name');
        setSavingId('newtype');
        try {
            await addExpenseType(newTypeName.trim());
            toast.success('Expense type added');
            setNewTypeName('');
            await load();
        } catch (err) {
            toast.error(errText(err, 'Failed to add expense type'));
        } finally { setSavingId(null); }
    };

    const deleteType = async (t) => {
        const res = await Swal.fire({
            title: 'Remove expense type?',
            text: `"${t.name}" and its approver limits will be removed`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Remove',
            confirmButtonColor: '#dc2626',
        });
        if (!res.isConfirmed) return;
        try {
            await removeExpenseType(t.id);
            toast.success('Expense type removed');
            await load();
        } catch (err) {
            toast.error(errText(err, 'Failed to remove expense type'));
        }
    };

    const editType = async (t) => {
        const { value: name, isConfirmed } = await Swal.fire({
            title: 'Rename expense type',
            input: 'text',
            inputValue: t.name,
            showCancelButton: true,
            confirmButtonText: 'Save',
            confirmButtonColor: BRAND,
            inputValidator: (v) => (!v || !v.trim()) ? 'Name is required' : undefined,
        });
        if (!isConfirmed || !name.trim() || name.trim() === t.name) return;
        try {
            await renameExpenseType(t.id, name.trim());
            toast.success('Expense type renamed');
            await load();
        } catch (err) {
            toast.error(errText(err, 'Failed to rename expense type'));
        }
    };

    const saveHodCategory = async (category, userIds) => {
        setSavingId(category);
        try {
            const res = await setHodCategory(category, userIds);
            if (res?.moved) {
                await Swal.fire({
                    title: 'Category approvers saved',
                    text: `${res.moved} pending record(s) were forwarded to the next authority because their step can no longer be served.`,
                    icon: 'info',
                    confirmButtonColor: BRAND,
                });
            } else {
                toast.success('HOD category approvers saved');
            }
            await load();
        } catch (err) {
            toast.error(errText(err, 'Failed to save category approvers'));
        } finally { setSavingId(null); }
    };

    // Category-wise approval chain preview for one employee (uses the LIVE
    // toggle values, so the tree updates before saving too). BM / HOD person
    // chips carry user_id so they can be clicked to exclude/allow that person
    // for THIS employee's records.
    const chainTree = (u) => {
        const cd = data.chain_data || {};
        const reqB = val(u, 'require_branch') !== false;
        const reqH = val(u, 'require_hod') !== false;
        const cooNames = (cd.coo_names || []).length ? cd.coo_names : ['COO'];
        const step = (tag, names, skipReason = null) => ({ tag, names, skipReason });
        return CATEGORY_OPTIONS.map(c => {
            // Exclusions are CATEGORY-wise: only this category's list applies here
            const excl = (data.exclusions[u.user_id] || {})[c.value] || [];
            const person = (p) => ({ id: p.user_id, name: p.name, excluded: excl.includes(p.user_id), category: c.value });
            const bms = ((cd.branch_approvers || {})[u.branch] || []).map(person);
            const hods = ((cd.hod_by_category || {})[c.value] || []).map(person);
            const steps = [step(null, [{ name: `${u.name} (creates)` }])];
            if (!reqB) steps.push(step('BM', [], 'Skipped — not required'));
            else if (u.level === 'branch') steps.push(step('BM', [{ name: `${u.name} (self)` }]));
            else if (bms.length) steps.push(step('BM', bms));
            else steps.push(step('BM', [], 'Skipped — no approver'));
            if (!reqH) steps.push(step('HOD', [], 'Skipped — not required'));
            else if (hods.length) steps.push(step('HOD', hods));
            else steps.push(step('HOD', [], 'Skipped — no approver'));
            steps.push(step('COO', cooNames.map(n => ({ name: n }))));
            return { label: c.label, category: c.value, steps };
        });
    };

    const toggleExclusion = async (u, p) => {
        const key = `excl_${u.user_id}_${p.id}_${p.category}`;
        setSavingId(key);
        try {
            const res = await setApproverExclusion({
                employee_id: u.user_id,
                approver_id: p.id,
                category: p.category,
                excluded: !p.excluded,
            });
            if (res?.moved) {
                await Swal.fire({
                    title: 'Exclusion saved',
                    text: `${res.moved} pending record(s) were forwarded to the next authority because their step can no longer be served.`,
                    icon: 'info',
                    confirmButtonColor: BRAND,
                });
            } else {
                toast.success(p.excluded
                    ? `${p.name} can approve ${u.name}'s ${catLabel(p.category)} records again`
                    : `${p.name} will no longer receive ${u.name}'s ${catLabel(p.category)} records`);
            }
            await load();
            setExpandedFlow(u.user_id);
        } catch (err) {
            toast.error(errText(err, 'Failed to save exclusion'));
        } finally { setSavingId(null); }
    };

    const Toggle = ({ on, onChange }) => (
        <button type="button" onClick={() => onChange(!on)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${on
                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                : 'bg-gray-100 text-gray-700 border-gray-200'}`}>
            {on ? 'Required' : 'Skipped'}
        </button>
    );

    // Search + branch filter row, shown under the helper text of the two
    // employee-list tabs
    const filterRow = (
        <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search employee name / id…"
                    className="pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-xs w-56 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-2.5 py-2 text-xs bg-white">
                <option value="">All Branches</option>
                {data.branches.map(b => (
                    <option key={b.branch} value={b.branch}>{b.branch} — {b.branch_name}</option>
                ))}
            </select>
        </div>
    );

    // Tabs live inside the blue header bar: active = white pill, rest = glass
    const tabBtn = (key, label, Icon) => (
        <button onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap flex-shrink-0 ${tab === key
                ? 'bg-white shadow-sm'
                : 'bg-white/15 text-white hover:bg-white/25'}`}
            style={tab === key ? { color: BRAND } : undefined}>
            <Icon size={14} /> {label}
        </button>
    );

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}>
                {/* Blue bar: title + all 4 tabs + close, in ONE row */}
                <div className="sticky top-0 z-30 flex flex-nowrap items-center gap-3 px-5 py-2.5 rounded-t-2xl text-white overflow-x-auto" style={{ background: BRAND, scrollbarWidth: 'thin' }}>
                    <span className="font-semibold text-sm flex items-center gap-2 whitespace-nowrap flex-shrink-0">
                        <Network size={16} /> Authority Matrix
                    </span>
                    <div className="ml-auto flex flex-nowrap items-center gap-2">
                        {tabBtn('authority', 'Authority & Hierarchy', UserCog)}
                        {tabBtn('hod', 'HOD Category Approvers', Layers)}
                        {tabBtn('expense', 'Expense Types & Limits', Wallet)}
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/15 flex-shrink-0"><X size={16} /></button>
                </div>

                {/* content fills the rest of the box; employee tables stretch to it */}
                <div className="px-5 py-2.5 flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto">

                    {loading ? (
                        <div className="py-16 text-center text-sm text-gray-600">Loading authority matrix…</div>
                    ) : tab === 'authority' ? (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="text-[11px] text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis min-w-0 flex-1">
                                    Set each approver's limit. Within limit = <b>final approval</b>; above limit = goes to the next level. Blank = unlimited.
                                </p>
                                {filterRow}
                            </div>
                            <div className="rounded-xl border border-gray-200 overflow-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                                <table className="min-w-full border-separate" style={{ borderSpacing: 0 }}>
                                    {/* header stays frozen while the rows scroll */}
                                    <thead className="sticky top-0 z-10">
                                        <tr>
                                            <th className={`${th} min-w-[240px]`}>Employee</th>
                                            <th className={th}>Branch</th>
                                            <th className={th}>Authority Level</th>
                                            <th className={`${th} w-40 !whitespace-normal`}>Max Discounting %</th>
                                            <th className={`${th} w-32 !whitespace-normal`}>Max Credit Days</th>
                                            <th className={th}>Max Expense Amount (per type)</th>
                                            <th className={`${th} w-20`}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visibleUsers.map(u => {
                                            // Employees only CREATE applications — approval limits
                                            // don't apply to them, so show a plain dash instead.
                                            const lvl = (val(u, 'level') || 'user');
                                            const isPlainEmployee = lvl === 'user';
                                            // Hierarchy toggles + flow tree apply to record CREATORS
                                            // (Employee & Branch Admin levels); HOD users only approve.
                                            const isCreator = lvl === 'user' || lvl === 'branch';
                                            return (
                                                <Fragment key={u.user_id}>
                                                <tr className="hover:bg-gray-50/60">
                                                    <td className={`${td} text-left`}>
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div>
                                                                <p className="font-semibold text-black">{u.name}</p>
                                                                <p className="text-[10px] text-gray-600">{u.user_id}</p>
                                                            </div>
                                                            {isCreator && (
                                                                <button type="button" title="Show this user's approval flow"
                                                                    onClick={() => setExpandedFlow(expandedFlow === u.user_id ? null : u.user_id)}
                                                                    className="p-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 flex-shrink-0">
                                                                    {expandedFlow === u.user_id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className={td}>{u.branch}</td>
                                                    <td className={td}>
                                                        {/* COO is fixed to the rights-master users — not assignable here.
                                                            Changes are stored via the Action column's Save button
                                                            (auto-save + the impact SweetAlert conflicted). */}
                                                        <select className={input} value={val(u, 'level')}
                                                            disabled={savingId === u.user_id}
                                                            onChange={e => setVal(u, 'level', e.target.value)}>
                                                            {LEVELS.map(l => (
                                                                <option key={l.value} value={l.value}
                                                                    disabled={l.value === 'coo'}>
                                                                    {l.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td className={td}>
                                                        {isPlainEmployee ? <span className="text-gray-600">—</span> : (
                                                            <div className="relative">
                                                                {/* right padding only while the suffix shows, so the
                                                                    'Unlimited' placeholder never gets cut off */}
                                                                <input className={`${input} text-center ${String(val(u, 'max_discount_percent') ?? '') !== '' ? 'pr-6' : ''}`}
                                                                    type="number" min="0" max="100" step="0.01"
                                                                    placeholder="Unlimited"
                                                                    value={val(u, 'max_discount_percent') ?? ''}
                                                                    onChange={e => setVal(u, 'max_discount_percent', e.target.value)} />
                                                                {String(val(u, 'max_discount_percent') ?? '') !== '' && (
                                                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-600 pointer-events-none">%</span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className={td}>
                                                        {isPlainEmployee ? <span className="text-gray-600">—</span> : (
                                                            <div className="relative">
                                                                <input className={`${input} text-center ${String(val(u, 'max_credit_days') ?? '') !== '' ? 'pr-9' : ''}`}
                                                                    type="number" min="0" step="1"
                                                                    placeholder="Unlimited"
                                                                    value={val(u, 'max_credit_days') ?? ''}
                                                                    onChange={e => setVal(u, 'max_credit_days', e.target.value)} />
                                                                {String(val(u, 'max_credit_days') ?? '') !== '' && (
                                                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-600 pointer-events-none">days</span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className={td}>
                                                        {isPlainEmployee ? <span className="text-gray-600">—</span>
                                                            : data.expense_types.length === 0 ? (
                                                                <span className="text-[10px] text-gray-600">No expense types yet — add them in the Expense Types tab</span>
                                                            ) : (() => {
                                                                const setCount = data.expense_types.filter(t => String(expVal(u, t) ?? '') !== '').length;
                                                                const open = openExpenseFor === u.user_id;
                                                                return (
                                                                    <div className="relative inline-block text-left"
                                                                        onMouseLeave={() => setOpenExpenseFor(null)}>
                                                                        <button type="button"
                                                                            onClick={() => setOpenExpenseFor(open ? null : u.user_id)}
                                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 whitespace-nowrap">
                                                                            {setCount ? `${setCount} type limit${setCount > 1 ? 's' : ''} set` : 'All Unlimited'} ▾
                                                                        </button>
                                                                        {open && (
                                                                            /* pt-1 keeps the hover area continuous between the
                                                                               button and the panel, so crossing over never closes it */
                                                                            <div className="absolute right-0 top-full z-20 pt-1">
                                                                            <div className="w-60 rounded-xl border border-gray-200 bg-white shadow-xl p-2.5 space-y-1.5">
                                                                                {data.expense_types.map(t => (
                                                                                    <div key={t.id} className="flex items-center gap-2">
                                                                                        <span className="w-20 flex-shrink-0 text-left text-[10px] font-semibold text-gray-700 truncate" title={t.name}>{t.name}</span>
                                                                                        <input className={input} type="number" min="0" step="0.01"
                                                                                            placeholder="Unlimited"
                                                                                            value={expVal(u, t) ?? ''}
                                                                                            onChange={e => setVal(u, `exp_${t.id}`, e.target.value)} />
                                                                                    </div>
                                                                                ))}
                                                                                <p className="text-[9px] text-gray-600 text-left pt-0.5">
                                                                                    Blank = Unlimited · press Save in the Action column to store
                                                                                </p>
                                                                            </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}
                                                    </td>
                                                    <td className={td}>
                                                        <button type="button" onClick={() => saveAuthority(u)}
                                                            disabled={savingId === u.user_id}
                                                            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white disabled:opacity-50"
                                                            style={{ background: BRAND }}>
                                                            {savingId === u.user_id ? 'Saving…' : 'Save'}
                                                        </button>
                                                    </td>
                                                </tr>
                                                {isCreator && expandedFlow === u.user_id && (
                                                    <tr>
                                                        <td colSpan={7} className="px-3 py-2.5 border-b border-r border-gray-200 bg-white text-left">
                                                            <p className="text-[10px] uppercase tracking-wide font-bold text-gray-800 mb-2">
                                                                Approval flow for {u.name} — category wise
                                                            </p>
                                                            <div className="rounded-lg border border-gray-200 overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
                                                                <table className="min-w-full border-separate" style={{ borderSpacing: 0 }}>
                                                                    <thead>
                                                                        <tr>
                                                                            <th className={`${th} text-left`}>Category</th>
                                                                            <th className={th}>Creates</th>
                                                                            <th className={th}>
                                                                                {/* hierarchy toggle lives here — auto-saves on click */}
                                                                                <div className="flex items-center justify-center gap-2">
                                                                                    <span>Branch Admin (BM)</span>
                                                                                    <Toggle on={val(u, 'require_branch') !== false}
                                                                                        onChange={v => { setVal(u, 'require_branch', v); saveRule(u, { require_branch: v }); }} />
                                                                                </div>
                                                                            </th>
                                                                            <th className={th}>
                                                                                <div className="flex items-center justify-center gap-2">
                                                                                    <span>HOD</span>
                                                                                    <Toggle on={val(u, 'require_hod') !== false}
                                                                                        onChange={v => { setVal(u, 'require_hod', v); saveRule(u, { require_hod: v }); }} />
                                                                                </div>
                                                                            </th>
                                                                            <th className={th}>COO</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {chainTree(u).map(row => {
                                                                            // steps: [creator, BM, HOD, COO]
                                                                            const [creator, bm, hod, coo] = row.steps;
                                                                            const cell = (s) => s.skipReason ? (
                                                                                <span className="px-2 py-0.5 rounded-lg border whitespace-nowrap inline-block bg-gray-100 text-gray-600 border-gray-200 text-[11px]">
                                                                                    {s.skipReason}
                                                                                </span>
                                                                            ) : (
                                                                                <span className="inline-flex flex-wrap items-center justify-center gap-1">
                                                                                    {s.names.map(p => p.id ? (
                                                                                        /* clickable person chip — toggles exclusion for THIS employee+category */
                                                                                        <button key={p.id} type="button"
                                                                                            onClick={() => toggleExclusion(u, p)}
                                                                                            disabled={savingId === `excl_${u.user_id}_${p.id}_${p.category}`}
                                                                                            title={p.excluded
                                                                                                ? `Excluded for ${u.name}'s ${catLabel(p.category)} records — click to allow`
                                                                                                : `Click to stop ${p.name} approving ${u.name}'s ${catLabel(p.category)} records`}
                                                                                            className={`px-2 py-0.5 rounded-lg border whitespace-nowrap text-[11px] transition disabled:opacity-50 ${p.excluded
                                                                                                ? 'bg-red-50 text-red-500 border-red-200 line-through'
                                                                                                : 'bg-white text-gray-800 border-gray-300 hover:border-indigo-400 hover:bg-indigo-50'}`}>
                                                                                            {p.name}
                                                                                        </button>
                                                                                    ) : (
                                                                                        <span key={p.name} className="px-2 py-0.5 rounded-lg border whitespace-nowrap inline-block bg-white text-gray-800 border-gray-300 text-[11px]">
                                                                                            {p.name}
                                                                                        </span>
                                                                                    ))}
                                                                                </span>
                                                                            );
                                                                            return (
                                                                                <tr key={row.label} className="hover:bg-gray-50/60">
                                                                                    <td className={`${td} text-left font-bold text-gray-800 whitespace-nowrap`}>{row.label}</td>
                                                                                    <td className={td}>{cell(creator)}</td>
                                                                                    <td className={td}>{cell(bm)}</td>
                                                                                    <td className={td}>{cell(hod)}</td>
                                                                                    <td className={td}>{cell(coo)}</td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                            <p className="mt-2 text-[10px] text-gray-600">
                                                                Click a BM / HOD name to block or allow that person for this employee's records of THAT category only.
                                                                Crossed red = blocked; if a step has nobody left, records auto-skip to the next authority.
                                                            </p>
                                                        </td>
                                                    </tr>
                                                )}
                                                </Fragment>
                                            );
                                        })}
                                        {visibleUsers.length === 0 && (
                                            <tr><td colSpan={7} className="px-3 py-10 text-center text-xs text-gray-600">No users in this branch</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : tab === 'hod' ? (
                        <>
                            <p className="text-[11px] text-gray-700">
                                Assign which HOD-level user approves each category at the HOD step
                                (HOD and COO see records of all branches). No assignment = any HOD user may act.
                            </p>
                            <div className="rounded-xl border border-gray-200 overflow-hidden">
                                <table className="min-w-full border-separate" style={{ borderSpacing: 0 }}>
                                    <thead>
                                        <tr>
                                            <th className={th}>Category</th>
                                            <th className={th}>HOD Approver</th>
                                            <th className={th}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {CATEGORY_OPTIONS.map(c => {
                                            // multiple approvers per category — every ticked person can approve
                                            const selected = (data.hod_categories[c.value] || []).map(m => m.user_id);
                                            const toggle = (uid) => {
                                                const next = selected.includes(uid)
                                                    ? selected.filter(x => x !== uid)
                                                    : [...selected, uid];
                                                saveHodCategory(c.value, next);
                                            };
                                            return (
                                                <tr key={c.value} className="hover:bg-gray-50/60">
                                                    <td className={`${td} font-semibold text-black whitespace-nowrap`}>{c.label}</td>
                                                    <td className={`${td} text-left`}>
                                                        {hodUsers.length === 0 ? (
                                                            <span className="text-[10px] text-gray-600">No HOD-level users yet — assign HOD authority first</span>
                                                        ) : (
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {hodUsers.map(u => {
                                                                    const on = selected.includes(u.user_id);
                                                                    return (
                                                                        <button key={u.user_id} type="button"
                                                                            onClick={() => toggle(u.user_id)}
                                                                            disabled={savingId === c.value}
                                                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors disabled:opacity-50 ${on
                                                                                ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
                                                                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
                                                                            {u.name} ({u.user_id})
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className={`${td} text-[10px] text-gray-600 whitespace-nowrap`}>
                                                        {selected.length === 0 ? 'Any HOD user' : `${selected.length} approver${selected.length > 1 ? 's' : ''}`}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="text-[11px] text-gray-700">
                                Manage the Expense Type dropdown here (add / remove only). Each approver's
                                amount per type is set in the <b>Approver Authority &amp; Limits</b> tab.
                                A newly added type starts as <b>Unlimited</b> for every approver.
                            </p>

                            <form onSubmit={addType} className="flex gap-2">
                                <input value={newTypeName} onChange={e => setNewTypeName(e.target.value)}
                                    placeholder="New expense type — e.g. Travel, Repair, Site work"
                                    className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                                <button type="submit" disabled={savingId === 'newtype'}
                                    className="px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50 whitespace-nowrap"
                                    style={{ background: BRAND }}>
                                    {savingId === 'newtype' ? 'Adding…' : 'Add Type'}
                                </button>
                            </form>

                            <div className="rounded-xl border border-gray-200 overflow-hidden">
                                <table className="min-w-full border-separate" style={{ borderSpacing: 0 }}>
                                    <thead>
                                        <tr>
                                            <th className={th}>Expense Type</th>
                                            <th className={`${th} w-24`}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.expense_types.length === 0 && (
                                            <tr><td colSpan={2} className="px-3 py-10 text-center text-xs text-gray-600">
                                                No expense types yet — add the first one above
                                            </td></tr>
                                        )}
                                        {data.expense_types.map(t => (
                                            <tr key={t.id} className="hover:bg-gray-50/60">
                                                <td className={`${td} text-left font-semibold text-black`}>{t.name}</td>
                                                <td className={`${td} w-24 whitespace-nowrap`}>
                                                    <div className="flex items-center justify-center gap-1">
                                                        <button onClick={() => editType(t)}
                                                            className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50" title="Rename type">
                                                            <Pencil size={13} />
                                                        </button>
                                                        <button onClick={() => deleteType(t)}
                                                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50" title="Remove type">
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
