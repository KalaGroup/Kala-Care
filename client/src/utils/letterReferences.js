// Re-flow the "References" table inside a stored letter HTML.
//
// Letters are saved with the References block already rendered (2 label:value
// pairs per table row). At view / print / download time we re-chunk that table:
// 3 pairs per row when every "Label: value" is short enough to share one line
// three-across at 12px inside the letter's text column, otherwise 2 per row —
// same rule as buildReferencesHtml() in CustomerEng / CustomerEng2, applied
// retroactively to old letter history (drive and non-drive), MyPerformance and
// Dashboard views.

import { LETTER_TEXT_W } from './letterLayout';

// Max chars of "Label: value" that still fits three-across. Derived from the
// letter's text column (LETTER_TEXT_W) so it tracks the page margins: 3 pairs
// share that width, each spending ~26px on cell padding and ~6.5px per char at
// 12px Arial. buildReferencesHtml() in CustomerEng / CustomerEng2 uses the same
// constant, so a stored letter re-flows to exactly what a new one would render.
export const PAIR_FIT_LIMIT = Math.floor(((LETTER_TEXT_W / 3) - 26) / 6.5);

// Plain DOM traversal (no HTMLTableElement-specific APIs like .rows/.cells)
const tableRows = (table) =>
    Array.from(table.querySelectorAll('tr')).filter(tr => tr.closest('table') === table);
const rowCells = (tr) =>
    Array.from(tr.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');

// A References table row is a sequence of (label td, value td) pairs where the
// label td contains ONLY a <strong> ending with ":" and the value td is plain
// text. Anything else (Ref No/Date header row, followup/quotation tables with
// styled header cells) does not match and is left untouched.
const extractReferencePairs = (table) => {
    const rows = tableRows(table);
    if (!rows.length) return null;
    const pairs = [];
    let maxPairsPerRow = 0;
    for (const tr of rows) {
        const cells = rowCells(tr);
        if (!cells.length || cells.length % 2 !== 0) return null;
        maxPairsPerRow = Math.max(maxPairsPerRow, cells.length / 2);
        for (let i = 0; i < cells.length; i += 2) {
            const labelTd = cells[i];
            const valueTd = cells[i + 1];
            if (labelTd.tagName !== 'TD' || valueTd.tagName !== 'TD') return null;
            const labelText = (labelTd.textContent || '').trim();
            const valueText = (valueTd.textContent || '').trim();
            if (!labelText && !valueText) continue; // filler cells at row end
            const strongs = labelTd.querySelectorAll('strong');
            if (strongs.length !== 1) return null;
            const strongText = (strongs[0].textContent || '').trim();
            // label td must hold nothing but the strong, and the strong must end with ":"
            if (strongText !== labelText || !strongText.endsWith(':')) return null;
            // value td must be plain text (no nested elements)
            if (valueTd.children.length > 0) return null;
            pairs.push({ label: strongText.replace(/:$/, ''), value: valueText });
        }
    }
    if (!pairs.length) return null;
    return { pairs, maxPairsPerRow };
};

export const reflowLetterReferencesHtml = (html) => {
    if (!html || typeof html !== 'string' || typeof DOMParser === 'undefined') return html;
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        if (!doc || !doc.body) return html;
        let changed = false;
        Array.from(doc.querySelectorAll('table')).forEach((table) => {
            const found = extractReferencePairs(table);
            if (!found) return;
            const { pairs, maxPairsPerRow } = found;
            const fitsThree = pairs.length >= 3 &&
                pairs.every(p => (p.label.length + p.value.length + 2) <= PAIR_FIT_LIMIT);
            const perRow = fitsThree ? 3 : 2;
            if (perRow === maxPairsPerRow) return; // already laid out correctly
            // Reuse the stored cell styles so the rebuilt table matches the letter theme
            const firstLabelTd = table.querySelector('td');
            const firstValueTd = firstLabelTd ? firstLabelTd.nextElementSibling : null;
            const labelStyle = (firstLabelTd && firstLabelTd.getAttribute('style')) ||
                'padding:2px 8px 2px 0;vertical-align:top;white-space:nowrap;';
            const valueStyle = (firstValueTd && firstValueTd.getAttribute('style')) ||
                'padding:2px 18px 2px 0;vertical-align:top;overflow-wrap:anywhere;';
            const oldRows = tableRows(table);
            const rowParent = oldRows[0].parentNode; // tbody (or the table itself)
            oldRows.forEach(tr => tr.remove());
            for (let i = 0; i < pairs.length; i += perRow) {
                const tr = doc.createElement('tr');
                for (let j = 0; j < perRow; j++) {
                    const p = pairs[i + j];
                    const labelTd = doc.createElement('td');
                    const valueTd = doc.createElement('td');
                    if (p) {
                        labelTd.setAttribute('style', labelStyle);
                        valueTd.setAttribute('style', valueStyle);
                        const strong = doc.createElement('strong');
                        strong.textContent = `${p.label}:`;
                        labelTd.appendChild(strong);
                        valueTd.textContent = p.value;
                    }
                    tr.appendChild(labelTd);
                    tr.appendChild(valueTd);
                }
                rowParent.appendChild(tr);
            }
            changed = true;
        });
        return changed ? doc.body.innerHTML : html;
    } catch (e) {
        return html; // never break letter display over a re-flow problem
    }
};
