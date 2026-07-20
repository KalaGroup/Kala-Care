import React, { useState, useMemo } from 'react';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/solid';

/* ============================================================================
   Shared A–Z / Z–A column sorting for the Part Detail Info tables
   (Service Applicability, Master Data, App Mapping).

   Click a header to sort ascending, again for descending, again to drop back to
   the table's natural order. The up / down chevron pair shows which way a
   column is sorted; both stay grey when it isn't.
   ========================================================================== */

const THEME = '#2f3192';

// Numeric where both sides are numbers (KVA, counts), otherwise a natural-order
// string compare so "3H.9801" lands after "3H.8902" and "10" after "9".
export const compareValues = (a, b) => {
    const sa = String(a ?? '').trim(), sb = String(b ?? '').trim();
    const na = Number(sa), nb = Number(sb);
    if (sa !== '' && sb !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
};

// sort: null | { key, dir: 'asc' | 'desc' }
export const useSort = (initial = null) => {
    const [sort, setSort] = useState(initial);
    const toggle = (key) => setSort((s) => {
        if (!s || s.key !== key) return { key, dir: 'asc' };
        if (s.dir === 'asc') return { key, dir: 'desc' };
        return null; // third click -> natural order
    });
    return { sort, toggle, setSort };
};

// `accessors` maps a column key to a value-getter. Blanks always sort last, in
// both directions — a missing value is never "the smallest".
export const useSortedRows = (rows, sort, accessors) => useMemo(() => {
    const get = sort && accessors[sort.key];
    if (!get) return rows;
    const dir = sort.dir === 'desc' ? -1 : 1;
    return rows.slice().sort((x, y) => {
        const a = get(x), b = get(y);
        const ea = String(a ?? '').trim() === '', eb = String(b ?? '').trim() === '';
        if (ea && eb) return 0;
        if (ea) return 1;
        if (eb) return -1;
        return dir * compareValues(a, b);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, [rows, sort]);

const SortIcon = ({ active, dir }) => (
    <span className="inline-flex flex-col leading-none flex-shrink-0" style={{ gap: 1 }}>
        <ChevronUpIcon className="h-2.5 w-2.5" style={{ color: active && dir === 'asc' ? THEME : '#94a3b8' }} />
        <ChevronDownIcon className="h-2.5 w-2.5" style={{ color: active && dir === 'desc' ? THEME : '#94a3b8' }} />
    </span>
);

/* A sortable <th>. Pass the same `sort` / `onSort` from useSort to every header
   in one table. `align` positions the label + arrows within the cell. */
export const SortTh = ({ label, sortKey, sort, onSort, className = '', style, align = 'center', title, rowSpan, colSpan, wrap = false }) => {
    const active = sort?.key === sortKey;
    const dirLabel = !active ? 'A–Z' : sort.dir === 'asc' ? 'Z–A' : 'natural order';
    return (
        <th className={className} style={style} title={title} rowSpan={rowSpan} colSpan={colSpan}>
            <button type="button" onClick={() => onSort(sortKey)}
                title={`Sort by ${label} — ${dirLabel}`}
                className={`inline-flex w-full items-center gap-1 select-none transition hover:opacity-70 ${align === 'left' ? 'justify-start' : 'justify-center'}`}
                style={active ? { color: THEME } : undefined}>
                <span className={wrap ? 'whitespace-normal break-words leading-tight text-center' : 'truncate'}>{label}</span>
                <SortIcon active={active} dir={sort?.dir} />
            </button>
        </th>
    );
};

export default SortTh;
