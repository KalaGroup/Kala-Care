/* Attachment pages for letter printing — shared by the drive-letter composers
   (CustomerEng / CustomerEng2) and the Welcome Letter.

   Every attachment prints as REAL pages that each fill exactly one A4 sheet:
     image → ONE page, centred, shrunk to fit
     pdf   → each PDF page rasterised and centred on its own sheet
     other → one page carrying just the file name

   An attachment's bytes can come as {content} (base64), {blob}, or {url}
   (object URL or http — same-origin/cached). Rasterising a PDF is the slow
   part and the same default files are printed over and over, so finished
   pages are memoised per attachment (see _cache below). */

const PDF_JS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDF_WORKER_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let pdfJsPromise = null;
export const loadPdfJs = () => {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfJsPromise) return pdfJsPromise;
    pdfJsPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = PDF_JS_SRC;
        s.onload = () => {
            try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC; } catch (e) { /* ignore */ }
            resolve(window.pdfjsLib);
        };
        s.onerror = () => { pdfJsPromise = null; reject(new Error('Could not load the PDF renderer')); };
        document.head.appendChild(s);
    });
    return pdfJsPromise;
};

const escapeHtml = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const extOf = (name) => String(name || '').split('.').pop().toLowerCase();
const isImageAtt = (type, name) =>
    String(type || '').toLowerCase().startsWith('image/')
    || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(extOf(name));
const isPdfAtt = (type, name) =>
    String(type || '').toLowerCase() === 'application/pdf' || extOf(name) === 'pdf';

const b64ToBytes = (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
};

const bytesOf = async (a) => {
    if (a.content) return b64ToBytes(a.content);
    if (a.blob) return new Uint8Array(await a.blob.arrayBuffer());
    if (a.url) {
        const res = await fetch(a.url);
        if (!res.ok) throw new Error('File not available');
        return new Uint8Array(await res.arrayBuffer());
    }
    return null;
};

/* ~170 dpi across an A4 width — sharp on paper, but a fraction of the pixels
   (and time) of the old scale-2 render of an already-large page. JPEG on a
   white ground instead of PNG: a scanned page compresses ~10x smaller, so the
   pages inject and spool much faster. */
const TARGET_PAGE_W_PX = 1400;

const renderPdfPagesToImages = async (bytes) => {
    const pdfjsLib = await loadPdfJs();
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const out = [];
    try {
        for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const base = page.getViewport({ scale: 1 });
            const scale = Math.min(2.5, Math.max(1, TARGET_PAGE_W_PX / base.width));
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport }).promise;
            out.push({ src: canvas.toDataURL('image/jpeg', 0.85), wPx: canvas.width, hPx: canvas.height });
            canvas.width = 0; canvas.height = 0;   // release the bitmap early
        }
    } finally {
        try { pdf.destroy(); } catch (e) { /* ignore */ }
    }
    return out;
};

/* Normalise any browser-decodable image (png/webp/gif/…) to a JPEG data URL on
   a white ground, with pixel dimensions — jsPDF can embed only PNG/JPEG, and
   the print pages don't need transparency on white paper anyway. */
const imageToJpeg = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            resolve({ src: canvas.toDataURL('image/jpeg', 0.88), wPx: canvas.width, hPx: canvas.height });
        } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error('image failed to decode'));
    img.src = src;
});

/* One printed sheet: a tiny file-name label on top, the content centred in the
   rest and shrunk to fit — never spilling onto a second sheet. The page height
   comes from the caller because the print windows differ: the composers print
   with @page margin 0 (full 297mm usable), the Welcome Letter with 10mm/8mm
   paper margins (≈277mm usable). */
const attPage = (label, inner, pageHeightMm) => `
<div style="page-break-before:always;position:relative;width:100%;height:${pageHeightMm}mm;overflow:hidden;background:#fff;">
  <div style="position:absolute;top:3mm;left:6mm;right:6mm;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(label)}</div>
  <div style="position:absolute;top:10mm;left:6mm;right:6mm;bottom:6mm;display:flex;align-items:center;justify-content:center;">${inner}</div>
</div>`;

const IMG_FIT = 'max-width:100%;max-height:100%;width:auto;height:auto;display:block;';
const NOTE_STYLE = 'font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#888;';

