import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Folder, FolderPlus, X, Upload, Download, Trash2, Pencil, ArrowLeft,
  FileText, FileSpreadsheet, FileImage, File as FileIcon, Loader2,
} from 'lucide-react';

/*
  MOM "Master Folder" — a Master-Admin-only file store shown from the MOM
  Tracking page. Folders hold reference files (Word / Excel / CSV / PDF / image);
  bytes live in the database. Mirrors the Knowledge Bank's folder cards, upload,
  view/download and per-item action icons.
*/

const ACCEPT = '.doc,.docx,.xls,.xlsx,.csv,.pdf,.jpg,.jpeg,.png,.gif,.webp,.bmp,image/*';

// Same action-icon palette as the Knowledge Bank.
const actBase = 'inline-flex items-center justify-center rounded-md p-1.5 bg-gray-50 border border-gray-200 hover:bg-white transition';
const ACT = {
  download: 'text-emerald-600 hover:bg-emerald-50',
  edit: 'text-blue-600 hover:bg-blue-50',
  view: 'text-amber-600 hover:bg-amber-50',
  del: 'text-red-600 hover:bg-red-50',
};

const fmtSize = (b) => {
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
};
const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

// A proper yellow folder icon (same look as the Knowledge Bank).
const FolderYellow = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.5 6.2c0-1 .8-1.7 1.7-1.7h4.8c.5 0 1 .2 1.3.6l1.1 1.3h8.4c1 0 1.7.8 1.7 1.7v9.4c0 1-.8 1.7-1.7 1.7H4.2c-1 0-1.7-.8-1.7-1.7V6.2Z" fill="#E0A50C" />
    <path d="M2.5 9.3h19v8.3c0 1-.8 1.7-1.7 1.7H4.2c-1 0-1.7-.8-1.7-1.7V9.3Z" fill="#F6C23E" />
  </svg>
);

const KindIcon = ({ kind, size = 20 }) => {
  const map = {
    image: [FileImage, '#0f7a52'],
    pdf: [FileText, '#dc2626'],
    word: [FileText, '#2563eb'],
    excel: [FileSpreadsheet, '#16a34a'],
    csv: [FileSpreadsheet, '#0d9488'],
    other: [FileIcon, '#6b7280'],
  };
  const [Ico, color] = map[kind] || map.other;
  return <Ico size={size} style={{ color }} />;
};

