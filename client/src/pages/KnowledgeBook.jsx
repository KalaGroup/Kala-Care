import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import {
    FolderIcon, FolderPlusIcon, ArrowUpTrayIcon, ChevronRightIcon, HomeIcon,
    DocumentTextIcon, PhotoIcon, VideoCameraIcon, DocumentIcon, ArrowDownTrayIcon,
    TrashIcon, XMarkIcon, PencilSquareIcon, EyeIcon, EyeSlashIcon, MagnifyingGlassIcon,
    ArrowLeftIcon, Squares2X2Icon, ListBulletIcon, ArrowPathIcon, BookOpenIcon,
    TagIcon, PlusIcon, CubeIcon, RectangleStackIcon,
} from '@heroicons/react/24/outline';

// -- Theme --------------------------------------------------------
const themeColor = '#2f3192';
const themeDark = '#23255f';
const themeSoft = 'rgba(47, 49, 146, 0.10)';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;
const MAX_FILE_SIZE_MB = 25;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const KIND_META = {
    image: { Icon: PhotoIcon, tint: '#2563eb', soft: 'rgba(37,99,235,0.10)', label: 'Image' },
    video: { Icon: VideoCameraIcon, tint: '#7c3aed', soft: 'rgba(124,58,237,0.10)', label: 'Video' },
    pdf: { Icon: DocumentTextIcon, tint: '#dc2626', soft: 'rgba(220,38,38,0.10)', label: 'PDF' },
    other: { Icon: DocumentIcon, tint: '#6b7280', soft: 'rgba(107,114,128,0.10)', label: 'File' },
};

// Action icon colours — RED is used ONLY for the delete icon glyph.
const ACT = {
    download: 'text-emerald-600 hover:bg-emerald-50',
    edit: 'text-blue-600 hover:bg-blue-50',
    hide: 'text-amber-600 hover:bg-amber-50',
    del: 'text-red-600 hover:bg-gray-100',
};
const actBase = 'rounded-md p-1 bg-gray-50 border border-gray-200 hover:bg-white transition';

// ---- Local kind detection (mirrors backend, for instant updates) ----
const IMG = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
const VID = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
const kindFromName = (name) => {
    const ext = (String(name).split('.').pop() || '').toLowerCase();
    if (IMG.includes(ext)) return 'image';
    if (VID.includes(ext)) return 'video';
    if (ext === 'pdf') return 'pdf';
    return 'other';
};

// ---- Swal helpers (no red anywhere) ----
const swalForm = (opts) => Swal.fire({
    width: 480, showCancelButton: true, focusConfirm: false,
    confirmButtonColor: themeColor, cancelButtonColor: '#9ca3af',
    cancelButtonText: 'Cancel', ...opts,
});
const swalConfirmDelete = (opts) => Swal.fire({
    icon: 'warning', showCancelButton: true,
    confirmButtonColor: '#374151', cancelButtonColor: '#9ca3af',
    confirmButtonText: 'Delete', cancelButtonText: 'Cancel', ...opts,
});
const fLabel = (t) => `<label style="display:block;text-align:left;font-size:12px;font-weight:600;color:#374151;margin:14px 2px 5px">${t}</label>`;
const fHint = (t) => `<p style="text-align:left;font-size:12.5px;line-height:1.45;color:#6b7280;margin:0 2px 6px">${t}</p>`;
const fStyle = 'margin:0;width:100%;box-sizing:border-box';

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
const prettyDateShort = (iso) => {
    if (!iso) return '\u2014';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '\u2014';
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
};
const folderSummaryText = (f) => {
    const parts = [];
    if (f.folder_count) parts.push(`${f.folder_count} folder${f.folder_count > 1 ? 's' : ''}`);
    if (f.file_count) parts.push(`${f.file_count} file${f.file_count > 1 ? 's' : ''}`);
    return parts.join(' \u00b7 ') || 'Empty';
};

const FolderYellow = ({ className, style }) => (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2.5 6.2c0-1 .8-1.7 1.7-1.7h4.8c.5 0 1 .2 1.3.6l1.1 1.3h8.4c1 0 1.7.8 1.7 1.7v9.4c0 1-.8 1.7-1.7 1.7H4.2c-1 0-1.7-.8-1.7-1.7V6.2Z" fill="#E0A50C" />
        <path d="M2.5 9.3h19v8.3c0 1-.8 1.7-1.7 1.7H4.2c-1 0-1.7-.8-1.7-1.7V9.3Z" fill="#F6C23E" />
    </svg>
);

