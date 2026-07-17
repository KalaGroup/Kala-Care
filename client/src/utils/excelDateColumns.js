// Excel-export date helpers.
//
// Excel's AutoFilter can only group a column by Year → Month when the cells
// hold REAL Excel dates. Exports that write dates as formatted text (e.g.
// "09 Jul 2026") get a flat text list in the filter dropdown instead. So:
//   1. put plain JS Date objects in the row data (dateOnly() strips the time),
//   2. build the sheet with { cellDates: true },
//   3. call finishDateColumns() to give every date cell a dd-mm-yyyy display
//      format and switch on the header-row AutoFilter.
import * as XLSX from 'xlsx';

// Anything date-ish → JS Date at local midnight; null when empty/invalid
// (null leaves the cell blank, which Excel's date filter handles cleanly).
export const dateOnly = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

// Format every date cell below headerRow as dd-mm-yyyy and add an AutoFilter
// across the header row. headerRow is 0-based (0 = first sheet row).
export const finishDateColumns = (ws, headerRow = 0) => {
    if (!ws['!ref']) return;
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let r = headerRow + 1; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            if (cell && (cell.t === 'd' || cell.v instanceof Date)) {
                cell.t = 'd';
                cell.z = 'dd-mm-yyyy';
            }
        }
    }
    ws['!autofilter'] = {
        ref: XLSX.utils.encode_range(
            { r: headerRow, c: range.s.c },
            { r: range.e.r, c: range.e.c }
        )
    };
};
