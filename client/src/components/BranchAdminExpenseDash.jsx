import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Bar, Line } from 'react-chartjs-2';
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

const BRANCH_MAP = {
  'HO': 'Pune Office',
  '420435_1': 'Ch.Sambhaji Nagar', '420435_2': 'Ahilyanagar',
  '420435_3': 'Beed',              '420435_4': 'Nanded',
  '420435_5': 'Babhaleshwar',      '420435_6': 'Latur',
  '420435_7': 'Parbhani',          '420435_8': 'Hubli',
  '420435_9': 'Belagavi',          '420435_10': 'Hospet',
  '420435_11': 'Ballari',          '420435_12': 'Bagalkot',
  '420435_13': 'Gulbarga',         '420435_14': 'Bijapur',
};

const themeColor = '#2f3192';
const themeShades = {
  light: 'rgba(64, 96, 147, 0.1)',
  medium: 'rgba(64, 96, 147, 0.5)',
  dark: '#335478',
};
const pendingColor = '#f59e0b';
const pendingDark  = '#d97706';

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

// ───── Configs for Office & Vendor (config-driven section) ─────
const OFFICE_CONFIG = {
  endpoints: {
    kpis:    '/branch-expense-dash/office/kpis',
    monthly: '/branch-expense-dash/office/monthly-expense',
    grouped: '/branch-expense-dash/office/by-category',
    years:   '/branch-expense-dash/office/available-years',
  },
  groupKey: 'category',                  // field name in grouped response
  dateLabel: 'Paid Date',
  titles: {
    grouped:    'Verified Office Expense by Category',
    groupedSub: (b) => `Submitted office expenses grouped by category for ${b}`,
    monthly:    'Monthly Verified Office Expense Trend',
    monthlySub: (b) => `12-month verified office spend for ${b}`,
  },
  groupedXLabel: 'Category',
};

const VENDOR_CONFIG = {
  endpoints: {
    kpis:    '/branch-expense-dash/vendor/kpis',
    monthly: '/branch-expense-dash/vendor/monthly-expense',
    grouped: '/branch-expense-dash/vendor/by-vendor',
    years:   '/branch-expense-dash/vendor/available-years',
  },
  groupKey: 'vendor_name',
  dateLabel: 'Invoice Date',
  titles: {
    grouped:    'Verified Vendor Bills by Vendor',
    groupedSub: (b) => `Submitted local vendor bills grouped by vendor for ${b}`,
    monthly:    'Monthly Verified Vendor Bills Trend',
    monthlySub: (b) => `12-month verified vendor payments for ${b}`,
  },
  groupedXLabel: 'Vendor',
};

