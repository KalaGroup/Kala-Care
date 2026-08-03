import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Network, FileCheck2, Gauge, X, BarChart3, RotateCcw } from 'lucide-react';
import { getAccess, prefetchApplications, errText } from '../components/approval/approvalApi';
import { setLevelNames, levelLabel, levelName } from '../components/approval/ApprovalShared';

// LAZY chunks — only the view matching the caller's level is downloaded;
// the COO-only Authority Matrix / Reports load when their button is clicked.
const EmployeeApprovalView = lazy(() => import('../components/approval/EmployeeApprovalView'));
const BranchApprovalView = lazy(() => import('../components/approval/BranchApprovalView'));
const HODApprovalView = lazy(() => import('../components/approval/HODApprovalView'));
const COOApprovalView = lazy(() => import('../components/approval/COOApprovalView'));
const AuthorityMatrix = lazy(() => import('../components/approval/AuthorityMatrix'));
const ApprovalReports = lazy(() => import('../components/approval/ApprovalReports'));

const viewLoader = (
    <div className="flex items-center justify-center min-h-[40vh] text-sm text-gray-400">
        Loading…
    </div>
);

const themeColor = '#2f3192';
const themeDark = '#23255f';

// Level labels come from levelLabel() (ApprovalShared) so COO-renamed level
// names show here too.

