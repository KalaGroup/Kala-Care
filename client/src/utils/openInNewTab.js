/* ============================================================================
   Open a URL (usually a blob: URL for an attachment) in a new tab.

   NOT window.open(url, '_blank', 'noopener'): passing `noopener` in the
   FEATURES string makes window.open return null BY SPEC, because with no
   opener there is no window handle to hand back. Code that then treats null as
   "the pop-up was blocked" reports a failure on every successful open — which
   is exactly what the spurious "Allow pop-ups to open the attachment" toast
   was.

   A hidden <a target="_blank" rel="noopener noreferrer"> gets the same
   isolation, counts as the user-gesture navigation it really is, and has no
   return value to misread.
   ========================================================================== */

export function openInNewTab(url) {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
}
