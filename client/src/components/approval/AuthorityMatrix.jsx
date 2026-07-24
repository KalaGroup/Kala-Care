/* Authority Matrix — three tabs on the L1..L5 hierarchy scheme:

   1. Employee Hierarchy — branch-wise builder table with the 5 stages:
      Branch -> L1 (Employees) -> L2 -> L3 -> L4 (HOD, per category) -> L5
      (COO, fixed). L2/L3 are picked from that branch's members (multi-branch
      users appear under every branch they can access); L4 approvers are
      picked from the HO branch members; L5 is fixed to the rights masters.
      Assigning someone to a stage grants that authority level automatically
      (the server re-derives levels). The HO branch itself has NO hierarchy
      row — HO members choose their own L4/L5 approvers when creating an
      application.
   2. Authority Limit — ONE ROW PER LEVEL (L1..L5): Max Discounting %, Max
      Credit Days, Max Expense Amount (per type). The limits apply to EVERY
      user holding the level; an L1 employee's OWN records auto-approve
      within the L1 limit (self-approval is removed). Each level's NAME is
      editable here and shows everywhere in the Approval Application.
   3. Expense Types & Limits — the expense-type master.                     */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import {
    X, Network, UserCog, GitBranch, Wallet, Trash2, Pencil,
    ArrowRight, Plus,
} from 'lucide-react';
import {
    getMatrix, setEmployeeRule, setHodCategory, setStageApprovers, setLevelConfig,
    addExpenseType, removeExpenseType, renameExpenseType,
    setApproverExclusion, errText,
} from './approvalApi';
import { BRAND, CATEGORY_OPTIONS, catLabel, levelLabel, levelName, setLevelNames } from './ApprovalShared';

const input = 'w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300';
/* border-b/-r only (with border-separate tables): collapsed borders don't
   stick with position:sticky in Chrome, which left a gap over the frozen
   header. The container's own border supplies the top/left edges. */
const th = 'px-2.5 py-2 border-b border-r border-gray-200 bg-gray-50 text-gray-800 font-semibold text-center text-[11px] uppercase tracking-wide whitespace-nowrap';
const td = 'px-2.5 py-1.5 border-b border-r border-gray-200 text-center align-middle text-xs';

const LEVELS = ['l1', 'l2', 'l3', 'l4', 'l5'];

const LEVEL_BADGE_CLS = {
    l1: 'bg-gray-100 text-gray-600',
    l2: 'bg-amber-100 text-amber-700',
    l3: 'bg-orange-100 text-orange-700',
    l4: 'bg-blue-100 text-blue-700',
    l5: 'bg-purple-100 text-purple-700',
};

// Which branches are shown as hierarchy rows — UI-only state, kept per
// browser so the builder view survives refreshes.
const LS_KEY = 'apvHierarchyBranchesL5';