const BranchAdminExpenseDash = ({ branchCode: propBranchCode }) => {
  const user = JSON.parse(sessionStorage.getItem('user') || '{}');
  const branchCode = propBranchCode || user?.branch || '';
  const branchName = BRANCH_MAP[branchCode] || branchCode || 'No Branch';

  const [activeTab, setActiveTab] = useState('tada');

  const getUserTypeDisplay = () => {
    if (user?.role === 'branch_admin') return 'Branch Admin';
    if (user?.role === 'employee') return 'Employee';
    return 'User';
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-full mx-auto px-3 sm:px-4">
        {/* Header */}
        <div className="mb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-black">Branch Expense Dashboard</h1>
              <span className="text-xs sm:text-sm text-black/70">
                {user?.name || 'User'} • {getUserTypeDisplay()} • {branchCode || '-'} - {branchName}
              </span>
            </div>

            <div className="flex gap-1 sm:gap-2 bg-gray-100 rounded-lg p-1">
              {[
                { id: 'tada',   label: 'TA-DA' },
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

        {/* Guard if branch missing */}
        {!branchCode && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            Your account has no branch assigned. Please contact admin.
          </div>
        )}

        {activeTab === 'tada' && branchCode && (
          <BranchTadaSection key={`tada-${branchCode}`} branchCode={branchCode} branchName={branchName} />
        )}

        {activeTab === 'office' && branchCode && (
          <BranchSimpleSection
            key={`office-${branchCode}`}
            branchCode={branchCode}
            branchName={branchName}
            config={OFFICE_CONFIG}
          />
        )}

        {activeTab === 'vendor' && branchCode && (
          <BranchSimpleSection
            key={`vendor-${branchCode}`}
            branchCode={branchCode}
            branchName={branchName}
            config={VENDOR_CONFIG}
          />
        )}
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════
   TADA Section: KPI strip + 3 charts (engineer-wise verified/unverified + monthly)
   ════════════════════════════════════════════════════════════════ */
const BranchTadaSection = ({ branchCode, branchName }) => {
  const [kpis, setKpis] = useState({
    total_verified_amount: 0, total_verified_count: 0,
    total_unverified_amount: 0, total_unverified_count: 0,
  });

  const [engVerified, setEngVerified] = useState([]);
  const [loadingEngVerified, setLoadingEngVerified] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState([new Date().getFullYear()]);
  const [monthlyData, setMonthlyData] = useState([]);
  const [loadingMonthly, setLoadingMonthly] = useState(false);

  const [engUnverified, setEngUnverified] = useState([]);
  const [loadingEngUnverified, setLoadingEngUnverified] = useState(false);

  const loadKpis = async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/branch-expense-dash/kpis`, {
        params: { branch_code: branchCode },
      });
      setKpis(data);
    } catch (e) { console.error(e); }
  };

  const loadEngVerified = async (df = dateFrom, dt = dateTo) => {
    setLoadingEngVerified(true);
    try {
      const params = { branch_code: branchCode };
      if (df) params.date_from = df;
      if (dt) params.date_to   = dt;
      const { data } = await axios.get(
        `${API_BASE_URL}/branch-expense-dash/engineers-verified`, { params }
      );
      setEngVerified(data || []);
    } catch (e) {
      console.error(e); toast.error('Failed to load engineer-wise verified data');
    } finally { setLoadingEngVerified(false); }
  };

  const loadEngUnverified = async () => {
    setLoadingEngUnverified(true);
    try {
      const { data } = await axios.get(
        `${API_BASE_URL}/branch-expense-dash/engineers-unverified`,
        { params: { branch_code: branchCode } }
      );
      setEngUnverified(data || []);
    } catch (e) {
      console.error(e); toast.error('Failed to load engineer-wise unverified data');
    } finally { setLoadingEngUnverified(false); }
  };

  const loadMonthly = async (year) => {
    setLoadingMonthly(true);
    try {
      const { data } = await axios.get(
        `${API_BASE_URL}/branch-expense-dash/monthly-expense`,
        { params: { branch_code: branchCode, year } }
      );
      setMonthlyData(data || []);
    } catch (e) {
      console.error(e); toast.error('Failed to load monthly trend');
    } finally { setLoadingMonthly(false); }
  };

  const loadYears = async () => {
    try {
      const { data } = await axios.get(
        `${API_BASE_URL}/branch-expense-dash/available-years`,
        { params: { branch_code: branchCode } }
      );
      if (data && data.length) {
        setAvailableYears(data);
        if (!data.includes(selectedYear)) setSelectedYear(data[0]);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    loadKpis(); loadEngVerified(); loadEngUnverified(); loadYears();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchCode]);

  useEffect(() => {
    loadMonthly(selectedYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchCode, selectedYear]);

  const verifiedTotalAmount = useMemo(
    () => engVerified.reduce((s, x) => s + Number(x.total_amount || 0), 0), [engVerified]);
  const verifiedTotalCount = useMemo(
    () => engVerified.reduce((s, x) => s + Number(x.record_count || 0), 0), [engVerified]);
  const unverifiedTotalCount = useMemo(
    () => engUnverified.reduce((s, x) => s + Number(x.unverified_count || 0), 0), [engUnverified]);
  const unverifiedTotalAmount = useMemo(
    () => engUnverified.reduce((s, x) => s + Number(x.total_amount || 0), 0), [engUnverified]);
  const monthlyTotal = useMemo(
    () => monthlyData.reduce((s, x) => s + Number(x.total_amount || 0), 0), [monthlyData]);

  const monthlyChart = buildMonthlyChart(monthlyData);
  const monthlyOptions = buildMonthlyOptions(monthlyData, selectedYear);

  const engVerifiedChart = {
    labels: engVerified.map(d => d.engineer_name),
    datasets: [{
      label: 'Verified Amount',
      data: engVerified.map(d => Number(d.total_amount || 0)),
      recordCounts: engVerified.map(d => Number(d.record_count || 0)),
      backgroundColor: 'rgba(47, 49, 146, 0.85)', borderColor: themeColor,
      borderWidth: 2, borderRadius: 6, barPercentage: 0.7, categoryPercentage: 0.8,
    }],
  };
  const engVerifiedOptions = buildBarOptionsWithCount(engVerified, 'engineer_uid');

  const engUnverifiedChart = {
    labels: engUnverified.map(d => d.engineer_name),
    datasets: [
      {
        type: 'bar', label: 'Pending Count',
        data: engUnverified.map(d => Number(d.unverified_count || 0)),
        backgroundColor: 'rgba(245, 158, 11, 0.85)',
        borderColor: pendingColor, borderWidth: 2, borderRadius: 0,
        barPercentage: 0.7, categoryPercentage: 0.8, order: 2,
      },
      {
        type: 'line', label: 'Pending Amount',
        data: engUnverified.map(d => Number(d.total_amount || 0)),
        borderColor: pendingDark, backgroundColor: 'rgba(217, 119, 6, 0.12)',
        borderWidth: 3, pointBackgroundColor: pendingDark, pointBorderColor: '#fff',
        pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 7,
        tension: 0.35, fill: false, yAxisID: 'y1', order: 1,
      },
    ],
  };
  const engUnverifiedOptions = buildUnverifiedOptions(engUnverified, 'engineer_uid');

  return (
    <div className="space-y-5">
      <KpiStrip kpis={kpis} />

      {/* Box 1 – Engineer-wise Verified */}
      <ChartCard
        title="Engineer-wise Verified Expense"
        subtitle={`Verified records per engineer for ${branchName}`}
        rightSlot={
          <DateRangeSlot
            label="SR Date"
            dateFrom={dateFrom} dateTo={dateTo}
            setDateFrom={setDateFrom} setDateTo={setDateTo}
            onApply={() => loadEngVerified()}
            onClear={() => { setDateFrom(''); setDateTo(''); loadEngVerified('', ''); }}
            totalChip={`${verifiedTotalCount} records • ${formatINR(verifiedTotalAmount)}`}
          />
        }
      >
        <div className="h-72 w-full">
          {loadingEngVerified ? <ChartLoader />
            : engVerified.length === 0 ? <ChartEmpty msg="No verified records for the selected period" />
            : <Bar data={engVerifiedChart} options={engVerifiedOptions} />}
        </div>
      </ChartCard>

      {/* Box 2 – Monthly Trend */}
      <ChartCard
        title="Monthly Verified Expense Trend"
        subtitle={`12-month verified spend for ${branchName}`}
        rightSlot={
          <YearSlot
            year={selectedYear} setYear={setSelectedYear}
            years={availableYears}
            totalChip={`${selectedYear} Total: ${formatINR(monthlyTotal)}`}
          />
        }
      >
        <div className="h-72 w-full">
          {loadingMonthly ? <ChartLoader />
            : monthlyTotal === 0 ? <ChartEmpty msg={`No verified expense in ${selectedYear}`} />
            : <Line data={monthlyChart} options={monthlyOptions} />}
        </div>
      </ChartCard>

      {/* Box 3 – Engineer-wise Unverified */}
      <ChartCard
        title="Engineer-wise Pending / Unverified"
        subtitle={`Records still awaiting verification for ${branchName}`}
        rightSlot={
          <RefreshSlot
            onRefresh={loadEngUnverified}
            chips={[
              { label: 'Count',  value: unverifiedTotalCount.toLocaleString('en-IN') },
              { label: 'Amount', value: formatINR(unverifiedTotalAmount) },
            ]}
          />
        }
      >
        <div className="h-80 w-full">
          {loadingEngUnverified ? <ChartLoader />
            : engUnverified.length === 0 ? <ChartEmpty msg="No unverified records — all caught up!" />
            : <Bar data={engUnverifiedChart} options={engUnverifiedOptions} />}
        </div>
      </ChartCard>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════
   Simple Section (Office & Vendor): KPIs + Box 1 grouped bar + Box 2 monthly
   ════════════════════════════════════════════════════════════════ */
const BranchSimpleSection = ({ branchCode, branchName, config }) => {
  const [kpis, setKpis] = useState({
    total_verified_amount: 0, total_verified_count: 0,
    total_unverified_amount: 0, total_unverified_count: 0,
  });

  // Box 1
  const [groupedData, setGroupedData] = useState([]);
  const [loadingGrouped, setLoadingGrouped] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Box 2
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState([new Date().getFullYear()]);
  const [monthlyData, setMonthlyData] = useState([]);
  const [loadingMonthly, setLoadingMonthly] = useState(false);

  const loadKpis = async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}${config.endpoints.kpis}`, {
        params: { branch_code: branchCode },
      });
      setKpis(data);
    } catch (e) { console.error(e); }
  };

  const loadGrouped = async (df = dateFrom, dt = dateTo) => {
    setLoadingGrouped(true);
    try {
      const params = { branch_code: branchCode };
      if (df) params.date_from = df;
      if (dt) params.date_to   = dt;
      const { data } = await axios.get(`${API_BASE_URL}${config.endpoints.grouped}`, { params });
      setGroupedData(data || []);
    } catch (e) {
      console.error(e); toast.error('Failed to load verified data');
    } finally { setLoadingGrouped(false); }
  };

  const loadMonthly = async (year) => {
    setLoadingMonthly(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}${config.endpoints.monthly}`, {
        params: { branch_code: branchCode, year },
      });
      setMonthlyData(data || []);
    } catch (e) {
      console.error(e); toast.error('Failed to load monthly trend');
    } finally { setLoadingMonthly(false); }
  };

  const loadYears = async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}${config.endpoints.years}`, {
        params: { branch_code: branchCode },
      });
      if (data && data.length) {
        setAvailableYears(data);
        if (!data.includes(selectedYear)) setSelectedYear(data[0]);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    loadKpis(); loadGrouped(); loadYears();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchCode, config]);

  useEffect(() => {
    loadMonthly(selectedYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchCode, config, selectedYear]);

  const groupedTotalAmount = useMemo(
    () => groupedData.reduce((s, x) => s + Number(x.total_amount || 0), 0), [groupedData]);
  const groupedTotalCount = useMemo(
    () => groupedData.reduce((s, x) => s + Number(x.record_count || 0), 0), [groupedData]);
  const monthlyTotal = useMemo(
    () => monthlyData.reduce((s, x) => s + Number(x.total_amount || 0), 0), [monthlyData]);

  const groupedChart = {
    labels: groupedData.map(d => d[config.groupKey]),
    datasets: [{
      label: 'Verified Amount',
      data: groupedData.map(d => Number(d.total_amount || 0)),
      recordCounts: groupedData.map(d => Number(d.record_count || 0)),
      backgroundColor: 'rgba(47, 49, 146, 0.85)', borderColor: themeColor,
      borderWidth: 2, borderRadius: 6, barPercentage: 0.7, categoryPercentage: 0.8,
    }],
  };
  const groupedOptions = buildBarOptionsWithCount(groupedData, null, config.groupKey);

  const monthlyChart = buildMonthlyChart(monthlyData);
  const monthlyOptions = buildMonthlyOptions(monthlyData, selectedYear);

  return (
    <div className="space-y-5">
      <KpiStrip kpis={kpis} />

      {/* Box 1 – Grouped verified */}
      <ChartCard
        title={config.titles.grouped}
        subtitle={config.titles.groupedSub(branchName)}
        rightSlot={
          <DateRangeSlot
            label={config.dateLabel}
            dateFrom={dateFrom} dateTo={dateTo}
            setDateFrom={setDateFrom} setDateTo={setDateTo}
            onApply={() => loadGrouped()}
            onClear={() => { setDateFrom(''); setDateTo(''); loadGrouped('', ''); }}
            totalChip={`${groupedTotalCount} records • ${formatINR(groupedTotalAmount)}`}
          />
        }
      >
        <div className="h-72 w-full">
          {loadingGrouped ? <ChartLoader />
            : groupedData.length === 0 ? <ChartEmpty msg="No verified records for the selected period" />
            : <Bar data={groupedChart} options={groupedOptions} />}
        </div>
      </ChartCard>

      {/* Box 2 – Monthly Trend */}
      <ChartCard
        title={config.titles.monthly}
        subtitle={config.titles.monthlySub(branchName)}
        rightSlot={
          <YearSlot
            year={selectedYear} setYear={setSelectedYear}
            years={availableYears}
            totalChip={`${selectedYear} Total: ${formatINR(monthlyTotal)}`}
          />
        }
      >
        <div className="h-72 w-full">
          {loadingMonthly ? <ChartLoader />
            : monthlyTotal === 0 ? <ChartEmpty msg={`No verified data in ${selectedYear}`} />
            : <Line data={monthlyChart} options={monthlyOptions} />}
        </div>
      </ChartCard>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════
   Shared chart builders
   ════════════════════════════════════════════════════════════════ */
function buildMonthlyChart(monthlyData) {
  return {
    labels: monthlyData.map(d => d.month),
    datasets: [{
      label: 'Verified Amount',
      data: monthlyData.map(d => Number(d.total_amount || 0)),
      borderColor: themeColor, backgroundColor: 'rgba(47, 49, 146, 0.12)',
      borderWidth: 3,
      pointBackgroundColor: themeColor, pointBorderColor: '#fff',
      pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 7,
      tension: 0.35, fill: true,
    }],
  };
}

function buildMonthlyOptions(monthlyData, selectedYear) {
  return {
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
      y: { beginAtZero: true, grid: { color: '#f0f0f0', dash: [5, 5] },
           ticks: { font: { size: 10 }, callback: (v) => formatINRCompact(v) } },
    },
  };
}

function buildBarOptionsWithCount(rows, uidKey = null, labelKey = null) {
  return {
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
            if (uidKey) {
              const uid = rows[i]?.[uidKey] || '';
              return uid ? `${items[0].label} (${uid})` : items[0].label;
            }
            return items[0].label;
          },
          label: (ctx) => {
            const i = ctx.dataIndex;
            const count = rows[i]?.record_count || 0;
            return [`Amount: ${formatINR(ctx.raw)}`, `Records: ${count}`];
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false },
           ticks: { font: { size: 10, weight: '600' }, color: '#374151', maxRotation: 55, minRotation: 40 } },
      y: { beginAtZero: true, grid: { color: '#f0f0f0', dash: [5, 5] },
           ticks: { font: { size: 10 }, callback: (v) => formatINRCompact(v) } },
    },
  };
}

