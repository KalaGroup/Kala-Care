import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import {
    DocumentTextIcon, ArrowUpTrayIcon, ArrowDownTrayIcon, TrashIcon,
    PencilSquareIcon, EyeIcon, MagnifyingGlassIcon, ArrowPathIcon,
    DocumentPlusIcon, ArrowLeftIcon,
} from '@heroicons/react/24/outline';

// -- Theme (matches Knowledge Bank) -------------------------------
const themeColor = '#2f3192';
const themeDark = '#23255f';
const themeSoft = 'rgba(47, 49, 146, 0.10)';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;
const MAX_FILE_SIZE_MB = 25;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const prettySize = (bytes) => {
    if (bytes == null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
const prettyDate = (iso) => {
    if (!iso) return '\u2014';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '\u2014';
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

const QuotationInfoSheetMaster = () => {
    const currentUser = useMemo(() => {
        try { return JSON.parse(sessionStorage.getItem('user')) || {}; } catch { return {}; }
    }, []);
    const authHeaders = useMemo(() => ({
        'user-id': currentUser?.user_id || '',
        'user-role': currentUser?.role || '',
    }), [currentUser]);

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');

    // Upload form
    const [form, setForm] = useState({ title: '', product: '', party: '', quote_date: '', remark: '' });
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/quotation-info/`, { headers: authHeaders });
            const data = await res.json().catch(() => ({}));
            setItems(Array.isArray(data) ? data : (data.items || []));
        } catch {
            setItems([]);
        } finally { setLoading(false); }
    }, [authHeaders]);

    useEffect(() => { load(); }, [load]);

    const resetForm = () => {
        setForm({ title: '', product: '', party: '', quote_date: '', remark: '' });
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const onUpload = async () => {
        if (!form.title.trim()) { toast.error('Please enter a title'); return; }
        if (file && file.size > MAX_FILE_SIZE_BYTES) {
            toast.error(`File must be under ${MAX_FILE_SIZE_MB} MB`); return;
        }
        setUploading(true);
        const t = toast.loading('Uploading...');
        try {
            const body = new FormData();
            body.append('title', form.title.trim());
            if (form.product.trim()) body.append('product', form.product.trim());
            if (form.party.trim()) body.append('party', form.party.trim());
            if (form.quote_date) body.append('quote_date', form.quote_date);
            if (form.remark.trim()) body.append('remark', form.remark.trim());
            if (file) body.append('file', file);
            const res = await fetch(`${API_BASE_URL}/quotation-info/`, { method: 'POST', headers: authHeaders, body });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'Upload failed');
            toast.success('Saved', { id: t });
            resetForm();
            load();
        } catch (e) {
            toast.error(e.message || 'Upload failed', { id: t });
        } finally { setUploading(false); }
    };

    const onEdit = async (row) => {
        const { value } = await Swal.fire({
            title: 'Edit quotation info',
            width: 480, showCancelButton: true, focusConfirm: false,
            confirmButtonColor: themeColor, cancelButtonColor: '#9ca3af',
            confirmButtonText: 'Save', cancelButtonText: 'Cancel',
            html:
                `<input id="q-title" class="swal2-input" placeholder="Title" value="${esc(row.title)}">` +
                `<input id="q-product" class="swal2-input" placeholder="Product" value="${esc(row.product)}">` +
                `<input id="q-remark" class="swal2-input" placeholder="Remark" value="${esc(row.remark)}">`,
            preConfirm: () => {
                const title = document.getElementById('q-title').value.trim();
                if (!title) { Swal.showValidationMessage('Title is required'); return false; }
                return {
                    title,
                    product: document.getElementById('q-product').value.trim(),
                    remark: document.getElementById('q-remark').value.trim(),
                };
            },
        });
        if (!value) return;
        try {
            const body = new FormData();
            body.append('title', value.title);
            body.append('product', value.product);
            body.append('remark', value.remark);
            const res = await fetch(`${API_BASE_URL}/quotation-info/${row.id}`, { method: 'PUT', headers: authHeaders, body });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'Could not update');
            setItems((p) => p.map((x) => (x.id === row.id ? { ...x, ...value } : x)));
            toast.success('Updated');
        } catch (e) { toast.error(e.message); }
    };

    const onDelete = async (row) => {
        const r = await Swal.fire({
            icon: 'warning', title: 'Delete entry?', text: `"${row.title}" will be removed.`,
            showCancelButton: true, confirmButtonColor: '#374151', cancelButtonColor: '#9ca3af',
            confirmButtonText: 'Delete', cancelButtonText: 'Cancel',
        });
        if (!r.isConfirmed) return;
        try {
            const res = await fetch(`${API_BASE_URL}/quotation-info/${row.id}`, { method: 'DELETE', headers: authHeaders });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Could not delete');
            setItems((p) => p.filter((x) => x.id !== row.id));
            toast.success('Deleted');
        } catch (e) { toast.error(e.message); }
    };

    const viewFile = (row) => window.open(`${API_BASE_URL}/quotation-info/${row.id}/view`, '_blank');
    const downloadFile = (row) => window.open(`${API_BASE_URL}/quotation-info/${row.id}/download`, '_blank');

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return items;
        return items.filter((x) =>
            (x.title || '').toLowerCase().includes(q) ||
            (x.product || '').toLowerCase().includes(q) ||
            (x.party || '').toLowerCase().includes(q));
    }, [items, query]);

    const fieldCls = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] text-black outline-none focus:border-gray-300 focus:ring-2 focus:ring-indigo-100 transition';
    const labelCls = 'block text-[12px] font-semibold text-gray-700 mb-1';
    const actBase = 'rounded-md p-1 bg-gray-50 border border-gray-200 hover:bg-white transition';

    return (
        <div className="min-h-screen font-sans">
            <style>{`
                .qm-scroll { scrollbar-width: thin; scrollbar-color: #c7c9e0 transparent; }
                .qm-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
                .qm-scroll::-webkit-scrollbar-thumb { background: #c7c9e0; border-radius: 9999px; }
            `}</style>

            <div className="max-w-7xl mx-auto px-3 sm:px-5 pb-10">
                {/* ===== Intro box ===== */}
                <div className="rounded-2xl px-3 sm:px-5 py-3 mb-3 text-white relative overflow-hidden"
                    style={{ background: `linear-gradient(120deg, ${themeColor} 0%, ${themeDark} 100%)` }}>
                    <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
                    <div className="absolute right-16 -bottom-12 h-24 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
                    <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                            <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-white/15 backdrop-blur-sm">
                                <DocumentTextIcon className="h-5 w-5" />
                            </div>
                            <div>
                                <h1 className="text-lg sm:text-xl font-bold leading-tight">Quotation Info Sheet — Master</h1>
                                <p className="text-[11px] text-white/70 leading-tight">Upload and manage quotation information</p>
                            </div>
                        </div>
                        <div className="flex items-center flex-wrap gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium bg-white/15 text-white">
                                Entries: <b className="font-bold">{shown.length}</b>
                            </span>
                            <button onClick={() => window.close()}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 px-2.5 py-1.5 text-[12px] font-medium transition">
                                <ArrowLeftIcon className="h-3.5 w-3.5" /> Close
                            </button>
                        </div>
                    </div>
                </div>

                {/* ===== Upload card ===== */}
                <div className="rounded-2xl border border-gray-200 bg-white p-4 mb-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: themeSoft }}>
                            <DocumentPlusIcon className="h-4 w-4" style={{ color: themeColor }} />
                        </span>
                        <p className="text-sm font-semibold text-gray-800">Add quotation info</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div>
                            <label className={labelCls}>Title <span className="text-red-500">*</span></label>
                            <input className={fieldCls} value={form.title}
                                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                                placeholder="e.g. Solar Panel Quotation" />
                        </div>
                        <div>
                            <label className={labelCls}>Product</label>
                            <input className={fieldCls} value={form.product}
                                onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))}
                                placeholder="e.g. Rooftop Solar" />
                        </div>
                        <div>
                            <label className={labelCls}>Party / Client</label>
                            <input className={fieldCls} value={form.party}
                                onChange={(e) => setForm((f) => ({ ...f, party: e.target.value }))}
                                placeholder="Optional" />
                        </div>
                        <div>
                            <label className={labelCls}>Quotation date</label>
                            <input type="date" className={fieldCls} value={form.quote_date}
                                onChange={(e) => setForm((f) => ({ ...f, quote_date: e.target.value }))} />
                        </div>
                        <div className="lg:col-span-2">
                            <label className={labelCls}>Remark</label>
                            <input className={fieldCls} value={form.remark}
                                onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))}
                                placeholder="Optional note" />
                        </div>
                        <div className="sm:col-span-2 lg:col-span-3">
                            <label className={labelCls}>Attachment (PDF / image, max {MAX_FILE_SIZE_MB} MB)</label>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <input ref={fileInputRef} type="file" accept="image/*,application/pdf"
                                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                                    className="block w-full text-[12px] text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#2f3192] file:px-3 file:py-2 file:text-[12px] file:font-semibold file:text-white hover:file:opacity-90" />
                                {file && <span className="text-[11px] text-gray-500 whitespace-nowrap">{file.name} · {prettySize(file.size)}</span>}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 mt-4">
                        <button onClick={resetForm} disabled={uploading}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-50">
                            Reset
                        </button>
                        <button onClick={onUpload} disabled={uploading}
                            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                            style={{ backgroundColor: themeColor }}>
                            <ArrowUpTrayIcon className="h-4 w-4" /> {uploading ? 'Uploading...' : 'Upload'}
                        </button>
                    </div>
                </div>

                {/* ===== Search + refresh ===== */}
                <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="relative">
                        <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input value={query} onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search quotations"
                            className="w-48 sm:w-64 rounded-lg border border-gray-200 bg-white pl-8 pr-3 py-2 text-[13px] outline-none focus:border-gray-300 focus:ring-2 focus:ring-indigo-100 text-black transition" />
                    </div>
                    <button onClick={load} title="Refresh"
                        className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition">
                        <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {/* ===== Table ===== */}
                {loading ? (
                    <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-b-0 animate-pulse">
                                <div className="h-9 w-9 rounded-lg bg-gray-100 flex-shrink-0" />
                                <div className="flex-1">
                                    <div className="h-3 w-1/3 rounded bg-gray-100" />
                                    <div className="mt-1.5 h-2.5 w-1/5 rounded bg-gray-100" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : shown.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-20 text-center">
                        <div className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: themeSoft }}>
                            <DocumentTextIcon className="h-7 w-7" style={{ color: themeColor }} />
                        </div>
                        <p className="mt-3 text-sm font-semibold text-gray-700">No quotation info yet</p>
                        <p className="mt-1 text-[12px] text-gray-400">Use the form above to add the first entry.</p>
                    </div>
                ) : (
                    <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto qm-scroll shadow-sm">
                        <div className="min-w-[860px] divide-y divide-gray-200">
                            <div className="grid grid-cols-12 divide-x divide-gray-200 bg-gray-50 text-[10px] sm:text-[11px] font-semibold text-black uppercase tracking-wider">
                                <div className="col-span-1 px-3 py-1.5 text-center">Sr.</div>
                                <div className="col-span-3 px-3 py-1.5 text-center">Title</div>
                                <div className="col-span-2 px-3 py-1.5 text-center">Product</div>
                                <div className="col-span-2 px-3 py-1.5 text-center">Party</div>
                                <div className="col-span-1 px-3 py-1.5 text-center">Date</div>
                                <div className="col-span-3 px-3 py-1.5 text-center">Actions</div>
                            </div>
                            {shown.map((row, i) => (
                                <div key={row.id ?? i} className="grid grid-cols-12 divide-x divide-gray-200 text-[11px] sm:text-xs items-stretch hover:bg-indigo-50/40 transition">
                                    <div className="col-span-1 px-3 py-2 flex items-center justify-center text-gray-500">{i + 1}</div>
                                    <div className="col-span-3 px-3 py-2 flex items-center min-w-0">
                                        <span className="font-semibold truncate text-gray-800" title={row.title}>{row.title || '—'}</span>
                                    </div>
                                    <div className="col-span-2 px-3 py-2 flex items-center justify-center text-gray-600 truncate" title={row.product || ''}>{row.product || '—'}</div>
                                    <div className="col-span-2 px-3 py-2 flex items-center justify-center text-gray-600 truncate" title={row.party || ''}>{row.party || '—'}</div>
                                    <div className="col-span-1 px-3 py-2 flex items-center justify-center text-gray-500 whitespace-nowrap">{prettyDate(row.quote_date || row.created_at)}</div>
                                    <div className="col-span-3 px-3 py-2 flex items-center justify-center gap-1 flex-wrap">
                                        <button onClick={() => viewFile(row)} className={`${actBase} text-blue-600 hover:bg-blue-50`} title="View"><EyeIcon className="h-3.5 w-3.5" /></button>
                                        <button onClick={() => downloadFile(row)} className={`${actBase} text-emerald-600 hover:bg-emerald-50`} title="Download"><ArrowDownTrayIcon className="h-3.5 w-3.5" /></button>
                                        <button onClick={() => onEdit(row)} className={`${actBase} text-blue-600 hover:bg-blue-50`} title="Edit"><PencilSquareIcon className="h-3.5 w-3.5" /></button>
                                        <button onClick={() => onDelete(row)} className={`${actBase} text-red-600 hover:bg-gray-100`} title="Delete"><TrashIcon className="h-3.5 w-3.5" /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default QuotationInfoSheetMaster;