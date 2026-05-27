import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Bar, Line } from 'react-chartjs-2';
import BranchAdminExpenseDash from './BranchAdminExpenseDash';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  BarElement, LineElement, PointElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js';

ChartJS.register(
  CategoryScale, LinearScale,
  BarElement, LineElement, PointElement,
  Title, Tooltip, Legend, Filler
);

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;

const BRANCH_ORDER = [
  'HO', '420435_1', '420435_2', '420435_3', '420435_4', '420435_5',
  '420435_6', '420435_7', '420435_8', '420435_9', '420435_10',
  '420435_11', '420435_12', '420435_13', '420435_14',
];

const BRANCH_MAP = {
  'HO': 'Pune Office',
  '420435_1': 'Ch.Sambhaji Nagar', '420435_2': 'Ahilyanagar',
  '420435_3': 'Beed', '420435_4': 'Nanded',
  '420435_5': 'Babhaleshwar', '420435_6': 'Latur',
  '420435_7': 'Parbhani', '420435_8': 'Hubli',
  '420435_9': 'Belagavi', '420435_10': 'Hospet',
  '420435_11': 'Ballari', '420435_12': 'Bagalkot',
  '420435_13': 'Gulbarga', '420435_14': 'Bijapur',
};

const themeColor = '#2f3192';
const themeShades = {
  light: 'rgba(64, 96, 147, 0.1)',
  medium: 'rgba(64, 96, 147, 0.5)',
  dark: '#335478',
};
const pendingColor = '#f59e0b';
const pendingDark = '#d97706';

