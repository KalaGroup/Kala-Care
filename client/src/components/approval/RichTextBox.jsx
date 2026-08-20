/* Contenteditable box used by "Purpose of Approval" — behaves like a textarea
   for typing, but a paste from Excel / Sheets / Word keeps its table, rows,
   columns and cell formatting. Everything pasted goes through the allow-list in
   richText.js first, so no script, style block, handler or URL survives. */

import { useEffect, useRef, useState } from 'react';
import { Table2 } from 'lucide-react';
import { plainToRichHtml, sanitizeRichHtml } from './richText';

export default function RichTextBox({
    value,
    onChange,
    placeholder = '',
    className = '',
    minHeight = 56,
    maxHeight = 240,
    hint = true,
}) {
    const ref = useRef(null);
    const [focused, setFocused] = useState(false);

    // Push the value in only when it really differs from what the box already
    // shows — writing on every keystroke would drop the caret to the start.
    useEffect(() => {
        const el = ref.current;
        if (el && (value || '') !== el.innerHTML) el.innerHTML = value || '';
    }, [value]);

    const emit = () => {
        const html = ref.current?.innerHTML || '';
        // a box emptied by backspace leaves '<br>' behind — report it as empty
        onChange(/^(<br\s*\/?>|\s|&nbsp;)*$/i.test(html) ? '' : html);
    };

    const insertHtml = (html) => {
        const el = ref.current;
        if (!el) return;
        el.focus();
        // execCommand is deprecated but is the only call that keeps the caret
        // AND the native undo stack intact; the Range path is the fallback.
        if (document.queryCommandSupported?.('insertHTML')) {
            document.execCommand('insertHTML', false, html);
            return;
        }
        const sel = window.getSelection();
        if (!sel?.rangeCount) { el.innerHTML += html; return; }
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const tpl = document.createElement('template');
        tpl.innerHTML = html;
        const frag = tpl.content;
        const last = frag.lastChild;
        range.insertNode(frag);
        if (last) {
            range.setStartAfter(last);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    };

    const handlePaste = (e) => {
        e.preventDefault();
        const cb = e.clipboardData;
        if (!cb) return;
        const html = cb.getData('text/html');
        const text = cb.getData('text/plain');
        // Excel offers both flavours — the HTML one carries the table
        const safe = html ? sanitizeRichHtml(html) : plainToRichHtml(text);
        insertHtml(safe || plainToRichHtml(text));
        emit();
    };

    // Dragging a selection out of Excel is a paste by another name
    const handleDrop = (e) => {
        const dt = e.dataTransfer;
        if (!dt) return;
        e.preventDefault();
        const html = dt.getData('text/html');
        const text = dt.getData('text/plain');
        insertHtml(html ? sanitizeRichHtml(html) : plainToRichHtml(text));
        emit();
    };

    return (
        <div>
            <div className="relative">
                <div
                    ref={ref}
                    contentEditable
                    suppressContentEditableWarning
                    role="textbox"
                    aria-multiline="true"
                    onInput={emit}
                    onBlur={() => { setFocused(false); emit(); }}
                    onFocus={() => setFocused(true)}
                    onPaste={handlePaste}
                    onDrop={handleDrop}
                    className={`apv-rich apv-rich-edit overflow-auto ${className}`}
                    style={{ minHeight, maxHeight }}
                />
                {!value && !focused && (
                    <span className="pointer-events-none absolute left-3 top-1.5 text-[11px] text-gray-400">
                        {placeholder}
                    </span>
                )}
            </div>
            {hint && (
                <p className="mt-1 flex items-center gap-1 text-[10px] text-gray-500">
                    <Table2 size={11} className="flex-shrink-0" />
                    Copy a range in Excel and paste here — the table keeps its rows, columns and formatting.
                </p>
            )}
        </div>
    );
}