export default function MomFiles({ apiBase, authHeaders, brand = '#2f3192', brandDark = '#23255f', onClose }) {
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);          // the folder currently opened (or null = folder list)
  const [files, setFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);       // new-folder input visible
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState(null);    // folder id being renamed
  const [renameVal, setRenameVal] = useState('');
  const [upload, setUpload] = useState(null);        // { pct, count } while uploading
  const fileRef = useRef(null);

  const hdrs = { headers: authHeaders };

  const loadFolders = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${apiBase}/folders`, hdrs);
      setFolders(data?.folders || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not load folders');
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  useEffect(() => { loadFolders(); }, [loadFolders]);

  const openFolder = async (fo) => {
    setOpen(fo); setFiles([]); setFilesLoading(true);
    try {
      const { data } = await axios.get(`${apiBase}/folders/${fo.id}/files`, hdrs);
      setFiles(data?.files || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not load files');
    } finally { setFilesLoading(false); }
  };
  const reopen = async () => { if (open) await openFolder(open); await loadFolders(); };

  const createFolder = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    const fd = new FormData(); fd.append('name', name);
    try {
      await axios.post(`${apiBase}/folders`, fd, hdrs);
      toast.success('Folder created');
      setNewName(''); setAdding(false);
      await loadFolders();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not create folder');
    } finally { setBusy(false); }
  };

  const saveRename = async (id) => {
    const name = renameVal.trim();
    if (!name) { setRenaming(null); return; }
    setBusy(true);
    const fd = new FormData(); fd.append('name', name);
    try {
      await axios.put(`${apiBase}/folders/${id}`, fd, hdrs);
      setRenaming(null);
      await loadFolders();
      if (open?.id === id) setOpen((o) => ({ ...o, name }));
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not rename folder');
    } finally { setBusy(false); }
  };

  const deleteFolder = async (fo) => {
    if (!window.confirm(`Delete folder “${fo.name}” and all ${fo.fileCount} file(s) inside it?`)) return;
    setBusy(true);
    try {
      await axios.delete(`${apiBase}/folders/${fo.id}`, hdrs);
      toast.success('Folder deleted');
      if (open?.id === fo.id) setOpen(null);
      await loadFolders();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not delete folder');
    } finally { setBusy(false); }
  };

  const uploadFiles = async (list) => {
    if (!open || !list?.length) return;
    const count = list.length;
    setBusy(true); setUpload({ pct: 0, count });
    const fd = new FormData();
    fd.append('folder_id', String(open.id));
    Array.from(list).forEach((f) => fd.append('files', f));
    const t = toast.loading(`Uploading ${count} file(s)… 0%`);
    try {
      const { data } = await axios.post(`${apiBase}/files`, fd, {
        headers: authHeaders,
        // Live progress of the bytes leaving the browser.
        onUploadProgress: (e) => {
          const pct = e.total ? Math.round((e.loaded * 100) / e.total) : 0;
          setUpload({ pct, count });
          toast.loading(pct >= 100 ? `Saving ${count} file(s)…` : `Uploading ${count} file(s)… ${pct}%`, { id: t });
        },
      });
      // Update state straight from the response — no extra round-trips.
      const saved = data?.files || [];
      setFiles((prev) => [...saved, ...prev]);
      setFolders((prev) => prev.map((fo) => (fo.id === open.id ? { ...fo, fileCount: (fo.fileCount || 0) + saved.length } : fo)));
      toast.success(`Uploaded ${saved.length || count} file(s)`, { id: t });
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Upload failed', { id: t });
    } finally { setBusy(false); setUpload(null); if (fileRef.current) fileRef.current.value = ''; }
  };

  const deleteFile = async (f) => {
    if (!window.confirm(`Delete “${f.name}”?`)) return;
    setBusy(true);
    try {
      await axios.delete(`${apiBase}/files/${f.id}`, hdrs);
      await reopen();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not delete file');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 max-md:p-2" style={{ background: 'rgba(20,26,32,.55)' }}>
      {/* Fixed-size popup */}
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 920, maxWidth: '95vw', height: 620, maxHeight: '92vh' }}>
        {/* header */}
        <div className="flex items-center gap-3 px-5 py-3 text-white flex-shrink-0" style={{ background: `linear-gradient(120deg, ${brand} 0%, ${brandDark} 100%)` }}>
          <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-white/15 flex-shrink-0">
            <Folder className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold leading-tight flex items-center gap-1.5">
              {open ? (
                <>
                  <button onClick={() => setOpen(null)} className="hover:opacity-80" title="Back to all folders"><ArrowLeft className="h-4 w-4" /></button>
                  <span className="opacity-80">Master Folder</span>
                  <span className="opacity-60">/</span>
                  <span className="truncate">{open.name}</span>
                </>
              ) : 'Master Folder'}
            </h3>
            <p className="text-[11px] text-white/70 leading-tight">Master Admin file store · Word, Excel, CSV, PDF &amp; images</p>
          </div>
          <button onClick={onClose} className="ml-auto rounded-lg p-1 text-white/70 hover:bg-white/15 hover:text-white transition"><X className="h-5 w-5" /></button>
        </div>

        {/* toolbar */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-gray-200 bg-gray-50 flex-shrink-0 flex-wrap">
          {!open ? (
            <>
              <span className="text-[12px] font-semibold text-gray-600">{folders.length} folder{folders.length === 1 ? '' : 's'}</span>
              <div className="ml-auto flex items-center gap-2 flex-wrap min-w-0">
                {adding ? (
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') { setAdding(false); setNewName(''); } }}
                      placeholder="Folder name" className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-[13px] outline-none focus:ring-2 focus:ring-indigo-100 max-sm:w-full min-w-0" />
                    <button onClick={createFolder} disabled={busy || !newName.trim()} className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50" style={{ background: brand }}>Create</button>
                    <button onClick={() => { setAdding(false); setNewName(''); }} className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-[12px] font-medium text-gray-600">Cancel</button>
                  </span>
                ) : (
                  <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:opacity-90" style={{ background: brand }}>
                    <FolderPlus className="h-4 w-4" /> New Folder
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <span className="text-[12px] font-semibold text-gray-600">{files.length} file{files.length === 1 ? '' : 's'}</span>
              <div className="ml-auto flex items-center gap-2">
                <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => uploadFiles(e.target.files)} />
                <button onClick={() => fileRef.current?.click()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:opacity-90 disabled:opacity-70" style={{ background: brand }}>
                  {upload
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> {upload.pct >= 100 ? 'Saving…' : `Uploading ${upload.pct}%`}</>
                    : <><Upload className="h-4 w-4" /> Upload files</>}
                </button>
              </div>
            </>
          )}
        </div>

        {/* upload progress bar */}
        {upload && (
          <div className="flex items-center gap-2 px-5 py-1.5 border-b border-gray-100 bg-white flex-shrink-0">
            <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" style={{ color: brand }} />
            <span className="text-[11px] font-semibold text-gray-600 whitespace-nowrap">
              {upload.pct >= 100 ? `Saving ${upload.count} file(s)…` : `Uploading ${upload.count} file(s)… ${upload.pct}%`}
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-150" style={{ width: `${upload.pct}%`, background: brand }} />
            </div>
          </div>
        )}

        {/* body */}
        <div className="flex-1 min-h-0 overflow-auto p-4">
          {!open ? (
            loading ? (
              <div className="py-16 flex justify-center text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : folders.length === 0 ? (
              <div className="py-16 text-center text-gray-400 text-[13px]">
                <FolderYellow className="h-12 w-12 mx-auto opacity-70" />
                <p className="mt-2 font-medium">No folders yet.</p>
                <p className="text-[12px]">Click <b>New Folder</b> to create one, then upload files inside it.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {folders.map((fo) => (
                  <div key={fo.id} className="group flex flex-col rounded-xl p-2.5 border border-gray-200 hover:bg-indigo-50/50 transition">
                    <button onClick={() => openFolder(fo)} className="w-full flex flex-col items-center" title={fo.name}>
                      <FolderYellow className="w-16 h-16 transition-transform group-hover:scale-105 drop-shadow-sm" />
                      {renaming === fo.id ? (
                        <input autoFocus value={renameVal} onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setRenameVal(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveRename(fo.id); if (e.key === 'Escape') setRenaming(null); }}
                          onBlur={() => saveRename(fo.id)}
                          className="mt-1.5 w-full rounded border border-gray-300 px-1.5 py-1 text-[12.5px] text-center outline-none focus:ring-2 focus:ring-indigo-100" />
                      ) : (
                        <p className="mt-1.5 text-[12.5px] font-bold text-gray-800 text-center break-words leading-snug w-full px-0.5">{fo.name}</p>
                      )}
                      <p className="text-[10.5px] text-gray-400 text-center w-full">{fo.fileCount ? `${fo.fileCount} file${fo.fileCount === 1 ? '' : 's'}` : 'Empty'}</p>
                    </button>
                    <div className="mt-2 pt-1.5 flex items-center justify-center gap-1 flex-wrap">
                      <a href={`${apiBase}/folders/${fo.id}/download`} title="Download as ZIP" className={`${actBase} ${ACT.download}`}><Download className="h-3.5 w-3.5" /></a>
                      <button onClick={() => { setRenaming(fo.id); setRenameVal(fo.name); }} title="Rename" className={`${actBase} ${ACT.edit}`}><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => deleteFolder(fo)} title="Delete folder" className={`${actBase} ${ACT.del}`}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            filesLoading ? (
              <div className="py-16 flex justify-center text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : files.length === 0 ? (
              <div className="py-16 text-center text-gray-400 text-[13px]">
                <Upload className="h-9 w-9 mx-auto text-gray-300" />
                <p className="mt-2 font-medium">This folder is empty.</p>
                <p className="text-[12px]">Click <b>Upload files</b> to add Word, Excel, CSV, PDF or image files.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[13px] min-w-[560px]">
                  <thead>
                    <tr className="text-left text-[10.5px] font-bold uppercase tracking-wide text-gray-400 border-b border-gray-200">
                      <th className="px-2 py-2">Name</th>
                      <th className="px-2 py-2 w-24">Type</th>
                      <th className="px-2 py-2 w-24">Size</th>
                      <th className="px-2 py-2 w-32">Added</th>
                      <th className="px-2 py-2 w-32 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((f) => (
                      <tr key={f.id} className="border-b border-gray-100 hover:bg-indigo-50/30">
                        <td className="px-2 py-2">
                          <a href={`${apiBase}/files/${f.id}/view`} target="_blank" rel="noreferrer" title="Open / preview" className="flex items-center gap-2.5 min-w-0 group/link cursor-pointer">
                            <KindIcon kind={f.kind} />
                            <span className="font-semibold text-gray-800 truncate max-w-[260px] group-hover/link:text-indigo-700 group-hover/link:underline">{f.name}</span>
                          </a>
                        </td>
                        <td className="px-2 py-2 uppercase text-[11px] font-bold text-gray-500">{f.kind}</td>
                        <td className="px-2 py-2 text-gray-600 tabular-nums">{fmtSize(f.sizeBytes)}</td>
                        <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{fmtDate(f.createdAt)}</td>
                        <td className="px-2 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <a href={`${apiBase}/files/${f.id}/download`} title="Download" className={`${actBase} ${ACT.download}`}><Download className="h-3.5 w-3.5" /></a>
                            <button onClick={() => deleteFile(f)} title="Delete" className={`${actBase} ${ACT.del}`}><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
