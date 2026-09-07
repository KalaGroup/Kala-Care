import React from 'react';
import { renderLetterParaHtml } from '../utils/letterRichText';
import { PAIR_FIT_LIMIT } from '../utils/letterReferences';

/* ============================================================================
   The letter a format produces, shown in Letter Master → View.

   It mirrors the sheet the Send Letter wizard builds in CustomerEng /
   CustomerEng2 — same order, same letterhead bands, same signature block — but
   with PLACEHOLDERS where the customer's own details would go, because a
   format has no customer. The placeholders are shown in grey so nobody mistakes
   one for real text.

   Keep the running order in step with buildLetterHtml() in the two composers:
     letterhead → Ref No / Date → To → References → Subject → salutation →
     start paragraph → engagement tables → end paragraph → signature →
     paragraph after the signature → letterhead footer
   ========================================================================== */

const SIGNATURE = 'Best regards,\nKALA Care Global LLP.,\n\nAuthorized Signatory';

/* Keep in step with CUSTOMER_DETAIL_OPTIONS in Campaign.jsx — a missing entry
   here printed the raw column name (kva_rating, engine_no…) in the preview. */
const CUSTOMER_LABELS = {
    instance_id: 'Instance ID',
    account_name: 'Account Name',
    kva_rating: 'KVA Rating',
    commissioning_date: 'Commissioning Date',
    application_code: 'Application Code',
    engine_no: 'Engine No.',
    engine_model: 'Engine Model',
    warranty_expiry: 'Warranty Expiry',
    product_segment: 'Product Segment',
    engine_series: 'Engine Series',
    segment: 'Segment',
    agreement_no: 'Agreement No',
    agreement_end: 'Agreement End',
    branch_id: 'Branch',
    contact: 'Contact',
    email: 'Email',
};

const ENGAGEMENT_LABELS = {
    followup_history: 'Followups History',
    quotation_history: 'Quotation History',
    letter_history: 'Letter History',
};

const Muted = ({ children }) => (
    <span className="text-gray-400">{children}</span>
);

export default function LetterFormatPreview({ format }) {
    if (!format) return null;

    const subject = (format.subject || format.format_type_name || '').trim();
    const refNo = format.reference_no
        ? format.reference_no.split('/').map((p) => (/serial/i.test(p)
            ? (format.serial_start || '1') : p)).join('/')
        : '—';
    const customerFields = ['instance_id',
        ...(format.customer_detail_fields || []).filter((f) => f !== 'instance_id')];
    const engagementFields = format.engagement_detail_fields || [];

    const para = (value) => (
        <div className="letter-rich text-[13px] leading-[1.7] text-black"
            dangerouslySetInnerHTML={{ __html: renderLetterParaHtml(value) }} />
    );

    return (
        <div className="mx-auto w-full max-w-[780px] bg-white">
            <img src="/letter-header-band.png" alt="KALA Care · Kirloskar care"
                className="block w-full" />

            <div className="px-9 py-4">
                <div className="mb-3.5 flex items-start justify-between gap-4 text-[12px] leading-[1.7]">
                    <span><b>Ref No:</b> {refNo}</span>
                    <span className="whitespace-nowrap"><b>Date:</b> {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                </div>

                <div className="mb-3 text-[13px] leading-[1.6]">
                    <div><b>To,</b></div>
                    <div><Muted>&lt;Customer Name&gt;</Muted></div>
                    <div><Muted>&lt;Installation Site Address&gt;</Muted></div>
                    {customerFields.length > 0 && (
                        /* Same rule as buildReferencesHtml() in the composers:
                           three pairs across only when every "Label: value" is
                           short enough to share a line, otherwise two — so the
                           preview breaks where the printed letter breaks. */
                        <div className="mt-1.5 text-[12px] text-[#333]">
                            <div className="mb-0.5 font-bold">References:</div>
                            <table className="w-full border-collapse text-[12px]">
                                <tbody>
                                    {(() => {
                                        const pairs = customerFields.map((f) => ({
                                            key: f, label: CUSTOMER_LABELS[f] || f,
                                        }));
                                        const fitsThree = pairs.length >= 3 && pairs.every(
                                            (p) => (p.label.length * 2 + 4) <= PAIR_FIT_LIMIT);
                                        const perRow = fitsThree ? 3 : 2;
                                        const rows = [];
                                        for (let i = 0; i < pairs.length; i += perRow) {
                                            rows.push(pairs.slice(i, i + perRow));
                                        }
                                        return rows.map((row, ri) => (
                                            <tr key={ri}>
                                                {Array.from({ length: perRow }, (_, ci) => {
                                                    const p = row[ci];
                                                    return (
                                                        <React.Fragment key={ci}>
                                                            <td className="whitespace-nowrap align-top" style={{ padding: '2px 8px 2px 0' }}>
                                                                {p ? <b>{p.label}:</b> : null}
                                                            </td>
                                                            <td className="align-top" style={{ padding: '2px 18px 2px 0', overflowWrap: 'anywhere' }}>
                                                                {p ? <Muted>&lt;{p.label}&gt;</Muted> : null}
                                                            </td>
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </tr>
                                        ));
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="mb-3 text-[13px]">
                    <b>Subject:</b> {subject || <Muted>&lt;no subject set&gt;</Muted>}
                </div>

                <div className="text-[13px] leading-[1.7]">Dear Sir/Madam,</div>

                <div className="mt-2.5">
                    {format.start_para
                        ? para(format.start_para)
                        : <Muted className="text-[13px]">&lt;start paragraph&gt;</Muted>}
                </div>

                {engagementFields.map((f) => (
                    <div key={f} className="my-3 rounded border border-dashed border-gray-300 bg-gray-50 px-3 py-2">
                        <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                            {ENGAGEMENT_LABELS[f] || f}
                        </div>
                        <div className="text-[11.5px] text-gray-400">
                            the customer&apos;s own {ENGAGEMENT_LABELS[f] || f} table prints here
                        </div>
                    </div>
                ))}

                <div className="mt-3.5">
                    {format.end_para
                        ? para(format.end_para)
                        : <Muted className="text-[13px]">&lt;end paragraph&gt;</Muted>}
                </div>

                <div className="mt-6 whitespace-pre-wrap text-[13px] leading-[1.7]">{SIGNATURE}</div>

                {format.signature_para && (
                    <div className="mt-3.5">{para(format.signature_para)}</div>
                )}
            </div>

            <img src="/letter-footer-band.png" alt="KALA Care Global LLP"
                className="block w-full" />
        </div>
    );
}
