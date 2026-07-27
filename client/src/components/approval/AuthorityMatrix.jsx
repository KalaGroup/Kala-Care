/* Authority Matrix — TWO tabs (UI combined; underlying logic unchanged):

   1. Employee Hierarchy & Limits — one table:
      Branch | Employee | Level | Max Discounting % | Max Credit Days |
      Max Expense Amount | Action.
      Each branch row lists its taken-in employees as bullets; a LEVEL
      dropdown in front of every employee assigns L1..L4 for THIS branch's
      flow (L2/L3 = stage approvers, L4 = HOD for all three categories,
      L5/COO stays fixed & unlimited). The limit columns edit each employee's
      INDIVIDUAL limits (blank = the level's shared branch-row value applies);
      the expense amount is ONE number applied to ALL expense types. Newly
      created profile employees are DETECTED and offered through the row's
      "Add employee" option.
   2. Expense Type Master — the expense-type dropdown master.              */
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import {
    X, Network, GitBranch, Wallet, Trash2, Pencil, Plus,
} from 'lucide-react';
import {
    getMatrix, setAuthority, setEmployeeRule, setHodCategory, setStageApprovers,
    setLevelConfig, removeEmployeeRights, addExpenseType, removeExpenseType,
    renameExpenseType, setApproverExclusion, errText,
} from './approvalApi';
import { BRAND, CATEGORY_OPTIONS, catLabel, levelLabel, levelName, setLevelNames } from './ApprovalShared';

const input = 'w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300';
/* border-b/-r only (with border-separate tables): collapsed borders don't
   stick with position:sticky in Chrome, which left a gap over the frozen
   header. The container's own border supplies the top/left edges. */
const th = 'px-2.5 py-2 border-b border-r border-gray-200 bg-gray-50 text-gray-800 font-semibold text-center text-[11px] uppercase tracking-wide whitespace-nowrap';
const td = 'px-2.5 py-1.5 border-b border-r border-gray-200 text-center align-top text-xs';

const LEVELS = ['l1', 'l2', 'l3', 'l4', 'l5'];
const ROW_LEVELS = ['l1', 'l2', 'l3', 'l4'];   // assignable per employee (L5 fixed)
const LIMIT_KEYS = ['max_discount_percent', 'max_credit_days', 'max_expense_amount'];

// Which branches are shown as hierarchy rows — UI-only state, kept per
// browser so the builder view survives refreshes.
const LS_KEY = 'apvHierarchyBranchesL5';