function buildUnverifiedOptions(rows, uidKey) {
  return {
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
            const uid = rows[i]?.[uidKey] || '';
            return uid ? `${items[0].label} (${uid})` : items[0].label;
          },
          label: (ctx) =>
            ctx.dataset.label === 'Pending Amount'
              ? `Amount: ${formatINR(ctx.raw)}`
              : `Pending: ${ctx.raw}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false },
           ticks: { font: { size: 10, weight: '600' }, color: '#374151', maxRotation: 55, minRotation: 40 } },
      y:  { type: 'linear', position: 'left', beginAtZero: true,
            title: { display: true, text: 'Pending Count', font: { size: 11, weight: 'bold' }, color: pendingColor },
            grid: { color: '#f0f0f0', dash: [5, 5] },
            ticks: { font: { size: 10 }, color: pendingColor, stepSize: 1 } },
      y1: { type: 'linear', position: 'right', beginAtZero: true,
            title: { display: true, text: 'Pending Amount', font: { size: 11, weight: 'bold' }, color: pendingDark },
            grid: { drawOnChartArea: false },
            ticks: { font: { size: 10 }, color: pendingDark, callback: (v) => formatINRCompact(v) } },
    },
  };
}

/* ════════════════════════════════════════════════════════════════
   Reusable bits
   ════════════════════════════════════════════════════════════════ */
const KpiStrip = ({ kpis }) => (
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
    <KpiCard label="Verified Records"
      value={(kpis.total_verified_count || 0).toLocaleString('en-IN')} tone="theme" />
    <KpiCard label="Verified Amount"
      value={formatINRCompact(kpis.total_verified_amount)} tone="theme" />
    <KpiCard label="Pending Records"
      value={(kpis.total_unverified_count || 0).toLocaleString('en-IN')} tone="pending" />
    <KpiCard label="Pending Amount"
      value={formatINRCompact(kpis.total_unverified_amount)} tone="pending" />
  </div>
);

const KpiCard = ({ label, value, tone = 'theme' }) => {
  const colors = tone === 'pending'
    ? { bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.3)', text: pendingDark }
    : { bg: 'rgba(47, 49, 146, 0.05)', border: 'rgba(47, 49, 146, 0.2)', text: themeColor };
  return (
    <div className="rounded-lg shadow-sm p-3 border hover:shadow-md transition-shadow text-center"
      style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
      <h3 className="text-[11px] sm:text-xs font-semibold text-gray-700 mb-1">{label}</h3>
      <p className="text-base sm:text-lg font-bold" style={{ color: colors.text }}>{value}</p>
    </div>
  );
};

const ChartCard = ({ title, subtitle, rightSlot, children }) => (
  <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-lg p-5 border border-gray-100">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div className="flex-shrink-0">
        <h3 className="text-base font-bold text-gray-800">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{rightSlot}</div>
    </div>
    {children}
  </div>
);

const DateRangeSlot = ({ label, dateFrom, dateTo, setDateFrom, setDateTo, onApply, onClear, totalChip }) => (
  <>
    <div className="flex items-center gap-1 px-2 py-1 border border-gray-200 rounded-lg bg-white">
      <span className="text-[10px] font-bold text-gray-500 uppercase">{label}:</span>
      <input type="date" value={dateFrom}
        onChange={e => setDateFrom(e.target.value)}
        className="px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1" />
      <span className="text-[10px] text-gray-400">to</span>
      <input type="date" value={dateTo}
        onChange={e => setDateTo(e.target.value)}
        className="px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1" />
    </div>
    <button onClick={onApply}
      className="px-3 py-1.5 text-white text-xs font-semibold rounded-lg shadow-sm hover:shadow-md transition-all"
      style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>
      Apply
    </button>
    {(dateFrom || dateTo) && (
      <button onClick={onClear}
        className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-all">
        Clear
      </button>
    )}
    <div className="rounded-lg px-3 py-1.5 bg-gray-100">
      <span className="text-xs font-semibold text-gray-700">{totalChip}</span>
    </div>
  </>
);

const YearSlot = ({ year, setYear, years, totalChip }) => (
  <>
    <select value={year} onChange={e => setYear(parseInt(e.target.value))}
      className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 text-gray-700 bg-white cursor-pointer">
      {years.map(y => <option key={y} value={y}>{y}</option>)}
    </select>
    <div className="rounded-lg px-3 py-1.5 bg-gray-100">
      <span className="text-xs font-semibold text-gray-700">{totalChip}</span>
    </div>
  </>
);

const RefreshSlot = ({ onRefresh, chips }) => (
  <>
    <button onClick={onRefresh}
      className="px-3 py-1.5 text-white text-xs font-semibold rounded-lg shadow-sm hover:shadow-md transition-all"
      style={{ background: `linear-gradient(135deg, ${pendingColor}, ${pendingDark})` }}>
      Refresh
    </button>
    {chips.map((c, i) => (
      <div key={i} className="rounded-lg px-3 py-1.5"
        style={{ backgroundColor: i === 0 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(217, 119, 6, 0.12)' }}>
        <span className="text-xs font-semibold" style={{ color: pendingDark }}>
          {c.label}: {c.value}
        </span>
      </div>
    ))}
  </>
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

export default BranchAdminExpenseDash;