// Popup showing the logged-in user's own authority limits AND the L1..L5
// hierarchy their own submissions follow. Shown for EVERY user.
function MyLimitsModal({ access, onClose }) {
    const lim = access.limits || {};
    const chain = access.my_chain || {};
    const unlimited = lim.unlimited === true;
    // null = unlimited (rights masters, or L5 whose blanks default unlimited);
    // other levels' blanks arrive as 0 from the server
    const fmt = (v, unit = '') =>
        unlimited || v === null || v === undefined ? 'Unlimited'
            : v === '' ? (unit === 'inr' ? '₹0' : `0${unit}`)
                : unit === 'inr' ? `₹${Number(v).toLocaleString('en-IN')}` : `${v}${unit}`;
    const Row = ({ label, value }) => (
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 last:border-0">
            <span className="text-xs font-semibold text-gray-800">{label}</span>
            <span className="text-xs font-bold" style={{ color: themeColor }}>{value}</span>
        </div>
    );
    const CATS = [['spares', 'Spares'], ['services', 'Services'], ['spares_services', 'Spares & Services']];
    const stepNames = (s) => {
        if (!s) return 'Skipped';
        if (Array.isArray(s)) return s.join(', ');
        if (s.skipped) return `Skipped — ${s.skipped}`;
        return (s.names || []).join(', ') || '—';
    };
    const ChainStep = ({ tag, text }) => (
        <div className="flex items-start gap-2 px-3 py-1.5 border-b border-gray-100 last:border-0">
            <span className="mt-0.5 flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 w-14 text-center">{tag}</span>
            <span className="text-[11px] text-gray-800">{text}</span>
        </div>
    );
    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3 max-md:p-2" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="sticky top-0 flex items-center justify-between px-4 py-3 text-white" style={{ background: themeColor }}>
                    <span className="font-semibold text-sm flex items-center gap-2">
                        <Gauge size={15} /> My Approval Limits
                    </span>
                    <button onClick={onClose} className="p-1.5 rounded-lg bg-white hover:bg-white/90 transition flex-shrink-0" style={{ color: '#2f3192' }}><X size={15} /></button>
                </div>
                <div className="p-4 space-y-3">
                    <p className="text-[11px] text-gray-700">
                        You act as <b>{levelLabel(access.level)}</b>. Your own records go to the <b>next level</b> for approval; as an approver you finalize records within these limits — above them they forward onward.
                    </p>
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                        <Row label="Max Discounting %" value={fmt(lim.max_discount_percent, '%')} />
                        <Row label="Max Credit Days" value={fmt(lim.max_credit_days, ' days')} />
                        <Row label="Max Expense Amount (all types combined)" value={fmt(lim.max_expense_amount, 'inr')} />
                    </div>
                    {/* The hierarchy this user's own records follow (hidden for L5/COO — top of the chain) */}
                    {access.level !== 'l5' && (
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                        <p className="px-3 py-2 bg-gray-50 text-[10px] uppercase tracking-wide font-bold text-gray-800 border-b border-gray-200">
                            My Approval Hierarchy {chain.branch ? `(${chain.branch})` : ''}
                        </p>
                        <ChainStep tag="L1" text={`${access.name} — creates the record (approved by the next level)`} />
                        {chain.is_ho ? (
                            <>
                                <ChainStep tag="L2 · L3" text="Skipped — Head Office records go directly to L4/L5" />
                                <ChainStep tag={`L4 ${levelName('l4')}`} text="You choose your approver at submit" />
                                <ChainStep tag={`L5 ${levelName('l5')}`} text={stepNames(chain.l5)} />
                            </>
                        ) : (
                            <>
                                <ChainStep tag="L2" text={stepNames(chain.l2)} />
                                <ChainStep tag="L3" text={stepNames(chain.l3)} />
                                {CATS.map(([k, label]) => (
                                    <ChainStep key={k} tag={`L4 ${levelName('l4')}`} text={`${label}: ${stepNames(chain.l4?.[k])}`} />
                                ))}
                                <ChainStep tag={`L5 ${levelName('l5')}`} text={stepNames(chain.l5)} />
                            </>
                        )}
                    </div>
                    )}
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
            // custom level names (Authority Limit tab) show everywhere
            setLevelNames(data.access?.level_names);
            setAccess(data.access);
        } catch (err) {
            toast.error(errText(err, 'Failed to load your approval access'));
        } finally { setLoading(false); }
    }, []);

    useEffect(() => {
        // fire BOTH initial calls in parallel — the view's first
        // getApplications() consumes the prefetched request (no waterfall)
        prefetchApplications();
        loadAccess();
    }, [loadAccess]);

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

    const badge = { label: levelLabel(access.level) };
    const View = {
        l1: EmployeeApprovalView,
        l2: BranchApprovalView,      // generic stage workspace (pending L2)
        l3: BranchApprovalView,      // generic stage workspace (pending L3)
        l4: HODApprovalView,
        l5: COOApprovalView,
    }[access.level] || EmployeeApprovalView;
    const viewProps = access.level === 'l3'
        ? { pendingStatus: 'pending_l3', pendingLabel: 'Pending My Approval (L3)' }
        : access.level === 'l2'
            ? { pendingStatus: 'pending_l2', pendingLabel: 'Pending My Approval (L2)' }
            : {};

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
                            <h1 className="text-lg sm:text-xl font-bold leading-tight">Note For Approval</h1>
                            <p className="text-[11px] text-white/70 leading-tight">
                                Discounting, Credit &amp; Expense approvals — L2 → L3 → L4 (HOD) → L5 (COO)
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium bg-white/15 text-white">
                            Your view: <b className="font-bold">{badge.label}</b>
                        </span>
                        <button onClick={() => setShowLimits(true)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 px-2.5 py-1.5 text-[12px] font-semibold text-white transition">
                            <Gauge size={14} /> My Approval Limits
                        </button>
                        {(access.level === 'l4' || access.level === 'l5') && (
                            <button onClick={() => setShowReports(true)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 px-2.5 py-1.5 text-[12px] font-semibold text-white transition">
                                <BarChart3 size={14} /> Reports
                            </button>
                        )}
                        {access.level === 'l5' && (
                            <button onClick={() => setShowMatrix(true)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 px-2.5 py-1.5 text-[12px] font-semibold text-white transition">
                                <Network size={14} /> Authority Matrix
                            </button>
                        )}
                        <button onClick={() => { loadAccess(); setViewKey(k => k + 1); }} title="Refresh"
                            className="rounded-lg bg-white/15 hover:bg-white/25 p-2 text-white transition">
                            <RotateCcw size={14} />
                        </button>
                    </div>
                </div>
            </div>

            <Suspense fallback={viewLoader}>
                <View key={viewKey} {...viewProps} />
            </Suspense>

            {showMatrix && (
                <Suspense fallback={viewLoader}>
                    <AuthorityMatrix
                        onClose={() => { setShowMatrix(false); loadAccess(); setViewKey(k => k + 1); }}
                    />
                </Suspense>
            )}
            {showLimits && (
                <MyLimitsModal access={access} onClose={() => setShowLimits(false)} />
            )}
            {showReports && (
                <Suspense fallback={viewLoader}>
                    <ApprovalReports onClose={() => setShowReports(false)} />
                </Suspense>
            )}
        </div>
        </div>
    );
}
