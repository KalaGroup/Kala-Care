/* ============================================================================
   Rich text for "Purpose of Approval" — paste an Excel range and keep the table
   ----------------------------------------------------------------------------
   Excel (and Google Sheets / Word) puts TWO flavours on the clipboard:
     • text/html  — a real <table> with the cell formatting in a <style> block
     • text/plain — the same range as tab-separated rows
   The editor prefers the HTML flavour, folds the <style> block's class rules
   back into inline styles (Excel keeps almost all formatting in `class=xl65`
   style rules, which would be lost the moment the markup leaves its document),
   then rebuilds the markup from an allow-list. Nothing else survives: no
   script/style/event handler/URL ever reaches the DOM or the database.

   Falls back to the tab-separated flavour when an app offers plain text only.

   The stored value is that sanitized HTML. Old records hold plain text — every
   reader here treats a value without markup as plain text, so nothing needs a
   migration.
   ========================================================================== */

const ALLOWED_TAGS = new Set([
    'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'CAPTION', 'COLGROUP', 'COL',
    'P', 'DIV', 'BR', 'HR', 'SPAN', 'FONT',
    'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SUB', 'SUP', 'SMALL', 'MARK',
    'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'CODE',
]);

// dropped WITH their contents (everything else unknown is unwrapped instead)
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'HEAD', 'META', 'LINK', 'TITLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON']);

const ALLOWED_ATTRS = { TD: ['colspan', 'rowspan'], TH: ['colspan', 'rowspan'] };

// visual properties worth keeping — layout/positioning ones are not, they would
// let pasted markup escape its box
const ALLOWED_STYLE_PROPS = new Set([
    'color', 'background-color', 'background', 'font-weight', 'font-style', 'font-size',
    'font-family', 'text-align', 'text-decoration', 'vertical-align', 'white-space',
    'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
    'border-color', 'border-style', 'border-width', 'border-collapse',
    'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'width', 'height', 'min-width',
]);

