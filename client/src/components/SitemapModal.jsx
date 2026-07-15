import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

// ERP Sitemap — a helicopter view of every module and the functionality inside
// it, rendered as a hierarchical link tree (no cards). Opened from the Navbar
// (Master Admin only). Clicking any link navigates to that page in THIS tab;
// entries with `state` deep-link straight to the exact in-page tab via router
// state, which each page consumes on mount.

const THEME = '#2f3192';

// One entry per ERP page. `color` tints the module's bullet/accents. `state`
// on a feature deep-links to the exact in-page tab (Dashboard / Customers /
// Profile / MOM / Maintenance Reports consume it); features without `state`
// simply open the parent page.
const SITEMAP = [
    {
        title: 'Dashboard', path: '/dashboard', color: '#2f3192',
        desc: 'Company-wide performance overview with role-based tabs.',
        features: [
            { label: 'KALA Performance', state: { openTab: 'overall' } },
            { label: 'Branch Overview & Drive Reports', state: { openTab: 'branches' } },
            { label: 'Employee Progress', state: { openTab: 'branch-report' } },
            { label: 'Drive Overview', state: { openTab: 'campaign-success' } },
            { label: 'Activity Frequency', state: { openTab: 'activity' } },
            { label: 'Rejected Reasons Reports', state: { openTab: 'rejected-reason' } },
        ],
    },
    {
        title: 'Customer Engagement — Drive Data', path: '/customer-engagement', color: '#0e7490',
        desc: 'Drive-wise customer follow-ups and letters.',
        features: [
            { label: 'Drive Customers & C1–C7 Flags' },
            { label: 'Follow-up Statuses (WIP / F / R / NC / C)' },
            { label: 'Send Letters & Letter Wizard' },
            { label: 'Add Activity / Reject Reason' },
            { label: 'Quotations & PDF Scripts' },
            { label: 'My Notes (Diary)', state: { openModal: 'diary' } },
        ],
    },
    {
        title: 'Customer Engagement — Non-Drive Data', path: '/customer-engagement-2', color: '#0369a1',
        desc: 'Non-drive customers and the full customer 360 view.',
        features: [
            { label: 'Non-Drive Customer Follow-ups' },
            { label: 'Search Customer Not in Drive' },
            { label: 'Completed — Show On Top', state: { completedFirst: true } },
            { label: 'Letter Drafts & Wizard' },
        ],
    },
    {
        title: 'Customers Data Hub', path: '/customers', color: '#7c3aed',
        desc: 'Browse every imported master table with search & pagination.',
        features: [
            { label: 'Customers', state: { openTable: 'customers' } },
            { label: 'AMC Agreements', state: { openTable: 'amc_agreements' } },
            { label: 'Asset Detailed', state: { openTable: 'asset_detailed' } },
            { label: 'Asset Services', state: { openTable: 'asset_services' } },
            { label: 'Anubandhan Plus', state: { openTable: 'anubandhan_plus' } },
            { label: 'Anubandhan', state: { openTable: 'anubandhan' } },
            { label: 'Bandhan Plus', state: { openTable: 'bandhan_plus' } },
            { label: 'Pulse Quotations', state: { openTable: 'pulse' } },
            { label: 'Regular Bandhan', state: { openTable: 'regular_bandhan' } },
            { label: 'LMS Data', state: { openTable: 'lms_data' } },
            { label: 'Open SR Load Reports', state: { openTable: 'open_sr_load_reports' } },
        ],
    },
    {
        title: 'Data - Upload (Import)', path: '/import', color: '#be185d',
        desc: 'Excel data upload for all master tables.',
        features: [
            { label: 'Excel Imports (AMC, Asset, Oil Service, LMS…)' },
            { label: 'Preview & Validation Before Upload' },
            { label: 'Last-Update Tracking per File' },
        ],
    },
    {
        title: 'Drive Creation (Campaigns)', path: '/campaigns', color: '#b45309',
        desc: 'Create and manage engagement drives.',
        features: [
            { label: 'Create New Drive', state: { openModal: 'create-drive' } },
            { label: 'Add Service / Product', state: { openModal: 'add-service' } },
            { label: 'Transfer Assets Between Drives' },
            { label: 'Letter Format Master', state: { openModal: 'letter-master' } },
            { label: 'Branch Email Master', state: { openModal: 'branch-email' } },
        ],
    },
    {
        title: 'Profile & Administration', path: '/profile', color: '#166534',
        desc: 'Your profile plus all user administration.',
        features: [
            { label: 'My Profile & Password' },
            { label: 'Employee Management', state: { openTab: 'employees' } },
            { label: 'Queries (Admin & Employee Inbox)', state: { openTab: 'queries' } },
            { label: 'CDB Update History', state: { openTab: 'cdb-update' } },
            { label: 'Permissions (Expense, Export, Block)', state: { openTab: 'employees' } },
            { label: 'Banner Management', state: { openModal: 'banner' } },
        ],
    },
    {
        title: 'Expense Tracking', path: '/expense', color: '#9d174d',
        desc: 'HO verification of branch expenses.',
        features: [
            { label: 'TA-DA (HO Verification)', state: { openTab: 'tada' } },
            { label: 'TA-DA — Branch History', state: { openTab: 'tada', openModal: 'history' } },
            { label: 'Office Expenses', state: { openTab: 'office' } },
            { label: 'Local Vendor Bills', state: { openTab: 'vendor' } },
        ],
    },
    {
        title: 'Expense Dashboard', path: '/expense-dashboard', color: '#0f766e',
        desc: 'KPIs and charts for all expense modules.',
        features: [
            { label: 'TA-DA Dashboard', state: { openTab: 'tada' } },
            { label: 'Office Expense Dashboard', state: { openTab: 'office' } },
            { label: 'Local Vendor Bills Dashboard', state: { openTab: 'vendor' } },
        ],
    },
    {
        title: 'MOM Tracking', path: '/mom-tracking', color: '#4338ca',
        desc: 'Minutes-of-meeting workflow, history and reports.',
        features: [
            { label: 'New Meeting (Attendees → Points → Sheet)', state: { openView: 'new' } },
            { label: 'Meeting History', state: { openView: 'history' } },
            { label: 'Reports (Branch-wise Summary)', state: { openView: 'reports' } },
            { label: 'Points & Category Masters', state: { openMasters: true } },
        ],
    },
    {
        title: 'Knowledge Bank', path: '/knowledge-book', color: '#a16207',
        desc: 'Shared document library for all branches.',
        features: [
            { label: 'Folders & Documents' },
            { label: 'Preview & Download' },
            { label: 'Categories', state: { openModal: 'categories' } },
            { label: 'Upload (Admin)' },
        ],
    },
    {
        title: 'Quotation Template', path: '/maintenance-schedule', color: '#155e75',
        desc: 'Service schedules with printable A4 sheets.',
        features: [
            { label: 'Service Schedule & Parts', state: { openSchedule: true } },
            { label: 'Master Data', state: { openMaster: 'master' } },
            { label: 'Master of Service', state: { openMaster: 'service' } },
            { label: 'Import Data', state: { openMaster: 'import' } },
        ],
    },
    {
        title: 'Activity Reports (Maintenance)', path: '/maintenance-reports', color: '#86198f',
        desc: 'Coverage and activity reporting for maintenance.',
        features: [
            { label: 'Service Coverage Matrix', state: { openTab: 'coverage' } },
            { label: 'Search Activity Log', state: { openTab: 'activity' } },
            { label: 'Excel Export' },
        ],
    },
    {
        title: 'Sales & Finance', path: '/sales-finance', color: '#525252',
        desc: 'Sales and finance workspace.',
        features: [
            { label: 'Coming Soon' },
        ],
    },
];