const formatINR = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  })}`;

const formatINRCompact = (n) => {
  const num = Number(n || 0);
  if (Math.abs(num) >= 1e7) return `₹${(num / 1e7).toFixed(2)}Cr`;
  if (Math.abs(num) >= 1e5) return `₹${(num / 1e5).toFixed(2)}L`;
  if (Math.abs(num) >= 1e3) return `₹${(num / 1e3).toFixed(1)}K`;
  return `₹${num.toFixed(0)}`;
};

// ───── Endpoint configs (only thing that differs between tabs) ─────
const TADA_CONFIG = {
  verified: '/ho-expense-dash/all-branches-verified-expense',
  monthly: '/ho-expense-dash/branch-monthly-expense',
  unverified: '/ho-expense-dash/all-branches-unverified',
  years: '/ho-expense-dash/available-years',
  kpis: '/ho-expense-dash/kpis',
  dateLabel: 'SR Reach at Site Date',
  titles: {
    verified: 'Verified Expense by Branch',
    verifiedSub: 'All approved & submitted expenses, per branch',
    monthly: 'Monthly Verified Expense Trend',
    monthlySub: '12-month verified spend for the selected branch',
    unverified: 'Pending by Branch',
    unverifiedSub: 'Records still awaiting HO verification',
  },
};

const OFFICE_CONFIG = {
  verified: '/ho-expense-dash/office/all-branches-verified-expense',
  monthly: '/ho-expense-dash/office/branch-monthly-expense',
  unverified: '/ho-expense-dash/office/all-branches-unverified',
  years: '/ho-expense-dash/office/available-years',
  kpis: '/ho-expense-dash/office/kpis',
  dateLabel: 'Paid Date',
  titles: {
    verified: 'Verified Office Expense by Branch',
    verifiedSub: 'Submitted office expenses, per branch',
    monthly: 'Monthly Verified Office Expense Trend',
    monthlySub: '12-month verified office spend for the selected branch',
    unverified: 'Pending Office Expense by Branch',
    unverifiedSub: 'Records still in pipeline (verified but not yet submitted are also counted)',
  },
};

const VENDOR_CONFIG = {
  verified: '/ho-expense-dash/vendor/all-branches-verified-expense',
  monthly: '/ho-expense-dash/vendor/branch-monthly-expense',
  unverified: '/ho-expense-dash/vendor/all-branches-unverified',
  years: '/ho-expense-dash/vendor/available-years',
  kpis: '/ho-expense-dash/vendor/kpis',
  dateLabel: 'Invoice Date',
  titles: {
    verified: 'Verified Vendor Bills by Branch',
    verifiedSub: 'Submitted local vendor bills, per branch',
    monthly: 'Monthly Verified Vendor Bills Trend',
    monthlySub: '12-month verified vendor payments for the selected branch',
    unverified: 'Pending Vendor Bills by Branch',
    unverifiedSub: 'Bills still in pipeline (verified but not yet submitted are also counted)',
  },
};

const HOExpenseDash = () => {
  const user = JSON.parse(sessionStorage.getItem('user') || '{}');
  const [activeTab, setActiveTab] = useState('tada');
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const [viewingBranch, setViewingBranch] = useState(null);

  const getBranchDisplayName = (code) => BRANCH_MAP[code] || code || 'No Branch';
  const getUserTypeDisplay = () => {
    if (user?.role === 'master_admin') return 'Master Admin';
    if (user?.role === 'it_admin') return 'IT Admin';
    if (user?.role === 'employee' && user?.branch === 'HO') return 'HO Employee';
    return 'User';
  };
  // ── If HO admin clicked a branch from picker, show that branch's dashboard ──
  if (viewingBranch) {
    return (
      <div className="min-h-screen">
        <div className="max-w-full mx-auto px-3 sm:px-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <button
              onClick={() => setViewingBranch(null)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center gap-1.5 transition-all"
            >
              <span style={{ fontSize: '14px' }}>←</span> Back to HO Dashboard
            </button>
            <div className="text-xs text-gray-600">
              Viewing branch:{' '}
              <span className="font-bold" style={{ color: themeColor }}>
                {getBranchDisplayName(viewingBranch)} ({viewingBranch})
              </span>
            </div>
          </div>
          <BranchAdminExpenseDash branchCode={viewingBranch} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-full mx-auto px-3 sm:px-4">
        {/* Header */}
        <div className="mb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <h1 className="text-xl font-bold text-black">Expense Dashboard</h1>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm text-black/70 flex items-center gap-2">
                    {user?.name || 'User'} • {getUserTypeDisplay()} • {user?.branch || '-'} - {getBranchDisplayName(user?.branch)}
                  </span>
                  <button
                    onClick={() => setShowBranchPicker(true)}
                    className="px-3 py-1.5 text-white text-xs font-semibold rounded-lg shadow-sm hover:shadow-md transition-all flex items-center gap-1.5 whitespace-nowrap"
                    style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                  >
                    <span style={{ fontSize: '13px' }}></span>
                    View Branch Dashboard
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-1 sm:gap-2 bg-gray-100 rounded-lg p-1">
              {[
                { id: 'tada', label: 'TA-DA' },
                { id: 'office', label: 'Office Expense' },
                { id: 'vendor', label: 'Local Vendor Bills' },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md transition-all"
                  style={{
                    backgroundColor: activeTab === t.id ? 'white' : 'transparent',
                    color: activeTab === t.id ? themeColor : '#6B7280',
                    boxShadow: activeTab === t.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* TADA tab */}
        {activeTab === 'tada' && (
          <ExpenseSection key="tada" config={TADA_CONFIG} />
        )}

        {/* Office Expense tab */}
        {activeTab === 'office' && (
          <ExpenseSection key="office" config={OFFICE_CONFIG} />
        )}

        {/* Local Vendor Bills tab */}
        {activeTab === 'vendor' && (
          <ExpenseSection key="vendor" config={VENDOR_CONFIG} />
        )}
        {showBranchPicker && (
          <BranchPickerModal
            onClose={() => setShowBranchPicker(false)}
            onSelect={(code) => {
              setViewingBranch(code);
              setShowBranchPicker(false);
            }}
          />
        )}
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════
   Reusable section: KPI strip + 3 charts (Verified / Monthly / Unverified)
   ════════════════════════════════════════════════════════════════ */
const ExpenseSection = ({ config }) => {
  // Box 1
  const [verifiedData, setVerifiedData] = useState([]);
  const [loadingVerified, setLoadingVerified] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Box 2
  const [selectedBranch, setSelectedBranch] = useState(BRANCH_ORDER[0]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState([new Date().getFullYear()]);
  const [monthlyData, setMonthlyData] = useState([]);
  const [loadingMonthly, setLoadingMonthly] = useState(false);

  // Box 3
  const [unverifiedData, setUnverifiedData] = useState([]);
  const [loadingUnverified, setLoadingUnverified] = useState(false);

  // KPIs
  const [kpis, setKpis] = useState({
    total_verified_amount: 0,
    total_verified_count: 0,
    total_unverified_count: 0,
  });

  // ───── Loaders ─────
  const loadVerified = async (df = dateFrom, dt = dateTo) => {
    setLoadingVerified(true);
    try {
      const params = {};
      if (df) params.date_from = df;
      if (dt) params.date_to = dt;
      const { data } = await axios.get(`${API_BASE_URL}${config.verified}`, { params });
      setVerifiedData(data || []);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load verified expense');
    } finally {
      setLoadingVerified(false);
    }
  };

  const loadMonthly = async (branch, year) => {
    setLoadingMonthly(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}${config.monthly}`, {
        params: { branch_code: branch, year },
      });
      setMonthlyData(data || []);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load monthly trend');
    } finally {
      setLoadingMonthly(false);
    }
  };

  const loadUnverified = async () => {
    setLoadingUnverified(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}${config.unverified}`);
      setUnverifiedData(data || []);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load unverified data');
    } finally {
      setLoadingUnverified(false);
    }
  };

  const loadYears = async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}${config.years}`);
      if (data && data.length) {
        setAvailableYears(data);
        if (!data.includes(selectedYear)) setSelectedYear(data[0]);
      }
    } catch (e) { console.error(e); }
  };

  const loadKpis = async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}${config.kpis}`);
      setKpis(data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    loadVerified();
    loadUnverified();
    loadYears();
    loadKpis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  useEffect(() => {
    loadMonthly(selectedBranch, selectedYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, selectedBranch, selectedYear]);

  // ───── Derived totals ─────
  const verifiedTotal = useMemo(
    () => verifiedData.reduce((s, x) => s + Number(x.total_amount || 0), 0),
    [verifiedData]
  );
  const unverifiedTotalCount = useMemo(
    () => unverifiedData.reduce((s, x) => s + Number(x.unverified_count || 0), 0),
    [unverifiedData]
  );
  const unverifiedTotalAmount = useMemo(
    () => unverifiedData.reduce((s, x) => s + Number(x.total_amount || 0), 0),
    [unverifiedData]
  );
  const monthlyTotal = useMemo(
    () => monthlyData.reduce((s, x) => s + Number(x.total_amount || 0), 0),
    [monthlyData]
  );

  // ───── Chart data + options ─────
  const monthlyChart = {
    labels: monthlyData.map(d => d.month),
    datasets: [{
      label: 'Verified Amount',
      data: monthlyData.map(d => Number(d.total_amount || 0)),
      borderColor: themeColor,
      backgroundColor: 'rgba(47, 49, 146, 0.12)',
      borderWidth: 3,
      pointBackgroundColor: themeColor,
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 5, pointHoverRadius: 7,
      tension: 0.35, fill: true,
    }],
  };
  const monthlyOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 10, boxHeight: 10, font: { size: 11, weight: '500' }, padding: 12 } },
      datalabels: { display: false },
      tooltip: {
        backgroundColor: 'rgba(0,0,0,0.9)', titleColor: '#fff', bodyColor: '#e5e7eb',
        borderColor: themeColor, borderWidth: 1, cornerRadius: 8, padding: 10,
        callbacks: {
          title: (items) => `${items[0].label} ${selectedYear}`,
          label: (ctx) => {
            const i = ctx.dataIndex;
            const count = monthlyData[i]?.record_count || 0;
            return [`Amount: ${formatINR(ctx.raw)}`, `Records: ${count}`];
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11, weight: '600' }, color: '#374151' } },
      y: {
        beginAtZero: true, grid: { color: '#f0f0f0', dash: [5, 5] },
        ticks: { font: { size: 10 }, callback: (v) => formatINRCompact(v) }
      },
    },
  };

  const verifiedChart = {
    labels: verifiedData.map(d => d.branch_name),
    datasets: [{
      label: 'Verified Amount',
      data: verifiedData.map(d => Number(d.total_amount || 0)),
      recordCounts: verifiedData.map(d => Number(d.record_count || 0)),
      backgroundColor: 'rgba(47, 49, 146, 0.85)',
      borderColor: themeColor,
      borderWidth: 2, borderRadius: 6,
      barPercentage: 0.7, categoryPercentage: 0.8,
    }],
  };
  const verifiedOptions = {
    responsive: true, maintainAspectRatio: false,
    layout: { padding: { top: 24 } },
    animation: {
      onComplete: function () {
        const { ctx } = this;
        const meta = this.getDatasetMeta(0);
        const counts = this.data.datasets[0].recordCounts || [];
        ctx.save();
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = themeColor;
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        meta.data.forEach((bar, i) => ctx.fillText(counts[i] ?? 0, bar.x, bar.y - 4));
        ctx.restore();
      },
    },
    plugins: {
      legend: { display: false },
      datalabels: { display: false },
      tooltip: {
        backgroundColor: 'rgba(0,0,0,0.9)', titleColor: '#fff', bodyColor: '#e5e7eb',
        borderColor: themeColor, borderWidth: 1, cornerRadius: 8, padding: 10,
        callbacks: {
          title: (items) => {
            const i = items[0].dataIndex;
            const code = verifiedData[i]?.branch_code || '';
            return `${items[0].label} (${code})`;
          },
          label: (ctx) => {
            const i = ctx.dataIndex;
            const count = verifiedData[i]?.record_count || 0;
            return [`Amount: ${formatINR(ctx.raw)}`, `Records: ${count}`];
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 10, weight: '600' }, color: '#374151', maxRotation: 45, minRotation: 35 }
      },
      y: {
        beginAtZero: true, grid: { color: '#f0f0f0', dash: [5, 5] },
        ticks: { font: { size: 10 }, callback: (v) => formatINRCompact(v) }
      },
    },
  };

  const unverifiedChart = {
    labels: unverifiedData.map(d => d.branch_name),
    datasets: [
      {
        type: 'bar', label: 'Pending Count',
        data: unverifiedData.map(d => Number(d.unverified_count || 0)),
        backgroundColor: 'rgba(245, 158, 11, 0.85)',
        borderColor: pendingColor, borderWidth: 2, borderRadius: 0,
        barPercentage: 0.7, categoryPercentage: 0.8, order: 2,
      },
      {
        type: 'line', label: 'Pending Amount',
        data: unverifiedData.map(d => Number(d.total_amount || 0)),
        borderColor: pendingDark,
        backgroundColor: 'rgba(217, 119, 6, 0.12)',
        borderWidth: 3,
        pointBackgroundColor: pendingDark, pointBorderColor: '#fff',
        pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 7,
        tension: 0.35, fill: false, yAxisID: 'y1', order: 1,
      },
    ],
  };
  const unverifiedOptions = {
    responsive: true, maintainAspectRatio: false,
    layout: { padding: { top: 24 } },
    animation: {
      onComplete: function () {
        const { ctx } = this;
        const meta = this.getDatasetMeta(0);
        const data = this.data.datasets[0].data;
        ctx.save();
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = pendingDark;
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        meta.data.forEach((bar, i) => ctx.fillText(data[i] ?? 0, bar.x, bar.y - 4));
        ctx.restore();
      },
    },
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 10, boxHeight: 10, font: { size: 11, weight: '500' }, padding: 12 } },
      datalabels: { display: false },
      tooltip: {
        backgroundColor: 'rgba(0,0,0,0.9)', titleColor: '#fff', bodyColor: '#e5e7eb',
        borderColor: pendingColor, borderWidth: 1, cornerRadius: 8, padding: 10,
        callbacks: {
          title: (items) => {
            const i = items[0].dataIndex;
            const code = unverifiedData[i]?.branch_code || '';
            return `${items[0].label} (${code})`;
          },
          label: (ctx) =>
            ctx.dataset.label === 'Pending Amount'
              ? `Amount: ${formatINR(ctx.raw)}`
              : `Pending: ${ctx.raw}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 10, weight: '600' }, color: '#374151', maxRotation: 45, minRotation: 35 }
      },
      y: {
        type: 'linear', position: 'left', beginAtZero: true,
        title: { display: true, text: 'Pending Count', font: { size: 11, weight: 'bold' }, color: pendingColor },
        grid: { color: '#f0f0f0', dash: [5, 5] },
        ticks: { font: { size: 10 }, color: pendingColor, stepSize: 1 }
      },
      y1: {
        type: 'linear', position: 'right', beginAtZero: true,
        title: { display: true, text: 'Pending Amount', font: { size: 11, weight: 'bold' }, color: pendingDark },
        grid: { drawOnChartArea: false },
        ticks: { font: { size: 10 }, color: pendingDark, callback: (v) => formatINRCompact(v) }
      },
    },
  };

  // ───── Render ─────
  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <KpiCard label="Total Verified Amount" value={formatINRCompact(kpis.total_verified_amount)} />
        <KpiCard label="Verified Records" value={(kpis.total_verified_count || 0).toLocaleString('en-IN')} />
        <KpiCard label="Pending Records" value={(kpis.total_unverified_count || 0).toLocaleString('en-IN')} />
        <KpiCard label="Pending Amount" value={formatINRCompact(unverifiedTotalAmount)} />
      </div>

      {/* Box 1 – Verified */}
      <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-lg p-5 border border-gray-100">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex-shrink-0">
            <h3 className="text-base font-bold text-gray-800">{config.titles.verified}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{config.titles.verifiedSub}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 px-2 py-1 border border-gray-200 rounded-lg bg-white">
              <span className="text-[10px] font-bold text-gray-500 uppercase">{config.dateLabel}:</span>
              <input type="date" value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1" />
              <span className="text-[10px] text-gray-400">to</span>
              <input type="date" value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1" />
            </div>
            <button onClick={() => loadVerified()}
              className="px-3 py-1.5 text-white text-xs font-semibold rounded-lg shadow-sm hover:shadow-md transition-all"
              style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>
              Apply
            </button>
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo(''); loadVerified('', ''); }}
                className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-all">
                Clear
              </button>
            )}
            <div className="rounded-lg px-3 py-1.5 bg-gray-100">
              <span className="text-xs font-semibold text-gray-700">Total: {formatINR(verifiedTotal)}</span>
            </div>
          </div>
        </div>

        <div className="h-72 w-full">
          {loadingVerified ? <ChartLoader />
            : verifiedTotal === 0 ? <ChartEmpty msg="No verified expense data for the selected period" />
              : <Bar data={verifiedChart} options={verifiedOptions} />}
        </div>
      </div>

      {/* Box 2 – Monthly */}
      <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-lg p-5 border border-gray-100">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex-shrink-0">
            <h3 className="text-base font-bold text-gray-800">{config.titles.monthly}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{config.titles.monthlySub}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 text-gray-700 bg-white cursor-pointer">
              {BRANCH_ORDER.map(c => <option key={c} value={c}>{BRANCH_MAP[c]} ({c})</option>)}
            </select>
            <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}
              className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 text-gray-700 bg-white cursor-pointer">
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <div className="rounded-lg px-3 py-1.5 bg-gray-100">
              <span className="text-xs font-semibold text-gray-700">
                {selectedYear} Total: {formatINR(monthlyTotal)}
              </span>
            </div>
          </div>
        </div>

        <div className="h-72 w-full">
          {loadingMonthly ? <ChartLoader />
            : monthlyTotal === 0 ? <ChartEmpty msg={`No verified expense for ${BRANCH_MAP[selectedBranch]} in ${selectedYear}`} />
              : <Line data={monthlyChart} options={monthlyOptions} />}
        </div>
      </div>

      {/* Box 3 – Unverified */}
      <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-lg p-5 border border-gray-100">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex-shrink-0">
            <h3 className="text-base font-bold text-gray-800">{config.titles.unverified}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{config.titles.unverifiedSub}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={loadUnverified}
              className="px-3 py-1.5 text-white text-xs font-semibold rounded-lg shadow-sm hover:shadow-md transition-all"
              style={{ background: `linear-gradient(135deg, ${pendingColor}, ${pendingDark})` }}>
              Refresh
            </button>
            <div className="rounded-lg px-3 py-1.5" style={{ backgroundColor: 'rgba(245, 158, 11, 0.12)' }}>
              <span className="text-xs font-semibold" style={{ color: pendingDark }}>
                Count: {unverifiedTotalCount.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="rounded-lg px-3 py-1.5" style={{ backgroundColor: 'rgba(217, 119, 6, 0.12)' }}>
              <span className="text-xs font-semibold" style={{ color: pendingDark }}>
                Amount: {formatINR(unverifiedTotalAmount)}
              </span>
            </div>
          </div>
        </div>

        <div className="h-80 w-full">
          {loadingUnverified ? <ChartLoader />
            : unverifiedTotalCount === 0 ? <ChartEmpty msg="No unverified records — all caught up!" />
              : <Bar data={unverifiedChart} options={unverifiedOptions} />}
        </div>
      </div>
    </div>
  );
};

