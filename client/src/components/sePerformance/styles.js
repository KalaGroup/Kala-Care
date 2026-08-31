/* eslint-disable */
// The SE Performance report's stylesheet, scoped to .sep. Derived from
// prototypes/SE Performance Report.html - keep the two in step by hand; the
// prototype stays the design reference, this file is what ships.
const SE_PERFORMANCE_CSS = `/* ============================================================================
   SE Performance — the report's own stylesheet, scoped to .sep so nothing can
   leak into the rest of the application. Layout follows
   prototypes/SE Performance Report.html.

   The grid tints come from the shared --pms-* palette in index.css, so this
   report reads as part of the ERP in both themes without carrying its own copy
   of them. Only the tokens index.css does NOT define are declared here.
   ========================================================================= */
.sep{
  --brand:#2f3192; --brand-d:#23255f;
  --card:#ffffff; --ink:#111827; --ink-2:#374151; --muted:#6b7280;
  --edge:#e5e7eb; --edge-2:#d1d5db; --soft:#f9fafb;
  --shadow:0 1px 2px rgba(16,24,40,.04), 0 8px 24px rgba(16,24,40,.06);
  /* chart palette - the validated categorical set, checked against this card's
     own surface in both themes */
  --viz-1:#2a78d6; --viz-2:#eb6834; --viz-3:#1baf7a;
  --viz-ink:#111827; --viz-mut:#6b7280; --viz-grid:#e5e7eb; --viz-base:#c3c2b7; --viz-surf:#ffffff;
  --viz-ok:#0ca30c; --viz-warn:#fab219; --viz-bad:#d03b3b;
  font-size:13px; line-height:1.45; color:var(--ink);
}
html.dark .sep{
  --card:#111820; --ink:#e6edf5; --ink-2:#c2ced9; --muted:#8b9bab;
  --edge:#26313d; --edge-2:#33404e; --soft:#131b24;
  --shadow:0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.45);
  --viz-1:#3987e5; --viz-2:#d95926; --viz-3:#199e70;
  --viz-ink:#e6edf5; --viz-mut:#8b9bab; --viz-grid:#26313d; --viz-base:#383835; --viz-surf:#111820;
}
.sep *{box-sizing:border-box}


/* ---- the two dropdowns that are left: the hero's period picker and the
   report's day / week / month picker. Both wear the same chrome. ---- */
.sep .btn{border:1px solid var(--edge-2);background:var(--card);color:var(--ink-2);border-radius:8px;padding:6px 10px;
     font:inherit;font-size:11.5px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.sep .btn:hover{border-color:var(--brand);color:var(--brand)}
.sep .btn.on{background:var(--brand);border-color:var(--brand);color:#fff;font-weight:600}
.sep .i{width:14px;height:14px;flex:none;display:inline-block}
.sep .i.sm{width:11px;height:11px;opacity:.7;transition:transform .16s}
.sep .ms.on-open .i.sm{transform:rotate(180deg)}
.sep .per.open .i.sm{transform:rotate(180deg)}
.sep .ms{position:relative}
.sep .ms .cnt{font-size:10.5px;font-weight:700;color:var(--brand);font-variant-numeric:tabular-nums}
.sep .ms.on-open > .btn{border-color:var(--brand);color:var(--brand)}
.sep .ms-pop{display:none;position:absolute;top:calc(100% + 6px);left:0;z-index:50;background:var(--card);border:1px solid var(--edge);
        border-radius:11px;box-shadow:var(--shadow);min-width:196px;padding:8px}
.sep .ms.on-open .ms-pop{display:block}
/* an invisible bridge across the gap, so crossing it does not count as leaving */
.sep .ms-pop::before, .sep .per-pop::before{content:'';position:absolute;left:0;right:0;top:-9px;height:9px}
.sep .ms-list{max-height:none;overflow-y:auto}
.sep .pick-item{display:flex;align-items:flex-start;gap:8px;padding:6px 7px;border-radius:7px;cursor:pointer;font-size:11.5px;color:var(--ink-2)}
.sep .pick-item:hover{background:var(--pms-row-b)}
.sep .pick-item.on{background:var(--pms-sel);color:var(--ink);font-weight:600}
.sep .pick-item .tick{width:13px;flex:none;color:var(--brand);opacity:0;margin-top:1px}
.sep .pick-item.on .tick{opacity:1}
html.dark .sep .pick-item.on .tick{color:#9ec5ea}
.sep .pick-item .lbl{flex:1;min-width:0}
.sep .pick-item .sub{display:block;font-size:9.5px;font-weight:400;color:var(--muted);margin-top:1px;white-space:normal;line-height:1.3}
/* ---------------- the explorer card ---------------- */
.sep .panel{background:var(--card);border:1px solid var(--edge);border-radius:14px;box-shadow:var(--shadow);padding:8px 13px 9px;margin-bottom:10px}
.sep .panel h3{margin:0 0 9px;font-size:12px;font-weight:700;color:var(--ink);display:flex;align-items:center;gap:7px}
.sep .panel h3 .sm{font-size:10px;font-weight:500;color:var(--muted)}
/* ---------------- performance explorer (the drill-down box) ---------------- */
.sep .pn-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;margin-bottom:5px}
.sep .crumbs{display:flex;flex-wrap:wrap;align-items:center;gap:4px;font-size:11px;margin-left:auto}
.sep .crumbs button{border:0;background:none;font:inherit;font-size:11px;color:var(--brand);cursor:pointer;padding:2px 5px;border-radius:6px}
.sep .crumbs button:hover{background:var(--pms-row-b)}
.sep .crumbs span{color:var(--muted)}
.sep .crumbs .cur{color:var(--ink);font-weight:600;padding:2px 5px}
.sep .pn-list{max-height:340px;overflow-y:auto;margin:0 -4px;padding:0 4px}
/* the branch board: Maharashtra on the left, Karnataka on the right */
.sep .ex-cols{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:0 -4px;padding:0 4px;
         align-items:start;max-height:302px;overflow-y:auto}
@media(max-width:860px){.sep .ex-cols{grid-template-columns:1fr;gap:12px}
}
.sep .ex-h{display:flex;align-items:baseline;gap:8px;font-size:9.5px;text-transform:uppercase;letter-spacing:.07em;
      font-weight:800;color:var(--brand-d);padding:0 6px 3px;border-bottom:2px solid var(--pms-div);margin-bottom:1px}
html.dark .sep .ex-h{color:#9ec5ea}
.sep .ex-h span{font-size:9.5px;text-transform:none;letter-spacing:0;font-weight:500;color:var(--muted);margin-left:auto}
.sep .ex-back{border:1px solid var(--edge-2);background:var(--card);color:var(--brand);border-radius:8px;
         padding:4px 10px;font:inherit;font-size:11px;font-weight:600;cursor:pointer}
.sep .ex-back:hover{border-color:var(--brand);background:var(--pms-row-b)}
/* ---- the sitemap tree ----------------------------------------------------
   A branch unfolds its engineers underneath it on a connector line, so the
   shape of the org stays on screen while you read one branch of it. */
.sep .pn-row.br{font-weight:600}
.sep .pn-row.br.open{background:var(--pms-band-b)}
.sep .pn-row.se .pn-rank{background:var(--pms-grp-b);font-size:9px}
.sep .pn-go.tw{transition:transform .16s}
.sep .pn-go.tw.open{transform:rotate(90deg);color:var(--brand)}
.sep .ex-kids{position:relative;margin:0 0 3px 11px;padding-left:14px}
.sep .ex-kids::before{content:'';position:absolute;left:0;top:0;bottom:0;width:1px;background:var(--pms-line-v);opacity:.55}
.sep .ex-kids > .pn-row{position:relative;border-bottom:0;padding-left:4px}
.sep .ex-kids > .pn-row::before{content:'';position:absolute;left:-15px;top:50%;width:12px;height:1px;
  background:var(--pms-line-v);opacity:.55}
/* the connector stops at the last engineer rather than running past him */
.sep .ex-kids > .pn-row:last-child::after{content:'';position:absolute;left:-15px;top:calc(50% + 1px);
  bottom:-2px;width:1px;background:var(--card)}
.sep .ex-kids > .pn-row .pn-name b{font-weight:500}
.sep .pn-row{display:grid;grid-template-columns:24px 1fr 50px 92px 46px 24px 13px;gap:8px;align-items:center;
        padding:3px 6px;border-radius:7px;font-size:11px;line-height:1.25;color:var(--ink-2);cursor:pointer;
        border-bottom:1px solid var(--edge)}
.sep .pn-row:last-child{border-bottom:0}
.sep .pn-row:hover{background:var(--pms-row-b)}
.sep .pn-row.on{background:var(--pms-sel);color:var(--ink)}
.sep .pn-rank{width:20px;height:18px;border-radius:5px;background:var(--pms-grptot);color:var(--brand-d);
         font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;font-variant-numeric:tabular-nums}
html.dark .sep .pn-rank{color:#cfe0f0}
.sep .pn-row.top1 .pn-rank{background:var(--pms-ok);color:var(--pms-ok-ink)}
.sep .pn-row.bot1 .pn-rank{background:var(--pms-miss);color:var(--pms-miss-ink)}
.sep .pn-name{min-width:0;overflow:hidden}
.sep .pn-name b{font-weight:600;font-size:11px;color:var(--ink);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sep .pn-name span{display:block;font-size:9px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sep .pn-met{font-size:10px;color:var(--muted);text-align:right;font-variant-numeric:tabular-nums}
.sep .pn-bar{height:7px;border-radius:3px;background:var(--soft);border:1px solid var(--edge-2);overflow:hidden;position:relative}
.sep .pn-bar i{position:absolute;left:0;top:0;bottom:0;display:block;border-radius:2px}
/* ---- the grade chip ------------------------------------------------------
   These were dropped when this sheet was generated from the prototype — the
   block they lived in went with the old table — so every grade letter on the
   page was rendering as plain text. A grade is a verdict; it gets a chip. */
.sep .gr{display:inline-block;min-width:19px;font-size:10px;font-weight:800;border-radius:5px;
     padding:1px 5px;text-align:center;line-height:1.45}
.sep .gr-A{background:var(--pms-ok);color:var(--pms-ok-ink)}
.sep .gr-B{background:#d8eecf;color:#2b4a17}
.sep .gr-C{background:var(--pms-near);color:var(--pms-near-ink)}
.sep .gr-D{background:var(--pms-miss);color:var(--pms-miss-ink)}
.sep .gr-E{background:#f8c7c7;color:#7a1d1d}
html.dark .sep .gr-B{background:#24371c;color:#c6e3ad}
html.dark .sep .gr-E{background:#3e1b1b;color:#f2a9a9}
/* the signed sheet is white paper in both themes, so its chips are literal */
.sep .sheet .gr-A{background:#cdeccd;color:#12401f}
.sep .sheet .gr-B{background:#d8eecf;color:#2b4a17}
.sep .sheet .gr-C{background:#fbf0bd;color:#4a3c05}
.sep .sheet .gr-D{background:#fbd9b5;color:#6b3405}
.sep .sheet .gr-E{background:#f8c7c7;color:#7a1d1d}
/* beside a 23px score the grade is the other half of the verdict, not a footnote */
.sep .sh-verdict .gr{font-size:15px;min-width:34px;padding:2px 10px;margin-top:4px;border-radius:6px}

.sep .pn-score{text-align:right;font-weight:800;font-size:11px;font-variant-numeric:tabular-nums;color:var(--ink)}
.sep .pn-score i{font-style:normal;font-size:8.5px;font-weight:600;opacity:.65;margin-left:1px}
.sep .dt-k .v i{font-style:normal;font-size:10px;font-weight:600;opacity:.6;margin-left:1px}
.sep .pn-go{width:12px;height:12px;color:var(--muted)}
.sep .pn-empty{font-size:11.5px;color:var(--muted);padding:14px 6px;text-align:center}
/* ---------------- engineer detail (day / week / month + charts) ------------ */
.sep .detail{margin-top:8px;background:var(--card);border:1px solid var(--edge);border-radius:14px;
        box-shadow:var(--shadow);scroll-margin-top:16px}
.sep .detail[hidden]{display:none}
/* The title bar and the action row PIN AS ONE BLOCK while the report scrolls:
   the buttons act on what is below them, so they have to still be there when
   you reach the bottom of it. Pinned separately — one at top:0 and the other
   at a guessed offset — their heights never matched and a strip of table
   showed through between them. Sticky works here only because .detail no
   longer clips its children. */
.sep .dt-pin{position:sticky;top:var(--sep-pin-top,0px);z-index:30;background:var(--card);
        border-radius:13px 13px 0 0}
.sep .dt-top{background:linear-gradient(120deg,var(--brand) 0%,var(--brand-d) 100%);color:#fff;
        padding:7px 14px;display:flex;flex-wrap:wrap;align-items:center;gap:12px;
        border-radius:13px 13px 0 0}
.sep .dt-id h3{margin:0;font-size:14px;font-weight:700;letter-spacing:-.01em;line-height:1.2}
.sep .dt-id p{margin:1px 0 0;font-size:10.5px;color:rgba(255,255,255,.72)}
/* an id is read digit by digit — it needs the contrast the prose around it does not */
.sep .dt-id p b{color:#fff;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:.02em}
.sep .dt-kpis{display:flex;gap:14px;margin-left:auto;align-items:center}
.sep .dt-k{text-align:right}
/* the label names the figure beside it, so it reads at the same weight of
   white — muted, it looked like chrome rather than part of the reading */
.sep .dt-k .l{font-size:8.5px;text-transform:uppercase;letter-spacing:.07em;color:#fff;font-weight:700}
.sep .dt-k .v{font-size:16px;font-weight:800;line-height:1.1;font-variant-numeric:tabular-nums}
.sep .dt-body{padding:10px 14px 14px}
/* the pinned block already carries the report's own scroll margin */
.sep .detail{scroll-margin-top:0}
.sep .dt-empty{padding:34px 20px;text-align:center;color:var(--muted)}
.sep .dt-empty svg{width:34px;height:34px;color:var(--pms-line-v);margin-bottom:8px}
.sep .dt-empty b{display:block;font-size:13px;color:var(--ink);font-weight:600;margin-bottom:3px}
.sep .dt-empty span{font-size:11.5px}
.sep .dt-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0;
        padding:6px 14px;background:var(--card);border-bottom:1px solid var(--pms-line)}
/* the actions act on what is BELOW them, so they sit with the view control
   rather than up in the title bar */
.sep .dt-acts{margin-left:auto;display:flex;flex-wrap:wrap;gap:6px}
.sep .dt-acts .btn{font-size:11px;padding:5px 9px}
.sep .dt-scope{font-size:10.5px;color:var(--muted)}
/* The breakdown is TRANSPOSED: the periods run left to right across the head,
   the metrics run top to bottom down the frozen first column, and the period
   total is frozen against the right edge so it is readable at any scroll. */
/* The breakdown scrolls sideways, often a long way — so the bar is mirrored
   ABOVE the table as well: on a 31-day view the bottom bar is off the far end
   of the screen by the time you need it. Bar and table share ONE frame, so the
   two can never drift out of line and their borders cannot double up. */
.sep .dt-frame{border:1px solid var(--pms-line);border-radius:10px;overflow:hidden;margin-bottom:14px}
/* the paper-only copy of the breakdown, cut into blocks that fit a page */
.sep .dt-print-only{display:none}
.sep .dt-chunk{margin-bottom:9px}
.sep .dt-chunk-h{display:flex;align-items:baseline;gap:8px;font-size:8pt;font-weight:700;color:#23255f;
      margin:0 0 3px;padding-bottom:2px;border-bottom:1px solid var(--pms-line)}
.sep .dt-chunk-h span{margin-left:auto;font-size:7pt;font-weight:500;color:var(--muted)}
.sep .dt-topbar{overflow-x:auto;overflow-y:hidden;height:10px;background:var(--soft);
           border-bottom:1px solid var(--pms-line);line-height:0}
.sep .dt-topbar.hide{display:none}
.sep .dt-topbar > div{height:1px}
/* The breakdown is its own scroll box — which is exactly what lets the header
   row and the metric column stay put while you read across 31 days and down
   through the bifurcations. */
.sep .dt-tblbox{overflow:auto;max-height:62vh}
.sep table.dt-t thead th{position:sticky;top:0;z-index:5}
.sep table.dt-t thead th.m{z-index:8}
.sep table.dt-t thead th.tot{z-index:7}
.sep table.dt-t thead th.m.tot{z-index:9}
/* one thin bar everywhere the page scrolls */
.sep .dt-topbar, .sep .dt-tblbox, .sep .ex-cols, .sep .ms-list, .sep .pn-list{scrollbar-width:thin;scrollbar-color:var(--pms-line-v) transparent}
.dt-topbar::-webkit-scrollbar,.dt-tblbox::-webkit-scrollbar,
.sep .ex-cols::-webkit-scrollbar, .sep .ms-list::-webkit-scrollbar, .sep .pn-list::-webkit-scrollbar{width:6px;height:6px}
.dt-topbar::-webkit-scrollbar-thumb,.dt-tblbox::-webkit-scrollbar-thumb,
.sep .ex-cols::-webkit-scrollbar-thumb, .sep .ms-list::-webkit-scrollbar-thumb, .sep .pn-list::-webkit-scrollbar-thumb{
  background:var(--pms-line-v);border-radius:6px}
.dt-topbar::-webkit-scrollbar-track,.dt-tblbox::-webkit-scrollbar-track,
.sep .ex-cols::-webkit-scrollbar-track, .sep .ms-list::-webkit-scrollbar-track, .sep .pn-list::-webkit-scrollbar-track{background:transparent}
.sep table.dt-t{border-collapse:separate;border-spacing:0;width:max-content;min-width:100%}
.sep table.dt-t th, .sep table.dt-t td{padding:7px 8px;font-size:10.5px;line-height:1.4;white-space:nowrap;
      box-shadow:inset -1px 0 0 var(--pms-line),inset 0 -1px 0 var(--pms-line)}
.sep table.dt-t thead th{background:var(--pms-head);color:var(--ink-2);font-size:9px;font-weight:700;
      text-transform:uppercase;letter-spacing:.04em;text-align:center;line-height:1.25;min-width:52px}
.sep table.dt-t thead th b{display:block;font-size:10px;letter-spacing:0;color:var(--ink)}
.sep table.dt-t thead th span{display:block;font-size:8.5px;font-weight:500;color:var(--muted);text-transform:none;letter-spacing:0}
.sep table.dt-t th.m{position:sticky;left:0;z-index:4;text-align:left;width:186px;min-width:186px;
      background:var(--pms-band-b);color:var(--ink);font-size:11px;font-weight:600;text-transform:none;letter-spacing:0;
      box-shadow:inset -1px 0 0 var(--pms-div),inset 0 -1px 0 var(--pms-line),3px 0 6px -3px var(--pms-edge-shadow)}
.sep table.dt-t thead th.m{background:var(--pms-head);z-index:6}
/* label and unit share one line, so eleven rows do not cost twenty-two lines
   of height for nothing */
/* chevron and label on ONE line: the metric column is 186px, and a chevron
   that wraps to its own line costs every row a second line of height */
.sep table.dt-t th.m .mw{display:flex;align-items:center;gap:5px;min-width:0}
.sep table.dt-t th.m .ml{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sep table.dt-t th.m .dtc-gap{width:10px;flex:none}
.sep table.dt-t th.m em{font-style:normal;font-size:9px;font-weight:400;color:var(--muted);margin-left:6px;white-space:nowrap}
.sep table.dt-t th.m em::before{content:'·';margin-right:6px;opacity:.6}
.sep table.dt-t td{text-align:right;font-variant-numeric:tabular-nums;color:var(--ink-2);background:var(--pms-row-a)}
.sep table.dt-t tbody tr:nth-child(even) td{background:var(--pms-row-b)}
.sep table.dt-t tbody tr:hover td{background:var(--pms-hover)}
.sep table.dt-t tbody tr:hover th.m{background:var(--pms-sel)}
.sep table.dt-t td.off, .sep table.dt-t th.off{background:var(--pms-band-b);color:var(--muted)}
.sep table.dt-t .tot{position:sticky;right:0;z-index:5;background:var(--pms-subtot) !important;
      font-weight:800;color:var(--ink);
      box-shadow:inset 1px 0 0 var(--pms-div),inset 0 -1px 0 var(--pms-line),-3px 0 6px -3px var(--pms-edge-shadow)}
.sep table.dt-t thead th.tot{background:var(--pms-grptot) !important;z-index:7}
.sep table.dt-t thead th.cur{background:var(--pms-sel)}
/* ---- charts ---------------------------------------------------------------
   Palette: the data-viz reference instance, validated against THIS card's
   surface (#ffffff light, #111820 dark) — all six checks pass in both modes.
   Aqua is sub-3:1 on the light surface, which obliges relief: the breakdown
   table above the charts is that relief, and every line also carries a direct
   end label. Text never wears a series colour. */
.sep{
  --viz-1:#2a78d6; --viz-2:#eb6834; --viz-3:#1baf7a;
  --viz-ink:#111827; --viz-mut:#6b7280; --viz-grid:#e5e7eb; --viz-base:#c3c2b7; --viz-surf:#ffffff;
  --viz-ok:#0ca30c; --viz-warn:#fab219; --viz-bad:#d03b3b;
}
html.dark .sep{
  --viz-1:#3987e5; --viz-2:#d95926; --viz-3:#199e70;
  --viz-ink:#e6edf5; --viz-mut:#8b9bab; --viz-grid:#26313d; --viz-base:#383835; --viz-surf:#111820;
}
/* ---- expandable breakdown rows ---- */
.sep table.dt-t th.m{display:table-cell}
.sep table.dt-t th.m > span{display:inline-block;vertical-align:middle}
.sep table.dt-t tr.par.has th.m{cursor:pointer}
.sep table.dt-t tr.par.has th.m:hover{background:var(--pms-sel)}
.sep .dtc{width:10px;height:10px;flex:none;color:var(--brand);transition:transform .16s}
.sep .dtc.open{transform:rotate(90deg)}
.sep table.dt-t tr.kid th.m{padding-left:22px;background:var(--pms-grp-a);font-weight:400;font-size:10.5px;color:var(--ink-2)}
.sep table.dt-t tr.kid td{background:var(--pms-grp-a);font-size:10px;color:var(--ink-2)}
.sep table.dt-t tr.kid td.tot{background:var(--pms-grptot) !important;font-weight:700}
.sep table.dt-t tr.kid:hover td, .sep table.dt-t tr.kid:hover th.m{background:var(--pms-hover)}
.sep table.dt-t td.mid{text-align:center}
.sep .pa-p{color:var(--pms-ok-ink);font-weight:800}
.sep .pa-a{color:var(--pms-miss-ink);font-weight:800}
.sep .pa-o{color:var(--muted);opacity:.5}
/* ---- the short summary ---- */
/* ---- Employee assets / Training & Skill, opened in the page rather than
   behind a modal: they are short forms about the engineer whose numbers are
   right above them, and a modal hides exactly that. ---- */
.sep .inl{border:1px solid var(--pms-div);border-radius:11px;background:var(--card);
      margin-bottom:14px;overflow:hidden;scroll-margin-top:112px}
.sep .inl-top{background:var(--pms-head);padding:8px 13px;display:flex;flex-wrap:wrap;align-items:center;gap:10px;
      border-bottom:1px solid var(--pms-line)}
.sep .inl-top h4{margin:0;font-size:12.5px;font-weight:700;color:var(--ink)}
.sep .inl-top .s2{font-size:10px;color:var(--muted);margin-top:1px}
.sep .inl-acts{margin-left:auto;display:flex;gap:6px}
.sep .inl-body{padding:11px 13px 13px}
.sep .inl-h{font-size:11.5px;font-weight:700;color:var(--ink);margin:12px 0 5px;padding-bottom:4px;
      border-bottom:1.5px solid var(--pms-div);display:flex;justify-content:space-between;align-items:baseline}
.sep .inl-h:first-child{margin-top:0}
.sep .inl-h span{font-size:10px;font-weight:500;color:var(--muted)}
.sep .inl-set{font-size:10px;color:var(--muted);margin:0 0 7px}
.sep .inl-set b{color:var(--ink-2)}
.sep .inl-note{font-size:10.5px;color:var(--ink-2);background:var(--soft);border:1px solid var(--edge);
      border-radius:8px;padding:7px 10px;margin-top:8px}
.sep .inl-note b{color:var(--ink)}
.sep .inl-none{font-size:10.5px;color:var(--muted);padding:8px 2px;font-style:italic}
/* skills read as a set, not as a table: a table of one column and a date is a
   list wearing a table's chrome */
.sep .skills{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
.sep .skill{display:inline-flex;align-items:baseline;gap:6px;padding:4px 9px;border-radius:999px;
      border:1px solid var(--pms-line);background:var(--pms-row-b);font-size:11px;color:var(--ink)}
.sep .skill b{font-weight:600}
.sep .skill em{font-style:normal;font-size:9.5px;color:var(--muted)}
.sep .inl-tbl{border:1px solid var(--pms-line);border-radius:9px;overflow:auto;max-height:230px}
.sep .inl-tbl table{border-collapse:separate;border-spacing:0;width:100%;font-size:10.5px}
.sep .inl-tbl th{position:sticky;top:0;background:var(--pms-head);color:var(--ink-2);font-size:9px;
      font-weight:700;text-transform:uppercase;letter-spacing:.05em;text-align:left;padding:5px 8px;
      box-shadow:inset 0 -1px 0 var(--pms-line)}
.sep .inl-tbl td{padding:4px 8px;color:var(--ink-2);box-shadow:inset 0 -1px 0 var(--pms-line)}
.sep .inl-tbl tr:nth-child(odd) td{background:var(--pms-row-a)}
.sep .inl-tbl tr:nth-child(even) td{background:var(--pms-row-b)}
.sep .inl-tbl td.n{width:28px;color:var(--muted);text-align:center}
.sep .inl-tbl td.c{width:96px;text-align:center;white-space:nowrap}
.sep .inl-tbl td.mut{color:var(--muted)}
.sep .inl-tbl b{color:var(--ink)}
.sep .chk.two{columns:2;column-gap:26px}
@media(max-width:760px){.sep .chk.two{columns:1}}
.sep .chk.two label{break-inside:avoid}

.sep .sm-box{border:1px solid var(--edge);border-radius:11px;background:var(--soft);padding:11px 13px;margin-bottom:14px}
.sep .sm-box h4{margin:0 0 9px;font-size:11.5px;font-weight:700;color:var(--ink);display:flex;align-items:baseline;gap:8px}
.sep .sm-box h4 span{font-size:10px;font-weight:500;color:var(--muted)}
.sep .sm-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:10px}
@media(max-width:760px){.sep .sm-tiles{grid-template-columns:repeat(2,1fr)}
}
.sep .sm-t{background:var(--card);border:1px solid var(--edge);border-radius:9px;padding:7px 10px}
.sep .sm-t .l{display:block;font-size:8.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700}
.sep .sm-t .v{display:block;font-size:17px;font-weight:800;line-height:1.2;color:var(--ink);font-variant-numeric:tabular-nums}
.sep .sm-t .h{display:block;font-size:9.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sep .sm-say{margin:0;padding-left:16px;font-size:11.5px;line-height:1.65;color:var(--ink-2)}
.sep .sm-say li{margin-bottom:1px}
.sep .sm-say b{color:var(--ink);font-weight:600}
.sep .dt-charts{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:900px){.sep .dt-charts{grid-template-columns:1fr}
}
.sep .ch{margin:0;border:1px solid var(--edge);border-radius:11px;padding:9px 11px 6px;background:var(--card);min-width:0}
.sep .ch figcaption{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;margin-bottom:6px}
.sep .ch-t{font-size:11.5px;font-weight:700;color:var(--ink)}
.sep .ch-s{font-size:9.5px;color:var(--muted)}
.sep .ch-lg{display:flex;flex-wrap:wrap;gap:9px;margin-left:auto;font-size:9.5px;color:var(--ink-2)}
.sep .ch-lg span{display:inline-flex;align-items:center;gap:4px}
.sep .ch-lg i{width:9px;height:9px;border-radius:3px;display:inline-block;flex:none}
.sep .ch svg{display:block;width:100%;height:auto}
.sep .ch svg text{font-family:var(--font-sans)}
.sep .ch-none{font-size:10.5px;color:var(--muted);padding:16px 0;text-align:center}
.sep footer{margin-top:14px;font-size:10.5px;color:var(--muted);text-align:center}
/* ---------------- engineer scorecard modal (the printable Annexure-I) ----- */
.sep .mask{display:none;position:fixed;inset:0;z-index:100;background:rgba(10,16,24,.55);backdrop-filter:blur(2px);
      align-items:flex-start;justify-content:center;padding:4px;overflow:hidden}
.sep .mask.open{display:flex}
/* the signed matrix fills the screen and sits at the top; the two short panels
   are centred, where a short dialogue belongs */
.sep .mask.mid{align-items:center}
.sep .mask.mid .sheet{max-width:660px}
/* The sheet owns the height and its BODY does the scrolling, so the title bar
   stays put instead of scrolling away from the numbers it names. */
.sep .sheet{background:#fff;color:#111827;width:100%;max-width:1040px;border-radius:14px;
       box-shadow:0 24px 60px rgba(0,0,0,.35);overflow:hidden;
       height:calc(100vh - 8px);max-height:calc(100vh - 8px);display:flex;flex-direction:column}
.sep .sheet .sh-top{background:linear-gradient(120deg,var(--brand) 0%,var(--brand-d) 100%);color:#fff;
       padding:7px 18px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.sep .sheet .sh-top h2{margin:0;font-size:13px;font-weight:700;letter-spacing:-.01em;line-height:1.25}
.sep .sheet .sh-top .s2{font-size:10.5px;color:rgba(255,255,255,.75);margin-top:1px}
.sep .sh-x{border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.14);color:#fff;border-radius:8px;padding:5px 10px;font:inherit;font-size:11.5px;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
.sep .sh-x:hover{background:rgba(255,255,255,.26)}
.sep .sh-body{padding:11px 18px 20px;overflow-y:auto;flex:1 1 auto;min-height:0;
         scrollbar-width:thin;scrollbar-color:var(--pms-line-v) transparent}
.sep .sh-body::-webkit-scrollbar{width:6px}
.sep .sh-body::-webkit-scrollbar-thumb{background:var(--pms-line-v);border-radius:6px}
.sep .sh-body::-webkit-scrollbar-track{background:transparent}
/* The identity strip rides with the title bar: six fields, two rows of three,
   pinned. It names what every figure below it is about, so it must not scroll
   away from them. */
.sep .sh-pin{flex:none;border-bottom:1px solid #9fc0df}
.sep .sh-id{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin:0;padding:6px 18px;background:#fff}
@media(max-width:640px){.sep .sh-id{grid-template-columns:repeat(2,1fr)}
}
.sep .sh-id .f{border:1px solid var(--pms-line);border-radius:6px;padding:3px 8px;background:#f7fbff;
      display:flex;align-items:baseline;gap:7px;min-width:0}
.sep .sh-id .f .l{font-size:8px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;font-weight:700;
      flex:none;white-space:nowrap}
.sep .sh-id .f .v{font-size:11px;font-weight:600;color:#111827;line-height:1.5;margin-left:auto;
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}
.sep .sh-h{font-size:11.5px;font-weight:700;color:#111827;margin:12px 0 6px;padding-bottom:4px;border-bottom:1.5px solid #111827;display:flex;justify-content:space-between;align-items:baseline}
.sep .sh-h span{font-size:10px;font-weight:500;color:#6b7280}
.sep table.sh-t{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed}
.sep table.sh-t th, .sep table.sh-t td{border:1px solid #9fc0df;padding:5px 7px;vertical-align:middle;
  overflow-wrap:break-word;word-break:normal}
/* table-layout:fixed reads its widths from the FIRST row, so they are declared
   on the colgroup rather than on the tds — otherwise all six columns come out
   equal and the KPI text paints over the Commitment column. */
.sep table.sh-t col.w-n{width:30px}
.sep table.sh-t col.w-c{width:118px}
.sep table.sh-t col.w-a{width:100px}
.sep table.sh-t col.w-p{width:54px}
.sep table.sh-t col.w-s{width:64px}
.sep table.sh-t th{background:#e8f3fc;font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#374151;text-align:center}
.sep table.sh-t td.n{text-align:center;color:#6b7280;font-variant-numeric:tabular-nums}
.sep table.sh-t td.k{text-align:left;line-height:1.3}
.sep table.sh-t td.c{text-align:center;color:#374151;line-height:1.3}
.sep table.sh-t td.a{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.sep table.sh-t td.p{text-align:right;font-variant-numeric:tabular-nums}
.sep table.sh-t td.s{text-align:center;font-size:9px;font-weight:700;letter-spacing:.04em}
.sep .sh-ok{background:#cdeccd;color:#12401f}
.sep .sh-near{background:#fbf0bd;color:#4a3c05}
.sep .sh-miss{background:#fbd9b5;color:#6b3405}
/* ---- the two-way document ---- */
@media(min-width:1px){.sep .sh-id{grid-template-columns:repeat(3,1fr)}
}
.sep .sh-id .f .v .vs{display:inline;font-size:9px;font-weight:400;color:#6b7280;margin-left:5px}
/* pinned with the identity: the recommendation is the one thing the sheet
   exists to deliver, and it should stay in view over the detail that
   justifies it */
.sep .sh-verdict{display:grid;grid-template-columns:auto 1fr auto;gap:16px;align-items:center;
     border-left:5px solid #9fc0df;border-top:1px solid #9fc0df;border-radius:0;
     padding:6px 18px;margin:0;background:#f7fbff}
.sep .sh-verdict.v-good{border-left-color:#0ca30c}
.sep .sh-verdict.v-warn{border-left-color:#fab219}
.sep .sh-verdict.v-bad{border-left-color:#d03b3b}
@media(max-width:760px){.sep .sh-verdict{grid-template-columns:1fr}
}
.sep .sh-verdict .l{font-size:8.5px;text-transform:uppercase;letter-spacing:.07em;color:#6b7280;font-weight:700}
.sep .sh-verdict .sc{text-align:center;padding-right:14px;border-right:1px solid #9fc0df}
@media(max-width:760px){.sep .sh-verdict .sc{border-right:0;border-bottom:1px solid #9fc0df;padding:0 0 8px;text-align:left}
}
.sep .sh-verdict .big{font-size:23px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.sep .sh-verdict .big span{font-size:14px}
.sep .sh-verdict .h{font-size:13.5px;font-weight:700;color:#111827;margin-top:1px}
.sep .sh-verdict .w{font-size:10.5px;color:#374151;margin-top:1px;line-height:1.45}
.sep .sh-verdict .vm{font-size:10px;color:#374151;line-height:1.5;white-space:nowrap}
.sep .sh-verdict .vm b{font-weight:700;color:#111827}
.sep .sh-2col{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}
@media(max-width:760px){.sep .sh-2col{grid-template-columns:1fr;gap:4px}
}
.sep .sh-sub{font-size:10px;font-weight:700;color:#374151;margin:2px 0 5px;display:flex;gap:7px;align-items:baseline}
.sep .sh-sub em{font-style:normal;font-weight:400;font-size:9.5px;color:#6b7280}
.sep .sh-note{font-size:10.5px;color:#374151;background:#f7fbff;border:1px solid #9fc0df;border-radius:8px;padding:6px 9px;margin-top:6px}
.sep .sh-note b{color:#111827}
.sep table.sh-t .sub2{font-size:9px;color:#6b7280;margin-top:1px;font-weight:400}
.sep table.sh-t.stake td.k{text-align:left}
.sep table.sh-t.stake td.a{width:104px}
.sep table.sh-t.stake tr.tot td{background:#e8f3fc;font-weight:800;color:#111827}
.sep table.sh-t.act td.g{width:88px;text-align:center}
.sep table.sh-t.act td.k{text-align:left;font-size:10.5px}
.sep .tag{display:inline-block;font-size:8.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;
     border-radius:4px;padding:2px 6px}
.sep .tag.t-good{background:#cdeccd;color:#12401f}
.sep .tag.t-warn{background:#fbf0bd;color:#4a3c05}
.sep .tag.t-bad{background:#fbd9b5;color:#6b3405}
.sep .sh-none{font-size:10.5px;color:#6b7280;padding:9px 2px;font-style:italic}
/* ---- the conversation: a headline, then one card per gap ---- */
.sep .sh-lede{display:flex;align-items:center;gap:16px;background:#f7fbff;border:1px solid #9fc0df;
         border-radius:10px;padding:10px 15px;margin-bottom:9px}
.sep .sh-lede .ld-n{font-size:26px;font-weight:800;line-height:1;color:#6b3405;font-variant-numeric:tabular-nums;flex:none}
.sep .sh-lede .ld-t{font-size:11px;color:#374151;line-height:1.55}
.sep .sh-lede b{color:#111827;font-weight:700}
.sep .gaps{display:grid;grid-template-columns:1fr 1fr;gap:8px}
@media(max-width:820px){.sep .gaps{grid-template-columns:1fr}
}
.sep .gap{border:1px solid #9fc0df;border-radius:9px;padding:7px 10px 8px;background:#fff;break-inside:avoid}
.sep .gap .gh{display:flex;align-items:center;gap:7px;margin-bottom:3px}
.sep .gap .gn{width:17px;height:17px;border-radius:5px;background:#e8f3fc;color:#23255f;font-size:9.5px;
         font-weight:800;display:flex;align-items:center;justify-content:center;flex:none}
.sep .gap .gt{font-size:11px;font-weight:700;color:#111827;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sep .gap .gs{font-size:9.5px;color:#6b7280;margin-left:auto;white-space:nowrap;flex:none}
.sep .gap .gw{font-size:11.5px;font-weight:800;color:#6b3405;font-variant-numeric:tabular-nums;flex:none;min-width:56px;text-align:right}
.sep .gap .gb{font-size:10.5px;color:#374151;line-height:1.5}
.sep .gap .ga{font-size:10.5px;color:#111827;line-height:1.5;margin-top:3px;padding-top:3px;border-top:1px dashed #cfe0f0}
.sep .gap .ga b{color:#23255f}
.sep .sh-ask{font-size:10.5px;color:#374151;line-height:1.6;background:#eef7ee;border:1px solid #b7d9b7;
        border-radius:9px;padding:8px 11px;margin-top:9px}
.sep .sh-ask b{color:#12401f}
/* ---- the tick lists: a record, kept compact ---- */
.sep .chk{font-size:10.5px}
.sep .chk.two{columns:2;column-gap:26px}
@media(max-width:640px){.sep .chk.two{columns:1}
}
.sep .chk.two label{break-inside:avoid}
.sep .chk.big{font-size:11.5px}
.sep .chk.big label{padding:4px 0}
.sep .chk.big input{width:15px;height:15px}
.sep .chk label em{font-style:normal;font-size:9.5px;color:#6b7280;margin-left:5px}
.sep .chk label{display:flex;gap:6px;align-items:center;padding:1.5px 0;color:#374151;cursor:pointer;line-height:1.35}
.sep .chk label:hover{color:#111827}
.sep .chk input{accent-color:#2f3192;width:13px;height:13px;flex:none;cursor:pointer}
.sep .chk span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sep .chk.train label{cursor:default}
.sep .chk.train input{accent-color:#0ca30c}
.sep .chk.train b{margin-left:auto;font-size:9px;color:#6b7280;font-weight:600;flex:none;padding-left:8px}
.sep .sh-set{font-size:10px;color:#6b7280;margin:-3px 0 7px;display:flex;align-items:center;gap:5px}
.sep .sh-set b{color:#2f3192;font-weight:600}
.sep .sh-decl{font-size:10.5px;color:#374151;line-height:1.65;background:#f7fbff;border:1px solid #9fc0df;border-radius:8px;padding:9px 11px;margin-top:6px}
.sep .sh-score{display:flex;align-items:center;gap:12px;background:#f7fbff;border:1px solid #9fc0df;border-radius:10px;padding:9px 13px;margin-bottom:4px}
.sep .sh-score .big{font-size:27px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.sep .sh-score .lbl{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;font-weight:700}
.sep .sh-score .gcell{margin-left:auto;text-align:right}
.sep :focus-visible{outline:2px solid var(--brand);outline-offset:2px;border-radius:4px}

/* ---------------------------------------------------------------------------
   Printing.

   The page prints ONE block: either the engineer's report or the signed
   matrix, whichever carries .sep-print-area. It is done with VISIBILITY, not
   display: display:none on an ancestor cannot be undone by a descendant, so
   hiding the app shell and then "showing" a block deep inside it printed a
   blank page. Visibility can be turned back on further down the tree, and the
   block is lifted to the top-left so the hidden-but-present layout around it
   does not push it off the paper.

   Landscape, because the breakdown is wide by nature — a month is 31 columns —
   and the table shrinks its own type rather than losing its right-hand side.
   ------------------------------------------------------------------------ */
@media print{
  @page{size:A4 landscape;margin:8mm}
  html,body{height:auto !important;overflow:visible !important;background:#fff !important}

  body.sep-printing *{visibility:hidden !important}
  body.sep-printing .sep-print-area,
  body.sep-printing .sep-print-area *{visibility:visible !important}
  body.sep-printing .sep-hide-print,
  body.sep-printing .sep-hide-print *{visibility:hidden !important}

  body.sep-printing .sep-print-area{
    position:absolute !important;left:0;top:0;width:100%;
    margin:0 !important;border:0 !important;box-shadow:none !important;border-radius:0 !important;
    max-height:none !important;height:auto !important;overflow:visible !important}

  /* the modal's own chrome has nothing to do with the paper */
  body.sep-printing .sep .mask{position:static !important;background:none !important;
    padding:0 !important;backdrop-filter:none !important;display:block !important;overflow:visible !important}

  /* nothing pins on paper — there is no scrolling to pin against */
  body.sep-printing .sep .dt-pin,
  body.sep-printing .sep .sh-pin,
  body.sep-printing .sep table.dt-t thead th,
  body.sep-printing .sep table.dt-t th.m,
  body.sep-printing .sep table.dt-t .tot{position:static !important}
  body.sep-printing .sep .dt-topbar{display:none !important}
  /* on paper the scrolling copy gives way to the stacked blocks. The class is
     put on by the component rather than inferred with :has() — a sibling
     selector is a fragile way to decide what prints. */
  body.sep-printing .sep .dt-print-only{display:block !important}
  body.sep-printing .sep .dt-frame-off{display:none !important}
  body.sep-printing .sep .dt-chunk{break-inside:avoid}
  body.sep-printing .sep .dt-frame{overflow:visible !important;border-radius:8px}
  body.sep-printing .sep .dt-tblbox{max-height:none !important;overflow:visible !important}
  body.sep-printing .sep .sh-body{overflow:visible !important;max-height:none !important}
  body.sep-printing .sep .sheet{max-height:none !important;height:auto !important;display:block !important}
  body.sep-printing .sep .sh-pin{border-bottom:1px solid #9fc0df}

  /* the breakdown fits the page instead of running off it */
  body.sep-printing .sep table.dt-t{width:100% !important;min-width:0 !important;table-layout:fixed}
  body.sep-printing .sep table.dt-t th,
  body.sep-printing .sep table.dt-t td{padding:2px 3px;font-size:6.5pt}
  body.sep-printing .sep table.dt-t th.m{width:104px;min-width:104px;max-width:104px;
    font-size:7pt;white-space:normal;box-shadow:none}
  body.sep-printing .sep table.dt-t thead th{font-size:5.8pt;line-height:1.15}
  body.sep-printing .sep table.dt-t thead th b{font-size:6.2pt}
  body.sep-printing .sep .dt-charts{grid-template-columns:1fr 1fr}

  /* keep a card, a row or a chart from being cut in half by a page break */
  body.sep-printing .sep .ch,
  body.sep-printing .sep .gap,
  body.sep-printing .sep .sm-box,
  body.sep-printing .sep .inl,
  body.sep-printing .sep tr{break-inside:avoid}
  body.sep-printing .sep .sh-t thead{display:table-header-group}

  body.sep-printing *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
}
`;

export default SE_PERFORMANCE_CSS;
