// One place for the customer LETTER page geometry, shared by every screen that
// renders a letter: the Send Letter wizard preview, the emailed / downloaded PDF,
// the print window, the letter history on Drive Data + Non-Drive Data, and the
// letter reports on Dashboard (branch-wise) and My Performance (employee-wise).
// Change a value here and every one of those views moves together.
//
// The letter body is always rasterised at LETTER_BODY_W css px and then placed
// across the full 210 mm width of an A4 page, so 1 px == 210/780 mm. Every value
// below is derived from that single relationship.

export const LETTER_BODY_W = 780;                 // px == 210mm (A4 width)
export const PX_PER_MM = LETTER_BODY_W / 210;     // ≈3.714

// ── Side margins ──────────────────────────────────────────────────────────────
// The letterhead bands are full-bleed; only the TEXT block is inset. 15mm each
// side: 20mm was correct business-letter practice but left the A4 sheet looking
// narrow and short of the letterhead's own width, and 28px (≈7.5mm) before that
// ran the text WIDER than the letterhead's address block underneath it. 15mm
// sits between the two and still clears that block.
export const LETTER_SIDE_MM = 15;
export const LETTER_SIDE_PAD = Math.round(LETTER_SIDE_MM * PX_PER_MM);  // 56px
export const LETTER_TOP_PAD = 0;                                        // the pull below sets the top gap
export const LETTER_BOTTOM_PAD = 24;
export const LETTER_BODY_PADDING =
    `${LETTER_TOP_PAD}px ${LETTER_SIDE_PAD}px ${LETTER_BOTTOM_PAD}px`;

// Usable text width (px) — the width the References table is chunked against.
export const LETTER_TEXT_W = LETTER_BODY_W - (2 * LETTER_SIDE_PAD);      // 668px

// ── Gap under the letterhead ──────────────────────────────────────────────────
// letter-header-band.png carries ≈12.6mm of blank paper below the logos, which
// left a wide gap before "Ref No". Pull the text block up into that blank strip
// (the strip is plain white, so nothing of the letterhead is covered).
// Bands stamped per page by jsPDF / the print window use the mm value; a band
// that sits INLINE in the html (wizard preview, stored letter html) uses the px
// value as a negative bottom margin on the image itself.
export const LETTER_HEADER_PULL_MM = 6;
export const LETTER_HEADER_PULL_PX = Math.round(LETTER_HEADER_PULL_MM * PX_PER_MM); // 22px

// Inline header-band <img> style, pull included.
export const letterHeaderImgStyle = () =>
    `display:block;width:100%;max-width:${LETTER_BODY_W}px;height:auto;` +
    `margin:0 auto -${LETTER_HEADER_PULL_PX}px;`;

// Top of the body block on a page whose bands are stamped separately (mm).
export const letterBodyTopMm = (headerMm) =>
    Math.max(0, (headerMm || 0) - LETTER_HEADER_PULL_MM);

// ── Stored letters ────────────────────────────────────────────────────────────
// A sent letter keeps the html it was sent with, so a history row from before
// this layout would show the old, wider text block right next to a new one.
// Re-apply the current padding (and the header pull, when the band is still in
// the flow) at view / print / download time. Display only — nothing is re-saved.
export const normalizeLetterBodyHtml = (html) => {
    if (!html || typeof html !== 'string' || typeof DOMParser === 'undefined') return html;
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        if (!doc || !doc.body) return html;
        const roots = Array.from(doc.querySelectorAll(
            `div[style*="max-width:${LETTER_BODY_W}px"], div[style*="max-width: ${LETTER_BODY_W}px"]`
        ));
        let changed = false;
        roots.forEach((root) => {
            // paper is white, whatever is behind it
            const rootStyle = root.getAttribute('style') || '';
            if (!/(^|;)\s*background\s*:/.test(rootStyle)) {
                root.setAttribute('style', `${rootStyle};background:#ffffff`);
                changed = true;
            }
            Array.from(root.children).forEach((child) => {
                const style = child.getAttribute('style') || '';
                // the body wrapper: the one direct child div carrying a padding
                if (child.tagName === 'DIV' && /(^|;)\s*padding\s*:/.test(style)) {
                    child.setAttribute('style', style.replace(
                        /(^|;)\s*padding\s*:[^;]*;?/, `$1padding:${LETTER_BODY_PADDING};`
                    ));
                    changed = true;
                    return;
                }
                // header band still flowing inline (on-screen view of a stored letter)
                if (child.tagName === 'IMG' && root.firstElementChild === child &&
                    /width\s*:\s*100%/.test(style)) {
                    child.setAttribute('style', letterHeaderImgStyle());
                    changed = true;
                }
            });
        });
        return changed ? doc.body.innerHTML : html;
    } catch (e) {
        return html; // never break letter display over a layout tweak
    }
};
