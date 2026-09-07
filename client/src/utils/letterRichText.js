/* ============================================================================
   Letter paragraph rendering — shared by the drive letter (CustomerEng /
   CustomerEng2), the Letter Master (Campaign.jsx) and their previews.

   The start / end paragraph boxes are a WYSIWYG box (LetterParaEditor): what
   the author sees bold IS bold, and a bullet list IS a list. The stored value
   is therefore HTML, run through the project's own allow-list sanitizer.

   Paragraphs written before the WYSIWYG box are still PLAIN TEXT, and they
   keep working: a value with no markup is converted with the marker rules
   below, so an old "• line" still prints as a real bullet.

       •  bullet line          -> <ul><li>      (also "-", "*", "●")
       1. numbered line        -> <ol><li>      (also "1)" )
       **bold**                -> <strong>
       anything else           -> a justified <p>

   Emails cannot rely on stylesheets, so every tag that leaves here carries the
   INLINE styles it needs — Outlook and Gmail strip classes.

   Keep the marker rules in step with _render_letter_body() in
   server/app/controllers/welcome_letter_controller.py.
   ========================================================================== */

import { sanitizeRichHtml, isRichHtml } from '../components/approval/richText';
import { normalizePseudoLists } from './letterPseudoList';

/* The bullet library, the way a word processor offers it. `css` is what goes on
   the <ul> as list-style-type; the three native keywords are understood by every
   mail client, and the decorative ones are converted to a leading character at
   letter-render time (renderLetterParaHtml) because Outlook ignores a string
   list-style-type. `null` means "not a list" — Word's None. */
export const BULLET_STYLES = [
    { key: 'none', label: 'None', css: null, glyph: '\u2014' },
    { key: 'disc', label: 'Filled circle', css: 'disc', glyph: '\u25cf' },
    { key: 'circle', label: 'Hollow circle', css: 'circle', glyph: '\u25cb' },
    { key: 'square', label: 'Filled square', css: 'square', glyph: '\u25a0' },
    { key: 'star', label: 'Star', css: '"\u2726  "', glyph: '\u2726' },
    { key: 'diamond', label: 'Diamond', css: '"\u2756  "', glyph: '\u2756' },
    { key: 'arrow', label: 'Arrow', css: '"\u27a4  "', glyph: '\u27a4' },
    { key: 'check', label: 'Tick', css: '"\u2714  "', glyph: '\u2714' },
];

export const BULLET_RE = /^\s*[•●▪*-]\s+/;
export const NUMBER_RE = /^\s*(\d{1,3})[.)]\s+/;

/* A bare & is escaped, an EXISTING entity is left alone. Legacy paragraphs
   were typed in Word and carry things like "Chart&nbsp;"; escaping that & gave
   &amp;nbsp;, which printed the six characters "&nbsp;" in the letter. */