const KnowledgeBook = () => {
    const currentUser = useMemo(() => {
        try { return JSON.parse(sessionStorage.getItem('user')) || {}; } catch { return {}; }
    }, []);
    const isAdmin = currentUser?.role === 'master_admin';

    const authHeaders = useMemo(() => ({
        'user-id': currentUser?.user_id || '',
        'user-role': currentUser?.role || '',
    }), [currentUser]);

    const [mode, setMode] = useState('browse'); // 'browse' | 'all'
    const [path, setPath] = useState([]);        // [] = Home; path[0] = active tab
    const currentId = path.length ? path[path.length - 1].id : null;
    const atRoot = path.length === 0;
    const activeTab = mode === 'all' ? 'all' : (path.length ? path[0].id : 'home');

    const [topFolders, setTopFolders] = useState([]);
    const [folders, setFolders] = useState([]);
    const [files, setFiles] = useState([]);
    const [allFilesData, setAllFilesData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [view, setView] = useState('grid');
    const [preview, setPreview] = useState(null);

    const [categories, setCategories] = useState([]);
    const [catFilter, setCatFilter] = useState('');
    const [showCatModal, setShowCatModal] = useState(false);
    const [newCat, setNewCat] = useState('');
    const [products, setProducts] = useState([]);

    const fileInputRef = useRef(null);

    const [hidingKeys, setHidingKeys] = useState(() => new Set());
    const setHiding = (key, on) => setHidingKeys((prev) => {
        const next = new Set(prev);
        if (on) next.add(key); else next.delete(key);
        return next;
    });

    // ---- Local state patch helpers (avoid refetch on edit/delete/hide) ----
    const patchFolder = useCallback((id, changes) => {
        setFolders((p) => p.map((f) => (f.id === id ? { ...f, ...changes } : f)));
        setTopFolders((p) => p.map((f) => (f.id === id ? { ...f, ...changes } : f)));
    }, []);
    const dropFolder = useCallback((id) => {
        setFolders((p) => p.filter((f) => f.id !== id));
        setTopFolders((p) => p.filter((f) => f.id !== id));
    }, []);
    const patchFileLocal = useCallback((id, changes) => {
        setFiles((p) => p.map((f) => (f.id === id ? { ...f, ...changes } : f)));
        setAllFilesData((p) => p.map((f) => (f.id === id ? { ...f, ...changes } : f)));
    }, []);
    const dropFileLocal = useCallback((id) => {
        setFiles((p) => p.filter((f) => f.id !== id));
        setAllFilesData((p) => p.filter((f) => f.id !== id));
    }, []);

    // ---- Loaders ----
    const loadTopFolders = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/knowledge-book/folders`, { headers: authHeaders });
            const data = await res.json().catch(() => ({}));
            if (res.ok) setTopFolders(data.folders || []);
        } catch { /* ignore */ }
    }, [authHeaders]);

    const loadFolder = useCallback(async (parentId) => {
        setLoading(true);
        try {
            const qs = parentId != null ? `?parent_id=${parentId}` : '';
            const res = await fetch(`${API_BASE_URL}/knowledge-book/folders${qs}`, { headers: authHeaders });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Failed to load');
            const data = await res.json();
            setFolders(data.folders || []);
            setFiles(data.files || []);
        } catch (e) {
            toast.error(e.message || 'Could not load this folder');
            setFolders([]); setFiles([]);
        } finally { setLoading(false); }
    }, [authHeaders]);

    const loadAllFiles = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/knowledge-book/files/all`, { headers: authHeaders });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Failed to load');
            const data = await res.json();
            setAllFilesData(data.files || []);
        } catch (e) {
            toast.error(e.message || 'Could not load files');
            setAllFilesData([]);
        } finally { setLoading(false); }
    }, [authHeaders]);

    const loadCategories = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/knowledge-book/categories`, { headers: authHeaders });
            const data = await res.json().catch(() => ({}));
            if (res.ok) setCategories(data.categories || []);
        } catch { /* ignore */ }
    }, [authHeaders]);

    useEffect(() => { if (mode !== 'all') loadFolder(currentId); }, [currentId, mode, loadFolder]);
    useEffect(() => { loadTopFolders(); loadCategories(); }, [loadTopFolders, loadCategories]);

    const refresh = () => {
        loadTopFolders();
        if (mode === 'all') loadAllFiles(); else loadFolder(currentId);
    };

    // ---- Navigation ----
    const goHome = () => { setMode('browse'); setPath([]); setQuery(''); setCatFilter(''); };
    const openTab = (f) => { setMode('browse'); setPath([{ id: f.id, name: f.name }]); setQuery(''); setCatFilter(''); };
    const openFolder = (f) => { setMode('browse'); setPath((p) => [...p, { id: f.id, name: f.name }]); setQuery(''); };
    const goUp = () => { setMode('browse'); setPath((p) => p.slice(0, -1)); setQuery(''); };
    const goToCrumb = (i) => { setMode('browse'); setPath((p) => p.slice(0, i)); setQuery(''); };
    const openAllFiles = () => { setMode('all'); setPath([]); setQuery(''); setCatFilter(''); loadAllFiles(); };

    const sectionFolders = useMemo(() => {
        const sys = topFolders.filter((f) => f.is_system);
        if (sys.length) return sys;
        return topFolders.filter((f) => ['sales', 'service'].includes((f.name || '').toLowerCase()));
    }, [topFolders]);

    // ---- Search + category filter (filter only active in All Files) ----
    const q = query.toLowerCase();
    const effCat = mode === 'all' ? catFilter : '';
    const baseFiles = mode === 'all' ? allFilesData : files;
    const shownFiles = baseFiles
        .filter((f) => f.name.toLowerCase().includes(q))
        .filter((f) => !effCat || String(f.category_id) === String(effCat));
    const shownFolders = mode === 'all' ? [] : folders.filter((f) => f.name.toLowerCase().includes(q));

    const fileTitle = (file) => [
        file.name,
        mode === 'all' && file.folder_path ? `Location: ${file.folder_path}` : '',
        file.description ? `Note: ${file.description}` : '',
    ].filter(Boolean).join('\n');

    // ---- Folder actions ----
    const createFolder = async (asTopLevel = false) => {
        const parentId = asTopLevel ? null : currentId;
        const isTop = parentId == null;
        const { value } = await swalForm({
            title: isTop ? 'New section (tab)' : 'New folder',
            html:
                fHint(isTop ? 'Creates a top-level section shown as a tab at the top.' : 'Creates a folder inside the current one.') +
                fLabel('Folder name') +
                `<input id="kb-name" class="swal2-input" style="${fStyle}" placeholder="e.g. Brochures">` +
                fLabel('Description (optional)') +
                `<textarea id="kb-desc" class="swal2-textarea" style="${fStyle}" placeholder="What goes in this folder?"></textarea>`,
            confirmButtonText: 'Create',
            preConfirm: () => {
                const name = document.getElementById('kb-name').value.trim();
                const description = document.getElementById('kb-desc').value.trim();
                if (!name) { Swal.showValidationMessage('Please enter a name'); return false; }
                return { name, description };
            },
        });
        if (!value) return;
        try {
            const body = new FormData();
            body.append('name', value.name);
            if (value.description) body.append('description', value.description);
            if (parentId != null) body.append('parent_id', parentId);
            const res = await fetch(`${API_BASE_URL}/knowledge-book/folders`, { method: 'POST', headers: authHeaders, body });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'Could not create folder');
            const dto = {
                id: data.folder?.id, name: data.folder?.name || value.name,
                description: value.description || null, is_hidden: false, is_system: false,
                folder_count: 0, file_count: 0, modified_at: new Date().toISOString(),
            };
            if (parentId == null) setTopFolders((p) => [...p, dto]);
            if (parentId === currentId && mode === 'browse') setFolders((p) => [...p, dto]);
            toast.success('Folder created');
        } catch (e) { toast.error(e.message); }
    };

    const createProductFolders = async () => {
        let list = products;
        if (!list.length) {
            try {
                const res = await fetch(`${API_BASE_URL}/knowledge-book/products`, { headers: authHeaders });
                const data = await res.json().catch(() => ({}));
                list = data.products || [];
                setProducts(list);
            } catch { /* ignore */ }
        }
        if (!sectionFolders.length) { toast.error('Sales/Service not ready yet'); return; }
        if (!list.length) { toast.error('No products found in the product list'); return; }

        const sectionOpts = sectionFolders.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
        const checks = list.map((p) =>
            `<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid #f1f5f9">
               <input type="checkbox" class="kb-prod" value="${esc(p)}"> <span style="font-size:13px">${esc(p)}</span>
             </label>`).join('');

        const { value } = await swalForm({
            title: 'Add product folders', width: 520,
            html:
                `<div style="max-height:62vh;overflow-y:auto;padding:0 6px 2px 2px">` +
                fHint('Pick the products to create folders for, choose which section to put them in, and add an optional shared description.') +
                fLabel('Add to section') +
                `<select id="kb-section" class="swal2-select" style="${fStyle};border:1px solid #d1d5db;border-radius:8px">${sectionOpts}</select>` +
                fLabel('Select products') +
                `<div style="max-height:220px;overflow:auto;border:1px solid #e5e7eb;border-radius:8px;text-align:left">${checks}</div>` +
                fLabel('Description (applied to each folder)') +
                `<textarea id="kb-pdesc" class="swal2-textarea" style="${fStyle}" placeholder="Optional"></textarea>` +
                `</div>`,
            confirmButtonText: 'Create folders',
            preConfirm: () => {
                const picked = Array.from(document.querySelectorAll('.kb-prod:checked')).map((el) => el.value);
                const parent_id = document.getElementById('kb-section').value;
                const description = document.getElementById('kb-pdesc').value.trim();
                if (!picked.length) { Swal.showValidationMessage('Pick at least one product'); return false; }
                return { picked, parent_id, description };
            },
        });
        if (!value) return;
        try {
            const body = new FormData();
            value.picked.forEach((p) => body.append('products', p));
            body.append('parent_id', value.parent_id);
            if (value.description) body.append('description', value.description);
            const res = await fetch(`${API_BASE_URL}/knowledge-book/folders/products`, { method: 'POST', headers: authHeaders, body });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'Could not create folders');
            const desc = value.description || null;
            const newDtos = (data.created || []).map((c) => ({
                id: c.id, name: c.name, description: desc, is_hidden: false, is_system: false,
                folder_count: 0, file_count: 0, modified_at: new Date().toISOString(),
            }));
            if (String(value.parent_id) === String(currentId) && mode === 'browse' && newDtos.length) {
                setFolders((p) => [...p, ...newDtos]);
            }
            toast.success(`${newDtos.length} folder(s) created`);
        } catch (e) { toast.error(e.message); }
    };

    const editFolder = async (f) => {
        const { value } = await swalForm({
            title: 'Edit folder',
            html:
                fHint('Update the folder name and description.') +
                fLabel('Folder name') +
                `<input id="kb-name" class="swal2-input" style="${fStyle}" value="${esc(f.name)}">` +
                fLabel('Description (optional)') +
                `<textarea id="kb-desc" class="swal2-textarea" style="${fStyle}">${esc(f.description || '')}</textarea>`,
            confirmButtonText: 'Save',
            preConfirm: () => {
                const name = document.getElementById('kb-name').value.trim();
                const description = document.getElementById('kb-desc').value.trim();
                if (!name) { Swal.showValidationMessage('Please enter a name'); return false; }
                return { name, description };
            },
        });
        if (!value) return;
        try {
            const body = new FormData();
            body.append('name', value.name);
            body.append('description', value.description);
            const res = await fetch(`${API_BASE_URL}/knowledge-book/folders/${f.id}`, { method: 'PUT', headers: authHeaders, body });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'Could not update folder');
            patchFolder(f.id, { name: value.name, description: value.description || null });
            toast.success('Folder updated');
        } catch (e) { toast.error(e.message); }
    };

    const toggleHideFolder = async (f) => {
        const key = `folder:${f.id}`;
        setHiding(key, true);
        try {
            const res = await fetch(`${API_BASE_URL}/knowledge-book/folders/${f.id}/hide`, { method: 'PATCH', headers: authHeaders });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'Could not update folder');
            patchFolder(f.id, { is_hidden: !f.is_hidden });
        } catch (e) { toast.error(e.message); }
        finally { setHiding(key, false); }
    };

    const removeFolder = async (f) => {
        const r = await swalConfirmDelete({ title: 'Delete folder?', text: `"${f.name}" and everything inside it will be removed.` });
        if (!r.isConfirmed) return;
        try {
            const res = await fetch(`${API_BASE_URL}/knowledge-book/folders/${f.id}`, { method: 'DELETE', headers: authHeaders });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'Could not delete folder');
            dropFolder(f.id);
            toast.success('Deleted');
        } catch (e) { toast.error(e.message); }
    };

    const downloadFolder = async (folder) => {
        const t = toast.loading('Preparing download...');
        try {
            const res = await fetch(`${API_BASE_URL}/knowledge-book/folders/${folder.id}/download`, { headers: authHeaders });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Could not download folder');
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `${folder.name}.zip`;
            document.body.appendChild(a); a.click(); a.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Download ready', { id: t });
        } catch (e) { toast.error(e.message || 'Download failed', { id: t }); }
    };

    // ---- File upload (ask category + description) ----
    const askFileMeta = async (count) => {
        const opts = categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
        const { value } = await swalForm({
            title: 'File details',
            html:
                fHint(`These details apply to the ${count} selected file(s). Category comes from your master list.`) +
                fLabel('Category') +
                `<select id="kb-cat" class="swal2-select" style="${fStyle}"><option value="">— Select category —</option>${opts}</select>` +
                fLabel('Description (optional)') +
                `<textarea id="kb-fdesc" class="swal2-textarea" style="${fStyle}" placeholder="Short note about these files"></textarea>`,
            confirmButtonText: 'Upload',
            preConfirm: () => {
                const category_id = document.getElementById('kb-cat').value;
                const description = document.getElementById('kb-fdesc').value.trim();
                if (categories.length && !category_id) { Swal.showValidationMessage('Please choose a category'); return false; }
                return { category_id, description };
            },
        });
        return value || null;
    };

    const onPickFiles = async (e) => {
        const picked = Array.from(e.target.files || []);
        e.target.value = '';
        if (picked.length === 0 || currentId == null) return;

        const tooBig = picked.filter((f) => f.size > MAX_FILE_SIZE_BYTES);
        if (tooBig.length) {
            const names = tooBig.map((f) => `${f.name} (${prettySize(f.size)})`).join('<br/>');
            await Swal.fire({
                icon: 'warning', title: 'File too large', confirmButtonColor: themeColor,
                html: `You cannot upload files larger than <b>${MAX_FILE_SIZE_MB} MB</b>.<br/><br/>` +
                    `<span style="font-size:12px">Skipped:<br/>${names}</span>`,
            });
        }
        const allowed = picked.filter((f) => f.size <= MAX_FILE_SIZE_BYTES);
        if (!allowed.length) return;

        const meta = await askFileMeta(allowed.length);
        if (meta === null) return;

        const t = toast.loading(`Uploading ${allowed.length} file(s)...`);
        try {
            const body = new FormData();
            body.append('folder_id', currentId);
            allowed.forEach((f) => body.append('files', f));
            if (meta.category_id) body.append('category_id', meta.category_id);
            if (meta.description) body.append('description', meta.description);
            const res = await fetch(`${API_BASE_URL}/knowledge-book/files`, { method: 'POST', headers: authHeaders, body });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'Upload failed');
            const catName = meta.category_id ? (categories.find((c) => String(c.id) === String(meta.category_id))?.name || null) : null;
            const loc = path.map((p) => p.name).join(' / ');
            const newFiles = (data.files || []).map((f) => ({
                id: f.id, name: f.name, kind: f.kind, size_bytes: f.size_bytes,
                description: meta.description || null,
                category_id: meta.category_id ? Number(meta.category_id) : null,
                category: catName, is_hidden: false, folder_id: currentId, folder_path: loc,
                url: `/api/knowledge-book/files/${f.id}/view`, modified_at: new Date().toISOString(),
            }));
            setFiles((p) => [...p, ...newFiles]);
            toast.success(`${newFiles.length} file(s) uploaded`, { id: t });
        } catch (err) { toast.error(err.message, { id: t }); }
    };

    // ---- File actions ----
    const editFile = async (file) => {
        const opts = categories.map((c) =>
            `<option value="${c.id}" ${String(c.id) === String(file.category_id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
        const { value } = await swalForm({
            title: 'Edit file',
            html:
                fHint('Rename the file, change its category, or update the description.') +
                fLabel('File name') +
                `<input id="kb-name" class="swal2-input" style="${fStyle}" value="${esc(file.name)}">` +
                fLabel('Category') +
                `<select id="kb-cat" class="swal2-select" style="${fStyle}"><option value="">— No category —</option>${opts}</select>` +
                fLabel('Description (optional)') +
                `<textarea id="kb-desc" class="swal2-textarea" style="${fStyle}">${esc(file.description || '')}</textarea>`,
            confirmButtonText: 'Save',
            preConfirm: () => {
                const name = document.getElementById('kb-name').value.trim();
                const category_id = document.getElementById('kb-cat').value;
                const description = document.getElementById('kb-desc').value.trim();
                if (!name) { Swal.showValidationMessage('Please enter a name'); return false; }
                return { name, category_id, description };
            },
        });
        if (!value) return;
        try {
            const body = new FormData();
            body.append('name', value.name);
            body.append('description', value.description);
            if (value.category_id) body.append('category_id', value.category_id);
            const res = await fetch(`${API_BASE_URL}/knowledge-book/files/${file.id}`, { method: 'PUT', headers: authHeaders, body });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'Could not update file');

            const ext = value.name.includes('.') ? value.name.split('.').pop().toLowerCase() : '';
            const catName = value.category_id ? (categories.find((c) => String(c.id) === String(value.category_id))?.name || null) : null;
            const changes = {
                name: value.name,
                description: value.description || null,
                category_id: value.category_id ? Number(value.category_id) : null,
                category: catName,
                kind: ext ? kindFromName(value.name) : file.kind,
            };
            setFiles((p) => p.map((f) => (f.id === file.id ? { ...f, ...changes } : f)));
            // All Files only holds categorised files: remove if category cleared.
            setAllFilesData((p) => (value.category_id
                ? p.map((f) => (f.id === file.id ? { ...f, ...changes } : f))
                : p.filter((f) => f.id !== file.id)));
            if (preview && preview.id === file.id) setPreview((pr) => ({ ...pr, ...changes }));
            toast.success('File updated');
        } catch (e) { toast.error(e.message); }
    };

    const toggleHideFile = async (file) => {
        const key = `file:${file.id}`;
        setHiding(key, true);
        try {
            const res = await fetch(`${API_BASE_URL}/knowledge-book/files/${file.id}/hide`, { method: 'PATCH', headers: authHeaders });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'Could not update file');
            patchFileLocal(file.id, { is_hidden: !file.is_hidden });
        } catch (e) { toast.error(e.message); }
        finally { setHiding(key, false); }
    };

    const removeFile = async (file) => {
        const r = await swalConfirmDelete({ title: 'Delete file?', text: `"${file.name}" will be removed.` });
        if (!r.isConfirmed) return;
        try {
            const res = await fetch(`${API_BASE_URL}/knowledge-book/files/${file.id}`, { method: 'DELETE', headers: authHeaders });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'Could not delete file');
            dropFileLocal(file.id);
            if (preview && preview.id === file.id) setPreview(null);
            toast.success('Deleted');
        } catch (e) { toast.error(e.message); }
    };

    const downloadFile = (file) => window.open(`${API_BASE_URL}/knowledge-book/files/${file.id}/download`, '_blank');
    const mediaUrl = (file) => `${API_BASE_URL}/knowledge-book/files/${file.id}/view`;

    const hideIcon = (key, hidden) =>
        hidingKeys.has(key)
            ? <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
            : (hidden ? <EyeSlashIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />);

    // ---- Category management ----
    const addCategory = async () => {
        const name = newCat.trim();
        if (!name) return;
        try {
            const body = new FormData(); body.append('name', name);
            const res = await fetch(`${API_BASE_URL}/knowledge-book/categories`, { method: 'POST', headers: authHeaders, body });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'Could not add category');
            if (data.category) setCategories((p) => [...p, data.category].sort((a, b) => a.name.localeCompare(b.name)));
            setNewCat('');
        } catch (e) { toast.error(e.message); }
    };
    const renameCategory = async (c) => {
        const { value } = await swalForm({
            title: 'Rename category',
            html: fLabel('Category name') + `<input id="kb-cn" class="swal2-input" style="${fStyle}" value="${esc(c.name)}">`,
            confirmButtonText: 'Save',
            preConfirm: () => {
                const name = document.getElementById('kb-cn').value.trim();
                if (!name) { Swal.showValidationMessage('Please enter a name'); return false; }
                return { name };
            },
        });
        if (!value) return;
        try {
            const body = new FormData(); body.append('name', value.name);
            const res = await fetch(`${API_BASE_URL}/knowledge-book/categories/${c.id}`, { method: 'PUT', headers: authHeaders, body });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'Could not rename category');
            setCategories((p) => p.map((x) => (x.id === c.id ? { ...x, name: value.name } : x)));
            patchFileLocal(null, {}); // no-op safeguard
            setFiles((p) => p.map((f) => (f.category_id === c.id ? { ...f, category: value.name } : f)));
            setAllFilesData((p) => p.map((f) => (f.category_id === c.id ? { ...f, category: value.name } : f)));
        } catch (e) { toast.error(e.message); }
    };
    const deleteCategory = async (c) => {
        const r = await swalConfirmDelete({ title: 'Delete category?', text: `"${c.name}" will be removed and unlinked from its files.` });
        if (!r.isConfirmed) return;
        try {
            const res = await fetch(`${API_BASE_URL}/knowledge-book/categories/${c.id}`, { method: 'DELETE', headers: authHeaders });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'Could not delete category');
            setCategories((p) => p.filter((x) => x.id !== c.id));
            if (String(catFilter) === String(c.id)) setCatFilter('');
            setFiles((p) => p.map((f) => (f.category_id === c.id ? { ...f, category_id: null, category: null } : f)));
            setAllFilesData((p) => p.filter((f) => f.category_id !== c.id));
        } catch (e) { toast.error(e.message); }
    };

    const trail = useMemo(() => {
        if (mode === 'all') return [{ id: 'root', name: 'Home' }, { id: 'all', name: 'All Files' }];
        return [{ id: 'root', name: 'Home' }, ...path];
    }, [path, mode]);
    const isEmpty = shownFolders.length === 0 && shownFiles.length === 0;
    const pillBase = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium';

    return (
        <div className="min-h-screen font-sans">
            {/* Thin, rounded scrollbars */}
            <style>{`
                .kb-scroll { scrollbar-width: thin; scrollbar-color: #c7c9e0 transparent; }
                .kb-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
                .kb-scroll::-webkit-scrollbar-track { background: transparent; }
                .kb-scroll::-webkit-scrollbar-thumb { background: #c7c9e0; border-radius: 9999px; }
                .kb-scroll::-webkit-scrollbar-thumb:hover { background: #a9abce; }
            `}</style>

            <div className="max-w-7xl mx-auto px-3 sm:px-5 pb-10">

                {/* ===== Hero header ===== */}
                <div className="rounded-2xl px-3 sm:px-5 py-3 mb-3 text-white relative overflow-hidden"
                    style={{ background: `linear-gradient(120deg, ${themeColor} 0%, ${themeDark} 100%)` }}>
                    <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
                    <div className="absolute right-16 -bottom-12 h-24 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
                    <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                            <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-white/15 backdrop-blur-sm">
                                <BookOpenIcon className="h-5 w-5" />
                            </div>
                            <div>
                                <h1 className="text-lg sm:text-xl font-bold leading-tight">Knowledge Bank</h1>
                                <p className="text-[11px] text-white/70 leading-tight">
                                    Leaflets, scripts, photos, videos &amp; documents by section and product
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center flex-wrap gap-2">
                            {mode !== 'all' && (
                                <span className={`${pillBase} bg-white/15 text-white`}>
                                    Folders: <b className="font-bold">{shownFolders.length}</b>
                                </span>
                            )}
                            {(mode === 'all' || !atRoot) && (
                                <span className={`${pillBase} bg-white/15 text-white`}>
                                    Files: <b className="font-bold">{shownFiles.length}</b>
                                </span>
                            )}
                            {isAdmin && (
                                <>
                                    <button onClick={() => setShowCatModal(true)}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 px-2.5 py-1.5 text-[12px] font-medium transition">
                                        <TagIcon className="h-3.5 w-3.5" /> Categories
                                    </button>
                                    <button onClick={createProductFolders}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 px-2.5 py-1.5 text-[12px] font-medium transition">
                                        <CubeIcon className="h-3.5 w-3.5" /> Products
                                    </button>
                                    <button onClick={() => createFolder(false)}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 px-2.5 py-1.5 text-[12px] font-medium transition">
                                        <FolderPlusIcon className="h-3.5 w-3.5" /> New folder
                                    </button>
                                    <button onClick={() => fileInputRef.current?.click()} disabled={mode === 'all' || atRoot}
                                        title={mode === 'all' || atRoot ? 'Open a folder first' : 'Upload files'}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-semibold transition hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed"
                                        style={{ color: themeColor }}>
                                        <ArrowUpTrayIcon className="h-3.5 w-3.5" /> Upload
                                    </button>
                                    <input ref={fileInputRef} type="file" multiple
                                        accept="image/*,video/*,application/pdf" className="hidden" onChange={onPickFiles} />
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* ===== Tab bar (scrollable; All Files + add pinned right) ===== */}
                <div className="flex items-center gap-2 mb-3">
                    <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0 pb-1 kb-scroll">
                        <button onClick={goHome}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold flex-shrink-0 transition ${activeTab === 'home' ? 'text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                            style={activeTab === 'home' ? { backgroundColor: themeColor } : {}}>
                            <HomeIcon className="h-4 w-4" /> Home
                        </button>
                        {topFolders.map((f) => (
                            <button key={f.id} onClick={() => openTab(f)}
                                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium flex-shrink-0 transition whitespace-nowrap ${activeTab === f.id ? 'text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'} ${isAdmin && f.is_hidden ? 'opacity-60' : ''}`}
                                style={activeTab === f.id ? { backgroundColor: themeColor } : {}}>
                                <FolderIcon className="h-4 w-4" /> {f.name}
                            </button>
                        ))}
                    </div>
                    {isAdmin && (
                        <button onClick={() => createFolder(true)} title="Add a section / top-level tab"
                            className="inline-flex items-center justify-center rounded-lg p-1.5 bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 flex-shrink-0 transition">
                            <PlusIcon className="h-4 w-4" />
                        </button>
                    )}
                    <button onClick={openAllFiles}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold flex-shrink-0 transition ${activeTab === 'all' ? 'text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                        style={activeTab === 'all' ? { backgroundColor: themeColor } : {}}>
                        <RectangleStackIcon className="h-4 w-4" /> All Files
                    </button>
                </div>

                {/* ===== Toolbar ===== */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
                    <div className="flex items-center gap-1 text-[12px] text-gray-600 flex-1 min-w-0 overflow-x-auto kb-scroll">
                        {mode !== 'all' && !atRoot && (
                            <button onClick={goUp}
                                className="mr-1 flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium hover:bg-gray-50 hover:border-gray-300 flex-shrink-0 transition">
                                <ArrowLeftIcon className="h-3.5 w-3.5" /> Back
                            </button>
                        )}
                        <div className="flex items-center gap-1 rounded-lg bg-white border border-gray-200 px-2 py-1.5 min-w-0">
                            {trail.map((c, i) => (
                                <span key={c.id} className="flex items-center gap-1 flex-shrink-0">
                                    {i > 0 && <ChevronRightIcon className="h-3.5 w-3.5 text-gray-300" />}
                                    <button onClick={() => (mode === 'all' ? (i === 0 ? goHome() : null) : goToCrumb(i))}
                                        className={`flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-gray-100 transition ${i === trail.length - 1 ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
                                        {i === 0 && <HomeIcon className="h-3.5 w-3.5" />}
                                        {c.name}
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Category filter ONLY in the All Files tab */}
                        {categories.length > 0 && mode === 'all' && (
                            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
                                className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-[13px] text-black outline-none focus:border-gray-300">
                                <option value="">All categories</option>
                                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        )}
                        <div className="relative">
                            <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input value={query} onChange={(e) => setQuery(e.target.value)}
                                placeholder={mode === 'all' ? 'Search all files' : 'Search this folder'}
                                className="w-40 sm:w-52 rounded-lg border border-gray-200 bg-white pl-8 pr-3 py-2 text-[13px] outline-none focus:border-gray-300 focus:ring-2 focus:ring-indigo-100 text-black transition" />
                        </div>
                        <button onClick={refresh} title="Refresh"
                            className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition">
                            <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden">
                            <button onClick={() => setView('grid')} className="p-2 transition"
                                style={view === 'grid' ? { backgroundColor: themeColor, color: '#fff' } : { color: '#6b7280' }} title="Grid view">
                                <Squares2X2Icon className="h-4 w-4" />
                            </button>
                            <button onClick={() => setView('list')} className="p-2 transition"
                                style={view === 'list' ? { backgroundColor: themeColor, color: '#fff' } : { color: '#6b7280' }} title="List view">
                                <ListBulletIcon className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* ===== Body ===== */}
                {loading ? (
                    <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm">
                        {Array.from({ length: 7 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-b-0 animate-pulse">
                                <div className="h-9 w-9 rounded-lg bg-gray-100 flex-shrink-0" />
                                <div className="flex-1">
                                    <div className="h-3 w-1/3 rounded bg-gray-100" />
                                    <div className="mt-1.5 h-2.5 w-1/5 rounded bg-gray-100" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : isEmpty ? (
                    <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-20 text-center">
                        <div className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: themeSoft }}>
                            <FolderIcon className="h-7 w-7" style={{ color: themeColor }} />
                        </div>
                        <p className="mt-3 text-sm font-semibold text-gray-700">
                            {query || effCat ? 'Nothing matches your filters'
                                : mode === 'all' ? 'No categorised files yet' : 'This folder is empty'}
                        </p>
                        <p className="mt-1 text-[12px] text-gray-400">
                            {query || effCat ? 'Try a different name or category.'
                                : mode === 'all' ? 'Files appear here once they have a category.'
                                    : isAdmin ? 'Use New folder, Products or Upload to add content.' : 'Nothing has been added here yet.'}
                        </p>
                    </div>
                ) : view === 'grid' ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-0 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
                        {shownFolders.map((f) => (
                            <div key={f.id} className={`group flex flex-col h-full rounded-xl p-2.5 transition hover:bg-indigo-50/60 ${isAdmin && f.is_hidden ? 'opacity-60' : ''}`}>
                                <button onClick={() => openFolder(f)} className="w-full flex flex-col items-center" title={f.description ? `${f.name}\n${f.description}` : f.name}>
                                    <FolderYellow className="w-16 h-16 transition-transform group-hover:scale-105 drop-shadow-sm" />
                                    <p className="mt-1.5 text-[12px] font-medium text-gray-800 text-center break-words leading-snug w-full px-0.5">{f.name}</p>
                                    {f.description && <p className="text-[10px] text-gray-500 text-center line-clamp-1 w-full px-0.5">{f.description}</p>}
                                    <p className="text-[10px] text-gray-400 truncate w-full text-center">
                                        {isAdmin && f.is_hidden ? 'Hidden \u00b7 ' : ''}{folderSummaryText(f)}
                                    </p>
                                </button>
                                <div className="mt-auto pt-1.5 flex items-center justify-center gap-1 flex-wrap">
                                    <button onClick={() => downloadFolder(f)} title="Download as ZIP" className={`${actBase} ${ACT.download}`}>
                                        <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                                    </button>
                                    {isAdmin && (
                                        <>
                                            <button onClick={() => editFolder(f)} title="Edit name / description" className={`${actBase} ${ACT.edit}`}>
                                                <PencilSquareIcon className="h-3.5 w-3.5" />
                                            </button>
                                            <button onClick={() => toggleHideFolder(f)} disabled={hidingKeys.has(`folder:${f.id}`)} title={f.is_hidden ? 'Show to users' : 'Hide from users'} className={`${actBase} ${ACT.hide} disabled:opacity-50`}>
                                                {hideIcon(`folder:${f.id}`, f.is_hidden)}
                                            </button>
                                            <button onClick={() => removeFolder(f)} title="Delete" className={`${actBase} ${ACT.del}`}>
                                                <TrashIcon className="h-3.5 w-3.5" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}

                        {shownFiles.map((file) => {
                            const meta = KIND_META[file.kind] || KIND_META.other;
                            const Icon = meta.Icon;
                            return (
                                <div key={file.id} className={`group flex flex-col h-full rounded-xl p-2.5 transition hover:bg-gray-50 ${isAdmin && file.is_hidden ? 'opacity-60' : ''}`}>
                                    <button onClick={() => setPreview(file)} className="w-full flex flex-col items-center" title={fileTitle(file)}>
                                        {file.kind === 'image' ? (
                                            <img src={mediaUrl(file)} alt={file.name} loading="lazy" decoding="async" className="w-16 h-16 rounded-lg object-cover border border-gray-200 transition-transform group-hover:scale-105" />
                                        ) : (
                                            <span className="w-16 h-16 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105" style={{ backgroundColor: 'rgb(165, 226, 250)' }}>
                                                <Icon className="h-6 w-6" style={{ color: 'black' }} />
                                            </span>
                                        )}
                                        <p className="mt-1 text-[12px] font-medium text-gray-800 text-center break-words leading-snug w-full px-0.5">{file.name}</p>
                                        {file.category && (
                                            <span className="mt-0.5 inline-block text-[9px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5" style={{ color: themeColor, backgroundColor: themeSoft }}>{file.category}</span>
                                        )}
                                        {mode === 'all' && file.folder_path && (
                                            <p className="text-[9px] text-gray-400 text-center line-clamp-1 w-full px-0.5">{file.folder_path}</p>
                                        )}
                                        <p className="text-[10px] text-gray-400">
                                            <span className="font-semibold" style={{ color: 'rgb(46, 94, 255)' }}>{meta.label}</span>
                                            {file.size_bytes ? ` \u00b7 ${prettySize(file.size_bytes)}` : ''}
                                            {isAdmin && file.is_hidden ? ' \u00b7 Hidden' : ''}
                                        </p>
                                    </button>
                                    <div className="mt-auto pt-1.5 flex items-center justify-center gap-1 flex-wrap">
                                        <button onClick={() => downloadFile(file)} title="Download" className={`${actBase} ${ACT.download}`}>
                                            <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                                        </button>
                                        {isAdmin && (
                                            <>
                                                <button onClick={() => editFile(file)} title="Edit name / category / description" className={`${actBase} ${ACT.edit}`}>
                                                    <PencilSquareIcon className="h-3.5 w-3.5" />
                                                </button>
                                                <button onClick={() => toggleHideFile(file)} disabled={hidingKeys.has(`file:${file.id}`)} title={file.is_hidden ? 'Show to users' : 'Hide from users'} className={`${actBase} ${ACT.hide} disabled:opacity-50`}>
                                                    {hideIcon(`file:${file.id}`, file.is_hidden)}
                                                </button>
                                                <button onClick={() => removeFile(file)} title="Delete" className={`${actBase} ${ACT.del}`}>
                                                    <TrashIcon className="h-3.5 w-3.5" />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    /* ===== List view ===== */
                    <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto kb-scroll shadow-sm">
                        <div className="min-w-[960px] divide-y divide-gray-200">
                            {/* Header */}
                            <div className="grid grid-cols-12 divide-x divide-gray-200 bg-gray-50 text-[10px] sm:text-[11px] font-semibold text-black uppercase tracking-wider">
                                <div className="col-span-3 px-3 py-1.5 text-center">Name</div>
                                <div className="col-span-3 px-3 py-1.5 text-center">Description</div>
                                <div className="col-span-1 px-3 py-1.5 text-center">Type</div>
                                <div className="col-span-1 px-3 py-1.5 text-center">Category</div>
                                <div className="col-span-1 px-3 py-1.5 text-center">Size</div>
                                <div className="col-span-1 px-3 py-1.5 text-center">Modified</div>
                                <div className="col-span-2 px-3 py-1.5 text-center">Actions</div>
                            </div>

                            {/* Folder rows */}
                            {shownFolders.map((f) => (
                                <div key={f.id} className={`grid grid-cols-12 divide-x divide-gray-200 text-[11px] sm:text-xs items-stretch hover:bg-indigo-50/40 transition ${isAdmin && f.is_hidden ? 'opacity-60' : ''}`}>
                                    <button onClick={() => openFolder(f)} className="col-span-3 flex items-center gap-2 min-w-0 text-left px-3 py-1.5" title={f.name}>
                                        <FolderYellow className="h-5 w-5 flex-shrink-0" />
                                        <span className="font-semibold truncate text-gray-800">{f.name}</span>
                                        {isAdmin && f.is_hidden && <span className="text-[9px] font-bold uppercase tracking-wide text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 flex-shrink-0">Hidden</span>}
                                    </button>
                                    <div className="col-span-3 px-3 py-1.5 flex items-center text-gray-500 min-w-0">
                                        <span className="truncate w-full" title={f.description || ''}>{f.description || '-'}</span>
                                    </div>
                                    <div className="col-span-1 px-3 py-1.5 flex items-center justify-center text-gray-500">Folder</div>
                                    <div className="col-span-1 px-3 py-1.5 flex items-center justify-center text-gray-400">-</div>
                                    <div className="col-span-1 px-3 py-1.5 flex items-center justify-center text-gray-400 text-center truncate" title={folderSummaryText(f)}>{folderSummaryText(f)}</div>
                                    <div className="col-span-1 px-3 py-1.5 flex items-center justify-center text-gray-500 whitespace-nowrap">{prettyDate(f.modified_at)}</div>
                                    <div className="col-span-2 px-3 py-1.5 flex items-center justify-center gap-1 flex-wrap">
                                        <button onClick={() => downloadFolder(f)} className={`${actBase} ${ACT.download}`} title="Download as ZIP"><ArrowDownTrayIcon className="h-3.5 w-3.5" /></button>
                                        {isAdmin && (
                                            <>
                                                <button onClick={() => editFolder(f)} className={`${actBase} ${ACT.edit}`} title="Edit"><PencilSquareIcon className="h-3.5 w-3.5" /></button>
                                                <button onClick={() => toggleHideFolder(f)} disabled={hidingKeys.has(`folder:${f.id}`)} className={`${actBase} ${ACT.hide} disabled:opacity-50`} title={f.is_hidden ? 'Show' : 'Hide'}>{hideIcon(`folder:${f.id}`, f.is_hidden)}</button>
                                                <button onClick={() => removeFolder(f)} className={`${actBase} ${ACT.del}`} title="Delete"><TrashIcon className="h-3.5 w-3.5" /></button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {/* File rows */}
                            {shownFiles.map((file) => {
                                const meta = KIND_META[file.kind] || KIND_META.other;
                                const Icon = meta.Icon;
                                return (
                                    <div key={file.id} className={`grid grid-cols-12 divide-x divide-gray-200 text-[11px] sm:text-xs items-stretch hover:bg-indigo-50/40 transition ${isAdmin && file.is_hidden ? 'opacity-60' : ''}`}>
                                        <button onClick={() => setPreview(file)} className="col-span-3 flex items-center gap-2 min-w-0 text-left px-3 py-1.5" title={fileTitle(file)}>
                                            <span className="h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: meta.soft }}>
                                                <Icon className="h-3.5 w-3.5" style={{ color: meta.tint }} />
                                            </span>
                                            <span className="min-w-0">
                                                <span className="font-semibold truncate text-gray-800 block">{file.name}</span>
                                                {mode === 'all' && file.folder_path && <span className="text-[9px] text-gray-400 truncate block">{file.folder_path}</span>}
                                            </span>
                                        </button>
                                        <div className="col-span-3 px-3 py-1.5 flex items-center text-gray-500 min-w-0">
                                            <span className="truncate w-full" title={file.description || ''}>{file.description || '-'}</span>
                                        </div>
                                        <div className="col-span-1 px-3 py-1.5 flex items-center justify-center">
                                            <span className="text-[9px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5" style={{ color: meta.tint, backgroundColor: meta.soft }}>{meta.label}</span>
                                        </div>
                                        <div className="col-span-1 px-3 py-1.5 flex items-center justify-center">
                                            {file.category
                                                ? <span className="text-[9px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 truncate" style={{ color: themeColor, backgroundColor: themeSoft }}>{file.category}</span>
                                                : <span className="text-gray-400">-</span>}
                                        </div>
                                        <div className="col-span-1 px-3 py-1.5 flex items-center justify-center text-gray-400">{prettySize(file.size_bytes)}</div>
                                        <div className="col-span-1 px-3 py-1.5 flex items-center justify-center text-gray-400 whitespace-nowrap">{prettyDate(file.modified_at)}</div>
                                        <div className="col-span-2 px-3 py-1.5 flex items-center justify-center gap-1 flex-wrap">
                                            <button onClick={() => downloadFile(file)} className={`${actBase} ${ACT.download}`} title="Download"><ArrowDownTrayIcon className="h-3.5 w-3.5" /></button>
                                            {isAdmin && (
                                                <>
                                                    <button onClick={() => editFile(file)} className={`${actBase} ${ACT.edit}`} title="Edit"><PencilSquareIcon className="h-3.5 w-3.5" /></button>
                                                    <button onClick={() => toggleHideFile(file)} disabled={hidingKeys.has(`file:${file.id}`)} className={`${actBase} ${ACT.hide} disabled:opacity-50`} title={file.is_hidden ? 'Show' : 'Hide'}>{hideIcon(`file:${file.id}`, file.is_hidden)}</button>
                                                    <button onClick={() => removeFile(file)} className={`${actBase} ${ACT.del}`} title="Delete"><TrashIcon className="h-3.5 w-3.5" /></button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* ===== Category master modal ===== */}
            {isAdmin && showCatModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowCatModal(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                            <div className="flex items-center gap-2">
                                <span className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: themeSoft }}>
                                    <TagIcon className="h-4 w-4" style={{ color: themeColor }} />
                                </span>
                                <div>
                                    <p className="text-sm font-semibold text-gray-800">Master categories</p>
                                    <p className="text-[11px] text-gray-400">Used when uploading and editing files</p>
                                </div>
                            </div>
                            <button onClick={() => setShowCatModal(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition">
                                <XMarkIcon className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="p-4 overflow-auto kb-scroll">
                            <div className="flex items-center gap-2 mb-3">
                                <input value={newCat} onChange={(e) => setNewCat(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                                    placeholder="e.g. Leaflet, Script, Brochure"
                                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-black outline-none focus:border-gray-300" />
                                <button onClick={addCategory}
                                    className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-[12px] font-semibold text-white"
                                    style={{ backgroundColor: themeColor }}>
                                    <PlusIcon className="h-4 w-4" /> Add
                                </button>
                            </div>
                            {categories.length === 0 ? (
                                <p className="text-[12px] text-gray-400 py-4 text-center">No categories yet. Add one above.</p>
                            ) : (
                                <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                                    {categories.map((c) => (
                                        <div key={c.id} className="flex items-center justify-between px-3 py-2">
                                            <span className="text-[13px] font-medium text-gray-800">{c.name}</span>
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => renameCategory(c)} className={`${actBase} ${ACT.edit}`} title="Rename">
                                                    <PencilSquareIcon className="h-3.5 w-3.5" />
                                                </button>
                                                <button onClick={() => deleteCategory(c)} className={`${actBase} ${ACT.del}`} title="Delete">
                                                    <TrashIcon className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ===== Preview modal ===== */}
            {preview && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setPreview(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl max-w-[95vw] w-full max-h-[95vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <span className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: (KIND_META[preview.kind] || KIND_META.other).soft }}>
                                    {(() => { const I = (KIND_META[preview.kind] || KIND_META.other).Icon; return <I className="h-4 w-4" style={{ color: (KIND_META[preview.kind] || KIND_META.other).tint }} />; })()}
                                </span>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold truncate text-gray-800">{preview.name}</p>
                                    <p className="text-[11px] text-gray-400">
                                        {(KIND_META[preview.kind] || KIND_META.other).label}
                                        {preview.category ? ` \u00b7 ${preview.category}` : ''}
                                        {preview.size_bytes ? ` \u00b7 ${prettySize(preview.size_bytes)}` : ''}
                                    </p>
                                    {preview.description && <p className="text-[11px] text-gray-500 truncate">{preview.description}</p>}
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button onClick={() => downloadFile(preview)} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90" style={{ backgroundColor: themeColor }}>
                                    <ArrowDownTrayIcon className="h-3.5 w-3.5" /> Download
                                </button>
                                <button onClick={() => setPreview(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition">
                                    <XMarkIcon className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto bg-gray-100 flex items-center justify-center p-3">
                            {preview.kind === 'image' ? (
                                <img src={mediaUrl(preview)} alt={preview.name} className="max-h-[85vh] max-w-full object-contain rounded-lg" />
                            ) : preview.kind === 'video' ? (
                                <video src={mediaUrl(preview)} controls className="max-h-[85vh] max-w-full rounded-lg" />
                            ) : preview.kind === 'pdf' ? (
                                <iframe src={mediaUrl(preview)} title={preview.name} className="w-full h-[85vh] rounded-lg bg-white" />
                            ) : (
                                <div className="text-center py-16">
                                    {(() => { const Icon = (KIND_META[preview.kind] || KIND_META.other).Icon; return <Icon className="mx-auto h-12 w-12 text-gray-300" />; })()}
                                    <p className="mt-3 text-sm text-gray-500">No preview available for this file.</p>
                                    <p className="text-[12px] text-gray-400">Use Download to open it.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default KnowledgeBook;