export default function AuthorityMatrix({ onClose }) {
    const [data, setData] = useState({
        users: [], branches: [], hod_categories: {}, expense_types: [],
        level_configs: [], chain_data: null, exclusions: {}, branch_members: {},
        ho_branch: 'HO',
    });
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('hierarchy');   // hierarchy | expense
    const [savingId, setSavingId] = useState(null);
    const [newTypeName, setNewTypeName] = useState('');
    const [treeFor, setTreeFor] = useState(null);         // hierarchy tree popup (name click)
    const [addedBranches, setAddedBranches] = useState(null);   // hierarchy rows
    const [editingRow, setEditingRow] = useState(null);         // branch row in edit mode
    // Pending per-branch level assignments {code: {user_id: 'l1'..'l4'}}
    const [rowEdits, setRowEdits] = useState({});
    // Pending L4 category picks {code: {user_id: ['spares', ...]}}
    const [rowCats, setRowCats] = useState({});
    // Pending PER-EMPLOYEE limit edits, scoped per row so typing in one
    // branch row never marks/saves the other rows: {code: {user_id: {max_*}}}
    const [rowUserEdits, setRowUserEdits] = useState({});

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
            setAddedBranches(stored);
            return;
        }
        setAddedBranches(Object.keys(data.chain_data?.stage_approvers || {}));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, data]);

    const persistBranches = (list) => {
        setAddedBranches(list);
        try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
    };

    const branchName = (code) => data.branches.find(b => b.branch === code)?.branch_name || '';
    const userOf = (id) => data.users.find(x => x.user_id === id);
    const nameOf = (id) => userOf(id)?.name || id;
    const membersOf = (code) => data.branch_members[code] || [];
    const cooNames = data.chain_data?.coo_names?.length ? data.chain_data.coo_names : ['COO'];
    const stageOf = (code, stage) => ((data.chain_data?.stage_approvers || {})[code] || {})[stage] || [];
    const hodMapsOf = (branchCode, cat) => ((data.hod_categories[branchCode] || {})[cat] || []);
    const sameIds = (a, b) => a.length === b.length && a.every(x => b.includes(x));

    /* ------- combined-tab helpers ------- */

    // Employees SHOWN in a branch row: members already taken into the
    // hierarchy (has_right) plus anyone assigned at a stage / as L4 here.
    const rowMembers = (code) => {
        const ids = new Set();
        membersOf(code).forEach(m => { if (userOf(m.user_id)?.has_right) ids.add(m.user_id); });
        ['l2', 'l3'].forEach(st => stageOf(code, st).forEach(p => ids.add(p.user_id)));
        CATEGORY_OPTIONS.forEach(c => hodMapsOf(code, c.value).forEach(m => m.user_id && ids.add(m.user_id)));
        return [...ids].map(id => ({ user_id: id, name: nameOf(id) }))
            .sort((a, b) => a.name.localeCompare(b.name));
    };

    // NEW employees detected for this branch (in Profile but not taken in yet)
    const newCandidates = (code) => {
        const shown = new Set(rowMembers(code).map(m => m.user_id));
        return membersOf(code).filter(m => !shown.has(m.user_id))
            .sort((a, b) => a.name.localeCompare(b.name));
    };

    // The level an employee holds IN THIS ROW's flow
    const serverLevelInRow = (code, uid) => {
        if (CATEGORY_OPTIONS.some(c => hodMapsOf(code, c.value).some(m => m.user_id === uid))) return 'l4';
        if (stageOf(code, 'l3').some(p => p.user_id === uid)) return 'l3';
        if (stageOf(code, 'l2').some(p => p.user_id === uid)) return 'l2';
        return 'l1';
    };
    const effLevelInRow = (code, uid) => rowEdits[code]?.[uid] ?? serverLevelInRow(code, uid);
    const setLevelInRow = (code, uid, lvl) =>
        setRowEdits(prev => ({ ...prev, [code]: { ...prev[code], [uid]: lvl } }));

    // Which categories an L4 (HOD) covers in THIS row — default: all three
    const serverCatsInRow = (code, uid) =>
        CATEGORY_OPTIONS.filter(c => hodMapsOf(code, c.value).some(m => m.user_id === uid))
            .map(c => c.value);
    const effCatsInRow = (code, uid) => {
        const pending = rowCats[code]?.[uid];
        if (pending) return pending;
        const srv = serverCatsInRow(code, uid);
        return srv.length ? srv : CATEGORY_OPTIONS.map(c => c.value);
    };
    const toggleCat = (code, uid, cat) =>
        setRowCats(prev => {
            const cur = prev[code]?.[uid] ?? effCatsInRow(code, uid);
            const next = cur.includes(cat) ? cur.filter(x => x !== cat) : [...cur, cat];
            return { ...prev, [code]: { ...prev[code], [uid]: next } };
        });

    // LEVEL-wise limit rows of a branch — the shared FALLBACK an employee
    // inherits when no individual limit is set. (Global branch-less rows
    // only carry the renamable level names.)
    const cfgOf = (code, lvl) =>
        data.level_configs.find(c => c.branch === code && c.level === lvl) || {};
    // INDIVIDUAL limits live on the employee's rights row (null = inherit)
    const indivOf = (uid, key) => userOf(uid)?.[key] ?? null;
    const usrVal = (code, uid, key) => {
        const e = rowUserEdits[code]?.[uid];
        return e && key in e ? e[key] : (indivOf(uid, key) ?? '');
    };
    const setUsrVal = (code, uid, key, v) =>
        setRowUserEdits(prev => ({
            ...prev,
            [code]: { ...prev[code], [uid]: { ...prev[code]?.[uid], [key]: v } },
        }));
    const isUserLimitDirty = (code, uid) => {
        const e = rowUserEdits[code]?.[uid];
        return !!e && LIMIT_KEYS.some(k => k in e && String(e[k] ?? '') !== String(indivOf(uid, k) ?? ''));
    };
    const rowLimitsDirty = (code) =>
        Object.keys(rowUserEdits[code] || {}).some(uid => isUserLimitDirty(code, uid));
    const rowLevelsDirty = (code) => {
        const e = rowEdits[code];
        return !!e && Object.entries(e).some(([uid, lvl]) => lvl !== serverLevelInRow(code, uid));
    };
    const rowCatsDirty = (code) => {
        const e = rowCats[code];
        return !!e && Object.entries(e).some(([uid, cats]) =>
            effLevelInRow(code, uid) === 'l4' && !sameIds(cats, serverCatsInRow(code, uid)));
    };
    const isRowDirty = (code) => rowLevelsDirty(code) || rowCatsDirty(code) || rowLimitsDirty(code);

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

    // Save ONE branch row: level assignments (stages + L4 map) and any
    // touched PER-EMPLOYEE limits (blank clears the individual limit — the
    // level's shared value applies again).
    const saveRow = async (code) => {
        const members = rowMembers(code);
        // every L4 must cover at least one category
        const noCat = members.find(m => effLevelInRow(code, m.user_id) === 'l4'
            && effCatsInRow(code, m.user_id).length === 0);
        if (noCat) return toast.error(`Select at least one category for ${noCat.name} (L4)`);
        setSavingId(`row_${code}`);
        try {
            let moved = 0;
            const wanted = (st) => members.filter(m => effLevelInRow(code, m.user_id) === st)
                .map(m => m.user_id);
            for (const st of ['l2', 'l3']) {
                const want = wanted(st);
                const cur = stageOf(code, st).map(p => p.user_id);
                if (!sameIds(want, cur))
                    moved += (await setStageApprovers(code, st, want))?.moved || 0;
            }
            // L4 per CATEGORY — each HOD covers only their picked categories
            for (const c of CATEGORY_OPTIONS) {
                const want = members.filter(m => effLevelInRow(code, m.user_id) === 'l4'
                    && effCatsInRow(code, m.user_id).includes(c.value)).map(m => m.user_id);
                const cur = hodMapsOf(code, c.value).map(m => m.user_id).filter(Boolean);
                if (!sameIds(want, cur))
                    moved += (await setHodCategory(code, c.value, want))?.moved || 0;
            }
            // INDIVIDUAL limits — one save per edited employee; only the
            // touched keys are sent so the others stay as they are.
            for (const uid of Object.keys(rowUserEdits[code] || {})) {
                if (!isUserLimitDirty(code, uid)) continue;
                const e = rowUserEdits[code][uid];
                const payload = { user_id: uid };
                LIMIT_KEYS.forEach(k => { if (k in e) payload[k] = e[k]; });
                moved += (await setAuthority(payload))?.moved || 0;
            }
            setRowEdits(prev => { const n = { ...prev }; delete n[code]; return n; });
            setRowCats(prev => { const n = { ...prev }; delete n[code]; return n; });
            setRowUserEdits(prev => { const n = { ...prev }; delete n[code]; return n; });
            setEditingRow(null);
            await load();
            await doneAlert(moved, `Hierarchy row ${code}`);
        } catch (err) {
            toast.error(errText(err, 'Failed to save the hierarchy row'));
        } finally { setSavingId(null); }
    };

    const discardRow = (code) => {
        setRowEdits(prev => { const n = { ...prev }; delete n[code]; return n; });
        setRowCats(prev => { const n = { ...prev }; delete n[code]; return n; });
        setRowUserEdits(prev => { const n = { ...prev }; delete n[code]; return n; });
        if (editingRow === code) setEditingRow(null);
    };

    // Take a NEW employee into the hierarchy (registers them at their current
    // level — set the wanted level afterwards and press Save)
    const addEmployee = async (code, uid) => {
        const u = userOf(uid);
        if (!u) return;
        setSavingId(`add_${code}`);
        try {
            await setAuthority({ user_id: uid, level: u.level || 'l1' });
            await load();
            toast.success(`${u.name} added to ${code} — set their level and press Save`);
        } catch (err) {
            toast.error(errText(err, 'Failed to add the employee'));
        } finally { setSavingId(null); }
    };

    // Remove an employee from the hierarchy — all their rights go away and
    // they move back into the "Add employee" dropdown of their branch.
    const removeEmployee = async (code, m) => {
        const res = await Swal.fire({
            title: 'Remove employee?',
            text: `${m.name} will lose all hierarchy rights and move back to the Add employee list.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Remove',
            confirmButtonColor: '#d97706',
        });
        if (!res.isConfirmed) return;
        setSavingId(`rem_${m.user_id}`);
        try {
            const r = await removeEmployeeRights(m.user_id);
            setRowEdits(prev => {
                const n = { ...prev };
                if (n[code]) { const e = { ...n[code] }; delete e[m.user_id]; n[code] = e; }
                return n;
            });
            await load();
            if (r?.moved) await doneAlert(r.moved, `${m.name} removed — assignments`);
            else toast.success(`${m.name} removed from the hierarchy`);
        } catch (err) {
            toast.error(errText(err, 'Failed to remove the employee'));
        } finally { setSavingId(null); }
    };

    // Take in EVERY current employee of the branch at once — runs
    // automatically when a branch row is added, so the row loads with all
    // its employees; anyone joining later shows up in "Add employee".
    const takeInAll = async (code) => {
        const fresh = newCandidates(code);
        if (!fresh.length) return;
        setSavingId(`add_${code}`);
        try {
            for (const m of fresh) {
                const u = userOf(m.user_id);
                await setAuthority({ user_id: m.user_id, level: u?.level || 'l1' });
            }
            await load();
            toast.success(`${fresh.length} employee(s) loaded into ${code}`);
        } catch (err) {
            toast.error(errText(err, 'Failed to load the branch employees'));
        } finally { setSavingId(null); }
    };

    // Rename the L1..L5 level names (shows everywhere)
    const renameLevels = async () => {
        const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const rowsHtml = LEVELS.map(l => `
            <div style="display:flex;align-items:center;gap:8px;margin:5px 0">
                <b style="width:30px;font-size:12px">${l.toUpperCase()}</b>
                <input id="lvlname_${l}" value="${esc(levelName(l))}"
                    style="flex:1;border:1px solid #d1d5db;border-radius:8px;padding:6px 10px;font-size:13px">
            </div>`).join('');
        const { isConfirmed } = await Swal.fire({
            title: 'Level Names',
            html: `<div style="text-align:left">${rowsHtml}</div>`,
            showCancelButton: true,
            confirmButtonText: 'Save Names',
            confirmButtonColor: BRAND,
        });
        if (!isConfirmed) return;
        setSavingId('lvlnames');
        try {
            for (const l of LEVELS) {
                const v = (document.getElementById(`lvlname_${l}`)?.value || '').trim();
                if (!v || v === levelName(l)) continue;
                // global (branch-less) row = only the display name
                await setLevelConfig({ level: l, display_name: v });
            }
            await load();
            toast.success('Level names saved');
        } catch (err) {
            toast.error(errText(err, 'Failed to save level names'));
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
            title: 'Remove expense type?', text: `"${t.name}" will be removed`,
            icon: 'warning', showCancelButton: true, confirmButtonText: 'Remove', confirmButtonColor: '#d97706',
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
    const remainingBranches = useMemo(() =>
        data.branches.filter(b => !rows.includes(b.branch)
            && membersOf(b.branch).length > 0),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [data, rows]);

    /* ------- small UI pieces ------- */

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

    // one aligned sub-line per employee in every cell of the branch row
    const LINE = 'h-9 flex items-center';

    /* ================= RENDER ================= */
    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[96vw] h-[94vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}>
                {/* Blue bar: title + tabs + close, in ONE row */}
                <div className="sticky top-0 z-30 flex flex-nowrap items-center gap-3 px-5 py-2.5 rounded-t-2xl text-white overflow-x-auto" style={{ background: BRAND, scrollbarWidth: 'thin' }}>
                    <span className="font-semibold text-sm flex items-center gap-2 whitespace-nowrap flex-shrink-0">
                        <Network size={16} /> Authority Matrix
                    </span>
                    <div className="ml-auto flex flex-nowrap items-center gap-2">
                        {tabBtn('hierarchy', 'Employee Hierarchy & Limits', GitBranch)}
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
                            <div className="flex items-center gap-2">
                                <p className="text-[11px] text-gray-700 flex-1 min-w-0">
                                    Set each employee's <b>Level</b> per branch. Limits are <b>per-employee</b> — blank inherits the level's shared value; expense amount applies to all types.
                                </p>
                                <button type="button" onClick={renameLevels} disabled={savingId === 'lvlnames'}
                                    className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                                    <Pencil size={12} /> Level Names
                                </button>
                            </div>
                            <div className="rounded-xl border border-gray-200 overflow-auto flex-1 min-h-0 apv-scroll">
                                <table className="min-w-full border-separate" style={{ borderSpacing: 0 }}>
                                    <thead className="sticky top-0 z-10">
                                        <tr>
                                            <th className={`${th} min-w-[130px]`}>Branch</th>
                                            <th className={`${th} min-w-[220px]`}>Approval Rights</th>
                                            <th className={`${th} min-w-[150px]`}>Level</th>
                                            <th className={`${th} min-w-[190px]`}>Category</th>
                                            <th className={`${th} w-36 !whitespace-normal`}>Max Discounting %</th>
                                            <th className={`${th} w-32 !whitespace-normal`}>Max Credit Days</th>
                                            <th className={`${th} w-36 !whitespace-normal`}>Max Expense Amount</th>
                                            <th className={`${th} w-20`}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map(code => {
                                            const members = rowMembers(code);
                                            const fresh = newCandidates(code);
                                            const isEditing = editingRow === code;
                                            const limitCell = (key, unit) => {
                                                const tag = unit.trim();
                                                return (
                                                    <td className={td}>
                                                        <div>
                                                            {members.map(m => {
                                                                const lvl = effLevelInRow(code, m.user_id);
                                                                if (lvl === 'l5') return <div key={m.user_id} className={`${LINE} justify-center text-xs font-bold`} style={{ color: BRAND }}>Unlimited</div>;
                                                                // INDIVIDUAL value for THIS employee; blank
                                                                // inherits the level's shared branch-row value
                                                                const lvlShared = cfgOf(code, lvl)[key];
                                                                const indiv = indivOf(m.user_id, key);
                                                                if (isEditing) {
                                                                    const val = usrVal(code, m.user_id, key);
                                                                    const hasVal = String(val ?? '') !== '';
                                                                    return (
                                                                        <div key={m.user_id} className={`${LINE} justify-center`}>
                                                                            <div className="relative max-w-[110px]">
                                                                                <input className={`${input} text-center ${hasVal ? (tag === 'days' ? 'pr-9' : 'pr-6') : ''}`}
                                                                                    type="number" min="0" step="0.01"
                                                                                    placeholder={String(lvlShared ?? 0)}
                                                                                    title={`Individual limit for ${m.name} — blank = the level's shared value (${lvlShared ?? 0}${unit})`}
                                                                                    value={val ?? ''}
                                                                                    onChange={e => setUsrVal(code, m.user_id, key, e.target.value)} />
                                                                                {hasVal && (
                                                                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-semibold text-gray-600 pointer-events-none">{tag}</span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                }
                                                                const eff = indiv ?? (String(lvlShared ?? '') === '' ? 0 : lvlShared);
                                                                return (
                                                                    <div key={m.user_id} className={`${LINE} justify-center`}>
                                                                        <span className={`text-xs ${indiv !== null ? 'font-bold text-indigo-700' : 'text-gray-800'}`}
                                                                            title={indiv !== null ? 'Individual limit' : 'Level-wise (shared) limit'}>
                                                                            {eff}{unit}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </td>
                                                );
                                            };
                                            return (
                                                <tr key={code} className={isEditing ? 'bg-amber-50/60' : 'hover:bg-gray-50/60'}>
                                                    <td className={`${td} !align-middle`}>
                                                        <p className="font-bold text-black">{code}</p>
                                                        <p className="text-[10px] text-gray-600">{branchName(code)}</p>
                                                    </td>
                                                    <td className={`${td} text-left`}>
                                                        {members.length === 0 && (
                                                            <p className={`${LINE} text-[11px] text-gray-500`}>No employees taken in yet</p>
                                                        )}
                                                        {members.map(m => (
                                                            <div key={m.user_id} className={`${LINE} justify-between gap-1`}>
                                                                <button type="button" onClick={() => setTreeFor(m.user_id)}
                                                                    title="Show this employee's approval flow"
                                                                    className="text-[11px] text-gray-800 hover:text-indigo-700 hover:underline decoration-dotted underline-offset-2 truncate">
                                                                    • {m.name}
                                                                </button>
                                                                {isEditing && (
                                                                    <button type="button"
                                                                        title="Remove — take this employee out of the hierarchy"
                                                                        disabled={savingId === `rem_${m.user_id}`}
                                                                        onClick={() => removeEmployee(code, m)}
                                                                        className="p-0.5 rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50 flex-shrink-0 disabled:opacity-50">
                                                                        <X size={12} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ))}
                                                        {fresh.length > 0 && (
                                                            <div className={LINE}>
                                                                <select className="border border-dashed border-indigo-300 rounded-lg px-2 py-1 text-[11px] bg-white text-indigo-700 font-semibold max-w-[210px] focus:outline-none"
                                                                    value=""
                                                                    disabled={savingId === `add_${code}`}
                                                                    onChange={e => {
                                                                        if (e.target.value === '__all__') takeInAll(code);
                                                                        else if (e.target.value) addEmployee(code, e.target.value);
                                                                    }}>
                                                                    <option value="">
                                                                        {savingId === `add_${code}` ? 'Adding…' : `＋ Add employee (${fresh.length} new)…`}
                                                                    </option>
                                                                    {fresh.length > 1 && (
                                                                        <option value="__all__">Add ALL ({fresh.length})</option>
                                                                    )}
                                                                    {fresh.map(m => (
                                                                        <option key={m.user_id} value={m.user_id}>{m.name} ({m.user_id})</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className={td}>
                                                        {members.map(m => {
                                                            const lvl = effLevelInRow(code, m.user_id);
                                                            return (
                                                                <div key={m.user_id} className={`${LINE} justify-center`}>
                                                                    {isEditing ? (
                                                                        <select className={`${input} max-w-[140px]`}
                                                                            value={lvl}
                                                                            onChange={e => setLevelInRow(code, m.user_id, e.target.value)}>
                                                                            {ROW_LEVELS.map(l => (
                                                                                <option key={l} value={l}>{levelLabel(l)}</option>
                                                                            ))}
                                                                        </select>
                                                                    ) : (
                                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 whitespace-nowrap">
                                                                            {levelLabel(lvl)}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </td>
                                                    {/* Category — only meaningful for L4 (HOD) employees */}
                                                    <td className={td}>
                                                        {members.map(m => {
                                                            const lvl = effLevelInRow(code, m.user_id);
                                                            const cats = effCatsInRow(code, m.user_id);
                                                            if (lvl !== 'l4') return (
                                                                <div key={m.user_id} className={`${LINE} justify-center text-[11px] text-gray-400`}>—</div>
                                                            );
                                                            return (
                                                                <div key={m.user_id} className={`${LINE} justify-center gap-2`}>
                                                                    {isEditing ? (
                                                                        CATEGORY_OPTIONS.map(c => (
                                                                            <label key={c.value}
                                                                                className="flex items-center gap-1 text-[10px] text-gray-700 cursor-pointer whitespace-nowrap">
                                                                                <input type="checkbox" className="accent-indigo-600"
                                                                                    checked={cats.includes(c.value)}
                                                                                    onChange={() => toggleCat(code, m.user_id, c.value)} />
                                                                                {c.label}
                                                                            </label>
                                                                        ))
                                                                    ) : (
                                                                        <span className="text-[10px] text-gray-700 truncate"
                                                                            title={cats.map(catLabel).join(', ')}>
                                                                            {cats.map(catLabel).join(', ') || '—'}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </td>
                                                    {limitCell('max_discount_percent', '%')}
                                                    {limitCell('max_credit_days', ' days')}
                                                    {limitCell('max_expense_amount', ' ₹')}
                                                    <td className={`${td} !align-middle`}>
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
                                                                                className="text-[10px] font-semibold text-gray-500 hover:text-amber-600">
                                                                                Cancel
                                                                            </button>
                                                                        )}
                                                                    </>
                                                                );
                                                                return (
                                                                    <button type="button" title="Edit this row"
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
                                                                        text: `${code} — ${branchName(code)}: ALL its L2 / L3 / L4 assignments AND its limits will be removed (employees return to L1, limits reset to 0). Pending records are re-routed to the next available authority.`,
                                                                        icon: 'warning',
                                                                        showCancelButton: true,
                                                                        confirmButtonText: 'Delete Row',
                                                                        confirmButtonColor: '#d97706',
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
                                                                        // clear every limit this row had set (back to 0)
                                                                        for (const lvl of ROW_LEVELS) {
                                                                            const cfg = cfgOf(code, lvl);
                                                                            if (LIMIT_KEYS.some(k => String(cfg[k] ?? '') !== ''))
                                                                                await setLevelConfig({
                                                                                    level: lvl, branch: code,
                                                                                    max_discount_percent: '', max_credit_days: '', max_expense_amount: '',
                                                                                });
                                                                        }
                                                                        // and the INDIVIDUAL limits of the row's employees
                                                                        for (const m of rowMembers(code)) {
                                                                            if (LIMIT_KEYS.some(k => indivOf(m.user_id, k) !== null))
                                                                                await setAuthority({
                                                                                    user_id: m.user_id,
                                                                                    max_discount_percent: '', max_credit_days: '', max_expense_amount: '',
                                                                                });
                                                                        }
                                                                        persistBranches(rows.filter(b => b !== code));
                                                                        if (isEditing) setEditingRow(null);
                                                                        await load();
                                                                        await doneAlert(moved, `Hierarchy row ${code} deleted — its assignments`);
                                                                    } catch (err) {
                                                                        toast.error(errText(err, 'Failed to delete the hierarchy row'));
                                                                    } finally { setSavingId(null); }
                                                                }}
                                                                className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 disabled:opacity-50">
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {rows.length === 0 && (
                                            <tr><td colSpan={8} className="px-3 py-10 text-center text-xs text-gray-600">
                                                No branches added yet — use the Add Row below to start building the hierarchy
                                            </td></tr>
                                        )}
                                        {/* Add Row lives INSIDE the table as its last row.
                                            The HO branch is never offered here. */}
                                        <tr>
                                            <td colSpan={8} className="px-3 py-2 border-b border-r border-gray-200 bg-gray-50/60">
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
                                                                    // load ALL the branch's current employees into the row
                                                                    takeInAll(e.target.value);
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
                                                            className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50" title="Remove type">
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
                                    className={`block text-left text-[11px] ${n.excluded ? 'text-amber-500 line-through' : 'text-gray-700 hover:text-indigo-700'}`}>
                                    {n.name}
                                </button>
                            ) : (
                                <p key={n.name} className={`text-[11px] ${dark ? 'text-white/80' : n.excluded ? 'text-amber-500 line-through' : 'text-gray-700'}`}>
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

                const req = { l2: reqL2, l3: reqL3, l4: reqL4 };
                const stagesAbove = ['l2', 'l3', 'l4'];

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
                                {/* step toggles for the records THIS user creates */}
                                {!isHOUser && !isCoo && (
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

                                {/* L1..L5 chart for the records this user creates */}
                                <div className="flex flex-col items-center py-2">
                                    <OrgCard dark title={u.name} badge={`${levelLabel(u.level)} · ${u.branch || '—'}`}
                                        names={[{
                                            name: isCoo
                                                ? 'Final approval authority — own records auto-approve within limit'
                                                : 'Creates the record — within own limit (home branch) = auto approved',
                                        }]} />
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
                                                const hods = (((data.chain_data?.hod_by_branch || {})[u.branch] || {})[c.value] || [])
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
                                <p className="text-[10px] text-gray-600 text-center">
                                    View only — build the hierarchy in the Employee Hierarchy &amp; Limits tab. Click an L4 name to
                                    exclude / re-allow that approver for this employee's records of that category
                                    (struck-out = excluded).
                                </p>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
