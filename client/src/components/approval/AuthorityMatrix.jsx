/* Authority Matrix — UI reorganised into three tabs (logic unchanged):

   1. Employee Hierarchy — branch-wise builder table:
      Branch -> Employees -> BM (Branch Manager, multi-select from that
      branch's members) -> HOD (per category, multi-select from HO branch
      members) -> COO (fixed rights masters). Selecting a person as BM / HOD
      grants that authority level (existing endpoints); they automatically
      leave the plain-employee list. Multi-branch users appear under every
      branch they can access.
   2. Authority Limit — limits for the people picked in the hierarchy
      (Employee / BM / HOD role filter, no level dropdown; the name opens the
      category-wise flow tree where step toggles + exclusions live).
   3. Expense Types & Limits — the expense-type master.                     */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import {
    X, Network, UserCog, GitBranch, Wallet, Trash2, Pencil, Search,
    ArrowRight, Plus,
} from 'lucide-react';
import {
    getMatrix, setAuthority, setEmployeeRule, setHodCategory,
    addExpenseType, removeExpenseType, renameExpenseType,
    setApproverExclusion, errText,
} from './approvalApi';
import { BRAND, CATEGORY_OPTIONS, catLabel } from './ApprovalShared';

const input = 'w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300';
/* border-b/-r only (with border-separate tables): collapsed borders don't
   stick with position:sticky in Chrome, which left a gap over the frozen
   header. The container's own border supplies the top/left edges. */
const th = 'px-2.5 py-2 border-b border-r border-gray-200 bg-gray-50 text-gray-800 font-semibold text-center text-[11px] uppercase tracking-wide whitespace-nowrap';
const td = 'px-2.5 py-1.5 border-b border-r border-gray-200 text-center align-middle text-xs';

const ROLE_FILTERS = [
    { value: '', label: 'All Roles' },
    { value: 'user', label: 'Employee' },
    { value: 'branch', label: 'BM' },
    { value: 'hod', label: 'HOD' },
];

// Which branches are shown as hierarchy rows — UI-only state, kept per
// browser so the builder view survives refreshes.
const LS_KEY = 'apvHierarchyBranches';

