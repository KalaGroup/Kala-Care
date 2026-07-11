// ─── Tally XML export helpers ────────────────────────────────────────────────
// Builds a Tally-importable XML (Gateway of Tally → Import Data → Vouchers)
// containing one Journal Voucher per ERP voucher — same shape as the physical
// journal vouchers:
//   SE / Sales & BM : Dr each engineer's ledger with his expense total
//   Bill Wise       : Dr each expense-head ledger with its total
//   Credit          : the submitter's (BM's) ledger with the grand total

const escapeXml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

// Tally dates are YYYYMMDD
const tallyDate = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
};

const amt = (n) => (Math.round((parseFloat(n) || 0) * 100) / 100).toFixed(2);

const journalVoucherXml = ({ voucherNo, date = new Date(), narration, debits, creditLedger }) => {
  const drLines = (debits || []).filter((d) => (parseFloat(d.amount) || 0) > 0);
  const total = drLines.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
  const vchDate = tallyDate(date);

  const drXml = drLines
    .map(
      (d) => `
      <ALLLEDGERENTRIES.LIST>
       <LEDGERNAME>${escapeXml(d.ledger)}</LEDGERNAME>
       <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
       <AMOUNT>-${amt(d.amount)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`
    )
    .join('');

  return `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="Journal" ACTION="Create" OBJVIEW="Accounting Voucher View">
      <DATE>${vchDate}</DATE>
      <EFFECTIVEDATE>${vchDate}</EFFECTIVEDATE>
      <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>
      <VOUCHERNUMBER>${escapeXml(voucherNo)}</VOUCHERNUMBER>
      <REFERENCE>${escapeXml(voucherNo)}</REFERENCE>
      <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
      <NARRATION>${escapeXml(narration)}</NARRATION>${drXml}
      <ALLLEDGERENTRIES.LIST>
       <LEDGERNAME>${escapeXml(creditLedger)}</LEDGERNAME>
       <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
       <AMOUNT>${amt(total)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>
     </VOUCHER>
    </TALLYMESSAGE>`;
};

/**
 * Build one Tally Import-Data XML containing a Journal Voucher for EACH entry.
 *
 * @param {Array<{voucherNo: string, date?: Date, narration: string,
 *                debits: Array<{ledger: string, amount: number}>,
 *                creditLedger: string}>} vouchers
 * @returns {string} XML string
 */
export const buildTallyVouchersXml = (vouchers) => `<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Import Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>Vouchers</REPORTNAME>
   </REQUESTDESC>
   <REQUESTDATA>${(vouchers || []).map(journalVoucherXml).join('')}
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>
`;

/** Trigger a browser download of the XML string. */
export const downloadTallyXml = (xml, label) => {
  const safe = String(label || 'vouchers').replace(/[^a-zA-Z0-9._-]+/g, '_');
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Tally_${safe}.xml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ISO / display / Date → dd/mm/yyyy for narrations
export const narrDate = (d) => {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString('en-GB'); // dd/mm/yyyy
};
