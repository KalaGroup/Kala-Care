import{j as n}from"./vendor-chartjs-DaFCGlIH.js";import{r as j,f as rn}from"./vendor-react-Chjj6F22.js";import{z as sn,c as on}from"./index-DkMADeU1.js";import{F as ln}from"./ClipboardDocumentCheckIcon-DgJRjGaE.js";import{F as dn}from"./CalendarDaysIcon-DNAH6L5_.js";import{F as cn}from"./ChevronLeftIcon-DwLoINbK.js";import{F as pn}from"./ChevronRightIcon-D8gfkhLp.js";const hn=`/* ============================================================================
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
`,Se=(e,t,r)=>{for(const[a,s]of t)if(e>=a)return s;return r},Ne=[{no:1,key:"sr",perMonth:!0,name:"CSP/PW BD/CM together Min SR Count",short:"SR Count",head:"SR Count",unit:"count",fmt:"int",target:60,dir:"min",commit:"Minimum 60 SR’s",hint:"UW / Bandhan / PM / CM / BD",agg:"sum",sec:"vol",band:(e,t)=>Se(t,[[60*f.months,"ok"],[55*f.months,"warn"],[50*f.months,"amber"]],"amber")},{no:null,sortNo:1.5,key:"prod",name:"Productivity — SR Close per Working Day",short:"Productivity",head:"Productivity",unit:"SR / working day",fmt:"rate2",target:null,dir:null,commit:"MaxTTR close SR ÷ working days",hint:"MaxTTR close SR ÷ available man-days",agg:"derived",sec:"vol",info:!0,derive:e=>e.workSr&&e.maxSr!=null?e.maxSr/Math.round(e.workSr):null},{no:2,key:"spare",perMonth:!0,name:"Spare Parts Sales / Month",short:"Spare Sales",head:"Spare Sales",unit:"₹",fmt:"amt",target:15e4,dir:"min",commit:"Minimum ₹1,50,000",hint:"LMS part invoice on his converted leads",agg:"sum",sec:"rev",band:(e,t)=>Se(t,[[15e4*f.months,"ok"],[1e5*f.months,"warn"]],"amber")},{no:3,key:"labour",perMonth:!0,name:"Labour Revenue Generation / Month",short:"Labour Rev.",head:"Labour Rev.",unit:"₹",fmt:"amt",target:6e4,dir:"min",commit:"Minimum ₹60,000",hint:"LMS labour invoice on his converted leads",agg:"sum",sec:"rev",band:(e,t)=>Se(t,[[6e4*f.months,"ok"],[55e3*f.months,"warn"],[5e4*f.months,"amber"]],"amber")},{no:4,key:"amcLead",perMonth:!0,name:"AMC Lead Generation / Month",short:"AMC Generation",head:"AMC Generation",unit:"count",fmt:"int",target:3,dir:"min",commit:"Minimum 3 Leads",hint:"LMS leads, category AMC",agg:"sum",sec:"lead",band:(e,t)=>Se(t,[[3*f.months,"ok"],[2*f.months,"warn"]],"amber")},{no:5,key:"battery",perMonth:!0,name:"Battery Sell / Month",short:"Battery",head:"Battery",unit:"count",fmt:"int",target:3,dir:"min",commit:"Minimum 3 Batteries",hint:"part-sale battery quantity",agg:"sum",sec:"lead",band:(e,t)=>Se(t,[[3*f.months,"ok"],[2*f.months,"warn"]],"amber")},{no:6,key:"first",name:"First Site Reporting Daily",short:"1st Site <10 AM",head:"1st Site",unit:"clock time",fmt:"time",target:600,dir:"under",commit:"Before 10:00 AM",hint:"average time his first site of the day started",agg:"avg",sec:"disc",band:(e,t)=>t==null?"na":t<=600?"ok":t<=630?"warn":"amber"},{no:7,key:"sfTask",name:"Salesforce Task Closure Daily",short:"SF Task Closure",head:"SF Task",unit:"%",fmt:"pct",target:100,dir:"min",commit:"Before Leaving Site",hint:"closed the same day it was allocated",agg:"avg",sec:"disc",band:(e,t)=>t>=100?"ok":"amber"},{no:9,key:"attend",name:"Attendance & Discipline",short:"Attendance",head:"Attendance",unit:"%",fmt:"pct",target:95,dir:"min",commit:"Minimum 95%",hint:"days present ÷ working days",agg:"avg",sec:"disc"},{no:8,key:"cdi",name:"Customer Satisfaction — CDI",short:"CDI %",head:"CDI",unit:"%",fmt:"pct",target:90,dir:"min",commit:"Minimum 90%",hint:"(promotor − detractor) ÷ all feedback",agg:"avg",sec:"qual",band:(e,t)=>Se(t,[[90,"ok"],[80,"warn"]],"amber")}];Ne.forEach(e=>{e.sortNo===void 0&&(e.sortNo=e.no)});const Y=Ne.filter(e=>!e.info),He=[["Uniform","Uniform issued"],["ID card","ID card issued"],["PPE set","PPE set — helmet, gloves, safety shoes"],["Tool kit","Tool kit issued"],["Measuring instruments","Measuring instruments issued"],["eFSR app access","Mobile / eFSR app access"],["Travel & conveyance","Travel & conveyance support"],["Coordinator support","Coordinator / back-office support"]],Te=["Uniform, ID Card & PPE Usage at all times","Proper Tool Kit Availability","Machine Health Check During Every Visit","Promote Spare Parts, Batteries, Coolant, Filters & AMC","Explain Work Done and Site Status to Customer","Maintain Professional Behaviour & Safety Standards","No Repeat Complaints Due to Poor Workmanship","Timely Response to Coordinator and Customer Communication"],Ee=["Warranty","PW","AMC","KOEL AMC","CSP","Others"],et=["Filters","Battery","Coolant","K-Oil","DEF","Spares","Others"],mn={sr:["LkVA","MkVA","HkVA","Industrial","CPCB","BS V","BSIV","CRDI","Engine","R550","K4300","Power Car","Bio Gas"],cdi:["Brand Ambassador"],spare:["Brand Ambassador","KCC"],labour:["LkVA","MkVA","HkVA","Industrial","CPCB"],amcLead:["Brand Ambassador"],battery:["Inverter","Jump Start","KCC"],first:null,sfTask:null,attend:null},un={MH:"Maharashtra",KA:"Karnataka"},ft=e=>{const t=/_(\d+)\s*$/.exec(String(e||""));return t?+t[1]:9999},jt=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],St=864e5,L=e=>new Date(e+"T00:00:00"),$e=e=>`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,"0")}-${String(e.getDate()).padStart(2,"0")}`,ge=(e,t)=>{const r=L(e);return r.setDate(r.getDate()+t),$e(r)},fn=(e,t)=>Math.round((L(t)-L(e))/St)+1,We=(e,t)=>new Date(e,t+1,0).getDate(),bn=(e,t)=>{let r=0;const a=We(e,t);for(let s=1;s<=a;s++)new Date(e,t,s).getDay()===0&&r++;return r},f={from:"",to:"",gran:"day",months:1,wd:{months:{},universal:{}},dataMax:"",amcMonths:null,battMonths:null,attMonths:[],targets:Object.fromEntries(Ne.map(e=>[e.key,Array.isArray(e.target)?e.target.slice():e.target])),weights:Object.fromEntries(Ne.map(e=>[e.key,1]))};function $t(e,t,r){const a=`${t}-${String(r+1).padStart(2,"0")}`,s=String(e).toUpperCase()==="KA"?"ka":"mh",l=f.wd.months[a]||f.wd.universal[String(r+1).padStart(2,"0")],d=l&&l[s]||We(t,r)-bn(t,r),o=We(t,r);if(!f.dataMax||!o)return Math.round(d);const c=L(f.dataMax),h=c.getFullYear(),$=c.getMonth();return t<h||t===h&&r<$?Math.round(d):t>h||t===h&&r>$?0:Math.round(d*(c.getDate()/o))}function gn(e){if(!e)return[null,null];const t=Object.create(null),r=Object.create(null);for(const[a,s]of Object.entries(e)){t[a]=s;const l=a.slice(0,7),d=r[l]||(r[l]=[0,0]);d[0]+=s[0],d[1]+=s[1]}return[t,r]}function xn(e,t,r){if(!e.convDay)return null;const a=[0,0];for(let s=t;s&&s<=r;s=ge(s,1)){const l=e.convDay[s];l&&(a[0]+=l[0],a[1]+=l[1])}return a}const bt=(e,t)=>e.convDay&&e.convDay[t]||[0,0],vn=(e,t)=>e.convMonth&&e.convMonth[t]||[0,0];function wn(e){if(!e)return[null,null];const t=Object.create(null),r=Object.create(null);for(const[a,s]of Object.entries(e)){if(!Array.isArray(s)||s.length<2)continue;const l=Number(s[0]),d=Number(s[1]);if(!isFinite(l)||!isFinite(d))continue;t[a]=[l,d];const o=a.slice(0,7),c=r[o]||(r[o]=[0,0]);c[0]+=l,c[1]+=d}return[t,r]}function kn(e){if(!e)return[null,null];const t=Object.create(null),r=Object.create(null);for(const[a,s]of Object.entries(e)){t[a]=(t[a]||0)+s;const l=a.slice(0,7);r[l]=(r[l]||0)+s}return[t,r]}function yn(e){if(!e)return[null,null];const t=Object.create(null),r=Object.create(null);for(const[a,s]of Object.entries(e)){t[a]=s;const l=a.slice(0,7),d=r[l]||(r[l]=[0,0]);d[0]+=s[0],d[1]+=s[1]}return[t,r]}const gt=(e,t)=>e.lbDay&&e.lbDay[t]||[0,0],Nt=(e,t)=>e.lbMonth&&e.lbMonth[t]||[0,0],Mt=(e,t)=>e?e.includes(t):!0,jn=e=>Mt(f.amcMonths,e),Sn=e=>Mt(f.battMonths,e);function $n(e,t){let r=0,a=0,s=!1,l=!1;for(const d of t){const o=`${d.y}-${String(d.m+1).padStart(2,"0")}`,c=Nt(e,o);r+=c[0],a+=c[1],jn(o)&&(s=!0),Sn(o)&&(l=!0)}return[s?r:null,l?a:null]}function Nn(e){if(!e)return[null,null];const t=Object.create(null),r=Object.create(null);for(const[a,s]of Object.entries(e)){t[a]=s;const l=a.slice(0,7),d=r[l]||(r[l]=[0,0,0,0,0]);for(let o=0;o<5;o++)d[o]+=s[o]||0}return[t,r]}function Mn(e,t,r){if(!e.efDay)return null;const a=[0,0,0,0,0];for(let s=t;s&&s<=r;s=ge(s,1)){const l=e.efDay[s];if(l)for(let d=0;d<5;d++)a[d]+=l[d]||0}return a}const zn=(e,t)=>e.efDay&&e.efDay[t]||[0,0,0,0,0],Dn=(e,t)=>e.efMonth&&e.efMonth[t]||[0,0,0,0,0],Me=e=>{const t=Math.round(e),r=Math.floor(t/60)%24,a=t%60;return`${r%12===0?12:r%12}:${String(a).padStart(2,"0")} ${r<12?"AM":"PM"}`},X=(e,t)=>t?+(e/t*100).toFixed(1):null;function Tn(e){if(!e)return[null,null];const t=Object.create(null),r=Object.create(null);for(const[a,s]of Object.entries(e)){t[a]=s;const l=a.slice(0,7),d=r[l]||(r[l]=[0,0,0]);d[0]+=s[0],d[1]+=s[1],d[2]+=s[2]}return[t,r]}function En(e,t,r){if(!e.cdiDay)return null;const a=[0,0,0];for(let s=t;s&&s<=r;s=ge(s,1)){const l=e.cdiDay[s];l&&(a[0]+=l[0],a[1]+=l[1],a[2]+=l[2])}return a}const On=(e,t)=>e.cdiDay&&e.cdiDay[t]||[0,0,0],Rn=(e,t)=>e.cdiMonth&&e.cdiMonth[t]||[0,0,0],xe=e=>{const t=e[0]+e[1]+e[2];return t?+((e[0]-e[1])/t*100).toFixed(1):null};function An(e,t){if(!e.te)return null;let r=0;for(const a of t){const s=`${a.y}-${String(a.m+1).padStart(2,"0")}`;r+=e.te[s]||0}return r}function Fn(e,t){if(!e.hr||t.length!==1)return null;const r=t[0];if(r.days!==r.dim)return null;const a=`${r.y}-${String(r.m+1).padStart(2,"0")}`;return a in e.hr?e.hr[a]:null}function rt(){const e=[];if(!f.from||!f.to)return e;let t=L(f.from);t=new Date(t.getFullYear(),t.getMonth(),1);const r=L(f.to);for(;t<=r&&e.length<60;){const a=t.getFullYear(),s=t.getMonth(),l=We(a,s),d=$e(new Date(a,s,1))>f.from?$e(new Date(a,s,1)):f.from,o=$e(new Date(a,s,l))<f.to?$e(new Date(a,s,l)):f.to,c=fn(d,o);if(c>0){let h=0;for(let $=L(d).getDate();$<=L(o).getDate();$++)new Date(a,s,$).getDay()===0&&h++;e.push({y:a,m:s,dim:l,from:d,to:o,days:c,f:c/l,sun:h})}t=new Date(a,s+1,1)}return e}function re(e){const t=f.targets[e.key];return e.perMonth?t*f.months:t}function be(e,t){if(e.info||t==null||!isFinite(t))return null;const r=re(e);if(e.dir==="range"){const[a,s]=r;return t>=a&&t<=s?100:t<a?a?t/a*100:0:t?s/t*100:0}return e.dir==="under"?t?r/t*100:null:r?t/r*100:0}function Pn(e,t){const r=t.v[e.key];if(r==null||!isFinite(r))return"na";if(e.band)return e.band(t,r)||"na";const a=be(e,r);return a==null?"na":a>=100?"ok":a>=85?"warn":"amber"}const Cn={ok:"MET",warn:"NEAR",amber:"SHORT",bad:"MISSED",na:"–"},zt=e=>e>=90?"A":e>=80?"B":e>=70?"C":e>=60?"D":"E";function Ln(e){let t=0,r=0;for(const a of Y){const s=+f.weights[a.key]||0;if(!s)continue;const l=be(a,e.v[a.key]);l!==null&&(t+=Math.min(100,l)*s,r+=s)}return r?+(t/r).toFixed(1):0}function In(e){let t=e>>>0||1;return()=>(t=t*1103515245+12345>>>0,(t>>>8)/16777215)}const Bn=e=>{const t=parseInt(String(e).replace(/\D/g,""),10);if(Number.isFinite(t)&&t>0)return t;let r=7;for(const a of String(e))r=r*31+a.charCodeAt(0)>>>0;return r||1};function Hn(e,t){if(!e||!e.length||!t)return[null,null];const r=Object.create(null),a=Object.create(null);for(const[s,l]of e){const d=ge(t,s);r[d]=(r[d]||0)+l;const o=d.slice(0,7);a[o]=(a[o]||0)+l}return[r,a]}function Dt(e,t,r){let a=0;for(let s=t;s&&s<=r;s=ge(s,1))a+=e[s]||0;return a}function Wn(e,t,r){return e.srDay?Dt(e.srDay,t,r):null}const Yn=(e,t)=>e.srDay&&e.srDay[t]||0,_n=(e,t)=>e.srMonth&&e.srMonth[t]||0;function Vn(e){f.wd=e.working_days||{months:{},universal:{}},f.dataMax=e.data_max||"",f.amcMonths=e.amc_months||null,f.battMonths=e.battery_months||null,f.attMonths=e.meta&&e.meta.attendance&&e.meta.attendance.months||[];const t=(e.branches||[]).map(s=>({id:s.branch_id,name:s.branch_name,region:(s.region||"MH").toUpperCase()})),r=Object.fromEntries(t.map(s=>[s.id,s])),a=(e.engineers||[]).filter(s=>r[s.branch_id]&&s.name).map((s,l)=>{const d=s.key||s.uid||`row${l}`,o=In(Bn(d)*7919+l*13),c=r[s.branch_id],[h,$]=Hn(s.sr,e.sr_base),[u,D]=kn(s.ec),[m,S]=wn(s.ea),[z,w]=gn(s.cv),[k,N]=Tn(s.cd),[v,y]=Nn(s.ef),[P,q]=yn(s.lb),x={key:d,name:ea(s.name),bid:s.branch_id,srDay:u,srMonth:D,allocDay:m,allocMonth:S,maxDay:h,maxMonth:$,hr:s.hr||null,at:s.at||null,te:s.te||null,convDay:z,convMonth:w,cdiDay:k,cdiMonth:N,efDay:v,efMonth:y,lbDay:P,lbMonth:q,uid:s.uid||"",code:s.code||"",region:c.region,branch:c.name,title:s.title||"",occupation:s.occupation||"",status:s.status||"",hired:s.hired||"",hiredSrc:s.hired_src||"",trainings:s.trainings||[],comply:Te.map(()=>o()>.16),support:Array.from({length:He.length},()=>o()>.13)};return x.v={},x});return{branches:t,ses:a}}function Gn(e){const t=rt(),r=t.reduce((w,k)=>w+k.f,0)||1,a=t.reduce((w,k)=>w+$t(e.region,k.y,k.m)*(k.days/k.dim),0),s=Fn(e,t),l=Jn(e,t),d=An(e,t),o=xn(e,f.from,f.to),c=En(e,f.from,f.to),h=Mn(e,f.from,f.to),$=$n(e,t),u=e.maxDay?Dt(e.maxDay,f.from,f.to):null,D=Wn(e,f.from,f.to),m=e.allocDay?Object.entries(e.allocDay).reduce((w,[k,N])=>k>=f.from&&k<=f.to?[w[0]+N[0],w[1]+N[1]]:w,[0,0]):null,S=m?m[0]:null,z={sr:D,spare:o?o[0]:null,labour:o?o[1]:null,amcLead:$[0],battery:$[1],first:h&&h[1]?h[4]/h[1]:null,sfTask:m&&m[0]?X(m[1],m[0]):null,cdi:c?xe(c):null,attend:s==null?null:l?+(s/l*100).toFixed(1):a?+(s/a*100).toFixed(1):null,present:s};return z.taskEnd=d,e.cdiP=c?c[0]:null,e.cdiD=c?c[1]:null,e.cdiPa=c?c[2]:null,e.cdiN=c?c[0]+c[1]+c[2]:null,e.fsOn=h?h[0]:null,e.fsDays=h?h[1]:null,e.tcOk=h?h[2]:null,e.tcN=h?h[3]:null,e.allocSr=S,e.allocClosed=m?m[1]:null,e.firstAvgMin=z.first,e.firstAvg=e.firstAvgMin==null?null:Me(e.firstAvgMin),z.work=a,z.workSr=a,z.presentSr=s,z.maxSr=u,z.prod=u==null||!a?null:+(u/Math.round(a)).toFixed(2),{v:z,months:r,work:a,present:s,taskEnd:d}}function Kn(e,t,r){return f.from=t,f.to=r,f.months=rt().reduce((a,s)=>a+s.f,0)||1,e.forEach(a=>{const s=Gn(a);a.v=s.v,a.workDays=s.work,a.present=s.present,a.taskEnd=s.taskEnd,a.score=Ln(a),a.grade=zt(a.score)}),e}function Un(e){const t={};for(const a of Ne){if(a.agg==="derived")continue;const s=e.map(l=>l.v[a.key]).filter(l=>l!=null&&isFinite(l));if(!s.length){t[a.key]=null;continue}a.agg==="sum"?t[a.key]=s.reduce((l,d)=>l+d,0):t[a.key]=+(s.reduce((l,d)=>l+d,0)/s.length).toFixed(2)}t.present=e.reduce((a,s)=>a+(s.present||0),0),t.work=e.reduce((a,s)=>a+(s.workDays||0),0),t.taskEnd=e.some(a=>a.taskEnd!=null)?e.reduce((a,s)=>a+(s.taskEnd||0),0):null,t.maxSr=e.some(a=>a.v.maxSr!=null)?e.reduce((a,s)=>a+(s.v.maxSr||0),0):null,t.workSr=e.reduce((a,s)=>a+(s.v.maxSr!=null&&s.workDays||0),0),t.presentSr=e.reduce((a,s)=>a+(s.v.sr!=null&&s.present||0),0);for(const a of Ne){if(a.agg!=="derived")continue;const s=e.length?a.derive(t):null;t[a.key]=s==null||!isFinite(s)?null:+s.toFixed(2)}const r=e.length?+(e.reduce((a,s)=>a+s.score,0)/e.length).toFixed(1):0;return{v:t,score:r,grade:zt(r),n:e.length,workDays:e.reduce((a,s)=>a+(s.workDays||0),0),present:t.present}}const Ye=e=>e!=null&&Number.isFinite(+e),ve="–",ce={P:{lab:"Present",tag:"P",cls:"atc-p",worth:1},O:{lab:"Outdoor Duty",tag:"OD",cls:"atc-p",worth:1},H:{lab:"Half Day",tag:"½",cls:"atc-h",worth:.5},L:{lab:"Leave",tag:"L",cls:"atc-a",worth:0},A:{lab:"Absent",tag:"A",cls:"atc-a",worth:0},W:{lab:"Weekly Off",tag:"WO",cls:"atc-o",worth:null},C:{lab:"C Off",tag:"CO",cls:"atc-o",worth:null},Y:{lab:"Holiday",tag:"HO",cls:"atc-o",worth:null},"-":{lab:"No data",tag:ve,cls:"atc-n",worth:null}},qe=e=>e==null||!isFinite(e)?ve:String(+(+e).toFixed(2)),qn=["P","O","H","L","A","W","C","Y","-"];function Jn(e,t){if(!e.at)return 0;let r=0;for(const a of t){const s=e.at[`${a.y}-${String(a.m+1).padStart(2,"0")}`];if(s)for(const l of s){const d=ce[l];d&&d.worth!==null&&(r+=1)}}return r}function Qn(e,t){const r=e&&e.at&&e.at[t];if(!r)return null;const a=[],s={};let l=0;for(let o=0;o<r.length;o++){const c=ce[r[o]]?r[o]:"-",h=ce[c],$=new Date(`${t}-01T00:00:00`);$.setDate(o+1),a.push({d:o+1,iso:`${t}-${String(o+1).padStart(2,"0")}`,dow:$.toLocaleDateString("en-GB",{weekday:"short"}),sunday:$.getDay()===0,code:c,...h}),s[c]=(s[c]||0)+1,h.worth&&(l+=h.worth)}const d=o=>s[o]||0;return{month:t,days:a,counts:s,worked:+l.toFixed(2),lost:d("L")+d("A"),off:d("W")+d("C")+d("Y"),nodata:d("-")}}const Tt=e=>Ye(e)?Math.round(e).toLocaleString("en-IN"):ve,B=Tt,ne=e=>Ye(e)?(e/1e5).toFixed(2):ve,Be=e=>Ye(e)?e.toFixed(1):ve,H=e=>Ye(e)?Number.isInteger(+(+e).toFixed(2))?String(+(+e).toFixed(2)):(+e).toFixed(2):ve;function Et(e,t){if(t==null||t===0)return"–";switch(e.fmt){case"amt":return`₹${Tt(t)}`;case"pct":return`${t.toFixed(1)}%`;case"rate":return t.toFixed(1);case"rate2":return`${H(t)} SR/working day`;case"hrs":return t.toFixed(2);case"time":return Me(t);default:return Math.round(t).toLocaleString("en-IN")}}const ie=e=>e?L(e).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"2-digit"}):"",Xn=e=>String(e).replace(/%/g,"").replace(/₹/g,"").replace(/ h$/,"").replace(/ SR\/day/,"").trim(),Zn=e=>e.dir==="range"?`${f.targets[e.key][0]}–${f.targets[e.key][1]}`:Xn(Et(e,re(e))),fe=e=>/^0(\.0+)?%?$/.test(String(e).replace(/<[^>]*>/g,"").trim())?"–":e,tt=e=>String(e).replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&"),ea=e=>String(e||"").trim().replace(/\s+/g," ").toLowerCase().replace(/(^|[\s\-'./])([a-zÀ-ɏ])/g,(t,r,a)=>r+a.toUpperCase()),xt=(e,t,r)=>`${e} ${e===1?t:`${t}s`}`,vt=e=>e?`${jt[+e.slice(5,7)-1]} ${e.slice(0,4)}`:"—";function ta(e){if(!e.hired)return null;const t=(L(f.to)-L(e.hired))/(365.25*St);return!isFinite(t)||t<0?null:{from:e.hired,years:t,src:e.hiredSrc,label:t>=1?`${t.toFixed(1)} yrs`:`${Math.round(t*12)} mo`}}const na=e=>{let t=e>>>0||1;return()=>(t=t*1103515245+12345>>>0,(t>>>8)/16777215)},aa=e=>{const t=parseInt(String(e).replace(/\D/g,""),10);if(Number.isFinite(t)&&t>0)return t;let r=7;for(const a of String(e))r=r*31+a.charCodeAt(0)>>>0;return r||1},ra=(e,t)=>new Date(e,t+1,0).getDate();function sa(e,t){const r=t.reduce((o,c)=>o+c,0)||1,a=t.map(o=>e*o/r),s=a.map(Math.floor),l=Math.round(e)-s.reduce((o,c)=>o+c,0),d=a.map((o,c)=>[o-Math.floor(o),c]).sort((o,c)=>c[0]-o[0]);for(let o=0;o<l;o++)s[d[o%d.length][1]]++;return s}function Je(e,t){const r=na(e),a=Array.from({length:t},()=>.18+r()*1),s=a.reduce((l,d)=>l+d,0);return a.map(l=>l/s)}function Re(e,t){const r=aa(e.key),a=Je(r*13+1,Ee.length),s=Je(r*13+2,et.length),l=Je(r*13+3,Ee.length);return t.forEach(d=>{d.srBy={},d.labourBy={},d.spareBy={};const o=sa(d.sr,a);Ee.forEach((c,h)=>{d.srBy[c]=o[h],d.labourBy[c]=d.labour*l[h]}),et.forEach((c,h)=>{d.spareBy[c]=d.spare*s[h]})}),t}const oa=(e,t)=>{const r=e.at&&e.at[t.slice(0,7)];if(!r)return null;const a=ce[r[+t.slice(8,10)-1]];return!a||a.worth===null?[0,0]:[1,a.worth]};function Ot(e){const t=[];for(let v=f.from;v<=f.to&&t.length<400;v=ge(v,1))t.push(v);const r=t.map(v=>Yn(e,v)),a=t.map(v=>e.maxDay&&e.maxDay[v]||0),s=t.map(v=>e.allocDay?e.allocDay[v]||[0,0]:[0,0]),l=t.map(v=>bt(e,v)[0]),d=t.map(v=>bt(e,v)[1]),o=t.map(v=>gt(e,v)[0]),c=t.map(v=>gt(e,v)[1]),h=Math.round(e.workDays||0),$=new Set(t.map((v,y)=>L(v).getDay()===0?-1:y).filter(v=>v>=0).slice(0,h)),u=t.map((v,y)=>$.has(y)?1:0),D=e.present==null||!h?null:e.present/h,m=t.map((v,y)=>$.has(y)&&D!=null?D:0),S=1/(t.length||1),z=e.present!=null,w=t.map(v=>oa(e,v)),k=t.map(v=>zn(e,v)),N=t.map(v=>On(e,v));return Re(e,t.map((v,y)=>({key:v,label:L(v).toLocaleDateString("en-GB",{day:"2-digit",month:"short"}),sub:L(v).toLocaleDateString("en-GB",{weekday:"short"}),off:L(v).getDay()===0,sr:r[y],maxSr:a[y],alloc:s[y][0],allocOk:s[y][1],spare:l[y],labour:d[y],leads:o[y],batt:c[y],work:u[y],pres:m[y],mf:S,hrMf:z?S:0,attD:w[y]?w[y][0]:0,attP:w[y]?w[y][1]:0,attend:w[y]?w[y][0]?w[y][1]*100:null:u[y]&&z?m[y]/u[y]*100:null,days:1,fsOn:k[y][0],fsD:k[y][1],tcOk:k[y][2],tcN:k[y][3],fsMin:k[y][4],first:X(k[y][0],k[y][1]),sfTask:X(s[y][1],s[y][0]),cdiP:N[y][0],cdiD:N[y][1],cdiPa:N[y][2],cdiN:N[y][0]+N[y][1]+N[y][2],cdi:xe(N[y])})))}function ia(e){const t=Ot(e),r=[];return t.forEach(a=>{const s=(L(a.key).getDay()+6)%7,l=ge(a.key,-s);let d=r[r.length-1];(!d||d.ws!==l)&&(d={ws:l,key:l,label:`W${r.length+1}`,sub:"",sr:0,spare:0,labour:0,leads:0,batt:0,work:0,pres:0,mf:0,hrMf:0,days:0,maxSr:0,alloc:0,allocOk:0,attD:0,attP:0,fsOn:0,fsD:0,tcOk:0,tcN:0,fsMin:0,cdiP:0,cdiD:0,cdiPa:0,cdiN:0},r.push(d)),["sr","maxSr","alloc","allocOk","spare","labour","leads","batt","work","pres","mf","hrMf","attD","attP","fsOn","fsD","tcOk","tcN","fsMin","cdiP","cdiD","cdiPa","cdiN"].forEach(o=>{d[o]+=a[o]}),d.days++,d.end=a.key}),r.forEach(a=>{a.first=X(a.fsOn,a.fsD),a.sfTask=X(a.allocOk,a.alloc),a.cdi=xe([a.cdiP,a.cdiD,a.cdiPa]),a.attend=a.attD?a.attP/a.attD*100:a.work&&a.hrMf?a.pres/a.work*100:null;const s=a.ws<f.from?f.from:a.ws;a.sub=`${L(s).getDate()}–${L(a.end).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}`}),Re(e,r)}function st(e,t){const r=L(f.to),a=[];for(let s=t-1;s>=0;s--){const l=new Date(r.getFullYear(),r.getMonth()-s,1),d=ra(l.getFullYear(),l.getMonth()),o={key:$e(l),label:jt[l.getMonth()],sub:String(l.getFullYear()).slice(2),cur:s===0,days:d,sr:0,leads:0,batt:0},c=o.key.slice(0,7);o.sr=_n(e,c),o.maxSr=e.maxMonth&&e.maxMonth[c]||0;const h=e.allocMonth?e.allocMonth[c]||[0,0]:[0,0];o.alloc=h[0],o.allocOk=h[1];const $=vn(e,c);o.spare=$[0],o.labour=$[1];const u=Rn(e,c);o.cdiP=u[0],o.cdiD=u[1],o.cdiPa=u[2],o.cdiN=u[0]+u[1]+u[2],o.cdi=xe(u);const D=Nt(e,c);o.leads=D[0],o.batt=D[1];const m=Dn(e,c);o.fsOn=m[0],o.fsD=m[1],o.tcOk=m[2],o.tcN=m[3],o.fsMin=m[4],o.first=X(m[0],m[1]),o.sfTask=X(o.allocOk,o.alloc);const S=e.at&&e.at[c];let z=0,w=0;if(S)for(const N of S){const v=ce[N];v&&v.worth!==null&&(z+=1,w+=v.worth)}o.attD=z,o.attP=w,o.work=$t(e.region,l.getFullYear(),l.getMonth());const k=e.hr&&c in e.hr?e.hr[c]:null;o.pres=k??0,o.mf=1,o.hrMf=k==null?0:1,o.attend=z?w/z*100:k==null||!o.work?null:k/o.work*100,a.push(o)}return a}function la(e){const t=rt(),r=st(e,Math.max(12,t.length)),a=t.length>1?r.filter(s=>t.some(l=>l.y===L(s.key).getFullYear()&&l.m===L(s.key).getMonth())):r.slice(-12);return Re(e,a.length?a:r.slice(-12))}const da=e=>Math.floor((e+9)%12/3),Oe=e=>e.getMonth()>=3?e.getFullYear():e.getFullYear()-1;function ca(e,t,r,a,s){const l=[],d=new Map;return t.forEach(o=>{const c=L(o.key),h=r(c);let $=d.get(h);$||($={key:h,label:a(c),sub:s(c),days:0,sr:0,spare:0,labour:0,leads:0,batt:0,work:0,pres:0,mf:0,hrMf:0,maxSr:0,alloc:0,allocOk:0,attD:0,attP:0,fsOn:0,fsD:0,tcOk:0,tcN:0,fsMin:0,cdiP:0,cdiD:0,cdiPa:0,cdiN:0},d.set(h,$),l.push($)),["sr","maxSr","alloc","allocOk","spare","labour","leads","batt","work","pres","mf","hrMf","days","attD","attP","fsOn","fsD","tcOk","tcN","fsMin","cdiP","cdiD","cdiPa","cdiN"].forEach(u=>{$[u]+=o[u]})}),l.forEach(o=>{o.first=X(o.fsOn,o.fsD),o.sfTask=X(o.allocOk,o.alloc),o.cdi=xe([o.cdiP,o.cdiD,o.cdiPa]),o.attend=o.attD?o.attP/o.attD*100:o.hrMf&&o.work?o.pres/(o.work*(o.hrMf/o.mf))*100:null}),Re(e,l)}const pa=["Apr–Jun","Jul–Sep","Oct–Dec","Jan–Mar"];function ha(e){const t=Oe(L(f.to)),r=pa.map((a,s)=>({key:`${t}Q${s}`,label:`Q${s+1}`,sub:a,empty:!0,days:0,sr:0,maxSr:0,alloc:0,allocOk:0,spare:0,labour:0,leads:0,batt:0,work:0,pres:0,mf:0,hrMf:0,attend:null,attD:0,attP:0,fsOn:0,fsD:0,tcOk:0,tcN:0,fsMin:0,first:null,sfTask:null,cdiP:0,cdiD:0,cdiPa:0,cdiN:0,cdi:null}));return st(e,24).forEach(a=>{const s=L(a.key);if(Oe(s)!==t)return;const l=r[da(s.getMonth())];l.empty=!1,["sr","maxSr","alloc","allocOk","spare","labour","leads","batt","work","pres","mf","hrMf","days","attD","attP","fsOn","fsD","tcOk","tcN","fsMin","cdiP","cdiD","cdiPa","cdiN"].forEach(d=>{l[d]+=a[d]})}),r.forEach(a=>{a.first=X(a.fsOn,a.fsD),a.sfTask=X(a.allocOk,a.alloc),a.cdi=xe([a.cdiP,a.cdiD,a.cdiPa]),a.attend=a.attD?a.attP/a.attD*100:a.hrMf&&a.work?a.pres/(a.work*(a.hrMf/a.mf))*100:null}),Re(e,r)}const ma=e=>ca(e,st(e,48),t=>String(Oe(t)),t=>`FY ${String(Oe(t)).slice(2)}–${String(Oe(t)+1).slice(2)}`,()=>""),ua=e=>f.gran==="day"?Ot(e):f.gran==="week"?ia(e):f.gran==="quarter"?ha(e):f.gran==="year"?ma(e):la(e),V=(e,t)=>e.reduce((r,a)=>r+t(a),0),Qe=[{id:"sr",lab:"SR closed (EFSR)",u:"count",mid:!0,val:e=>e.sr,f:B,tot:e=>B(V(e,t=>t.sr)),kids:()=>Ee.map(e=>({lab:e,u:"count",mid:!0,val:t=>t.srBy[e],f:B,tot:t=>B(V(t,r=>r.srBy[e]))}))},{id:"spare",lab:"Spare parts sales (LMS)",u:"₹ Lakh",val:e=>e.spare,f:ne,tot:e=>ne(V(e,t=>t.spare)),kids:()=>et.map(e=>({lab:e,u:"₹ Lakh",val:t=>t.spareBy[e],f:ne,tot:t=>ne(V(t,r=>r.spareBy[e]))}))},{id:"labour",lab:"Labour revenue (LMS)",u:"₹ Lakh",val:e=>e.labour,f:ne,tot:e=>ne(V(e,t=>t.labour)),kids:()=>Ee.map(e=>({lab:e,u:"₹ Lakh",val:t=>t.labourBy[e],f:ne,tot:t=>ne(V(t,r=>r.labourBy[e]))}))},{id:"leads",lab:"AMC Generation",u:"count",mid:!0,val:e=>e.leads,f:e=>String(Math.round(e)),tot:e=>String(V(e,t=>t.leads))},{id:"batt",lab:"Battery sold",u:"count",mid:!0,val:e=>e.batt,f:e=>String(Math.round(e)),tot:e=>String(V(e,t=>t.batt))},{id:"first",lab:"First site — start time",u:"avg time",mid:!0,val:e=>e.fsD?e.fsMin/e.fsD:null,f:Me,tot:e=>{const t=V(e,r=>r.fsD);return t?Me(V(e,r=>r.fsMin)/t):"–"}},{id:"sfTask",lab:"Salesforce Task Closure Daily",u:"%",mid:!0,val:e=>X(e.allocOk,e.alloc),f:Be,tot:e=>{const t=X(V(e,r=>r.allocOk),V(e,r=>r.alloc));return t==null?"–":Be(t)},kids:()=>[{lab:"Allocated",u:"count",mid:!0,val:e=>e.alloc,f:B,tot:e=>B(V(e,t=>t.alloc))},{lab:"Closed same day",u:"count",mid:!0,val:e=>e.allocOk,f:B,tot:e=>B(V(e,t=>t.allocOk))}]},{id:"cdi",lab:"Customer delight (CDI)",u:"%",val:e=>e.cdi,f:Be,tot:e=>{const t=xe([V(e,r=>r.cdiP),V(e,r=>r.cdiD),V(e,r=>r.cdiPa)]);return t==null?"–":Be(t)},kids:()=>[{lab:"Passive",u:"count",mid:!0,val:e=>e.cdiPa,f:e=>String(e),tot:e=>String(V(e,t=>t.cdiPa))},{lab:"Detractor",u:"count",mid:!0,val:e=>e.cdiD,f:e=>String(e),tot:e=>String(V(e,t=>t.cdiD))}]}];function fa(e,t){const r=[],a=(u,D)=>u==null?"na":u>=D?"ok":u>=D*.85?"near":"miss",s=()=>{const u=[];return e.v.first!=null&&u.push(`first site before 10:00 on <b>${e.fsOn} of ${e.fsDays}</b> days`),e.v.sfTask!=null&&u.push(`<b>${e.v.sfTask}%</b> of the SRs allocated to him closed the same day`),u.length?u.join(" and "):""},l=re(Y.find(u=>u.key==="sr"));r.push(e.v.sr==null?{k:"out",lab:"Work done",tone:"na",big:"–",sub:"not in the MaxTTR file",say:"The 'Response Time & MaxTTR Details' import does not name this engineer, so his SR count and productivity are blank and both are left out of his score. Check how his name is spelt in that file against the SE UID Master."}:{k:"out",lab:"Work done",tone:a(e.v.sr,l),big:B(e.v.sr),sub:`SRs closed · commitment ${B(l)}`,say:`${B(e.v.sr)} SRs over ${H(Math.round(e.workDays))} working days — <b>${H(e.v.prod)} a working day</b>`+(t.prod!=null?`, against <b>${H(t.prod)}</b> for the rest of ${e.branch}.`:".")+(e.v.sr<l?` ${B(l-e.v.sr)} short of the ${B(l)} committed.`:" Commitment met.")});const d=re(Y.find(u=>u.key==="spare")),o=re(Y.find(u=>u.key==="labour")),c=e.v.spare==null&&e.v.labour==null?null:(e.v.spare||0)+(e.v.labour||0);r.push(c==null?{k:"rev",lab:"Revenue attributed",tone:"na",big:"–",sub:"no converted lead on his UID",say:"The LMS file attributes no converted lead to this engineer in the period, so spare and labour are blank rather than zero. Most conversion money in that file carries no Service Engineer UID at all — it belongs to the branch and to nobody in it."}:{k:"rev",lab:"Revenue attributed",tone:a(c,d+o),big:`₹${ne(c)}L`,sub:`spare + labour · commitment ₹${ne(d+o)}L`,say:`Spare <b>₹${B(e.v.spare||0)}</b> of ₹${B(d)} and labour <b>₹${B(e.v.labour||0)}</b> of ₹${B(o)}, on his own converted LMS leads`+(e.v.sr&&c?` — ₹${B(c/e.v.sr)} a job.`:".")+` AMC generation ${e.v.amcLead==null?"not attributable":`${e.v.amcLead} of ${re(Y.find(u=>u.key==="amcLead"))}`}, batteries ${e.v.battery==null?"not attributable":`${H(e.v.battery)} of ${re(Y.find(u=>u.key==="battery"))}`}.`});const h=re(Y.find(u=>u.key==="attend"));r.push(e.present==null?{k:"att",lab:"Days worked",tone:"na",big:"–",sub:"HR attendance not uploaded",say:`The period holds <b>${H(Math.round(e.workDays))} working days</b> from the AOP master, but HR has not sent the Attendance Summary for it, so attendance is blank and is left out of his score.`+(e.taskEnd!=null?` The EFSR file does show him finishing a job on <b>${e.taskEnd} days</b>.`:"")}:{k:"att",lab:"Days worked",tone:a(e.v.attend,h),big:`${H(e.present)}/${H(Math.round(e.workDays))}`,sub:`days present · ${e.v.attend}% against ${h}%`,say:`Present <b>${H(e.present)}</b> of ${H(Math.round(e.workDays))} working days (<b>${e.v.attend}%</b>), on HR's own attendance`+(e.taskEnd!=null?`, and finishing a job in the field on <b>${e.taskEnd}</b> of them.`:".")});const $=re(Y.find(u=>u.key==="cdi"));return r.push(e.v.cdi==null?{k:"qual",lab:"How it landed",tone:"na",big:"–",sub:"no customer feedback on record",say:"The CDI Detail Report holds no feedback for this engineer in the period."+(s()?` On discipline: ${s()}.`:"")}:{k:"qual",lab:"How it landed",tone:a(e.v.cdi,$),big:`${e.v.cdi}%`,sub:`CDI from ${xt(e.cdiN,"feedback")} · target ${$}%`,say:`<b>${e.cdiP}</b> promotor${e.cdiP===1?"":"s"} and <b>${e.cdiD}</b> detractor${e.cdiD===1?"":"s"} of ${xt(e.cdiN,"customer")}.`+(s()?` On discipline: ${s()}.`:" The EFSR file has no task of his in the period, so the discipline figures are blank.")}),r}function ba(e,t){const r=x=>be(x,e.v[x.key]),a=Y.filter(x=>r(x)>=100),s=Y.filter(x=>{const T=r(x);return T!=null&&T<85}).sort((x,T)=>r(x)-r(T)),l=Y.filter(x=>{const T=r(x);return T!=null&&T>=85&&T<100}),d=e.comply.filter(Boolean).length,o=e.support.filter(Boolean).length,c=(e.trainings||[]).map(x=>[x[0],x[1]||"",x[2]||""]),h=c.map(x=>String(x[0]).toLowerCase()),$=x=>{const T=mn[x.key];return T==null?null:T.some(K=>h.some(E=>E.includes(K.toLowerCase())))},u=e.v.spare+e.v.labour,D=e.v.sr?u/e.v.sr:0,m=e.present?u/e.present:0,S=e.present==null?null:Math.max(0,+(Math.round(e.workDays||0)-e.present).toFixed(1)),z=(t||[]).filter(x=>x.bid===e.bid&&x.key!==e.key),w=x=>{const T=z.map(x).filter(K=>K!=null&&isFinite(K));return T.length?T.reduce((K,E)=>K+E,0)/T.length:null},k={n:z.length+1,rank:(t||[]).filter(x=>x.bid===e.bid).sort((x,T)=>T.score-x.score).findIndex(x=>x.key===e.key)+1,sr:w(x=>x.v.sr),prod:w(x=>x.v.prod),spareSr:w(x=>x.v.sr?x.v.spare/x.v.sr:0),labSr:w(x=>x.v.sr?x.v.labour/x.v.sr:0)};let N,v,y;const P=He.length-o;if(P>=3&&e.score<80)N="Branch action first",v="warn",y=`${P} of ${He.length} support items are not issued. Close that before the performance conversation — the commitments assume the kit.`;else if(e.score>=90&&d===Te.length)N="Recommend — incentive / promotion review",v="good",y=`${a.length} of ${Y.length} commitments kept and every mandatory item in order.`;else if(e.score>=80){const x=d<=Te.length-3;N=x?"On track on the numbers — pull up the mandatory list":"On track — confirm",v=x?"warn":"good",y=(s.length?`Solid on the numbers; ${s.length} commitment${s.length>1?"s":""} to close out.`:"Every commitment kept.")+(x?` But only ${d} of ${Te.length} mandatory items are in order — the score does not cover uniform, PPE, tool kit or workmanship.`:"")}else e.score>=70?(N="Coach — focused support",v="warn",y=`Short on ${s.slice(0,2).map(x=>tt(x.short)).join(" and ")}. Set a 30-day target on ${s.length>1?"both":"it"}.`):e.score>=60?(N="Formal review",v="bad",y=`${s.length} commitments missed by more than 15%. Review with the branch manager this month.`):(N="Performance improvement plan",v="bad",y=`Score ${e.score.toFixed(1)} with ${s.length} commitments missed. Put a written plan and a review date in place.`);const q=s.map(x=>{const T=$(x);return T===null?{k:x,type:"Discipline",tone:"bad"}:T?{k:x,type:"Application",tone:"warn"}:{k:x,type:"Skill",tone:"warn"}});return{met:a,miss:s,near:l,comply:d,support:o,tr:c,branch:k,points:fa(e,k),rev:u,perSR:D,perDay:m,absent:S,verdict:N,tone:v,why:y,actions:q,tenure:ta(e)}}const oe=e=>e!=null&&Number.isFinite(+e),Q=e=>String(e).replace(/[&<>"]/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[t]),le=1320,Rt=e=>{if(e<=0)return 1;const t=10**Math.floor(Math.log10(e)),r=e/t;return(r<=1?1:r<=2?2:r<=2.5?2.5:r<=5?5:10)*t},ga=(e,t,r=4)=>Array.from({length:r+1},(a,s)=>e+(t-e)*s/r),wt=(e,t,r,a,s)=>{const l=Math.max(0,Math.min(s,r/2,a));return`M${e},${t+a}L${e},${t+l}Q${e},${t} ${e+l},${t}L${e+r-l},${t}Q${e+r},${t} ${e+r},${t+l}L${e+r},${t+a}Z`},xa=(e,t,r,a)=>`M${e},${t}h${r}v${a}h${-r}Z`,va=e=>Math.max(1,Math.ceil(38/Math.max(1,e)));function At(e,t,r,a,s=0){const l=t-s||1,d=ga(s,t);let o=d.map(w=>String(a(w)));if(new Set(o).size<d.length)for(const w of[1,2,3,4]){const k=d.map(N=>N.toFixed(w));if(new Set(k).size===d.length){o=k;break}}const c=Math.max(...o.map(w=>w.length)),h={l:Math.max(44,Math.ceil(c*5.9)+11),r:52,t:12,b:28},$=le-h.l-h.r,u=e-h.t-h.b,D=w=>h.t+u-(w-s)/l*u;let m="";d.forEach((w,k)=>{m+=`<line x1="${h.l}" x2="${le-h.r}" y1="${D(w).toFixed(1)}" y2="${D(w).toFixed(1)}" stroke="var(--viz-grid)" stroke-width="1"/><text x="${h.l-7}" y="${(D(w)+3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--viz-mut)">${Q(o[k])}</text>`}),m+=`<line x1="${h.l}" x2="${le-h.r}" y1="${h.t+u}" y2="${h.t+u}" stroke="var(--viz-base)" stroke-width="1"/>`;const S=$/r.length,z=va(S);return r.forEach((w,k)=>{k%z||(m+=`<text x="${(h.l+S*(k+.5)).toFixed(1)}" y="${e-9}" text-anchor="middle" font-size="10" fill="var(--viz-mut)">${Q(w)}</text>`)}),{pad:h,pw:$,ph:u,y:D,band:S,g:m}}function Xe(e,t,r={}){const a=r.h||168,s=(w,k)=>oe(w.values[k])?+w.values[k]:0,l=e.map((w,k)=>r.grouped?Math.max(0,...t.map(N=>s(N,k))):t.reduce((N,v)=>N+s(v,k),0)),d=oe(r.min)?+r.min:0,o=r.max||Rt(Math.max(r.target||0,...l)*1.08)||1,c=At(a,o,e,r.fmtY||(w=>Math.round(w)),d),h=t.length||1,u=Math.min(24,Math.max(2,(c.band-6)/(r.grouped?h:1))),D=u+(h>1?1.5:0),m=r.grouped?u*h+1.5*(h-1):u;let S="";e.forEach((w,k)=>{let N=0;t.forEach((v,y)=>{if(!oe(v.values[k]))return;const P=+v.values[k];if(P<=d){r.grouped||(N+=P);return}const q=`<title>${Q(w)} · ${Q(v.name)}: ${Q(r.fmtV?r.fmtV(P):Math.round(P))}</title>`;if(r.grouped){const te=c.y(P),ee=Math.max(1,c.y(d)-te),pe=c.pad.l+c.band*(k+.5)-m/2+y*D;S+=`<path d="${wt(pe,te,u,ee,Math.min(3,u/2))}" fill="${v.color}">${q}</path>`;return}const x=c.y(N+P),T=c.y(N||d),K=y<t.length-1?2:0,E=Math.max(1,T-x-K),O=c.pad.l+c.band*(k+.5)-u/2,G=y===t.length-1;S+=`<path d="${G?wt(O,x,u,E,4):xa(O,x+K,u,E)}" fill="${v.color}">${q}</path>`,N+=P})});let z="";if(r.target){const w=c.y(r.target);z=`<line x1="${c.pad.l}" x2="${le-c.pad.r}" y1="${w.toFixed(1)}" y2="${w.toFixed(1)}" stroke="var(--viz-ink)" stroke-width="1" stroke-dasharray="5 3" opacity=".55"/><text x="${(le-c.pad.r+5).toFixed(1)}" y="${(w+3.4).toFixed(1)}" text-anchor="start" font-size="9.5" fill="var(--viz-mut)">${Q(r.targetLabel||"target")}</text>`}return`<svg viewBox="0 0 ${le} ${a}" role="img" aria-label="${Q(r.aria||"")}">${c.g}${S}${z}</svg>`}function wa(e,t,r={}){const a=r.h||168,s=t.flatMap(m=>m.values.filter(oe).map(Number)),l=oe(r.min)?+r.min:0,d=r.max||Rt(Math.max(0,...s)*1.12)||1,o=At(a,d,e,r.fmtY||(m=>Math.round(m)),l),c=m=>o.pad.l+o.band*(m+.5);let h="";if(oe(r.ref)){const m=o.y(+r.ref);h+=`<line x1="${o.pad.l}" x2="${le-o.pad.r}" y1="${m.toFixed(1)}" y2="${m.toFixed(1)}" stroke="var(--viz-ink)" stroke-width="1" stroke-dasharray="5 3" opacity=".55"/><text x="${le-o.pad.r}" y="${(m-5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="var(--viz-mut)">${Q(r.refLabel||"target")}</text>`}const $=m=>{for(let S=m.length-1;S>=0;S--)if(oe(m[S]))return S;return-1};t.forEach(m=>{let S="",z=!1;m.values.forEach((k,N)=>{if(!oe(k)){z=!1;return}S+=`${z?"L":"M"}${c(N).toFixed(1)},${o.y(+k).toFixed(1)}`,z=!0}),S&&(h+=`<path d="${S}" fill="none" stroke="${m.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`),m.values.forEach((k,N)=>{oe(k)&&(h+=`<circle cx="${c(N).toFixed(1)}" cy="${o.y(+k).toFixed(1)}" r="7" fill="transparent"><title>${Q(e[N])} · ${Q(m.name)}: ${Q(r.fmtV?r.fmtV(+k):(+k).toFixed(1))}</title></circle>`)});const w=$(m.values);w>=0&&(h+=`<circle cx="${c(w).toFixed(1)}" cy="${o.y(+m.values[w]).toFixed(1)}" r="4.5" fill="${m.color}" stroke="var(--viz-surf)" stroke-width="2"/>`)});const u=t.map(m=>{const S=$(m.values);return S<0?null:{s:m,i:S,v:+m.values[S],y0:o.y(+m.values[S])}}).filter(Boolean).sort((m,S)=>m.y0-S.y0);let D=o.pad.t;return u.forEach(m=>{m.y=Math.max(m.y0,D+11),D=m.y}),u.forEach(m=>{const S=c(m.i)+8;Math.abs(m.y-m.y0)>2&&(h+=`<path d="M${(c(m.i)+5).toFixed(1)},${m.y0.toFixed(1)}L${S.toFixed(1)},${m.y.toFixed(1)}" stroke="${m.s.color}" stroke-width="1" fill="none" opacity=".7"/>`),h+=`<text x="${(S+2).toFixed(1)}" y="${(m.y+3.5).toFixed(1)}" font-size="9.5" fill="var(--viz-ink)" font-weight="600">${Q(r.fmtV?r.fmtV(m.v):m.v.toFixed(1))}</text>`}),`<svg viewBox="0 0 ${le} ${a}" role="img" aria-label="${Q(r.aria||"")}">${o.g}${h}</svg>`}const kt=(e="pn-go")=>n.jsx("svg",{className:e,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2.4",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:n.jsx("path",{d:"m8.25 4.5 7.5 7.5-7.5 7.5"})}),ka=n.jsx("svg",{className:"tick",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"3",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:n.jsx("path",{d:"m4.5 12.75 6 6 9-13.5"})}),ya=e=>e>=90?"#16a34a":e>=80?"#4ade80":e>=70?"#facc15":e>=60?"#fb923c":"#d97706",ja=e=>e>=90?"var(--sh-score-ok)":e>=80?"var(--sh-score-b)":e>=70?"var(--sh-score-warn)":"var(--sh-score-bad)",se=e=>({__html:e}),de=e=>e&&String(e).trim()?String(e).trim():"—",yt=({o:e,onClick:t})=>n.jsxs("div",{className:`pn-row ${e.kind}${e.cls||""}${e.open?" open":""}`,style:e.i==null?void 0:{"--i":Math.min(e.i,9)},onClick:t,title:e.title||void 0,children:[n.jsx("span",{className:"pn-rank",children:e.rank}),n.jsxs("span",{className:"pn-name",children:[n.jsx("b",{children:e.name}),n.jsx("span",{children:e.sub})]}),n.jsxs("span",{className:"pn-met",title:"parameters met",children:[e.met,"/",Y.length]}),n.jsx("span",{className:"pn-bar",children:n.jsx("i",{style:{width:`${Math.min(100,e.score)}%`,background:ya(e.score)}})}),n.jsxs("span",{className:"pn-score",children:[e.score.toFixed(1),n.jsx("i",{children:"%"})]}),n.jsx("span",{children:n.jsx("span",{className:`gr gr-${e.grade}`,children:e.grade})}),e.kind==="br"?kt(`pn-go tw${e.open?" open":""}`):kt()]}),Sa=({label:e,value:t,options:r,onPick:a})=>{const[s,l]=j.useState(!1),d=j.useRef(null);j.useEffect(()=>{if(!s)return;const c=h=>{d.current&&!d.current.contains(h.target)&&l(!1)};return document.addEventListener("mousedown",c),()=>document.removeEventListener("mousedown",c)},[s]);const o=r.find(c=>c.v===t)||r[0];return n.jsxs("div",{ref:d,className:`ms${s?" on-open":""}`,onMouseEnter:()=>l(!0),onMouseLeave:()=>l(!1),children:[n.jsxs("button",{type:"button",className:"btn",onClick:()=>l(c=>!c),children:[e," ",n.jsx("span",{className:"cnt",children:o.label}),n.jsx("svg",{className:"i sm",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.7",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:n.jsx("path",{d:"m19.5 8.25-7.5 7.5-7.5-7.5"})})]}),n.jsx("div",{className:"ms-pop pick",children:n.jsx("div",{className:"ms-list",children:r.map(c=>n.jsxs("div",{className:`pick-item${t===c.v?" on":""}`,onClick:()=>{a(c.v),l(!1)},children:[ka,n.jsxs("span",{className:"lbl",children:[c.label,c.sub&&n.jsx("span",{className:"sub",children:c.sub})]})]},c.v))})})]})},Ze=[{k:"spare",lab:"Spare parts",color:"var(--viz-1)"},{k:"labour",lab:"Labour",color:"var(--viz-3)"}],$a={lab:"1st site — start time",color:"var(--viz-3)",ref:600,refLabel:"10:00 AM",val:e=>e.fsD?e.fsMin/e.fsD:null},Na=[{v:"day",label:"Day wise",sub:"every day of the period"},{v:"week",label:"Week wise",sub:"calendar weeks, Mon–Sun"},{v:"month",label:"Month wise",sub:"trailing 12 months"},{v:"quarter",label:"Quarterly",sub:"financial quarters, 2 years back"},{v:"year",label:"Yearly",sub:"financial years, 4 years back"}],Ma=({roster:e,periodFrom:t,periodTo:r})=>{const[a,s]=j.useState(()=>new Set),[l,d]=j.useState(()=>new Set),[o,c]=j.useState("spare"),[h,$]=j.useState(null),[u,D]=j.useState("day"),[m,S]=j.useState(()=>new Set),[z,w]=j.useState(null),[k,N]=j.useState(!1),v=j.useRef(null),y=j.useRef(null),P=j.useRef(null),q=j.useRef(null),x=j.useRef(null),T=j.useRef(null),K=j.useRef(null),E=j.useRef(null),O=j.useRef(!1),G=j.useRef(null),te=j.useRef(null),ee=j.useRef(null),pe=j.useRef(null),Ae=j.useRef(null),we=j.useRef(null),ze=j.useRef(!1),{branches:ot,ses:ae}=j.useMemo(()=>Vn(e||{}),[e]);j.useMemo(()=>(t&&r&&Kn(ae,t,r),null),[ae,t,r]),f.gran=u;const M=h?ae.find(i=>i.key===h):null,I=j.useMemo(()=>M?ua(M):[],[M,u,t,r]),it=j.useMemo(()=>M?ba(M,ae):null,[M,ae,t,r]);j.useEffect(()=>{const i=y.current;if(!i)return;let b=i.parentElement;for(;b&&b!==document.body;){const g=window.getComputedStyle(b).overflowY;if(g==="auto"||g==="scroll")break;b=b.parentElement}const p=b&&b!==document.body&&parseFloat(window.getComputedStyle(b).paddingTop)||0;i.style.setProperty("--sep-pin-top",`${-p}px`)},[]);const ke=j.useCallback(()=>{const i=P.current,b=q.current,p=x.current;if(!i||!b||!p)return;const g=i.querySelector("table"),C=g?g.getBoundingClientRect().width:0,A=i.scrollWidth>=C-1?i.scrollWidth:Math.ceil(C),_=i.querySelector("thead th.tot");_&&i.style.setProperty("--sep-totw",`${_.getBoundingClientRect().width}px`);const F=Math.max(0,A-i.clientWidth),U=F>1;b.classList.toggle("hide",!U),p.style.width=U?`${F+b.clientWidth}px`:"100%",Math.abs(b.scrollLeft-i.scrollLeft)>.5&&(ze.current=!0,b.scrollLeft=i.scrollLeft,requestAnimationFrame(()=>{ze.current=!1}))},[]),lt=j.useCallback(i=>{const b=P.current,p=q.current;if(!b||!p||ze.current||Ae.current&&Ae.current!==i)return;Ae.current=i;const g=i==="bar"?p:b,C=i==="bar"?b:p;Math.abs(C.scrollLeft-g.scrollLeft)>.5&&(C.scrollLeft=g.scrollLeft),i==="bar"&&b.classList.add("nosnap"),we.current&&clearTimeout(we.current),we.current=setTimeout(()=>{we.current=null,Ae.current=null,b.classList.remove("nosnap"),Math.abs(p.scrollLeft-b.scrollLeft)>.5&&(ze.current=!0,p.scrollLeft=b.scrollLeft,requestAnimationFrame(()=>{ze.current=!1}))},160)},[]);j.useEffect(()=>()=>{we.current&&clearTimeout(we.current)},[]),j.useEffect(()=>{ke();const i=requestAnimationFrame(ke);window.addEventListener("resize",ke);const b=P.current,p=b&&b.querySelector("table"),g=p&&typeof ResizeObserver<"u"?new ResizeObserver(ke):null;return g&&p&&g.observe(p),()=>{cancelAnimationFrame(i),window.removeEventListener("resize",ke),g&&g.disconnect()}},[ke,M,u,m,I]);const Fe=j.useCallback(()=>{const i=P.current,b=i&&i.querySelector("table");if(!i||!b)return;const p=i.style.height;i.style.height="auto";const g=Math.ceil(i.scrollHeight),C=i.offsetHeight-i.clientHeight;i.style.height=p;const A=Math.max(240,Math.round(window.innerHeight*.78)),_=Math.min(g+C+1,A);_>parseFloat(p||"0")&&(i.classList.add("growing"),ee.current&&clearTimeout(ee.current),ee.current=setTimeout(()=>{ee.current=null,P.current&&P.current.classList.remove("growing")},340)),i.style.height=`${_}px`},[]);j.useLayoutEffect(()=>(Fe(),window.addEventListener("resize",Fe),()=>window.removeEventListener("resize",Fe)),[Fe,M,u,m,I,k]),j.useEffect(()=>()=>{ee.current&&clearTimeout(ee.current)},[]),j.useEffect(()=>{M&&v.current&&v.current.scrollIntoView({behavior:"smooth",block:"start"})},[h]);const Ft=120,Pt=180,Ct=()=>{O.current=!0,G.current&&clearTimeout(G.current),G.current=setTimeout(()=>{O.current=!1,G.current=null},Pt)},ye=()=>{K.current&&(clearTimeout(K.current),K.current=null),E.current=null,G.current&&(clearTimeout(G.current),G.current=null),O.current=!1};j.useEffect(()=>ye,[]);const _e=i=>{const b=T.current,p=b&&b.querySelector(`[data-br="${i}"]`);te.current=p?{id:i,top:p.getBoundingClientRect().top}:null},Lt=i=>i&&i.closest(".ex-col")||T.current;j.useLayoutEffect(()=>{const i=te.current;te.current=null;const b=T.current;if(!i||!b)return;const p=b.querySelector(`[data-br="${i.id}"]`);if(!p)return;const g=p.getBoundingClientRect().top-i.top;if(Math.abs(g)<=.5)return;const C=Lt(p);C&&(C.scrollTop+=g);const A=p.getBoundingClientRect().top-i.top;Math.abs(A)>.5&&Ct()},[l,a]);const It=i=>{pe.current===i||O.current||(ye(),pe.current=i,d(b=>b.size?new Set:b))},Bt=(i,b)=>{O.current||(ye(),!l.has(i)&&(E.current=i,K.current=setTimeout(()=>{K.current=null,E.current=null,_e(i);const p=pe.current!==b;pe.current=b,d(g=>p?new Set([i]):new Set(g).add(i))},Ft)))},Ht=i=>{E.current===i&&ye()},Wt=()=>{ye();const i=l.values().next().value;i&&_e(i),pe.current=null,d(new Set)},Yt=i=>{const b=a.has(i);ye(),_e(i),s(p=>{const g=new Set(p);return g.has(i)?g.delete(i):g.add(i),g}),b&&d(p=>{const g=new Set(p);return g.delete(i),g})},_t=i=>s(b=>b.has(i)?b:new Set(b).add(i)),Vt=i=>S(b=>{const p=new Set(b);return p.has(i)?p.delete(i):p.add(i),p}),Gt=j.useMemo(()=>Qe.filter(i=>i.kids).map(i=>i.id),[]),Ve=m.size>0,Kt=()=>S(Ve?new Set:new Set(Gt));j.useEffect(()=>{if(!k)return;document.body.classList.add("sep-printing");const i=setTimeout(()=>{window.print(),document.body.classList.remove("sep-printing"),N(!1)},80);return()=>{clearTimeout(i),document.body.classList.remove("sep-printing")}},[k]);const Ut=()=>N(!0),qt=()=>{if(!M)return;const i={head:"#cbe1f5",headInk:"#12224a",metric:"#eaf4fd",tot:"#dcebf9",kid:"#f5faff",zebra:"#f7fbff",line:"#9fc0df",ink:"#111827",mut:"#6b7280"},b=`border:1px solid ${i.line};font-family:Calibri,Arial;font-size:10pt;`,p=`${b}text-align:right;`,g=`${b}background:${i.head};color:${i.headInk};font-weight:bold;text-align:center;`,C=`${b}background:${i.metric};color:${i.ink};font-weight:bold;`,A=`${b}background:${i.kid};color:${i.mut};`,_=`${b}background:${i.tot};color:${i.ink};font-weight:bold;text-align:right;`,F=`font-family:Calibri,Arial;font-size:10pt;color:${i.mut};border:0;`,U=`font-family:Calibri,Arial;font-size:10pt;color:${i.ink};font-weight:bold;border:0;`,he=R=>String(R).replace(/<[^>]*>/g,"").replace(/–|&ndash;/g,"-").trim(),Ke=R=>R%2?`background:${i.zebra};`:"",ht=`${b}text-align:center;`,J=(R,W,Z)=>`<td style="${W}"${Z?` colspan="${Z}"`:""}>${R===""||R==null?"&nbsp;":R}</td>`,mt="mso-number-format:'\\@';",ut=`${U}${mt}text-align:left;`,tn=/^\d{1,2}:\d{2}\s?(AM|PM)$/i,Ce=(R,W)=>tn.test(R)?W+mt:W,je=(R,W,Z)=>`<tr>${J(R,F)}${J(W,Z||U,4)}</tr>`,nn=Y.filter(R=>be(R,M.v[R.key])>=100).length;let Le='<table cellspacing="0" cellpadding="4"><colgroup><col style="width:186px"/><col style="width:62px"/>'+I.map(()=>'<col style="width:58px"/>').join("")+'<col style="width:70px"/></colgroup>'+je("Engineer",M.name)+je("Branch",`${M.branch} (${M.bid}) &middot; ${M.region}`)+je("SE UID",de(M.uid),ut)+je("Employee ID",de(M.code),ut)+je("Period",`${ie(f.from)} &ndash; ${ie(f.to)} &middot; ${u} wise`)+je("Score",`${M.score.toFixed(1)} ${M.grade} &middot; ${nn} of ${Y.length} parameters met`)+`<tr><td style="border:0;height:8pt;"></td></tr><tr>${J("Metric",`${g}text-align:left;`)}${J("Unit",g)}`+I.map(R=>J(R.label+(R.sub?`<br>${R.sub}`:""),g)).join("")+J("Total / Avg",g)+"</tr>",Ie=0;Qe.forEach(R=>{Le+=`<tr>${J(R.lab,`${C}${Ke(Ie)}`)}`+J(R.u,`${C}${Ke(Ie)}font-weight:normal;color:${i.mut};text-align:center;`)+I.map(W=>{const Z=R.cell?R.cell(W):(()=>{const ue=R.val(W);return ue==null||ue===0?"-":fe(R.f(ue))})(),me=he(Z)||"-";return J(me,Ce(me,(me==="-"||R.mid?ht:p)+Ke(Ie)))}).join("")+(W=>J(W,Ce(W,W==="-"?`${_}text-align:center;`:_)))(he(fe(R.tot(I)))||"-")+"</tr>",Ie+=1,R.kids&&R.kids().forEach(W=>{Le+=`<tr>${J(`&nbsp;&nbsp;&nbsp;${W.lab}`,A)}${J(W.u,`${A}text-align:center;`)}`+I.map(Z=>{const me=W.val(Z),ue=me==null||me===0?"-":he(fe(W.f(me)))||"-";return J(ue,Ce(ue,`${A}text-align:${ue==="-"||W.mid?"center":"right"};`))}).join("")+(Z=>J(Z,Ce(Z,Z==="-"?`${_}text-align:center;`:_)))(he(fe(W.tot(I)))||"-")+"</tr>"})}),Le+="</table>";const an=`<html><head><meta charset="utf-8"></head><body>${Le}</body></html>`,Ue=document.createElement("a");Ue.href=URL.createObjectURL(new Blob([`\uFEFF${an}`],{type:"application/vnd.ms-excel"})),Ue.download=`${M.name.replace(/[^A-Za-z0-9]+/g,"-")}_${u}-wise_${f.from}_${f.to}.xls`,Ue.click()},dt=(i,b,p=I)=>p.map((g,C)=>{const A=i.cell?i.cell(g):(()=>{const U=i.val(g);return U==null||U===0?"–":fe(i.f(U))})(),_=String(A).replace(/<[^>]*>/g,""),F=_.trim()==="–";return n.jsx("td",{className:`${g.off?"off ":""}${b?"k ":""}${i.mid?"mid":""}${F?" nil":""}`,title:`${g.label}${g.sub?` ${g.sub}`:""} · ${i.lab}: ${_} ${i.u}`,dangerouslySetInnerHTML:se(String(A))},C)}),Jt={day:"Day",week:"Week",month:"Month",quarter:"Quarter",year:"Year"}[u],Qt=(i,b)=>n.jsxs("table",{className:"dt-t",children:[n.jsx("thead",{children:n.jsxs("tr",{children:[n.jsxs("th",{className:"m",children:[Jt," →"]}),i.map((p,g)=>n.jsxs("th",{className:`${p.off?"off":""}${p.cur?" cur":""}${g===i.length-1?" snapend":""}`,children:[n.jsx("b",{children:p.label}),p.sub&&n.jsx("span",{children:p.sub})]},g)),n.jsx("th",{className:"tot",children:"Total / Avg"})]})}),n.jsx("tbody",{children:Qe.map(p=>{const g=p.kids?p.kids():null,C=g&&m.has(p.id);return n.jsxs(rn.Fragment,{children:[n.jsxs("tr",{className:`par${g?" has":""}`,children:[n.jsx("th",{className:"m",onClick:g?()=>Vt(p.id):void 0,children:n.jsxs("span",{className:"mw",children:[g?n.jsx("svg",{className:`dtc${C?" open":""}`,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2.6",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:n.jsx("path",{d:"m8.25 4.5 7.5 7.5-7.5 7.5"})}):n.jsx("i",{className:"dtc-gap"}),n.jsxs("span",{className:"ml",children:[p.lab,n.jsx("em",{children:p.u})]})]})}),dt(p,!1,i),(()=>{const A=String(fe(p.tot(I)));return n.jsx("td",{className:`tot${p.mid?" mid":""}${A.trim()==="–"?" nil":""}`,dangerouslySetInnerHTML:se(A)})})()]}),C&&g.map((A,_)=>n.jsxs("tr",{className:"kid",children:[n.jsx("th",{className:"m",children:n.jsxs("span",{className:"mw",children:[n.jsx("i",{className:"dtc-gap"}),n.jsxs("span",{className:"ml",children:[A.lab,A.u!==p.u&&n.jsx("em",{children:A.u})]})]})}),dt(A,!0,i),(()=>{const F=String(fe(A.tot(I)));return n.jsx("td",{className:`tot${A.mid?" mid":""}${F.trim()==="–"?" nil":""}`,dangerouslySetInnerHTML:se(F)})})()]},_))]},p.id)})})]}),Ge=a.size>0,Xt=["MH","KA"].map(i=>{const b=ot.filter(p=>p.region===i).map(p=>({b:p,mem:ae.filter(g=>g.bid===p.id)})).filter(p=>p.mem.length).map(p=>({...p,r:Un(p.mem)})).sort((p,g)=>ft(p.b.id)-ft(g.b.id));return n.jsxs("div",{className:"ex-col",onMouseEnter:()=>It(i),children:[n.jsxs("div",{className:"ex-h",children:[un[i]||i,n.jsxs("span",{children:[b.length," branch",b.length===1?"":"es"," · ",b.reduce((p,g)=>p+g.mem.length,0)," engineers"]})]}),b.length?b.map((p,g)=>{const C=a.has(p.b.id),A=C||l.has(p.b.id),_=p.mem.slice().sort((F,U)=>U.score-F.score);return n.jsxs("div",{className:"ex-br","data-br":p.b.id,onMouseEnter:()=>Bt(p.b.id,i),onMouseLeave:()=>Ht(p.b.id),children:[n.jsx(yt,{onClick:()=>Yt(p.b.id),o:{key:p.b.id,kind:"br",open:A,rank:g+1,name:p.b.name,sub:`${p.b.id} · ${p.mem.length} engineer${p.mem.length>1?"s":""}`,met:Y.filter(F=>be(F,p.r.v[F.key])>=100).length,score:p.r.score,grade:p.r.grade,cls:C?" pin":"",title:C?"Pinned open — click to unpin":"Click to pin this branch open"}}),A&&n.jsx("div",{className:"ex-kids",children:_.map((F,U)=>n.jsx(yt,{onClick:()=>{_t(p.b.id),$(F.key)},o:{key:F.key,kind:"se",rank:U+1,name:F.name,i:U,sub:`UID ${de(F.uid)} · Emp ID ${de(F.code)}`,met:Y.filter(he=>be(he,F.v[he.key])>=100).length,score:F.score,grade:F.grade,cls:(h===F.key?" on":"")+(_.length>4?U===0?" top1":U===_.length-1?" bot1":"":"")}},F.key))})]},p.b.id)}):n.jsx("div",{className:"pn-empty",children:"No branch in this region yet."})]},i)}),Pe=I.map(i=>i.label),Zt=i=>f.targets[i]*(I.reduce((b,p)=>b+p.days,0)/(I.length||1))/30.44,ct=f.to?Number(f.to.slice(0,4))-(Number(f.to.slice(5,7))>=4?0:1):0,en=u==="day"||u==="week"?`${ie(f.from)} – ${ie(f.to)} · ${I.length} ${u==="day"?"days":"weeks"}`:u==="quarter"?`FY ${String(ct).slice(2)}–${String(ct+1).slice(2)} · all four quarters`:`${I.length} ${{month:"months",year:"financial years"}[u]} to ${ie(f.to)}`,pt=M&&I.length?I.reduce((i,b)=>i+(b.work||0),0):0;return n.jsxs("div",{className:"sep",ref:y,children:[n.jsx("style",{children:hn}),n.jsxs("section",{className:"panel sep-hide-print",children:[n.jsxs("div",{className:"pn-head",children:[n.jsxs("h3",{children:["Performance explorer ",n.jsx("span",{className:"sm",children:Ge?"click an engineer for the full report":"point at a branch to unfold it · they stay open down the column · click to pin"})]}),n.jsxs("nav",{className:"crumbs",children:[n.jsxs("span",{className:"ex-src",title:"Active engineers of the Training Report, with the UID NO that file carries and the Employee ID from the SE UID Master. A leaver keeps his training history but leaves this report.",children:[ae.length," active ",ae.length===1?"engineer":"engineers"," · Training Report"]}),n.jsx("button",{type:"button",className:"ex-back",onClick:()=>s(Ge?new Set:new Set(ot.filter(i=>ae.some(b=>b.bid===i.id)).map(i=>i.id))),children:Ge?"Collapse all":"Expand all branches"})]})]}),n.jsx("div",{className:"ex-cols",ref:T,onMouseLeave:Wt,children:Xt})]}),n.jsx("section",{className:"detail",ref:v,children:M?n.jsxs(n.Fragment,{children:[n.jsxs("div",{className:"dt-pin",children:[n.jsxs("div",{className:"dt-top",children:[n.jsxs("div",{className:"dt-id",children:[n.jsx("h3",{children:M.name}),n.jsxs("p",{children:[M.branch," · SE UID ",n.jsx("b",{children:de(M.uid)})," · Employee ID ",n.jsx("b",{children:de(M.code)})," · ",M.region,M.title?n.jsxs(n.Fragment,{children:[" · ",M.title]}):null]})]}),n.jsxs("div",{className:"dt-kpis",children:[n.jsxs("div",{className:"dt-k",children:[n.jsx("div",{className:"l",children:"Score"}),n.jsxs("div",{className:"v",children:[M.score.toFixed(1),n.jsx("i",{children:"%"})]})]}),n.jsxs("div",{className:"dt-k",children:[n.jsx("div",{className:"l",children:"Grade"}),n.jsx("div",{className:"v",children:M.grade})]}),n.jsxs("div",{className:"dt-k",children:[n.jsx("div",{className:"l",children:"Parameter met"}),n.jsxs("div",{className:"v",children:[it.met.length,"/",Y.length]})]}),n.jsxs("div",{className:"dt-k",title:"MaxTTR close SR ÷ the AOP master's working days for the period — a different SR count from the EFSR one the SR Count commitment uses",children:[n.jsx("div",{className:"l",children:"SR / working day"}),n.jsx("div",{className:"v",children:H(M.v.prod)}),n.jsx("div",{className:"dt-src",children:"on MaxTTR close SR"})]}),n.jsxs("div",{className:"dt-k dt-k-day",title:"Available man-days from the AOP master, prorated to the last date the data covers",children:[n.jsx("div",{className:"l",children:"Working days"}),n.jsx("div",{className:"v",children:H(M.workDays)})]}),n.jsxs("div",{className:"dt-k dt-k-day",title:"HR's Attendance Summary: present + out-door duty + half days. A whole-month figure.",children:[n.jsx("div",{className:"l",children:"HR present"}),n.jsx("div",{className:"v",children:H(M.present)})]}),n.jsxs("div",{className:"dt-k dt-k-day",title:"Distinct SR TASK END dates — the days he finished a job in the field. Not the SR close date, which is an office event.",children:[n.jsx("div",{className:"l",children:"Days present on task end"}),n.jsx("div",{className:"v",children:H(M.taskEnd)})]})]})]}),n.jsxs("div",{className:"dt-bar sep-hide-print",children:[n.jsx(Sa,{label:"View:",value:u,options:Na,onPick:D}),n.jsx("button",{type:"button",className:"btn",onClick:Kt,title:Ve?"Fold every metric back to its own line":"Open every metric that splits — SR by SR type, spare sales by part category, labour by SR type, CDI by feedback",children:Ve?"Collapse all":"Expand all"}),n.jsxs("span",{className:"dt-scope",children:[en,pt?n.jsxs("b",{className:"dt-wd",title:"Available man-days from the AOP master, prorated to the last date the data covers — the divisor under SR / working day",children:[H(pt)," working days"]}):null]}),n.jsxs("div",{className:"dt-acts",children:[n.jsx("button",{type:"button",className:"btn",onClick:qt,children:"Export"}),n.jsx("button",{type:"button",className:"btn",onClick:()=>w("matrix"),children:"Signed matrix"}),n.jsx("button",{type:"button",className:"btn amber",onClick:()=>$(null),children:"Close"})]})]})]}),n.jsxs("div",{className:"dt-body",children:[n.jsxs("div",{className:"dt-frame",children:[n.jsx("div",{className:"dt-topbar",ref:q,onScroll:()=>lt("bar"),children:n.jsx("div",{ref:x})}),n.jsx("div",{className:"dt-tblbox",ref:P,onScroll:()=>lt("box"),children:Qt(I)})]}),(()=>{const i=f.from.slice(0,7),b=new Date(`${i}-01T00:00:00`).toLocaleDateString("en-GB",{month:"long",year:"numeric"}),p=Qn(M,i);return n.jsxs("div",{className:"at-box",children:[n.jsxs("div",{className:"at-h",children:[n.jsx("span",{className:"at-t",children:"Attendance"}),n.jsxs("span",{className:"at-s",children:[b," · HR’s day-wise file"]}),p&&n.jsx("span",{className:"at-chips",children:qn.filter(g=>p.counts[g]).map(g=>n.jsxs("span",{className:`at-chip ${ce[g].cls}`,children:[n.jsx("i",{children:ce[g].tag}),ce[g].lab,n.jsx("b",{children:p.counts[g]})]},g))}),p&&n.jsxs("span",{className:"at-k",children:[n.jsx("b",{children:qe(p.worked)})," day",p.worked===1?"":"s"," worked",n.jsxs("em",{children:[B(Math.round(M.workDays||0))," working days on the AOP master"]})]})]}),p?n.jsx(n.Fragment,{children:n.jsx("div",{className:"at-tblbox",children:n.jsxs("table",{className:"dt-t at-tbl",children:[n.jsx("thead",{children:n.jsxs("tr",{children:[n.jsx("th",{className:"m",children:"Day →"}),p.days.map(g=>n.jsxs("th",{className:g.sunday?"off":"",children:[n.jsx("b",{children:String(g.d).padStart(2,"0")}),n.jsx("span",{children:g.dow})]},g.d)),n.jsx("th",{className:"tot",children:"Total"})]})}),n.jsxs("tbody",{children:[n.jsxs("tr",{className:"par",children:[n.jsx("th",{className:"m",children:n.jsxs("span",{className:"mw",children:[n.jsx("i",{className:"dtc-gap"}),n.jsxs("span",{className:"ml",children:["Attendance",n.jsx("em",{children:"HR"})]})]})}),p.days.map(g=>n.jsx("td",{className:`mid ${g.cls}`,title:`${g.iso} · ${g.lab}`,children:g.tag},g.d)),n.jsx("td",{className:"tot mid",children:B(p.days.length)})]}),n.jsxs("tr",{className:"kid",children:[n.jsx("th",{className:"m",children:n.jsxs("span",{className:"mw",children:[n.jsx("i",{className:"dtc-gap"}),n.jsxs("span",{className:"ml",children:["Counts as",n.jsx("em",{children:"days"})]})]})}),p.days.map(g=>n.jsx("td",{className:`mid${g.worth?"":" nil"}`,title:`${g.iso} · ${g.lab}`,children:g.worth?qe(g.worth):ve},g.d)),n.jsx("td",{className:"tot mid",children:qe(p.worked)})]})]})]})})}):n.jsx("div",{className:"at-none",children:f.attMonths.includes(i)?n.jsxs(n.Fragment,{children:["HR’s ",b," attendance file does not list this engineer. It carried ",f.attMonths.length===1?"the month":"that month","’s attendance for everyone on the payroll that month, and he is not among them — nothing here is missing, HR has simply not accounted for him."]}):n.jsxs(n.Fragment,{children:["HR has not uploaded a day-wise attendance file for ",b,". It is imported from the SE UID Master on the Profile page — the ‘Attendance ",b.split(" ")[0],"’ export, with the month chosen in the dialog."]})})]})})(),n.jsxs("div",{className:"dt-charts",children:[n.jsxs("figure",{className:"ch",children:[n.jsxs("figcaption",{children:[n.jsx("span",{className:"ch-t",children:"SR closed"}),n.jsxs("span",{className:"ch-s",children:["EFSR closures · against the ",B(f.targets.sr),"-a-month commitment"]})]}),n.jsx("div",{dangerouslySetInnerHTML:se(Xe(Pe,[{name:"SR closed",color:"var(--viz-1)",values:I.map(i=>i.sr)}],{target:Zt("sr"),targetLabel:"commitment",aria:`SR closed per ${u}`}))})]}),n.jsxs("figure",{className:"ch",children:[n.jsxs("figcaption",{children:[n.jsx("span",{className:"ch-t",children:"Revenue"}),n.jsx("span",{className:"ch-s",children:"₹ lakh"}),n.jsx("span",{className:"ch-tabs",role:"tablist",children:Ze.map(i=>n.jsxs("button",{type:"button",role:"tab","aria-selected":o===i.k,className:`ch-tab${o===i.k?" on":""}`,onClick:()=>c(i.k),title:`${i.lab} — commitment ₹${B(f.targets[i.k])} a month`,children:[n.jsx("i",{style:{background:i.color}}),i.lab]},i.k))})]}),(()=>{const i=Ze.find(b=>b.k===o)||Ze[0];return n.jsx("div",{dangerouslySetInnerHTML:se(Xe(Pe,[{name:i.lab,color:i.color,values:I.map(b=>b[i.k]/1e5)}],{fmtY:b=>b.toFixed(1),fmtV:b=>`₹${b.toFixed(2)} L`,aria:`${i.lab} revenue per ${u}`}))})})()]}),n.jsxs("figure",{className:"ch",children:[n.jsxs("figcaption",{children:[n.jsx("span",{className:"ch-t",children:"Productivity"}),n.jsx("span",{className:"ch-s",children:"MaxTTR close SR per working day"})]}),n.jsx("div",{dangerouslySetInnerHTML:se(wa(Pe,[{name:"SR / working day",color:"var(--viz-1)",values:I.map(i=>i.work?i.maxSr/i.work:null)}],{fmtY:i=>i.toFixed(1),fmtV:i=>i.toFixed(2),aria:"Productivity trend"}))})]}),n.jsxs("figure",{className:"ch",children:[n.jsxs("figcaption",{children:[n.jsx("span",{className:"ch-t",children:"Quality & discipline"}),n.jsx("span",{className:"ch-s",children:"1st site — start time · against the 10:00 commitment"})]}),(()=>{const i=$a,b=I.map(i.val),p=b.filter(A=>A!=null&&isFinite(A)),g=Math.min(i.ref,...p),C=Math.max(i.ref,...p);return n.jsx("div",{dangerouslySetInnerHTML:se(Xe(Pe,[{name:i.lab,color:i.color,values:b}],{min:p.length?Math.floor((g-20)/60)*60:0,max:p.length?Math.ceil((C+20)/60)*60:0,fmtY:Me,target:i.ref,targetLabel:i.refLabel,fmtV:Me,aria:`First site start time by ${u}`}))})})()]})]})]})]}):n.jsxs("div",{className:"dt-empty",children:[n.jsx("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.4",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:n.jsx("path",{d:"M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"})}),n.jsx("b",{children:"Pick a service engineer"}),n.jsx("span",{children:"Choose one in the explorer above — their day, week and month report opens here, with the charts of how the period actually ran."})]})}),M&&z==="matrix"&&n.jsx("div",{className:"mask open",onClick:i=>{i.target===i.currentTarget&&w(null)},children:n.jsx("div",{className:`sheet${k?" sep-print-area":""}`,children:n.jsx(za,{se:M,R:it,onPrint:Ut,onClose:()=>w(null)})})})]})},za=({se:e,R:t,onPrint:r,onClose:a})=>{const s=l=>be(l,e.v[l.key]);return n.jsxs(n.Fragment,{children:[n.jsxs("div",{className:"sh-pin",children:[n.jsxs("div",{className:"sh-top",children:[n.jsxs("div",{children:[n.jsx("h2",{children:"Service Engineer Performance Commitment & Accountability Matrix"}),n.jsxs("div",{className:"s2",children:["Annexure – I · KALA Care Global Services LLP · period ",ie(f.from)," – ",ie(f.to)]})]}),n.jsxs("div",{style:{display:"flex",gap:7},className:"sep-hide-print",children:[n.jsx("button",{type:"button",className:"sh-x",onClick:r,children:"Print"}),n.jsx("button",{type:"button",className:"sh-x",onClick:a,children:"Close"})]})]}),n.jsxs("div",{className:"sh-id",children:[n.jsxs("div",{className:"f",children:[n.jsx("div",{className:"l",children:"Employee Name"}),n.jsx("div",{className:"v",title:e.name,children:e.name})]}),n.jsxs("div",{className:"f",children:[n.jsx("div",{className:"l",children:"Employee ID"}),n.jsx("div",{className:"v",children:de(e.code)})]}),n.jsxs("div",{className:"f",children:[n.jsx("div",{className:"l",children:"Branch / Outlet"}),n.jsx("div",{className:"v",children:e.branch})]}),n.jsxs("div",{className:"f",children:[n.jsx("div",{className:"l",children:"SE UID · Region"}),n.jsxs("div",{className:"v",children:[de(e.uid)," · ",e.region]})]}),n.jsxs("div",{className:"f",title:t.tenure&&t.tenure.src==="hr"?"From HR’s date of joining — the Training Report has no hire date for him":"From the Training Report’s HIRE DATE column",children:[n.jsx("div",{className:"l",children:"With KCGL"}),n.jsxs("div",{className:"v",children:[t.tenure?t.tenure.label:"—",n.jsx("span",{className:"vs",children:t.tenure?`since ${vt(t.tenure.from)}${t.tenure.src==="hr"?" *":""}`:""})]})]}),n.jsxs("div",{className:"f",children:[n.jsx("div",{className:"l",children:"Trainings on record"}),n.jsxs("div",{className:"v",children:[t.tr.length,n.jsx("span",{className:"vs",children:t.tr.length?`last ${vt(t.tr[0][2])}`:"none"})]})]})]}),n.jsxs("div",{className:`sh-verdict v-${t.tone}`,children:[n.jsxs("div",{className:"sc",children:[n.jsx("div",{className:"l",children:"Commitment score"}),n.jsxs("div",{className:"big",style:{color:ja(e.score)},children:[e.score.toFixed(1),n.jsx("span",{children:"%"})]}),n.jsx("span",{className:`gr gr-${e.grade}`,children:e.grade})]}),n.jsxs("div",{className:"vd",children:[n.jsx("div",{className:"l",children:"Recommendation"}),n.jsx("div",{className:"h",children:t.verdict}),n.jsx("div",{className:"w",children:t.why})]}),n.jsxs("div",{className:"vm",children:[n.jsxs("div",{children:[n.jsx("b",{children:t.met.length})," of ",Y.length," parameters met"]}),n.jsxs("div",{children:[n.jsx("b",{children:t.comply})," of ",Te.length," mandatory items in order"]}),n.jsxs("div",{children:[n.jsx("b",{children:t.support})," of ",He.length," support items issued"]}),n.jsx("div",{children:e.present==null?n.jsxs(n.Fragment,{children:[n.jsx("b",{children:"Attendance –"})," HR has not sent this month"]}):n.jsxs(n.Fragment,{children:[n.jsxs("b",{children:[H(e.present)," P · ",H(t.absent)," A"]})," of ",H(e.workDays)," working days"]})})]})]})]}),n.jsxs("div",{className:"sh-body",children:[n.jsxs("div",{className:"sh-h",children:["Minimum Monthly Performance Commitments ",n.jsx("span",{children:"actuals for the selected period"})]}),n.jsxs("table",{className:"sh-t",children:[n.jsxs("colgroup",{children:[n.jsx("col",{className:"w-n"}),n.jsx("col",{className:"w-k"}),n.jsx("col",{className:"w-c"}),n.jsx("col",{className:"w-a"}),n.jsx("col",{className:"w-p"}),n.jsx("col",{className:"w-s"})]}),n.jsx("thead",{children:n.jsxs("tr",{children:[n.jsx("th",{children:"Sr."}),n.jsx("th",{style:{textAlign:"left"},children:"KPI"}),n.jsx("th",{children:"Target"}),n.jsx("th",{children:"Achievement"}),n.jsx("th",{children:"Ach. %"}),n.jsx("th",{children:"Status"})]})}),n.jsx("tbody",{children:Y.slice().sort((l,d)=>l.no-d.no).map(l=>{const d=e.v[l.key],o=s(l),c=Pn(l,e);return n.jsxs("tr",{children:[n.jsx("td",{className:"n",children:l.no}),n.jsxs("td",{className:"k",children:[n.jsx("div",{children:tt(l.name)}),l.hint&&n.jsx("div",{className:"sub2",children:tt(l.hint)})]}),n.jsxs("td",{className:"c",children:[n.jsx("b",{children:Zn(l)}),n.jsxs("div",{className:"sub2",children:[l.commit,l.perMonth&&f.months>1.02?` · ×${f.months.toFixed(f.months%1?1:0)} months`:""]})]}),n.jsxs("td",{className:"a",children:[Et(l,d).replace(/%|₹/g,""),l.key==="first"&&e.v.first!=null&&n.jsxs("div",{className:"sub2",children:["avg of ",B(e.fsDays)," day",e.fsDays===1?"":"s"]}),l.key==="attend"&&n.jsx("div",{className:"sub2",children:e.present==null?"HR attendance not uploaded":`${H(e.present)} P · ${H(t.absent)} A of ${H(e.workDays)}`})]}),n.jsx("td",{className:`p sh-${c}`,children:o==null?"–":Math.round(o)}),n.jsx("td",{className:`s sh-${c}`,children:Cn[c]})]},l.key)})})]}),n.jsxs("div",{className:"sh-h",children:["Four points on this engineer",n.jsx("span",{children:"each from the file that knows it · his own period"})]}),n.jsx("div",{className:"pts",children:t.points.map(l=>n.jsxs("div",{className:`pt p-${l.tone}`,children:[n.jsxs("div",{className:"pt-h",children:[n.jsx("span",{className:"pt-l",children:l.lab}),n.jsx("span",{className:"pt-n",children:l.big})]}),n.jsx("div",{className:"pt-s",children:l.sub}),n.jsx("div",{className:"pt-b",dangerouslySetInnerHTML:se(l.say)})]},l.k))}),n.jsxs("div",{className:"sh-sign",children:[n.jsxs("div",{className:"sh-h",children:["Acknowledgement ",n.jsx("span",{children:"to be signed on review"})]}),n.jsxs("p",{className:"sh-sign-p",children:["The commitments above, and the actuals recorded against them for"," ",ie(f.from)," – ",ie(f.to),", have been read and discussed with the engineer named on this sheet."]}),n.jsx("div",{className:"sh-sign-g",children:[["Service Engineer",e.name],["Branch Manager",e.branch],["HOD &ndash; Service",""]].map(([l,d])=>n.jsxs("div",{className:"sl",children:[n.jsx("div",{className:"sl-line"}),n.jsx("div",{className:"sl-l",dangerouslySetInnerHTML:se(l)}),n.jsx("div",{className:"sl-s",children:d||" "}),n.jsx("div",{className:"sl-d",children:"Date"})]},l))}),n.jsxs("div",{className:"sh-sign-f",children:["KALA Care Global Services LLP · Annexure – I · printed"," ",new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})," ","· figures from the PMS files of record"]})]})]})]})},Da="http://127.0.0.1:5004/api",De="#2f3192",Ta="#23255f",Ea=()=>{const e=JSON.parse(sessionStorage.getItem("user")||"{}");return{"user-id":String(e.user_id||""),"user-role":e.role||""}},nt=["January","February","March","April","May","June","July","August","September","October","November","December"],Oa=nt.map(e=>e.slice(0,3)),at=e=>String(e).padStart(2,"0"),Ra=(e,t)=>`${e}-${at(t+1)}-01`,Aa=(e,t)=>`${e}-${at(t+1)}-${at(new Date(e,t+1,0).getDate())}`,Fa=(e,t)=>t===0?{y:e-1,m:11}:{y:e,m:t-1},Ya=()=>{const[e,t]=j.useState(null),[r,a]=j.useState(!0),[s,l]=j.useState(""),d=new Date,o=d.getFullYear(),c=d.getMonth(),[h,$]=j.useState(()=>Fa(o,c)),[u,D]=j.useState(!1),[m,S]=j.useState(h.y),z=j.useRef(null),w=Ra(h.y,h.m),k=Aa(h.y,h.m),N=j.useCallback(async(E=!1)=>{a(!0),l("");try{const O=await fetch(`${Da}/pms/report/se-performance`,{headers:Ea()}),G=await O.json();if(!O.ok||!G.success)throw new Error(G.message||G.detail||"Failed to load");t(G),E||sn.success("SE Performance loaded")}catch(O){l(O.message)}finally{a(!1)}},[]);j.useEffect(()=>{N(!0)},[N]);const v=j.useMemo(()=>{const E=e?.meta?.sr?.from,O=E?Number(E.slice(0,4)):NaN;return Number.isFinite(O)?Math.min(O,h.y):Math.min(o-2,h.y)},[e,h.y,o]),y=(E,O)=>E>o||E===o&&O>c,P=m>v,q=m<o;j.useEffect(()=>{u&&S(h.y)},[u,h.y]),j.useEffect(()=>{if(!u)return;const E=O=>{z.current&&!z.current.contains(O.target)&&D(!1)};return document.addEventListener("mousedown",E),()=>document.removeEventListener("mousedown",E)},[u]);const x=(E,O)=>{y(E,O)||($({y:E,m:O}),D(!1))},T=e?.engineers?.length||0,K=new Set((e?.engineers||[]).map(E=>E.branch_id).filter(Boolean)).size;return n.jsx("div",{className:"min-h-screen font-sans",children:n.jsxs("div",{className:"max-w-[1500px] mx-auto px-3 sm:px-5 pb-2 max-md:px-2",children:[n.jsxs("div",{className:"rounded-2xl px-3 sm:px-5 py-3 mb-3 text-white relative sep-hide-print",style:{background:`linear-gradient(120deg, ${De} 0%, ${Ta} 100%)`},children:[n.jsxs("div",{className:"absolute inset-0 overflow-hidden rounded-2xl pointer-events-none",children:[n.jsx("div",{className:"absolute -right-8 -top-10 h-32 w-32 rounded-full",style:{background:"rgba(255,255,255,0.07)"}}),n.jsx("div",{className:"absolute right-16 -bottom-12 h-24 w-24 rounded-full",style:{background:"rgba(255,255,255,0.05)"}})]}),n.jsxs("div",{className:"relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3",children:[n.jsxs("div",{className:"flex items-center gap-2.5",children:[n.jsx("div",{className:"h-9 w-9 rounded-lg flex items-center justify-center bg-white/15 backdrop-blur-sm",children:n.jsx(ln,{className:"h-5 w-5"})}),n.jsxs("div",{children:[n.jsx("h1",{className:"text-lg sm:text-xl font-bold leading-tight",children:"SE Performance"}),n.jsx("p",{className:"text-[11px] text-white/70 leading-tight",children:r?"Loading…":s?"Could not load the roster":n.jsxs(n.Fragment,{children:["Annexure I commitment & accountability matrix · ",T," active engineers across ",K," branches"]})})]})]}),n.jsxs("div",{ref:z,className:"relative w-[240px] max-w-full",onMouseEnter:()=>D(!0),onMouseLeave:()=>D(!1),children:[n.jsxs("button",{onClick:()=>D(!u),className:"w-full flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white shadow-md hover:bg-white/90 transition-all",style:{color:De},children:[n.jsx(dn,{className:"h-3.5 w-3.5 flex-shrink-0"}),n.jsxs("span",{className:"truncate",children:[nt[h.m]," ",h.y]}),n.jsx(on,{className:`h-3 w-3 flex-shrink-0 transition-transform ${u?"rotate-180":""}`})]}),u&&n.jsx("div",{className:"absolute z-50 left-0 right-0 sm:left-auto sm:right-0 top-full pt-2",children:n.jsxs("div",{className:"w-[268px] max-w-[92vw] bg-white rounded-xl shadow-xl border border-gray-200 text-gray-800",children:[n.jsxs("div",{className:"flex items-center justify-between px-2.5 py-2 border-b border-gray-100",children:[n.jsx("button",{type:"button",disabled:!P,onClick:()=>P&&S(m-1),className:"p-1 rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed",title:P?`Go to ${m-1}`:"No data before this year",children:n.jsx(cn,{className:"h-4 w-4"})}),n.jsx("span",{className:"text-sm font-bold tabular-nums",style:{color:De},children:m}),n.jsx("button",{type:"button",disabled:!q,onClick:()=>q&&S(m+1),className:"p-1 rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed",title:q?`Go to ${m+1}`:"That year has not happened yet",children:n.jsx(pn,{className:"h-4 w-4"})})]}),n.jsx("div",{className:"grid grid-cols-3 gap-1.5 p-2.5",children:Oa.map((E,O)=>{const G=h.y===m&&h.m===O,te=y(m,O),ee=m===o&&O===c;return n.jsxs("button",{type:"button",disabled:te,onClick:()=>x(m,O),title:te?"This month has not happened yet":ee?"The month now running — still incomplete":`${nt[O]} ${m}`,className:`relative px-2 py-2 rounded-lg text-xs font-semibold transition-all ${G?"text-white shadow-sm":te?"bg-gray-50 text-gray-300 cursor-not-allowed":"bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200"}`,style:G?{backgroundColor:De}:{},children:[E,ee&&n.jsx("i",{className:`absolute top-1 right-1 h-1.5 w-1.5 rounded-full ${G?"bg-white/80":"bg-amber-400"}`})]},E)})})]})})]})]})]}),r&&!e?n.jsx("div",{className:"flex justify-center py-12",children:n.jsx("div",{className:"h-9 w-9 animate-spin rounded-full border-[3px] border-gray-200",style:{borderTopColor:De}})}):s?n.jsx("div",{className:"px-3 py-6 text-center text-sm text-red-600",children:s}):e?.engineers?.length?n.jsx(Ma,{roster:e,periodFrom:w,periodTo:k}):n.jsxs("div",{className:"bg-white rounded-2xl border border-gray-200 px-4 py-10 text-center",children:[n.jsx("p",{className:"text-sm font-semibold text-gray-800",children:"No active engineers on the roster yet"}),n.jsxs("p",{className:"text-xs text-gray-500 mt-1",children:["This report reads the ",n.jsx("b",{children:"Training Report"})," (PMS → Training Report) and shows its",n.jsx("b",{children:" Active"})," engineers only. Upload the Training Report there; if it is already uploaded, everybody in it is either marked ",n.jsx("b",{children:"Inactive"})," or has no employment status set."]})]})]})})};export{Ya as default};
