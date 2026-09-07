/* ============================================================================
   Paragraph spacing for the letter editor.

   The space between two paragraphs is NOT one thing in a contentEditable.
   Depending on how the text got there it is any of:

       <p>one</p><p>two</p>                              a block margin
       <div>one</div><div><br></div><div>two</div>       a blank BLOCK
       one<br><br>two                                    a blank line, no block

   Handling only one of those shapes is what made the first two attempts at a
   Gap control look broken. So the content is read as logical PARAGRAPHS — a
   block element is one, a run of loose inline nodes is one, a lone <br> is a
   blank line — and the gap is applied to those, whatever markup carries them.

   Lives outside the component so it can be tested against a real DOM.
   ========================================================================== */

const BLOCK_TAGS = /^(P|DIV|UL|OL|H[1-6]|BLOCKQUOTE|PRE|TABLE)$/;

/** The editor's content as logical paragraphs, in document order. */
export function paragraphGroups(root) {
    if (!root) return [];
    const groups = [];
    let run = null;
    Array.from(root.childNodes).forEach((n) => {
        if (n.nodeType === 1 && BLOCK_TAGS.test(n.tagName)) {
            run = null;
            groups.push({ nodes: [n], block: n });
            return;
        }
        if (n.nodeType === 1 && n.tagName === 'BR') {
            if (run) { run.nodes.push(n); run = null; }      // ends this line
            else groups.push({ nodes: [n], block: null });   // a blank line
            return;
        }
        if (n.nodeType === 3 && !n.nodeValue.trim()) return; // stray whitespace
        if (n.nodeType !== 1 && n.nodeType !== 3) return;
        if (!run) { run = { nodes: [], block: null }; groups.push(run); }
        run.nodes.push(n);
    });
    return groups;
}

export const groupText = (g) => g.nodes
    .map((n) => n.textContent || '').join('')
    .replace(/\u00a0/g, ' ').trim();

/** Give a group something that can carry a margin. A run of loose nodes is
 *  wrapped in a <div> in place — what the browser would have done had the text
 *  been typed rather than pasted in. */
export function blockFor(g, doc) {
    if (g.block) return g.block;
    const div = (doc || document).createElement('div');
    g.nodes[0].parentNode.insertBefore(div, g.nodes[0]);
    g.nodes.slice().forEach((n) => {
        if (n.nodeType === 1 && n.tagName === 'BR') { n.remove(); return; }
        div.appendChild(n);
    });
    g.block = div;
    return div;
}

/**
 * Apply a paragraph gap, in place.
 *
 * @param {Element} root      the contentEditable
 * @param {Range|null} range  the current selection range, if any
 * @param {number} px         the gap to set
 * @param {Element|null} caretBlock  the block the caret is in, for a collapsed
 *                                   selection
 * @returns {boolean} whether anything changed
 */
export function applyParagraphGap(root, range, px, caretBlock) {
    const groups = paragraphGroups(root);
    if (!groups.length) return false;

    let touched = range
        ? groups.filter((g) => g.nodes.some((n) => range.intersectsNode(n)))
        : [];
    if (!touched.length && caretBlock) {
        const hit = groups.find((g) => g.block
            && (g.block === caretBlock || g.block.contains(caretBlock)));
        if (hit) touched = [hit];
    }
    if (!touched.length) return false;

    // extend to a blank line sitting right after the last selected paragraph,
    // so "tighten these two" also closes the space below them
    const lastIdx = groups.indexOf(touched[touched.length - 1]);
    const after = groups[lastIdx + 1];
    if (after && !groupText(after) && !touched.includes(after)) touched.push(after);

    const content = touched.filter(groupText);
    const blanks = touched.filter((g) => !groupText(g));

    // a blank line IS the gap the author sees — Gap replaces it with real spacing
    blanks.forEach((g) => g.nodes.forEach((n) => n.remove()));

    if (!content.length) {
        // only blank lines were selected: the gap belongs to what is above them
        const before = groups[groups.indexOf(touched[0]) - 1];
        if (before && groupText(before)) content.push(before);
    }
    if (!content.length) return blanks.length > 0;

    /* With several paragraphs selected the number is the gap BETWEEN them, so
       the last keeps whatever spacing it had to the paragraph after the
       selection. With one, it sets that paragraph's own trailing gap. */
    const targets = content.length > 1 ? content.slice(0, -1) : content;
    const doc = root.ownerDocument || document;
    targets.forEach((g) => { blockFor(g, doc).style.marginBottom = `${px}px`; });
    return true;
}
