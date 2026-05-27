import React, { useState } from 'react';
import {
    BookOpenIcon,
    DocumentTextIcon,
    PhotoIcon,
    TableCellsIcon,
    MagnifyingGlassIcon,
    PlusIcon,
    EyeIcon,
    ArrowDownTrayIcon
} from '@heroicons/react/24/outline';

const KnowledgeBank = () => {
    const themeColor = '#2f3192';
    const themeShades = {
        light: 'rgba(64, 96, 147, 0.1)',
        medium: 'rgba(64, 96, 147, 0.5)',
        dark: '#335478',
    };

    const [entries] = useState([
        {
            id: 1,
            mode: 'DV',
            segment: 'Industrial',
            brief: 'Engine overheating during peak load operations',
            cases: [
                {
                    problem: 'Coolant temperature rises above 95°C within 30 minutes when running at 80%+ load. Auto-shutdown is disrupting production.',
                    resolution: 'Cleaned radiator fins, replaced thermostat, and refilled coolant with correct mix ratio. Verified fan belt tension.',
                    photos: ['engine_overheat_sample.jpg', 'radiator_before.jpg'],
                    docs: ['troubleshooting_guide_v2.pdf', 'cooling_system_sop.pdf'],
                },
                {
                    problem: 'Recurring overheating at 70% load after 2 hours.',
                    resolution: 'Replaced clogged water pump impeller and flushed cooling lines.',
                    photos: ['water_pump.jpg'],
                    docs: ['pump_service_manual.pdf'],
                },
            ],
        },
        {
            id: 2,
            mode: 'SL90',
            segment: 'Commercial',
            brief: 'Low oil pressure warning on startup',
            cases: [
                {
                    problem: 'Oil pressure warning lamp illuminates on cold start. Reads 1.2 bar vs required 2.5 bar minimum. Resolves after 5 mins.',
                    resolution: 'Replaced oil pressure relief valve and switched to recommended SAE 15W-40 grade oil.',
                    photos: ['oil_pressure_gauge.jpg'],
                    docs: ['oil_system_manual.pdf', 'oil_grade_chart.pdf'],
                },
            ],
        },
        {
            id: 3,
            mode: 'HA',
            segment: 'Residential',
            brief: 'Battery not holding charge overnight',
            cases: [
                {
                    problem: 'DG battery drains completely within 12 hours of last operation. Alternator output verified at 14.2V (within spec).',
                    resolution: 'Identified parasitic drain on ECM relay circuit. Replaced faulty relay and confirmed zero standby drain.',
                    photos: ['battery_terminals.jpg', 'relay_test.jpg'],
                    docs: ['battery_diagnostic_steps.pdf'],
                },
            ],
        },
        {
            id: 4,
            mode: '6R',
            segment: 'Industrial',
            brief: 'Excessive black smoke from exhaust',
            cases: [
                {
                    problem: 'Heavy black smoke during load acceptance. Indicates incomplete combustion.',
                    resolution: 'Replaced clogged air filter, cleaned injector nozzles, and recalibrated fuel pump timing.',
                    photos: ['exhaust_smoke.jpg', 'air_filter_clogged.jpg', 'injector.jpg'],
                    docs: ['combustion_check_procedure.pdf', 'injector_service.pdf'],
                },
            ],
        },
        {
            id: 5,
            mode: 'RV7',
            segment: 'Industrial',
            brief: 'Frequent voltage fluctuations on output',
            cases: [
                {
                    problem: 'Output voltage fluctuates 380V–440V randomly. AVR was replaced last month but issue persists.',
                    resolution: 'Found loose excitation winding connections at alternator terminals. Re-torqued and applied dielectric grease.',
                    photos: ['voltage_meter.jpg'],
                    docs: ['avr_calibration_guide.pdf', 'alternator_wiring.pdf'],
                },
            ],
        },
    ]);

    const [selectedEntry, setSelectedEntry] = useState(entries[0]);
    const [searchQuery, setSearchQuery] = useState('');

    const filteredEntries = entries.filter(e =>
        e.brief.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.mode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.segment.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen from-gray-50 to-gray-100 py-0">
            <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-4">
                {/* Header Section */}
                <div className="mb-3 sm:mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <div>
                            <h1 className="text-xl sm:text-xl font-bold text-black">Knowledge Bank</h1>
                            <p className="text-xs sm:text-sm text-black/50 mt-0.5">
                                Browse troubleshooting cases, reference documents, and field photos for quick problem resolution.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Main Card */}
                <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl overflow-hidden">
                    {/* Card Header */}
                    <div
                        className="px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between"
                        style={{ background: "#2f3192" }}
                    >
                        <div>
                            <h2 className="text-sm sm:text-base font-semibold text-white flex items-center gap-1.5">
                                <BookOpenIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                Knowledge Entries
                            </h2>
                            <p className="text-white text-opacity-90 text-[10px] sm:text-xs mt-0.5 sm:mt-1">
                                Select an entry from the table to view full details
                            </p>
                        </div>
                        <button
                            className="inline-flex items-center gap-1 px-2 py-1 bg-white/15 hover:bg-white/25 text-white text-[10px] sm:text-xs font-medium rounded-lg border border-white/30 transition-colors"
                        >
                            <PlusIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                            Add Entry
                        </button>
                    </div>

                    {/* Card Body */}
                    <div className="p-3 sm:p-4">
                        <div className="space-y-3 sm:space-y-4">
                            {/* Search Bar */}
                            <div>
                                <label className="block text-[11px] sm:text-xs font-semibold text-black mb-1 sm:mb-1.5">
                                    Search Entries
                                </label>
                                <div className="relative max-w-md">
                                    <MagnifyingGlassIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 sm:h-3.5 sm:w-3.5 text-gray-400" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Search by mode, segment, or brief..."
                                        className="w-full border rounded-lg shadow-sm pl-7 pr-2 sm:pr-3 py-1.5 sm:py-2 text-[11px] sm:text-xs focus:ring-2 transition-all bg-white text-black"
                                        style={{
                                            borderColor: searchQuery ? '#2f3192' : '#D1D5DB',
                                            '--tw-ring-color': '#2f3192'
                                        }}
                                        onFocus={(e) => e.target.style.borderColor = '#2f3192'}
                                        onBlur={(e) => e.target.style.borderColor = searchQuery ? '#2f3192' : '#D1D5DB'}
                                    />
                                </div>
                                <p className="mt-0.5 text-[10px] text-black">
                                    {filteredEntries.length} of {entries.length} entries shown
                                </p>
                            </div>

                            {/* Knowledge Entries Table */}
                            <div className="border rounded-lg sm:rounded-xl overflow-hidden">
                                
                                <div className="overflow-x-auto max-h-64 sm:max-h-72">
                                    <table className="min-w-full divide-y divide-gray-200 text-[10px] sm:text-xs">
                                        <thead className="bg-gray-50 sticky top-0">
                                            <tr>
                                                <th className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-center font-medium text-black uppercase tracking-wider border-r whitespace-nowrap">
                                                    DG Set Model
                                                </th>
                                                <th className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-center font-medium text-black uppercase tracking-wider border-r whitespace-nowrap">
                                                    Segment
                                                </th>
                                                <th className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-center font-medium text-black uppercase tracking-wider border-r whitespace-nowrap">
                                                    Brief
                                                </th>
                                                <th className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-center font-medium text-black uppercase tracking-wider whitespace-nowrap">
                                                    Action
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {filteredEntries.length === 0 ? (
                                                <tr>
                                                    <td colSpan="4" className="px-2 py-4 text-center text-[10px] sm:text-xs text-black/50">
                                                        No entries match your search.
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredEntries.map((entry) => (
                                                    <tr
                                                        key={entry.id}
                                                        onClick={() => setSelectedEntry(entry)}
                                                        className={`hover:bg-gray-50 cursor-pointer transition-colors ${selectedEntry?.id === entry.id ? 'bg-blue-50' : ''
                                                            }`}
                                                        style={
                                                            selectedEntry?.id === entry.id
                                                                ? { backgroundColor: themeShades.light }
                                                                : {}
                                                        }
                                                    >
                                                        <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 border-r whitespace-nowrap text-black">
                                                            <span
                                                                className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] text-black"
                                                            >
                                                                {entry.mode}
                                                            </span>
                                                        </td>
                                                        <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 border-r whitespace-nowrap text-black">
                                                            {entry.segment}
                                                        </td>
                                                        <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 border-r text-black">
                                                            {entry.brief}
                                                        </td>
                                                        <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 whitespace-nowrap text-center">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedEntry(entry);
                                                                }}
                                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-md border transition-colors"
                                                                style={{
                                                                    backgroundColor: themeShades.light,
                                                                    color: themeColor,
                                                                    borderColor: themeColor
                                                                }}
                                                            >
                                                                <EyeIcon className="h-3 w-3" />
                                                                View
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Entry Details — Troubleshooting Table */}
                            {selectedEntry && (
                                <div className="mt-3 sm:mt-4 border rounded-lg sm:rounded-xl overflow-hidden">
                                    {/* Header */}
                                    <div
                                        className="px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between"
                                        style={{ background: "#2f3192" }}
                                    >
                                        <div>
                                            <h3 className="text-sm sm:text-base font-semibold text-white flex items-center gap-1.5">
                                                <DocumentTextIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                                Troubleshooting — {selectedEntry.brief}
                                            </h3>
                                            <p className="text-white text-opacity-90 text-[10px] sm:text-xs mt-0.5 sm:mt-1">
                                                Problem, resolution, reference photos and supporting documents
                                            </p>
                                        </div>
                                        <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full bg-white/20 text-white whitespace-nowrap">
                                            {selectedEntry.cases?.length || 0} case{selectedEntry.cases?.length === 1 ? '' : 's'}
                                        </span>
                                    </div>

                                    {/* Table */}
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200 text-[10px] sm:text-xs">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-center font-medium text-black uppercase tracking-wider border-r whitespace-nowrap" style={{ width: '60px' }}>
                                                        Sr. No.
                                                    </th>
                                                    <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-center font-medium text-black uppercase tracking-wider border-r">
                                                        Problem
                                                    </th>
                                                    <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-center font-medium text-black uppercase tracking-wider border-r">
                                                        Resolution
                                                    </th>
                                                    <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-center font-medium text-black uppercase tracking-wider border-r" style={{ minWidth: '180px' }}>
                                                        Photos
                                                    </th>
                                                    <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-center font-medium text-black uppercase tracking-wider" style={{ minWidth: '200px' }}>
                                                        Documents
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {(!selectedEntry.cases || selectedEntry.cases.length === 0) ? (
                                                    <tr>
                                                        <td colSpan="5" className="px-3 py-6 text-center text-[10px] sm:text-xs text-black/50">
                                                            No troubleshooting cases recorded for this entry.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    selectedEntry.cases.map((c, idx) => (
                                                        <tr key={idx} className="hover:bg-gray-50/50 align-top">
                                                            {/* Sr. No. */}
                                                            <td className="px-2 sm:px-3 py-2 sm:py-2.5 border-r text-black text-center">
                                                                {idx + 1}
                                                            </td>

                                                            {/* Problem */}
                                                            <td className="px-2 sm:px-3 py-2 sm:py-2.5 border-r text-black text-center leading-relaxed">
                                                                {c.problem || '-'}
                                                            </td>

                                                            {/* Resolution */}
                                                            <td className="px-2 sm:px-3 py-2 sm:py-2.5 border-r text-black text-center leading-relaxed">
                                                                {c.resolution || '-'}
                                                            </td>

                                                            {/* Photos (multiple) */}
                                                            <td className="px-2 sm:px-3 py-2 sm:py-2.5 border-r text-center">
                                                                {(c.photos && c.photos.length > 0) ? (
                                                                    <div className="flex flex-col gap-1 items-center">
                                                                        {c.photos.map((p, pIdx) => (
                                                                            <div
                                                                                key={pIdx}
                                                                                className="flex items-center justify-between gap-1.5 w-full max-w-[200px]"
                                                                            >
                                                                                <span className="text-[10px] sm:text-xs text-black truncate text-left" title={p}>
                                                                                    {p}
                                                                                </span>
                                                                                <button
                                                                                    className="inline-flex items-center gap-0.5 px-1 py-0.5 text-[10px] font-medium rounded border transition-colors shrink-0"
                                                                                    style={{
                                                                                        backgroundColor: themeShades.light,
                                                                                        color: themeColor,
                                                                                        borderColor: themeColor,
                                                                                    }}
                                                                                    title="View image"
                                                                                >
                                                                                    <EyeIcon className="h-3 w-3" />
                                                                                </button>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-[10px] text-black/40 italic">No photos</span>
                                                                )}
                                                            </td>

                                                            {/* Documents (multiple) */}
                                                            <td className="px-2 sm:px-3 py-2 sm:py-2.5 text-center">
                                                                {(c.docs && c.docs.length > 0) ? (
                                                                    <div className="flex flex-col gap-1 items-center">
                                                                        {c.docs.map((d, dIdx) => (
                                                                            <div
                                                                                key={dIdx}
                                                                                className="flex items-center justify-between gap-1.5 w-full max-w-[240px]"
                                                                            >
                                                                                <span className="text-[10px] sm:text-xs text-black truncate text-left" title={d}>
                                                                                    {d}
                                                                                </span>
                                                                                <div className="flex items-center gap-0.5 shrink-0">
                                                                                    <button
                                                                                        className="inline-flex items-center gap-0.5 px-1 py-0.5 text-[10px] font-medium rounded border transition-colors"
                                                                                        style={{
                                                                                            backgroundColor: themeShades.light,
                                                                                            color: themeColor,
                                                                                            borderColor: themeColor,
                                                                                        }}
                                                                                        title="View"
                                                                                    >
                                                                                        <EyeIcon className="h-3 w-3" />
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-[10px] text-black/40 italic">No documents</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default KnowledgeBank;