// Multi-select popover with PENDING selection: tick any number of people,
// changes apply ONCE when the popover closes (one alert, not one per person).
// `options` (the branch's own members) show by default; `extraOptions`
// (employees of OTHER branches) open on demand — so a head from another
// branch can also be chosen. Top-level component so its local state
// survives parent re-renders.
function MultiPick({ id, openPick, setOpenPick, buttonLabel, options, extraOptions = [], selectedIds, onApply }) {
    const [localSel, setLocalSel] = useState([]);
    const [showAll, setShowAll] = useState(false);
    const [query, setQuery] = useState('');
    // Anchor rect of the trigger button — the panel renders position:FIXED so
    // the table's overflow container can never clip it.
    const [anchor, setAnchor] = useState(null);
    const btnRef = useRef(null);
    const open = openPick === id;
    // (Re)initialise whenever the popover opens. Done in an effect — NOT in
    // the click handler — because a parent re-render can REMOUNT this
    // component (e.g. when it sits inside an inline-defined cell component),
    // which would wipe click-time state and leave the panel invisible.
    useEffect(() => {
        if (open && btnRef.current) {
            setAnchor(btnRef.current.getBoundingClientRect());
            setLocalSel(selectedIds);
            setShowAll(false);
            setQuery('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);
    const openNow = () => setOpenPick(id);
    const closeApply = () => {
        setOpenPick(null);
        const changed = localSel.length !== selectedIds.length
            || localSel.some(i => !selectedIds.includes(i));
        if (changed) onApply(localSel);
    };
    const toggle = (uid) =>
        setLocalSel(prev => prev.includes(uid) ? prev.filter(i => i !== uid) : [...prev, uid]);
    const match = (m) => !query
        || m.name.toLowerCase().includes(query.toLowerCase())
        || m.user_id.toLowerCase().includes(query.toLowerCase());
    const row = (m, sub = null) => (
        <label key={m.user_id}
            title={`${m.name} (${m.user_id})${sub ? ` · ${sub}` : ''}`}
            className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-gray-50 cursor-pointer text-[11px] text-gray-800">
            <input type="checkbox" checked={localSel.includes(m.user_id)}
                onChange={() => toggle(m.user_id)} className="accent-indigo-600" />
            <span className="truncate">
                {m.name} ({m.user_id}){sub && <span className="text-gray-500"> · {sub}</span>}
            </span>
        </label>
    );
    // people from other branches ALREADY selected stay visible even collapsed
    const pickedExtras = extraOptions.filter(m => localSel.includes(m.user_id));
    const visibleExtras = (showAll ? extraOptions : pickedExtras).filter(match);

    // Fixed-position panel: clamp inside the viewport, flip upward when there
    // is more room above the button than below it.
    const PANEL_W = 288;
    let panelStyle = null, listMax = 224;
    if (open && anchor) {
        const left = Math.max(8, Math.min(anchor.left, window.innerWidth - PANEL_W - 8));
        const spaceBelow = window.innerHeight - anchor.bottom - 8;
        const spaceAbove = anchor.top - 8;
        const openUp = spaceBelow < 240 && spaceAbove > spaceBelow;
        const avail = (openUp ? spaceAbove : spaceBelow) - 8;
        listMax = Math.max(120, Math.min(224, avail - 84));   // search + Done ≈ 84px
        panelStyle = openUp
            ? { position: 'fixed', left, bottom: window.innerHeight - anchor.top, width: PANEL_W, zIndex: 100, paddingBottom: 4 }
            : { position: 'fixed', left, top: anchor.bottom, width: PANEL_W, zIndex: 100, paddingTop: 4 };
    }

    return (
        <div className="relative inline-block text-left">
            <button ref={btnRef} type="button" onClick={() => (open ? closeApply() : openNow())}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 whitespace-nowrap">
                {buttonLabel} ▾
            </button>
            {open && panelStyle && (
                <>
                    {/* invisible backdrop: the popover stays open while searching /
                        ticking (no hover-out auto close) and applies on outside click */}
                    <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={closeApply} />
                    <div style={panelStyle}>
                    <div className="rounded-xl border border-gray-200 bg-white shadow-xl p-2 text-left">
                        <input value={query} onChange={e => setQuery(e.target.value)}
                            placeholder="Search name / id…"
                            className="w-full mb-1.5 border border-gray-300 rounded-lg px-2 py-1 text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                        <div className="overflow-y-auto space-y-0.5" style={{ scrollbarWidth: 'thin', maxHeight: listMax }}>
                            {options.filter(match).length === 0 && (
                                <p className="px-2 py-1.5 text-[11px] text-gray-600">No branch members found</p>
                            )}
                            {options.filter(match).map(m => row(m))}
                            {extraOptions.length > 0 && (
                                <>
                                    <button type="button" onClick={() => setShowAll(v => !v)}
                                        className="w-full text-left px-2 py-1 text-[10px] font-bold text-indigo-700 hover:bg-indigo-50 rounded-lg">
                                        {showAll ? '▾ Other branch employees' : '▸ Other branch employees…'}
                                    </button>
                                    {visibleExtras.map(m => row(m, m.branch))}
                                    {showAll && visibleExtras.length === 0 && (
                                        <p className="px-2 py-1.5 text-[11px] text-gray-600">No matching employees</p>
                                    )}
                                </>
                            )}
                        </div>
                        <button type="button" onClick={closeApply}
                            className="mt-1.5 w-full px-2 py-1.5 rounded-lg text-[11px] font-semibold text-white"
                            style={{ background: BRAND }}>
                            Done
                        </button>
                    </div>
                    </div>
                </>
            )}
        </div>
    );
}

export default function AuthorityMatrix({ onClose }) {
    const [data, setData] = useState({
        users: [], branches: [], hod_categories: {}, expense_types: [],
        level_configs: [], chain_data: null, exclusions: {}, branch_members: {},
        ho_branch: 'HO',
    });
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('hierarchy');   // hierarchy | limits | expense
    // Local editable copies keyed by LEVEL (Authority Limit tab)
    const [lvlEdits, setLvlEdits] = useState({});
    const [savingId, setSavingId] = useState(null);
    const [newTypeName, setNewTypeName] = useState('');
    const [openExpenseFor, setOpenExpenseFor] = useState(null);
    const [expAnchor, setExpAnchor] = useState(null);   // trigger rect (fixed-position panel)
    const [openPick, setOpenPick] = useState(null);       // which multi-select popover is open
    const [treeFor, setTreeFor] = useState(null);         // hierarchy tree popup (name click)
    const [addedBranches, setAddedBranches] = useState(null);   // hierarchy rows
    const [editingRow, setEditingRow] = useState(null);         // branch row in edit mode

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const d = await getMatrix();
            setLevelNames(d.level_names);   // renamed levels show everywhere
            setData({
                users: d.users || [], branches: d.branches || [],
                hod_categories: d.hod_categories || {}, expense_types: d.expense_types || [],
                level_configs: d.level_configs || [],
                chain_data: d.chain_data || null,
                exclusions: d.exclusions || {},
                branch_members: d.branch_members || {},
                ho_branch: d.ho_branch || 'HO',
            });
            // NOTE: lvlEdits is intentionally NOT cleared here — reloading
            // (e.g. after saving ONE level row) must not wipe the unsaved
            // edits of the other rows. saveLevel clears its own row only.
        } catch (err) {
            toast.error(errText(err, 'Failed to load authority matrix'));
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Initialise the hierarchy rows once data arrives: stored list if any,
    // else every branch that already has stage approvers assigned.
    useEffect(() => {
        if (addedBranches !== null || loading) return;
        let stored = null;
        try { stored = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { /* ignore */ }
        if (Array.isArray(stored)) {
            setAddedBranches(stored.filter(b => b !== data.ho_branch));
            return;
        }
        setAddedBranches(Object.keys(data.chain_data?.stage_approvers || {})
            .filter(b => b !== data.ho_branch));
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
    const stageOf = (code, stage) => ((data.chain_data?.stage_approvers || {})[code] || {})[stage] || [];
    const hodMapsOf = (branchCode, cat) => ((data.hod_categories[branchCode] || {})[cat] || []);

    /* ------- Authority Limit tab (LEVEL-wise) local-edit helpers ------- */
    const cfgOf = (lvl) =>
        data.level_configs.find(c => c.level === lvl)
        || { level: lvl, display_name: levelName(lvl), expense_limits: {} };
    const lval = (lvl, key) => {
        const e = lvlEdits[lvl];
        return e && key in e ? e[key] : (cfgOf(lvl)[key] ?? '');
    };
    const setLval = (lvl, key, v) =>
        setLvlEdits(prev => ({ ...prev, [lvl]: { ...prev[lvl], [key]: v } }));
    const lexpVal = (lvl, t) => {
        const k = `exp_${t.id}`;
        const e = lvlEdits[lvl];
        return e && k in e ? e[k] : (cfgOf(lvl).expense_limits?.[t.id] ?? '');
    };
    const isDirtyLevel = (lvl) => {
        const c = cfgOf(lvl);
        const same = (a, b) => String(a ?? '') === String(b ?? '');
        if (!same(lval(lvl, 'display_name'), c.display_name)) return true;
        if (!same(lval(lvl, 'max_discount_percent'), c.max_discount_percent)) return true;
        if (!same(lval(lvl, 'max_credit_days'), c.max_credit_days)) return true;
        return data.expense_types.some(t => !same(lexpVal(lvl, t), c.expense_limits?.[t.id]));
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

    const saveLevel = async (lvl) => {
        if (!isDirtyLevel(lvl)) return;
        setSavingId(`lvl_${lvl}`);
        try {
            const res = await setLevelConfig({
                level: lvl,
                display_name: lval(lvl, 'display_name'),
                max_discount_percent: lval(lvl, 'max_discount_percent'),
                max_credit_days: lval(lvl, 'max_credit_days'),
                expense_type_limits: data.expense_types.map(t => ({
                    expense_type_id: t.id, max_amount: lexpVal(lvl, t),
                })),
            });
            // drop ONLY this row's local edits (it now matches the server);
            // other rows keep their pending changes
            setLvlEdits(prev => {
                const next = { ...prev };
                delete next[lvl];
                return next;
            });
            await load();
            await showImpact(res, `Saved — ${lvl.toUpperCase()}`);
        } catch (err) {
            toast.error(errText(err, 'Failed to save level limits'));
        } finally { setSavingId(null); }
    };

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

    /* ------- hierarchy row PENDING edits (nothing hits the server until
              the row's Save button is pressed) ------- */
    // {branchCode: { l2: [ids], l3: [ids], hod_spares: [ids], ... }} — only
    // the keys the user actually touched are present.
    const [rowEdits, setRowEdits] = useState({});
    const setRowEdit = (code, key, ids) =>
        setRowEdits(prev => ({ ...prev, [code]: { ...prev[code], [key]: ids } }));

    // Picking people at a HIGHER stage of the same row removes them from the
    // lower stage(s) — one person holds ONE level per row (highest wins).
    const applyStageEdit = (code, stage, ids) =>
        setRowEdits(prev => {
            const cur = { ...prev[code], [stage]: ids };
            if (stage === 'l3') {
                const lower = prev[code]?.l2 ?? stageOf(code, 'l2').map(p => p.user_id);
                const kept = lower.filter(i => !ids.includes(i));
                if (kept.length !== lower.length) cur.l2 = kept;
            }
            return { ...prev, [code]: cur };
        });
    const applyHodEdit = (code, cat, ids) =>
        setRowEdits(prev => {
            const cur = { ...prev[code], [`hod_${cat}`]: ids };
            for (const st of ['l2', 'l3']) {
                const lower = prev[code]?.[st] ?? stageOf(code, st).map(p => p.user_id);
                const kept = lower.filter(i => !ids.includes(i));
                if (kept.length !== lower.length) cur[st] = kept;
            }
            return { ...prev, [code]: cur };
        });
    const discardRow = (code) => {
        setRowEdits(prev => { const n = { ...prev }; delete n[code]; return n; });
        if (editingRow === code) setEditingRow(null);
    };
    const sameIds = (a, b) => a.length === b.length && a.every(x => b.includes(x));
    const serverStageIds = (code, stage) => stageOf(code, stage).map(p => p.user_id);
    const serverHodIds = (code, cat) => hodMapsOf(code, cat).map(m => m.user_id).filter(Boolean);
    // effective selection = pending edit if present, else the server value
    const effStageIds = (code, stage) => rowEdits[code]?.[stage] ?? serverStageIds(code, stage);
    const effHodIds = (code, cat) => rowEdits[code]?.[`hod_${cat}`] ?? serverHodIds(code, cat);
    const isRowDirty = (code) => {
        const e = rowEdits[code];
        if (!e) return false;
        if (['l2', 'l3'].some(s => e[s] && !sameIds(e[s], serverStageIds(code, s)))) return true;
        return CATEGORY_OPTIONS.some(c =>
            e[`hod_${c.value}`] && !sameIds(e[`hod_${c.value}`], serverHodIds(code, c.value)));
    };
    const nameOf = (id) => userOf(id)?.name || id;

    // Push the row's pending L2 / L3 / L4 changes in one go
    const saveRow = async (code) => {
        const e = rowEdits[code] || {};
        setSavingId(`row_${code}`);
        try {
            let moved = 0;
            for (const stage of ['l2', 'l3']) {
                if (e[stage] && !sameIds(e[stage], serverStageIds(code, stage)))
                    moved += (await setStageApprovers(code, stage, e[stage]))?.moved || 0;
            }
            for (const c of CATEGORY_OPTIONS) {
                const k = `hod_${c.value}`;
                if (e[k] && !sameIds(e[k], serverHodIds(code, c.value)))
                    moved += (await setHodCategory(code, c.value, e[k]))?.moved || 0;
            }
            setRowEdits(prev => { const n = { ...prev }; delete n[code]; return n; });
            setEditingRow(null);
            await load();
            await doneAlert(moved, `Hierarchy row ${code}`);
        } catch (err) {
            toast.error(errText(err, 'Failed to save the hierarchy row'));
        } finally { setSavingId(null); }
    };

    // Step toggles (require L2 / L3 / L4) live in the tree popup
    const saveRule = async (u, overrides = {}) => {
        const cur = (k) => (k in overrides ? overrides[k] : u[k] !== false);
        setSavingId(`rule_${u.user_id}`);
        try {
            const res = await setEmployeeRule({
                user_id: u.user_id,
                require_l2: cur('require_l2'),
                require_l3: cur('require_l3'),
                require_l4: cur('require_l4'),
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
            title: 'Remove expense type?', text: `"${t.name}" and its level limits will be removed`,
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
    const hoCode = data.ho_branch;
    // The HO branch never appears as a hierarchy row — HO members choose
    // their own L4/L5 approvers when they create an application.
    const remainingBranches = useMemo(() =>
        data.branches.filter(b => b.branch !== hoCode && !rows.includes(b.branch)
            && membersOf(b.branch).length > 0),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [data, rows]);

    /* ------- small UI pieces ------- */

    const chip = (text, key) => (
        <span key={key ?? text} className="px-2 py-0.5 rounded-lg border whitespace-nowrap inline-block bg-white text-gray-800 border-gray-300 text-[11px]">
            {text}
        </span>
    );

    // Clickable person chip — opens that person's hierarchy tree popup
    const chipBtn = (text, key, onClick) => (
        <button key={key ?? text} type="button" onClick={onClick}
            title="Show this person's approval hierarchy"
            className="px-2 py-0.5 rounded-lg border whitespace-nowrap inline-block bg-white text-gray-800 border-gray-300 text-[11px] hover:border-indigo-400 hover:bg-indigo-50">
            {text}
        </button>
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

    // One stage cell of the hierarchy row (L2 / L3): chips + picker in edit
    // mode. The picker defaults to the branch's own members, with the
    // employees of OTHER branches available on demand (choose a head from
    // another branch too). Selections stay PENDING until the row is saved.
    const StageCell = ({ code, stage, members, isEditing }) => {
        const ids = effStageIds(code, stage);
        const memberIds = new Set(members.map(m => m.user_id));
        const others = data.users
            .filter(u => !memberIds.has(u.user_id))
            .map(u => ({ user_id: u.user_id, name: u.name, branch: u.branch }));
        return (
            <div className={`flex flex-wrap items-center gap-1 ${!ids.length && !isEditing ? 'justify-center' : ''}`}>
                {ids.map(id => chipBtn(nameOf(id), id, () => setTreeFor(id)))}
                {!ids.length && !isEditing && <span className="text-[11px] text-gray-500">—</span>}
                {isEditing && (
                    <MultiPick id={`${stage}_${code}`}
                        openPick={openPick} setOpenPick={setOpenPick}
                        buttonLabel={ids.length ? 'Change' : `Select ${stage.toUpperCase()}`}
                        options={members}
                        extraOptions={others}
                        selectedIds={ids}
                        onApply={(sel) => applyStageEdit(code, stage, sel)} />
                )}
            </div>
        );
    };

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
                        {tabBtn('expense', 'Expense Type Master', Wallet)}
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg bg-white hover:bg-white/90 transition flex-shrink-0" style={{ color: '#2f3192' }}><X size={15} /></button>
                </div>

                {/* content fills the rest of the box */}
                <div className="px-5 py-2.5 flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto">
                    {loading || addedBranches === null ? (
                        <div className="py-16 text-center text-sm text-gray-600">Loading authority matrix…</div>
                    ) : tab === 'hierarchy' ? (
                        <>
                            <p className="text-[11px] text-gray-700">
                                Pick <b>L2 / L3</b> and category-wise <b>L4</b> approvers per branch — each record follows its branch row.
                            </p>
                            <div className="rounded-xl border border-gray-200 overflow-auto flex-1 min-h-0 apv-scroll">
                                <table className="min-w-full border-separate" style={{ borderSpacing: 0 }}>
                                    <thead className="sticky top-0 z-10">
                                        <tr>
                                            <th className={`${th} min-w-[130px]`}>Branch</th>
                                            <th className={`${th} min-w-[200px]`}>L1 – {levelName('l1')}</th>
                                            <th className={`${th} min-w-[150px]`}>L2 – {levelName('l2')}</th>
                                            <th className={`${th} min-w-[150px]`}>L3 – {levelName('l3')}</th>
                                            <th className={`${th} min-w-[250px]`}>L4 – {levelName('l4')}</th>
                                            <th className={th}>L5 – {levelName('l5')}</th>
                                            <th className={`${th} w-16`}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map(code => {
                                            const members = membersOf(code);
                                            // Everyone comes under L1 first; picking a person as
                                            // L2 / L3 / L4 of THIS row removes them from its L1 list.
                                            const assignedIds = new Set([
                                                ...effStageIds(code, 'l2'),
                                                ...effStageIds(code, 'l3'),
                                                ...CATEGORY_OPTIONS.flatMap(c => effHodIds(code, c.value)),
                                            ]);
                                            const emps = members.filter(m => !assignedIds.has(m.user_id));
                                            const hoMembers = membersOf(hoCode);
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
                                                                : <span className="text-[11px] text-gray-600">No plain employees — all hold a stage</span>}
                                                        </div>
                                                        {cellArrow}
                                                    </td>
                                                    <td className={`${td} text-left relative`}>
                                                        <StageCell code={code} stage="l2" members={members} isEditing={isEditing} />
                                                        {cellArrow}
                                                    </td>
                                                    <td className={`${td} text-left relative`}>
                                                        <StageCell code={code} stage="l3" members={members} isEditing={isEditing} />
                                                        {cellArrow}
                                                    </td>
                                                    <td className={`${td} text-left relative`}>
                                                        {/* three category sub-rows in one cell — label line, then the
                                                            names on the NEXT line. Assignments are PER BRANCH — each
                                                            row sets its own approvers. */}
                                                        <div className="space-y-1.5">
                                                            {CATEGORY_OPTIONS.map(c => {
                                                                const ids = effHodIds(code, c.value);
                                                                return (
                                                                    <div key={c.value}>
                                                                        <p className="text-[10px] font-bold text-gray-700">{c.label}:</p>
                                                                        <div className={`flex flex-wrap items-center gap-1 mt-0.5 ${!ids.length && !isEditing ? 'justify-center' : ''}`}>
                                                                            {ids.map(id => chipBtn(nameOf(id), id, () => setTreeFor(id)))}
                                                                            {!ids.length && !isEditing && <span className="text-[11px] text-gray-500">—</span>}
                                                                            {isEditing && (
                                                                                <MultiPick id={`hod_${code}_${c.value}`}
                                                                                    openPick={openPick} setOpenPick={setOpenPick}
                                                                                    buttonLabel={ids.length ? 'Change' : 'Select'}
                                                                                    options={hoMembers}
                                                                                    selectedIds={ids}
                                                                                    onApply={(sel) => applyHodEdit(code, c.value, sel)} />
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
                                                            {cooNames.map(n => chipBtn(n, n, () => setTreeFor(`coo:${n}`)))}
                                                        </div>
                                                    </td>
                                                    <td className={td}>
                                                        <div className="flex flex-col items-center gap-1">
                                                            {(() => {
                                                                const dirty = isRowDirty(code);
                                                                const saving = savingId === `row_${code}`;
                                                                if (dirty || isEditing) return (
                                                                    <>
                                                                        <button type="button"
                                                                            title={dirty ? 'Save this row’s pending changes' : 'Finish editing this row'}
                                                                            disabled={saving}
                                                                            onClick={() => (dirty ? saveRow(code) : setEditingRow(null))}
                                                                            className={`px-3 py-1 rounded-lg text-[11px] font-semibold text-white transition ${dirty
                                                                                ? 'shadow-sm animate-pulse'
                                                                                : 'bg-emerald-600 hover:bg-emerald-700'} disabled:opacity-60`}
                                                                            style={dirty ? { background: '#d97706' } : undefined}>
                                                                            {saving ? 'Saving…' : 'Save'}
                                                                        </button>
                                                                        {dirty && !saving && (
                                                                            <span className="text-[9px] font-bold text-amber-600 whitespace-nowrap">Pending to save</span>
                                                                        )}
                                                                        {dirty && !saving && (
                                                                            <button type="button" onClick={() => discardRow(code)}
                                                                                className="text-[10px] font-semibold text-gray-500 hover:text-red-500">
                                                                                Cancel
                                                                            </button>
                                                                        )}
                                                                    </>
                                                                );
                                                                return (
                                                                    <button type="button" title="Edit this row's L2 / L3 / L4 selection"
                                                                        onClick={() => setEditingRow(code)}
                                                                        className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50">
                                                                        <Pencil size={13} />
                                                                    </button>
                                                                );
                                                            })()}
                                                            <button type="button" title="Delete this branch row and ALL its L2 / L3 / L4 assignments"
                                                                disabled={savingId === `del_${code}`}
                                                                onClick={async () => {
                                                                    const res = await Swal.fire({
                                                                        title: 'Delete this hierarchy row?',
                                                                        text: `${code} — ${branchName(code)}: ALL its L2 / L3 / L4 assignments will be removed and those employees return to L1. Pending records are re-routed to the next available authority.`,
                                                                        icon: 'warning',
                                                                        showCancelButton: true,
                                                                        confirmButtonText: 'Delete Row',
                                                                        confirmButtonColor: '#dc2626',
                                                                    });
                                                                    if (!res.isConfirmed) return;
                                                                    setSavingId(`del_${code}`);
                                                                    try {
                                                                        let moved = 0;
                                                                        if (stageOf(code, 'l2').length)
                                                                            moved += (await setStageApprovers(code, 'l2', []))?.moved || 0;
                                                                        if (stageOf(code, 'l3').length)
                                                                            moved += (await setStageApprovers(code, 'l3', []))?.moved || 0;
                                                                        for (const c of CATEGORY_OPTIONS) {
                                                                            if (hodMapsOf(code, c.value).length)
                                                                                moved += (await setHodCategory(code, c.value, []))?.moved || 0;
                                                                        }
                                                                        persistBranches(rows.filter(b => b !== code));
                                                                        if (isEditing) setEditingRow(null);
                                                                        await load();
                                                                        await doneAlert(moved, `Hierarchy row ${code} deleted — its assignments`);
                                                                    } catch (err) {
                                                                        toast.error(errText(err, 'Failed to delete the hierarchy row'));
                                                                    } finally { setSavingId(null); }
                                                                }}
                                                                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-50">
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {rows.length === 0 && (
                                            <tr><td colSpan={7} className="px-3 py-10 text-center text-xs text-gray-600">
                                                No branches added yet — use the Add Row below to start building the hierarchy
                                            </td></tr>
                                        )}
                                        {/* Add Row lives INSIDE the table as its last row (MOM-sheet style).
                                            The HO branch is never offered here. */}
                                        <tr>
                                            <td colSpan={7} className="px-3 py-2 border-b border-r border-gray-200 bg-gray-50/60">
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
                            <p className="text-[11px] text-gray-700">
                                Level-wise limits — applied to <b>every user of that level</b>. Within limit = <b>final approval</b>;
                                above = next level. Blank = 0 (<b>L5 blank = Unlimited</b>). The <b>Name</b> is editable and shows everywhere.
                            </p>
                            <div className="rounded-xl border border-gray-200 overflow-auto apv-scroll">
                                <table className="min-w-full border-separate" style={{ borderSpacing: 0 }}>
                                    <thead className="sticky top-0 z-10">
                                        <tr>
                                            <th className={`${th} w-20`}>Level</th>
                                            <th className={`${th} min-w-[180px]`}>Name (Editable)</th>
                                            <th className={`${th} w-40 !whitespace-normal`}>Max Discounting %</th>
                                            <th className={`${th} w-32 !whitespace-normal`}>Max Credit Days</th>
                                            <th className={th}>Max Expense Amount (per type)</th>
                                            <th className={`${th} w-20`}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {LEVELS.map(lvl => {
                                            const usersAtLevel = lvl === 'l5'
                                                ? cooNames.length
                                                : data.users.filter(u => u.level === lvl).length;
                                            return (
                                                <tr key={lvl} className="hover:bg-gray-50/60">
                                                    <td className={td}>
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${LEVEL_BADGE_CLS[lvl]}`}>
                                                            {lvl.toUpperCase()}
                                                        </span>
                                                        <p className="mt-1 text-[9px] text-gray-500 whitespace-nowrap">
                                                            {usersAtLevel} user{usersAtLevel === 1 ? '' : 's'}
                                                        </p>
                                                    </td>
                                                    <td className={`${td} text-left`}>
                                                        <input className={input}
                                                            value={lval(lvl, 'display_name') ?? ''}
                                                            onChange={e => setLval(lvl, 'display_name', e.target.value)}
                                                            placeholder={levelName(lvl)} />
                                                    </td>
                                                    <td className={td}>
                                                        {lvl === 'l5' ? (
                                                            <span className="text-xs font-bold" style={{ color: BRAND }}>Unlimited</span>
                                                        ) : (
                                                            <div className="relative">
                                                                <input className={`${input} text-center ${String(lval(lvl, 'max_discount_percent') ?? '') !== '' ? 'pr-6' : ''}`}
                                                                    type="number" min="0" max="100" step="0.01"
                                                                    placeholder="0"
                                                                    value={lval(lvl, 'max_discount_percent') ?? ''}
                                                                    onChange={e => setLval(lvl, 'max_discount_percent', e.target.value)} />
                                                                {String(lval(lvl, 'max_discount_percent') ?? '') !== '' && (
                                                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-600 pointer-events-none">%</span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className={td}>
                                                        {lvl === 'l5' ? (
                                                            <span className="text-xs font-bold" style={{ color: BRAND }}>Unlimited</span>
                                                        ) : (
                                                            <div className="relative">
                                                                <input className={`${input} text-center ${String(lval(lvl, 'max_credit_days') ?? '') !== '' ? 'pr-9' : ''}`}
                                                                    type="number" min="0" step="1"
                                                                    placeholder="0"
                                                                    value={lval(lvl, 'max_credit_days') ?? ''}
                                                                    onChange={e => setLval(lvl, 'max_credit_days', e.target.value)} />
                                                                {String(lval(lvl, 'max_credit_days') ?? '') !== '' && (
                                                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-600 pointer-events-none">days</span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className={td}>
                                                        {lvl === 'l5' ? (
                                                            <span className="text-xs font-bold" style={{ color: BRAND }}>Unlimited</span>
                                                        ) : data.expense_types.length === 0 ? (
                                                            <span className="text-[10px] text-gray-600">No expense types yet — add them in the Expense Types tab</span>
                                                        ) : (() => {
                                                            const setCount = data.expense_types.filter(t => String(lexpVal(lvl, t) ?? '') !== '').length;
                                                            const open = openExpenseFor === lvl;
                                                            // fixed-position panel: never clipped by the table box
                                                            let panelStyle = null;
                                                            if (open && expAnchor) {
                                                                const W = 250;
                                                                const left = Math.max(8, Math.min(expAnchor.right - W, window.innerWidth - W - 8));
                                                                const spaceBelow = window.innerHeight - expAnchor.bottom - 8;
                                                                const openUp = spaceBelow < 230 && expAnchor.top > spaceBelow;
                                                                panelStyle = openUp
                                                                    ? { position: 'fixed', left, bottom: window.innerHeight - expAnchor.top, width: W, zIndex: 100, paddingBottom: 4 }
                                                                    : { position: 'fixed', left, top: expAnchor.bottom, width: W, zIndex: 100, paddingTop: 4 };
                                                            }
                                                            return (
                                                                <div className="relative inline-block text-left">
                                                                    <button type="button"
                                                                        onClick={(e) => {
                                                                            if (open) { setOpenExpenseFor(null); return; }
                                                                            setExpAnchor(e.currentTarget.getBoundingClientRect());
                                                                            setOpenExpenseFor(lvl);
                                                                        }}
                                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 whitespace-nowrap">
                                                                        {setCount ? `${setCount} type limit${setCount > 1 ? 's' : ''} set` : 'All 0 (default)'} ▾
                                                                    </button>
                                                                    {open && panelStyle && (
                                                                        <>
                                                                            <div style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                                                                                onClick={() => setOpenExpenseFor(null)} />
                                                                            <div style={panelStyle}>
                                                                                <div className="rounded-xl border border-gray-200 bg-white shadow-xl p-2.5 space-y-1.5 max-h-64 overflow-y-auto apv-scroll">
                                                                                    {data.expense_types.map(t => (
                                                                                        <div key={t.id} className="flex items-center gap-2">
                                                                                            <span className="w-20 flex-shrink-0 text-left text-[10px] font-semibold text-gray-700 truncate" title={t.name}>{t.name}</span>
                                                                                            <input className={input} type="number" min="0" step="0.01"
                                                                                                placeholder="0"
                                                                                                value={lexpVal(lvl, t) ?? ''}
                                                                                                onChange={e => setLval(lvl, `exp_${t.id}`, e.target.value)} />
                                                                                        </div>
                                                                                    ))}
                                                                                    <p className="text-[9px] text-gray-600 text-left pt-0.5">
                                                                                        Blank = 0 · press Save in the Action column to store
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                    </td>
                                                    <td className={td}>
                                                        {(() => {
                                                            const dirty = isDirtyLevel(lvl);
                                                            const saving = savingId === `lvl_${lvl}`;
                                                            return (
                                                                <div className="flex flex-col items-center gap-0.5">
                                                                    <button type="button" onClick={() => saveLevel(lvl)}
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
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : (
                        /* Expense Type Master — input + Add Type on top, the
                           Sr No / Expense Type / Action table below */
                        <>
                            <p className="text-[11px] text-gray-700">
                                Manage the Expense Type dropdown here (Add / Remove / Edit only).
                            </p>
                            <form onSubmit={addType} className="flex gap-2">
                                <input value={newTypeName} onChange={e => setNewTypeName(e.target.value)}
                                    placeholder="New Expense Type…"
                                    className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                                <button type="submit" disabled={savingId === 'newtype'}
                                    className="px-5 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50 whitespace-nowrap"
                                    style={{ background: BRAND }}>
                                    {savingId === 'newtype' ? 'Adding…' : 'Add Type'}
                                </button>
                            </form>
                            <div className="rounded-xl border border-gray-200 overflow-hidden">
                                <table className="min-w-full border-separate" style={{ borderSpacing: 0 }}>
                                    <thead>
                                        <tr>
                                            <th className={`${th} w-20`}>Sr No</th>
                                            <th className={th}>Expense Type</th>
                                            <th className={`${th} w-24`}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.expense_types.length === 0 && (
                                            <tr><td colSpan={3} className="px-3 py-10 text-center text-xs text-gray-600">
                                                No expense types yet — add the first one above
                                            </td></tr>
                                        )}
                                        {data.expense_types.map((t, i) => (
                                            <tr key={t.id} className="hover:bg-gray-50/60">
                                                <td className={`${td} text-gray-600`}>{i + 1}.</td>
                                                <td className={`${td} font-semibold text-black`}>{t.name}</td>
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

            {/* Hierarchy TREE popup — VIEW-ONLY L1..L5 org chart; the only
                editable things are whether the L2 / L3 / L4 steps are required
                and the per-category L4 exclusions (name click) */}
            {treeFor && (() => {
                // COO chips open a synthetic tree — the rights-master users are
                // not part of the assignable users list.
                const isCoo = typeof treeFor === 'string' && treeFor.startsWith('coo:');
                const u = isCoo
                    ? { user_id: '', name: treeFor.slice(4), level: 'l5', branch: hoCode }
                    : userOf(treeFor);
                if (!u) return null;
                const reqL2 = u.require_l2 !== false;
                const reqL3 = u.require_l3 !== false;
                const reqL4 = u.require_l4 !== false;
                const isHOUser = isCoo || u.branch === hoCode ||
                    membersOf(hoCode).some(m => m.user_id === u.user_id);
                const excludedIn = (cat, id) => ((data.exclusions[u.user_id] || {})[cat] || []).includes(id);

                const OrgCard = ({ title, names = [], badge, dark = false, skipped = false, wide = false, onNameClick = null }) => (
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
                            onNameClick && n.id ? (
                                <button key={n.id} type="button"
                                    onClick={() => onNameClick(n)}
                                    title={n.excluded ? 'Excluded — click to allow again' : 'Click to exclude for this employee'}
                                    className={`block text-left text-[11px] ${n.excluded ? 'text-red-400 line-through' : 'text-gray-700 hover:text-indigo-700'}`}>
                                    {n.name}
                                </button>
                            ) : (
                                <p key={n.name} className={`text-[11px] ${dark ? 'text-white/80' : n.excluded ? 'text-red-400 line-through' : 'text-gray-700'}`}>
                                    {n.name}
                                </p>
                            )
                        ))}
                    </div>
                );
                const VLine = () => <div className="w-0.5 h-5 bg-gray-300 mx-auto" />;

                const stageCard = (stage, req) => {
                    const label = `${stage.toUpperCase()} – ${levelName(stage)}`;
                    const people = stageOf(u.branch, stage).filter(p => p.user_id !== u.user_id);
                    const selfIn = stageOf(u.branch, stage).some(p => p.user_id === u.user_id);
                    if (isHOUser) return <OrgCard skipped title={label} names={[{ name: 'Skipped — HO records go to L4/L5 directly' }]} />;
                    if (!req) return <OrgCard skipped title={label} names={[{ name: 'Skipped — not required' }]} />;
                    if (people.length) return (
                        <OrgCard title={label} badge={u.branch}
                            names={people.map(p => ({ name: p.name }))} />
                    );
                    return <OrgCard skipped title={label}
                        names={[{ name: selfIn ? 'Skipped — self approval removed' : 'Skipped — no approver' }]} />;
                };

                /* ---- data for the MIDDLE-of-chain charts (L2..L5 people) ---- */
                const cd = data.chain_data || {};
                const req = { l2: reqL2, l3: reqL3, l4: reqL4 };
                // toggles apply to every stage of the records this user creates
                const stagesAbove = ['l2', 'l3', 'l4'];
                // journey of the records THIS user creates (honouring toggles):
                // a stage runs when OTHER people man it in their home branch —
                // being its only approver skips it (self-approval removed)
                const ownPath = [
                    ...['l2', 'l3'].filter(s => req[s]
                        && stageOf(u.branch, s).some(p => p.user_id !== u.user_id))
                        .map(s => s.toUpperCase()),
                    ...(req.l4 ? ['L4'] : []),
                    'L5',
                ].join(' → ');
                const ownRecordsLine = {
                    name: `Own records: within limit auto-approved · beyond limit → ${ownPath}`,
                };
                const hierBranches = [...new Set([
                    ...rows,
                    ...Object.keys(cd.stage_approvers || {}),
                    ...Object.keys(data.hod_categories || {}),
                ])].filter(b => b && b !== hoCode).sort();
                // plain employees of a branch = members minus that row's assignees
                const empsOf = (b) => {
                    const assigned = new Set([...stageOf(b, 'l2'), ...stageOf(b, 'l3')].map(p => p.user_id));
                    CATEGORY_OPTIONS.forEach(c => hodMapsOf(b, c.value).forEach(m => assigned.add(m.user_id)));
                    return membersOf(b).filter(m => !assigned.has(m.user_id));
                };
                // one card per branch showing its L2 / L3 people + employee count
                const branchCard = (b, { showStages = true } = {}) => {
                    const lines = [];
                    if (showStages) {
                        stageOf(b, 'l2').forEach(p => lines.push({ name: `L2 – ${p.name}` }));
                        stageOf(b, 'l3').forEach(p => lines.push({ name: `L3 – ${p.name}` }));
                    }
                    if (!lines.length) {
                        const emps = empsOf(b);
                        emps.slice(0, 6).forEach(m => lines.push({ name: m.name }));
                        if (emps.length > 6) lines.push({ name: `+ ${emps.length - 6} more…` });
                        if (!emps.length) lines.push({ name: 'No employees' });
                    }
                    return (
                        <OrgCard key={b} wide title={b} badge={`${empsOf(b).length} EMP`} names={lines} />
                    );
                };
                // union of L4 approver names over some branches (all categories)
                const l4NamesOver = (branches) => {
                    const seen = new Map();
                    branches.forEach(b => CATEGORY_OPTIONS.forEach(c =>
                        (((cd.hod_by_branch || {})[b] || {})[c.value] || [])
                            .forEach(p => seen.set(p.user_id, p.name))));
                    return [...seen.values()].sort();
                };
                const stageBranchesOf = (uid, stage) =>
                    hierBranches.filter(b => stageOf(b, stage).some(p => p.user_id === uid));
                // {branch: [category labels]} where this user is the L4 approver
                const l4Coverage = () => {
                    const out = {};
                    Object.entries(data.hod_categories).forEach(([b, cats]) =>
                        Object.entries(cats).forEach(([c, list]) => {
                            if (list.some(m => m.user_id === u.user_id))
                                (out[b] = out[b] || []).push(catLabel(c));
                        }));
                    return out;
                };

                const cooCard = <OrgCard title={`L5 – ${levelName('l5')}`} names={cooNames.map(n => ({ name: n }))} />;

                /* ---- chart per role: approvers sit in the MIDDLE — above them
                       who they report to, below them who reports to them ---- */
                const stageChart = () => {          // u is an L2 or L3 approver
                    const stage = u.level;
                    const covered = stageBranchesOf(u.user_id, stage);
                    const l4Names = l4NamesOver(covered.length ? covered : hierBranches);
                    const l3Names = stage === 'l2'
                        ? [...new Set(covered.flatMap(b => stageOf(b, 'l3')
                            .filter(p => p.user_id !== u.user_id).map(p => p.name)))].sort()
                        : [];
                    return (
                        <div className="flex flex-col items-center py-2">
                            {cooCard}
                            <VLine />
                            <OrgCard title={`L4 – ${levelName('l4')}`}
                                names={l4Names.length ? l4Names.map(n => ({ name: n })) : [{ name: 'No L4 assigned yet' }]} />
                            {stage === 'l2' && (
                                <>
                                    <VLine />
                                    {l3Names.length
                                        ? <OrgCard title={`L3 – ${levelName('l3')}`} names={l3Names.map(n => ({ name: n }))} />
                                        : <OrgCard skipped title={`L3 – ${levelName('l3')}`} names={[{ name: 'No L3 — records go straight to L4' }]} />}
                                </>
                            )}
                            <VLine />
                            <OrgCard dark title={u.name} badge={`${levelLabel(u.level)} (SELF)`}
                                names={[
                                    {
                                        name: covered.length
                                            ? `Approves ${stage.toUpperCase()} for: ${covered.join(', ')}`
                                            : 'Not assigned to any branch yet',
                                    },
                                    ownRecordsLine,
                                ]} />
                            <VLine />
                            <div className="flex flex-wrap justify-center gap-3">
                                {covered.length
                                    ? covered.map(b => branchCard(b, { showStages: stage === 'l3' }))
                                    : <OrgCard skipped title="Branches" names={[{ name: 'No branch coverage yet' }]} />}
                            </div>
                        </div>
                    );
                };

                const l4Chart = () => {             // u is an L4 (HOD) approver
                    const coverage = l4Coverage();
                    const coveredB = Object.keys(coverage).sort();
                    const below = coveredB.length ? coveredB : hierBranches;
                    return (
                        <div className="flex flex-col items-center py-2">
                            {cooCard}
                            <VLine />
                            <OrgCard dark title={u.name} badge={`${levelLabel('l4')} (SELF)`}
                                names={[
                                    ...(coveredB.length
                                        ? coveredB.map(b => ({ name: `${b}: ${coverage[b].join(', ')}` }))
                                        : [{ name: 'Approves any unassigned branch + category' }]),
                                    ownRecordsLine,
                                ]} />
                            <VLine />
                            <div className="flex flex-wrap justify-center gap-3">
                                {below.length
                                    ? below.map(b => branchCard(b))
                                    : <OrgCard skipped title="Branches" names={[{ name: 'No hierarchy rows yet' }]} />}
                            </div>
                        </div>
                    );
                };

                const l5Chart = () => {             // u is L5 (COO) — top of everything
                    const l4Users = data.users.filter(x => x.level === 'l4').map(x => x.name).sort();
                    return (
                        <div className="flex flex-col items-center py-2">
                            <OrgCard dark title={u.name} badge={`${levelLabel('l5')} (SELF)`}
                                names={[{ name: 'Final approval authority — every record ends here' }]} />
                            <VLine />
                            <OrgCard title={`L4 – ${levelName('l4')}`}
                                names={l4Users.length ? l4Users.map(n => ({ name: n })) : [{ name: 'No L4 assigned yet' }]} />
                            <VLine />
                            <div className="flex flex-wrap justify-center gap-3">
                                {hierBranches.length
                                    ? hierBranches.map(b => branchCard(b))
                                    : <OrgCard skipped title="Branches" names={[{ name: 'No hierarchy rows yet' }]} />}
                            </div>
                        </div>
                    );
                };

                return (
                    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-3"
                        onClick={() => setTreeFor(null)}>
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] overflow-y-auto"
                            onClick={e => e.stopPropagation()}>
                            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 rounded-t-2xl text-white" style={{ background: BRAND }}>
                                <span className="font-semibold text-sm flex items-center gap-2">
                                    <GitBranch size={15} /> Approval Hierarchy — {u.name}
                                </span>
                                <button onClick={() => setTreeFor(null)} className="p-1.5 rounded-lg bg-white hover:bg-white/90 transition flex-shrink-0" style={{ color: '#2f3192' }}><X size={15} /></button>
                            </div>
                            <div className="p-5 space-y-4">
                                {/* step toggles for the records THIS user creates — only the
                                    stages AFTER their own level; L5 is always the final stop */}
                                {!isHOUser && !isCoo && u.level !== 'l5' && (
                                    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 flex flex-wrap items-center gap-3">
                                        <span className="text-[11px] font-bold text-gray-800">Steps required for {u.name}'s records:</span>
                                        {stagesAbove.map(s => (
                                            <span key={s} className="inline-flex items-center gap-1.5 text-[11px] text-gray-700">
                                                {s.toUpperCase()} <Toggle on={req[s]} onChange={v => saveRule(u, { [`require_${s}`]: v })} />
                                            </span>
                                        ))}
                                        <span className="text-[10px] text-gray-600">L5 ({levelName('l5')}) is always the final level.</span>
                                    </div>
                                )}

                                {/* L2..L5 people sit in the MIDDLE of their chart: who they
                                    report to above, who reports to them below. L1 employees
                                    get the creator chart (their records' journey upward). */}
                                {(isCoo || u.level === 'l5') ? l5Chart()
                                    : u.level === 'l4' ? l4Chart()
                                        : (u.level === 'l2' || u.level === 'l3') ? stageChart()
                                            : (
                                                <div className="flex flex-col items-center py-2">
                                                    <OrgCard dark title={u.name} badge={`${levelLabel(u.level)} · ${u.branch || '—'}`}
                                                        names={[{ name: 'Creates the record — within own limit = auto approved' }]} />
                                                    <VLine />
                                                    {stageCard('l2', reqL2)}
                                                    <VLine />
                                                    {stageCard('l3', reqL3)}
                                                    <VLine />
                                                    {isHOUser ? (
                                                        <OrgCard wide title={`L4 – ${levelName('l4')}`} badge="CHOSEN AT SUBMIT"
                                                            names={[{ name: 'HO members pick their L4 approver on the form' }]} />
                                                    ) : !reqL4 ? (
                                                        <OrgCard skipped title={`L4 – ${levelName('l4')}`} names={[{ name: 'Skipped — not required' }]} />
                                                    ) : (
                                                        <div className="flex flex-wrap justify-center gap-3">
                                                            {CATEGORY_OPTIONS.map(c => {
                                                                const hods = (((cd.hod_by_branch || {})[u.branch] || {})[c.value] || [])
                                                                    .filter(p => p.user_id !== u.user_id);
                                                                return hods.length ? (
                                                                    <OrgCard key={c.value} wide title={c.label} badge={`L4 – ${levelName('l4')}`}
                                                                        onNameClick={(n) => toggleExclusion(u, {
                                                                            id: n.id, name: n.name, category: c.value,
                                                                            excluded: excludedIn(c.value, n.id),
                                                                        })}
                                                                        names={hods.map(p => ({
                                                                            id: p.user_id, name: p.name,
                                                                            excluded: excludedIn(c.value, p.user_id),
                                                                        }))} />
                                                                ) : (
                                                                    <OrgCard key={c.value} wide skipped title={c.label}
                                                                        names={[{ name: 'Skipped — no approver' }]} />
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                    <VLine />
                                                    <OrgCard title={`L5 – ${levelName('l5')}`}
                                                        names={cooNames.map(n => ({ name: n }))} />
                                                </div>
                                            )}
                                <p className="text-[10px] text-gray-600 text-center">
                                    {u.level === 'l1'
                                        ? 'View only — build the hierarchy in the Employee Hierarchy tab. Click an L4 name to exclude / re-allow that approver for this employee’s records of that category (struck-out = excluded).'
                                        : 'View only — build the hierarchy in the Employee Hierarchy tab.'}
                                </p>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
