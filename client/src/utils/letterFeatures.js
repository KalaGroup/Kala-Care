/* ============================================================================
   Switches for letter features that are built but not currently wanted.

   Nothing is deleted when one of these goes false — the code, the saved values
   and the database columns all stay exactly where they are, so turning a
   feature back on is a one-line change here and nothing else.
   ========================================================================== */

/**
 * "Include Service Cycle (CSP only)" — the KOEL preventive-maintenance table.
 *
 * HIDDEN 2026-08-31 at the business's request, in BOTH places it appears:
 *   • Letter Master → Add / Edit Format Type (the defaults editor)
 *   • the Send Letter wizard (the tick box, the editable table, and the block
 *     the letter itself would carry)
 *
 * A format saved earlier keeps include_service_cycle / service_cycle_intro /
 * service_cycle_rows in the database untouched; they are simply not shown and
 * not printed while this is false. Set it to true to bring the feature back.
 */
export const SHOW_SERVICE_CYCLE = false;
