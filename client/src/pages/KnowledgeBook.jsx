import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import {
    FolderIcon,
    FolderPlusIcon,
    ArrowUpTrayIcon,
    ChevronRightIcon,
    HomeIcon,
    DocumentTextIcon,
    PhotoIcon,
    VideoCameraIcon,
    DocumentIcon,
    ArrowDownTrayIcon,
    TrashIcon,
    XMarkIcon,
    PencilSquareIcon,
    EyeIcon,
    EyeSlashIcon,
    MagnifyingGlassIcon,
    ArrowLeftIcon,
    Squares2X2Icon,
    ListBulletIcon,
    ArrowPathIcon,
    BookOpenIcon,
} from '@heroicons/react/24/outline';
import { FolderIcon as FolderSolid } from '@heroicons/react/24/solid';

// -- Theme (matches the rest of the app) --------------------------
const themeColor = '#2f3192';
const themeDark = '#23255f';
const themeSoft = 'rgba(47, 49, 146, 0.10)';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL; // e.g. "/api"

const KIND_META = {
    image: { Icon: PhotoIcon, tint: '#2563eb', soft: 'rgba(37,99,235,0.10)', label: 'Image' },
    video: { Icon: VideoCameraIcon, tint: '#7c3aed', soft: 'rgba(124,58,237,0.10)', label: 'Video' },
    pdf: { Icon: DocumentTextIcon, tint: '#dc2626', soft: 'rgba(220,38,38,0.10)', label: 'PDF' },
    other: { Icon: DocumentIcon, tint: '#6b7280', soft: 'rgba(107,114,128,0.10)', label: 'File' },
};

