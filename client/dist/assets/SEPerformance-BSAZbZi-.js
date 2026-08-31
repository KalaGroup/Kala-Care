import{j as t}from"./vendor-chartjs-DaFCGlIH.js";import{r as j,f as Xe}from"./vendor-react-Chjj6F22.js";import{z as Nt,c as et}from"./index-COUKT8CZ.js";import{D as St}from"./react-datepicker-SvnW9jw0.js";import{F as Mt}from"./ClipboardDocumentCheckIcon-DgJRjGaE.js";import{F as zt}from"./CalendarDaysIcon-DNAH6L5_.js";import"./vendor-recharts-B6A5ZsbM.js";const Ft=`/* ============================================================================
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
`,ke=[{no:1,key:"sr",perMonth:!0,name:"CSP/PW BD/CM together Min SR Count",short:"SR Count",head:"SR Count",unit:"count",fmt:"int",target:60,dir:"min",commit:"Minimum 60 SR’s",hint:"UW / Bandhan / PM / CM / BD",agg:"sum",sec:"vol"},{no:null,sortNo:1.5,key:"prod",name:"Productivity — SR Close per Day Present",short:"Productivity",head:"Productivity",unit:"SR / day",fmt:"rate2",target:null,dir:null,commit:"SR ÷ days present",hint:"closed SRs per day worked",agg:"derived",sec:"vol",info:!0,derive:e=>e.present?e.sr/e.present:0},{no:2,key:"spare",perMonth:!0,name:"Spare Parts Sales / Month",short:"Spare Sales",head:"Spare Sales",unit:"₹",fmt:"amt",target:15e4,dir:"min",commit:"Minimum ₹1,50,000",hint:"part revenue booked by the engineer",agg:"sum",sec:"rev"},{no:3,key:"labour",perMonth:!0,name:"Labour Revenue Generation / Month",short:"Labour Rev.",head:"Labour Rev.",unit:"₹",fmt:"amt",target:6e4,dir:"min",commit:"Minimum ₹60,000",hint:"labour value on SRs closed",agg:"sum",sec:"rev"},{no:4,key:"amcLead",perMonth:!0,name:"AMC Lead Generation / Month",short:"AMC Leads",head:"AMC Leads",unit:"count",fmt:"int",target:5,dir:"min",commit:"Minimum 5 Leads",hint:"LMS leads, category AMC",agg:"sum",sec:"lead"},{no:5,key:"battery",perMonth:!0,name:"Battery Sell / Month",short:"Battery",head:"Battery",unit:"count",fmt:"int",target:3,dir:"min",commit:"Minimum 3 Batteries",hint:"converted battery leads",agg:"sum",sec:"lead"},{no:12,key:"lms",name:"Leads to be updated on LMS",short:"LMS Update",head:"LMS Update",unit:"%",fmt:"pct",target:100,dir:"min",commit:"100%",hint:"leads raised vs leads eligible",agg:"avg",sec:"lead"},{no:6,key:"first",name:"First Site Reporting Daily",short:"1st Site <10 AM",head:"1st Site",unit:"%",fmt:"pct",target:100,dir:"min",commit:"Before 10:00 AM",hint:"% of days reporting before 10:00",agg:"avg",sec:"disc"},{no:8,key:"sfTask",name:"Salesforce Task Closure Daily",short:"SF Task Closure",head:"SF Task",unit:"%",fmt:"pct",target:100,dir:"min",commit:"Before Leaving Site",hint:"% of tasks closed on the visit day",agg:"avg",sec:"disc"},{no:10,key:"attend",name:"Attendance & Discipline",short:"Attendance",head:"Attendance",unit:"%",fmt:"pct",target:95,dir:"min",commit:"Minimum 95%",hint:"days present ÷ working days",agg:"avg",sec:"disc"},{no:7,key:"closure",name:"SR / eFSR Closure Daily",short:"SR Closure",head:"SR Closure",unit:"%",fmt:"pct",target:95,dir:"min",commit:"95% Within Timeline",hint:"% closed inside MaxTTR",agg:"avg",sec:"qual"},{no:9,key:"cdi",name:"Customer Satisfaction — CDI",short:"CDI Rating",head:"CDI",unit:"/10",fmt:"rate",target:9,dir:"min",commit:"Minimum 9/10 Rating",hint:"engineer’s CDI rating",agg:"avg",sec:"qual"},{no:11,key:"wetPm",name:"Min. Time Spent for Wet PM SR’s",short:"Wet PM Hrs",head:"Wet PM Hrs",unit:"hrs",fmt:"hrs",target:[1.5,2],dir:"range",commit:"1.5 to 2.0 Hrs",hint:"avg on-site hours, Wet PM SRs",agg:"avg",sec:"qual"}];ke.forEach(e=>{e.sortNo===void 0&&(e.sortNo=e.no)});const W=ke.filter(e=>!e.info),le=[["Uniform","Uniform issued"],["ID card","ID card issued"],["PPE set","PPE set — helmet, gloves, safety shoes"],["Tool kit","Tool kit issued"],["Measuring instruments","Measuring instruments issued"],["eFSR app access","Mobile / eFSR app access"],["Travel & conveyance","Travel & conveyance support"],["Coordinator support","Coordinator / back-office support"]],be=["Uniform, ID Card & PPE Usage at all times","Proper Tool Kit Availability","Machine Health Check During Every Visit","Promote Spare Parts, Batteries, Coolant, Filters & AMC","Explain Work Done and Site Status to Customer","Maintain Professional Behaviour & Safety Standards","No Repeat Complaints Due to Poor Workmanship","Timely Response to Coordinator and Customer Communication"],he=["Warranty","PW","AMC","KOEL AMC","CSP","Others"],Pe=["Filters","Battery","Coolant","K-Oil","DEF","Spares","Others"],Ct={sr:["LkVA","MkVA","HkVA","Industrial","CPCB","BS V","BSIV","CRDI","Engine","R550","K4300","Power Car","Bio Gas"],closure:["Breakdown","Industrial","CRDI","Engine","R550","K4300","CPCB"],wetPm:["PM"],cdi:["Brand Ambassador"],spare:["Brand Ambassador","KCC"],labour:["LkVA","MkVA","HkVA","Industrial","CPCB"],amcLead:["Brand Ambassador"],battery:["Inverter","Jump Start","KCC"],first:null,sfTask:null,lms:null,attend:null},Dt={MH:"Maharashtra",KA:"Karnataka"},tt=e=>{const s=/_(\d+)\s*$/.exec(String(e||""));return s?+s[1]:9999},dt=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],ct=864e5,R=e=>new Date(e+"T00:00:00"),ye=e=>`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,"0")}-${String(e.getDate()).padStart(2,"0")}`,pt=(e,s)=>{const a=R(e);return a.setDate(a.getDate()+s),ye(a)},Pt=(e,s)=>Math.round((R(s)-R(e))/ct)+1,Et=(e,s)=>new Date(e,s+1,0).getDate(),f={from:"",to:"",gran:"day",months:1,targets:Object.fromEntries(ke.map(e=>[e.key,Array.isArray(e.target)?e.target.slice():e.target])),weights:Object.fromEntries(ke.map(e=>[e.key,1]))};function Ue(){const e=[];if(!f.from||!f.to)return e;let s=R(f.from);s=new Date(s.getFullYear(),s.getMonth(),1);const a=R(f.to);for(;s<=a&&e.length<60;){const n=s.getFullYear(),r=s.getMonth(),i=Et(n,r),d=ye(new Date(n,r,1))>f.from?ye(new Date(n,r,1)):f.from,o=ye(new Date(n,r,i))<f.to?ye(new Date(n,r,i)):f.to,p=Pt(d,o);if(p>0){let g=0;for(let y=R(d).getDate();y<=R(o).getDate();y++)new Date(n,r,y).getDay()===0&&g++;e.push({y:n,m:r,dim:i,from:d,to:o,days:p,f:p/i,sun:g})}s=new Date(n,r+1,1)}return e}function Ne(e){const s=f.targets[e.key];return e.perMonth?s*f.months:s}function X(e,s){if(e.info||s==null||!isFinite(s))return null;const a=Ne(e);if(e.dir==="range"){const[n,r]=a;return s>=n&&s<=r?100:s<n?n?s/n*100:0:s?r/s*100:0}return a?s/a*100:0}const Lt=e=>e===null?"na":e>=100?"ok":e>=85?"near":"miss",ht=e=>e>=90?"A":e>=80?"B":e>=70?"C":e>=60?"D":"E";function At(e){let s=0,a=0;for(const n of W){const r=+f.weights[n.key]||0;if(!r)continue;const i=X(n,e.v[n.key]);i!==null&&(s+=Math.min(100,i)*r,a+=r)}return a?+(s/a).toFixed(1):0}function Tt(e){let s=e>>>0||1;return()=>(s=s*1103515245+12345>>>0,(s>>>8)/16777215)}const se=(e,s,a,n)=>{const r=s+e()*(a-s);return n?Math.round(r/n)*n:r},_e=(e,s,a)=>e()<a?100:+se(e,s,99.4).toFixed(1),Rt=e=>{const s=parseInt(String(e).replace(/\D/g,""),10);if(Number.isFinite(s)&&s>0)return s;let a=7;for(const n of String(e))a=a*31+n.charCodeAt(0)>>>0;return a||1};function Bt(e){const s=(e.branches||[]).map(r=>({id:r.branch_id,name:r.branch_name,region:(r.region||"MH").toUpperCase()})),a=Object.fromEntries(s.map(r=>[r.id,r])),n=(e.engineers||[]).filter(r=>a[r.branch_id]&&r.name).map((r,i)=>{const d=r.key||r.uid||`row${i}`,o=Tt(Rt(d)*7919+i*13),p=a[r.branch_id],g={key:d,name:r.name,bid:r.branch_id,uid:r.uid||"",code:r.code||"",region:p.region,branch:p.name,hired:r.hired||"",trainings:r.trainings||[],base:{prodRate:+se(o,1,1.5).toFixed(2),sr:0,spare:se(o,2e4,34e4,5e3),labour:se(o,8e3,165e3,2e3),amcLead:Math.round(se(o,0,12)),battery:Math.round(se(o,0,9)),lms:_e(o,46,.34),first:_e(o,50,.3),sfTask:_e(o,55,.32),attend:+se(o,62,100).toFixed(1),closure:+se(o,60,100).toFixed(1),cdi:+se(o,5.2,10).toFixed(1),wetPm:+se(o,.7,2.9).toFixed(2)},firstAvg:(()=>{const y=Math.round(se(o,530,650));return`${String(Math.floor(y/60)).padStart(2,"0")}:${String(y%60).padStart(2,"0")}`})(),comply:be.map(()=>o()>.16),support:Array.from({length:le.length},()=>o()>.13)};return g.base.sr=Math.round(g.base.prodRate*22),g.base.prod=g.base.prodRate,g.v=g.base,g});return{branches:s,ses:n}}function It(e){const s=Ue(),a=s.reduce((o,p)=>o+p.f,0)||1,n=e.base,r=s.reduce((o,p)=>o+(p.days-p.sun),0),i=Math.min(r,Math.round(r*n.attend/100)),d={sr:Math.max(1,Math.round(n.prodRate*i)),spare:n.spare*a,labour:n.labour*a,amcLead:Math.round(n.amcLead*a),battery:Math.round(n.battery*a),lms:n.lms,first:n.first,sfTask:n.sfTask,closure:n.closure,cdi:n.cdi,wetPm:n.wetPm,attend:r?+(i/r*100).toFixed(1):0,present:i};return d.prod=+(i?d.sr/i:0).toFixed(2),{v:d,months:a,work:r,present:i}}function Ot(e,s,a){return f.from=s,f.to=a,f.months=Ue().reduce((n,r)=>n+r.f,0)||1,e.forEach(n=>{const r=It(n);n.v=r.v,n.workDays=r.work,n.present=r.present,n.score=At(n),n.grade=ht(n.score)}),e}function Yt(e){const s={};for(const n of ke)if(n.agg!=="derived"){if(!e.length){s[n.key]=null;continue}n.agg==="sum"?s[n.key]=e.reduce((r,i)=>r+i.v[n.key],0):s[n.key]=+(e.reduce((r,i)=>r+i.v[n.key],0)/e.length).toFixed(2)}s.present=e.reduce((n,r)=>n+(r.present||0),0);for(const n of ke)n.agg==="derived"&&(s[n.key]=e.length?+n.derive(s).toFixed(2):null);const a=e.length?+(e.reduce((n,r)=>n+r.score,0)/e.length).toFixed(1):0;return{v:s,score:a,grade:ht(a),n:e.length,workDays:e.reduce((n,r)=>n+(r.workDays||0),0),present:s.present}}const mt=e=>Math.round(e).toLocaleString("en-IN"),P=mt,pe=e=>(e/1e5).toFixed(2),ae=e=>e.toFixed(1),Ee=e=>Number.isInteger(+e.toFixed(2))?String(+e.toFixed(2)):e.toFixed(2);function gt(e,s){if(s==null||s===0)return"–";switch(e.fmt){case"amt":return`₹${mt(s)}`;case"pct":return`${s.toFixed(1)}%`;case"rate":return s.toFixed(1);case"rate2":return`${Ee(s)} SR/day`;case"hrs":return s.toFixed(2);default:return Math.round(s).toLocaleString("en-IN")}}const xe=e=>e?R(e).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"2-digit"}):"",_t=e=>String(e).replace(/%/g,"").replace(/₹/g,"").replace(/ h$/,"").replace(/ SR\/day/,"").trim(),Wt=e=>e.dir==="range"?`${f.targets[e.key][0]}–${f.targets[e.key][1]}`:_t(gt(e,Ne(e))),ge=e=>/^0(\.0+)?%?$/.test(String(e).replace(/<[^>]*>/g,"").trim())?"–":e,ne=e=>String(e).replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&"),ut=e=>{const s=String(e).split(" ");return s[0].length<=3&&s[1]?`${s[0]} ${s[1]}`:s[0]},oe=(e,s,a)=>`${e} ${e===1?s:`${s}s`}`,He=e=>e?`${dt[+e.slice(5,7)-1]} ${e.slice(0,4)}`:"—";function Vt(e){if(!e.hired)return null;const s=(R(f.to)-R(e.hired))/(365.25*ct);return!isFinite(s)||s<0?null:{from:e.hired,years:s,label:s>=1?`${s.toFixed(1)} yrs`:`${Math.round(s*12)} mo`}}const Le=e=>{let s=e>>>0||1;return()=>(s=s*1103515245+12345>>>0,(s>>>8)/16777215)},Ke=e=>{const s=parseInt(String(e).replace(/\D/g,""),10);if(Number.isFinite(s)&&s>0)return s;let a=7;for(const n of String(e))a=a*31+n.charCodeAt(0)>>>0;return a||1},xt=(e,s)=>new Date(e,s+1,0).getDate(),qt=(e,s)=>{let a=0;const n=xt(e,s);for(let r=1;r<=n;r++)new Date(e,s,r).getDay()===0&&a++;return a};function de(e,s){const a=s.reduce((o,p)=>o+p,0)||1,n=s.map(o=>e*o/a),r=n.map(Math.floor),i=Math.round(e)-r.reduce((o,p)=>o+p,0),d=n.map((o,p)=>[o-Math.floor(o),p]).sort((o,p)=>p[0]-o[0]);for(let o=0;o<i;o++)r[d[o%d.length][1]]++;return r}const st=(e,s)=>{const a=s.reduce((n,r)=>n+r,0)||1;return s.map(n=>e*n/a)};function We(e,s,a,n){const r=Math.min(e,n-e)*.55,i=Array.from({length:s},()=>(a()-.5)*2*r),d=i.reduce((o,p)=>o+p,0)/s;return i.map(o=>e+o-d)}function Ve(e,s){const a=Le(e),n=Array.from({length:s},()=>.18+a()*1),r=n.reduce((i,d)=>i+d,0);return n.map(i=>i/r)}function Ht(e,s,a,n){const r=Math.min(s,n-s)*.5,i=e.map(()=>(a()-.5)*2*r),d=i.reduce((o,p,g)=>o+p*e[g],0);return i.map(o=>o-d)}function Se(e,s){const a=Ke(e.key),n=Ve(a*13+1,he.length),r=Ve(a*13+2,Pe.length),i=Ve(a*13+3,he.length),d=Ht(n,e.v.closure,Le(a*13+4),100);s.forEach(u=>{u.srBy={},u.labourBy={},u.spareBy={},u.closeBy={};const b=de(u.sr,n);he.forEach((x,w)=>{u.srBy[x]=b[w],u.labourBy[x]=u.labour*i[w],u.closeBy[x]=Math.max(0,Math.min(100,u.closure+d[w]))}),Pe.forEach((x,w)=>{u.spareBy[x]=u.spare*r[w]})});const o=Math.max(3,Math.round(s.reduce((u,b)=>u+b.sr,0)/4)),p=s.reduce((u,b)=>u+b.cdi*b.days,0)/(s.reduce((u,b)=>u+b.days,0)||1),g=Math.max(.06,Math.min(.94,(p-4.5)/5.5)),y=(1-g)*.45,[h,$,C]=de(o,[g,1-g-y,y]),E=s.map(u=>u.sr+.35),D=de(h,E),_=de($,E),L=de(C,E);return s.forEach((u,b)=>{u.cdiP=D[b],u.cdiPa=_[b],u.cdiD=L[b],u.cdiN=D[b]+_[b]+L[b]}),s}function bt(e){const s=[];for(let u=f.from;u<=f.to&&s.length<400;u=pt(u,1))s.push(u);const a=s.length||1,n=Le(Ke(e.key)*31+17),r=s.map(u=>R(u).getDay()===0?.07:.55+n()*1),i=de(e.v.sr,r),d=st(e.v.spare,r),o=st(e.v.labour,r),p=de(e.v.amcLead,r),g=de(e.v.battery,r),y=s.map(u=>R(u).getDay()===0?0:1),h=y.reduce((u,b)=>u+b,0),$=y.slice(),C=[...s.keys()].sort((u,b)=>u*2246822519%101-b*2246822519%101);let E=h-Math.max(0,Math.min(h,Math.round(h*e.v.attend/100)));for(const u of C){if(E<=0)break;$[u]&&($[u]=0,E--)}const D=We(e.v.closure,a,n,100),_=We(e.v.first,a,n,100),L=We(e.v.cdi,a,n,10);return Se(e,s.map((u,b)=>({key:u,label:R(u).toLocaleDateString("en-GB",{day:"2-digit",month:"short"}),sub:R(u).toLocaleDateString("en-GB",{weekday:"short"}),off:R(u).getDay()===0,sr:i[b],spare:d[b],labour:o[b],leads:p[b],batt:g[b],work:y[b],pres:$[b],attend:y[b]?$[b]*100:e.v.attend,closure:D[b],first:_[b],cdi:L[b],days:1})))}function Ut(e){const s=bt(e),a=[];return s.forEach(n=>{const r=(R(n.key).getDay()+6)%7,i=pt(n.key,-r);let d=a[a.length-1];(!d||d.ws!==i)&&(d={ws:i,key:i,label:`W${a.length+1}`,sub:"",sr:0,spare:0,labour:0,leads:0,batt:0,work:0,pres:0,closure:0,first:0,cdi:0,days:0},a.push(d)),["sr","spare","labour","leads","batt","work","pres"].forEach(o=>{d[o]+=n[o]}),["closure","first","cdi"].forEach(o=>{d[o]+=n[o]}),d.days++,d.end=n.key}),a.forEach(n=>{["closure","first","cdi"].forEach(i=>{n[i]/=n.days}),n.attend=n.work?n.pres/n.work*100:0;const r=n.ws<f.from?f.from:n.ws;n.sub=`${R(r).getDate()}–${R(n.end).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}`}),Se(e,a)}function Ge(e,s){const a=R(f.to),n=[],r=Le(Ke(e.key)*7919+3);for(let i=s-1;i>=0;i--){const d=new Date(a.getFullYear(),a.getMonth()-i,1),o=xt(d.getFullYear(),d.getMonth()),p=i===0?1:.62+r()*.72,g={key:ye(d),label:dt[d.getMonth()],sub:String(d.getFullYear()).slice(2),cur:i===0,days:o,sr:0,spare:e.base.spare*p,labour:e.base.labour*p,leads:Math.round(e.base.amcLead*p),batt:Math.round(e.base.battery*p),attend:Math.min(100,e.base.attend*(i===0?1:.9+r()*.2)),closure:Math.min(100,e.base.closure*(i===0?1:.88+r()*.24)),first:Math.min(100,e.base.first*(i===0?1:.88+r()*.24)),cdi:Math.min(10,e.base.cdi*(i===0?1:.9+r()*.2))};g.work=o-qt(d.getFullYear(),d.getMonth()),g.pres=Math.round(g.work*g.attend/100),g.attend=g.work?g.pres/g.work*100:0;const y=Math.max(1,Math.min(1.5,e.base.prodRate*(.92+r()*.16)));g.sr=Math.max(1,Math.round(y*g.pres)),n.push(g)}return n}function Kt(e){const s=Ue(),a=Ge(e,Math.max(12,s.length)),n=s.length>1?a.filter(r=>s.some(i=>i.y===R(r.key).getFullYear()&&i.m===R(r.key).getMonth())):a.slice(-12);return Se(e,n.length?n:a.slice(-12))}const Gt=e=>Math.floor((e+9)%12/3),$e=e=>e.getMonth()>=3?e.getFullYear():e.getFullYear()-1;function Qt(e,s,a,n,r){const i=[],d=new Map;return s.forEach(o=>{const p=R(o.key),g=a(p);let y=d.get(g);y||(y={key:g,label:n(p),sub:r(p),days:0,sr:0,spare:0,labour:0,leads:0,batt:0,work:0,pres:0,closure:0,first:0,cdi:0},d.set(g,y),i.push(y)),["sr","spare","labour","leads","batt","work","pres","days"].forEach(h=>{y[h]+=o[h]}),["closure","first","cdi"].forEach(h=>{y[h]+=o[h]*o.days})}),i.forEach(o=>{["closure","first","cdi"].forEach(p=>{o[p]=o.days?o[p]/o.days:0}),o.attend=o.work?o.pres/o.work*100:0}),Se(e,i)}const Jt=["Apr–Jun","Jul–Sep","Oct–Dec","Jan–Mar"];function Zt(e){const s=$e(R(f.to)),a=Jt.map((n,r)=>({key:`${s}Q${r}`,label:`Q${r+1}`,sub:n,empty:!0,days:0,sr:0,spare:0,labour:0,leads:0,batt:0,work:0,pres:0,closure:0,first:0,cdi:0,attend:0}));return Ge(e,24).forEach(n=>{const r=R(n.key);if($e(r)!==s)return;const i=a[Gt(r.getMonth())];i.empty=!1,["sr","spare","labour","leads","batt","work","pres","days"].forEach(d=>{i[d]+=n[d]}),["closure","first","cdi"].forEach(d=>{i[d]+=n[d]*n.days})}),a.forEach(n=>{["closure","first","cdi"].forEach(r=>{n[r]=n.days?n[r]/n.days:0}),n.attend=n.work?n.pres/n.work*100:0}),Se(e,a)}const Xt=e=>Qt(e,Ge(e,48),s=>String($e(s)),s=>`FY ${String($e(s)).slice(2)}–${String($e(s)+1).slice(2)}`,()=>""),es=e=>f.gran==="day"?bt(e):f.gran==="week"?Ut(e):f.gran==="quarter"?Zt(e):f.gran==="year"?Xt(e):Kt(e),V=(e,s)=>e.reduce((a,n)=>a+s(n),0),qe=(e,s)=>{const a=e.reduce((n,r)=>n+r.days,0)||1;return e.reduce((n,r)=>n+s(r)*r.days,0)/a},ts=(e,s,a)=>{const n=V(e,r=>r.srBy[a]);return n?e.reduce((r,i)=>r+s(i)*i.srBy[a],0)/n:null},rt=[{id:"sr",lab:"SR closed",u:"count",mid:!0,val:e=>e.sr,f:P,tot:e=>P(V(e,s=>s.sr)),kids:()=>he.map(e=>({lab:e,u:"count",mid:!0,val:s=>s.srBy[e],f:P,tot:s=>P(V(s,a=>a.srBy[e]))}))},{id:"prod",lab:"Productivity",u:"SR / day",mid:!0,val:e=>e.pres?e.sr/e.pres:null,f:Ee,tot:e=>{const s=V(e,a=>a.pres);return s?Ee(V(e,a=>a.sr)/s):"–"}},{id:"spare",lab:"Spare parts sales",u:"₹ Lakh",val:e=>e.spare,f:pe,tot:e=>pe(V(e,s=>s.spare)),kids:()=>Pe.map(e=>({lab:e,u:"₹ Lakh",val:s=>s.spareBy[e],f:pe,tot:s=>pe(V(s,a=>a.spareBy[e]))}))},{id:"labour",lab:"Labour revenue",u:"₹ Lakh",val:e=>e.labour,f:pe,tot:e=>pe(V(e,s=>s.labour)),kids:()=>he.map(e=>({lab:e,u:"₹ Lakh",val:s=>s.labourBy[e],f:pe,tot:s=>pe(V(s,a=>a.labourBy[e]))}))},{id:"leads",lab:"AMC leads",u:"count",mid:!0,val:e=>e.leads,f:e=>String(Math.round(e)),tot:e=>String(V(e,s=>s.leads))},{id:"batt",lab:"Battery sold",u:"count",mid:!0,val:e=>e.batt,f:e=>String(Math.round(e)),tot:e=>String(V(e,s=>s.batt))},{id:"closure",lab:"SR / eFSR closure",u:"%",val:e=>e.closure,f:ae,tot:e=>ae(qe(e,s=>s.closure)),kids:()=>he.map(e=>({lab:e,u:"%",val:s=>s.srBy[e]?s.closeBy[e]:null,f:ae,tot:s=>{const a=ts(s,n=>n.closeBy[e],e);return a==null?"–":ae(a)}}))},{id:"first",lab:"First site before 10:00",u:"%",val:e=>e.first,f:ae,tot:e=>ae(qe(e,s=>s.first))},{id:"cdi",lab:"Customer delight (CDI)",u:"/ 10",mid:!0,val:e=>e.cdi,f:ae,tot:e=>ae(qe(e,s=>s.cdi)),kids:()=>[{lab:"Promotor (P)",u:"count",mid:!0,val:e=>e.cdiP,f:e=>String(e),tot:e=>String(V(e,s=>s.cdiP))},{lab:"Passive (P)",u:"count",mid:!0,val:e=>e.cdiPa,f:e=>String(e),tot:e=>String(V(e,s=>s.cdiPa))},{lab:"Detractor (D)",u:"count",mid:!0,val:e=>e.cdiD,f:e=>String(e),tot:e=>String(V(e,s=>s.cdiD))},{lab:"CDI %",u:"%",val:e=>e.cdiN>=3?(e.cdiP-e.cdiD)/e.cdiN*100:null,f:ae,tot:e=>{const s=V(e,a=>a.cdiN);return s?ae((V(e,a=>a.cdiP)-V(e,a=>a.cdiD))/s*100):"–"}}]}];function ss(e,s){const a=Math.max(3,Math.round(e/4)),n=Math.max(.06,Math.min(.94,(s-4.5)/5.5)),r=(1-n)*.45,[i,d,o]=de(a,[n,1-n-r,r]);return{P:i,Pa:d,D:o,N:a}}function rs(e,s,a){const n=Ne(e),r=s.v[e.key],i=Array.isArray(n)?0:Math.max(0,n-r),d=4.3*f.months;switch(e.key){case"sr":return{short:`${oe(i,"SR")} short`,say:`${P(r)} SRs closed against ${P(n)}. ${i} short — about ${(i/d).toFixed(1)} a week.`,ask:`Close ${Math.ceil(i/d)} more SRs a week.`};case"spare":return{short:`₹${P(i)} short`,say:`Spare parts billed ₹${P(r)} against ₹${P(n)}. That is ₹${P(s.v.sr?r/s.v.sr:0)} of parts attached per SR`+(a.bSpareSr!=null?`, where the branch attaches ₹${P(a.bSpareSr)}.`:"."),ask:`Attach ₹${P(s.v.sr?i/s.v.sr:i)} more parts per SR — a filter set or a coolant on the jobs already booked.`};case"labour":return{short:`₹${P(i)} short`,say:`Labour billed ₹${P(r)} against ₹${P(n)} — ₹${P(s.v.sr?r/s.v.sr:0)} a job`+(a.bLabSr!=null?` against the branch's ₹${P(a.bLabSr)}.`:"."),ask:`Bill the full labour line on every job; ₹${P(i)} over ${s.v.sr} SRs is ₹${P(s.v.sr?i/s.v.sr:i)} a job.`};case"amcLead":return{short:`${oe(i,"lead")} short`,say:`${oe(r,"AMC lead")} against ${n}. On ${s.v.sr} SRs that is one lead every ${s.v.amcLead?Math.round(s.v.sr/s.v.amcLead):s.v.sr} jobs.`,ask:`Raise ${i} more — one AMC ask on every ${Math.max(1,Math.round(s.v.sr/Math.max(1,n)))}th job covers it.`};case"battery":return{short:`${i} batter${i===1?"y":"ies"} short`,say:`${r} batteries sold against ${n}. Every wet PM is a battery check.`,ask:`${i} more this month — check and quote on the PM visits already scheduled.`};case"lms":return{short:`${(100-r).toFixed(1)}% not updated`,say:`${r.toFixed(1)}% of leads updated on LMS. The commitment is every one of them.`,ask:"Update the same day. An unlogged lead is a lead the branch cannot follow."};case"first":return{short:`${oe(Math.round(s.workDays*(100-r)/100),"day")} late`,say:`First site before 10:00 on ${r.toFixed(1)}% of days — roughly ${Math.round(s.workDays*(100-r)/100)} of ${s.workDays} working days started late.`,ask:"First call on site by 10:00 every day. Report the exception the evening before, not on the day."};case"sfTask":return{short:`${oe(Math.round(s.v.sr*(100-r)/100),"task")} left open`,say:`${r.toFixed(1)}% of tasks closed before leaving site — about ${Math.round(s.v.sr*(100-r)/100)} of ${s.v.sr} tasks left open.`,ask:"Close the task on the app before the vehicle moves."};case"attend":{const o=Math.max(0,s.workDays-s.present);return{short:`${oe(o,"day")} absent`,say:`Present ${s.present} of ${s.workDays} working days — ${o} absent. At his own billing that is ₹${P(a.perDay)} a day of work not done.`,ask:`Attendance above ${Ne(e)}% means no more than ${oe(Math.floor(s.workDays*(100-f.targets.attend)/100),"absent day")} in a month.`}}case"closure":{const o=Math.round(s.v.sr*(100-r)/100);return{short:`${oe(o,"SR")} late`,say:`${r.toFixed(1)}% closed inside the timeline against ${n}% — about ${o} of ${s.v.sr} SRs ran past MaxTTR.`,ask:"No SR past its timeline. Ask the coordinator to flag anything open on day two."}}case"cdi":{const o=a.cdi;return{short:`${(n-r).toFixed(1)} pts below`,say:`Rated ${r.toFixed(1)} of 10 against ${n}. ${o.D} of ${oe(o.N,"customer")} came back as ${o.D===1?"a detractor":"detractors"} this period`+(o.P?`, ${o.P} as promotors.`:"."),ask:"Explain the work done and the site status before leaving — that one habit moves the rating more than anything else."}}case"wetPm":{const[o,p]=f.targets.wetPm,g=r<o;return{short:g?`${(o-r).toFixed(2)} hrs under`:`${(r-p).toFixed(2)} hrs over`,say:g?`Wet PM jobs average ${r.toFixed(2)} hrs against the ${o}–${p} hr window — under the time the checklist takes.`:`Wet PM jobs average ${r.toFixed(2)} hrs against the ${o}–${p} hr window — longer than the job should need.`,ask:g?"Work the full PM checklist. A short PM is what comes back as a breakdown.":"Review the PM sequence with the branch — the time is going somewhere it should not."}}default:return{short:"—",say:"",ask:""}}}function as(e,s){const a=l=>X(l,e.v[l.key]),n=W.filter(l=>a(l)>=100),r=W.filter(l=>{const M=a(l);return M!=null&&M<85}).sort((l,M)=>a(l)-a(M)),i=W.filter(l=>{const M=a(l);return M!=null&&M>=85&&M<100}),d=e.comply.filter(Boolean).length,o=e.support.filter(Boolean).length,p=(e.trainings||[]).map(l=>[l[0],l[1]||"",l[2]||""]),g=p.map(l=>String(l[0]).toLowerCase()),y=l=>{const M=Ct[l.key];return M==null?null:M.some(re=>g.some(we=>we.includes(re.toLowerCase())))},h=e.v.spare+e.v.labour,$=e.v.sr?h/e.v.sr:0,C=e.present?h/e.present:0,E=Math.max(0,e.workDays-e.present),D=(s||[]).filter(l=>l.bid===e.bid&&l.key!==e.key),_=l=>D.length?D.reduce((M,re)=>M+l(re),0)/D.length:null,L={n:D.length+1,rank:(s||[]).filter(l=>l.bid===e.bid).sort((l,M)=>M.score-l.score).findIndex(l=>l.key===e.key)+1,sr:_(l=>l.v.sr),prod:_(l=>l.v.prod),spareSr:_(l=>l.v.sr?l.v.spare/l.v.sr:0),labSr:_(l=>l.v.sr?l.v.labour/l.v.sr:0)},u={perDay:C,bSpareSr:L.spareSr,bLabSr:L.labSr,cdi:ss(e.v.sr,e.v.cdi)},b=l=>{const M=Ne(l),re=e.v[l.key];return l.key==="sr"?Math.max(0,M-re)*$:l.key==="spare"||l.key==="labour"?Math.max(0,M-re):l.key==="attend"?E*C:null},x=W.filter(l=>{const M=a(l);return M!=null&&M<100}).map(l=>({k:l,pct:a(l),worth:b(l),...rs(l,e,u)})).sort((l,M)=>(M.worth||0)-(l.worth||0)||l.pct-M.pct),w=x.reduce((l,M)=>l+(M.worth||0),0),T=x.find(l=>l.worth)||x[0]||null;let I,q,H;const G=le.length-o;if(G>=3&&e.score<80)I="Branch action first",q="warn",H=`${G} of ${le.length} support items are not issued. Close that before the performance conversation — the commitments assume the kit.`;else if(e.score>=90&&d===be.length)I="Recommend — incentive / promotion review",q="good",H=`${n.length} of ${W.length} commitments kept and every mandatory item in order.`;else if(e.score>=80){const l=d<=be.length-3;I=l?"On track on the numbers — pull up the mandatory list":"On track — confirm",q=l?"warn":"good",H=(r.length?`Solid on the numbers; ${r.length} commitment${r.length>1?"s":""} to close out.`:"Every commitment kept.")+(l?` But only ${d} of ${be.length} mandatory items are in order — the score does not cover uniform, PPE, tool kit or workmanship.`:"")}else e.score>=70?(I="Coach — focused support",q="warn",H=`Short on ${r.slice(0,2).map(l=>ne(l.short)).join(" and ")}. Set a 30-day target on ${r.length>1?"both":"it"}.`):e.score>=60?(I="Formal review",q="bad",H=`${r.length} commitments missed by more than 15%. Review with the branch manager this month.`):(I="Performance improvement plan",q="bad",H=`Score ${e.score.toFixed(1)} with ${r.length} commitments missed. Put a written plan and a review date in place.`);const k=r.map(l=>{const M=y(l);return M===null?{k:l,type:"Discipline",tone:"bad",act:"No training closes this — set the expectation and follow it daily."}:M?{k:l,type:"Application",tone:"warn",act:"Trained already — this is coaching and follow-up on site, not another course."}:{k:l,type:"Skill",tone:"warn",act:"No training on record that covers this — nominate for the next batch."}}),F=k.filter(l=>l.type==="Skill").length,Q=F>=3?`${F} of these have no course on record that covers them. The Training Report is almost entirely product training — worth checking the gap against the training plan before nominating him for anything.`:null;return{met:n,miss:r,near:i,comply:d,support:o,tr:p,stake:x,total:w,focus:T,branch:L,asks:x.slice(0,3).map(l=>l.ask),rev:h,perSR:$,perDay:C,absent:E,verdict:I,tone:q,why:H,actions:k,catalogue:Q,tenure:Vt(e)}}function ns(e,s){const a=x=>s.reduce((w,T)=>w+T[x],0),n=a("sr"),r=a("pres"),i=a("work"),d=a("spare")+a("labour"),o=f.targets.spare+f.targets.labour,p=s.reduce((x,w)=>x+w.days,0)/30.44,g=W.filter(x=>X(x,e.v[x.key])>=100),y=W.filter(x=>{const w=X(x,e.v[x.key]);return w!=null&&w<85}).sort((x,w)=>X(x,e.v[x.key])-X(w,e.v[w.key])),h=W.slice().sort((x,w)=>X(w,e.v[w.key])-X(x,e.v[x.key]))[0],$=he.map(x=>({t:x,n:s.reduce((w,T)=>w+T.srBy[x],0)})).sort((x,w)=>w.n-x.n),C=Pe.map(x=>({c:x,v:s.reduce((w,T)=>w+T.spareBy[x],0)})).sort((x,w)=>w.v-x.v),E=a("cdiP"),D=a("cdiPa"),_=a("cdiD"),L=a("cdiN"),u=he.map(x=>{const w=s.reduce((T,I)=>T+I.srBy[x],0);return{t:x,n:w,c:w?s.reduce((T,I)=>T+I.closeBy[x]*I.srBy[x],0)/w:null}}).filter(x=>x.n>=3&&x.c!=null).sort((x,w)=>x.c-w.c)[0],b=[];return b.push(`Closed <b>${n} SRs</b> over <b>${r} days present</b> — <b>${r?(n/r).toFixed(2):"–"} a day present</b>, against the ${P(f.targets.sr)}-a-month commitment (${(f.targets.sr*p).toFixed(0)} over the ${p<1.02?"month":`${p.toFixed(0)} months`} shown).`),$[0]&&$[0].n&&b.push(`The load is mostly <b>${$[0].t}</b> (${Math.round($[0].n/Math.max(1,n)*100)}% of SRs)`+($[1]&&$[1].n?`, then ${$[1].t} (${Math.round($[1].n/Math.max(1,n)*100)}%)`:"")+"."),b.push(`Revenue <b>₹${(d/1e5).toFixed(2)} L</b> — spare ₹${(a("spare")/1e5).toFixed(2)} L`+(C[0]&&C[0].v?` (mostly ${C[0].c})`:"")+`, labour ₹${(a("labour")/1e5).toFixed(2)} L — against ₹${(o*p/1e5).toFixed(2)} L committed.`),b.push(p>1.2?`Over ${p.toFixed(0)} months: <b>${i} working days</b>, present on <b>${r}</b> (${i?(r/i*100).toFixed(1):"0"}%) — an average of <b>${Math.round(r/p)} of ${Math.round(i/p)}</b> a month.`:`The period holds <b>${i} working days</b> — present on <b>${r}</b>, absent on <b>${i-r}</b> (${i?(r/i*100).toFixed(1):"0"}%).`),b.push(`Customer feedback: <b>${E} promotor · ${D} passive · ${_} detractor</b> out of ${L}.`),u&&u.c<f.targets.closure&&b.push(`Closure is weakest on <b>${u.t}</b> SRs at ${u.c.toFixed(1)}% against the ${f.targets.closure}% timeline.`),b.push(y.length?`Strongest on <b>${ne(h.short)}</b>; short on <b>${y.slice(0,3).map(x=>ne(x.short)).join("</b>, <b>")}</b>.`:`Every commitment kept — strongest on <b>${ne(h.short)}</b>.`),{sr:n,pres:r,work:i,rev:d,revT:o,nMonths:p,met:g,say:b}}const ee=e=>String(e).replace(/[&<>"]/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[s]),ce=660,ft=e=>{if(e<=0)return 1;const s=10**Math.floor(Math.log10(e)),a=e/s;return(a<=1?1:a<=2?2:a<=2.5?2.5:a<=5?5:10)*s},os=(e,s=4)=>Array.from({length:s+1},(a,n)=>e*n/s),is=(e,s,a,n,r)=>{const i=Math.max(0,Math.min(r,a/2,n));return`M${e},${s+n}L${e},${s+i}Q${e},${s} ${e+i},${s}L${e+a-i},${s}Q${e+a},${s} ${e+a},${s+i}L${e+a},${s+n}Z`},ls=(e,s,a,n)=>`M${e},${s}h${a}v${n}h${-a}Z`,ds=e=>e<=8?1:e<=14?2:e<=22?3:Math.ceil(e/8);function vt(e,s,a,n){const r={l:44,r:52,t:12,b:28},i=ce-r.l-r.r,d=e-r.t-r.b,o=h=>r.t+d-h/s*d;let p="";os(s).forEach(h=>{p+=`<line x1="${r.l}" x2="${ce-r.r}" y1="${o(h).toFixed(1)}" y2="${o(h).toFixed(1)}" stroke="var(--viz-grid)" stroke-width="1"/><text x="${r.l-7}" y="${(o(h)+3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--viz-mut)">${n(h)}</text>`}),p+=`<line x1="${r.l}" x2="${ce-r.r}" y1="${r.t+d}" y2="${r.t+d}" stroke="var(--viz-base)" stroke-width="1"/>`;const g=ds(a.length),y=i/a.length;return a.forEach((h,$)=>{$%g||(p+=`<text x="${(r.l+y*($+.5)).toFixed(1)}" y="${e-9}" text-anchor="middle" font-size="10" fill="var(--viz-mut)">${ee(h)}</text>`)}),{pad:r,pw:i,ph:d,y:o,band:y,g:p}}function at(e,s,a={}){const n=a.h||168,r=e.map((y,h)=>s.reduce(($,C)=>$+(C.values[h]||0),0)),i=ft(Math.max(a.target||0,...r)*1.08)||1,d=vt(n,i,e,a.fmtY||(y=>Math.round(y))),o=Math.min(24,Math.max(3,d.band-6));let p="";e.forEach((y,h)=>{let $=0;s.forEach((C,E)=>{const D=C.values[h]||0;if(D<=0){$+=D;return}const _=d.y($+D),L=d.y($),u=E<s.length-1?2:0,b=Math.max(1,L-_-u),x=d.pad.l+d.band*(h+.5)-o/2,w=E===s.length-1;p+=`<path d="${w?is(x,_,o,b,4):ls(x,_+u,o,b)}" fill="${C.color}"><title>${ee(y)} · ${ee(C.name)}: ${ee(a.fmtV?a.fmtV(D):Math.round(D))}</title></path>`,$+=D})});let g="";if(a.target){const y=d.y(a.target);g=`<line x1="${d.pad.l}" x2="${ce-d.pad.r}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--viz-ink)" stroke-width="1" stroke-dasharray="5 3" opacity=".55"/><text x="${ce-d.pad.r}" y="${(y-5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="var(--viz-mut)">${ee(a.targetLabel||"target")}</text>`}return`<svg viewBox="0 0 ${ce} ${n}" role="img" aria-label="${ee(a.aria||"")}">${d.g}${p}${g}</svg>`}function nt(e,s,a={}){const n=a.h||168,r=a.max||ft(Math.max(...s.flatMap(h=>h.values))*1.12)||1,i=vt(n,r,e,a.fmtY||(h=>Math.round(h))),d=h=>i.pad.l+i.band*(h+.5);let o="";if(a.ref!=null){const h=i.y(a.ref);o+=`<line x1="${i.pad.l}" x2="${ce-i.pad.r}" y1="${h.toFixed(1)}" y2="${h.toFixed(1)}" stroke="var(--viz-ink)" stroke-width="1" stroke-dasharray="5 3" opacity=".55"/><text x="${ce-i.pad.r}" y="${(h-5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="var(--viz-mut)">${ee(a.refLabel||"target")}</text>`}s.forEach(h=>{const $=h.values.map((E,D)=>`${D?"L":"M"}${d(D).toFixed(1)},${i.y(E).toFixed(1)}`).join("");o+=`<path d="${$}" fill="none" stroke="${h.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`,h.values.forEach((E,D)=>{o+=`<circle cx="${d(D).toFixed(1)}" cy="${i.y(E).toFixed(1)}" r="7" fill="transparent"><title>${ee(e[D])} · ${ee(h.name)}: ${ee(a.fmtV?a.fmtV(E):E.toFixed(1))}</title></circle>`});const C=h.values.length-1;o+=`<circle cx="${d(C).toFixed(1)}" cy="${i.y(h.values[C]).toFixed(1)}" r="4.5" fill="${h.color}" stroke="var(--viz-surf)" stroke-width="2"/>`});const p=e.length-1,g=s.map(h=>({s:h,y0:i.y(h.values[p]),v:h.values[p]})).sort((h,$)=>h.y0-$.y0);let y=i.pad.t;return g.forEach(h=>{h.y=Math.max(h.y0,y+11),y=h.y}),g.forEach(h=>{const $=d(p)+8;Math.abs(h.y-h.y0)>2&&(o+=`<path d="M${(d(p)+5).toFixed(1)},${h.y0.toFixed(1)}L${$.toFixed(1)},${h.y.toFixed(1)}" stroke="${h.s.color}" stroke-width="1" fill="none" opacity=".7"/>`),o+=`<text x="${($+2).toFixed(1)}" y="${(h.y+3.5).toFixed(1)}" font-size="9.5" fill="var(--viz-ink)" font-weight="600">${ee(a.fmtV?a.fmtV(h.v):h.v.toFixed(1))}</text>`}),`<svg viewBox="0 0 ${ce} ${n}" role="img" aria-label="${ee(a.aria||"")}">${i.g}${o}</svg>`}const ot=(e="pn-go")=>t.jsx("svg",{className:e,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2.4",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:t.jsx("path",{d:"m8.25 4.5 7.5 7.5-7.5 7.5"})}),cs=t.jsx("svg",{className:"tick",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"3",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:t.jsx("path",{d:"m4.5 12.75 6 6 9-13.5"})}),ps=e=>e>=90?"#16a34a":e>=80?"#4ade80":e>=70?"#facc15":e>=60?"#fb923c":"#ef4444",hs=e=>e>=90?"var(--pms-ok-ink)":e>=80?"#3f7a2e":e>=70?"var(--pms-near-ink)":"var(--pms-miss-ink)",ve=e=>({__html:e}),ie=e=>e&&String(e).trim()?String(e).trim():"—",it=({o:e,onClick:s})=>t.jsxs("div",{className:`pn-row ${e.kind}${e.cls||""}${e.open?" open":""}`,onClick:s,children:[t.jsx("span",{className:"pn-rank",children:e.rank}),t.jsxs("span",{className:"pn-name",children:[t.jsx("b",{children:e.name}),t.jsx("span",{children:e.sub})]}),t.jsxs("span",{className:"pn-met",title:"parameters met",children:[e.met,"/",W.length]}),t.jsx("span",{className:"pn-bar",children:t.jsx("i",{style:{width:`${Math.min(100,e.score)}%`,background:ps(e.score)}})}),t.jsxs("span",{className:"pn-score",children:[e.score.toFixed(1),t.jsx("i",{children:"%"})]}),t.jsx("span",{children:t.jsx("span",{className:`gr gr-${e.grade}`,children:e.grade})}),e.kind==="br"?ot(`pn-go tw${e.open?" open":""}`):ot()]}),ms=({label:e,value:s,options:a,onPick:n})=>{const[r,i]=j.useState(!1),d=j.useRef(null);j.useEffect(()=>{if(!r)return;const p=g=>{d.current&&!d.current.contains(g.target)&&i(!1)};return document.addEventListener("mousedown",p),()=>document.removeEventListener("mousedown",p)},[r]);const o=a.find(p=>p.v===s)||a[0];return t.jsxs("div",{ref:d,className:`ms${r?" on-open":""}`,onMouseEnter:()=>i(!0),onMouseLeave:()=>i(!1),children:[t.jsxs("button",{type:"button",className:"btn",onClick:()=>i(p=>!p),children:[e," ",t.jsx("span",{className:"cnt",children:o.label}),t.jsx("svg",{className:"i sm",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.7",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:t.jsx("path",{d:"m19.5 8.25-7.5 7.5-7.5-7.5"})})]}),t.jsx("div",{className:"ms-pop pick",children:t.jsx("div",{className:"ms-list",children:a.map(p=>t.jsxs("div",{className:`pick-item${s===p.v?" on":""}`,onClick:()=>{n(p.v),i(!1)},children:[cs,t.jsxs("span",{className:"lbl",children:[p.label,p.sub&&t.jsx("span",{className:"sub",children:p.sub})]})]},p.v))})})]})},gs=[{v:"day",label:"Day wise",sub:"every day of the period"},{v:"week",label:"Week wise",sub:"calendar weeks, Mon–Sun"},{v:"month",label:"Month wise",sub:"trailing 12 months"},{v:"quarter",label:"Quarterly",sub:"financial quarters, 2 years back"},{v:"year",label:"Yearly",sub:"financial years, 4 years back"}],us=({roster:e,periodFrom:s,periodTo:a})=>{const[n,r]=j.useState(()=>new Set),[i,d]=j.useState(null),[o,p]=j.useState("day"),[g,y]=j.useState(()=>new Set),[h,$]=j.useState(null),[C,E]=j.useState(null),[D,_]=j.useState(0),[L,u]=j.useState(null),b=j.useRef(null),x=j.useRef(null),w=j.useRef(null),T=j.useRef(null),I=j.useRef(null),q=j.useRef(null),{branches:H,ses:G}=j.useMemo(()=>Bt(e||{}),[e]);j.useMemo(()=>(s&&a&&Ot(G,s,a),null),[G,s,a]),f.gran=o;const k=i?G.find(c=>c.key===i):null,F=j.useMemo(()=>k?es(k):[],[k,o,s,a,D]),Q=j.useMemo(()=>k?as(k,G):null,[k,G,s,a,D]),l=j.useMemo(()=>k&&F.length?ns(k,F):null,[k,F]);j.useEffect(()=>{const c=w.current;if(!c)return;let v=c.parentElement;for(;v&&v!==document.body;){const z=window.getComputedStyle(v).overflowY;if(z==="auto"||z==="scroll")break;v=v.parentElement}const m=v&&v!==document.body&&parseFloat(window.getComputedStyle(v).paddingTop)||0;c.style.setProperty("--sep-pin-top",`${-m}px`)},[]);const M=j.useCallback(()=>{const c=T.current,v=I.current,m=q.current;if(!c||!v||!m)return;const z=c.querySelector("table"),J=Math.max(c.scrollWidth,z?Math.ceil(z.getBoundingClientRect().width):0),Y=J>c.clientWidth+1;v.classList.toggle("hide",!Y),m.style.width=Y?`${J}px`:"100%",v.scrollLeft=c.scrollLeft},[]);j.useEffect(()=>{M();const c=requestAnimationFrame(M);window.addEventListener("resize",M);const v=T.current,m=v&&v.querySelector("table"),z=m&&typeof ResizeObserver<"u"?new ResizeObserver(M):null;return z&&m&&z.observe(m),()=>{cancelAnimationFrame(c),window.removeEventListener("resize",M),z&&z.disconnect()}},[M,k,o,g,F]),j.useEffect(()=>{k&&b.current&&b.current.scrollIntoView({behavior:"smooth",block:"start"})},[i]),j.useEffect(()=>{C&&x.current&&x.current.scrollIntoView({behavior:"smooth",block:"center"})},[C]),j.useEffect(()=>{E(null)},[i]);const re=c=>r(v=>{const m=new Set(v);return m.has(c)?m.delete(c):m.add(c),m}),we=c=>y(v=>{const m=new Set(v);return m.has(c)?m.delete(c):m.add(c),m}),Ae=()=>_(c=>c+1);j.useEffect(()=>{if(!L)return;document.body.classList.add("sep-printing");const c=setTimeout(()=>{window.print(),document.body.classList.remove("sep-printing"),u(null)},80);return()=>{clearTimeout(c),document.body.classList.remove("sep-printing")}},[L]);const S=c=>u(c),N=()=>{if(!k)return;const c={head:"#cbe1f5",headInk:"#12224a",metric:"#eaf4fd",tot:"#dcebf9",kid:"#f5faff",zebra:"#f7fbff",line:"#9fc0df",ink:"#111827",mut:"#6b7280"},v=`border:1px solid ${c.line};font-family:Calibri,Arial;font-size:10pt;`,m=`${v}text-align:right;`,z=`${v}background:${c.head};color:${c.headInk};font-weight:bold;text-align:center;`,J=`${v}background:${c.metric};color:${c.ink};font-weight:bold;`,Y=`${v}background:${c.kid};color:${c.mut};`,B=`${v}background:${c.tot};color:${c.ink};font-weight:bold;text-align:right;`,te=`font-family:Calibri,Arial;font-size:10pt;color:${c.mut};border:0;`,ze=`font-family:Calibri,Arial;font-size:10pt;color:${c.ink};font-weight:bold;border:0;`,Fe=A=>String(A).replace(/<[^>]*>/g,"").replace(/–|&ndash;/g,"-").trim(),Ie=A=>A%2?`background:${c.zebra};`:"",wt=`${v}text-align:center;`,U=(A,Z)=>`<td style="${Z}">${A===""||A==null?"&nbsp;":A}</td>`,fe=(A,Z)=>`<tr>${U(A,te)}${U(Z,ze)}</tr>`,jt=W.filter(A=>X(A,k.v[A.key])>=100).length;let Ce='<table cellspacing="0" cellpadding="4">'+fe("Engineer",k.name)+fe("Branch",`${k.branch} (${k.bid}) &middot; ${k.region}`)+fe("SE UID",ie(k.uid))+fe("Employee code",ie(k.code))+fe("Period",`${xe(f.from)} &ndash; ${xe(f.to)} &middot; ${o} wise`)+fe("Score",`${k.score.toFixed(1)} ${k.grade} &middot; ${jt} of ${W.length} parameters met`)+`<tr><td style="border:0;height:8pt;"></td></tr><tr>${U("Metric",`${z}text-align:left;`)}${U("Unit",z)}`+F.map(A=>U(A.label+(A.sub?`<br>${A.sub}`:""),z)).join("")+U("Period",z)+"</tr>",De=0;rt.forEach(A=>{Ce+=`<tr>${U(A.lab,`${J}${Ie(De)}`)}`+U(A.u,`${J}${Ie(De)}font-weight:normal;color:${c.mut};text-align:center;`)+F.map(Z=>{const Ye=A.cell?A.cell(Z):(()=>{const me=A.val(Z);return me==null||me===0?"-":ge(A.f(me))})();return U(Fe(Ye)||"-",(A.mid?wt:m)+Ie(De))}).join("")+U(Fe(ge(A.tot(F)))||"-",B)+"</tr>",De+=1,A.kids&&A.kids().forEach(Z=>{Ce+=`<tr>${U(`&nbsp;&nbsp;&nbsp;${Z.lab}`,Y)}${U(Z.u,`${Y}text-align:center;`)}`+F.map(Ye=>{const me=Z.val(Ye);return U(me==null||me===0?"-":Fe(ge(Z.f(me))),`${Y}${Z.mid?"text-align:center;":"text-align:right;"}`)}).join("")+U(Fe(ge(Z.tot(F)))||"-",B)+"</tr>"})}),Ce+="</table>";const $t=`<html><head><meta charset="utf-8"></head><body>${Ce}</body></html>`,Oe=document.createElement("a");Oe.href=URL.createObjectURL(new Blob([`\uFEFF${$t}`],{type:"application/vnd.ms-excel"})),Oe.download=`${k.name.replace(/[^A-Za-z0-9]+/g,"-")}_${o}-wise_${f.from}_${f.to}.xls`,Oe.click()},O=(c,v,m=F)=>m.map((z,J)=>{const Y=c.cell?c.cell(z):(()=>{const te=c.val(z);return te==null||te===0?"–":ge(c.f(te))})(),B=String(Y).replace(/<[^>]*>/g,"");return t.jsx("td",{className:`${z.off?"off ":""}${v?"k ":""}${c.mid?"mid":""}`,title:`${z.label}${z.sub?` ${z.sub}`:""} · ${c.lab}: ${B} ${c.u}`,dangerouslySetInnerHTML:ve(String(Y))},J)}),yt={day:"Day",week:"Week",month:"Month",quarter:"Quarter",year:"Year"}[o],Qe=(c,v)=>t.jsxs("table",{className:"dt-t",children:[t.jsx("thead",{children:t.jsxs("tr",{children:[t.jsxs("th",{className:"m",children:[yt," →"]}),c.map((m,z)=>t.jsxs("th",{className:`${m.off?"off":""}${m.cur?" cur":""}`,children:[t.jsx("b",{children:m.label}),m.sub&&t.jsx("span",{children:m.sub})]},z)),v&&t.jsxs("th",{className:"tot",children:["Period",t.jsx("span",{children:"total / avg"})]})]})}),t.jsx("tbody",{children:rt.map(m=>{const z=m.kids?m.kids():null,J=z&&g.has(m.id);return t.jsxs(Xe.Fragment,{children:[t.jsxs("tr",{className:`par${z?" has":""}`,children:[t.jsx("th",{className:"m",onClick:z?()=>we(m.id):void 0,children:t.jsxs("span",{className:"mw",children:[z?t.jsx("svg",{className:`dtc${J?" open":""}`,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2.6",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:t.jsx("path",{d:"m8.25 4.5 7.5 7.5-7.5 7.5"})}):t.jsx("i",{className:"dtc-gap"}),t.jsxs("span",{className:"ml",children:[m.lab,t.jsx("em",{children:m.u})]})]})}),O(m,!1,c),v&&t.jsx("td",{className:`tot${m.mid?" mid":""}`,children:ge(m.tot(F))})]}),J&&z.map((Y,B)=>t.jsxs("tr",{className:"kid",children:[t.jsx("th",{className:"m",children:t.jsxs("span",{className:"mw",children:[t.jsx("i",{className:"dtc-gap"}),t.jsxs("span",{className:"ml",children:[Y.lab,Y.u!==m.u&&t.jsx("em",{children:Y.u})]})]})}),O(Y,!0,c),v&&t.jsx("td",{className:`tot${Y.mid?" mid":""}`,children:ge(Y.tot(F))})]},B))]},m.id)})})]}),Te=15,je=j.useMemo(()=>{if(F.length<=Te)return[F];const c=[];for(let v=0;v<F.length;v+=Te)c.push(F.slice(v,v+Te));return c},[F]),Re=n.size>0,kt=["MH","KA"].map(c=>{const v=H.filter(m=>m.region===c).map(m=>({b:m,mem:G.filter(z=>z.bid===m.id)})).filter(m=>m.mem.length).map(m=>({...m,r:Yt(m.mem)})).sort((m,z)=>tt(m.b.id)-tt(z.b.id));return t.jsxs("div",{children:[t.jsxs("div",{className:"ex-h",children:[Dt[c]||c,t.jsxs("span",{children:[v.length," branch",v.length===1?"":"es"," · ",v.reduce((m,z)=>m+z.mem.length,0)," engineers"]})]}),v.length?v.map((m,z)=>{const J=n.has(m.b.id),Y=m.mem.slice().sort((B,te)=>te.score-B.score);return t.jsxs(Xe.Fragment,{children:[t.jsx(it,{onClick:()=>re(m.b.id),o:{key:m.b.id,kind:"br",open:J,rank:z+1,name:m.b.name,sub:`${m.b.id} · ${m.mem.length} engineer${m.mem.length>1?"s":""}`,met:W.filter(B=>X(B,m.r.v[B.key])>=100).length,score:m.r.score,grade:m.r.grade}}),J&&t.jsx("div",{className:"ex-kids",children:Y.map((B,te)=>t.jsx(it,{onClick:()=>d(B.key),o:{key:B.key,kind:"se",rank:te+1,name:B.name,sub:`UID ${ie(B.uid)} · code ${ie(B.code)}`,met:W.filter(ze=>X(ze,B.v[ze.key])>=100).length,score:B.score,grade:B.grade,cls:(i===B.key?" on":"")+(Y.length>4?te===0?" top1":te===Y.length-1?" bot1":"":"")}},B.key))})]},m.b.id)}):t.jsx("div",{className:"pn-empty",children:"No branch in this region yet."})]},c)}),Me=F.map(c=>c.label),Be=c=>f.targets[c]*(F.reduce((v,m)=>v+m.days,0)/(F.length||1))/30.44,Je=f.to?Number(f.to.slice(0,4))-(Number(f.to.slice(5,7))>=4?0:1):0,Ze=o==="day"||o==="week"?`${xe(f.from)} – ${xe(f.to)} · ${F.length} ${o==="day"?"days":"weeks"}`:o==="quarter"?`FY ${String(Je).slice(2)}–${String(Je+1).slice(2)} · all four quarters`:`${F.length} ${{month:"months",year:"financial years"}[o]} to ${xe(f.to)}`;return t.jsxs("div",{className:"sep",ref:w,children:[t.jsx("style",{children:Ft}),t.jsxs("section",{className:"panel sep-hide-print",children:[t.jsxs("div",{className:"pn-head",children:[t.jsxs("h3",{children:["Performance explorer ",t.jsx("span",{className:"sm",children:Re?"click an engineer for the full report":"click a branch to unfold its service engineers"})]}),t.jsx("nav",{className:"crumbs",children:t.jsx("button",{type:"button",className:"ex-back",onClick:()=>r(Re?new Set:new Set(H.filter(c=>G.some(v=>v.bid===c.id)).map(c=>c.id))),children:Re?"Collapse all":"Expand all branches"})})]}),t.jsx("div",{className:"ex-cols",children:kt})]}),t.jsx("section",{className:`detail${L==="detail"?" sep-print-area":""}`,ref:b,children:k?t.jsxs(t.Fragment,{children:[t.jsxs("div",{className:"dt-pin",children:[t.jsxs("div",{className:"dt-top",children:[t.jsxs("div",{className:"dt-id",children:[t.jsx("h3",{children:k.name}),t.jsxs("p",{children:[k.branch," · SE UID ",t.jsx("b",{children:ie(k.uid)})," · Employee Code ",t.jsx("b",{children:ie(k.code)})," · ",k.region]})]}),t.jsxs("div",{className:"dt-kpis",children:[t.jsxs("div",{className:"dt-k",children:[t.jsx("div",{className:"l",children:"Score"}),t.jsxs("div",{className:"v",children:[k.score.toFixed(1),t.jsx("i",{children:"%"})]})]}),t.jsxs("div",{className:"dt-k",children:[t.jsx("div",{className:"l",children:"Grade"}),t.jsx("div",{className:"v",children:k.grade})]}),t.jsxs("div",{className:"dt-k",children:[t.jsx("div",{className:"l",children:"Parameter met"}),t.jsxs("div",{className:"v",children:[Q.met.length,"/",W.length]})]}),t.jsxs("div",{className:"dt-k",children:[t.jsx("div",{className:"l",children:"Productivity"}),t.jsx("div",{className:"v",children:Ee(k.v.prod)})]})]})]}),t.jsxs("div",{className:"dt-bar sep-hide-print",children:[t.jsx(ms,{label:"View:",value:o,options:gs,onPick:p}),t.jsx("span",{className:"dt-scope",children:Ze}),t.jsxs("div",{className:"dt-acts",children:[t.jsx("button",{type:"button",className:"btn",onClick:()=>S("detail"),children:"Print"}),t.jsx("button",{type:"button",className:"btn",onClick:N,children:"Export"}),t.jsx("button",{type:"button",className:"btn",onClick:()=>$("matrix"),children:"Signed matrix"}),t.jsx("button",{type:"button",className:`btn${C==="assets"?" on":""}`,onClick:()=>E(C==="assets"?null:"assets"),children:"Employee assets"}),t.jsx("button",{type:"button",className:`btn${C==="training"?" on":""}`,onClick:()=>E(C==="training"?null:"training"),children:"Training & Skill"}),t.jsx("button",{type:"button",className:"btn",onClick:()=>d(null),children:"Close"})]})]})]}),t.jsxs("div",{className:"dt-body",children:[t.jsxs("div",{className:`dt-frame${L==="detail"&&je.length>1?" dt-frame-off":""}`,children:[t.jsx("div",{className:"dt-topbar",ref:I,onScroll:()=>{T.current&&I.current&&(T.current.scrollLeft=I.current.scrollLeft)},children:t.jsx("div",{ref:q})}),t.jsx("div",{className:"dt-tblbox",ref:T,onScroll:()=>{T.current&&I.current&&(I.current.scrollLeft=T.current.scrollLeft)},children:Qe(F,!0)})]}),L==="detail"&&je.length>1&&t.jsx("div",{className:"dt-print-only",children:je.map((c,v)=>t.jsxs("div",{className:"dt-chunk",children:[t.jsxs("div",{className:"dt-chunk-h",children:[{day:"Days",week:"Weeks",month:"Months",quarter:"Quarters",year:"Years"}[o]," ",c[0].label,c.length>1?` – ${c[c.length-1].label}`:"",t.jsxs("span",{children:["block ",v+1," of ",je.length]})]}),Qe(c,v===je.length-1)]},v))}),C&&t.jsxs("section",{className:"inl",ref:x,children:[t.jsxs("div",{className:"inl-top",children:[t.jsxs("div",{children:[t.jsx("h4",{children:C==="assets"?"Employee assets":"Training & Skill"}),t.jsxs("div",{className:"s2",children:[k.name," · ",k.branch," · SE UID ",ie(k.uid)]})]}),t.jsxs("div",{className:"inl-acts",children:[t.jsx("button",{type:"button",className:"btn on",onClick:()=>E(null),children:"Save"}),t.jsx("button",{type:"button",className:"btn",onClick:()=>E(null),children:"Close"})]})]}),t.jsx("div",{className:"inl-body",children:C==="assets"?t.jsx(bs,{se:k,redraw:Ae}):t.jsx(fs,{se:k,R:Q})})]}),l&&t.jsxs("section",{className:"sm-box",children:[t.jsxs("h4",{children:["Summary ",t.jsxs("span",{children:[ut(k.name)," · ",o==="day"||o==="week"?"the selected period":Ze]})]}),t.jsxs("div",{className:"sm-tiles",children:[t.jsxs("div",{className:"sm-t",children:[t.jsx("span",{className:"l",children:"Parameter met"}),t.jsxs("span",{className:"v",children:[l.met.length," / ",W.length]}),t.jsxs("span",{className:"h",children:["score ",k.score.toFixed(1)," · grade ",k.grade]})]}),t.jsxs("div",{className:"sm-t",children:[t.jsx("span",{className:"l",children:"SR closed"}),t.jsx("span",{className:"v",children:P(l.sr)}),t.jsxs("span",{className:"h",children:[l.pres?(l.sr/l.pres).toFixed(2):"–"," per day present"]})]}),t.jsxs("div",{className:"sm-t",children:[t.jsx("span",{className:"l",children:"Revenue"}),t.jsxs("span",{className:"v",style:{color:l.rev>=l.revT*l.nMonths?"var(--pms-ok-ink)":"var(--pms-miss-ink)"},children:["₹",(l.rev/1e5).toFixed(2)," L"]}),t.jsxs("span",{className:"h",children:["committed ₹",(l.revT*l.nMonths/1e5).toFixed(2)," L"]})]}),t.jsxs("div",{className:"sm-t",children:[t.jsx("span",{className:"l",children:"Present"}),t.jsx("span",{className:"v",style:{color:l.work&&l.pres/l.work*100>=f.targets.attend?"var(--pms-ok-ink)":"var(--pms-miss-ink)"},children:l.nMonths>1.2?`${Math.round(l.pres/l.nMonths)} / ${Math.round(l.work/l.nMonths)}`:`${l.pres} / ${l.work}`}),t.jsx("span",{className:"h",children:l.nMonths>1.2?`avg a month over ${l.nMonths.toFixed(0)} · ${l.work?(l.pres/l.work*100).toFixed(1):"0"}%`:`of ${l.work} working days · ${l.work?(l.pres/l.work*100).toFixed(1):"0"}%`})]})]}),t.jsx("ul",{className:"sm-say",children:l.say.map((c,v)=>t.jsx("li",{dangerouslySetInnerHTML:ve(c)},v))})]}),t.jsxs("div",{className:"dt-charts",children:[t.jsxs("figure",{className:"ch",children:[t.jsxs("figcaption",{children:[t.jsx("span",{className:"ch-t",children:"SR closed"}),t.jsxs("span",{className:"ch-s",children:["against the ",P(f.targets.sr),"-a-month commitment"]})]}),t.jsx("div",{dangerouslySetInnerHTML:ve(at(Me,[{name:"SR closed",color:"var(--viz-1)",values:F.map(c=>c.sr)}],{target:Be("sr"),targetLabel:"commitment",aria:`SR closed per ${o}`}))})]}),t.jsxs("figure",{className:"ch",children:[t.jsxs("figcaption",{children:[t.jsx("span",{className:"ch-t",children:"Revenue"}),t.jsx("span",{className:"ch-s",children:"₹ lakh"}),t.jsxs("span",{className:"ch-lg",children:[t.jsxs("span",{children:[t.jsx("i",{style:{background:"var(--viz-1)"}}),"Spare parts"]}),t.jsxs("span",{children:[t.jsx("i",{style:{background:"var(--viz-2)"}}),"Labour"]})]})]}),t.jsx("div",{dangerouslySetInnerHTML:ve(at(Me,[{name:"Spare parts",color:"var(--viz-1)",values:F.map(c=>c.spare/1e5)},{name:"Labour",color:"var(--viz-2)",values:F.map(c=>c.labour/1e5)}],{target:(Be("spare")+Be("labour"))/1e5,targetLabel:"combined commitment",fmtY:c=>c.toFixed(1),fmtV:c=>`₹${c.toFixed(2)} L`,aria:"Spare and labour revenue"}))})]}),t.jsxs("figure",{className:"ch",children:[t.jsxs("figcaption",{children:[t.jsx("span",{className:"ch-t",children:"Productivity"}),t.jsx("span",{className:"ch-s",children:"SR closed per day present"})]}),t.jsx("div",{dangerouslySetInnerHTML:ve(nt(Me,[{name:"SR / day present",color:"var(--viz-1)",values:F.map(c=>c.pres?c.sr/c.pres:0)}],{ref:k.v.prod,refLabel:"period average",fmtY:c=>c.toFixed(1),fmtV:c=>c.toFixed(2),aria:"Productivity trend"}))})]}),t.jsxs("figure",{className:"ch",children:[t.jsxs("figcaption",{children:[t.jsx("span",{className:"ch-t",children:"Quality & discipline"}),t.jsx("span",{className:"ch-s",children:"per cent"}),t.jsxs("span",{className:"ch-lg",children:[t.jsxs("span",{children:[t.jsx("i",{style:{background:"var(--viz-1)"}}),"SR closure"]}),t.jsxs("span",{children:[t.jsx("i",{style:{background:"var(--viz-2)"}}),"Attendance"]}),t.jsxs("span",{children:[t.jsx("i",{style:{background:"var(--viz-3)"}}),"1st site before 10"]})]})]}),t.jsx("div",{dangerouslySetInnerHTML:ve(nt(Me,[{name:"SR closure",color:"var(--viz-1)",values:F.map(c=>c.closure)},{name:"Attendance",color:"var(--viz-2)",values:F.map(c=>c.attend)},{name:"1st site before 10",color:"var(--viz-3)",values:F.map(c=>c.first)}],{max:100,ref:95,refLabel:"95%",fmtV:c=>`${c.toFixed(1)}%`,aria:"Quality and discipline trend"}))})]})]})]})]}):t.jsxs("div",{className:"dt-empty",children:[t.jsx("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.4",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:t.jsx("path",{d:"M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"})}),t.jsx("b",{children:"Pick a service engineer"}),t.jsx("span",{children:"Choose one in the explorer above — their day, week and month report opens here, with the charts of how the period actually ran."})]})}),k&&h==="matrix"&&t.jsx("div",{className:"mask open",onClick:c=>{c.target===c.currentTarget&&$(null)},children:t.jsx("div",{className:`sheet${L==="sheet"?" sep-print-area":""}`,children:t.jsx(xs,{se:k,R:Q,onPrint:()=>S("sheet"),onClose:()=>$(null)})})})]})},xs=({se:e,R:s,onPrint:a,onClose:n})=>{const r=o=>X(o,e.v[o.key]),i=o=>s.actions.find(p=>p.k.key===o.key)||{type:"Close out",tone:"good"},d=s.branch;return t.jsxs(t.Fragment,{children:[t.jsxs("div",{className:"sh-pin",children:[t.jsxs("div",{className:"sh-top",children:[t.jsxs("div",{children:[t.jsx("h2",{children:"Service Engineer Performance Commitment & Accountability Matrix"}),t.jsxs("div",{className:"s2",children:["Annexure – I · KALA Care Global Services LLP · period ",xe(f.from)," – ",xe(f.to)]})]}),t.jsxs("div",{style:{display:"flex",gap:7},className:"sep-hide-print",children:[t.jsx("button",{type:"button",className:"sh-x",onClick:a,children:"Print"}),t.jsx("button",{type:"button",className:"sh-x",onClick:n,children:"Close"})]})]}),t.jsxs("div",{className:"sh-id",children:[t.jsxs("div",{className:"f",children:[t.jsx("div",{className:"l",children:"Employee Name"}),t.jsx("div",{className:"v",title:e.name,children:e.name})]}),t.jsxs("div",{className:"f",children:[t.jsx("div",{className:"l",children:"Employee Code"}),t.jsx("div",{className:"v",children:ie(e.code)})]}),t.jsxs("div",{className:"f",children:[t.jsx("div",{className:"l",children:"Branch / Outlet"}),t.jsx("div",{className:"v",children:e.branch})]}),t.jsxs("div",{className:"f",children:[t.jsx("div",{className:"l",children:"SE UID · Region"}),t.jsxs("div",{className:"v",children:[ie(e.uid)," · ",e.region]})]}),t.jsxs("div",{className:"f",children:[t.jsx("div",{className:"l",children:"With KCGL"}),t.jsxs("div",{className:"v",children:[s.tenure?s.tenure.label:"—",t.jsx("span",{className:"vs",children:s.tenure?`since ${He(s.tenure.from)}`:""})]})]}),t.jsxs("div",{className:"f",children:[t.jsx("div",{className:"l",children:"Trainings on record"}),t.jsxs("div",{className:"v",children:[s.tr.length,t.jsx("span",{className:"vs",children:s.tr.length?`last ${He(s.tr[0][2])}`:"none"})]})]})]}),t.jsxs("div",{className:`sh-verdict v-${s.tone}`,children:[t.jsxs("div",{className:"sc",children:[t.jsx("div",{className:"l",children:"Commitment score"}),t.jsxs("div",{className:"big",style:{color:hs(e.score)},children:[e.score.toFixed(1),t.jsx("span",{children:"%"})]}),t.jsx("span",{className:`gr gr-${e.grade}`,children:e.grade})]}),t.jsxs("div",{className:"vd",children:[t.jsx("div",{className:"l",children:"Recommendation"}),t.jsx("div",{className:"h",children:s.verdict}),t.jsx("div",{className:"w",children:s.why})]}),t.jsxs("div",{className:"vm",children:[t.jsxs("div",{children:[t.jsx("b",{children:s.met.length})," of ",W.length," parameters met"]}),t.jsxs("div",{children:[t.jsx("b",{children:s.comply})," of ",be.length," mandatory items in order"]}),t.jsxs("div",{children:[t.jsx("b",{children:s.support})," of ",le.length," support items issued"]}),t.jsxs("div",{children:[t.jsxs("b",{children:[e.present," P · ",s.absent," A"]})," of ",e.workDays," working days"]})]})]})]}),t.jsxs("div",{className:"sh-body",children:[t.jsxs("div",{className:"sh-h",children:["Minimum Monthly Performance Commitments ",t.jsx("span",{children:"actuals for the selected period"})]}),t.jsxs("table",{className:"sh-t",children:[t.jsxs("colgroup",{children:[t.jsx("col",{className:"w-n"}),t.jsx("col",{className:"w-k"}),t.jsx("col",{className:"w-c"}),t.jsx("col",{className:"w-a"}),t.jsx("col",{className:"w-p"}),t.jsx("col",{className:"w-s"})]}),t.jsx("thead",{children:t.jsxs("tr",{children:[t.jsx("th",{children:"Sr."}),t.jsx("th",{style:{textAlign:"left"},children:"KPI"}),t.jsx("th",{children:"Target"}),t.jsx("th",{children:"Actual"}),t.jsx("th",{children:"Ach. %"}),t.jsx("th",{children:"Status"})]})}),t.jsx("tbody",{children:W.slice().sort((o,p)=>o.no-p.no).map(o=>{const p=e.v[o.key],g=r(o),y=Lt(g);return t.jsxs("tr",{children:[t.jsx("td",{className:"n",children:o.no}),t.jsxs("td",{className:"k",children:[t.jsx("div",{children:ne(o.name)}),o.hint&&t.jsx("div",{className:"sub2",children:ne(o.hint)})]}),t.jsxs("td",{className:"c",children:[t.jsx("b",{children:Wt(o)}),t.jsxs("div",{className:"sub2",children:[o.commit,o.perMonth&&f.months>1.02?` · ×${f.months.toFixed(f.months%1?1:0)} months`:""]})]}),t.jsxs("td",{className:"a",children:[gt(o,p).replace(/%|₹/g,""),o.key==="first"&&t.jsxs("div",{className:"sub2",children:["avg ",e.firstAvg]}),o.key==="attend"&&t.jsxs("div",{className:"sub2",children:[e.present," P · ",s.absent," A of ",e.workDays]})]}),t.jsx("td",{className:"p",children:g==null?"–":Math.round(g)}),t.jsx("td",{className:`s sh-${y}`,children:y==="ok"?"MET":y==="near"?"NEAR":"MISSED"})]},o.key)})})]}),t.jsxs("div",{className:"sh-h",children:["What the shortfall is worth — and what to say",t.jsx("span",{children:"priced at his own rates · read it out as it stands"})]}),t.jsxs("div",{className:"sh-lede",children:[t.jsx("div",{className:"ld-n",children:s.total?`₹${P(s.total)}`:s.stake.length||"✓"}),t.jsxs("div",{className:"ld-t",children:[s.total?`at stake this period${s.rev?` — ${Math.round(s.total/s.rev*100)}% of the ₹${P(s.rev)} he did bill`:""}.`:s.stake.length?`commitment${s.stake.length===1?"":"s"} short. None of them bills a rupee directly — they are the habits that decide whether next month does.`:"Every commitment kept."," ","He earns ",t.jsxs("b",{children:["₹",P(s.perSR)]})," a job and ",t.jsxs("b",{children:["₹",P(s.perDay)]})," a day present.",s.focus&&t.jsxs(t.Fragment,{children:[" ",t.jsxs("b",{children:["Start with ",ne(s.focus.k.short)]}),s.focus.worth?` — worth ₹${P(s.focus.worth)} on its own`:"","."]})]})]}),t.jsx("div",{className:"gaps",children:s.stake.length?s.stake.map(o=>{const p=i(o.k);return t.jsxs("div",{className:"gap",children:[t.jsxs("div",{className:"gh",children:[t.jsx("span",{className:"gn",children:o.k.no}),t.jsx("span",{className:"gt",title:`${ne(o.k.name)} — ${ne(o.k.commit)}`,children:ne(o.k.name)}),t.jsx("span",{className:`tag t-${p.tone}`,children:p.type}),t.jsx("span",{className:"gs",children:o.short}),t.jsx("span",{className:"gw",children:o.worth?`₹${P(o.worth)}`:"—"})]}),t.jsx("div",{className:"gb",children:o.say}),t.jsxs("div",{className:"ga",children:[t.jsx("b",{children:"Ask:"})," ",o.ask]})]},o.k.key)}):t.jsx("div",{className:"sh-none",children:"Every commitment kept — nothing to raise."})}),s.asks.length>0&&t.jsxs("div",{className:"sh-ask",children:[t.jsx("b",{children:"The 30-day ask."})," ",s.asks.join(" ")]}),d.n>1&&t.jsxs("div",{className:"sh-note",children:[t.jsx("b",{children:"Against his own branch."})," ",ut(e.name)," ranks ",t.jsxs("b",{children:[d.rank," of ",d.n]})," in ",e.branch,". He closes ",t.jsx("b",{children:P(e.v.sr)})," SRs where the other ",d.n-1," average ",t.jsx("b",{children:P(d.sr)}),"; attaches ",t.jsxs("b",{children:["₹",P(e.v.sr?e.v.spare/e.v.sr:0)]})," of parts a job against ",t.jsxs("b",{children:["₹",P(d.spareSr)]}),"; productivity ",t.jsx("b",{children:e.v.prod.toFixed(2)})," against ",t.jsx("b",{children:d.prod.toFixed(2)})," SR a day present."]}),s.catalogue&&t.jsx("div",{className:"sh-note",children:s.catalogue})]})]})},bs=({se:e,redraw:s})=>{const a=e.support.filter(Boolean).length,n=le.filter((r,i)=>!e.support[i]).map(r=>r[0]);return t.jsxs(t.Fragment,{children:[t.jsxs("div",{className:"inl-h",children:["Issued to the engineer ",t.jsxs("span",{children:[a," of ",le.length," issued"]})]}),t.jsx("div",{className:"inl-set",children:"An engineer who has not been kitted out is not a performance case — this list is what the commitments assume."}),t.jsx("div",{className:"chk big two",children:le.map((r,i)=>t.jsxs("label",{title:r[1],children:[t.jsx("input",{type:"checkbox",checked:e.support[i],onChange:d=>{e.support[i]=d.target.checked,s()}}),t.jsx("span",{children:r[1]})]},i))}),t.jsx("div",{className:"inl-note",children:a===le.length?"Fully issued — every commitment on the matrix is fair to hold him to.":t.jsxs(t.Fragment,{children:[t.jsxs("b",{children:[le.length-a," not issued."]})," ",n.join(", "),". Close these before the performance conversation."]})}),t.jsxs("div",{className:"inl-h",children:["Mandatory compliance ",t.jsxs("span",{children:[e.comply.filter(Boolean).length," of ",be.length," in order"]})]}),t.jsx("div",{className:"inl-set",children:"Tick each item the engineer has kept. Nothing counts these either — no file knows whether a man wore his PPE."}),t.jsx("div",{className:"chk big two",children:be.map((r,i)=>t.jsxs("label",{title:r,children:[t.jsx("input",{type:"checkbox",checked:e.comply[i],onChange:d=>{e.comply[i]=d.target.checked,s()}}),t.jsx("span",{children:r})]},i))})]})},fs=({se:e,R:s})=>t.jsxs(t.Fragment,{children:[t.jsxs("div",{className:"inl-h",children:["Skills on record",t.jsxs("span",{children:[s.tr.length," training",s.tr.length===1?"":"s"," done · from the Training Report"]})]}),s.tr.length?t.jsx("div",{className:"skills",children:s.tr.map((a,n)=>t.jsxs("span",{className:"skill",title:a[1]?`${a[0]} — ${a[1]}`:a[0],children:[t.jsx("b",{children:a[0]}),a[2]?t.jsx("em",{children:He(a[2])}):null]},n))}):t.jsxs("div",{className:"inl-none",children:["No training on record for ",e.name," in the Training Report."]})]}),vs="/api",ue="#2f3192",ys="#23255f",ks=()=>{const e=JSON.parse(sessionStorage.getItem("user")||"{}");return{"user-id":String(e.user_id||""),"user-role":e.role||""}},K=e=>`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,"0")}-${String(e.getDate()).padStart(2,"0")}`,lt=e=>e?new Date(`${e}T00:00:00`).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"2-digit"}):"",Fs=()=>{const[e,s]=j.useState(null),[a,n]=j.useState(!0),[r,i]=j.useState(""),d=new Date,o=new Date(d.getFullYear(),d.getMonth()-1,1),p=new Date(d.getFullYear(),d.getMonth(),0),[g,y]=j.useState(K(o)),[h,$]=j.useState(K(p)),[C,E]=j.useState(!1),[D,_]=j.useState("last_month"),[L,u]=j.useState(o),[b,x]=j.useState(p),w=(()=>{const S=new Date;return S.getMonth()+1>=4?S.getFullYear():S.getFullYear()-1})(),[T,I]=j.useState(w),[q,H]=j.useState(!1),G=[];for(let S=w-5;S<=w+10;S++)G.push(S);const k=j.useCallback(async(S=!1)=>{n(!0),i("");try{const N=await fetch(`${vs}/pms/report/se-performance`,{headers:ks()}),O=await N.json();if(!N.ok||!O.success)throw new Error(O.message||O.detail||"Failed to load");s(O),S||Nt.success("SE Performance loaded")}catch(N){i(N.message)}finally{n(!1)}},[]);j.useEffect(()=>{k(!0)},[k]);const F=[{key:"fy",label:"Financial Year"},{key:"current_month",label:"Current Month"},{key:"last_month",label:"Last Month"},{key:"last_quarter",label:"Last Quarter"},{key:"last_6m",label:"Last 6 Months"},{key:"last_year",label:"Last 12 Months"}],Q=(S,N,O)=>{y(S),$(N),u(new Date(`${S}T00:00:00`)),x(new Date(`${N}T00:00:00`)),_(O),E(!1)},l=S=>{const N=new Date;if(S==="current_month")Q(K(new Date(N.getFullYear(),N.getMonth(),1)),K(new Date(N.getFullYear(),N.getMonth()+1,0)),S);else if(S==="last_month")Q(K(new Date(N.getFullYear(),N.getMonth()-1,1)),K(new Date(N.getFullYear(),N.getMonth(),0)),S);else if(S==="last_quarter"){const O=Math.floor(N.getMonth()/3)*3;Q(K(new Date(N.getFullYear(),O-3,1)),K(new Date(N.getFullYear(),O,0)),S)}else S==="last_6m"?Q(K(new Date(N.getFullYear(),N.getMonth()-6,1)),K(new Date(N.getFullYear(),N.getMonth(),0)),S):S==="last_year"&&Q(K(new Date(N.getFullYear(),N.getMonth()-12,1)),K(new Date(N.getFullYear(),N.getMonth(),0)),S)},M=S=>{I(S),Q(`${S}-04-01`,`${S+1}-03-31`,"fy")},re=()=>{!L||!b||Q(K(L),K(b),"custom")},we=e?.engineers?.length||0,Ae=e?.branches?.length||0;return t.jsx("div",{className:"min-h-screen font-sans",children:t.jsxs("div",{className:"max-w-[1500px] mx-auto px-3 sm:px-5 pb-2 max-md:px-2",children:[t.jsxs("div",{className:"rounded-2xl px-3 sm:px-5 py-3 mb-3 text-white relative sep-hide-print",style:{background:`linear-gradient(120deg, ${ue} 0%, ${ys} 100%)`},children:[t.jsxs("div",{className:"absolute inset-0 overflow-hidden rounded-2xl pointer-events-none",children:[t.jsx("div",{className:"absolute -right-8 -top-10 h-32 w-32 rounded-full",style:{background:"rgba(255,255,255,0.07)"}}),t.jsx("div",{className:"absolute right-16 -bottom-12 h-24 w-24 rounded-full",style:{background:"rgba(255,255,255,0.05)"}})]}),t.jsxs("div",{className:"relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3",children:[t.jsxs("div",{className:"flex items-center gap-2.5",children:[t.jsx("div",{className:"h-9 w-9 rounded-lg flex items-center justify-center bg-white/15 backdrop-blur-sm",children:t.jsx(Mt,{className:"h-5 w-5"})}),t.jsxs("div",{children:[t.jsx("h1",{className:"text-lg sm:text-xl font-bold leading-tight",children:"SE Performance"}),t.jsx("p",{className:"text-[11px] text-white/70 leading-tight",children:a?"Loading…":r?"Could not load the roster":t.jsxs(t.Fragment,{children:["Annexure I commitment & accountability matrix · ",we," engineers across ",Ae," branches"]})})]})]}),t.jsxs("div",{className:"relative w-[280px] max-w-full",onMouseEnter:()=>E(!0),onMouseLeave:()=>{q||E(!1)},children:[t.jsxs("button",{onClick:()=>{H(!1),E(!C)},className:"w-full flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white shadow-md hover:bg-white/90 transition-all",style:{color:ue},children:[t.jsx(zt,{className:"h-3.5 w-3.5 flex-shrink-0"}),t.jsx("span",{className:"truncate",children:g&&h?`${lt(g)} → ${lt(h)}`:"Select period"}),t.jsx(et,{className:`h-3 w-3 flex-shrink-0 transition-transform ${C?"rotate-180":""}`})]}),C&&t.jsx("div",{className:"absolute z-50 left-0 right-0 sm:left-auto sm:right-0 top-full pt-2",children:t.jsx("div",{className:"sm:w-[440px] max-w-[92vw] bg-white rounded-xl shadow-xl border border-gray-200 text-gray-800",children:t.jsx("div",{className:"p-3 max-h-[75vh] overflow-y-auto",children:t.jsxs("div",{className:"flex flex-col sm:flex-row gap-4",children:[t.jsxs("div",{className:"sm:w-[34%]",children:[t.jsx("h3",{className:"text-xs font-semibold text-gray-800 mb-2 text-center",children:"Quick Select"}),t.jsx("div",{className:"space-y-1.5",children:F.map(S=>S.key==="fy"?t.jsxs("div",{className:"relative",children:[t.jsxs("button",{type:"button",onClick:()=>H(N=>!N),className:`w-full relative pl-2 pr-6 py-1.5 rounded-lg text-xs font-medium transition-all text-center ${D==="fy"?"text-white":"bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200"}`,style:D==="fy"?{backgroundColor:ue}:{},children:["FY ",T,"–",String(T+1).slice(2),t.jsx(et,{className:`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 transition-transform ${q?"rotate-180":""} ${D==="fy"?"text-white":"text-gray-500"}`})]}),q&&t.jsx("div",{className:"mt-1 max-h-36 overflow-y-auto bg-white border border-gray-200 rounded-lg",children:G.map(N=>t.jsxs("button",{type:"button",ref:N===T?O=>{O&&O.parentElement&&(O.parentElement.scrollTop=Math.max(0,O.offsetTop-O.parentElement.clientHeight/2))}:void 0,onClick:()=>{H(!1),M(N)},className:`block w-full px-2 py-1.5 text-xs text-center hover:bg-gray-100 ${N===T?"font-semibold text-white":"text-gray-700"}`,style:N===T?{backgroundColor:ue}:{},children:["FY ",N,"–",String(N+1).slice(2)]},N))})]},S.key):t.jsx("button",{onClick:()=>l(S.key),className:`w-full px-2 py-1.5 rounded-lg text-xs font-medium transition-all text-center ${D===S.key?"text-white":"bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200"}`,style:D===S.key?{backgroundColor:ue}:{},children:S.label},S.key))})]}),t.jsxs("div",{className:"sm:w-[66%]",children:[t.jsx("h3",{className:"text-xs font-semibold text-gray-800 mb-2 text-center",children:"Custom Range"}),t.jsxs("div",{className:"flex gap-2 mb-2",children:[t.jsxs("div",{className:"flex-1",children:[t.jsx("label",{className:"block text-[11px] text-gray-500 mb-0.5 text-center",children:"Start Date"}),t.jsx("div",{className:`px-1.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-center truncate ${L?"font-semibold text-gray-900":"text-gray-400"}`,children:L?L.toLocaleDateString("en-GB"):"Not selected"})]}),t.jsxs("div",{className:"flex-1",children:[t.jsx("label",{className:"block text-[11px] text-gray-500 mb-0.5 text-center",children:"End Date"}),t.jsx("div",{className:`px-1.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-center truncate ${b?"font-semibold text-gray-900":"text-gray-400"}`,children:b?b.toLocaleDateString("en-GB"):"Not selected"})]})]}),t.jsx("div",{className:"border border-gray-200 rounded-lg p-1 bg-gray-50/50 flex justify-center",children:t.jsx(St,{selected:L,onChange:S=>{const[N,O]=S;u(N),x(O)},startDate:L,endDate:b,selectsRange:!0,inline:!0,calendarClassName:"custom-calendar",dateFormat:"dd/MM/yyyy"})}),t.jsxs("div",{className:"flex gap-2 mt-2.5",children:[t.jsx("button",{onClick:()=>E(!1),className:"flex-1 px-2 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-xs font-medium",children:"Cancel"}),t.jsx("button",{onClick:re,disabled:!L||!b,className:"flex-1 px-2 py-1.5 text-white rounded-lg hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium",style:{backgroundColor:ue},children:"Apply"})]})]})]})})})})]})]})]}),a&&!e?t.jsx("div",{className:"flex justify-center py-12",children:t.jsx("div",{className:"h-9 w-9 animate-spin rounded-full border-[3px] border-gray-200",style:{borderTopColor:ue}})}):r?t.jsx("div",{className:"px-3 py-6 text-center text-sm text-red-600",children:r}):e?.engineers?.length?t.jsx(us,{roster:e,periodFrom:g,periodTo:h}):t.jsxs("div",{className:"bg-white rounded-2xl border border-gray-200 px-4 py-10 text-center",children:[t.jsx("p",{className:"text-sm font-semibold text-gray-800",children:"No engineers on the roster yet"}),t.jsxs("p",{className:"text-xs text-gray-500 mt-1",children:["This report reads the ",t.jsx("b",{children:"SE UID Master"})," (Profile → PMS). Add engineers there and pin each one to a branch — a row with no branch cannot appear on a branch report."]})]})]})})};export{Fs as default};
