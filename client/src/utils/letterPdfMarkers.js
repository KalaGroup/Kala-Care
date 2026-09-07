/* ============================================================================
   List markers for the letter PDF.

   The letter is rasterised by html2canvas before it becomes a PDF, and
   html2canvas draws a list's ::marker poorly — the bullets come out tiny and
   sitting above the line, which is what the letter PDF (and the letter viewers
   on Dashboard / My Performance, which show that PDF) has been showing.

   So before rasterising, every marker is written into the DOM as ordinary
   TEXT: the list loses its own marker and each row starts with a span holding
   the bullet character or the number. A negative text-indent keeps the hanging
   indent, so a wrapped line still lines up under the text.

   Display-only — it runs on the throwaway off-screen holder, never on anything
   that is stored.
   ========================================================================== */

const GLYPH_FOR = {
    disc: '•',      // •
    circle: '○',    // ○
    square: '▪',    // ▪
};

const DECORATIVE = /^\s*["'](.+?)\s*["']\s*$/;

export function flattenListMarkers(root) {
    if (!root || !root.querySelectorAll) return root;

    root.querySelectorAll('ul, ol').forEach((list) => {
        const ordered = list.tagName === 'OL';
        const declared = (list.style.listStyleType || '').trim();
        const decorative = DECORATIVE.exec(declared);
        const glyph = decorative
            ? decorative[1].trim()
            : (GLYPH_FOR[declared.toLowerCase()] || GLYPH_FOR.disc);

        list.style.listStyle = 'none';
        list.style.listStyleType = 'none';
        if (!list.style.paddingLeft) list.style.paddingLeft = '22px';

        let n = 0;
        Array.from(list.children).forEach((li) => {
            if (li.tagName !== 'LI') return;
            // never mark the same row twice (a holder can be re-used)
            if (li.firstElementChild && li.firstElementChild.getAttribute
                && li.firstElementChild.getAttribute('data-pdf-marker')) return;
            n += 1;
            li.style.listStyle = 'none';
            li.style.paddingLeft = '18px';
            li.style.textIndent = '-18px';   // the marker hangs into the padding

            const mark = (root.ownerDocument || document).createElement('span');
            mark.setAttribute('data-pdf-marker', '1');
            mark.setAttribute('style',
                'display:inline-block;width:18px;text-indent:0;'
                + 'vertical-align:baseline');
            mark.textContent = ordered ? `${n}.` : glyph;
            li.insertBefore(mark, li.firstChild);
        });
    });
    return root;
}
