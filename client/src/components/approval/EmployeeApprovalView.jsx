/* Employee (L1) view — create approval applications (Discounting / Credit /
   Expense under Spares / Services) and track their journey through the
   L2 -> L3 -> L4 (HOD) -> L5 (COO) chain. Within own limit = auto approved. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Search, Inbox } from 'lucide-react';
import { getApplications, errText } from './approvalApi';
import {
    ApplicationsTable, ApplicationDetailModal, CreateApplicationModal,
    SummaryCards, TypeTabs, STATUS_META, statusLabel, BRAND,
} from './ApprovalShared';
import ApprovalReports from './ApprovalReports';

export default function EmployeeApprovalView() {
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    const [apps, setApps] = useState([]);
    const [scope, setScope] = useState(null);   // own | stage | all — captions the cards
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [selected, setSelected] = useState(null);
    const [editDraft, setEditDraft] = useState(null);
    const [cardView, setCardView] = useState(null);   // clicked summary card -> records popup
    const [typeFilter, setTypeFilter] = useState('discounting');  // Discounting table opens by default
    const [statusFilter, setStatusFilter] = useState('');
    const [search, setSearch] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getApplications();
            setApps(data.applications || []);
            setScope(data.scope || null);
        } catch (err) {
            toast.error(errText(err, 'Failed to load applications'));
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Records waiting on THIS user's action (e.g. an HO creator chose them
    // as the L4 approver) — shown behind a dedicated queue toggle
    const [pendingOnly, setPendingOnly] = useState(false);
    const actionable = useMemo(() => apps.filter(a => a.can_act === true), [apps]);

    // All filters EXCEPT the type — the type tabs show per-type counts of this set
    const filteredBase = useMemo(() => apps.filter(a =>
        (!pendingOnly || a.can_act === true) &&
        (!statusFilter || a.status === statusFilter) &&
        (!search || [a.app_no, a.customer_name, a.invoice_no, a.sr_no].some(
            v => (v || '').toLowerCase().includes(search.toLowerCase())))
    ), [apps, pendingOnly, statusFilter, search]);

    const typeCounts = useMemo(() => ({
        discounting: filteredBase.filter(a => a.request_type === 'discounting').length,
        credit: filteredBase.filter(a => a.request_type === 'credit').length,
        discounting_credit: filteredBase.filter(a => a.request_type === 'discounting_credit').length,
        expense: filteredBase.filter(a => a.request_type === 'expense').length,
        other: filteredBase.filter(a => a.request_type === 'other').length,
    }), [filteredBase]);

    const filtered = useMemo(() =>
        filteredBase.filter(a => a.request_type === typeFilter),
        [filteredBase, typeFilter]);

    // An application can be withdrawn only while it is pending and NOBODY has
    // acted on it yet (chains vary per employee via the Authority Matrix).
    const canDelete = (app) =>
        app.created_by === user.user_id &&
        app.status.startsWith('pending') &&
        !app.l2_action_by && !app.l3_action_by && !app.l4_action_by && !app.l5_action_by;

    return (
        <div>
            <SummaryCards apps={apps} scope={scope} myPending={actionable.length}
                onCardClick={(key, label) => setCardView({ status: key === 'all' ? '' : key, label })} />

            <div className="flex flex-wrap items-center gap-2 mb-3">
                <button onClick={() => setShowCreate(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white shadow-sm hover:opacity-90"
                    style={{ background: BRAND }}>
                    <Plus size={14} /> Create NFA
                </button>
                {actionable.length > 0 && (
                    <button onClick={() => setPendingOnly(v => !v)}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors ${pendingOnly
                            ? 'text-white border-transparent shadow-sm'
                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                        style={pendingOnly ? { background: BRAND } : undefined}>
                        <Inbox size={14} /> Pending My Approval
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${pendingOnly ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'}`}>
                            {actionable.length}
                        </span>
                    </button>
                )}

                <div className="ml-auto">
                    <TypeTabs value={typeFilter} onChange={setTypeFilter} counts={typeCounts} />
                </div>

                <div className="relative max-sm:w-full">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
                        className="pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-xs w-52 max-sm:w-full focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="border border-gray-300 rounded-lg px-2.5 py-2 text-xs bg-white max-sm:w-full">
                    <option value="">Status</option>
                    {Object.keys(STATUS_META).map(v => <option key={v} value={v}>{statusLabel(v)}</option>)}
                </select>
            </div>

            {loading
                ? <div className="py-16 text-center text-sm text-gray-400">Loading applications…</div>
                : <ApplicationsTable apps={filtered} type={typeFilter}
                    onOpen={app => app.status === 'draft' ? setEditDraft(app) : setSelected(app)}
                    emptyText="No applications yet — create your first approval application" />}

            {showCreate && (
                <CreateApplicationModal onClose={() => setShowCreate(false)} onCreated={load} />
            )}
            {cardView && (
                /* reuses the list this view already loaded — no second fetch.
                   allowAct: an NFA opened from a card that is still waiting on
                   this user shows Approve / Reject right there. */
                <ApprovalReports initialStatus={cardView.status} title={`${cardView.label} Records`}
                    records={apps} allowAct onChanged={load} onClose={() => setCardView(null)} />
            )}
            {editDraft && (
                <CreateApplicationModal draft={editDraft}
                    onClose={() => setEditDraft(null)} onCreated={load} />
            )}
            {selected && (
                <ApplicationDetailModal
                    app={selected}
                    canAct={selected.can_act === true}
                    canDelete={canDelete(selected)}
                    onClose={() => setSelected(null)}
                    onChanged={load}
                    onEditResubmit={(a) => { setSelected(null); setEditDraft(a); }}
                />
            )}
        </div>
    );
}
