import React, { useEffect, useRef, useState } from 'react';
import {
    ListBulletIcon, NumberedListIcon, BoldIcon, ItalicIcon, UnderlineIcon,
    ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { sanitizeRichHtml } from './approval/richText';
import { paraToEditorHtml, isParaEmpty, BULLET_STYLES } from '../utils/letterRichText';
import { applyParagraphGap } from '../utils/letterGap';

/* ============================================================================
   The start / end paragraph box of a letter — WYSIWYG.

   Bold shows as bold and a bullet list shows as a list, right in the box; no
   ** markers and no "• " typed by hand. The stored value is HTML, run through
   the project's allow-list sanitizer on the way in and on the way out.

   Paragraphs saved before this box existed are plain text with "• " / "1. " /
   "**bold**" markers. paraToEditorHtml() converts those on open, so an old
   paragraph appears as real bullets and real bold and is edited the same way.

   Used by the drive Letter Master (Campaign.jsx) and the letter composer
   (CustomerEng / CustomerEng2).
   ========================================================================== */

const btn = 'inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 transition hover:bg-gray-50 hover:text-indigo-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed';
const btnOn = 'border-indigo-300 bg-indigo-50 text-indigo-700';

const isBlank = (html) => /^(<br\s*\/?>|<div><br\s*\/?><\/div>|\s|&nbsp;)*$/i.test(html || '');

/* The letter body prints at 13px, so that is the neutral size. Nothing above
   20 is offered: cleanStyle() in approval/richText.js drops a font-size over
   20px (it guards the approval box against Excel pastes), so a bigger size
   would vanish the moment it was saved. */
const FONT_SIZES = [9, 10, 11, 12, 13, 14, 16, 18, 20];
const DEFAULT_FONT_SIZE = 13;

/* The gap printed AFTER a paragraph. 9px is what the letter uses by default;
   0 butts two paragraphs together. Applied as margin-bottom on the block, so
   it survives into the printed and emailed letter. */
const GAP_SIZES = [0, 2, 4, 6, 9, 12, 16, 24];
const DEFAULT_GAP = 9;
/* execCommand('fontSize') only speaks the legacy 1..7 scale and emits
   <font size="n">, which the sanitizer drops on the way out. So 7 is used as a
   sentinel: apply it, then rewrite those tags into a real px span (font-size IS
   an allowed style) before anything is read back or stored. */
const SIZE_SENTINEL = '7';


export default function LetterParaEditor({
    value, onChange, placeholder, className = '', style, disabled = false, hint,
    readOnly = false,
}) {
    const ref = useRef(null);
    const lastEmitted = useRef(null);
    const [focused, setFocused] = useState(false);
    const [active, setActive] = useState({});
    // 'bullets' | 'size' | 'gap' | null — only one is ever open
    const [menu, setMenu] = useState(null);
    const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
    // the size to stamp on any sentinel tag the browser adds LATER, when the
    // user picked a size with nothing selected and then started typing
    const pendingSize = useRef(DEFAULT_FONT_SIZE);
    const [gap, setGap] = useState(DEFAULT_GAP);
    /* EVERY control here fires on mousedown+preventDefault so the editor never
       loses focus, and with it the selection the command is meant to act on.
       Size and Gap were <select>s at first and looked broken for exactly that
       reason — a native select cannot help taking focus. They are popovers of
       buttons now, like the bullet library. The saved range stays as a belt to
       the braces. */
    const savedRange = useRef(null);
    const [bulletStyle, setBulletStyle] = useState('disc');   // last one picked
    const barRef = useRef(null);
    // derived, not state: mirroring it would mean setState inside the effect,
    // and reading ref.current during render is not allowed either
    const empty = isParaEmpty(value);

    useEffect(() => {
        if (!menu) return undefined;
        const close = (e) => { if (barRef.current && !barRef.current.contains(e.target)) setMenu(null); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [menu]);

    /* Write into the box only when the incoming value is not what the box
       already shows — writing on every keystroke would throw the caret to the
       start of the paragraph. */
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (value === lastEmitted.current) return;      // our own edit coming back
        const html = paraToEditorHtml(value);
        if (html !== el.innerHTML) el.innerHTML = html;
    }, [value]);

    /* <font size="7"> -> <span style="font-size:Npx">, in place. */
    const rewriteSizeTags = (px) => {
        const el = ref.current;
        if (!el) return;
        el.querySelectorAll(`font[size="${SIZE_SENTINEL}"]`).forEach((f) => {
            const span = document.createElement('span');
            span.style.fontSize = `${px}px`;
            while (f.firstChild) span.appendChild(f.firstChild);
            f.replaceWith(span);
        });
    };

    /* The block the caret sits in — a paragraph, a list row, or the empty
       line left by pressing Enter. */
    const currentBlock = () => {
        const el = ref.current;
        const sel = window.getSelection();
        if (!el || !sel?.rangeCount) return null;
        let node = sel.getRangeAt(0).startContainer;
        if (node.nodeType === 3) node = node.parentNode;
        while (node && node !== el) {
            if (node.nodeType === 1 && ['P', 'DIV', 'LI'].includes(node.tagName)) return node;
            node = node.parentNode;
        }
        return null;
    };

    /* Every block the selection touches, outermost only — so selecting three
       paragraphs sets all three, and selecting inside a list sets the list
       rather than each row. */
    /* Gap — the paragraph-spacing algorithm lives in utils/letterGap.js so it
       can be tested against a real DOM; see the note there for why a blank
       line, not a margin, is usually what the author is looking at. */
    const applyGap = (px) => {
        const el = ref.current;
        if (!el || disabled) return;
        setGap(px);
        el.focus();
        restoreRange();
        const sel = window.getSelection();
        const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
        if (applyParagraphGap(el, range, px, currentBlock())) {
            savedRange.current = null;      // the DOM moved under it
            emit();
        }
    };

    const applyFontSize = (px) => {
        const el = ref.current;
        if (!el || disabled) return;
        setFontSize(px);
        pendingSize.current = px;
        el.focus();
        restoreRange();

        const sel = window.getSelection();
        if (sel && sel.isCollapsed) {
            // nothing selected: size the whole line the caret is on
            const block = currentBlock();
            if (block) {
                block.style.fontSize = `${px}px`;
                emit();
                return;
            }
        }
        document.execCommand('fontSize', false, SIZE_SENTINEL);
        rewriteSizeTags(px);
        emit();
    };

    const emit = () => {
        const el = ref.current;
        if (!el) return;
        // catches the tag the browser adds once typing starts after a size was
        // picked with an empty selection
        rewriteSizeTags(pendingSize.current);
        const html = isBlank(el.innerHTML) ? '' : sanitizeRichHtml(el.innerHTML);
        lastEmitted.current = html;
        onChange(html);
    };

    /* execCommand is deprecated but is still the only call every browser
       honours that keeps the caret AND the native undo stack intact — which is
       exactly what a small formatting bar needs. */
    const exec = (cmd) => {
        const el = ref.current;
        if (!el || disabled) return;
        el.focus();
        document.execCommand(cmd, false, null);
        refreshActive();
        emit();
    };

    /* The <ul> the caret is sitting in, if any. */
    const currentList = () => {
        const el = ref.current;
        const sel = window.getSelection();
        if (!el || !sel?.rangeCount) return null;
        let node = sel.getRangeAt(0).startContainer;
        while (node && node !== el) {
            if (node.nodeType === 1 && node.tagName === 'UL') return node;
            node = node.parentNode;
        }
        return null;
    };

    const applyBullet = (style) => {
        const el = ref.current;
        if (!el || disabled) return;
        el.focus();
        setMenu(null);
        if (style.css === null) {                     // None: stop being a list
            if (currentList()) document.execCommand('insertUnorderedList', false, null);
            refreshActive();
            emit();
            return;
        }
        setBulletStyle(style.key);
        if (!currentList()) document.execCommand('insertUnorderedList', false, null);
        const ul = currentList();
        if (ul) ul.style.listStyleType = style.css;
        refreshActive();
        emit();
    };

    const rememberRange = () => {
        const sel = window.getSelection();
        if (sel && sel.rangeCount && ref.current?.contains(sel.anchorNode)) {
            savedRange.current = sel.getRangeAt(0).cloneRange();
        }
    };

    const restoreRange = () => {
        const r = savedRange.current;
        if (!r || !ref.current?.contains(r.commonAncestorContainer)) return;
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
    };

    const refreshActive = () => {
        try {
            setActive({
                bold: document.queryCommandState('bold'),
                italic: document.queryCommandState('italic'),
                underline: document.queryCommandState('underline'),
                ul: document.queryCommandState('insertUnorderedList'),
                ol: document.queryCommandState('insertOrderedList'),
            });
        } catch { /* queryCommandState throws when the box is not focused */ }
    };

    const tool = (label, Icon, cmd, on, title) => (
        <button type="button" disabled={disabled} title={title}
            className={`${btn} ${on ? btnOn : ''}`}
            // mousedown, not click: click would blur the box first and lose the
            // selection the command is meant to act on
            onMouseDown={(e) => { e.preventDefault(); exec(cmd); }}>
            <Icon className="h-3.5 w-3.5" /> {label}
        </button>
    );

    /* A box the Letter Master locked. It shows the text as it will print and
       nothing else — no formatting bar to grey out, no note about where the
       lock came from; the sender simply cannot change it. */
    if (readOnly) {
        return (
            <div className={`letter-rich ${className}`} style={style}
                dangerouslySetInnerHTML={{ __html: paraToEditorHtml(value) }} />
        );
    }

    return (
        <div className="w-full">
            <div ref={barRef} className="mb-1 flex flex-wrap items-center gap-1.5">
                {/* split control: the left half toggles the list with the bullet
                    last picked, the caret opens the library */}
                {/* `relative` so the library opens directly under this button
                    rather than at the far left of the toolbar */}
                <span className="relative inline-flex">
                    <button type="button" disabled={disabled} title="Bullet list"
                        className={`${btn} rounded-r-none ${active.ul ? btnOn : ''}`}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            applyBullet(active.ul
                                ? BULLET_STYLES[0]
                                : BULLET_STYLES.find((b) => b.key === bulletStyle) || BULLET_STYLES[1]);
                        }}>
                        <ListBulletIcon className="h-3.5 w-3.5" /> Bullets
                    </button>
                    <button type="button" disabled={disabled} title="Bullet library"
                        className={`${btn} -ml-px rounded-l-none px-1 ${active.ul ? btnOn : ''}`}
                        onMouseDown={(e) => { e.preventDefault(); setMenu((m) => (m === 'bullets' ? null : 'bullets')); }}>
                        <ChevronDownIcon className="h-3 w-3" />
                    </button>
                    {menu === 'bullets' && (
                        <div className="absolute left-0 top-full z-40 mt-1 w-[228px] rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
                            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                                Bullet Library
                            </div>
                            <div className="grid grid-cols-4 gap-1.5">
                                {BULLET_STYLES.map((b) => (
                                    <button key={b.key} type="button" title={b.label}
                                        onMouseDown={(e) => { e.preventDefault(); applyBullet(b); }}
                                        className={`grid h-12 place-items-center rounded-md border text-[17px] leading-none transition hover:border-indigo-400 hover:bg-indigo-50
                                            ${b.key === 'none' ? 'text-[10px] font-semibold text-gray-500' : ''}
                                            ${b.key !== 'none' && b.key === bulletStyle && active.ul
                                                ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                                                : 'border-gray-200 text-gray-700'}`}>
                                        {b.key === 'none' ? 'None' : b.glyph}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </span>




                {tool('Numbering', NumberedListIcon, 'insertOrderedList', active.ol,
                    'Numbered list')}
                <span className="mx-0.5 h-4 w-px bg-gray-200" />
                <span className="relative inline-flex">
                    <button type="button" disabled={disabled} title="Text size"
                        className={`${btn} ${menu === 'size' ? btnOn : ''}`}
                        onMouseDown={(e) => { e.preventDefault(); rememberRange(); setMenu((m) => (m === 'size' ? null : 'size')); }}>
                        Size <b className="tabular-nums">{fontSize}</b>
                        <ChevronDownIcon className="h-3 w-3" />
                    </button>
                    {menu === 'size' && (
                        <div className="absolute left-0 top-full z-40 mt-1 w-[190px] rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
                            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                                Text size
                            </div>
                            <div className="grid grid-cols-3 gap-1">
                                {FONT_SIZES.map((n) => (
                                    <button key={n} type="button"
                                        title={n === DEFAULT_FONT_SIZE ? 'Default letter size' : `${n}px`}
                                        onMouseDown={(e) => { e.preventDefault(); applyFontSize(n); setMenu(null); }}
                                        className={`rounded-md border px-1 py-1.5 text-[11px] font-semibold transition hover:border-indigo-400 hover:bg-indigo-50
                                            ${n === fontSize ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-700'}`}>
                                        {n}{n === DEFAULT_FONT_SIZE ? '*' : ''}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-1.5 text-[10px] text-gray-400">* the letter&apos;s own size</div>
                        </div>
                    )}
                </span>
                <span className="relative inline-flex">
                    <button type="button" disabled={disabled}
                        title="Space printed after this paragraph. Put the caret in a paragraph (or select several) and pick a number — any blank lines between them are replaced by that spacing."
                        className={`${btn} ${menu === 'gap' ? btnOn : ''}`}
                        onMouseDown={(e) => { e.preventDefault(); rememberRange(); setMenu((m) => (m === 'gap' ? null : 'gap')); }}>
                        Gap <b className="tabular-nums">{gap === 0 ? 'None' : gap}</b>
                        <ChevronDownIcon className="h-3 w-3" />
                    </button>
                    {menu === 'gap' && (
                        <div className="absolute left-0 top-full z-40 mt-1 w-[210px] rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
                            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                                Space after paragraph
                            </div>
                            <div className="grid grid-cols-4 gap-1">
                                {GAP_SIZES.map((n) => (
                                    <button key={n} type="button"
                                        title={n === 0 ? 'No space at all' : `${n}px`}
                                        onMouseDown={(e) => { e.preventDefault(); applyGap(n); setMenu(null); }}
                                        className={`rounded-md border px-1 py-1.5 text-[11px] font-semibold transition hover:border-indigo-400 hover:bg-indigo-50
                                            ${n === gap ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-700'}`}>
                                        {n === 0 ? 'None' : n}{n === DEFAULT_GAP ? '*' : ''}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-1.5 text-[10px] text-gray-400">
                                Select two paragraphs and pick a number to set the space between them.
                            </div>
                        </div>
                    )}
                </span>
                <span className="mx-0.5 h-4 w-px bg-gray-200" />
                {tool('Bold', BoldIcon, 'bold', active.bold, 'Bold (Ctrl+B)')}
                {tool('Italic', ItalicIcon, 'italic', active.italic, 'Italic (Ctrl+I)')}
                {tool('Underline', UnderlineIcon, 'underline', active.underline,
                    'Underline (Ctrl+U)')}
                <span className="text-[10.5px] text-gray-400">
                    {hint || 'Shows exactly as it prints. Gap replaces the blank lines between paragraphs with real spacing.'}
                </span>
            </div>

            <div className="relative">
                <div ref={ref} contentEditable={!disabled} suppressContentEditableWarning
                    role="textbox" aria-multiline="true"
                    onInput={emit}
                    onKeyUp={() => { refreshActive(); rememberRange(); }}
                    onMouseUp={() => { refreshActive(); rememberRange(); }}
                    onFocus={() => {
                        setFocused(true);
                        refreshActive();
                        /* Enter inside a bullet must start the NEXT bullet, aligned
                           with the one above — that is contentEditable's own
                           behaviour, but only once it knows what block to make
                           outside a list. Without this some browsers fall back to
                           <p>, which breaks out of the list instead of continuing
                           it. Shift+Enter still gives a soft line inside the same
                           bullet. */
                        try { document.execCommand('defaultParagraphSeparator', false, 'div'); }
                        catch { /* not supported — the browser default is fine */ }
                    }}
                    onBlur={() => { setFocused(false); emit(); }}
                    onPaste={(e) => {
                        // paste as clean markup, never as whatever Word sent
                        e.preventDefault();
                        const cb = e.clipboardData;
                        if (!cb) return;
                        const html = cb.getData('text/html');
                        const text = cb.getData('text/plain');
                        const safe = html
                            ? sanitizeRichHtml(html)
                            : String(text || '')
                                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                                .replace(/\n/g, '<br>');
                        document.execCommand('insertHTML', false, safe);
                        emit();
                    }}
                    className={`letter-rich overflow-auto ${className}`}
                    style={style} />
                {!focused && empty && (
                    <span className="pointer-events-none absolute left-3 top-2 text-xs text-gray-400">
                        {placeholder}
                    </span>
                )}
            </div>
        </div>
    );
}
