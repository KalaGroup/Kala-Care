// Excel-export date helpers.
//
// Excel's AutoFilter can only group a column by Year → Month → Day when the
// cells hold REAL Excel dates. Exports that write dates as formatted text
// (e.g. "09 Jul 2026") get a flat text list in the filter dropdown instead. So:
//   1. put plain JS Date objects in the row data (dateOnly() strips the time),
//   2. build the sheet with { cellDates: true },
//   3. call finishDateColumns() to convert every date cell to a clean Excel
//      serial with a dd-mm-yyyy display format, and switch on the header-row
//      AutoFilter.
import * as XLSX from 'xlsx';

// Anything date-ish → JS Date at local midnight; null when empty/invalid
// (null leaves the cell blank, which Excel's date filter handles cleanly).
export const dateOnly = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

// Excel's day 0. Serials are whole days counted from here.
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Date → whole-number Excel serial, computed from the calendar Y/M/D only.
//
// We do NOT let SheetJS convert the Date itself: it derives its epoch from the
// browser's timezone offset *at 1899-12-30*, and for zones whose historic LMT
// had a sub-minute component (Asia/Kolkata was +5:53:20 until 1906) the result
// lands a few seconds past midnight — 46253.00011574 instead of 46253. Excel
// still prints "19-08-2026", but the cell is a timestamp, not a date, so the
// filter lists every row separately instead of grouping Year → Month → Day.
const toExcelSerial = (d) =>
    Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EXCEL_EPOCH_UTC) / MS_PER_DAY);

// Convert every date cell below headerRow into a clean dd-mm-yyyy Excel date
// and add an AutoFilter across the header row, so the sheet opens with the
// filter dropdowns already on. headerRow is 0-based (0 = first sheet row).
export const finishDateColumns = (ws, headerRow = 0) => {
    if (!ws['!ref']) return;
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let r = headerRow + 1; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            if (!cell || (cell.t !== 'd' && !(cell.v instanceof Date))) continue;
            const d = cell.v instanceof Date ? cell.v : new Date(cell.v);
            if (isNaN(d.getTime())) continue;
            cell.t = 'n';
            cell.v = toExcelSerial(d);
            cell.z = 'dd-mm-yyyy';
            delete cell.w; // drop any cached text so Excel re-renders from z
        }
    }
    ws['!autofilter'] = {
        ref: XLSX.utils.encode_range(
            { r: headerRow, c: range.s.c },
            { r: range.e.r, c: range.e.c }
        )
    };
};