const UNSAFE_VALUE = /url\s*\(|expression\s*\(|javascript:|@import|behaviou?r\s*:/i;

const cleanStyle = (styleText) => {
    const out = [];
    for (const decl of String(styleText || '').split(';')) {
        const i = decl.indexOf(':');
        if (i < 0) continue;
        const prop = decl.slice(0, i).trim().toLowerCase();
        const val = decl.slice(i + 1).trim();
        if (!val || !ALLOWED_STYLE_PROPS.has(prop) || UNSAFE_VALUE.test(val)) continue;
        // Excel writes point sizes; anything huge would blow the layout apart
        if (prop === 'font-size' && /^\d+(\.\d+)?(pt|px)$/i.test(val) && parseFloat(val) > 20) continue;
        out.push(`${prop}:${val}`);
    }
    return out.join(';');
};

/* Excel keeps the real formatting in `<style>.xl65{...}</style>` + `class=xl65`
   on each cell. Read those simple class rules and push them into the elements'
   own style so the look survives the copy. */
const inlineClassRules = (doc) => {
    const css = [...doc.querySelectorAll('style')].map(s => s.textContent || '').join('\n');
    if (!css) return;
    const rules = new Map();
    // only single-class selectors — that is all Excel/Sheets emit
    for (const m of css.matchAll(/\.([\w-]+)\s*(?:,\s*\.[\w-]+\s*)*\{([^}]*)\}/g)) {
        const decls = m[2].replace(/\s+/g, ' ').trim();
        for (const sel of m[0].slice(0, m[0].indexOf('{')).split(',')) {
            const name = sel.trim().replace(/^\./, '');
            if (name) rules.set(name, (rules.get(name) ? rules.get(name) + ';' : '') + decls);
        }
    }
    if (!rules.size) return;
    doc.querySelectorAll('[class]').forEach(el => {
        const own = el.getAttribute('style') || '';
        const fromClass = String(el.getAttribute('class') || '').split(/\s+/)
            .map(c => rules.get(c)).filter(Boolean).join(';');
        // the element's own style wins over the class rule, so it goes last
        if (fromClass) el.setAttribute('style', `${fromClass};${own}`);
    });
};

const copyNode = (src, dstParent, doc) => {
    for (const node of [...src.childNodes]) {
        if (node.nodeType === 3) {                       // text
            dstParent.appendChild(document.createTextNode(node.nodeValue));
            continue;
        }
        if (node.nodeType !== 1) continue;               // comments etc.
        const tag = node.tagName.toUpperCase();
        if (DROP_TAGS.has(tag)) continue;
        if (!ALLOWED_TAGS.has(tag)) {                    // unwrap: keep the text
            copyNode(node, dstParent, doc);
            continue;
        }
        const el = document.createElement(tag.toLowerCase());
        for (const attr of ALLOWED_ATTRS[tag] || []) {
            const v = node.getAttribute(attr);
            if (v && /^\d{1,3}$/.test(v)) el.setAttribute(attr, v);
        }
        const style = cleanStyle(node.getAttribute('style'));
        if (style) el.setAttribute('style', style);
        copyNode(node, el, doc);
        dstParent.appendChild(el);
    }
};

/** Rebuild arbitrary pasted markup as a safe subset. Returns an HTML string. */
export const sanitizeRichHtml = (html) => {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(String(html), 'text/html');
    inlineClassRules(doc);
    const out = document.createElement('div');
    copyNode(doc.body, out, doc);
    // tables always get gridlines and collapse, whatever the source said
    out.querySelectorAll('table').forEach(t => {
        t.setAttribute('style', `${t.getAttribute('style') || ''};border-collapse:collapse`);
    });
    return out.innerHTML.trim();
};

const escapeHtml = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Tab-separated clipboard text (the plain-text flavour of an Excel range)
 *  becomes a table; anything else becomes escaped text with line breaks. */
export const plainToRichHtml = (text) => {
    const raw = String(text ?? '').replace(/\r\n?/g, '\n');
    if (!raw) return '';
    const lines = raw.replace(/\n$/, '').split('\n');
    const isGrid = lines.length > 0 && lines.some(l => l.includes('\t'));
    if (!isGrid) return escapeHtml(raw).replace(/\n/g, '<br>');
    const cellStyle = 'border:1px solid #d1d5db;padding:2px 6px';
    const rows = lines.map(line =>
        `<tr>${line.split('\t').map(c => `<td style="${cellStyle}">${escapeHtml(c.trim()) || '&nbsp;'}</td>`).join('')}</tr>`
    ).join('');
    return `<table style="border-collapse:collapse">${rows}</table>`;
};

/** Does this stored value carry markup, or is it a legacy plain-text purpose? */
export const isRichHtml = (v) =>
    /<(table|tr|td|th|p|div|br|ul|ol|li|span|b|strong|i|em|u|h[1-6])\b[^>]*>/i.test(String(v || ''));

/** Flatten a stored value to readable plain text — used by the list columns,
 *  the Excel export and anywhere a single line is needed. */
export const richToText = (v) => {
    const s = String(v ?? '');
    if (!s) return '';
    if (!isRichHtml(s)) return s;
    const doc = new DOMParser().parseFromString(s, 'text/html');
    const walk = (node) => {
        let out = '';
        for (const n of node.childNodes) {
            if (n.nodeType === 3) { out += n.nodeValue.replace(/\u00a0/g, ' '); continue; }
            if (n.nodeType !== 1) continue;
            const tag = n.tagName.toUpperCase();
            if (tag === 'BR') { out += '\n'; continue; }
            if (tag === 'TD' || tag === 'TH') { out += `${walk(n).trim()}\t`; continue; }
            if (tag === 'TR') { out += `${walk(n).replace(/\t$/, '')}\n`; continue; }
            out += walk(n);
            if (['P', 'DIV', 'LI', 'TABLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tag)) out += '\n';
        }
        return out;
    };
    return walk(doc.body).replace(/\n{3,}/g, '\n\n').trim();
};

/** Same as richToText, but pasted tables are left out entirely — a grid does
 *  not survive being flattened into a single spreadsheet cell, so the Excel
 *  export takes this and keeps only what the user typed around the table. */
export const richToTextNoTables = (v) => {
    const s = String(v ?? '');
    if (!s) return '';
    if (!isRichHtml(s)) return s.trim();
    const doc = new DOMParser().parseFromString(s, 'text/html');
    doc.body.querySelectorAll('table').forEach(t => t.remove());
    // re-wrapped so the value still reads as markup and entities decode once more
    return richToText(`<div>${doc.body.innerHTML}</div>`);
};

/* The Purpose column calls richToLine for every visible row, and the table
   re-renders on every tab / filter / search keystroke. Parsing the same markup
   through DOMParser each time was the cost; stored values are immutable, so the
   flattened line is cached by value. Bounded so a long session cannot grow it
   without limit. */
const LINE_CACHE = new Map();
const LINE_CACHE_MAX = 500;

/** One-line form for a table cell / tooltip. */
export const richToLine = (v) => {
    const s = String(v ?? '');
    if (!s) return '';
    if (!isRichHtml(s)) return s.replace(/\s+/g, ' ').trim();   // plain text: no parse at all
    const hit = LINE_CACHE.get(s);
    if (hit !== undefined) return hit;
    const line = richToText(s).replace(/\s+/g, ' ').trim();
    if (LINE_CACHE.size >= LINE_CACHE_MAX) LINE_CACHE.clear();
    LINE_CACHE.set(s, line);
    return line;
};

/** True when the editor holds nothing meaningful (`<br>`, empty divs, spaces). */
export const isRichEmpty = (v) => {
    const s = String(v ?? '');
    if (!s.trim()) return true;
    if (/<(table|img)\b/i.test(s)) return false;
    return richToText(s).replace(/\u00a0/g, ' ').trim() === '';
};

/** Stored value → HTML safe to inject when displaying it. Legacy plain text is
 *  escaped and keeps its line breaks. */
export const richToDisplayHtml = (v) => {
    const s = String(v ?? '');
    if (!s) return '';
    return isRichHtml(s) ? sanitizeRichHtml(s) : escapeHtml(s).replace(/\n/g, '<br>');
};