/* Finished page HTML per attachment. Keyed on name + payload size — printing
   the same letter (or the next letter with the same default files) reuses the
   rasterised pages instead of re-rendering them. */
const _cache = new Map();
const CACHE_MAX = 10;
const cacheKey = (a, name, pageHeightMm) =>
    [name, (a.content || '').length, a.url || '', (a.blob && a.blob.size) || 0, pageHeightMm].join('|');

export async function buildAttachmentPagesHtml(attachments, { pageHeightMm = 296 } = {}) {
    const atts = (attachments || []).filter(Boolean);
    if (atts.length === 0) return '';
    let html = '';
    for (const a of atts) {
        const name = a.name || a.file_name || 'attachment';
        const key = cacheKey(a, name, pageHeightMm);
        if (_cache.has(key)) { html += _cache.get(key); continue; }
        let part = '';
        try {
            if (isImageAtt(a.type, name)) {
                const src = a.content
                    ? `data:${a.type || 'image/png'};base64,${a.content}`
                    : (a.url || '');
                part = src
                    ? attPage(`Attachment: ${name}`, `<img src="${src}" style="${IMG_FIT}" />`, pageHeightMm)
                    : attPage(`Attachment: ${name}`, `<div style="${NOTE_STYLE}">[File attached]</div>`, pageHeightMm);
            } else if (isPdfAtt(a.type, name)) {
                const bytes = await bytesOf(a);
                if (!bytes) throw new Error('no data');
                const pages = await renderPdfPagesToImages(bytes);
                pages.forEach((pg, i) => {
                    part += attPage(`Attachment: ${name} — page ${i + 1}/${pages.length}`,
                        `<img src="${pg.src}" style="${IMG_FIT}" />`, pageHeightMm);
                });
            } else {
                part = attPage(`Attachment: ${name}`,
                    `<div style="${NOTE_STYLE}">[File attached — not printable]</div>`, pageHeightMm);
            }
        } catch (e) {
            part = attPage(`Attachment: ${name}`,
                `<div style="${NOTE_STYLE}">[Could not render this file — name only]</div>`, pageHeightMm);
        }
        _cache.set(key, part);
        if (_cache.size > CACHE_MAX) _cache.delete(_cache.keys().next().value);
        html += part;
    }
    return html;
}

/* The same pages as raw images, for callers that build a REAL PDF (jsPDF) —
   the Dashboard's Letter Report embeds them as extra PDF pages so its viewer,
   Print and Download all carry the attachments. Returns one entry per printed
   sheet: { label, src?, wPx?, hPx? } — an entry without src is a name-only
   page (file that can't be rendered). Memoised like the HTML pages. */
const _imgCache = new Map();
export async function buildAttachmentPageImages(attachments) {
    const atts = (attachments || []).filter(Boolean);
    const out = [];
    for (const a of atts) {
        const name = a.name || a.file_name || 'attachment';
        const key = cacheKey(a, name, 'img');
        if (_imgCache.has(key)) { out.push(..._imgCache.get(key)); continue; }
        let part = [];
        try {
            if (isImageAtt(a.type, name)) {
                const src = a.content
                    ? `data:${a.type || 'image/png'};base64,${a.content}`
                    : (a.url || '');
                part = src
                    ? [{ label: `Attachment: ${name}`, ...(await imageToJpeg(src)) }]
                    : [{ label: `Attachment: ${name} — [file attached]` }];
            } else if (isPdfAtt(a.type, name)) {
                const bytes = await bytesOf(a);
                if (!bytes) throw new Error('no data');
                const pages = await renderPdfPagesToImages(bytes);
                part = pages.map((pg, i) => ({
                    label: `Attachment: ${name} — page ${i + 1}/${pages.length}`, ...pg,
                }));
            } else {
                part = [{ label: `Attachment: ${name} — [file attached, not printable]` }];
            }
        } catch (e) {
            part = [{ label: `Attachment: ${name} — [could not render this file]` }];
        }
        _imgCache.set(key, part);
        if (_imgCache.size > CACHE_MAX) _imgCache.delete(_imgCache.keys().next().value);
        out.push(...part);
    }
    return out;
}
