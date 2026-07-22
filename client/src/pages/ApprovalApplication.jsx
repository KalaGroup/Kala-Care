import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Network, FileCheck2, Gauge, X, BarChart3 } from 'lucide-react';
import { getAccess, errText } from '../components/approval/approvalApi';
import EmployeeApprovalView from '../components/approval/EmployeeApprovalView';
import BranchApprovalView from '../components/approval/BranchApprovalView';
import HODApprovalView from '../components/approval/HODApprovalView';
import COOApprovalView from '../components/approval/COOApprovalView';
import AuthorityMatrix from '../components/approval/AuthorityMatrix';
import ApprovalReports from '../components/approval/ApprovalReports';

const themeColor = '#2f3192';
const themeDark = '#23255f';

const LEVEL_BADGES = {
    user: { label: 'Employee' },
    branch: { label: 'Branch Admin Approval' },
    hod: { label: 'HOD Approval' },
    coo: { label: 'COO Approval' },
};

// Small popup showing the logged-in approver's own authority limits
function MyLimitsModal({ access, onClose }) {
    const lim = access.limits || {};
    const fmt = (v, unit = '') =>
        (v === null || v === undefined || v === '') ? 'Unlimited'
            : unit === 'inr' ? `₹${Number(v).toLocaleString('en-IN')}` : `${v}${unit}`;
    const Row = ({ label, value }) => (
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 last:border-0">
            <span className="text-xs font-semibold text-gray-800">{label}</span>
            <span className="text-xs font-bold" style={{ color: themeColor }}>{value}</span>
        </div>
    );
    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 text-white" style={{ background: themeColor }}>
                    <span className="font-semibold text-sm flex items-center gap-2">
                        <Gauge size={15} /> My Approval Limits
                    </span>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/15"><X size={15} /></button>
                </div>
                <div className="p-4 space-y-3">
                    <p className="text-[11px] text-gray-700">
                        Records within these limits are finally approved by you; bigger values are
                        forwarded to the next level after your approval.
                    </p>
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                        <Row label="Discounting" value={fmt(lim.max_discount_percent, '%')} />
                        <Row label="Credit Period" value={fmt(lim.max_credit_days, ' days')} />
                    </div>
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                        <p className="px-3 py-2 bg-gray-50 text-[10px] uppercase tracking-wide font-bold text-gray-800 border-b border-gray-200">
                            Expense (per type)
                        </p>
                        {(lim.expense_types || []).length === 0
                            ? <p className="px-3 py-3 text-xs text-gray-600">No expense types defined yet</p>
                            : lim.expense_types.map(t => (
                                <Row key={t.name} label={t.name} value={fmt(t.max_amount, 'inr')} />
                            ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function ApprovalApplication() {
    const [access, setAccess] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showMatrix, setShowMatrix] = useState(false);
    const [showLimits, setShowLimits] = useState(false);
    const [showReports, setShowReports] = useState(false);
    // Bump to remount the active view when the Authority Matrix changes rules
    const [viewKey, setViewKey] = useState(0);

    const loadAccess = useCallback(async () => {
        try {
            const data = await getAccess();
            setAccess(data.access);
        } catch (err) {
            toast.error(errText(err, 'Failed to load your approval access'));
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { loadAccess(); }, [loadAccess]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh] text-sm text-gray-400">
                Loading Approval Application…
            </div>
        );
    }
    if (!access) {
        return (
            <div className="flex items-center justify-center min-h-[60vh] text-sm text-gray-400">
                Could not load your approval access — please refresh.
            </div>
        );
    }

    const badge = LEVEL_BADGES[access.level] || LEVEL_BADGES.user;
    const View = {
        user: EmployeeApprovalView,
        branch: BranchApprovalView,
        hod: HODApprovalView,
        coo: COOApprovalView,
    }[access.level] || EmployeeApprovalView;

    return (
        <div className="min-h-screen font-sans">
        <div className="max-w-7xl mx-auto px-3 sm:px-5 pb-10 max-md:px-2">
            {/* ===== Hero header (same style as Knowledge Bank / Part Detail Info) ===== */}
            <div className="rounded-2xl px-3 sm:px-5 py-3 mb-3 text-white relative overflow-hidden"
                style={{ background: `linear-gradient(120deg, ${themeColor} 0%, ${themeDark} 100%)` }}>
                <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
                <div className="absolute right-16 -bottom-12 h-24 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
                <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-white/15 backdrop-blur-sm">
                            <FileCheck2 size={18} />
                        </div>
                        <div>
                            <h1 className="text-lg sm:text-xl font-bold leading-tight">Approval Application</h1>
                            <p className="text-[11px] text-white/70 leading-tight">
                                Discounting, Credit &amp; Expense approvals — Branch Admin, then HOD, then COO
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium bg-white/15 text-white">
                            Your view: <b className="font-bold">{badge.label}</b>
                        </span>
                        {(access.level === 'branch' || access.level === 'hod') && (
                            <button onClick={() => setShowLimits(true)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 px-2.5 py-1.5 text-[12px] font-semibold text-white transition">
                                <Gauge size={14} /> My Approval Limits
                            </button>
                        )}
                        {(access.level === 'hod' || access.level === 'coo') && (
                            <button onClick={() => setShowReports(true)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 px-2.5 py-1.5 text-[12px] font-semibold text-white transition">
                                <BarChart3 size={14} /> Reports
                            </button>
                        )}
                        {access.level === 'coo' && (
                            <button onClick={() => setShowMatrix(true)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-semibold transition hover:bg-white/90"
                                style={{ color: themeColor }}>
                                <Network size={14} /> Authority Matrix
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <View key={viewKey} />

            {showMatrix && (
                <AuthorityMatrix
                    onClose={() => { setShowMatrix(false); loadAccess(); setViewKey(k => k + 1); }}
                />
            )}
            {showLimits && (
                <MyLimitsModal access={access} onClose={() => setShowLimits(false)} />
            )}
            {showReports && (
                <ApprovalReports onClose={() => setShowReports(false)} />
            )}
        </div>
        </div>
    );
}
