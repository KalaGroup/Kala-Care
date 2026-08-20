import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';

/* ----------------------------------------------------------------------------
   Shared chrome for the wide PMS report tables (Employee Productivity, SR
   Allocation): the synced top scrollbar, the scroll box that keeps the header
   on top without a vertical scrollbar, and the tick-list filter dropdown.
   Extracted so both reports behave identically instead of drifting apart.
---------------------------------------------------------------------------- */

export const THEME = '#2f3192';
export const THEME_DARK = '#23255f';

// ---- PMS grid palette — LIGHT BLUE ----------------------------------------
// The grids used to be white + grey (with near-black rules); they are now one
// light-blue family so the tables read as part of the ERP theme instead of a
// plain spreadsheet. The rule the greys followed still holds: adjacent blocks
// never share a tint, so rows stay separable even when the browser drops the
// 1px hairlines. Both reports import these, so the two can never drift apart.
// Every value is a CSS VARIABLE, not a hex: the grids paint their fills inline
// (a cell's tint depends on its row, its block and its state), and an inline
// style beats every dark-mode override — so the palette has to be able to change
// underneath the same style string. index.css holds the light values and the
// html.dark re-points; nothing here changes between themes.
export const GRID = {
  head: 'var(--pms-head)',               // every header cell
  rowA: 'var(--pms-row-a)',              // engineer rows
  rowB: 'var(--pms-row-b)',
  bandA: 'var(--pms-band-a)',            // collapsed rows / branch column
  bandB: 'var(--pms-band-b)',
  grpA: 'var(--pms-grp-a)',              // group arrow column
  grpB: 'var(--pms-grp-b)',
  subTot: 'var(--pms-subtot)',           // Sub Total rows
  grpTot: 'var(--pms-grptot)',
  region: 'var(--pms-region)',           // MH / KA region totals (white text)
  grand: 'var(--pms-grand)',             // Grand Total (ERP blue)
  type: 'var(--pms-type)',               // SR Type block (SR Allocation)
  sel: 'var(--pms-sel)',                 // an SE row that is OPEN / picked in
                                         // the SE filter — the strongest tint in
                                         // the block, so it heads its own rows
  line: 'var(--pms-line)',               // the grid hairline
  div: 'var(--pms-div)',                 // section dividers / frozen-block edge
};

// Synced TOP scrollbar for the wide table (the global thin-scrollbar CSS hides
// native bars — same pattern as SalesLabourReport / Dashboard).
export const TopScrollbar = ({ scrollRef, watch }) => {
  const topRef = useRef(null);
  const [spacerWidth, setSpacerWidth] = useState(0); // 0 = table fits, bar hidden

  useEffect(() => {
    const el = scrollRef.current;
    const top = topRef.current;
    if (!el || !top) return undefined;
    const update = () => {
      const { scrollWidth, clientWidth } = el;
      setSpacerWidth(scrollWidth > clientWidth + 1 ? scrollWidth : 0);
    };
    const fromTable = () => { update(); top.scrollLeft = el.scrollLeft; };
    const fromTop = () => { update(); el.scrollLeft = top.scrollLeft; };
    update();
    el.addEventListener('scroll', fromTable);
    top.addEventListener('scroll', fromTop);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const tableEl = el.querySelector('table');
    if (tableEl) ro.observe(tableEl);
    const mo = new MutationObserver(() => {
      update();
      const t2 = el.querySelector('table');
      if (t2) ro.observe(t2);
    });
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener('scroll', fromTable);
      top.removeEventListener('scroll', fromTop);
      ro.disconnect();
      mo.disconnect();
    };
  }, [scrollRef, watch]);

  return (
    <div ref={topRef}
      className={`overflow-x-auto overflow-y-hidden ${spacerWidth ? 'block' : 'hidden'}`}>
      <div style={{ width: spacerWidth ? `${spacerWidth}px` : '100%', height: '1px' }} />
    </div>
  );
};

// Horizontal scrolling only — the table keeps its FULL natural height, so it
// never gets a vertical scrollbar of its own and simply grows with the rows.
//
// The header still stays on top: `position: sticky` cannot help here (it would
// need a vertical scroll box), so the horizontal scrollbar, the <thead> and the
// Grand Total <tfoot> are TRANSLATED to track the app shell's page scroller.
// The bar + head slide down together as the table's top passes the top of the
// viewport and stop at the last body row; the foot does the mirror image.
/* ---- the filter row ---------------------------------------------------------
   The controls sit on ONE line, and the SEARCH BOX is the only one that gives
   way: index.css pins every other control to its natural size and lets the
   search box flex between 11rem and 5.5rem, so the row absorbs a narrower
   window by shrinking that one field and nothing else.

   All this hook decides is the LAST resort: when even the narrowest search box
   leaves the controls wider than the row, it flips the row to wrap so nothing is
   ever clipped. The width is measured from the CHILDREN rather than from
   scrollWidth — the row cannot be given overflow:hidden (a filter's dropdown
   panel is absolutely positioned INSIDE it and would be clipped away), and a
   visible overflow is exactly the case where scrollWidth is least dependable.

   `watch` re-measures when the control SET changes — a dropdown appearing, a
   button's label growing ('Expand all' -> 'Collapse all'), a trigger's count
   replacing 'All' — which no resize reports, since the row itself is always full
   width. Same contract as HScrollBox below. */