// Multi-select popover with PENDING selection: tick any number of people,
// changes apply ONCE when the popover closes (one alert, not one per person).
// Top-level component so its local state survives parent re-renders.
function MultiPick({ id, openPick, setOpenPick, buttonLabel, options, selectedIds, onApply }) {
    const [localSel, setLocalSel] = useState([]);
    const open = openPick === id;
    const openNow = () => { setLocalSel(selectedIds); setOpenPick(id); };
    const closeApply = () => {
        setOpenPick(null);
        const changed = localSel.length !== selectedIds.length
            || localSel.some(i => !selectedIds.includes(i));
        if (changed) onApply(localSel);
    };
    const toggle = (uid) =>
        setLocalSel(prev => prev.includes(uid) ? prev.filter(i => i !== uid) : [...prev, uid]);
    return (
        <div className="relative inline-block text-left" onMouseLeave={() => { if (open) closeApply(); }}>
            <button type="button" onClick={() => (open ? closeApply() : openNow())}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 whitespace-nowrap">
                {buttonLabel} ▾
            </button>
            {open && (
                <div className="absolute left-0 top-full z-30 pt-1">
                    <div className="w-64 rounded-xl border border-gray-200 bg-white shadow-xl p-2 text-left">
                        <div className="max-h-56 overflow-y-auto space-y-0.5" style={{ scrollbarWidth: 'thin' }}>
                            {options.length === 0 && (
                                <p className="px-2 py-2 text-[11px] text-gray-600">No members found</p>
                            )}
                            {options.map(m => (
                                <label key={m.user_id}
                                    className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-gray-50 cursor-pointer text-[11px] text-gray-800">
                                    <input type="checkbox" checked={localSel.includes(m.user_id)}
                                        onChange={() => toggle(m.user_id)} className="accent-indigo-600" />
                                    <span className="truncate">{m.name} ({m.user_id})</span>
                                </label>
                            ))}
                        </div>
                        <button type="button" onClick={closeApply}
                            className="mt-1.5 w-full px-2 py-1.5 rounded-lg text-[11px] font-semibold text-white"
                            style={{ background: BRAND }}>
                            Done
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function AuthorityMatrix({ onClose }) {
    const [data, setData] = useState({
        users: [], branches: [], hod_categories: {}, expense_types: [],
        chain_data: null, exclusions: {}, branch_members: {},
    });
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('hierarchy');   // hierarchy | limits | expense
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [branchFilter, setBranchFilter] = useState('');
    // Local editable copies keyed by user_id (limits tab)
    const [edits, setEdits] = useState({});
    const [savingId, setSavingId] = useState(null);
    const [newTypeName, setNewTypeName] = useState('');
    const [openExpenseFor, setOpenExpenseFor] = useState(null);
    const [openPick, setOpenPick] = useState(null);       // which multi-select popover is open
    const [treeFor, setTreeFor] = useState(null);         // hierarchy tree popup (name click)
    const [addedBranches, setAddedBranches] = useState(null);   // hierarchy rows
    const [editingRow, setEditingRow] = useState(null);         // branch row in edit mode

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const d = await getMatrix();
            setData({
                users: d.users || [], branches: d.branches || [],
                hod_categories: d.hod_categories || {}, expense_types: d.expense_types || [],
                chain_data: d.chain_data || null,
                exclusions: d.exclusions || {},
                branch_members: d.branch_members || {},
            });
            setEdits({});
        } catch (err) {
            toast.error(errText(err, 'Failed to load authority matrix'));
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Initialise the hierarchy rows once data arrives: stored list if any,
    // else every branch that already has a Branch Manager assigned.
    useEffect(() => {
        if (addedBranches !== null || loading) return;
        let stored = null;
        try { stored = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { /* ignore */ }
        if (Array.isArray(stored)) { setAddedBranches(stored); return; }
        setAddedBranches(Object.keys(data.chain_data?.branch_approvers || {}));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, data]);

    const persistBranches = (list) => {
        setAddedBranches(list);
        try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
    };

    const branchName = (code) => data.branches.find(b => b.branch === code)?.branch_name || '';
    const userOf = (id) => data.users.find(x => x.user_id === id);
    const membersOf = (code) => data.branch_members[code] || [];
    const cooNames = data.chain_data?.coo_names?.length ? data.chain_data.coo_names : ['COO'];

    /* ------- limits tab local-edit helpers ------- */
    const val = (u, key) => {
        const e = edits[u.user_id];
        return e && key in e ? e[key] : (u[key] ?? '');
    };
    const setVal = (u, key, v) =>
        setEdits(prev => ({ ...prev, [u.user_id]: { ...prev[u.user_id], [key]: v } }));
    const expVal = (u, t) => {
        const k = `exp_${t.id}`;
        const e = edits[u.user_id];
        return e && k in e ? e[k] : (u.expense_limits?.[t.id] ?? '');
    };
    const isDirtyAuthority = (u) => {
        const same = (a, b) => String(a ?? '') === String(b ?? '');
        if (!same(val(u, 'max_discount_percent'), u.max_discount_percent)) return true;
        if (!same(val(u, 'max_credit_days'), u.max_credit_days)) return true;
        return data.expense_types.some(t => !same(expVal(u, t), u.expense_limits?.[t.id]));
    };

    const showImpact = async (res, fallbackMsg) => {
        if (res?.impact?.message) {
            await Swal.fire({ title: 'Saved', text: res.impact.message, icon: 'info', confirmButtonColor: BRAND });
        } else if (res?.moved) {
            await Swal.fire({
                title: 'Saved',
                text: `${res.moved} pending record(s) were forwarded to the next authority.`,
                icon: 'info', confirmButtonColor: BRAND,
            });
        } else if (fallbackMsg) {
            toast.success(fallbackMsg);
        }
    };

    // Change ONLY the level, preserving the user's stored limits.
    const authorityPayload = (u, level) => ({
        user_id: u.user_id,
        level,
        max_discount_percent: u.max_discount_percent ?? '',
        max_credit_days: u.max_credit_days ?? '',
        expense_type_limits: data.expense_types.map(t => ({
            expense_type_id: t.id, max_amount: u.expense_limits?.[t.id] ?? '',
        })),
    });

    /* ------- hierarchy tab actions (BATCH: one alert per apply) ------- */

    const doneAlert = async (movedTotal, what) => {
        if (movedTotal) {
            await Swal.fire({
                title: 'Saved', icon: 'info', confirmButtonColor: BRAND,
                text: `${what} updated. ${movedTotal} pending record(s) were forwarded to the next authority.`,
            });
        } else {
            await Swal.fire({
                title: 'Saved', text: `${what} updated.`, icon: 'success',
                timer: 1500, showConfirmButton: false,
            });
        }
    };

    // Apply the whole BM selection of a branch at once.
    const applyBMSelection = async (branchCode, members, ids) => {
        setSavingId(`bm_${branchCode}`);
        try {
            let moved = 0;
            for (const m of members) {
                const u = userOf(m.user_id);
                if (!u) continue;
                const shouldBeBM = ids.includes(m.user_id);
                if (shouldBeBM && u.level !== 'branch') {
                    const res = await setAuthority(authorityPayload(u, 'branch'));
                    moved += res?.impact?.moved || 0;
                } else if (!shouldBeBM && u.level === 'branch') {
                    const res = await setAuthority(authorityPayload(u, 'user'));
                    moved += res?.impact?.moved || 0;
                }
            }
            await load();
            await doneAlert(moved, 'Branch Managers');
        } catch (err) {
            toast.error(errText(err, 'Failed to update Branch Managers'));
        } finally { setSavingId(null); }
    };

    // Apply one BRANCH+category's whole HOD selection at once. New approvers
    // get HOD authority; people removed from their LAST mapping anywhere
    // return to Employee.
    const hodMapsOf = (branchCode, cat) => ((data.hod_categories[branchCode] || {})[cat] || []);
    const mappedAnywhere = (uid, exceptBranch, exceptCat) =>
        Object.entries(data.hod_categories).some(([b, cats]) =>
            Object.entries(cats).some(([c, list]) =>
                !(b === exceptBranch && c === exceptCat) && list.some(m => m.user_id === uid)));

    const applyHodSelection = async (branchCode, cat, ids) => {
        setSavingId(`hod_${branchCode}_${cat}`);
        try {
            const current = hodMapsOf(branchCode, cat).map(m => m.user_id);
            const added = ids.filter(i => !current.includes(i));
            const removed = current.filter(i => !ids.includes(i));
            let moved = 0;
            for (const id of added) {
                const u = userOf(id);
                if (u && u.level !== 'hod') {
                    const res = await setAuthority(authorityPayload(u, 'hod'));
                    moved += res?.impact?.moved || 0;
                }
            }
            const res = await setHodCategory(branchCode, cat, ids);
            moved += res?.moved || 0;
            for (const id of removed) {
                const u = userOf(id);
                if (!u) continue;
                if (!mappedAnywhere(id, branchCode, cat) && u.level === 'hod') {
                    const r2 = await setAuthority(authorityPayload(u, 'user'));
                    moved += r2?.impact?.moved || 0;
                }
            }
            await load();
            await doneAlert(moved, `HOD approvers for ${catLabel(cat)} (${branchCode})`);
        } catch (err) {
            toast.error(errText(err, 'Failed to update HOD approvers'));
        } finally { setSavingId(null); }
    };

    /* ------- limits tab save ------- */
    const saveAuthority = async (u) => {
        if (!isDirtyAuthority(u)) return;
        setSavingId(u.user_id);
        try {
            const res = await setAuthority({
                user_id: u.user_id,
                level: u.level,
                max_discount_percent: val(u, 'max_discount_percent'),
                max_credit_days: val(u, 'max_credit_days'),
                expense_type_limits: data.expense_types.map(t => ({
                    expense_type_id: t.id, max_amount: expVal(u, t),
                })),
            });
            await load();
            await showImpact(res, `Saved — ${u.name}`);
        } catch (err) {
            toast.error(errText(err, 'Failed to save limits'));
        } finally { setSavingId(null); }
    };

    // Step toggles (require BM / HOD) live in the tree popup now
    const saveRule = async (u, overrides = {}) => {
        const cur = (k) => (k in overrides ? overrides[k]
            : (k === 'require_branch' ? u.require_branch !== false : u.require_hod !== false));
        setSavingId(`rule_${u.user_id}`);
        try {
            const res = await setEmployeeRule({
                user_id: u.user_id,
                require_branch: cur('require_branch'),
                require_hod: cur('require_hod'),
            });
            await load();
            await showImpact(res, `Saved — ${u.name}`);
        } catch (err) {
            toast.error(errText(err, 'Failed to save hierarchy step'));
        } finally { setSavingId(null); }
    };

    /* ------- expense-type master ------- */
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
            title: 'Remove expense type?', text: `"${t.name}" and its approver limits will be removed`,
            icon: 'warning', showCancelButton: true, confirmButtonText: 'Remove', confirmButtonColor: '#dc2626',
        });
        if (!res.isConfirmed) return;
        try {
            await removeExpenseType(t.id);
            toast.success('Expense type removed');
            await load();
        } catch (err) { toast.error(errText(err, 'Failed to remove expense type')); }
    };
    const editType = async (t) => {
        const { value: name, isConfirmed } = await Swal.fire({
            title: 'Rename expense type', input: 'text', inputValue: t.name,
            showCancelButton: true, confirmButtonText: 'Save', confirmButtonColor: BRAND,
            inputValidator: (v) => (!v || !v.trim()) ? 'Name is required' : undefined,
        });
        if (!isConfirmed || !name.trim() || name.trim() === t.name) return;
        try {
            await renameExpenseType(t.id, name.trim());
            toast.success('Expense type renamed');
            await load();
        } catch (err) { toast.error(errText(err, 'Failed to rename expense type')); }
    };

    /* ------- exclusions (tree popup chips) ------- */
    const toggleExclusion = async (u, p) => {
        const key = `excl_${u.user_id}_${p.id}_${p.category}`;
        setSavingId(key);
        try {
            const res = await setApproverExclusion({
                employee_id: u.user_id, approver_id: p.id, category: p.category, excluded: !p.excluded,
            });
            await load();
            await showImpact(res, p.excluded
                ? `${p.name} can approve ${u.name}'s ${catLabel(p.category)} records again`
                : `${p.name} will no longer receive ${u.name}'s ${catLabel(p.category)} records`);
        } catch (err) {
            toast.error(errText(err, 'Failed to save exclusion'));
        } finally { setSavingId(null); }
    };

    /* ------- derived data ------- */

    const rows = addedBranches || [];
    const remainingBranches = useMemo(() =>
        data.branches.filter(b => !rows.includes(b.branch) && membersOf(b.branch).length > 0),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [data, rows]);

    // Users shown in the Authority Limit tab: everyone taking part in the
    // hierarchy (employees of added branches + all BMs + all HODs)
    const memberOfAdded = useMemo(() => {
        const s = new Set();
        rows.forEach(b => membersOf(b).forEach(m => s.add(m.user_id)));
        return s;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, data]);

    const limitUsers = useMemo(() =>
        data.users.filter(u =>
            (u.level === 'branch' || u.level === 'hod' ||
                (u.level === 'user' && memberOfAdded.has(u.user_id))) &&
            (!roleFilter || u.level === roleFilter) &&
            (!branchFilter || u.branch === branchFilter ||
                membersOf(branchFilter).some(m => m.user_id === u.user_id)) &&
            (!search || u.name.toLowerCase().includes(search.toLowerCase())
                || u.user_id.toLowerCase().includes(search.toLowerCase()))),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [data.users, memberOfAdded, roleFilter, branchFilter, search]);

    // Category-wise chain preview (tree popup). Person chips carry ids so the
    // exclusion toggle keeps working.
    const chainTree = (u) => {
        const cd = data.chain_data || {};
        const reqB = u.require_branch !== false;
        const reqH = u.require_hod !== false;
        const step = (tag, names, skipReason = null) => ({ tag, names, skipReason });
        return CATEGORY_OPTIONS.map(c => {
            const excl = (data.exclusions[u.user_id] || {})[c.value] || [];
            const person = (p) => ({ id: p.user_id, name: p.name, excluded: excl.includes(p.user_id), category: c.value });
            const bms = ((cd.branch_approvers || {})[u.branch] || []).map(person);
            const hods = (((cd.hod_by_branch || {})[u.branch] || {})[c.value] || []).map(person);
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

    /* ------- small UI pieces ------- */

    const chip = (text, key) => (
        <span key={key ?? text} className="px-2 py-0.5 rounded-lg border whitespace-nowrap inline-block bg-white text-gray-800 border-gray-300 text-[11px]">
            {text}
        </span>
    );

    // Arrow sits ON the cell border (no separate column)
    const cellArrow = (
        <span className="absolute top-1/2 -translate-y-1/2 -right-[9px] z-10 bg-white rounded-full border border-gray-200 p-0.5 text-gray-400">
            <ArrowRight size={11} />
        </span>
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

    const Toggle = ({ on, onChange }) => (
        <button type="button" onClick={() => onChange(!on)}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold border transition-colors ${on
                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
            {on ? 'Required' : 'Skipped'}
        </button>
    );

    /* ================= RENDER ================= */
    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}>
                {/* Blue bar: title + tabs + close, in ONE row */}
                <div className="sticky top-0 z-30 flex flex-nowrap items-center gap-3 px-5 py-2.5 rounded-t-2xl text-white overflow-x-auto" style={{ background: BRAND, scrollbarWidth: 'thin' }}>
                    <span className="font-semibold text-sm flex items-center gap-2 whitespace-nowrap flex-shrink-0">
                        <Network size={16} /> Authority Matrix
                    </span>
                    <div className="ml-auto flex flex-nowrap items-center gap-2">
                        {tabBtn('hierarchy', 'Employee Hierarchy', GitBranch)}
                        {tabBtn('limits', 'Authority Limit', UserCog)}
                        {tabBtn('expense', 'Expense Types & Limits', Wallet)}
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/15 flex-shrink-0"><X size={16} /></button>
                </div>

                {/* content fills the rest of the box */}
                <div className="px-5 py-2.5 flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto">
                    {loading || addedBranches === null ? (
                        <div className="py-16 text-center text-sm text-gray-600">Loading authority matrix…</div>
                    ) : tab === 'hierarchy' ? (
                        <>
                            <p className="text-[11px] text-gray-700">
                                Build each branch's approval hierarchy: pick the <b>Branch Manager(s)</b> from that branch's members
                                (they leave the employee list automatically), assign <b>HOD approvers per category</b> (HO branch members only) — COO is fixed.
                                Multi-branch users appear under every branch they can access.
                            </p>
                            <div className="rounded-xl border border-gray-200 overflow-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                                <table className="min-w-full border-separate" style={{ borderSpacing: 0 }}>
                                    <thead className="sticky top-0 z-10">
                                        <tr>
                                            <th className={`${th} min-w-[140px]`}>Branch</th>
                                            <th className={`${th} min-w-[220px]`}>Employee</th>
                                            <th className={`${th} min-w-[170px]`}>BM (Branch Manager)</th>
                                            <th className={`${th} min-w-[260px]`}>HOD (Category Wise)</th>
                                            <th className={th}>COO</th>
                                            <th className={`${th} w-16`}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map(code => {
                                            const members = membersOf(code);
                                            const bms = members.filter(m => userOf(m.user_id)?.level === 'branch');
                                            const emps = members.filter(m => userOf(m.user_id)?.level === 'user');
                                            const hoMembers = membersOf('HO');
                                            const isEditing = editingRow === code;
                                            return (
                                                <tr key={code} className={isEditing ? 'bg-amber-50/60' : 'hover:bg-gray-50/60'}>
                                                    <td className={`${td} text-left`}>
                                                        <p className="font-bold text-black">{code}</p>
                                                        <p className="text-[10px] text-gray-600">{branchName(code)}</p>
                                                    </td>
                                                    {/* arrows sit ON the border of the flow cells */}
                                                    <td className={`${td} text-left relative`}>
                                                        <div className="flex flex-wrap gap-1">
                                                            {emps.length
                                                                ? emps.map(m => (
                                                                    /* name click -> hierarchy tree popup */
                                                                    <button key={m.user_id} type="button"
                                                                        onClick={() => setTreeFor(m.user_id)}
                                                                        title="Show this employee's approval flow"
                                                                        className="px-2 py-0.5 rounded-lg border whitespace-nowrap text-[11px] bg-white text-gray-800 border-gray-300 hover:border-indigo-400 hover:bg-indigo-50">
                                                                        {m.name}
                                                                    </button>
                                                                ))
                                                                : <span className="text-[11px] text-gray-600">No plain employees — all are managers</span>}
                                                        </div>
                                                        {cellArrow}
                                                    </td>
                                                    <td className={`${td} text-left relative`}>
                                                        <div className="flex flex-wrap items-center gap-1">
                                                            {bms.map(m => chip(m.name, m.user_id))}
                                                            {!bms.length && !isEditing && <span className="text-[11px] text-gray-500">—</span>}
                                                            {isEditing && (
                                                                <MultiPick id={`bm_${code}`}
                                                                    openPick={openPick} setOpenPick={setOpenPick}
                                                                    buttonLabel={bms.length ? 'Change' : 'Select BM'}
                                                                    options={members}
                                                                    selectedIds={bms.map(m => m.user_id)}
                                                                    onApply={(ids) => applyBMSelection(code, members, ids)} />
                                                            )}
                                                        </div>
                                                        {cellArrow}
                                                    </td>
                                                    <td className={`${td} text-left relative`}>
                                                        {/* three category sub-rows in one cell — label line, then the
                                                            names on the NEXT line. Assignments are PER BRANCH — each
                                                            row sets its own approvers. */}
                                                        <div className="space-y-1.5">
                                                            {CATEGORY_OPTIONS.map(c => {
                                                                // PER-BRANCH assignment — each row sets its own approvers
                                                                const sel = hodMapsOf(code, c.value);
                                                                return (
                                                                    <div key={c.value}>
                                                                        <p className="text-[10px] font-bold text-gray-700">{c.label}:</p>
                                                                        <div className="flex flex-wrap items-center gap-1 mt-0.5">
                                                                            {sel.map(m => chip(m.user_name || m.user_id, m.user_id))}
                                                                            {!sel.length && !isEditing && <span className="text-[11px] text-gray-500">—</span>}
                                                                            {isEditing && (
                                                                                <MultiPick id={`hod_${code}_${c.value}`}
                                                                                    openPick={openPick} setOpenPick={setOpenPick}
                                                                                    buttonLabel={sel.length ? 'Change' : 'Select'}
                                                                                    options={hoMembers}
                                                                                    selectedIds={sel.map(m => m.user_id)}
                                                                                    onApply={(ids) => applyHodSelection(code, c.value, ids)} />
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                        {cellArrow}
                                                    </td>
                                                    <td className={td}>
                                                        <div className="flex flex-wrap justify-center gap-1">
                                                            {cooNames.map(n => chip(n))}
                                                        </div>
                                                    </td>
                                                    <td className={td}>
                                                        <div className="flex flex-col items-center gap-1">
                                                            {isEditing ? (
                                                                <button type="button" title="Finish editing this row"
                                                                    onClick={() => setEditingRow(null)}
                                                                    className="px-3 py-1 rounded-lg text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700">
                                                                    Save
                                                                </button>
                                                            ) : (
                                                                <button type="button" title="Edit this row's BM / HOD selection"
                                                                    onClick={() => setEditingRow(code)}
                                                                    className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50">
                                                                    <Pencil size={13} />
                                                                </button>
                                                            )}
                                                            <button type="button" title="Remove this branch row (assignments are kept)"
                                                                onClick={async () => {
                                                                    const res = await Swal.fire({
                                                                        title: 'Remove this branch row?',
                                                                        text: `${code} — ${branchName(code)} will be removed from the hierarchy view. BM / HOD assignments themselves are kept.`,
                                                                        icon: 'warning',
                                                                        showCancelButton: true,
                                                                        confirmButtonText: 'Remove',
                                                                        confirmButtonColor: '#dc2626',
                                                                    });
                                                                    if (!res.isConfirmed) return;
                                                                    persistBranches(rows.filter(b => b !== code));
                                                                    if (isEditing) setEditingRow(null);
                                                                }}
                                                                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50">
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {rows.length === 0 && (
                                            <tr><td colSpan={6} className="px-3 py-10 text-center text-xs text-gray-600">
                                                No branches added yet — use the Add Row below to start building the hierarchy
                                            </td></tr>
                                        )}
                                        {/* Add Row lives INSIDE the table as its last row (MOM-sheet style) */}
                                        <tr>
                                            <td colSpan={6} className="px-3 py-2 border-b border-r border-gray-200 bg-gray-50/60">
                                                {remainingBranches.length > 0 ? (
                                                    <div className="flex items-center gap-2">
                                                        <Plus size={13} className="text-indigo-600 flex-shrink-0" />
                                                        <select className="border border-dashed border-indigo-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-indigo-700 font-semibold w-72 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                                            value=""
                                                            onChange={e => {
                                                                if (e.target.value) {
                                                                    persistBranches([...rows, e.target.value]);
                                                                    // new rows open straight in edit mode with their Save button
                                                                    setEditingRow(e.target.value);
                                                                }
                                                            }}>
                                                            <option value="">Add Row — select a branch…</option>
                                                            {remainingBranches.map(b => (
                                                                <option key={b.branch} value={b.branch}>{b.branch} — {b.branch_name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                ) : (
                                                    <span className="text-[11px] text-gray-600">All branches with employees are already added.</span>
                                                )}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : tab === 'limits' ? (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="text-[11px] text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis min-w-0 flex-1">
                                    Within limit = <b>final approval</b>; above limit = next level. Blank = 0.
                                </p>
                                <div className="relative flex-shrink-0">
                                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
                                    <input value={search} onChange={e => setSearch(e.target.value)}
                                        placeholder="Search employee name / id…"
                                        className="pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-xs w-56 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                                </div>
                                <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
                                    className="flex-shrink-0 border border-gray-300 rounded-lg px-2.5 py-2 text-xs bg-white">
                                    {ROLE_FILTERS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                                <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
                                    className="flex-shrink-0 border border-gray-300 rounded-lg px-2.5 py-2 text-xs bg-white">
                                    <option value="">All Branches</option>
                                    {data.branches.map(b => (
                                        <option key={b.branch} value={b.branch}>{b.branch} — {b.branch_name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="rounded-xl border border-gray-200 overflow-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                                <table className="min-w-full border-separate" style={{ borderSpacing: 0 }}>
                                    <thead className="sticky top-0 z-10">
                                        <tr>
                                            <th className={`${th} min-w-[220px]`}>Employee</th>
                                            <th className={th}>Branch</th>
                                            <th className={th}>Role</th>
                                            <th className={`${th} w-40 !whitespace-normal`}>Max Discounting %</th>
                                            <th className={`${th} w-32 !whitespace-normal`}>Max Credit Days</th>
                                            <th className={th}>Max Expense Amount (per type)</th>
                                            <th className={`${th} w-20`}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {limitUsers.map(u => {
                                            const isPlainEmployee = u.level === 'user';
                                            return (
                                                <tr key={u.user_id} className="hover:bg-gray-50/60">
                                                    <td className={`${td} text-left`}>
                                                        {/* name click -> hierarchy tree popup with the 3-category flow */}
                                                        <button type="button" onClick={() => setTreeFor(u.user_id)}
                                                            title="Show approval hierarchy tree"
                                                            className="font-semibold text-black hover:text-indigo-700 hover:underline decoration-dotted underline-offset-2 text-left">
                                                            {u.name}
                                                        </button>
                                                        <p className="text-[10px] text-gray-600">{u.user_id}</p>
                                                    </td>
                                                    <td className={td}>{u.branch}</td>
                                                    <td className={td}>
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${u.level === 'branch'
                                                            ? 'bg-amber-100 text-amber-700'
                                                            : u.level === 'hod' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                                            {u.level === 'branch' ? 'BM' : u.level === 'hod' ? 'HOD' : 'Employee'}
                                                        </span>
                                                    </td>
                                                    <td className={td}>
                                                        {isPlainEmployee ? <span className="text-gray-600">—</span> : (
                                                            <div className="relative">
                                                                <input className={`${input} text-center ${String(val(u, 'max_discount_percent') ?? '') !== '' ? 'pr-6' : ''}`}
                                                                    type="number" min="0" max="100" step="0.01"
                                                                    placeholder="0"
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
                                                                    placeholder="0"
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
                                                                            {setCount ? `${setCount} type limit${setCount > 1 ? 's' : ''} set` : 'All 0 (default)'} ▾
                                                                        </button>
                                                                        {open && (
                                                                            <div className="absolute right-0 top-full z-20 pt-1">
                                                                                <div className="w-60 rounded-xl border border-gray-200 bg-white shadow-xl p-2.5 space-y-1.5">
                                                                                    {data.expense_types.map(t => (
                                                                                        <div key={t.id} className="flex items-center gap-2">
                                                                                            <span className="w-20 flex-shrink-0 text-left text-[10px] font-semibold text-gray-700 truncate" title={t.name}>{t.name}</span>
                                                                                            <input className={input} type="number" min="0" step="0.01"
                                                                                                placeholder="0"
                                                                                                value={expVal(u, t) ?? ''}
                                                                                                onChange={e => setVal(u, `exp_${t.id}`, e.target.value)} />
                                                                                        </div>
                                                                                    ))}
                                                                                    <p className="text-[9px] text-gray-600 text-left pt-0.5">
                                                                                        Blank = 0 · press Save in the Action column to store
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}
                                                    </td>
                                                    <td className={td}>
                                                        {(() => {
                                                            const dirty = isDirtyAuthority(u);
                                                            const saving = savingId === u.user_id;
                                                            return (
                                                                <div className="flex flex-col items-center gap-0.5">
                                                                    <button type="button" onClick={() => saveAuthority(u)}
                                                                        disabled={saving || !dirty}
                                                                        className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition ${dirty
                                                                            ? 'text-white shadow-sm animate-pulse'
                                                                            : 'bg-gray-100 text-gray-500 border border-gray-200 cursor-default'}`}
                                                                        style={dirty ? { background: '#d97706' } : undefined}>
                                                                        {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
                                                                    </button>
                                                                    {dirty && !saving && (
                                                                        <span className="text-[9px] font-bold text-amber-600 whitespace-nowrap">Pending to save</span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {limitUsers.length === 0 && (
                                            <tr><td colSpan={7} className="px-3 py-10 text-center text-xs text-gray-600">
                                                No matching users — build the hierarchy in the first tab
                                            </td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="text-[11px] text-gray-700">
                                Manage the Expense Type dropdown here (add / remove only). Each approver's
                                amount per type is set in the <b>Authority Limit</b> tab.
                                A newly added type starts as <b>0</b> for every approver.
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

            {/* Hierarchy TREE popup — VIEW-ONLY org chart; the only editable
                thing is whether the BM / HOD steps are required */}
            {treeFor && (() => {
                const u = userOf(treeFor);
                if (!u) return null;
                const cd = data.chain_data || {};
                const reqB = u.require_branch !== false;
                const reqH = u.require_hod !== false;
                const bms = (cd.branch_approvers || {})[u.branch] || [];
                const excludedIn = (cat, id) => ((data.exclusions[u.user_id] || {})[cat] || []).includes(id);

                const OrgCard = ({ title, names = [], badge, dark = false, skipped = false, wide = false }) => (
                    <div className={`rounded-xl shadow-sm border px-3.5 py-2.5 text-left ${wide ? 'min-w-[200px]' : 'min-w-[160px]'} max-w-[240px] ${dark
                        ? 'text-white border-transparent'
                        : skipped ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200 border-t-4 border-t-indigo-400'}`}
                        style={dark ? { background: BRAND } : undefined}>
                        <div className="flex items-center justify-between gap-2">
                            <p className={`text-[12px] font-bold ${dark ? '' : skipped ? 'text-gray-500' : 'text-gray-900'}`}>{title}</p>
                            {badge && (
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${dark ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-700'}`}>{badge}</span>
                            )}
                        </div>
                        {names.map(n => (
                            <p key={n.name} className={`text-[11px] ${dark ? 'text-white/80' : n.excluded ? 'text-red-400 line-through' : 'text-gray-700'}`}>
                                {n.name}
                            </p>
                        ))}
                    </div>
                );
                const VLine = () => <div className="w-0.5 h-5 bg-gray-300 mx-auto" />;

                return (
                    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-3"
                        onClick={() => setTreeFor(null)}>
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] overflow-y-auto"
                            onClick={e => e.stopPropagation()}>
                            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 rounded-t-2xl text-white" style={{ background: BRAND }}>
                                <span className="font-semibold text-sm flex items-center gap-2">
                                    <GitBranch size={15} /> Approval Hierarchy — {u.name}
                                </span>
                                <button onClick={() => setTreeFor(null)} className="p-1 rounded-lg hover:bg-white/15"><X size={15} /></button>
                            </div>
                            <div className="p-5 space-y-4">
                                {/* step toggles apply to record CREATORS only — hidden for BM / HOD trees */}
                                {u.level === 'user' && (
                                    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 flex flex-wrap items-center gap-3">
                                        <span className="text-[11px] font-bold text-gray-800">Steps required:</span>
                                        <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-700">
                                            BM <Toggle on={reqB} onChange={v => saveRule(u, { require_branch: v })} />
                                        </span>
                                        <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-700">
                                            HOD <Toggle on={reqH} onChange={v => saveRule(u, { require_hod: v })} />
                                        </span>
                                        <span className="text-[10px] text-gray-600">COO is always the final level.</span>
                                    </div>
                                )}

                                {u.level === 'user' ? (
                                    /* EMPLOYEE chart: Employee -> BM -> HOD (per category) -> COO */
                                    <div className="flex flex-col items-center py-2">
                                        <OrgCard dark title={u.name} badge={u.branch}
                                            names={[{ name: 'Creates the records' }]} />
                                        <VLine />
                                        {!reqB ? (
                                            <OrgCard skipped title="Branch Manager" names={[{ name: 'Skipped — not required' }]} />
                                        ) : bms.length ? (
                                            <OrgCard title="Branch Manager" badge={u.branch}
                                                names={bms.map(p => ({ name: p.name }))} />
                                        ) : (
                                            <OrgCard skipped title="Branch Manager" names={[{ name: 'Skipped — no approver' }]} />
                                        )}
                                        <VLine />
                                        {!reqH ? (
                                            <OrgCard skipped title="HOD" names={[{ name: 'Skipped — not required' }]} />
                                        ) : (
                                            <div className="flex flex-wrap justify-center gap-3">
                                                {CATEGORY_OPTIONS.map(c => {
                                                    const hods = (((cd.hod_by_branch || {})[u.branch] || {})[c.value] || []);
                                                    return hods.length ? (
                                                        <OrgCard key={c.value} wide title={c.label} badge="HOD"
                                                            names={hods.map(p => ({
                                                                name: p.name, excluded: excludedIn(c.value, p.user_id),
                                                            }))} />
                                                    ) : (
                                                        <OrgCard key={c.value} wide skipped title={c.label}
                                                            names={[{ name: 'Skipped — no approver' }]} />
                                                    );
                                                })}
                                            </div>
                                        )}
                                        <VLine />
                                        <OrgCard title="Chief Operating Officer" badge="FIXED"
                                            names={cooNames.map(n => ({ name: n }))} />
                                    </div>
                                ) : u.level === 'branch' ? (
                                    /* BM chart — who is ABOVE them (HOD, COO) and who is UNDER
                                       them (the employees of every branch they cover) */
                                    (() => {
                                        const covered = Object.keys(cd.branch_approvers || {})
                                            .filter(b => (cd.branch_approvers[b] || []).some(p => p.user_id === u.user_id));
                                        return (
                                            <div className="flex flex-col items-center py-2">
                                                <OrgCard title="Chief Operating Officer" badge="FIXED"
                                                    names={cooNames.map(n => ({ name: n }))} />
                                                <VLine />
                                                <div className="flex flex-wrap justify-center gap-3">
                                                    {CATEGORY_OPTIONS.map(c => {
                                                        const hods = (((cd.hod_by_branch || {})[u.branch] || {})[c.value] || []);
                                                        return hods.length ? (
                                                            <OrgCard key={c.value} title={c.label} badge="HOD"
                                                                names={hods.map(p => ({ name: p.name }))} />
                                                        ) : (
                                                            <OrgCard key={c.value} skipped title={c.label}
                                                                names={[{ name: 'No HOD approver' }]} />
                                                        );
                                                    })}
                                                </div>
                                                <VLine />
                                                <OrgCard dark title={u.name} badge="BM (SELF)"
                                                    names={[{ name: `Branch Manager — approves & creates` }]} />
                                                <VLine />
                                                <div className="flex flex-wrap justify-center gap-3">
                                                    {covered.length ? covered.map(b => {
                                                        const emps = membersOf(b).filter(m => userOf(m.user_id)?.level === 'user');
                                                        return (
                                                            <OrgCard key={b} wide title={b} badge={`${emps.length} EMP`}
                                                                names={emps.length
                                                                    ? emps.map(m => ({ name: m.name }))
                                                                    : [{ name: 'No plain employees' }]} />
                                                        );
                                                    }) : (
                                                        <OrgCard skipped title="Branches"
                                                            names={[{ name: 'No branch coverage found' }]} />
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()
                                ) : (
                                    /* HOD chart — COO above them; below them the branches with
                                       their BMs whose escalations they receive */
                                    (() => {
                                        // categories they approve, across every branch mapping
                                        const myCats = CATEGORY_OPTIONS.filter(c =>
                                            Object.values(data.hod_categories).some(cats =>
                                                (cats[c.value] || []).some(m => m.user_id === u.user_id)));
                                        const branchesBelow = Object.keys(cd.branch_approvers || {});
                                        return (
                                            <div className="flex flex-col items-center py-2">
                                                <OrgCard title="Chief Operating Officer" badge="FIXED"
                                                    names={cooNames.map(n => ({ name: n }))} />
                                                <VLine />
                                                <OrgCard dark title={u.name} badge="HOD (SELF)"
                                                    names={[{
                                                        name: myCats.length
                                                            ? `Approves: ${myCats.map(c => c.label).join(', ')}`
                                                            : 'No category assigned yet',
                                                    }]} />
                                                <VLine />
                                                <div className="flex flex-wrap justify-center gap-3">
                                                    {branchesBelow.length ? branchesBelow.map(b => {
                                                        const bmNames = (cd.branch_approvers[b] || []).map(p => ({ name: p.name }));
                                                        const empCount = membersOf(b).filter(m => userOf(m.user_id)?.level === 'user').length;
                                                        return (
                                                            <OrgCard key={b} title={b} badge={`BM · ${empCount} EMP`}
                                                                names={bmNames} />
                                                        );
                                                    }) : (
                                                        <OrgCard skipped title="Branches"
                                                            names={[{ name: 'No Branch Managers assigned yet' }]} />
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()
                                )}
                                <p className="text-[10px] text-gray-600 text-center">
                                    View only — build the hierarchy in the Employee Hierarchy tab. Struck-out names are excluded for this employee's records of that category.
                                </p>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
