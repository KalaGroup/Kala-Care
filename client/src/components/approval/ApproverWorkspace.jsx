/* Shared workspace for the three approver views (Branch Admin / HOD / COO):
   a "Pending My Approval" queue + an "All Applications" tracking tab, with
   the same filters and the shared detail modal for approve / reject. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Search, Inbox, ListChecks, FileText } from 'lucide-react';
import { getApplications, errText } from './approvalApi';
import {
    ApplicationsTable, ApplicationDetailModal, CreateApplicationModal,
    SummaryCards, TypeTabs, STATUS_META, statusLabel, BRAND, canCreatorDelete,
} from './ApprovalShared';
import ApprovalReports from './ApprovalReports';

// showMine=false hides the "My NFA" tab — used by the COO view, where the
// viewer does not file NFAs themselves.
export default function ApproverWorkspace({ pendingStatus, pendingLabel, headerActions = null, initialTab = 'pending', showMine = true }) {
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    const [apps, setApps] = useState([]);
    const [scope, setScope] = useState(null);   // own | stage | all — captions the cards
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState(initialTab);      // pending | mine | all
    const [selected, setSelected] = useState(null);
    const [editDraft, setEditDraft] = useState(null); // own drafts open in the editor
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

    // Everything the server says THIS user can act on right now — their own
    // stage queue PLUS records whose HO creator chose them as L4/L5 approver
    const pending = useMemo(() => apps.filter(a => a.can_act === true), [apps]);

    // My NFA — only the records THIS user created (their own applications)
    const mine = useMemo(() => apps.filter(a => a.created_by === user.user_id),
        [apps, user.user_id]);

    // Current tab's records with every filter EXCEPT the type — the type tabs
    // show a per-type count of exactly this set.
    const filteredBase = useMemo(() => {
        const base = tab === 'pending' ? pending : tab === 'mine' ? mine : apps;
        return base.filter(a =>
            (tab === 'pending' || !statusFilter || a.status === statusFilter) &&
            (!search || [a.app_no, a.customer_name, a.invoice_no, a.sr_no, a.created_by_name].some(
                v => (v || '').toLowerCase().includes(search.toLowerCase())))
        );
    }, [apps, pending, mine, tab, statusFilter, search]);

    const typeCounts = useMemo(() => ({
        discounting: filteredBase.filter(a => a.request_type === 'discounting').length,
        credit: filteredBase.filter(a => a.request_type === 'credit').length,
        discounting_credit: filteredBase.filter(a => a.request_type === 'discounting_credit').length,
        expense: filteredBase.filter(a => a.request_type === 'expense').length,
        other: filteredBase.filter(a => a.request_type === 'other').length,
    }), [filteredBase]);

    const visible = useMemo(() =>
        filteredBase.filter(a => a.request_type === typeFilter),
        [filteredBase, typeFilter]);

    const tabBtn = (key, label, icon, count) => (
        <button onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors ${tab === key
                ? 'text-white border-transparent shadow-sm'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
            style={tab === key ? { background: BRAND } : undefined}>
            {icon} {label}
            {count > 0 && (
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tab === key ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'}`}>
                    {count}
                </span>
            )}
        </button>
    );

    return (
        <div>
            <SummaryCards apps={apps} scope={scope} myPending={pending.length}
                onCardClick={(key, label) => setCardView({ status: key === 'all' ? '' : key, label })} />

            <div className="flex flex-wrap items-center gap-2 mb-3">
                {tabBtn('pending', pendingLabel, <Inbox size={14} />, pending.length)}
                {showMine && tabBtn('mine', 'My NFA', <FileText size={14} />, 0)}
                {tabBtn('all', 'All Applications', <ListChecks size={14} />, 0)}
                {headerActions}

                <div className="ml-auto">
                    <TypeTabs value={typeFilter} onChange={setTypeFilter} counts={typeCounts} />
                </div>

                <div className="relative max-sm:w-full">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
                        className="pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-xs w-56 max-sm:w-full focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                {tab !== 'pending' && (
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                        className="border border-gray-300 rounded-lg px-2.5 py-2 text-xs bg-white max-sm:w-full">
                        <option value="">Status</option>
                        {Object.keys(STATUS_META).map(v => <option key={v} value={v}>{statusLabel(v)}</option>)}
                    </select>
                )}
            </div>

            {loading
                ? <div className="py-16 text-center text-sm text-gray-400">Loading applications…</div>
                : <ApplicationsTable apps={visible} type={typeFilter}
                    onOpen={app => app.status === 'draft' ? setEditDraft(app) : setSelected(app)}
                    emptyText={tab === 'pending' ? 'Nothing waiting for your approval'
                        : tab === 'mine' ? 'You have not created any applications yet'
                            : 'No applications found'} />}

            {editDraft && (
                <CreateApplicationModal draft={editDraft}
                    onClose={() => setEditDraft(null)} onCreated={load} />
            )}
            {cardView && (
                /* reuses the list this view already loaded — no second fetch.
                   allowAct: an NFA opened from a card that is still waiting on
                   this user shows Approve / Reject right there. */
                <ApprovalReports initialStatus={cardView.status} title={`${cardView.label} Records`}
                    records={apps} allowAct onChanged={load} onClose={() => setCardView(null)} />
            )}
            {selected && (
                <ApplicationDetailModal
                    app={selected}
                    canAct={selected.can_act === true}
                    /* an L2..L4 approver filing their OWN NFA gets the same
                       edit / delete rights as any other creator */
                    canDelete={canCreatorDelete(selected, user.user_id)}
                    onClose={() => setSelected(null)}
                    onChanged={load}
                    onEditResubmit={(a) => { setSelected(null); setEditDraft(a); }}
                />
            )}
        </div>
    );
}
