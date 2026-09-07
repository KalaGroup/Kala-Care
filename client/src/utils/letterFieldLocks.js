/* ============================================================================
   Which parts of a letter the sender may still change while sending.

   The Letter Master puts a small lock on each box; this is the shared reading
   of that setting, used by the master (to draw the locks) and by both Send
   Letter wizards (to honour them).

   A MISSING key reads as editable. That matters: every format saved before the
   locks existed has no `editable_fields` at all, and must keep behaving exactly
   as it did — fully editable.
   ========================================================================== */

/** The boxes that can be locked, in the order they appear on the letter. */
export const LOCKABLE_FIELDS = [
    { key: 'subject', label: 'Subject' },
    { key: 'customer_detail_fields', label: 'Customer Details (References)' },
    { key: 'start_para', label: 'Start Paragraph' },
    { key: 'engagement_detail_fields', label: 'Engagement Details' },
    { key: 'end_para', label: 'End Paragraph' },
    { key: 'signature_para', label: 'Paragraph after signature' },
];

/** Is this box editable while sending? Unset = yes. */
export const isFieldEditable = (format, key) => {
    const flags = format?.editable_fields;
    if (!flags || typeof flags !== 'object') return true;
    return flags[key] !== false;
};

/** Flip one box, returning a new flags object. */
export const toggleFieldEditable = (flags, key) => ({
    ...(flags && typeof flags === 'object' ? flags : {}),
    [key]: !(flags?.[key] !== false),
});

/** How many boxes are locked — for a summary line. */
export const lockedCount = (format) =>
    LOCKABLE_FIELDS.filter((f) => !isFieldEditable(format, f.key)).length;
