/* ----------------------------------------------------------------------------
   Shared exceljs chrome for the Annual Reports sheets.

   The workbook is the table, the way the other PMS exports do it: one blue ERP
   band carrying the report and its period, a grey-blue header row, branch rows,
   the MH / KA region totals and a dark overall row. exceljs is loaded ON DEMAND
   (it is ~900kB) so opening the page never pays for it.

   The colours are the LIGHT palette as literal hex — a workbook is read and
   printed on its own, so it must not follow the app's dark theme.
---------------------------------------------------------------------------- */

export const XL = {
  BRAND: '2F3192',            // the ERP band + the overall row
  HEAD: 'E8F3FC',             // header cells
  ROW_A: 'FBFDFF', ROW_B: 'F1F8FE',
  REGION: '5E8FC2',           // MH / KA totals (white text)
  LINE: '9FC0DF',             // every border
};

export const loadExcelJS = async () => {
  const m = await import('exceljs');
  return m.default || m;
};

export const A = (hex) => ({ argb: `FF${hex}` });
export const CENTER = { horizontal: 'center', vertical: 'middle', wrapText: true };
export const LEFT = { horizontal: 'left', vertical: 'middle' };
// Zeros stay real NUMBERS and show the same dash the screen does.
export const F_CNT = '#,##0;-#,##0;"-"';

/* A sheet with the ERP band already written.
   cols   [{ width }] — one per column, in order
   title  the text of the blue band (row 1)
   Returns { wb, ws, put, r } where `put(row, col, value, opts)` writes one
   bordered cell and `r` is the first free row. */
export const newSheet = (ExcelJS, name, title, cols) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'KALA Care Global LLP';
  const ws = wb.addWorksheet(name, {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = cols;

  const thin = { style: 'thin', color: A(XL.LINE) };
  const BORDER = { top: thin, bottom: thin, left: thin, right: thin };
  const put = (row, col, v, o = {}) => {
    const cl = ws.getCell(row, col);
    cl.value = v === null || v === undefined ? '' : v;
    cl.border = BORDER;
    cl.font = { size: 10, ...(o.font || {}) };
    if (o.fill) {
      cl.fill = { type: 'pattern', pattern: 'solid', fgColor: A(o.fill) };
    }
    cl.alignment = o.align || { vertical: 'middle' };
    if (o.fmt) cl.numFmt = o.fmt;
    return cl;
  };

  const last = cols.length;
  for (let c = 1; c <= last; c++) put(1, c, '', { fill: XL.BRAND });
  ws.getCell(1, 1).value = title;
  ws.getCell(1, 1).font = { size: 12, bold: true, color: A('FFFFFF') };
  ws.getCell(1, 1).alignment = LEFT;
  if (last > 1) ws.mergeCells(1, 1, 1, last);
  ws.getRow(1).height = 22;

  return { wb, ws, put, r: 2 };
};

/* Hand the finished workbook to the browser. */
export const saveBook = async (wb, filename) => {
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