const useFitOneRow = (watch) => {
  const ref = useRef(null);
  const [wrap, setWrap] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let busy = false;
    let alive = true;
    const fit = () => {
      // the fonts.ready callback below can land after unmount, on a node that is
      // no longer in the document and measures 0 wide
      if (busy || !alive) return;          // our own class flipping re-triggers RO
      busy = true;
      const keep = el.className;
      el.classList.remove('flex-wrap');
      el.classList.add('flex-nowrap');     // measure the one-line layout
      const kids = Array.from(el.children);
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      const need = kids.reduce((w, k) => w + k.offsetWidth, 0)
        + gap * Math.max(0, kids.length - 1);
      el.className = keep;                 // React state owns the real className
      busy = false;
      // +2: offsetWidth rounds to whole pixels, and a sub-pixel remainder must
      // not read as a spill
      setWrap(need > el.clientWidth + 2);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    // A late-loading webfont changes the width of every label, and the ROW's own
    // size does not change when it does — so the observer never fires. Measure
    // once more when the font is actually in. (fit() no-ops after unmount.)
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(fit).catch(() => {});
    }
    return () => { alive = false; ro.disconnect(); };
  }, [watch]);
  return [ref, wrap ? 'flex-wrap' : 'flex-nowrap'];
};

/* The filter row itself: the controls go in as children. A COMPONENT rather than
   a bare hook because every report returns early while its payload loads, and a
   hook called after such a return would change hook order between renders. */
export const FilterRow = ({ watch, children }) => {
  const [ref, cls] = useFitOneRow(watch);
  return (
    <div ref={ref}
      className={`pms-tb mt-2 flex items-center justify-end gap-x-2 gap-y-1.5 ${cls}`}>
      {children}
    </div>
  );
};

export const HScrollBox = ({ watch, children }) => {
  const ref = useRef(null);
  const barRef = useRef(null);

  useEffect(() => {
    const box = ref.current;
    const bar = barRef.current;
    const table = box && box.querySelector('table');
    const thead = table && table.querySelector('thead');
    if (!box || !thead) return undefined;
    const tfoot = table.querySelector('tfoot');

    // Nearest ancestor that scrolls vertically (Navbar's page container),
    // falling back to the window.
    let sc = box.parentElement;
    while (sc && sc !== document.body) {
      const oy = getComputedStyle(sc).overflowY;
      if (oy === 'auto' || oy === 'scroll') break;
      sc = sc.parentElement;
    }
    const scroller = sc && sc !== document.body ? sc : null;

    let raf = 0;
    const apply = () => {
      raf = 0;
      // The bottom the USER sees: documentElement.clientHeight leaves out the
      // window's own horizontal scrollbar, and a scroller that runs past the
      // window must not drag the pinned foot off screen with it.
      const winH = document.documentElement.clientHeight || window.innerHeight;
      const v = scroller ? scroller.getBoundingClientRect()
        : { top: 0, bottom: winH };
      const vTop = Math.max(0, v.top);
      const vBottom = Math.min(v.bottom, winH);
      // Measure the TABLE, not the scroll box. The box also owns a horizontal
      // scrollbar strip along its bottom edge, and counting that strip as part
      // of the table parked the pinned Grand Total a scrollbar's height above
      // the window — exactly the gap that showed under the row.
      const r = table.getBoundingClientRect();
      const barH = bar ? bar.offsetHeight : 0;      // 0 when the table fits
      const room = Math.max(0, r.height - thead.offsetHeight
        - (tfoot ? tfoot.offsetHeight : 0));
      // One shift for both: it puts the scrollbar exactly at the top of the
      // viewport and the header immediately under it. Rounded to whole pixels —
      // a fractional translate lands the header's 1px grid lines on half pixels,
      // where they blur out or vanish entirely.
      const down = Math.round(Math.min(Math.max(0, vTop - r.top + barH), room));
      thead.style.transform = down ? `translateY(${down}px)` : '';
      if (bar) bar.style.transform = down ? `translateY(${down}px)` : '';
      if (tfoot) {
        const up = Math.round(Math.min(Math.max(0, r.bottom - vBottom), room - down));
        tfoot.style.transform = up ? `translateY(${-up}px)` : '';
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };

    apply();
    const target = scroller || window;
    target.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    const ro = new ResizeObserver(onScroll);
    ro.observe(table);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      target.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      ro.disconnect();
      thead.style.transform = '';
      if (bar) bar.style.transform = '';
      if (tfoot) tfoot.style.transform = '';
    };
  }, [watch]);

  return (
    <>
      {/* opaque + above the table so the rows never show through the bar */}
      <div ref={barRef} className="relative bg-white" style={{ zIndex: 36 }}>
        <TopScrollbar scrollRef={ref} watch={watch} />
      </div>
      {/* pms-hscroll: no native bottom scrollbar — the synced bar above IS the
          scrollbar, and its strip otherwise sat under the pinned Grand Total */}
      <div className="overflow-x-auto pms-hscroll" ref={ref}>{children}</div>
    </>
  );
};

