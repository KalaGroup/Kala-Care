/* MOM Reports charts — split out of MOMTracking.jsx so the heavy recharts
   vendor chunk (~376 KB) loads ONLY when the Reports tab actually renders,
   not on the initial MOM page load. Pure presentational: every chart takes
   its precomputed data array from the ReportsView `d` memo unchanged. */
import {
    ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

const BRAND = '#2f3192';
const TIP_PROPS = {
    contentStyle: { fontSize: 11, padding: '5px 8px', borderRadius: 8, lineHeight: 1.4 },
    itemStyle: { fontSize: 11, padding: '1px 0' },
    labelStyle: { fontSize: 11, fontWeight: 600 },
};

const StatusPie = ({ data }) => (
    <ResponsiveContainer width="100%" height={230}>
        <PieChart><Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={2}>{data.map((e) => <Cell key={e.name} fill={e.color} />)}</Pie><Tooltip {...TIP_PROPS} /><Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} /></PieChart>
    </ResponsiveContainer>
);

const CompletionBar = ({ data }) => (
    <ResponsiveContainer width="100%" height={230}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
            <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 9 }} />
            <Tooltip {...TIP_PROPS} formatter={(v) => `${v}%`} /><Bar dataKey="completion" radius={[0, 4, 4, 0]} fill={BRAND} />
        </BarChart>
    </ResponsiveContainer>
);

const CategoryBar = ({ data }) => (
    <ResponsiveContainer width="100%" height={210}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="name" width={78} tick={{ fontSize: 9 }} />
            <Tooltip {...TIP_PROPS} /><Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="done" name="Completed" stackId="a" fill="#059669" />
            <Bar dataKey="open" name="Open" stackId="a" fill="#d97706" radius={[0, 4, 4, 0]} />
        </BarChart>
    </ResponsiveContainer>
);

const TrendBar = ({ data }) => (
    <ResponsiveContainer width="100%" height={210}>
        <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip {...TIP_PROPS} /><Bar dataKey="meetings" name="Meetings" fill={BRAND} radius={[4, 4, 0, 0]} />
        </BarChart>
    </ResponsiveContainer>
);

const AgingBar = ({ data }) => (
    <ResponsiveContainer width="100%" height={210}>
        <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip {...TIP_PROPS} /><Bar dataKey="v" name="Overdue tasks" fill="#f87171" radius={[4, 4, 0, 0]} />
        </BarChart>
    </ResponsiveContainer>
);

const CHARTS = { statusPie: StatusPie, completionBar: CompletionBar, categoryBar: CategoryBar, trendBar: TrendBar, agingBar: AgingBar };

export default function MomChart({ kind, data }) {
    const C = CHARTS[kind];
    return C ? <C data={data} /> : null;
}