const prettySize = (bytes) => {
    if (bytes == null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const folderSummaryText = (f) => {
    const parts = [];
    if (f.folder_count) parts.push(`${f.folder_count} folder${f.folder_count > 1 ? 's' : ''}`);
    if (f.file_count) parts.push(`${f.file_count} file${f.file_count > 1 ? 's' : ''}`);
    return parts.join(' \u00b7 ') || 'Empty';
};

const FolderYellow = ({ className, style }) => (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* back + tab */}
        <path d="M2.5 6.2c0-1 .8-1.7 1.7-1.7h4.8c.5 0 1 .2 1.3.6l1.1 1.3h8.4c1 0 1.7.8 1.7 1.7v9.4c0 1-.8 1.7-1.7 1.7H4.2c-1 0-1.7-.8-1.7-1.7V6.2Z" fill="#E0A50C"/>
        {/* front flap */}
        <path d="M2.5 9.3h19v8.3c0 1-.8 1.7-1.7 1.7H4.2c-1 0-1.7-.8-1.7-1.7V9.3Z" fill="#F6C23E"/>
    </svg>
);

const KnowledgeBook = () => {
    // Logged-in user (drives the auth headers and the admin checks)
    const currentUser = useMemo(() => {
        try { return JSON.parse(sessionStorage.getItem('user')) || {}; }
        catch { return {}; }
    }, []);
    const isAdmin = currentUser?.role === 'master_admin';

    const authHeaders = useMemo(() => ({
        'user-id': currentUser?.user_id || '',
        'user-role': currentUser?.role || '',
    }), [currentUser]);

    // path: list of { id, name } from root down to the current folder.
    // Empty = top-level (products). currentId = id of the open folder (null at root).
    const [path, setPath] = useState([]);
    const currentId = path.length ? path[path.length - 1].id : null;
    const atRoot = path.length === 0;

    const [folders, setFolders] = useState([]);
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [view, setView] = useState('grid');
    const [preview, setPreview] = useState(null);
    const fileInputRef = useRef(null);

    // -- Load the contents of the current folder -------------------
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
        } finally {
            setLoading(false);
        }
    }, [authHeaders]);

    useEffect(() => { loadFolder(currentId); }, [currentId, loadFolder]);

    const refresh = () => loadFolder(currentId);

    // -- Navigation -----------------------------------------------
    const openFolder = (f) => { setPath((p) => [...p, { id: f.id, name: f.name }]); setQuery(''); };
    const goUp = () => { setPath((p) => p.slice(0, -1)); setQuery(''); };
    const goToCrumb = (i) => { setPath((p) => p.slice(0, i)); setQuery(''); }; // i=0 => root

    // Client-side search within the loaded folder
    const q = query.toLowerCase();
    const shownFolders = folders.filter((f) => f.name.toLowerCase().includes(q));
    const shownFiles = files.filter((f) => f.name.toLowerCase().includes(q));

    // -- Admin actions --------------------------------------------
    const createSubfolder = async () => {
        const { value: name } = await Swal.fire({
            title: 'New folder', input: 'text', inputPlaceholder: 'Folder name',
            showCancelButton: true, confirmButtonColor: themeColor, cancelButtonColor: '#d33',
            confirmButtonText: 'Create',
            inputValidator: (val) => (!val || !val.trim()) ? 'Please enter a name' : undefined,
        });
        if (!name || !name.trim()) return;
        try {
            const body = new FormData();
            body.append('name', name.trim());
            if (currentId != null) body.append('parent_id', currentId);
            const res = await fetch(`${API_BASE_URL}/knowledge-book/folders`, { method: 'POST', headers: authHeaders, body });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'Could not create folder');
            toast.success('Folder created');
            refresh();
        } catch (e) { toast.error(e.message); }
    };

    const renameFolder = async (f) => {
        const { value: name } = await Swal.fire({
            title: 'Rename folder', input: 'text', inputValue: f.name,
            showCancelButton: true, confirmButtonColor: themeColor, cancelButtonColor: '#d33',
            confirmButtonText: 'Save',
            inputValidator: (val) => (!val || !val.trim()) ? 'Please enter a name' : undefined,
        });
        if (!name || !name.trim()) return;
        try {
            const body = new FormData();
            body.append('name', name.trim());
            const res = await fetch(`${API_BASE_URL}/knowledge-book/folders/${f.id}`, { method: 'PUT', headers: authHeaders, body });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'Could not rename folder');
            toast.success('Folder renamed');
            refresh();
        } catch (e) { toast.error(e.message); }
    };

    const toggleHideFolder = async (f) => {
        try {
            const res = await fetch(`${API_BASE_URL}/knowledge-book/folders/${f.id}/hide`, { method: 'PATCH', headers: authHeaders });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'Could not update folder');
            refresh();
        } catch (e) { toast.error(e.message); }
    };

    const handleUpload = async (e) => {
        const picked = Array.from(e.target.files || []);
        e.target.value = '';
        if (picked.length === 0 || currentId == null) return;
        const t = toast.loading(`Uploading ${picked.length} file(s)...`);
        try {
            const body = new FormData();
            body.append('folder_id', currentId);
            picked.forEach((f) => body.append('files', f));
            const res = await fetch(`${API_BASE_URL}/knowledge-book/files`, { method: 'POST', headers: authHeaders, body });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'Upload failed');
            toast.success(`${(data.files || []).length} file(s) uploaded`, { id: t });
            refresh();
        } catch (err) { toast.error(err.message, { id: t }); }
    };

    const removeFolder = async (f) => {
        const res0 = await Swal.fire({
            title: 'Delete folder?', text: `"${f.name}" and everything inside it will be removed.`,
            icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, delete',
        });
        if (!res0.isConfirmed) return;
        try {
            const res = await fetch(`${API_BASE_URL}/knowledge-book/folders/${f.id}`, { method: 'DELETE', headers: authHeaders });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'Could not delete folder');
            toast.success('Deleted');
            refresh();
        } catch (e) { toast.error(e.message); }
    };

    const removeFile = async (file) => {
        const res0 = await Swal.fire({
            title: 'Delete file?', text: `"${file.name}" will be removed.`,
            icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, delete',
        });
        if (!res0.isConfirmed) return;
        try {
            const res = await fetch(`${API_BASE_URL}/knowledge-book/files/${file.id}`, { method: 'DELETE', headers: authHeaders });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'Could not delete file');
            if (preview && preview.id === file.id) setPreview(null);
            toast.success('Deleted');
            refresh();
        } catch (e) { toast.error(e.message); }
    };

    const downloadFile = (file) => {
        window.open(`${API_BASE_URL}/knowledge-book/files/${file.id}/download`, '_blank');
    };

    // Inline preview URL (image/video/pdf). Same API base as every other call.
    const mediaUrl = (file) => `${API_BASE_URL}/knowledge-book/files/${file.id}/view`;

    const trail = useMemo(() => [{ id: 'root', name: 'Products' }, ...path], [path]);
    const isEmpty = shownFolders.length === 0 && shownFiles.length === 0;

    const pillBase = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium';

    return (
        <div className="min-h-screen font-sans">
            <div className="max-w-7xl mx-auto px-3 sm:px-5 pb-10">

                {/* ===== Hero header ===== */}
                <div
                    className="rounded-2xl px-3 sm:px-5 py-3 mb-4 text-white relative overflow-hidden"
                    style={{ background: `linear-gradient(120deg, ${themeColor} 0%, ${themeDark} 100%)` }}
                >
                    {/* soft decorative circles */}
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
                                    Brochures, photos, videos &amp; documents organized by product
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center flex-wrap gap-2">
                            <span className={`${pillBase} bg-white/15 text-white`}>
                                {atRoot ? 'Products' : 'Folders'}: <b className="font-bold">{shownFolders.length}</b>
                            </span>
                            {!atRoot && (
                                <span className={`${pillBase} bg-white/15 text-white`}>
                                    Files: <b className="font-bold">{shownFiles.length}</b>
                                </span>
                            )}
                            {isAdmin && (
                                <>
                                    <button onClick={createSubfolder}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 px-2.5 py-1.5 text-[12px] font-medium transition">
                                        <FolderPlusIcon className="h-3.5 w-3.5" /> New folder
                                    </button>
                                    <button onClick={() => fileInputRef.current?.click()} disabled={atRoot}
                                        title={atRoot ? 'Open a product folder first' : 'Upload files'}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-semibold transition hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed"
                                        style={{ color: themeColor }}>
                                        <ArrowUpTrayIcon className="h-3.5 w-3.5" /> Upload
                                    </button>
                                    <input ref={fileInputRef} type="file" multiple
                                        accept="image/*,video/*,application/pdf" className="hidden" onChange={handleUpload} />
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* ===== Toolbar ===== */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
                    {/* Breadcrumb */}
                    <div className="flex items-center gap-1 text-[12px] text-gray-600 flex-1 min-w-0 overflow-x-auto">
                        {!atRoot && (
                            <button onClick={goUp}
                                className="mr-1 flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium hover:bg-gray-50 hover:border-gray-300 flex-shrink-0 transition">
                                <ArrowLeftIcon className="h-3.5 w-3.5" /> Back
                            </button>
                        )}
                        <div className="flex items-center gap-1 rounded-lg bg-white border border-gray-200 px-2 py-1.5 min-w-0">
                            {trail.map((c, i) => (
                                <span key={c.id} className="flex items-center gap-1 flex-shrink-0">
                                    {i > 0 && <ChevronRightIcon className="h-3.5 w-3.5 text-gray-300" />}
                                    <button onClick={() => goToCrumb(i)}
                                        className={`flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-gray-100 transition ${i === trail.length - 1 ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
                                        {i === 0 && <HomeIcon className="h-3.5 w-3.5" />}
                                        {c.name}
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search this folder"
                                className="w-44 sm:w-56 rounded-lg border border-gray-200 bg-white pl-8 pr-3 py-2 text-[13px] outline-none focus:border-gray-300 focus:ring-2 focus:ring-indigo-100 text-black transition"
                            />
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
                            {query ? 'Nothing matches your search' : 'This folder is empty'}
                        </p>
                        <p className="mt-1 text-[12px] text-gray-400">
                            {query ? 'Try a different name.' : isAdmin ? 'Use New folder or Upload to add content.' : 'Nothing has been added here yet.'}
                        </p>
                    </div>
                ) : view === 'grid' ? (
                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-12 gap-0.5">
                        {/* ===== Folders: classic yellow icons ===== */}
                        {shownFolders.map((f) => (
                            <div key={f.id}
                                className={`group rounded-xl p-2.5 transition hover:bg-indigo-50/60 ${isAdmin && f.is_hidden ? 'opacity-60' : ''}`}>
                                <button onClick={() => openFolder(f)} className="w-full flex flex-col items-center" title={f.name}>
                                    <FolderYellow className="w-16 h-16 transition-transform group-hover:scale-105 drop-shadow-sm" />
                                    <p className="mt-1.5 text-[12px] font-medium text-gray-800 text-center truncate w-full px-0.5">{f.name}</p>
                                    <p className="text-[10px] text-gray-400 truncate w-full text-center">
                                        {isAdmin && f.is_hidden ? 'Hidden \u00b7 ' : ''}{folderSummaryText(f)}
                                    </p>
                                </button>

                                {isAdmin && (
                                    <div className="mt-1.5 flex items-center justify-center gap-1">
                                        {!f.is_product && (
                                            <button onClick={() => renameFolder(f)} title="Edit / rename"
                                                className="rounded-md p-1 text-gray-500 bg-gray-50 hover:bg-white hover:text-indigo-600 border border-gray-200 transition">
                                                <PencilSquareIcon className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                        <button onClick={() => toggleHideFolder(f)} title={f.is_hidden ? 'Show to users' : 'Hide from users'}
                                            className="rounded-md p-1 text-gray-500 bg-gray-50 hover:bg-white hover:text-gray-800 border border-gray-200 transition">
                                            {f.is_hidden ? <EyeIcon className="h-3.5 w-3.5" /> : <EyeSlashIcon className="h-3.5 w-3.5" />}
                                        </button>
                                        {!f.is_product && (
                                            <button onClick={() => removeFolder(f)} title="Delete"
                                                className="rounded-md p-1 text-gray-500 bg-gray-50 hover:bg-white hover:text-red-600 border border-gray-200 transition">
                                                <TrashIcon className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* ===== Files: icon / thumbnail tiles ===== */}
                        {shownFiles.map((file) => {
                            const meta = KIND_META[file.kind] || KIND_META.other;
                            const Icon = meta.Icon;
                            return (
                                <div key={file.id} className="group rounded-xl p-2.5 transition hover:bg-gray-50">
                                    <button onClick={() => setPreview(file)} className="w-full flex flex-col items-center" title={file.name}>
                                        {file.kind === 'image' ? (
                                            <img src={mediaUrl(file)} alt={file.name}
                                                className="w-16 h-16 rounded-lg object-cover border border-gray-200 transition-transform group-hover:scale-105" />
                                        ) : (
                                            <span className="w-16 h-16 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105"
                                                style={{ backgroundColor: meta.soft }}>
                                                <Icon className="h-6 w-6" style={{ color: meta.tint }} />
                                            </span>
                                        )}
                                        <p className="mt-1 text-[12px] font-medium text-gray-800 text-center truncate w-full px-0.5">{file.name}</p>
                                        <p className="text-[10px] text-gray-400">
                                            <span className="font-semibold" style={{ color: meta.tint }}>{meta.label}</span>
                                            {file.size_bytes ? ` \u00b7 ${prettySize(file.size_bytes)}` : ''}
                                        </p>
                                    </button>

                                    <div className="mt-1.5 flex items-center justify-center gap-1">
                                        <button onClick={() => downloadFile(file)} title="Download"
                                            className="rounded-md p-1 text-gray-500 bg-gray-50 hover:bg-white hover:text-indigo-600 border border-gray-200 transition">
                                            <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                                        </button>
                                        {isAdmin && (
                                            <button onClick={() => removeFile(file)} title="Delete"
                                                className="rounded-md p-1 text-gray-500 bg-gray-50 hover:bg-white hover:text-red-600 border border-gray-200 transition">
                                                <TrashIcon className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    /* ===== List view (compact grid) ===== */
                    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm divide-y divide-gray-200">
                        {/* Header row */}
                        <div className="grid grid-cols-12 divide-x divide-gray-200 bg-gray-50 text-[10px] sm:text-[11px] font-semibold text-black uppercase tracking-wider">
                            <div className="col-span-6 px-3 py-1.5">Name</div>
                            <div className="col-span-2 px-3 py-1.5">Type</div>
                            <div className="col-span-2 px-3 py-1.5">Size</div>
                            <div className="col-span-2 px-3 py-1.5 text-right">Actions</div>
                        </div>

                        {shownFolders.map((f) => (
                            <div key={f.id}
                                className={`grid grid-cols-12 divide-x divide-gray-200 text-[11px] sm:text-xs items-stretch hover:bg-indigo-50/40 transition ${isAdmin && f.is_hidden ? 'opacity-60' : ''}`}>
                                <button onClick={() => openFolder(f)} className="col-span-6 flex items-center gap-2 min-w-0 text-left px-3 py-1.5">
                                    <FolderYellow className="h-5 w-5 flex-shrink-0" />
                                    <span className="font-semibold truncate text-gray-800">{f.name}</span>
                                    {isAdmin && f.is_hidden && (
                                        <span className="text-[9px] font-bold uppercase tracking-wide text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 flex-shrink-0">Hidden</span>
                                    )}
                                </button>
                                <div className="col-span-2 px-3 py-1.5 flex items-center text-gray-500">Folder</div>
                                <div className="col-span-2 px-3 py-1.5 flex items-center text-gray-400 truncate">{folderSummaryText(f)}</div>
                                <div className="col-span-2 px-3 py-1.5 flex items-center justify-end gap-1">
                                    {isAdmin && (
                                        <>
                                            {!f.is_product && (
                                                <button onClick={() => renameFolder(f)} className="rounded-lg p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition" title="Rename">
                                                    <PencilSquareIcon className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                            <button onClick={() => toggleHideFolder(f)} className="rounded-lg p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition" title={f.is_hidden ? 'Show to users' : 'Hide from users'}>
                                                {f.is_hidden ? <EyeIcon className="h-3.5 w-3.5" /> : <EyeSlashIcon className="h-3.5 w-3.5" />}
                                            </button>
                                            {!f.is_product && (
                                                <button onClick={() => removeFolder(f)} className="rounded-lg p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 transition" title="Delete">
                                                    <TrashIcon className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                        {shownFiles.map((file) => {
                            const meta = KIND_META[file.kind] || KIND_META.other;
                            const Icon = meta.Icon;
                            return (
                                <div key={file.id} className="grid grid-cols-12 divide-x divide-gray-200 text-[11px] sm:text-xs items-stretch hover:bg-indigo-50/40 transition">
                                    <button onClick={() => setPreview(file)} className="col-span-6 flex items-center gap-2 min-w-0 text-left px-3 py-1.5">
                                        <span className="h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: meta.soft }}>
                                            <Icon className="h-3.5 w-3.5" style={{ color: meta.tint }} />
                                        </span>
                                        <span className="font-semibold truncate text-gray-800">{file.name}</span>
                                    </button>
                                    <div className="col-span-2 px-3 py-1.5 flex items-center">
                                        <span className="text-[9px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5" style={{ color: meta.tint, backgroundColor: meta.soft }}>{meta.label}</span>
                                    </div>
                                    <div className="col-span-2 px-3 py-1.5 flex items-center text-gray-400">{prettySize(file.size_bytes)}</div>
                                    <div className="col-span-2 px-3 py-1.5 flex items-center justify-end gap-1">
                                        <button onClick={() => downloadFile(file)} className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 transition" title="Download">
                                            <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                                        </button>
                                        {isAdmin && (
                                            <button onClick={() => removeFile(file)} className="rounded-lg p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 transition" title="Delete">
                                                <TrashIcon className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ===== Preview modal ===== */}
            {preview && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setPreview(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <span className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: (KIND_META[preview.kind] || KIND_META.other).soft }}>
                                    {(() => { const I = (KIND_META[preview.kind] || KIND_META.other).Icon; return <I className="h-4 w-4" style={{ color: (KIND_META[preview.kind] || KIND_META.other).tint }} />; })()}
                                </span>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold truncate text-gray-800">{preview.name}</p>
                                    <p className="text-[11px] text-gray-400">
                                        {(KIND_META[preview.kind] || KIND_META.other).label}{preview.size_bytes ? ` \u00b7 ${prettySize(preview.size_bytes)}` : ''}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button onClick={() => downloadFile(preview)}
                                    className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90" style={{ backgroundColor: themeColor }}>
                                    <ArrowDownTrayIcon className="h-3.5 w-3.5" /> Download
                                </button>
                                <button onClick={() => setPreview(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition">
                                    <XMarkIcon className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto bg-gray-100 flex items-center justify-center p-3">
                            {preview.kind === 'image' ? (
                                <img src={mediaUrl(preview)} alt={preview.name} className="max-h-[70vh] max-w-full object-contain rounded-lg" />
                            ) : preview.kind === 'video' ? (
                                <video src={mediaUrl(preview)} controls className="max-h-[70vh] max-w-full rounded-lg" />
                            ) : preview.kind === 'pdf' ? (
                                <iframe src={mediaUrl(preview)} title={preview.name} className="w-full h-[70vh] rounded-lg bg-white" />
                            ) : (
                                <div className="text-center py-16">
                                    {(() => {
                                        const Icon = (KIND_META[preview.kind] || KIND_META.other).Icon;
                                        return <Icon className="mx-auto h-12 w-12 text-gray-300" />;
                                    })()}
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