// ---- single-choice dropdown (column granularity) --------------------------
// Same shell as MultiSelect so the filter bar reads as one set of controls;
// picking an option applies it and closes.
export const SingleSelect = ({ label, items, value, onChange, align = 'left' }) => {
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const cur = items.find((i) => i.v === value) || items[0] || { t: '' };
  return (
    <div className="relative" ref={box}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}>
      <button type="button" onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
          open ? 'border-[#2f3192] text-[#2f3192] bg-[#2f3192]/5'
            : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'}`}>
        {label}: <span className="font-semibold">{cur.t}</span>
        <span className={`text-[8px] transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && (
        /* pt-1 is PADDING — it keeps the hover unbroken across the gap */
        <div className={`absolute z-40 top-full pt-1 ${align === 'right' ? 'right-0' : 'left-0'}`}>
          <div className="w-36 bg-white border border-gray-200 rounded-xl shadow-xl p-1">
            {items.map((it) => (
              <button key={it.v} type="button"
                onClick={() => { onChange(it.v); setOpen(false); }}
                className={`block w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors ${
                  it.v === cur.v ? 'font-semibold text-white' : 'text-gray-700 hover:bg-gray-50'}`}
                style={it.v === cur.v ? { backgroundColor: THEME } : {}}>
                {it.t}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ---- checkbox multi-select (Weeks / Days / Branch / SE) --------------------
// An empty selection means "all", exactly like the prototype.
export const MultiSelect = ({ label, items, selected, onChange, searchable = true, align = 'left' }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const shown = q.trim()
    ? items.filter((it) => `${it.t} ${it.sub || ''}`.toLowerCase().includes(q.trim().toLowerCase()))
    : items;
  const toggle = (v) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v); else next.add(v);
    onChange(next);
  };

  // Opens on hover and closes when the pointer leaves (click still toggles),
  // the same behaviour as the page's period picker.
  return (
    <div className="relative" ref={box}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}>
      <button type="button" onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
          open || selected.size
            ? 'border-[#2f3192] text-[#2f3192] bg-[#2f3192]/5'
            : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'}`}>
        {label}: <span className="font-semibold">{selected.size || 'All'}</span>
        <span className={`text-[8px] transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && (
        /* pt-1 is PADDING, not a margin — it keeps the hover unbroken across
           the gap between the button and the panel. */
        <div className={`absolute z-40 top-full pt-1 ${align === 'right' ? 'right-0' : 'left-0'}`}>
        <div className="w-64 bg-white border border-gray-200 rounded-xl shadow-xl p-2">
          <div className="flex items-center gap-1.5 pb-2 mb-1 border-b border-gray-100">
            {searchable && (
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search"
                className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-200 rounded-md text-gray-800 focus:outline-none focus:ring-1"
                style={{ '--tw-ring-color': THEME }} />
            )}
            <button type="button" onClick={() => onChange(new Set(items.map((i) => i.v)))}
              className="px-1.5 py-1 text-[10px] border border-gray-200 rounded-md text-gray-600 hover:border-[#2f3192] hover:text-[#2f3192]">
              Tick all
            </button>
            <button type="button" onClick={() => onChange(new Set())}
              className="px-1.5 py-1 text-[10px] border border-gray-200 rounded-md text-gray-600 hover:border-[#2f3192] hover:text-[#2f3192]">
              Clear
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {shown.length === 0 && <div className="px-1.5 py-2 text-[11px] text-gray-500">No match</div>}
            {shown.map((it) => (
              <label key={it.v} className="flex items-center gap-2 px-1.5 py-1 rounded-md text-xs cursor-pointer hover:bg-gray-50">
                <input type="checkbox" checked={selected.has(it.v)} onChange={() => toggle(it.v)}
                  className="h-3.5 w-3.5 rounded border-gray-300" style={{ accentColor: THEME }} />
                <span className="flex-1 min-w-0 truncate text-gray-800" title={it.t}>{it.t}</span>
                {it.sub && <span className="text-[9.5px] text-gray-400 shrink-0">{it.sub}</span>}
              </label>
            ))}
          </div>
        </div>
        </div>
      )}
    </div>
  );
};