// ───── Branch Picker Modal ─────
const BranchPickerModal = ({ onClose, onSelect }) => {
  const [search, setSearch] = useState('');

  const filtered = BRANCH_ORDER.filter((code) => {
    const name = BRANCH_MAP[code] || '';
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return code.toLowerCase().includes(q) || name.toLowerCase().includes(q);
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-bold text-gray-800">Select Branch</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Click a branch to open its dashboard
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-2 py-1 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700 text-base leading-none transition-all"
          >
            ✕
          </button>
        </div>

        {/* Search input */}
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <input
              type="text"
              placeholder="Search branch by name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:border-transparent"
              style={{ '--tw-ring-color': themeColor }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Branch list */}
        <div className="overflow-y-auto p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {filtered.length === 0 ? (
            <div className="col-span-full text-center text-xs text-gray-500 py-8">
              No branches match your search
            </div>
          ) : (
            filtered.map((code) => (
              <button
                key={code}
                onClick={() => onSelect(code)}
                className="text-left p-2.5 border border-gray-200 rounded-lg hover:shadow-md transition-all group"
                style={{
                  borderColor: '#e5e7eb',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = themeColor;
                  e.currentTarget.style.backgroundColor = themeShades.light;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.backgroundColor = 'white';
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-gray-800 truncate">
                      {BRANCH_MAP[code]}
                    </div>
                    <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                      {code}
                    </div>
                  </div>
                  <span
                    className="text-gray-300 group-hover:text-current font-bold text-xs"
                    style={{ color: themeColor }}
                  >
                    →
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// ───── Reusable bits ─────
const KpiCard = ({ label, value }) => (
  <div className="bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md transition-shadow text-center">
    <h3 className="text-[11px] sm:text-xs font-semibold text-black mb-1">{label}</h3>
    <p className="text-base sm:text-lg font-bold text-black">{value}</p>
  </div>
);

const ChartLoader = () => (
  <div className="h-full flex flex-col items-center justify-center">
    <div className="w-10 h-10 border-3 border-t-3 rounded-full animate-spin"
      style={{ borderColor: '#e5e7eb', borderTopColor: themeColor, borderWidth: '3px' }}></div>
    <p className="mt-3 text-sm text-gray-500">Loading chart…</p>
  </div>
);

const ChartEmpty = ({ msg }) => (
  <div className="h-full flex items-center justify-center text-xs text-gray-500">{msg}</div>
);

export default HOExpenseDash;