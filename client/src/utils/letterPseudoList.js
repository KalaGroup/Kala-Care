/* ============================================================================
   Word-pasted "bullets" -> real lists.

   Text pasted from Word/Outlook does not arrive as <ul><li>. It arrives as one
   block of <br>-separated lines that merely LOOK like bullets:

       <div><b>Important note:</b><br>
         &nbsp; &nbsp;•\tThere will be no service labour charges … carried
         out&nbsp; &nbsp; &nbsp; &nbsp; under the CSP.<br>
         &nbsp; &nbsp;•\tThe cost of consumables … <br></div>

   Every part of that is a manual layout hack: &nbsp; for the indent, a tab
   after the bullet, and a run of &nbsp; to push "under the CSP." across. It
   only lines up at the exact width it was typed at — at any other width the
   wrapped words fall back to the left margin, under the bullet instead of
   under the text.

   So the lines are turned into a real <ul>/<ol>, where the browser's own
   hanging indent does the job at every width, in every preview, in the PDF and
   in the email.

   Runs on the SANITISED DOM, before the letter's inline styles are stamped on.
   ========================================================================== */

const BULLET_LINE = /^[\s\u00a0]*[\u2022\u25cf\u25aa\u25e6\u2023\u00b7*-][\s\u00a0\t]+/;
const NUMBER_LINE = /^[\s\u00a0]*(\d{1,3})[.)][\s\u00a0\t]+/;

const BLOCKISH = 'ul,ol,table,p,div,h1,h2,h3,h4,h5,h6,blockquote,pre';

const nodesText = (nodes) =>
    nodes.map((n) => n.textContent || '').join('');

/** Drop the bullet/number marker from the start of a line's first text node. */
function stripMarker(nodes, re) {
    for (const n of nodes) {
        if (n.nodeType === 3) {
            const m = re.exec(n.nodeValue);
            if (m) { n.nodeValue = n.nodeValue.slice(m[0].length); return; }
            if (n.nodeValue.trim()) return;          // real text before the marker
        } else if (n.nodeType === 1) {
            stripMarker(Array.from(n.childNodes), re);
            return;
        }
    }
}

/** The &nbsp; runs used to fake alignment become ordinary spaces, so the text
 *  wraps normally instead of being held apart at one fixed width. */
function collapseSpacers(node) {
    if (node.nodeType === 3) {
        node.nodeValue = node.nodeValue
            .replace(/[\u00a0\t]+/g, ' ')
            .replace(/ {2,}/g, ' ');
        return;
    }
    Array.from(node.childNodes).forEach(collapseSpacers);
}

/** Split a block's children into lines at <br>. */
function splitLines(block) {
    const lines = [];
    let cur = [];
    Array.from(block.childNodes).forEach((n) => {
        if (n.nodeType === 1 && n.tagName === 'BR') { lines.push(cur); cur = []; return; }
        cur.push(n);
    });
    lines.push(cur);
    return lines;
}

export function normalizePseudoLists(doc) {
    if (!doc || !doc.body) return doc;
    // deepest blocks first, so a wrapper never swallows one already rewritten
    const blocks = Array.from(doc.body.querySelectorAll('p, div')).reverse();

    blocks.forEach((block) => {
        if (block.querySelector(BLOCKISH)) return;        // only leaf blocks
        if (!block.querySelector('br')) return;           // nothing to split

        const lines = splitLines(block);
        const kinds = lines.map((l) => {
            const t = nodesText(l);
            if (!t.trim()) return 'blank';
            if (BULLET_LINE.test(t)) return 'ul';
            if (NUMBER_LINE.test(t)) return 'ol';
            return 'text';
        });
        if (!kinds.some((k) => k === 'ul' || k === 'ol')) return;

        const out = [];
        let list = null;
        let listKind = null;

        lines.forEach((nodes, i) => {
            const kind = kinds[i];
            if (kind === 'blank') return;                 // the stray trailing <br>
            if (kind === 'ul' || kind === 'ol') {
                if (!list || listKind !== kind) {
                    list = doc.createElement(kind);
                    listKind = kind;
                    out.push(list);
                }
                const li = doc.createElement('li');
                nodes.forEach((n) => li.appendChild(n));
                stripMarker(Array.from(li.childNodes), kind === 'ul' ? BULLET_LINE : NUMBER_LINE);
                collapseSpacers(li);
                list.appendChild(li);
                return;
            }
            list = null;
            listKind = null;
            const div = doc.createElement('div');
            nodes.forEach((n) => div.appendChild(n));
            collapseSpacers(div);
            out.push(div);
        });

        // put the rewritten pieces where the block was, keeping its own styling
        // on the first of them so the author's spacing survives
        const style = block.getAttribute('style');
        out.forEach((el, i) => {
            if (i === 0 && style && el.tagName !== 'UL' && el.tagName !== 'OL') {
                el.setAttribute('style', style);
            }
            block.parentNode.insertBefore(el, block);
        });
        if (style && out.length) {
            const last = out[out.length - 1];
            const own = last.getAttribute('style') || '';
            const m = /margin-bottom\s*:\s*[^;]+/i.exec(style);
            if (m && !/margin-bottom/i.test(own)) {
                last.setAttribute('style', own ? `${own};${m[0]}` : m[0]);
            }
        }
        block.parentNode.removeChild(block);
    });
    return doc;
}