export const escapeLetterHtml = (s) =>
    String(s == null ? '' : s)
        .replace(/&(?!#?\w+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Does this stored paragraph carry markup, or is it a legacy plain one? */
export const isParaHtml = (v) => isRichHtml(v);

/* A business letter is justified. A line that is really a heading or a
   sign-off is short and ends up as the last line of its paragraph, which
   justify leaves alone. */
/* margin-BOTTOM, never the `margin` shorthand: the Gap control writes
   margin-bottom on a block, and a shorthand injected afterwards would silently
   wipe it out. Longhand on both sides lets "the author wins" actually work. */
const P_STYLE = 'margin-top:0;margin-bottom:8px;text-align:justify;text-justify:inter-word';
/* list-style-position:outside is what gives a wrapped bullet its hanging
   indent. It has to be INLINE: this HTML is also the emailed letter, the PDF
   and the print window, none of which load the app's stylesheet — relying on
   `.letter-rich` made a wrapped line fall flush left everywhere but the editor. */
const LIST_STYLE = ('margin-top:0;margin-bottom:8px;padding-left:22px;'
    + 'text-align:justify;list-style-position:outside');
const LI_STYLE = 'margin-top:0;margin-bottom:4px';
/* 600, not 700: at letter body size a full bold reads as a heavy blob. Inter
   ships a real semibold face, so this is a smoother weight rather than a
   synthesised one — and it has to be stated INLINE, because the letter is
   emailed and an email has no stylesheet. Keep in step with `.letter-rich
   b, strong` in index.css so the box shows what the letter prints. */
const BOLD_STYLE = 'font-weight:600';

/* **bold** on already-escaped text. */
const inlineBold = (escaped) =>
    escaped.replace(/\*\*(.+?)\*\*/g, `<strong style="${BOLD_STYLE}">$1</strong>`);

/* ---------------------------------------------------------------------------
   Legacy plain text -> HTML
   ------------------------------------------------------------------------ */
function plainToHtml(text, { styled = true, extra = '' } = {}) {
    const tail = extra ? `;${extra}` : '';
    const pStyle = styled ? ` style="${P_STYLE}${tail}"` : '';
    const listStyle = styled ? ` style="${LIST_STYLE}${tail}"` : '';
    const liStyle = styled ? ` style="${LI_STYLE}"` : '';
    const out = [];
    let para = [];
    let items = [];
    let listTag = 'ul';

    const flushPara = () => {
        if (!para.length) return;
        out.push(`<p${pStyle}>${para.join('<br>')}</p>`);
        para = [];
    };
    const flushItems = () => {
        if (!items.length) return;
        const lis = items.map((x) => `<li${liStyle}>${x}</li>`).join('');
        const marker = listTag === 'ol' ? 'decimal' : 'disc';
        const withMarker = styled
            ? listStyle.replace(/"$/, `;list-style-type:${marker}"`) : listStyle;
        out.push(`<${listTag}${withMarker}>${lis}</${listTag}>`);
        items = [];
    };

    String(text == null ? '' : text).split('\n').forEach((rawLine) => {
        const line = rawLine.replace(/\s+$/, '');
        if (!line.trim()) { flushPara(); flushItems(); return; }
        const esc = escapeLetterHtml(line);
        if (BULLET_RE.test(line)) {
            flushPara();
            if (listTag !== 'ul') { flushItems(); listTag = 'ul'; }
            items.push(inlineBold(esc.replace(BULLET_RE, '')));
        } else if (NUMBER_RE.test(line)) {
            flushPara();
            if (listTag !== 'ol') { flushItems(); listTag = 'ol'; }
            items.push(inlineBold(esc.replace(NUMBER_RE, '')));
        } else {
            flushItems();
            para.push(inlineBold(esc));
        }
    });
    flushPara();
    flushItems();
    // the last block's bottom margin would double the gap before whatever
    // follows it in the letter
    if (styled && out.length) {
        out[out.length - 1] = out[out.length - 1]
            .replace('margin-bottom:8px', 'margin-bottom:0');
    }
    return out.join('');
}

/** A stored paragraph as HTML the WYSIWYG box can edit (no letter styling —
 *  the box has its own stylesheet). Legacy plain text is converted so it opens
 *  showing real bullets and real bold, not markers. */
export function paraToEditorHtml(value) {
    const s = String(value == null ? '' : value);
    if (!s.trim()) return '';
    if (!isParaHtml(s)) return plainToHtml(s, { styled: false });
    const clean = sanitizeRichHtml(s);
    if (typeof window === 'undefined' || !window.DOMParser) return clean;
    // pasted pseudo-bullets become real ones here too, so what the author edits
    // is what the letter prints
    const doc = new DOMParser().parseFromString(clean, 'text/html');
    normalizePseudoLists(doc);
    return doc.body.innerHTML;
}

/* Push the letter's inline styles onto sanitized editor HTML. Emails have no
   stylesheet, so <p>/<ul>/<li> must carry them element by element. */
function styleForLetter(html, extra) {
    if (typeof window === 'undefined' || !window.DOMParser) return html;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // Word-pasted "bullets" are <br> lines with a literal • — make them a
    // real list first, or the wrapped words fall back to the left margin
    normalizePseudoLists(doc);
    /* The author wins: a letter style is injected only for a property the
       element does not already set, otherwise appending ours would quietly
       override the colour, size or gap chosen in the editor. */
    const add = (el, css) => {
        const own = el.getAttribute('style') || '';
        if (!own) { el.setAttribute('style', css); return; }
        const theirs = new Set(own.split(';')
            .map((d) => d.split(':')[0].trim().toLowerCase()).filter(Boolean));
        const keep = css.split(';').filter((d) => {
            const p = d.split(':')[0].trim().toLowerCase();
            return p && !theirs.has(p);
        });
        el.setAttribute('style', keep.length ? `${own};${keep.join(';')}` : own);
    };
    doc.body.querySelectorAll('p, div').forEach((el) => {
        // a <div> wrapping a list is a container, not a paragraph
        if (el.tagName === 'DIV' && el.querySelector('ul, ol, p, div')) return;
        add(el, P_STYLE + (extra ? `;${extra}` : ''));
    });
    doc.body.querySelectorAll('ul, ol').forEach((el) => {
        // …and a marker only when the author has not chosen one, so a bullet
        // picked from the library still wins
        const own = el.getAttribute('style') || '';
        const marker = /list-style(-type)?\s*:/i.test(own)
            ? '' : `;list-style-type:${el.tagName === 'OL' ? 'decimal' : 'disc'}`;
        add(el, LIST_STYLE + marker + (extra ? `;${extra}` : ''));
    });
    doc.body.querySelectorAll('li').forEach((el) => add(el, LI_STYLE));
    doc.body.querySelectorAll('b, strong').forEach((el) => add(el, BOLD_STYLE));
    decorativeBulletsToText(doc);
    // same trim as plainToHtml: the last block must not add a gap of its own
    const last = doc.body.lastElementChild;
    if (last && !/margin-bottom\s*:/i.test(last.getAttribute('style') || '')) {
        last.setAttribute('style',
            `${last.getAttribute('style') || ''};margin-bottom:0`);
    }
    return doc.body.innerHTML;
}

/* A decorative bullet is written as `list-style-type: "\u2726  "`, which the
   browser draws but Outlook's Word engine ignores — it would silently print an
   unmarked list. So for the letter the marker is turned OFF and the character
   is written into each row as real text, which every client can render. */
function decorativeBulletsToText(doc) {
    doc.body.querySelectorAll('ul').forEach((ul) => {
        const type = (ul.style.listStyleType || '').trim();
        const m = /^["'](.+?)\s*["']$/.exec(type);
        if (!m) return;
        const glyph = m[1].trim();
        ul.style.listStyleType = 'none';
        ul.setAttribute('style',
            `${ul.getAttribute('style') || ''};list-style:none;padding-left:6px`);
        ul.querySelectorAll(':scope > li').forEach((li) => {
            li.setAttribute('style', `${li.getAttribute('style') || ''};list-style:none`);
            const mark = doc.createElement('span');
            mark.setAttribute('style', 'display:inline-block;width:18px');
            mark.textContent = glyph;
            li.insertBefore(mark, li.firstChild);
        });
    });
}

/**
 * A stored paragraph as the HTML that goes into the letter / the email.
 * @param {string} value      stored paragraph (HTML from the box, or legacy text)
 * @param {object} [opts]
 * @param {string} [opts.pStyle]  extra CSS appended to every block
 */
export function renderLetterParaHtml(value, opts = {}) {
    const s = String(value == null ? '' : value);
    if (!s.trim()) return '';
    if (isParaHtml(s)) return styleForLetter(sanitizeRichHtml(s), opts.pStyle);
    return plainToHtml(s, { extra: opts.pStyle || '' });
}

/**
 * The same paragraph as PLAIN TEXT, for the text/plain half of an email and
 * for the WhatsApp body: list items keep a marker and numbers are renumbered
 * per list, so a mis-typed "1. 1. 1." still reads 1, 2, 3.
 */
export function renderLetterParaText(value) {
    const s = String(value == null ? '' : value);
    if (!s.trim()) return '';

    if (isParaHtml(s)) {
        if (typeof window === 'undefined' || !window.DOMParser) {
            return s.replace(/<[^>]+>/g, '');
        }
        const doc = new DOMParser().parseFromString(sanitizeRichHtml(s), 'text/html');
        const lines = [];
        const walkInline = (node) => {
            let out = '';
            node.childNodes.forEach((n) => {
                if (n.nodeType === 3) { out += n.nodeValue.replace(/\u00a0/g, ' '); return; }
                if (n.nodeType !== 1) return;
                out += n.tagName === 'BR' ? '\n' : walkInline(n);
            });
            return out;
        };
        const walk = (node) => {
            node.childNodes.forEach((n) => {
                if (n.nodeType === 3) {
                    const t = n.nodeValue.replace(/\u00a0/g, ' ').trim();
                    if (t) lines.push(t);
                    return;
                }
                if (n.nodeType !== 1) return;
                const tag = n.tagName;
                if (tag === 'UL' || tag === 'OL') {
                    let i = 0;
                    n.querySelectorAll(':scope > li').forEach((li) => {
                        i += 1;
                        const marker = tag === 'OL' ? `${i}. ` : '• ';
                        walkInline(li).split('\n').forEach((part, k) => {
                            const t = part.trim();
                            if (t) lines.push(`  ${k === 0 ? marker : '   '}${t}`);
                        });
                    });
                    return;
                }
                if (tag === 'P' || tag === 'DIV') {
                    if (n.querySelector('ul, ol, p, div')) { walk(n); return; }
                    walkInline(n).split('\n').forEach((part) => lines.push(part.trim()));
                    lines.push('');
                    return;
                }
                if (tag === 'BR') { lines.push(''); return; }
                const t = walkInline(n).trim();
                if (t) lines.push(t);
            });
        };
        walk(doc.body);
        return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }

    // legacy plain text
    let n = 0;
    return String(s).split('\n').map((rawLine) => {
        const line = rawLine.replace(/\s+$/, '');
        if (!line.trim()) { n = 0; return ''; }
        const plain = line.replace(/\*\*(.+?)\*\*/g, '$1');
        if (BULLET_RE.test(plain)) { n = 0; return `  • ${plain.replace(BULLET_RE, '')}`; }
        if (NUMBER_RE.test(plain)) { n += 1; return `  ${n}. ${plain.replace(NUMBER_RE, '')}`; }
        n = 0;
        return plain;
    }).join('\n');
}

/** True when a stored paragraph holds nothing a reader would see. */
export function isParaEmpty(value) {
    const s = String(value == null ? '' : value);
    if (!s.trim()) return true;
    if (!isParaHtml(s)) return false;
    return !s.replace(/<[^>]+>/g, '').replace(/&nbsp;|\u00a0/g, ' ').trim();
}