const totalLinks = SITEMAP.reduce((n, m) => n + 1 + m.features.length, 0);

// Wraps the part of `text` matching `q` in a highlight mark.
const Highlight = ({ text, q }) => {
    if (!q) return text;
    const i = text.toLowerCase().indexOf(q);
    if (i === -1) return text;
    return (
        <>
            {text.slice(0, i)}
            <mark className="bg-[#ffdb62]/70 text-inherit rounded-sm px-0.5">{text.slice(i, i + q.length)}</mark>
            {text.slice(i + q.length)}
        </>
    );
};

const SitemapModal = ({ onClose }) => {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const q = query.trim().toLowerCase();

    // Close on Escape
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    // Same-tab navigation: close the modal, then route to the page (with
    // optional deep-link state so the page opens on the exact inner tab).
    const go = (path, state) => {
        onClose();
        navigate(path, state ? { state } : undefined);
    };

    // Filter modules/features by the search query (module stays if its title
    // matches; otherwise it stays with only its matching features).
    const filtered = useMemo(() => {
        if (!q) return SITEMAP;
        return SITEMAP
            .map((m) => {
                const titleHit = m.title.toLowerCase().includes(q) || (m.desc || '').toLowerCase().includes(q);
                const feats = m.features.filter((f) => f.label.toLowerCase().includes(q));
                if (titleHit) return m;
                if (feats.length) return { ...m, features: feats };
                return null;
            })
            .filter(Boolean);
    }, [q]);

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 max-md:p-2 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    className="px-5 py-4 max-md:px-3 flex items-center gap-3 max-md:flex-wrap"
                    style={{ background: `linear-gradient(135deg, ${THEME}, #4547b0)` }}
                >
                    <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center flex-shrink-0">
                        {/* sitemap / hierarchy icon */}
                        <svg className="w-5 h-5 text-[#ffdb62]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                            <rect x="9" y="3" width="6" height="4.5" rx="1" />
                            <rect x="3" y="16.5" width="6" height="4.5" rx="1" />
                            <rect x="15" y="16.5" width="6" height="4.5" rx="1" />
                            <path strokeLinecap="round" d="M12 7.5v3.5M12 11H6v5.5M12 11h6v5.5" />
                        </svg>
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-white text-base font-bold leading-tight">ERP Sitemap</h2>
                        <p className="text-white/70 text-[11px]">
                            Every page & its functionality — click any link to open it right here
                        </p>
                    </div>
                    <div className="ml-auto flex items-center gap-2 max-md:w-full max-md:ml-0">
                        <span className="text-[10px] text-white/80 bg-white/10 border border-white/20 rounded-full px-2.5 py-1 whitespace-nowrap max-sm:hidden">
                            {SITEMAP.length} modules · {totalLinks} links
                        </span>
                        <div className="relative">
                            <svg className="w-3.5 h-3.5 text-white/60 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search pages & features..."
                                autoFocus
                                className="pl-8 pr-3 py-1.5 rounded-lg bg-white/15 border border-white/25 text-white placeholder-white/50 text-xs w-56 max-md:w-full focus:outline-none focus:bg-white/25 focus:border-white/50 transition-colors"
                            />
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-lg bg-white/15 border border-white/25 flex items-center justify-center hover:bg-white/30 transition-colors group flex-shrink-0"
                        >
                            <svg className="w-4 h-4 text-white group-hover:rotate-90 transition-transform duration-200" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Body — hierarchical link tree (no boxes) */}
                <div className="flex-1 overflow-y-auto px-6 py-5 max-md:px-3 bg-gradient-to-b from-white to-gray-50/60">
                    {filtered.length === 0 ? (
                        <div className="py-16 text-center">
                            <p className="text-sm font-medium text-gray-600">No page or feature matches “{query}”.</p>
                            <button
                                onClick={() => setQuery('')}
                                className="mt-2 text-xs font-medium hover:underline"
                                style={{ color: THEME }}
                            >
                                Clear search
                            </button>
                        </div>
                    ) : (
                        // Three independent flex columns — expanding a module only reflows its own column
                        <div className="flex gap-8 max-sm:flex-col items-start">
                            {[0, 1, 2].map((col) => (
                                <div key={col} className="flex-1 min-w-0 flex flex-col gap-2 max-sm:w-full">
                                    {filtered.filter((_, i) => i % 3 === col).map((m) => (
                                <div key={m.title} className="group relative rounded-lg">
                                    {/* Module — top-level link */}
                                    <button
                                        onClick={() => go(m.path)}
                                        title={m.desc || ''}
                                        className="group/mod w-full text-left flex items-start gap-2 rounded-md -mx-1.5 px-1.5 py-1 transition-colors hover:bg-white hover:shadow-sm"
                                    >
                                        {/* Arrowhead bullet — turns blue & rotates down on hover, size stays fixed */}
                                        <svg
                                            className="mt-[3px] w-3.5 h-3.5 flex-shrink-0 text-black group-hover:text-[#2f3192] group-focus-within:text-[#2f3192] group-hover:rotate-90 group-focus-within:rotate-90 transition-transform duration-500 ease-[cubic-bezier(.22,.61,.36,1)]"
                                            fill="currentColor" viewBox="0 0 24 24"
                                        >
                                            <path d="M3 3 L21 12 L3 21 L9 12 Z" />
                                        </svg>
                                        <span className="min-w-0 flex-1">
                                            <span
                                                className="block text-[13px] font-semibold leading-5 text-black group-hover:text-[#2f3192] group-focus-within:text-[#2f3192] group-hover:translate-x-0.5 transition-all duration-300"
                                            >
                                                <Highlight text={m.title} q={q} />
                                            </span>
                                            <span className="block text-[10px] text-gray-400 leading-4 group-hover/mod:text-gray-500 transition-colors">
                                                {m.desc}
                                            </span>
                                        </span>
                                    </button>

                                    {/* Features — collapsed by default; revealed on hover OR keyboard focus (tab).
                                        Opens a touch slower with a soft ease; each link then cascades in. */}
                                    <div className="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] group-focus-within:grid-rows-[1fr] transition-[grid-template-rows] duration-500 ease-[cubic-bezier(.22,.61,.36,1)]">
                                    <ul className="overflow-hidden mt-1 ml-[3px] border-l border-gray-200 pl-3 space-y-px opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-500 delay-100">
                                        {m.features.map((f, fi) => (
                                            <li
                                                key={f.label}
                                                className="opacity-0 -translate-x-1.5 group-hover:opacity-100 group-hover:translate-x-0 group-focus-within:opacity-100 group-focus-within:translate-x-0 transition-all duration-300 ease-out"
                                                style={{ transitionDelay: `${120 + fi * 50}ms` }}
                                            >
                                                <button
                                                    onClick={() => go(m.path, f.state)}
                                                    className="group/feat w-full text-left flex items-center gap-1.5 rounded-md px-1.5 py-[3px] transition-all hover:bg-white hover:shadow-sm hover:translate-x-0.5"
                                                >
                                                    <svg
                                                        className="w-3 h-3 flex-shrink-0 text-gray-300 group-hover/feat:text-[#2f3192] group-hover/feat:translate-x-0.5 transition-all"
                                                        fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
                                                    >
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                                    </svg>
                                                    <span className="min-w-0 text-[12px] leading-5 text-gray-600 group-hover:text-[#2f3192] group-hover/feat:font-medium transition-colors truncate">
                                                        <Highlight text={f.label} q={q} />
                                                    </span>
                                                    {f.state && (
                                                        <span
                                                            className="flex-shrink-0 text-[8px] font-bold uppercase tracking-wide px-1 py-px rounded bg-[#ffdb62]/80 text-[#2f3192] opacity-0 group-hover/feat:opacity-100 transition-opacity"
                                                            title={(f.state.openModal || f.state.openMasters) ? 'Opens this exact box' : 'Opens this exact tab'}
                                                        >
                                                            {(f.state.openModal || f.state.openMasters) ? 'box' : 'tab'}
                                                        </span>
                                                    )}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                    </div>
                                </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 py-2 border-t border-gray-200 bg-white flex items-center justify-between gap-2 max-sm:flex-wrap">
                    <p className="text-[10px] text-gray-400">
                        Links marked <span className="text-[8px] font-bold uppercase px-1 py-px rounded bg-[#ffdb62]/80 text-[#2f3192]">tab</span> / <span className="text-[8px] font-bold uppercase px-1 py-px rounded bg-[#ffdb62]/80 text-[#2f3192]">box</span> open
                        that exact tab or box · everything opens in this window · visible to Master Admin only
                    </p>
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-90"
                        style={{ backgroundColor: THEME }}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default React.memo(SitemapModal);
