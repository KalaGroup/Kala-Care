/* Employee view — create approval applications (Discounting / Credit /
   Expense under Spares / Services) and track their journey through
   Branch Admin -> HOD -> COO. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, RotateCcw, Search } from 'lucide-react';
import { getApplications, errText } from './approvalApi';
import {
    ApplicationsTable, ApplicationDetailModal, CreateApplicationModal,
    SummaryCards, TypeTabs, STATUS_META, BRAND,
} from './ApprovalShared';
import ApprovalReports from './ApprovalReports';

export default function EmployeeApprovalView() {
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    const [apps, setApps] = useState([]);
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
        } catch (err) {
            toast.error(errText(err, 'Failed to load applications'));
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = useMemo(() => apps.filter(a =>
        a.request_type === typeFilter &&
        (!statusFilter || a.status === statusFilter) &&
        (!search || [a.app_no, a.customer_name, a.invoice_no, a.sr_no].some(
            v => (v || '').toLowerCase().includes(search.toLowerCase())))
    ), [apps, typeFilter, statusFilter, search]);

    // An application can be withdrawn only while it is pending and NOBODY has
    // acted on it yet (chains vary per employee via the Authority Matrix).
    const canDelete = (app) =>
        app.created_by === user.user_id &&
        app.status.startsWith('pending') &&
        !app.branch_action_by && !app.hod_action_by && !app.coo_action_by;

    return (
        <div>
            <SummaryCards apps={apps}
                onCardClick={(key, label) => setCardView({ status: key === 'all' ? '' : key, label })} />

            <div className="flex flex-wrap items-center gap-2 mb-3">
                <button onClick={() => setShowCreate(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white shadow-sm hover:opacity-90"
                    style={{ background: BRAND }}>
                    <Plus size={14} /> Create Approval Application
                </button>

                <div className="ml-auto">
                    <TypeTabs value={typeFilter} onChange={setTypeFilter} />
                </div>

                <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
                        className="pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-xs w-52 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="border border-gray-300 rounded-lg px-2.5 py-2 text-xs bg-white">
                    <option value="">All Statuses</option>
                    {Object.entries(STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
                </select>
                <button onClick={load} title="Refresh"
                    className="p-2 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50">
                    <RotateCcw size={13} />
                </button>
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
                <ApprovalReports initialStatus={cardView.status} title={`${cardView.label} Records`}
                    onClose={() => setCardView(null)} />
            )}
            {editDraft && (
                <CreateApplicationModal draft={editDraft}
                    onClose={() => setEditDraft(null)} onCreated={load} />
            )}
            {selected && (
                <ApplicationDetailModal
                    app={selected}
                    canAct={false}
                    canDelete={canDelete(selected)}
                    onClose={() => setSelected(null)}
                    onChanged={load}
                />
            )}
        </div>
    );
}
