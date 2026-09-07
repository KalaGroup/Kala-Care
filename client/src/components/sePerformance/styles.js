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
/* AMBER, and only here: Close is the one action on the bar that throws the
   report away, so it does not get to look like Print. Amber and not red —
   nothing is destroyed, the engineer is simply let go of. */
.sep .btn.amber{background:var(--pms-near);border-color:#e3c85c;color:var(--pms-near-ink);font-weight:600}
.sep .btn.amber:hover{background:#f6e49a;border-color:#d4b53f;color:var(--pms-near-ink)}
html.dark .sep .btn.amber{border-color:#6b5c1f}
html.dark .sep .btn.amber:hover{background:#4b421a;border-color:#8a7526;color:var(--pms-near-ink)}
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
.sep .panel h3{margin:0 0 9px;font-size:13px;font-weight:700;color:var(--ink);display:flex;align-items:center;gap:7px}
.sep .panel h3 .sm{font-size:10.5px;font-weight:500;color:var(--muted)}
/* ---------------- performance explorer (the drill-down box) ---------------- */
.sep .pn-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;margin-bottom:5px}
.sep .crumbs{display:flex;flex-wrap:wrap;align-items:center;gap:4px;font-size:11px;margin-left:auto}
.sep .crumbs button{border:0;background:none;font:inherit;font-size:11px;color:var(--brand);cursor:pointer;padding:2px 5px;border-radius:6px}
.sep .crumbs button:hover{background:var(--pms-row-b)}
.sep .crumbs span{color:var(--muted)}
.sep .crumbs .cur{color:var(--ink);font-weight:600;padding:2px 5px}
.sep .pn-list{max-height:340px;overflow-y:auto;margin:0 -4px;padding:0 4px}
/* the branch board: Maharashtra on the left, Karnataka on the right */
/* THE BOARD IS A FIXED HEIGHT, and that is what stops the page from jumping.
   With the height following the content, folding a branch made the taller
   column shorter, the grid row shrank with it, and everything below the board
   slid up the screen - which is what you see as the page jumping when the
   pointer crosses from MH to KA. At a fixed height a fold can only ever move
   rows INSIDE a column's own scrollport, and nothing outside the board moves at
   all. The cost is some empty space under the shorter region, which is the
   right trade: a still page beats a tight one. */
.sep .ex-cols{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:0 -4px;padding:0 4px;
         align-items:start;height:340px}
/* EACH REGION SCROLLS ON ITS OWN, and this is a correctness rule and not a
   cosmetic one. With ONE scrollport around both columns, folding MH changed the
   height of the box KA was living in: a scrollport already at its end could not
   absorb the difference, so KA's rows slid under a pointer that was standing
   still, the browser fired enter for whichever branch arrived there, and the
   board opened a branch nobody had pointed at. Two ports, and a fold in one
   region cannot move a single row of the other. */
.sep .ex-col{height:100%;overflow-y:auto;overflow-x:hidden}
@media(max-width:860px){.sep .ex-cols{grid-template-columns:1fr;gap:12px;height:auto}
  .sep .ex-col{height:260px}
}
.sep .ex-h{display:flex;align-items:baseline;gap:8px;font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;
      font-weight:800;color:var(--brand-d);padding:3px 6px;border-bottom:2px solid var(--pms-div);margin-bottom:1px;
      position:sticky;top:0;z-index:2;background:var(--card)}
html.dark .sep .ex-h{color:#9ec5ea}
.sep .ex-h span{font-size:10px;text-transform:none;letter-spacing:0;font-weight:500;color:var(--muted);margin-left:auto}
.sep .ex-back{border:1px solid var(--edge-2);background:var(--card);color:var(--brand);border-radius:8px;
         padding:4px 10px;font:inherit;font-size:11px;font-weight:600;cursor:pointer}
.sep .ex-back:hover{border-color:var(--brand);background:var(--pms-row-b)}
/* the roster's provenance — a quiet chip, it is a caption and not a control */
.sep .crumbs .ex-src{border:1px solid var(--edge-2);border-radius:999px;padding:3px 9px;
         font-size:11px;font-weight:600;color:var(--muted);background:var(--pms-row-b);
         cursor:help;white-space:nowrap}
/* ---- the sitemap tree ----------------------------------------------------
   A branch unfolds its engineers underneath it on a connector line, so the
   shape of the org stays on screen while you read one branch of it. */
.sep .pn-row.br{font-weight:600}
.sep .pn-row.br.open{background:var(--pms-band-b)}
/* Each branch and its engineers sit in ONE box so that moving the pointer off
   the branch row down onto its own list is not a mouseleave. The box is pure
   plumbing — no padding, no border, nothing that shifts the tree. */
.sep .ex-br{position:relative}
/* Wrapping them cost the branch rows their separator: the .pn-row:last-child
   rule zeroes the bottom border, and a FOLDED branch row is now the last child
   of its own box. Re-asserted here, and dropped only on the last branch of the
   column — which is what that rule meant in the first place. */
.sep .ex-br > .pn-row.br{border-bottom:1px solid var(--edge)}
.sep .ex-br:last-child > .pn-row.br:last-child{border-bottom:0}
/* A PINNED branch stays open when the pointer leaves; a hover-open one does
   not. The ring on the rank says which, without spending a column on it. */
.sep .pn-row.br.pin .pn-rank{box-shadow:inset 0 0 0 1.5px var(--brand)}
/* ---- the unfold ----------------------------------------------------------
   Four things move, and they are deliberately NOT the height. The rows take
   their space the instant they mount and only their PAINT is animated, which
   is what lets the hovered row be anchored to the pixel (see the layout effect
   in SEPerformanceReport): animating the height would move the row under the
   cursor for a third of a second and the board would chase the pointer.

   So the list is revealed by a downward WIPE, the connector DRAWS itself down
   the left, the engineers ARRIVE in rank order a frame apart, and each score
   bar FILLS from nothing to its own figure — the bar is the one animation that
   carries meaning rather than manners. */
@keyframes sep-wipe{from{clip-path:inset(0 -24px 100% -24px)}to{clip-path:inset(0 -24px 0 -24px)}}
@keyframes sep-line{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes sep-row-in{from{opacity:0;transform:translate3d(-12px,-5px,0)}to{opacity:1;transform:none}}
@keyframes sep-bar-fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}

.sep .ex-kids{animation:sep-wipe .34s cubic-bezier(.25,.8,.3,1)}
/* the stagger is capped at nine rows: a fifteen-engineer branch must not take
   half a second to finish arriving */
.sep .ex-kids > .pn-row{animation:sep-row-in .38s cubic-bezier(.22,.78,.28,1) backwards;
  animation-delay:calc(var(--i,0) * 36ms)}
.sep .ex-kids > .pn-row .pn-bar i{animation:sep-bar-fill .52s cubic-bezier(.2,.85,.25,1) backwards;
  animation-delay:calc(var(--i,0) * 36ms + 110ms)}
/* the rank chip lands last and firmest — it is the answer the reader came for */
.sep .ex-kids > .pn-row .pn-rank{animation:sep-row-in .34s cubic-bezier(.3,1.5,.55,1) backwards;
  animation-delay:calc(var(--i,0) * 36ms + 60ms)}

@media(prefers-reduced-motion:reduce){
  .sep .ex-kids, .sep .ex-kids::before, .sep .ex-kids > .pn-row,
  .sep .ex-kids > .pn-row .pn-bar i, .sep .ex-kids > .pn-row .pn-rank{animation:none}
  .sep .pn-go.tw{transition:none}
}
.sep .pn-row.se .pn-rank{background:var(--pms-grp-b);font-size:9.5px}
.sep .pn-go.tw{transition:transform .3s cubic-bezier(.34,1.38,.52,1)}
.sep .pn-go.tw.open{transform:rotate(90deg);color:var(--brand)}
.sep .ex-kids{position:relative;margin:0 0 3px 11px;padding-left:14px}
.sep .ex-kids::before{content:'';position:absolute;left:0;top:0;bottom:0;width:1px;background:var(--pms-line-v);
  opacity:.55;transform-origin:top center;animation:sep-line .42s .06s cubic-bezier(.25,.8,.3,1) backwards}
.sep .ex-kids > .pn-row{position:relative;border-bottom:0;padding-left:4px}
.sep .ex-kids > .pn-row::before{content:'';position:absolute;left:-15px;top:50%;width:12px;height:1px;
  background:var(--pms-line-v);opacity:.55}
/* the connector stops at the last engineer rather than running past him */
.sep .ex-kids > .pn-row:last-child::after{content:'';position:absolute;left:-15px;top:calc(50% + 1px);
  bottom:-2px;width:1px;background:var(--card)}
.sep .ex-kids > .pn-row .pn-name b{font-weight:500}
.sep .pn-row{display:grid;grid-template-columns:26px 1fr 54px 92px 52px 26px 14px;gap:8px;align-items:center;
        padding:4px 6px;border-radius:7px;font-size:12px;line-height:1.28;color:var(--ink-2);cursor:pointer;
        border-bottom:1px solid var(--edge)}
.sep .pn-row:last-child{border-bottom:0}
.sep .pn-row:hover{background:var(--pms-row-b)}
.sep .pn-row.on{background:var(--pms-sel);color:var(--ink)}
.sep .pn-rank{width:22px;height:19px;border-radius:5px;background:var(--pms-grptot);color:var(--brand-d);
         font-size:9.5px;font-weight:800;display:flex;align-items:center;justify-content:center;font-variant-numeric:tabular-nums}
html.dark .sep .pn-rank{color:#cfe0f0}
.sep .pn-row.top1 .pn-rank{background:var(--pms-ok);color:var(--pms-ok-ink)}
.sep .pn-row.bot1 .pn-rank{background:var(--pms-miss);color:var(--pms-miss-ink)}
.sep .pn-name{min-width:0;overflow:hidden}
.sep .pn-name b{font-weight:600;font-size:12px;color:var(--ink);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sep .pn-name span{display:block;font-size:10px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sep .pn-met{font-size:10.5px;color:var(--muted);text-align:right;font-variant-numeric:tabular-nums}
.sep .pn-bar{height:8px;border-radius:3px;background:var(--soft);border:1px solid var(--edge-2);overflow:hidden;position:relative}
.sep .pn-bar i{position:absolute;left:0;top:0;bottom:0;display:block;border-radius:2px;
  transform-origin:left center}
/* ---- the grade chip ------------------------------------------------------
   These were dropped when this sheet was generated from the prototype — the
   block they lived in went with the old table — so every grade letter on the
   page was rendering as plain text. A grade is a verdict; it gets a chip. */
.sep .gr{display:inline-block;min-width:21px;font-size:10.5px;font-weight:800;border-radius:5px;
     padding:1px 5px;text-align:center;line-height:1.45}
.sep .gr-A{background:var(--pms-ok);color:var(--pms-ok-ink)}
.sep .gr-B{background:#d8eecf;color:#2b4a17}
.sep .gr-C{background:var(--pms-near);color:var(--pms-near-ink)}
.sep .gr-D{background:var(--pms-miss);color:var(--pms-miss-ink)}
/* E is the deepest step of the AMBER ladder, not red — see scoreFill. The
   printed sheet below keeps its own literal bands. */
.sep .gr-E{background:#f6c184;color:#5a2a03}
html.dark .sep .gr-B{background:#24371c;color:#c6e3ad}
html.dark .sep .gr-E{background:#4a3113;color:#f3c48f}
/* the signed sheet keeps its own chip palette — see the --sh-* tokens on
   .sep .sheet, which flip in dark mode and flip back for the printer */
.sep .sheet .gr-A{background:var(--sh-ok-bg);color:var(--sh-ok-fg)}
.sep .sheet .gr-B{background:var(--sh-b-bg);color:var(--sh-b-fg)}
.sep .sheet .gr-C{background:var(--sh-warn-bg);color:var(--sh-warn-fg)}
.sep .sheet .gr-D{background:var(--sh-amber-bg);color:var(--sh-amber-fg)}
.sep .sheet .gr-E{background:var(--sh-bad-bg);color:var(--sh-bad-fg)}
/* beside a 23px score the grade is the other half of the verdict, not a footnote */
.sep .sh-verdict .gr{font-size:15px;min-width:34px;padding:2px 10px;margin-top:4px;border-radius:6px}

.sep .pn-score{text-align:right;font-weight:800;font-size:12px;font-variant-numeric:tabular-nums;color:var(--ink)}
.sep .pn-score i{font-style:normal;font-size:9px;font-weight:600;opacity:.65;margin-left:1px}
.sep .dt-k .v i{font-style:normal;font-size:10px;font-weight:600;opacity:.6;margin-left:1px}
/* the productivity tile names the file it divides — the SR Count
   commitment beside it is a different count out of a different file */
.sep .dt-k .dt-src{font-size:8.5px;font-weight:600;opacity:.7;letter-spacing:.02em;margin-top:1px}
/* The three DAY figures are reference, not verdict: same row as the score, a
   size down and behind a divider, so the eye reads 'score, grade, met, rate'
   first and finds the man-days when it wants them. */
.sep .dt-k.dt-k-day{opacity:.92}
.sep .dt-k.dt-k-day:first-of-type{border-left:1px solid rgba(255,255,255,.28);padding-left:13px;margin-left:3px}
.sep .dt-k.dt-k-day .v{font-size:15px}
.sep .dt-k.dt-k-day .l{max-width:78px;white-space:normal;line-height:1.15}
.sep .pn-go{width:13px;height:13px;color:var(--muted)}
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
/* z-index 20, and the ceiling is not arbitrary: the application's sidebar is
   z-30 and its fly-out menus are z-50 INSIDE it, so anything on the page at 30
   or over paints across an open menu — which is what this block was doing at
   30, being later in the document. All it has to clear is the table's own
   sticky header and metric column, and those top out at 9. */
.sep .dt-pin{position:sticky;top:var(--sep-pin-top,0px);z-index:20;background:var(--card);
        border-radius:13px 13px 0 0}
.sep .dt-top{background:linear-gradient(120deg,var(--brand) 0%,var(--brand-d) 100%);color:#fff;
        padding:7px 14px;display:flex;flex-wrap:wrap;align-items:center;gap:12px;
        border-radius:13px 13px 0 0}
.sep .dt-id h3{margin:0;font-size:14px;font-weight:700;letter-spacing:-.01em;line-height:1.2}
.sep .dt-id p{margin:1px 0 0;font-size:10.5px;color:rgba(255,255,255,.72)}
/* an id is read digit by digit — it needs the contrast the prose around it does not */
.sep .dt-id p b{color:#fff;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:.02em}
/* Dark. --brand is the ERP's indigo and it does not move with the theme, so
   on a #0f1115 page the title band was the brightest surface in the window —
   a saturated slab with the whole card reading as chrome hung under it. Dark
   mode deepens the same two stops instead of recolouring them, and the
   sub-line, which was 72% white against a much lighter ground, comes up to
   where it can still be read against the deeper one. The PRINTED sheet is
   untouched: the print block below forces the band back to solid #2f3192. */
html.dark .sep .dt-top,
html.dark .sep .sheet .sh-top{background:linear-gradient(120deg,#262a63 0%,#1a1c46 100%)}
html.dark .sep .dt-id p,
html.dark .sep .sheet .sh-top .s2{color:rgba(255,255,255,.82)}
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
/* the working days ride with the period but are not part of it, so they
   get the ink the period does not */
.sep .dt-scope .dt-wd{font-weight:700;color:var(--ink-2);margin-left:7px;padding-left:7px;
     border-left:1px solid var(--edge-2);cursor:help}
/* The breakdown is TRANSPOSED: the periods run left to right across the head,
   the metrics run top to bottom down the frozen first column, and the period
   total is frozen against the right edge so it is readable at any scroll. */
/* The breakdown scrolls sideways, often a long way — so the bar is mirrored
   ABOVE the table as well: on a 31-day view the bottom bar is off the far end
   of the screen by the time you need it. Bar and table share ONE frame, so the
   two can never drift out of line and their borders cannot double up. */
.sep .dt-frame{border:1px solid var(--pms-line);border-radius:10px;overflow:hidden;margin-bottom:14px}
.sep .dt-topbar{overflow-x:auto;overflow-y:hidden;height:13px;background:var(--soft);
           border-bottom:1px solid var(--pms-line);line-height:0}
.sep .dt-topbar.hide{display:none}
.sep .dt-topbar > div{height:1px}
/* The breakdown is its own scroll box — which is exactly what lets the header
   row and the metric column stay put while you read across 31 days and down
   through the bifurcations.

   Its HEIGHT is set in px by fitBox() in SEPerformanceReport: the box is as
   tall as the rows that are open, and grows and shrinks as they unfold. The
   max-height is the ceiling that measurement is clamped to, and it is also
   what the box falls back to if the script never runs. */
.sep .dt-tblbox{overflow:auto;max-height:78vh;
        transition:height .3s cubic-bezier(.25,.8,.3,1);
        /* The frozen PERIOD column floats over the days, so the last one is
           only fully in the open at an exact hard-right scroll — twelve pixels
           of it are still underneath at 98% of the way across. The snapport is
           inset by PERIOD's own measured width and the last period is the one
           snap point on the strip, so a scroll that FINISHES near the end
           settles with that column clear. proximity, not mandatory: every
           other position on the strip is left completely alone. */
        scroll-snap-type:x proximity;scroll-padding-right:var(--sep-totw,56px)}
/* while the mirrored strip above is being dragged, the box must not snap out
   from under it — see mirrorScroll in SEPerformanceReport */
.sep .dt-tblbox.nosnap{scroll-snap-type:none}
/* the strip is a control, and a 6px control is hard to take hold of */
.sep .dt-topbar::-webkit-scrollbar{height:9px}
.sep .dt-topbar::-webkit-scrollbar-thumb{background:var(--sep-bar);border-radius:6px}
.sep table.dt-t thead th.snapend{scroll-snap-align:end}
/* mid-growth the box is shorter than its own rows; the bar it would show for
   those 300ms is an artefact of the animation, not of the content */
.sep .dt-tblbox.growing{overflow-y:hidden}
@media(prefers-reduced-motion:reduce){.sep .dt-tblbox{transition:none}}
.sep table.dt-t thead th{position:sticky;top:0;z-index:5}
.sep table.dt-t thead th.m{z-index:8}
.sep table.dt-t thead th.tot{z-index:7}
.sep table.dt-t thead th.m.tot{z-index:9}
/* one thin bar everywhere the page scrolls */
.sep .dt-topbar, .sep .dt-tblbox, .sep .ex-col, .sep .ms-list, .sep .pn-list{scrollbar-width:thin;scrollbar-color:var(--sep-bar) transparent}
.dt-topbar::-webkit-scrollbar,.dt-tblbox::-webkit-scrollbar,
.sep .ex-col::-webkit-scrollbar, .sep .ms-list::-webkit-scrollbar, .sep .pn-list::-webkit-scrollbar{width:6px;height:6px}
.dt-topbar::-webkit-scrollbar-thumb,.dt-tblbox::-webkit-scrollbar-thumb,
.sep .ex-col::-webkit-scrollbar-thumb, .sep .ms-list::-webkit-scrollbar-thumb, .sep .pn-list::-webkit-scrollbar-thumb{
  background:var(--sep-bar);border-radius:6px}
.dt-topbar::-webkit-scrollbar-track,.dt-tblbox::-webkit-scrollbar-track,
.sep .ex-col::-webkit-scrollbar-track, .sep .ms-list::-webkit-scrollbar-track, .sep .pn-list::-webkit-scrollbar-track{background:transparent}
.sep table.dt-t{border-collapse:separate;border-spacing:0;width:max-content;min-width:100%}
/* THE GRID IS DRAWN WITH REAL BORDERS, and never with inset box-shadows.
   A shadow is painted geometry rather than layout: at a fractional
   device-pixel ratio - Windows display scaling at 125%, which is the common
   case on these laptops - a 1px inset shadow is smeared across two device
   pixels at partial alpha, and whether a given rule lands crisp or washed out
   depends on that row's own sub-pixel offset. Opening or closing a group moves
   every row below it by a fraction of a pixel, so lines came and went as the
   table was expanded and collapsed. Measured at dpr 1.25: eight of the
   twenty-four row rules fell from 1.86:1 to 1.37:1 against their own cell,
   three of eight while collapsed, and at dpr 1 and 1.5 every one of them was
   crisp - which is why it looked intermittent.
   Borders are snapped to device pixels by the paint pipeline and hold at every
   scaling. box-sizing is border-box across the application, so the 1px comes
   out of the cell's own width and not one column moves.
   The column rule is --pms-line-v, a step darker than the row rule, which is
   what every other PMS grid in the ERP uses (see .pms-grid in index.css). */
.sep table.dt-t th, .sep table.dt-t td{padding:6px 8px;font-size:10.5px;line-height:1.4;white-space:nowrap;
      height:28px;border-right:1px solid var(--dt-rule-v);border-bottom:1px solid var(--dt-rule)}
.sep table.dt-t thead th{background:var(--pms-head);color:var(--ink-2);font-size:9px;font-weight:700;
      text-transform:uppercase;letter-spacing:.04em;text-align:center;line-height:1.25;min-width:52px;height:40px}
.sep table.dt-t thead th b{display:block;font-size:10px;letter-spacing:0;color:var(--ink)}
.sep table.dt-t thead th span{display:block;font-size:8.5px;font-weight:500;color:var(--muted);text-transform:none;letter-spacing:0}
.sep table.dt-t th.m{position:sticky;left:0;z-index:4;text-align:left;width:186px;min-width:186px;
      background:var(--pms-band-b);color:var(--ink);font-size:11px;font-weight:600;text-transform:none;letter-spacing:0;
      line-height:1.2;
      border-right:1px solid var(--pms-div);box-shadow:3px 0 6px -3px var(--pms-edge-shadow)}
/* 'Day →' is a COLUMN HEADING and reads centred like every other heading on
   the row. Only the header: the metric names under it stay left-aligned, which
   is how a list of labels is read. Covers the attendance table too - it borrows
   table.dt-t whole. */
.sep table.dt-t thead th.m{background:var(--pms-head);z-index:6;text-align:center}
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
/* an empty cell's dash sits in the middle — it has no digits to line up
   with, and on the right edge it left every gap looking ragged */
.sep table.dt-t td.nil{text-align:center}
.sep table.dt-t tbody tr:nth-child(even) td{background:var(--pms-row-b)}
.sep table.dt-t tbody tr:hover td{background:var(--pms-hover)}
.sep table.dt-t tbody tr:hover th.m{background:var(--pms-sel)}
.sep table.dt-t td.off, .sep table.dt-t th.off{background:var(--pms-band-b);color:var(--muted)}
.sep table.dt-t .tot{position:sticky;right:0;z-index:5;background:var(--pms-subtot) !important;
      font-weight:800;color:var(--ink);
      border-left:1px solid var(--pms-div);border-right:0;
      box-shadow:-3px 0 6px -3px var(--pms-edge-shadow)}
/* 'Total / Avg' keeps its own case: the period headers are upper-cased because
   they are dates, and this column is not one of the periods — it is what they
   add up to. One line now, so no sub-label to style. */
.sep table.dt-t thead th.tot{background:var(--pms-grptot) !important;z-index:7;
      text-transform:none;letter-spacing:0;font-size:10px}
.sep table.dt-t thead th.cur{background:var(--pms-sel)}
/* ---- the four points -----------------------------------------------------
   A row of four cards on the signed sheet, one per thing a manager can act on.
   Painted from the sheet's own --sh-* palette rather than the page's, so the
   cards follow the theme on screen and go back to paper colours for the
   printer. Tone is the verdict: met, within 15%, short, or no data at all. */
.sep .pts{display:grid;grid-template-columns:repeat(2,1fr);gap:9px;margin:4px 0 2px}
@media(max-width:900px){.sep .pts{grid-template-columns:1fr}}
.sep .pt{border:1px solid var(--sh-rule-2);border-left:3px solid var(--sh-rule);border-radius:9px;
     padding:8px 11px 9px;background:var(--sh-card)}
.sep .pt.p-ok{border-left-color:var(--sh-pt-ok-line);background:var(--sh-pt-ok-bg)}
.sep .pt.p-near{border-left-color:var(--sh-pt-near-line);background:var(--sh-pt-near-bg)}
.sep .pt.p-miss{border-left-color:var(--sh-pt-miss-line);background:var(--sh-pt-miss-bg)}
.sep .pt.p-na{border-left-color:var(--sh-pt-na-line);background:var(--sh-pt-na-bg)}
.sep .pt-h{display:flex;align-items:baseline;gap:8px}
.sep .pt-l{font-size:11px;font-weight:700;color:var(--sh-accent);text-transform:uppercase;letter-spacing:.05em}
.sep .pt-n{margin-left:auto;font-size:19px;font-weight:800;color:var(--sh-ink);
     font-variant-numeric:tabular-nums;line-height:1.1}
.sep .pt-s{font-size:9.5px;color:var(--sh-mut);margin-top:1px}
.sep .pt-b{font-size:11px;color:var(--sh-ink);line-height:1.5;margin-top:5px}
.sep .pt-b b{font-weight:700}
/* on paper the four sit two-up and must not break across a page */
@media print{.sep .pt{break-inside:avoid}}
/* ---- the acknowledgement, PAPER ONLY -------------------------------------
   The signed matrix is a report on screen and a document on paper. The lines
   that get signed would be dead furniture in the popup — nobody signs a
   screen — so they are declared here and shown only by the print stylesheet. */
.sep .sh-sign{display:none}

/* ---- HR's attendance, day by day -----------------------------------------
   Its own table under the breakdown, with its own columns: the breakdown can
   be showing weeks or quarters and attendance is only ever a statement about
   days, so this one always draws the month the picker is on. It borrows
   table.dt-t wholesale - the same borders, the same 28px rows, the same frozen
   metric column - and only narrows the columns, because 31 days at 52px each
   would scroll for no reason. */
.sep .at-box{margin:14px 0 4px;border:1px solid var(--pms-div);border-radius:12px;
      background:var(--card);overflow:hidden}
.sep .at-h{display:flex;flex-wrap:wrap;align-items:baseline;gap:9px;padding:8px 13px;
      border-bottom:1px solid var(--dt-rule);background:var(--pms-band-b)}
.sep .at-t{font-size:12px;font-weight:700;color:var(--ink);text-transform:uppercase;letter-spacing:.05em}
.sep .at-s{font-size:10.5px;color:var(--muted)}
.sep .at-k{margin-left:14px;font-size:10.5px;color:var(--ink-2);text-align:right}
.sep .at-k b{font-size:14px;font-weight:800;color:var(--ink);font-variant-numeric:tabular-nums;margin-right:3px}
.sep .at-k em{display:block;font-style:normal;font-size:9px;color:var(--muted)}
/* pushed to the right of the header by margin-left:auto, which is why .at-k
   no longer claims it - the two sit together at that end, tally then figure */
.sep .at-chips{display:flex;flex-wrap:wrap;align-items:center;align-self:center;
      gap:5px;margin-left:auto}
.sep .at-chip{display:inline-flex;align-items:center;gap:5px;font-size:10px;color:var(--ink-2);
      border:1px solid var(--pms-line);border-radius:20px;padding:2px 8px 2px 3px;background:var(--pms-row-a)}
.sep .at-chip i{font-style:normal;font-size:9px;font-weight:800;min-width:19px;height:16px;
      display:inline-flex;align-items:center;justify-content:center;border-radius:20px}
.sep .at-chip b{font-weight:800;color:var(--ink);font-variant-numeric:tabular-nums}
.sep .at-tblbox{overflow-x:auto;overflow-y:hidden;
      scrollbar-width:thin;scrollbar-color:var(--sep-bar) transparent}
.sep .at-tblbox::-webkit-scrollbar{height:6px}
.sep .at-tblbox::-webkit-scrollbar-thumb{background:var(--sep-bar);border-radius:6px}
.sep table.dt-t.at-tbl th.m{width:126px;min-width:126px}
.sep table.dt-t.at-tbl thead th{min-width:36px}
.sep table.dt-t.at-tbl th, .sep table.dt-t.at-tbl td{padding:6px 4px}
.sep table.dt-t.at-tbl td{font-weight:700;letter-spacing:.02em}
/* the day's own verdict. Literal ladder colours, the same four the rest of the
   report reads: worked green, half a day yellow, lost orange, and a day nobody
   was expected to work stays the band tint so the eye skips it. */
.sep table.dt-t.at-tbl td.atc-p{background:var(--pms-ok);color:var(--pms-ok-ink)}
.sep table.dt-t.at-tbl td.atc-h{background:var(--pms-near);color:var(--pms-near-ink)}
.sep table.dt-t.at-tbl td.atc-a{background:var(--pms-miss);color:var(--pms-miss-ink)}
.sep table.dt-t.at-tbl td.atc-o{background:var(--pms-band-b);color:var(--muted);font-weight:500}
.sep table.dt-t.at-tbl td.atc-n{background:var(--pms-row-a);color:var(--muted);font-weight:500}
.sep .at-chip.atc-p i{background:var(--pms-ok);color:var(--pms-ok-ink)}
.sep .at-chip.atc-h i{background:var(--pms-near);color:var(--pms-near-ink)}
.sep .at-chip.atc-a i{background:var(--pms-miss);color:var(--pms-miss-ink)}
.sep .at-chip.atc-o i{background:var(--pms-band-b);color:var(--muted)}
.sep .at-chip.atc-n i{background:var(--pms-row-a);color:var(--muted)}
.sep .at-none{font-size:11px;color:var(--muted);line-height:1.6;padding:12px 13px 14px}

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
  /* THE BREAKDOWN GRID'S OWN TWO RULES, a step darker than --pms-line.
     A 1px rule cannot be painted on an exact device pixel at every display
     scaling, and where it straddles two the browser splits its ink between
     them - so its darkest pixel is only about half as dark as the colour asks
     for. --pms-line survives that at 1.34:1 against its own cell, which reads
     as no line at all; these two survive it at better than 1.7:1. The column
     rule stays a step darker again, which is the ERP's convention for every
     grid (see .pms-grid in index.css). */
  --dt-rule:#8ab0d4; --dt-rule-v:#6f9dc9;
  /* The thin scrollbars get a token of their OWN rather than borrowing the
     grid's rule colour. They are chrome, not content, and in dark mode a bar
     bright enough to be a good hairline was the brightest thing on the card —
     two light-grey rails framing the breakdown. */
  --sep-bar:var(--pms-line-v);
}
/* ---- dark: the report's own grid ladder -----------------------------------
   The shared --pms-* dark steps were drawn for the AOP and AMC sheets, which
   are mostly text on one surface. This breakdown puts FOUR surfaces side by
   side — the zebra row, the frozen metric column, the header, and the frozen
   Total column — and their dark values sat within a few points of lightness
   of one another, so on a near-black page the bands stopped separating and
   the table read as one navy wash. The ladder is re-spread HERE, on .sep, so
   every other PMS report keeps the steps it was tuned against. */
html.dark .sep{
  --dt-rule:#46586a; --dt-rule-v:#55697f;
  --sep-bar:#3a4a5c;
  --pms-row-a:#0e141c; --pms-row-b:#161f2a;
  --pms-band-a:#0c1118; --pms-band-b:#1b2937;
  --pms-grp-a:#131c26;  --pms-grp-b:#1d2b39;
  --pms-head:#22374b;
  --pms-subtot:#25394d; --pms-grptot:#2c4359;
  /* the selected engineer and the hovered cell are the palest things on the
     page; at the shared value they read as a light box dropped on it */
  --pms-sel:#204058; --pms-hover:#26405a;
  --pms-line:#33414f;
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
/* tbody is in the selector to OUTWEIGH the zebra rule above: the engineer
   stripe is .sep table.dt-t tbody tr:nth-child(even) td, and without the extra
   element in the chain this one lost to it - so half the children of an open
   group were painted with the engineer tint instead of the group tint, and
   which half flipped every time a group above them was opened or closed. */
.sep table.dt-t tbody tr.kid td{background:var(--pms-grp-a);font-size:10px;color:var(--ink-2)}
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
/* ONE CHART PER ROW, at the report's full width. Two to a row gave a month's
   31 days about 19px each: too narrow to draw a bar in, and narrow enough that
   only every fourth day could carry a label. Full width gives every day of the
   month its own column and its own label. */
.sep .dt-charts{display:grid;grid-template-columns:1fr;gap:12px}
.sep .ch{margin:0;border:1px solid var(--edge);border-radius:11px;padding:9px 11px 6px;background:var(--card);min-width:0}
.sep .ch figcaption{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;margin-bottom:6px}
.sep .ch-t{font-size:11.5px;font-weight:700;color:var(--ink)}
.sep .ch-s{font-size:9.5px;color:var(--muted)}
.sep .ch-lg{display:flex;flex-wrap:wrap;gap:9px;margin-left:auto;font-size:9.5px;color:var(--ink-2)}
.sep .ch-lg span{display:inline-flex;align-items:center;gap:4px}
.sep .ch-lg i{width:9px;height:9px;border-radius:3px;display:inline-block;flex:none}
/* the Revenue chart's two tabs — a legend you can press, so the swatch keeps
   telling you which colour is which while doubling as the control */
.sep .ch-tabs{display:flex;gap:4px;margin-left:auto}
.sep .ch-tab{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--edge-2);
     background:var(--card);color:var(--muted);border-radius:7px;padding:3px 9px;
     font:inherit;font-size:9.5px;font-weight:600;cursor:pointer;white-space:nowrap}
.sep .ch-tab i{width:9px;height:9px;border-radius:3px;display:inline-block;flex:none;opacity:.45}
.sep .ch-tab:hover{border-color:var(--brand);color:var(--ink-2)}
.sep .ch-tab.on{background:var(--pms-band-b);border-color:var(--brand);color:var(--ink)}
.sep .ch-tab.on i{opacity:1}
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
/* ---- the sheet's own palette ----------------------------------------------
   Everything inside the signed matrix — paper, rules, tints, the five bands,
   the four points, the score ink — is named here rather than written as a
   literal, because the same markup has to serve three surfaces: the light
   screen, the DARK screen, and paper. It used to be literal light hex on the
   grounds that "the sheet is white paper in both themes", and in dark mode the
   popup came up as a slab of white with a couple of tokens (--pms-*-ink, set
   from JS) flipping to their dark values on it — pale green ink on a pale
   green chip. So the tokens flip with the theme, and the print block at the
   foot of this file declares the LIGHT set back onto .sheet, so what comes out
   of the printer is the same white paper it always was. */
.sep .sheet{
  --sh-paper:#fff;  --sh-tint:#f7fbff;  --sh-head:#e8f3fc;  --sh-card:#fbfdff;
  --sh-rule:#9fc0df; --sh-rule-2:#cfe0ef;
  --sh-ink:#111827; --sh-ink-2:#374151; --sh-mut:#6b7280;
  --sh-accent:#23255f; --sh-brand:#2f3192;
  --sh-shadow:0 24px 60px rgba(0,0,0,.35);
  /* the five bands of the matrix: green -> yellow -> amber -> red, plus a
     neutral for a commitment whose file has said nothing */
  --sh-ok-bg:#cdeccd;    --sh-ok-fg:#12401f;
  --sh-b-bg:#d8eecf;     --sh-b-fg:#2b4a17;
  --sh-warn-bg:#fbf0bd;  --sh-warn-fg:#4a3c05;
  --sh-amber-bg:#fbd9b5; --sh-amber-fg:#6b3405;
  --sh-bad-bg:#f8c7c7;   --sh-bad-fg:#7a1d1d;
  --sh-na-bg:#eef1f4;
  /* the verdict strip's left edge */
  --sh-good-line:#0ca30c; --sh-warn-line:#fab219; --sh-bad-line:#d03b3b;
  /* the four points */
  --sh-pt-ok-line:#2f8f3f;   --sh-pt-ok-bg:#f6fcf6;
  --sh-pt-near-line:#c9a227; --sh-pt-near-bg:#fffdf4;
  --sh-pt-miss-line:#c0561f; --sh-pt-miss-bg:#fff9f5;
  --sh-pt-na-line:#9aa5b1;   --sh-pt-na-bg:#fafbfc;
  /* the big commitment score, coloured from JS by scoreInk() */
  --sh-score-ok:#12401f; --sh-score-b:#3f7a2e;
  --sh-score-warn:#4a3c05; --sh-score-bad:#6b3405;
}
/* Dark. The surfaces step up from the app's own --card so the sheet still
   reads as a document lifted off the page, and every band keeps the --pms-*
   dark pairing the rest of the ERP's grids use, so a green cell here and a
   green cell on the AMC sheet are the same green. */
html.dark .sep .sheet{
  --sh-paper:#111820; --sh-tint:#18222d; --sh-head:#1c2c3e; --sh-card:#151d27;
  --sh-rule:#33465a; --sh-rule-2:#2a3a4a;
  --sh-ink:#e6edf5; --sh-ink-2:#c2ced9; --sh-mut:#8b9bab;
  --sh-accent:#9ec5ea; --sh-brand:#9ec5ea;
  --sh-shadow:0 24px 60px rgba(0,0,0,.62);
  --sh-ok-bg:#1d3a24;    --sh-ok-fg:#b7e6bf;
  --sh-b-bg:#24371c;     --sh-b-fg:#c6e3ad;
  --sh-warn-bg:#3b3413;  --sh-warn-fg:#ecd97a;
  --sh-amber-bg:#402612; --sh-amber-fg:#f0b98a;
  --sh-bad-bg:#4a1f1f;   --sh-bad-fg:#f0aaaa;
  --sh-na-bg:#1a222c;
  --sh-good-line:#3fae4f; --sh-warn-line:#d9b02f; --sh-bad-line:#e05a5a;
  --sh-pt-ok-line:#3f9a4f;   --sh-pt-ok-bg:#16241a;
  --sh-pt-near-line:#cfa93a; --sh-pt-near-bg:#241f10;
  --sh-pt-miss-line:#cf6a34; --sh-pt-miss-bg:#291a12;
  --sh-pt-na-line:#55697f;   --sh-pt-na-bg:#151c24;
  --sh-score-ok:#8ada99; --sh-score-b:#b3dd9a;
  --sh-score-warn:#ecd97a; --sh-score-bad:#f0b98a;
}
/* The sheet owns the height and its BODY does the scrolling, so the title bar
   stays put instead of scrolling away from the numbers it names. */
.sep .sheet{background:var(--sh-paper);color:var(--sh-ink);width:100%;max-width:1040px;border-radius:14px;
       box-shadow:var(--sh-shadow);overflow:hidden;
       height:calc(100vh - 8px);max-height:calc(100vh - 8px);display:flex;flex-direction:column}
.sep .sheet .sh-top{background:linear-gradient(120deg,var(--brand) 0%,var(--brand-d) 100%);color:#fff;
       padding:7px 18px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.sep .sheet .sh-top h2{margin:0;font-size:13px;font-weight:700;letter-spacing:-.01em;line-height:1.25}
.sep .sheet .sh-top .s2{font-size:10.5px;color:rgba(255,255,255,.75);margin-top:1px}
.sep .sh-x{border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.14);color:#fff;border-radius:8px;padding:5px 10px;font:inherit;font-size:11.5px;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
.sep .sh-x:hover{background:rgba(255,255,255,.26)}
.sep .sh-body{padding:11px 18px 20px;overflow-y:auto;flex:1 1 auto;min-height:0;
         scrollbar-width:thin;scrollbar-color:var(--sep-bar) transparent}
.sep .sh-body::-webkit-scrollbar{width:6px}
.sep .sh-body::-webkit-scrollbar-thumb{background:var(--sep-bar);border-radius:6px}
.sep .sh-body::-webkit-scrollbar-track{background:transparent}
/* The identity strip rides with the title bar: six fields, two rows of three,
   pinned. It names what every figure below it is about, so it must not scroll
   away from them. */
.sep .sh-pin{flex:none;border-bottom:1px solid var(--sh-rule)}
.sep .sh-id{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin:0;padding:6px 18px;background:var(--sh-paper)}
@media(max-width:640px){.sep .sh-id{grid-template-columns:repeat(2,1fr)}
}
.sep .sh-id .f{border:1px solid var(--pms-line);border-radius:6px;padding:3px 8px;background:var(--sh-tint);
      display:flex;align-items:baseline;gap:7px;min-width:0}
.sep .sh-id .f .l{font-size:8px;text-transform:uppercase;letter-spacing:.05em;color:var(--sh-mut);font-weight:700;
      flex:none;white-space:nowrap}
.sep .sh-id .f .v{font-size:11px;font-weight:600;color:var(--sh-ink);line-height:1.5;margin-left:auto;
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}
.sep .sh-h{font-size:11.5px;font-weight:700;color:var(--sh-ink);margin:12px 0 6px;padding-bottom:4px;border-bottom:1.5px solid var(--sh-ink);display:flex;justify-content:space-between;align-items:baseline}
.sep .sh-h span{font-size:10px;font-weight:500;color:var(--sh-mut)}
.sep table.sh-t{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed}
.sep table.sh-t th, .sep table.sh-t td{border:1px solid var(--sh-rule);padding:5px 7px;vertical-align:middle;
  overflow-wrap:break-word;word-break:normal}
/* table-layout:fixed reads its widths from the FIRST row, so they are declared
   on the colgroup rather than on the tds — otherwise all six columns come out
   equal and the KPI text paints over the Commitment column. */
/* PROPORTIONS, NOT PIXELS. Fixed widths meant every pixel the table gained
   went to the ONE column with no width of its own — KPI — so on a wide screen
   and on paper the sheet read as one fat column beside five thin ones, with
   Target, Achievement, Ach. % and Status crowded into a third of the table.
   Percentages make all six grow together, and the table fills whatever width
   it is given: 1040px in the popup, 190mm of A4 on paper.
   They total 57%; the KPI column has no rule and takes the remaining 43%. */
.sep table.sh-t col.w-n{width:5%}
.sep table.sh-t col.w-c{width:17%}
.sep table.sh-t col.w-a{width:16%}
.sep table.sh-t col.w-p{width:8%}
.sep table.sh-t col.w-s{width:11%}
.sep table.sh-t th{background:var(--sh-head);font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:var(--sh-ink-2);text-align:center}
.sep table.sh-t td.n{text-align:center;color:var(--sh-mut);font-variant-numeric:tabular-nums}
.sep table.sh-t td.k{text-align:left;line-height:1.3}
.sep table.sh-t td.c{text-align:center;color:var(--sh-ink-2);line-height:1.3}
.sep table.sh-t td.a{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
/* The FIGURE must not wrap — a rupee amount broken across two lines is
   unreadable — but its sub-line is prose and has to. 'HR attendance not
   uploaded' inherited the nowrap, could not fit 100px, and stretched the
   column across the two beside it. */
.sep table.sh-t td.a .sub2{white-space:normal;line-height:1.25;font-weight:400}
.sep table.sh-t td.p{text-align:right;font-variant-numeric:tabular-nums}
.sep table.sh-t td.s{text-align:center;font-size:9px;font-weight:700;letter-spacing:.04em}
/* The four bands of the signed matrix: green -> yellow -> amber -> red, plus a
   neutral for a commitment whose file has said nothing. Values live in the
   --sh-* palette on .sep .sheet, which the print block resets to the light set
   so the bands come off the printer as the paper colours they always were. */
.sep .sh-ok{background:var(--sh-ok-bg);color:var(--sh-ok-fg)}
.sep .sh-warn{background:var(--sh-warn-bg);color:var(--sh-warn-fg)}
.sep .sh-amber{background:var(--sh-amber-bg);color:var(--sh-amber-fg)}
.sep .sh-bad{background:var(--sh-bad-bg);color:var(--sh-bad-fg)}
.sep .sh-na{background:var(--sh-na-bg);color:var(--sh-mut)}
/* the old names, still read by the verdict block above the table */
.sep .sh-near{background:var(--sh-warn-bg);color:var(--sh-warn-fg)}
.sep .sh-miss{background:var(--sh-amber-bg);color:var(--sh-amber-fg)}
/* Ach. % carries the same band as the Status beside it, so either column can
   be read on its own */
.sep table.sh-t td.p{font-weight:700}
/* ---- the two-way document ---- */
@media(min-width:1px){.sep .sh-id{grid-template-columns:repeat(3,1fr)}
}
.sep .sh-id .f .v .vs{display:inline;font-size:9px;font-weight:400;color:var(--sh-mut);margin-left:5px}
/* pinned with the identity: the recommendation is the one thing the sheet
   exists to deliver, and it should stay in view over the detail that
   justifies it */
.sep .sh-verdict{display:grid;grid-template-columns:auto 1fr auto;gap:16px;align-items:center;
     border-left:5px solid var(--sh-rule);border-top:1px solid var(--sh-rule);border-radius:0;
     padding:6px 18px;margin:0;background:var(--sh-tint)}
.sep .sh-verdict.v-good{border-left-color:var(--sh-good-line)}
.sep .sh-verdict.v-warn{border-left-color:var(--sh-warn-line)}
.sep .sh-verdict.v-bad{border-left-color:var(--sh-bad-line)}
@media(max-width:760px){.sep .sh-verdict{grid-template-columns:1fr}
}
.sep .sh-verdict .l{font-size:8.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--sh-mut);font-weight:700}
.sep .sh-verdict .sc{text-align:center;padding-right:14px;border-right:1px solid var(--sh-rule)}
@media(max-width:760px){.sep .sh-verdict .sc{border-right:0;border-bottom:1px solid var(--sh-rule);padding:0 0 8px;text-align:left}
}
.sep .sh-verdict .big{font-size:23px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.sep .sh-verdict .big span{font-size:14px}
.sep .sh-verdict .h{font-size:13.5px;font-weight:700;color:var(--sh-ink);margin-top:1px}
.sep .sh-verdict .w{font-size:10.5px;color:var(--sh-ink-2);margin-top:1px;line-height:1.45}
.sep .sh-verdict .vm{font-size:10px;color:var(--sh-ink-2);line-height:1.5;white-space:nowrap}
.sep .sh-verdict .vm b{font-weight:700;color:var(--sh-ink)}
.sep .sh-2col{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}
@media(max-width:760px){.sep .sh-2col{grid-template-columns:1fr;gap:4px}
}
.sep .sh-sub{font-size:10px;font-weight:700;color:var(--sh-ink-2);margin:2px 0 5px;display:flex;gap:7px;align-items:baseline}
.sep .sh-sub em{font-style:normal;font-weight:400;font-size:9.5px;color:var(--sh-mut)}
.sep .sh-note{font-size:10.5px;color:var(--sh-ink-2);background:var(--sh-tint);border:1px solid var(--sh-rule);border-radius:8px;padding:6px 9px;margin-top:6px}
.sep .sh-note b{color:var(--sh-ink)}
.sep table.sh-t .sub2{font-size:9px;color:var(--sh-mut);margin-top:1px;font-weight:400}
.sep table.sh-t.stake td.k{text-align:left}
.sep table.sh-t.stake td.a{width:104px}
.sep table.sh-t.stake tr.tot td{background:var(--sh-head);font-weight:800;color:var(--sh-ink)}
.sep table.sh-t.act td.g{width:88px;text-align:center}
.sep table.sh-t.act td.k{text-align:left;font-size:10.5px}
.sep .tag{display:inline-block;font-size:8.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;
     border-radius:4px;padding:2px 6px}
.sep .tag.t-good{background:var(--sh-ok-bg);color:var(--sh-ok-fg)}
.sep .tag.t-warn{background:var(--sh-warn-bg);color:var(--sh-warn-fg)}
.sep .tag.t-bad{background:var(--sh-amber-bg);color:var(--sh-amber-fg)}
.sep .sh-none{font-size:10.5px;color:var(--sh-mut);padding:9px 2px;font-style:italic}
/* ---- the conversation: a headline, then one card per gap ---- */
.sep .sh-lede{display:flex;align-items:center;gap:16px;background:var(--sh-tint);border:1px solid var(--sh-rule);
         border-radius:10px;padding:10px 15px;margin-bottom:9px}
.sep .sh-lede .ld-n{font-size:26px;font-weight:800;line-height:1;color:var(--sh-amber-fg);font-variant-numeric:tabular-nums;flex:none}
.sep .sh-lede .ld-t{font-size:11px;color:var(--sh-ink-2);line-height:1.55}
.sep .sh-lede b{color:var(--sh-ink);font-weight:700}
.sep .gaps{display:grid;grid-template-columns:1fr 1fr;gap:8px}
@media(max-width:820px){.sep .gaps{grid-template-columns:1fr}
}
.sep .gap{border:1px solid var(--sh-rule);border-radius:9px;padding:7px 10px 8px;background:var(--sh-paper);break-inside:avoid}
.sep .gap .gh{display:flex;align-items:center;gap:7px;margin-bottom:3px}
.sep .gap .gn{width:17px;height:17px;border-radius:5px;background:var(--sh-head);color:var(--sh-accent);font-size:9.5px;
         font-weight:800;display:flex;align-items:center;justify-content:center;flex:none}
.sep .gap .gt{font-size:11px;font-weight:700;color:var(--sh-ink);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sep .gap .gs{font-size:9.5px;color:var(--sh-mut);margin-left:auto;white-space:nowrap;flex:none}
.sep .gap .gw{font-size:11.5px;font-weight:800;color:var(--sh-amber-fg);font-variant-numeric:tabular-nums;flex:none;min-width:56px;text-align:right}
.sep .gap .gb{font-size:10.5px;color:var(--sh-ink-2);line-height:1.5}
.sep .gap .ga{font-size:10.5px;color:var(--sh-ink);line-height:1.5;margin-top:3px;padding-top:3px;border-top:1px dashed var(--sh-rule-2)}
.sep .gap .ga b{color:var(--sh-accent)}
.sep .sh-ask{font-size:10.5px;color:var(--sh-ink-2);line-height:1.6;background:var(--sh-tint);border:1px solid var(--sh-rule);
        border-radius:9px;padding:8px 11px;margin-top:9px}
.sep .sh-ask b{color:var(--sh-ok-fg)}
/* ---- the tick lists: a record, kept compact ---- */
.sep .chk{font-size:10.5px}
.sep .chk.two{columns:2;column-gap:26px}
@media(max-width:640px){.sep .chk.two{columns:1}
}
.sep .chk.two label{break-inside:avoid}
.sep .chk.big{font-size:11.5px}
.sep .chk.big label{padding:4px 0}
.sep .chk.big input{width:15px;height:15px}
.sep .chk label em{font-style:normal;font-size:9.5px;color:var(--sh-mut);margin-left:5px}
.sep .chk label{display:flex;gap:6px;align-items:center;padding:1.5px 0;color:var(--sh-ink-2);cursor:pointer;line-height:1.35}
.sep .chk label:hover{color:var(--sh-ink)}
.sep .chk input{accent-color:var(--sh-brand);width:13px;height:13px;flex:none;cursor:pointer}
.sep .chk span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sep .chk.train label{cursor:default}
.sep .chk.train input{accent-color:var(--sh-good-line)}
.sep .chk.train b{margin-left:auto;font-size:9px;color:var(--sh-mut);font-weight:600;flex:none;padding-left:8px}
.sep .sh-set{font-size:10px;color:var(--sh-mut);margin:-3px 0 7px;display:flex;align-items:center;gap:5px}
.sep .sh-set b{color:var(--sh-brand);font-weight:600}
.sep .sh-decl{font-size:10.5px;color:var(--sh-ink-2);line-height:1.65;background:var(--sh-tint);border:1px solid var(--sh-rule);border-radius:8px;padding:9px 11px;margin-top:6px}
.sep .sh-score{display:flex;align-items:center;gap:12px;background:var(--sh-tint);border:1px solid var(--sh-rule);border-radius:10px;padding:9px 13px;margin-bottom:4px}
.sep .sh-score .big{font-size:27px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.sep .sh-score .lbl{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--sh-mut);font-weight:700}
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

   PORTRAIT, and one thing prints: the SIGNED MATRIX. The report itself used to
   print too — landscape, its thirty-one columns cut into stacked blocks — and
   that option is gone (see the note on the report's action bar). What is left
   is a document: A4 portrait, a page a reader can file and sign, and every
   figure at a size a printer resolves.
   ------------------------------------------------------------------------ */
@media print{
  @page{size:A4 portrait;margin:11mm 10mm}
  html,body{height:auto !important;overflow:visible !important;background:#fff !important}

  /* ONE BLOCK PRINTS, and it is done with VISIBILITY rather than display:
     display:none on an ancestor cannot be undone by a descendant, so hiding
     the app shell and then "showing" a block deep inside it printed a blank
     page. Visibility can be turned back on further down the tree, and the
     block is lifted to the top-left so the hidden-but-present layout around it
     does not push it off the paper. */
  body.sep-printing *{visibility:hidden !important}
  body.sep-printing .sep-print-area,
  body.sep-printing .sep-print-area *{visibility:visible !important}
  body.sep-printing .sep-hide-print,
  body.sep-printing .sep-hide-print *{visibility:hidden !important}

  body.sep-printing .sep-print-area{
    position:absolute !important;left:0;top:0;width:100% !important;max-width:none !important;
    margin:0 !important;border:0 !important;box-shadow:none !important;border-radius:0 !important;
    max-height:none !important;height:auto !important;overflow:visible !important}

  /* the modal's own chrome has nothing to do with the paper */
  body.sep-printing .sep .mask{position:static !important;background:none !important;
    padding:0 !important;backdrop-filter:none !important;display:block !important;overflow:visible !important}

  /* The sheet is a scrolling panel on screen: a fixed viewport height, a body
     that scrolls inside it, and overflow:hidden to keep the rounded corners.
     ALL THREE HAVE TO GO, and the overflow above all — a document taller than
     one page was being clipped at the bottom of page one. */
  body.sep-printing .sep .sheet{max-height:none !important;height:auto !important;
    display:block !important;overflow:visible !important;border-radius:0 !important}
  body.sep-printing .sep .sh-body{overflow:visible !important;max-height:none !important;
    padding:0 !important}
  /* nothing pins on paper — there is no scrolling to pin against */
  body.sep-printing .sep .sh-pin{position:static !important;border-bottom:1px solid #9fc0df}

  /* PAPER IS STILL WHITE. The sheet's palette flips with the theme so the
     popup is readable on a dark screen, but a printer has no dark mode: the
     light set is declared straight back on, so an engineer's signed matrix
     comes off the tray identical whichever theme it was printed from — and
     no printer is asked to lay down a full-bleed dark ground. */
  body.sep-printing .sep .sheet{
    --sh-paper:#fff;  --sh-tint:#f7fbff;  --sh-head:#e8f3fc;  --sh-card:#fbfdff;
    --sh-rule:#9fc0df; --sh-rule-2:#cfe0ef;
    --sh-ink:#111827; --sh-ink-2:#374151; --sh-mut:#6b7280;
    --sh-accent:#23255f; --sh-brand:#2f3192;
    --sh-shadow:none;
    --sh-ok-bg:#cdeccd;    --sh-ok-fg:#12401f;
    --sh-b-bg:#d8eecf;     --sh-b-fg:#2b4a17;
    --sh-warn-bg:#fbf0bd;  --sh-warn-fg:#4a3c05;
    --sh-amber-bg:#fbd9b5; --sh-amber-fg:#6b3405;
    --sh-bad-bg:#f8c7c7;   --sh-bad-fg:#7a1d1d;
    --sh-na-bg:#eef1f4;
    --sh-good-line:#0ca30c; --sh-warn-line:#fab219; --sh-bad-line:#d03b3b;
    --sh-pt-ok-line:#2f8f3f;   --sh-pt-ok-bg:#f6fcf6;
    --sh-pt-near-line:#c9a227; --sh-pt-near-bg:#fffdf4;
    --sh-pt-miss-line:#c0561f; --sh-pt-miss-bg:#fff9f5;
    --sh-pt-na-line:#9aa5b1;   --sh-pt-na-bg:#fafbfc;
    --sh-score-ok:#12401f; --sh-score-b:#3f7a2e;
    --sh-score-warn:#4a3c05; --sh-score-bad:#6b3405;
    background:#fff !important;color:#111827 !important;font-size:9pt}

  /* ---- the letterhead band ------------------------------------------------
     A GRADIENT IS NOT A PRINT ASSET: laser and inkjet both band it, and it
     covers the head of the page in toner to no purpose. Flattened to the brand
     colour, which is what identifies the sheet, at the height the title needs
     and no more. */
  body.sep-printing .sep .sheet .sh-top{background:#2f3192 !important;padding:7px 12px !important;
    break-inside:avoid}
  body.sep-printing .sep .sheet .sh-top h2{font-size:11.5pt;line-height:1.2}
  body.sep-printing .sep .sheet .sh-top .s2{font-size:7.5pt;color:rgba(255,255,255,.86) !important}

  /* ---- the identity strip and the verdict --------------------------------
     Six fields over two rows, then the recommendation. Both are the top of the
     document and neither may be split by a page break. */
  body.sep-printing .sep .sh-id{padding:6px 12px !important;gap:4px}
  body.sep-printing .sep .sh-id .f{padding:2px 6px}
  body.sep-printing .sep .sh-id .f .l{font-size:6pt}
  /* ON PAPER A NAME MAY NOT BE CUT. The screen ellipsizes these six values to
     hold the strip to one line each; the printed sheet is signed by the person
     the first of them names, so they wrap instead. */
  body.sep-printing .sep .sh-id .f{align-items:flex-start}
  body.sep-printing .sep .sh-id .f .v{font-size:8pt;white-space:normal;overflow:visible;
    text-overflow:clip;text-align:right}
  body.sep-printing .sep .sh-id .f .v .vs{font-size:6.8pt}
  body.sep-printing .sep .sh-verdict{padding:6px 12px !important;gap:11px;break-inside:avoid}
  body.sep-printing .sep .sh-verdict .l{font-size:6.4pt}
  body.sep-printing .sep .sh-verdict .big{font-size:17pt}
  body.sep-printing .sep .sh-verdict .big span{font-size:10pt}
  body.sep-printing .sep .sh-verdict .h{font-size:10pt}
  body.sep-printing .sep .sh-verdict .w{font-size:7.6pt;line-height:1.38}
  body.sep-printing .sep .sh-verdict .vm{font-size:7.2pt;line-height:1.42}

  /* ---- the matrix itself -------------------------------------------------
     The one table on the page, so it gets the width there is. A heading never
     ends a page (break-after:avoid), a row is never split, and the head repeats
     if the nine commitments do run over. */
  body.sep-printing .sep .sh-h{font-size:8.6pt;margin:9px 0 4px;break-after:avoid}
  body.sep-printing .sep .sh-h span{font-size:7pt}
  body.sep-printing .sep table.sh-t{font-size:8pt}
  body.sep-printing .sep table.sh-t th,
  body.sep-printing .sep table.sh-t td{padding:3px 5px}
  body.sep-printing .sep table.sh-t th{font-size:6.6pt}
  body.sep-printing .sep table.sh-t td.s{font-size:6.8pt}
  body.sep-printing .sep table.sh-t .sub2{font-size:6.6pt;line-height:1.25}
  body.sep-printing .sep table.sh-t thead{display:table-header-group}
  body.sep-printing .sep table.sh-t tr{break-inside:avoid}

  /* ---- the four points --------------------------------------------------- */
  body.sep-printing .sep .pts{grid-template-columns:1fr 1fr;gap:6px}
  body.sep-printing .sep .pt{padding:5px 8px;border-radius:6px;break-inside:avoid}
  body.sep-printing .sep .pt-l{font-size:7.2pt}
  body.sep-printing .sep .pt-n{font-size:13pt}
  body.sep-printing .sep .pt-s{font-size:6.8pt}
  body.sep-printing .sep .pt-b{font-size:7.6pt;line-height:1.42;margin-top:3px}

  /* ---- the lines that get signed ---------------------------------------- */
  body.sep-printing .sep .sh-sign{display:block !important;break-inside:avoid;margin-top:12px}
  body.sep-printing .sep .sh-sign-p{font-size:7.6pt;color:#374151;margin:0 0 6px;line-height:1.45}
  /* ~9mm of blank paper above each rule: a signature needs room, and a line
     tucked under the paragraph gets signed over the text above it */
  body.sep-printing .sep .sh-sign-g{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;
    margin-top:34px}
  body.sep-printing .sep .sh-sign-g .sl-line{border-top:1px solid #111827;margin-bottom:3px}
  body.sep-printing .sep .sh-sign-g .sl-l{font-size:7.6pt;font-weight:700;color:#111827}
  body.sep-printing .sep .sh-sign-g .sl-s{font-size:6.8pt;color:#6b7280}
  body.sep-printing .sep .sh-sign-g .sl-d{font-size:6.8pt;color:#6b7280;margin-top:9px;
    border-top:1px dotted #9ca3af;padding-top:2px;width:74%}
  body.sep-printing .sep .sh-sign-f{font-size:6.4pt;color:#6b7280;margin-top:12px;
    border-top:1px solid #cfe0ef;padding-top:4px}

  body.sep-printing *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
}
`;

export default SE_PERFORMANCE_CSS;
