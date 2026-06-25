import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import { MdEmojiPeople } from "react-icons/md";
import { BsGraphUpArrow } from "react-icons/bs";
import { MdOutlineFollowTheSigns } from "react-icons/md";
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import * as XLSX from 'xlsx';
import { verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
    CalendarIcon,
    FunnelIcon,
    UserGroupIcon,
    MagnifyingGlassIcon,
    ArrowPathIcon,
    UserIcon,
    PhoneIcon,
    EnvelopeIcon,
    CheckCircleIcon,
    XCircleIcon,
    ClockIcon,
    PencilIcon,
    EyeIcon,
    ChevronLeftIcon,
    PlusIcon,
    DocumentTextIcon,
    XMarkIcon,
    MapPinIcon,
    BuildingOfficeIcon,
    ArrowDownTrayIcon,
    ChevronRightIcon,
    ChevronLeftIcon as ChevronLeftIconSmall,
    ChevronUpIcon,
    ChevronDownIcon,
    ChatBubbleLeftRightIcon,
    TagIcon,
    SparklesIcon,
    DocumentDuplicateIcon,
    BoltIcon,
    CircleStackIcon,
    ChartBarIcon,
    CpuChipIcon,
    WrenchScrewdriverIcon,
    CubeIcon,
    PaperAirplaneIcon
} from '@heroicons/react/24/outline';
import { CiExport } from "react-icons/ci";
import { FaCheck } from "react-icons/fa";

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;

// True when a drive is still active. Checks the common flags; if your backend
// uses a different field name for this, adjust it here.
const isCampaignActive = (c) => {
    if (!c) return false;
    if (typeof c.is_active === 'boolean') return c.is_active;
    if (typeof c.active === 'boolean') return c.active;
    if (typeof c.archived === 'boolean') return !c.archived;
    if (typeof c.is_archived === 'boolean') return !c.is_archived;
    if (typeof c.status === 'string') return c.status.toLowerCase() === 'active';
    return true; // no active flag on the record -> treat as active
};

// Builds short, space-saving drive labels grouped by product:
//   two drives of the same product -> "Product (1)", "Product (2)", ...
// DETERMINISTIC (sorted by product, then drive id) so the navbar guide and these
// filter chips / table columns always show the EXACT same name.
// NOTE: an identical copy lives in Navbar.jsx — keep both in sync.
const buildCampaignShortNames = (campaigns) => {
    if (!Array.isArray(campaigns) || campaigns.length === 0) return {};
    const productOf = (c) =>
        ((c.service || c.product || c.product_name || '').trim() || c.name || '');
    const sorted = [...campaigns].sort((a, b) => {
        const pa = productOf(a).toLowerCase();
        const pb = productOf(b).toLowerCase();
        if (pa !== pb) return pa.localeCompare(pb);
        return (a.id || 0) - (b.id || 0);
    });
    const counters = {};
    const map = {};
    sorted.forEach((c) => {
        if (!c || !c.name) return;
        const product = productOf(c);
        const key = product.toLowerCase();
        counters[key] = (counters[key] || 0) + 1;
        map[c.name] = {
            product,
            index: counters[key],
            shortName: `${product} (${counters[key]})`,
            color: c.color || '#406093',
            id: c.id
        };
    });
    return map;
};

const CustomerEng = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const autoOpenHandledRef = useRef(false);
    const activeCustomerRequestRef = useRef(null);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [showOtherCampaigns, setShowOtherCampaigns] = useState(false);

    // Get user from localStorage
    const [currentUser, setCurrentUser] = useState(null);
    const [userBranch, setUserBranch] = useState(null);
    const [letterHistory, setLetterHistory] = useState([]);
    const [letterHistoryLoading, setLetterHistoryLoading] = useState(false);
    const [editingLetterRecordId, setEditingLetterRecordId] = useState(null);
    const [viewLetterHtml, setViewLetterHtml] = useState(null);
    const [viewLetterBareHtml, setViewLetterBareHtml] = useState('');
    const [viewLetterAttachments, setViewLetterAttachments] = useState([]);
    const [viewLetterSubject, setViewLetterSubject] = useState('');

    // Date filters
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    // Multi-assets box state
    const [isMultiAssetsExpanded, setIsMultiAssetsExpanded] = useState(false);

    // Recent remarks suggestions
    const [recentRemarks, setRecentRemarks] = useState([]);
    const [activeRemarkDropdown, setActiveRemarkDropdown] = useState(null); // campaignId of open dropdown
    const [remarkDropdownPosition, setRemarkDropdownPosition] = useState(null);
    const remarkDropdownRef = useRef(null);

    // Warranty Expiry date range filter
    const [warrantyDateRange, setWarrantyDateRange] = useState({ from: '', to: '' });
    const [showWarrantyFilter, setShowWarrantyFilter] = useState(false);
    const [warrantyFilterPosition, setWarrantyFilterPosition] = useState(null);
    const warrantyFilterRef = useRef(null);

    // Agreement End Date range filter
    const [agreementDateRange, setAgreementDateRange] = useState({ from: '', to: '' });
    const [showAgreementFilter, setShowAgreementFilter] = useState(false);
    const [agreementFilterPosition, setAgreementFilterPosition] = useState(null);
    const agreementFilterRef = useRef(null);
    const REJECT_REASONS_EDIT_TRIGGER = (import.meta.env.VITE_REJECT_REASONS_EDIT_TRIGGER || '')
        .split(',')
        .map(r => r.trim().toLowerCase())
        .filter(Boolean);

    // Diary states
    const [showDieryModal, setShowDieryModal] = useState(false);
    const [dieryEntries, setDieryEntries] = useState([]);
    const [loadingDiery, setLoadingDiery] = useState(false);
    const [editingDieryEntry, setEditingDieryEntry] = useState(null);
    const [dieryEditForm, setDieryEditForm] = useState({ title: '', content: '' });
    const [dieryNewForm, setDieryNewForm] = useState({ title: '', content: '' });
    const [showAddDieryForm, setShowAddDieryForm] = useState(false);
    const [savingDieryNew, setSavingDieryNew] = useState(false);

    // Campaign filter - multiple selection
    const [selectedCampaigns, setSelectedCampaigns] = useState([]);

    // Campaign colors mapping
    const [campaignColors, setCampaignColors] = useState({});
    // Full drive catalog (name, service, color, id) — drives the short "Product - N" labels
    const [campaignsCatalog, setCampaignsCatalog] = useState([]);
    const [selectedBranches, setSelectedBranches] = useState([]);
    const [showBranchFilter, setShowBranchFilter] = useState(false);
    const branchFilterRef = useRef(null);
    // Position tracking for filter dropdowns (uses fixed positioning to escape table scroll container)
    const [branchFilterPosition, setBranchFilterPosition] = useState(null);
    const [campaignFilterPosition, setCampaignFilterPosition] = useState(null);

    // Flag filter (C1–C7) and Status filter (NC / R / WIP / FR) are now INDEPENDENT
    const [selectedFlag, setSelectedFlag] = useState('all');
    const [selectedStatus, setSelectedStatus] = useState('all');
    const [userCanExport, setUserCanExport] = useState(false);
    const [completedCountFromAPI, setCompletedCountFromAPI] = useState(0);
    // Campaign column filters - per-campaign status filter
    const [campaignColumnFilters, setCampaignColumnFilters] = useState({});
    const [openCampaignFilter, setOpenCampaignFilter] = useState(null);
    const campaignFilterRef = useRef(null);

    // New state for customer edit info
    const [customerEditInfo, setCustomerEditInfo] = useState(null);
    const [loadingEditInfo, setLoadingEditInfo] = useState(false);
    const [showEditHistory, setShowEditHistory] = useState(true);
    const [isEditHistoryExpanded, setIsEditHistoryExpanded] = useState(true);

    // Flag counts - Updated to include C6 and C7
    const [flagCounts, setFlagCounts] = useState({
        C1: 0,
        C2: 0,
        C3: 0,
        C4: 0,
        C5: 0,
        C6: 0,
        C7: 0
    });

    // ==================== Send Letter wizard states ====================
    const COMPANY_NAME = 'KALA Care';
    const COMPANY_FULL = 'KALA Care Global LLP.,';
    // Letterhead is two full-width bands from the KALA letter-format document:
    //   letter-header-band.png = KALA logo (left) + kirloskar care (right)
    //   letter-footer-band.png = company name + address + shapes
    // Both live in the public/ folder. The header band sits at the top of page 1;
    // the footer band is stamped at the bottom of the LAST page.
    const LETTER_HEADER_IMG = '/letter-header-band.png';
    const LETTER_FOOTER_IMG = '/letter-footer-band.png';
    const LETTER_ATTACH_EXTS = ['mp4', 'jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx', 'xlsx', 'xls', 'csv'];
    // Common signature shown at the bottom of EVERY letter (after the editable end-para)
    const LETTER_SIGNATURE = 'Best regards,\nKALA Care Global LLP.,\n\nAuthorized Signatory';
    // Default (editable) intro lines shown above the follow-up / quotation tables.
    // Re-applied whenever the letter is (re)generated so the boxes are never blank.
    const DEFAULT_FOLLOWUP_INTRO = 'As part of our ongoing service engagement, our team has been in regular touch with you regarding the above. A summary of our recent follow-up(s) is provided below for your kind reference:';
    const DEFAULT_QUOTATION_INTRO = 'In line with your requirement, we have prepared and submitted the following quotation(s) for your kind consideration and approval:';
    const DEFAULT_LETTERREF_INTRO = 'For your kind reference, please find below the details of the letter(s) previously issued to you in connection with the above:';

    const [showLetterWizard, setShowLetterWizard] = useState(false);
    const [letterStep, setLetterStep] = useState(1);   // 1=Format, 2=Letter, 3=Review & Send
    const [wizardLetterFormats, setWizardLetterFormats] = useState([]);
    const [letterFormatsLoading, setLetterFormatsLoading] = useState(false);
    const [selectedLetterFormat, setSelectedLetterFormat] = useState(null);
    const [letterAttachments, setLetterAttachments] = useState([]);
    const [letterRefNo, setLetterRefNo] = useState('');
    const [letterFy, setLetterFy] = useState('');
    const [letterSeq, setLetterSeq] = useState(1);
    const [previousLetters, setPreviousLetters] = useState([]);
    const [headerImgDataUrl, setHeaderImgDataUrl] = useState('');
    const [footerImgDataUrl, setFooterImgDataUrl] = useState('');
    const [letterSending, setLetterSending] = useState(false);
    // True while "Next" is fetching the live serial number (drives the loading spinner)
    const [letterStepLoading, setLetterStepLoading] = useState(false);
    // Editable file name for the generated letter PDF (shown in Review & Send)
    const [letterFileName, setLetterFileName] = useState('');

    // Follow-up / Quotation inclusion (middle of the letter)
    const [includeFollowups, setIncludeFollowups] = useState(false);
    const [includeQuotations, setIncludeQuotations] = useState(false);
    const [showFollowupPicker, setShowFollowupPicker] = useState(false);
    const [showQuotationPicker, setShowQuotationPicker] = useState(false);
    const [selectedFollowupIds, setSelectedFollowupIds] = useState([]);
    const [selectedQuotationIds, setSelectedQuotationIds] = useState([]);

    // Previous-letter (Letter Ref) inclusion — pulls rows from this customer's letter history
    const [includeLetterRefs, setIncludeLetterRefs] = useState(false);
    const [showLetterRefPicker, setShowLetterRefPicker] = useState(false);
    const [selectedLetterRefIds, setSelectedLetterRefIds] = useState([]);

    // Send channels + multi-recipient (extra emails go to CC, extra numbers each get the message)
    const [letterChannels, setLetterChannels] = useState([]);
    const [letterEmailTo, setLetterEmailTo] = useState('');
    const [letterToList, setLetterToList] = useState([]);
    const [letterToInput, setLetterToInput] = useState('');
    const [letterMatchedGoems, setLetterMatchedGoems] = useState([]);
    const [letterCcList, setLetterCcList] = useState([]);
    const [letterCcInput, setLetterCcInput] = useState('');
    const [letterWhatsappTo, setLetterWhatsappTo] = useState('');
    const [letterWhatsappList, setLetterWhatsappList] = useState([]);
    const [letterWhatsappInput, setLetterWhatsappInput] = useState('');

    const [letterFields, setLetterFields] = useState({
        ref_no: '', date: '', to_name: '', to_address: '', instance_id: '',
        engine_model: '', agreement_no: '', contact: '', email: '',
        subject: '', start_para: '', end_para: '',
        // editable intro lines shown above the follow-up / quotation / letter-ref tables
        followup_intro: DEFAULT_FOLLOWUP_INTRO,
        quotation_intro: DEFAULT_QUOTATION_INTRO,
        letterref_intro: DEFAULT_LETTERREF_INTRO
    });

    // ---- Step-2 editable References (Customer Detail Fields) ----
    const [letterRefFieldValues, setLetterRefFieldValues] = useState({});   // { key: editedValue }
    const [letterRefHiddenFields, setLetterRefHiddenFields] = useState([]);  // keys removed from THIS letter

    // ---- Step-2 editable tables: per-row cell edits + removed columns ----
    const [followupCellEdits, setFollowupCellEdits] = useState({});   // { followupId: { col: value } }
    const [followupHiddenCols, setFollowupHiddenCols] = useState([]);
    const [quotationCellEdits, setQuotationCellEdits] = useState({});
    const [quotationHiddenCols, setQuotationHiddenCols] = useState([]);
    const [letterRefCellEdits, setLetterRefCellEdits] = useState({});
    const [letterRefHiddenCols, setLetterRefHiddenCols] = useState([]);

    // Data states
    const [activeCampaigns, setActiveCampaigns] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [filteredCustomers, setFilteredCustomers] = useState([]);
    const [displayedCustomers, setDisplayedCustomers] = useState([]); // For lazy loading
    const [searchTerm, setSearchTerm] = useState('');

    // Related assets for the currently-viewed customer (returned by /customers/{id})
    const [serverRelatedAssets, setServerRelatedAssets] = useState([]);

    // CSP Info rows for the currently-viewed customer (only when in a CSP campaign)
    const [cspInfo, setCspInfo] = useState([]);

    // Free-drag position for the CSP Info box (self-contained, does not touch boxOrder)
    const [cspOffset, setCspOffset] = useState({ x: 0, y: 0 });
    const cspDragRef = useRef({ dragging: false, startX: 0, startY: 0, baseX: 0, baseY: 0 });

    const handleCspPointerDown = (e) => {
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { }
        cspDragRef.current = {
            dragging: true,
            startX: e.clientX,
            startY: e.clientY,
            baseX: cspOffset.x,
            baseY: cspOffset.y
        };
    };

    const handleCspPointerMove = (e) => {
        if (!cspDragRef.current.dragging) return;
        setCspOffset({
            x: cspDragRef.current.baseX + (e.clientX - cspDragRef.current.startX),
            y: cspDragRef.current.baseY + (e.clientY - cspDragRef.current.startY)
        });
    };

    const handleCspPointerUp = (e) => {
        cspDragRef.current.dragging = false;
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (err) { }
    };

    // Pagination/Lazy loading states
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [totalCount, setTotalCount] = useState(0);
    const ITEMS_PER_PAGE = 50; // Load 50 items at a time
    const observerRef = useRef();
    const tableContainerRef = useRef();
    const savedScrollPosition = useRef(0);
    // Remembers how many rows were loaded (lazy-load depth) when a customer was opened,
    // so returning to the list restores the EXACT same rows + scroll position.
    const savedDisplayCount = useRef(0);

    // Sorting state
    const [sortConfig, setSortConfig] = useState({
        key: null,
        direction: 'asc'
    });

    // Selected customer for details view
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [showCustomerDetails, setShowCustomerDetails] = useState(false);
    const [customerDetails, setCustomerDetails] = useState(null);
    const [customerFollowups, setCustomerFollowups] = useState([]);

    // New state for all related customer data
    const [customerCompleteData, setCustomerCompleteData] = useState(null);
    const [loadingCompleteData, setLoadingCompleteData] = useState(false);
    const [isInCustomerDetails, setIsInCustomerDetails] = useState(false);
    const [refreshAttempted, setRefreshAttempted] = useState(false);

    const [customerServices, setCustomerServices] = useState([]);
    const [customerLmsData, setCustomerLmsData] = useState([]);
    const [customerCampaigns, setCustomerCampaigns] = useState([]);
    const [allCampaigns, setAllCampaigns] = useState([]);
    const [showManageCampaigns, setShowManageCampaigns] = useState(false);
    const [campaignActionLoading, setCampaignActionLoading] = useState(false);
    const [selectedCampaignTab, setSelectedCampaignTab] = useState(null);
    // Add this with other state declarations around line 250
    const [pdfPanelWidth, setPdfPanelWidth] = useState('w-64 sm:w-96'); // Default width
    const [isPdfPanelExpanded, setIsPdfPanelExpanded] = useState(false);

    // PDF viewer state - redesigned as chat panel
    const [selectedPdf, setSelectedPdf] = useState(null);
    const [currentPdfIndex, setCurrentPdfIndex] = useState(0);
    const [campaignPdfs, setCampaignPdfs] = useState([]);
    const [showPdfViewer, setShowPdfViewer] = useState(false);
    const [pdfViewerCampaign, setPdfViewerCampaign] = useState(null);
    const [isPdfPanelMinimized, setIsPdfPanelMinimized] = useState(false);

    // Activity & RR states
    const [showActivityModal, setShowActivityModal] = useState(false);
    const [showRRModal, setShowRRModal] = useState(false);
    const [activityInput, setActivityInput] = useState('');
    const [rrInput, setRRInput] = useState('');
    const [activities, setActivities] = useState([]);
    const [rrList, setRRList] = useState([]);
    const [editingActivity, setEditingActivity] = useState(null);
    const [editingRR, setEditingRR] = useState(null);

    // Edit customer modal state
    const [showEditCustomerModal, setShowEditCustomerModal] = useState(false);
    const [editCustomerForm, setEditCustomerForm] = useState({
        customer_name: '',
        phone_number: '',
        email: '',
        pan_number: '',
        location: ''
    });
    const [editCustomerLoading, setEditCustomerLoading] = useState(false);
    const [followupFilters, setFollowupFilters] = useState({
        date: '',
        campaign: '',
        service: '',
        user: '',
        followupBy: ''
    });

    const [columnOrder, setColumnOrder] = useState(() => {
        const defaultOrder = ['sr_no', 'instance_id', 'customer_name', 'contact', 'email', 'warranty_expiry', 'agreement_end_date', 'branch_id', 'latest_flag', 'last_followup_date', 'last_followup_user', 'next_followup_date', 'remark'];
        const savedOrder = localStorage.getItem('customerEng_column_order');
        if (savedOrder) {
            const parsed = JSON.parse(savedOrder);
            // Migration: add new columns if missing in saved order
            if (!parsed.includes('warranty_expiry')) {
                const emailIdx = parsed.indexOf('email');
                parsed.splice(emailIdx + 1, 0, 'warranty_expiry');
            }
            if (!parsed.includes('agreement_end_date')) {
                const wIdx = parsed.indexOf('warranty_expiry');
                parsed.splice(wIdx + 1, 0, 'agreement_end_date');
            }
            return parsed;
        }
        return defaultOrder;
    });

    const [panelPosition, setPanelPosition] = useState({ x: window.innerWidth - 420, y: window.innerHeight - 600 }); // Default position bottom right
    const [isDragging, setIsDragging] = useState(false);
    const dragStartPos = useRef({ x: 0, y: 0 });

    // New state for multiple campaign follow-ups
    const [selectedCampaignsForFollowup, setSelectedCampaignsForFollowup] = useState([]);
    const [campaignFollowupData, setCampaignFollowupData] = useState({});
    const [activeCampaignTab, setActiveCampaignTab] = useState(null);

    // Common form fields
    const [commonFollowupDate] = useState(new Date().toISOString().split('T')[0]);
    const [commonFollowupBy, setCommonFollowupBy] = useState('call');
    const [commonFollowupFlag, setCommonFollowupFlag] = useState('');
    const [commonNextFollowupDate, setCommonNextFollowupDate] = useState('');

    // Follow-up form
    const [showFollowupForm, setShowFollowupForm] = useState(true);
    const [editingFollowup, setEditingFollowup] = useState(null);
    const [followupForm, setFollowupForm] = useState({
        followup_date: new Date().toISOString().split('T')[0],
        campaign_id: '',
        followup_by: 'call',
        followup_flag: '',
        followup_remark: '',
        status: 'wip',
        next_followup_date: '',
        quotation_sent: false,
        quotation_no: '',
        quotation_value: '',
        activity_id: '',
        rr_id: ''
    });

    const [selectedFollowup, setSelectedFollowup] = useState(null);
    const [showFollowupDetails, setShowFollowupDetails] = useState(false);

    // Check if current user is admin
    const isAdmin = currentUser?.role === 'master_admin' || currentUser?.role === 'it_admin';

    const getStatusLetter = (status) => {
        switch (status) {
            case 'wip': return 'W';
            case 'completed': return 'C';
            case 'rejected': return 'R';
            case 'rescheduled': return 'FR';
            case 'not_connected': return 'NC';
            default: return '';
        }
    };

    const themeColor = '#2f3192';
    const themeShades = {
        light: 'rgba(64, 96, 147, 0.1)',
        medium: 'rgba(64, 96, 147, 0.5)',
        dark: '#335478',
    };

    // Follow-up flags - Updated to include C6 and C7
    const followupFlags = {
        C1: 15,
        C2: 30,
        C3: 45,
        C4: 60,
        C5: 75,
        C6: 90,
        C7: 999
    };

    const showQuoteColumnsGlobal = selectedCampaignsForFollowup.some(
        campaignId => campaignFollowupData[campaignId]?.quotation_sent
    );

    const showRejectReasonGlobal = selectedCampaignsForFollowup.some(
        campaignId => campaignFollowupData[campaignId]?.status === 'rejected'
    );

    // Next Follow-up Date is disabled + shown empty when EVERY selected drive is a
    // status that doesn't use a next date (Completed / Rejected).
    const allSelectedNoNextDate = selectedCampaignsForFollowup.length > 0 &&
        selectedCampaignsForFollowup.every(id => {
            const s = campaignFollowupData[id]?.status;
            return s === 'completed' || s === 'rejected';
        });

    // Follow-up Flag is shown empty when EVERY selected drive is a status that
    // doesn't use a flag (Completed / Rejected / Not Connected).
    const allSelectedNoFlag = selectedCampaignsForFollowup.length > 0 &&
        selectedCampaignsForFollowup.every(id => {
            const s = campaignFollowupData[id]?.status;
            return s === 'completed' || s === 'rejected' || s === 'not_connected';
        });

    useEffect(() => {
        const userStr = sessionStorage.getItem('user');
        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                setCurrentUser(user);
                setUserBranch(user.branch);
            } catch (e) {
                console.error('Error parsing user from sessionStorage', e);
            }
        }

    }, []);

    // Fetch C (Completed) count based on user role
    useEffect(() => {
        const fetchCompletedCount = async () => {
            if (!currentUser) return;
            try {
                const role = (currentUser.role || '').toLowerCase();
                const isMasterOrIT = role === 'master_admin' || role === 'it_admin';

                const payload = {
                    user_id: currentUser.user_id || currentUser.id,
                    name: currentUser.name,
                    role: currentUser.role,
                    branch: currentUser.branch
                };

                if (isMasterOrIT) {
                    // Master / IT Admin → overall company completed (from Dashboard summary)
                    const params = new URLSearchParams({
                        user_id: payload.user_id,
                        name: payload.name || '',
                        role: payload.role || '',
                        branch: payload.branch || ''
                    });
                    const res = await fetch(`${API_BASE_URL}/performance/summary?time_period=all&${params.toString()}`);
                    if (res.ok) {
                        const data = await res.json();
                        setCompletedCountFromAPI(data.completed_assets || 0);
                    }
                } else {
                    // Employee / Branch Admin → personal completed (from MyPerformance)
                    const res = await fetch(`${API_BASE_URL}/performance/my-performance?time_period=all`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (res.ok) {
                        const data = await res.json();
                        setCompletedCountFromAPI(data.completed_count || 0);
                    }
                }
            } catch (err) {
                console.error('Error fetching completed count:', err);
                setCompletedCountFromAPI(0);
            }
        };
        fetchCompletedCount();
    }, [currentUser]);

    // Restore the EXACT scroll position + loaded-row depth when returning to the list view.
    //
    // We intentionally do NOT re-fetch the whole list on Back (it was already refreshed the
    // moment the follow-up was saved). So coming back only needs to:
    //   1) re-mount the same number of rows the user had scrolled through, and
    //   2) put the scrollbar back exactly where it was.
    // Because the sort/filter is deterministic, only the customer whose follow-up changed
    // moves to its new position — every other row stays put. useLayoutEffect runs BEFORE the
    // browser paints, so there is no visible jump/flicker.
    useLayoutEffect(() => {
        if (showCustomerDetails) return;
        if (savedScrollPosition.current <= 0) return;
        if (filteredCustomers.length === 0) return;

        // How many rows to bring back (at least one page, capped to what's available).
        const wantCount = Math.min(
            Math.max(savedDisplayCount.current, ITEMS_PER_PAGE),
            filteredCustomers.length
        );

        // Not enough rows mounted yet → mount them, then restore on the next pass.
        if (displayedCustomers.length < wantCount) {
            setDisplayedCustomers(filteredCustomers.slice(0, wantCount));
            setPage(Math.ceil(wantCount / ITEMS_PER_PAGE));
            setHasMore(wantCount < filteredCustomers.length);
            return;
        }

        // Rows are present → snap the scrollbar back to where the user was.
        if (tableContainerRef.current) {
            tableContainerRef.current.scrollTop = savedScrollPosition.current;
            savedScrollPosition.current = 0;
            savedDisplayCount.current = 0;
        }
    }, [showCustomerDetails, displayedCustomers, filteredCustomers]);

    // Fetch data when date filters change
    useEffect(() => {
        fetchEngagementData();
    }, [fromDate, toDate]);

    // Load this customer's letter history when the details view opens
    useEffect(() => {
        if (showCustomerDetails && customerDetails?.instance_id) {
            fetchLetterHistory(customerDetails.instance_id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showCustomerDetails, customerDetails?.instance_id]);

    // Auto-open customer details when navigated from MyPerformance
    useEffect(() => {
        if (autoOpenHandledRef.current) return;
        if (!location.state) return;
        if (!customers || customers.length === 0) return;

        const { openCustomerId, openCustomerInstanceId } = location.state;

        let target = null;
        if (openCustomerId) {
            target = customers.find(c => String(c.customer_id) === String(openCustomerId));
        }
        if (!target && openCustomerInstanceId) {
            target = customers.find(c => c.instance_id === openCustomerInstanceId);
        }

        if (target) {
            autoOpenHandledRef.current = true;
            handleViewCustomer(target.customer_id);
            navigate(location.pathname, { replace: true, state: null });
        }
    }, [customers, location.state, location.pathname, navigate]);

    // Update column order when activeCampaigns changes
    useEffect(() => {
        if (activeCampaigns.length > 0) {
            setColumnOrder(prevOrder => {
                const newOrder = [...prevOrder];
                // Remove old campaign columns
                const filteredOrder = newOrder.filter(col => !col.startsWith('campaign_'));
                // Add new campaign columns after branch_id
                const branchIndex = filteredOrder.indexOf('branch_id');
                const campaignColumns = activeCampaigns.map(c => `campaign_${c}`);
                const insertIndex = branchIndex + 1;
                filteredOrder.splice(insertIndex, 0, ...campaignColumns);
                return filteredOrder;
            });
        }
    }, [activeCampaigns]);

    // Save column order to localStorage whenever it changes
    useEffect(() => {
        if (columnOrder.length > 0) {
            localStorage.setItem('customerEng_column_order', JSON.stringify(columnOrder));
        }
    }, [columnOrder]);

    // Add this near your other useEffect hooks (around line 400-500)
    useEffect(() => {
        // Handle browser refresh/close warning with native browser alert
        const handleBeforeUnload = (e) => {
            if (isInCustomerDetails) {
                // This will trigger the browser's native confirmation dialog
                const message = 'You are viewing customer details. Are you sure you want to leave?';
                e.preventDefault();
                e.returnValue = message;
                return message;
            }
        };

        // Handle keyboard refresh (F5, Ctrl+R, Ctrl+Shift+R) to show native alert
        const handleKeyDown = (e) => {
            if ((e.key === 'F5') ||
                (e.ctrlKey && e.key === 'r') ||
                (e.ctrlKey && e.shiftKey && e.key === 'R')) {

                if (isInCustomerDetails) {
                    e.preventDefault();
                    const message = 'You are viewing customer details. Are you sure you want to refresh the page?';
                    // Show browser's native confirmation
                    if (window.confirm(message)) {
                        window.location.reload();
                    }
                }
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isInCustomerDetails]);

    // Load recent remarks from sessionStorage when entering customer details
    useEffect(() => {
        if (showCustomerDetails) {
            setRecentRemarks(getRecentRemarks());
        }
    }, [showCustomerDetails]);

    // Tell the navbar we're on the customer info page so it can open Knowledge Bank
    // in a NEW tab only while a follow-up is being taken here. Cleared on leave/unmount.
    useEffect(() => {
        if (isInCustomerDetails) {
            sessionStorage.setItem('onCustomerInfoPage', 'true');
        } else {
            sessionStorage.removeItem('onCustomerInfoPage');
        }
        return () => sessionStorage.removeItem('onCustomerInfoPage');
    }, [isInCustomerDetails]);

    // Close remark suggestions dropdown when clicking outside OR on scroll
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (remarkDropdownRef.current && !remarkDropdownRef.current.contains(e.target)) {
                setActiveRemarkDropdown(null);
            }
        };
        // The dropdown is fixed-positioned, so any scroll (page or a nested
        // scroll container) would leave it floating away from its input.
        // Close it the moment the user scrolls anywhere.
        const handleScroll = () => setActiveRemarkDropdown(null);
        if (activeRemarkDropdown !== null) {
            document.addEventListener('mousedown', handleClickOutside);
            // capture: true so scrolls inside inner containers are caught too
            window.addEventListener('scroll', handleScroll, true);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, [activeRemarkDropdown]);

    // Filter and sort customers based on search, campaigns, flag, and sort config
    useEffect(() => {
        if (!customers.length) return;

        let filtered = [...customers];

        // Apply branch filter for non-admin users
        if (!isAdmin && userBranch && userBranch !== 'HO') {
            filtered = filtered.filter(customer => {
                if (!customer.branch_id) return true;
                return String(customer.branch_id) === String(userBranch);
            });
        }

        // Excel-style branch filter
        if (selectedBranches.length > 0) {
            filtered = filtered.filter(c => selectedBranches.includes(String(c.branch_id || '')));
        }

        // Warranty Expiry date range filter
        if (warrantyDateRange.from || warrantyDateRange.to) {
            filtered = filtered.filter(c => {
                if (!c.warranty_expiry_date) return false;
                const wDate = new Date(c.warranty_expiry_date);
                wDate.setHours(0, 0, 0, 0);

                if (warrantyDateRange.from) {
                    const from = new Date(warrantyDateRange.from);
                    from.setHours(0, 0, 0, 0);
                    if (wDate < from) return false;
                }
                if (warrantyDateRange.to) {
                    const to = new Date(warrantyDateRange.to);
                    to.setHours(23, 59, 59, 999);
                    if (wDate > to) return false;
                }
                return true;
            });
        }

        // Agreement End Date range filter
        if (agreementDateRange.from || agreementDateRange.to) {
            filtered = filtered.filter(c => {
                if (!c.agreement_end_date) return false;
                const aDate = new Date(c.agreement_end_date);
                aDate.setHours(0, 0, 0, 0);

                if (agreementDateRange.from) {
                    const from = new Date(agreementDateRange.from);
                    from.setHours(0, 0, 0, 0);
                    if (aDate < from) return false;
                }
                if (agreementDateRange.to) {
                    const to = new Date(agreementDateRange.to);
                    to.setHours(23, 59, 59, 999);
                    if (aDate > to) return false;
                }
                return true;
            });
        }

        // Campaign column filters - AND logic across campaigns, OR within single campaign's selected statuses
        const activeCampaignFilters = Object.entries(campaignColumnFilters)
            .filter(([_, statuses]) => statuses && statuses.length > 0);

        if (activeCampaignFilters.length > 0) {
            filtered = filtered.filter(customer => {
                // Row must match ALL active campaign filters
                return activeCampaignFilters.every(([campaignName, statuses]) => {
                    // Within a campaign, row matches if ANY selected status applies
                    return statuses.some(status => {
                        if (status === 'checkmark') return !!customer.campaign_checkmarks?.[campaignName];
                        if (status === 'transferred') return !!customer.campaign_transferred?.[campaignName];
                        if (status === 'wip') return customer.campaign_status?.[campaignName] === 'wip';
                        if (status === 'completed') return customer.campaign_status?.[campaignName] === 'completed';
                        if (status === 'not_connected') return customer.campaign_status?.[campaignName] === 'not_connected';
                        if (status === 'rejected') return customer.campaign_status?.[campaignName] === 'rejected';
                        if (status === 'rescheduled') return customer.campaign_status?.[campaignName] === 'rescheduled';
                        return false;
                    });
                });
            });
        }

        // ========== STEP 1: DATE RANGE CATEGORIZATION ==========
        let withinRangeRows = [];
        let outsideRangeRows = [];
        let noDateRows = [];

        if (fromDate || toDate) {
            filtered.forEach(customer => {
                if (!customer.next_followup_date) {
                    noDateRows.push(customer);
                    return;
                }

                const followupDate = new Date(customer.next_followup_date);
                followupDate.setHours(0, 0, 0, 0);
                let isInRange = false;

                if (fromDate && toDate) {
                    const from = new Date(fromDate);
                    from.setHours(0, 0, 0, 0);
                    const to = new Date(toDate);
                    to.setHours(23, 59, 59, 999);
                    isInRange = followupDate >= from && followupDate <= to;
                } else if (fromDate) {
                    const from = new Date(fromDate);
                    from.setHours(0, 0, 0, 0);
                    isInRange = followupDate >= from;
                } else if (toDate) {
                    const to = new Date(toDate);
                    to.setHours(23, 59, 59, 999);
                    isInRange = followupDate <= to;
                }

                if (isInRange) {
                    withinRangeRows.push(customer);
                } else {
                    outsideRangeRows.push(customer);
                }
            });

            withinRangeRows.sort((a, b) => {
                const dateA = a.next_followup_date ? new Date(a.next_followup_date).getTime() : 0;
                const dateB = b.next_followup_date ? new Date(b.next_followup_date).getTime() : 0;
                return dateA - dateB;
            });

            outsideRangeRows.sort((a, b) => {
                const dateA = a.next_followup_date ? new Date(a.next_followup_date).getTime() : 0;
                const dateB = b.next_followup_date ? new Date(b.next_followup_date).getTime() : 0;
                return dateA - dateB;
            });

            noDateRows.sort((a, b) => {
                const aCampaignCount = a.campaigns?.length || 0;
                const bCampaignCount = b.campaigns?.length || 0;
                return bCampaignCount - aCampaignCount;
            });

            filtered = [...withinRangeRows, ...outsideRangeRows, ...noDateRows];
        } else {
            filtered.sort((a, b) => {
                const dateA = a.next_followup_date ? new Date(a.next_followup_date).getTime() : 0;
                const dateB = b.next_followup_date ? new Date(b.next_followup_date).getTime() : 0;
                return dateA - dateB;
            });
        }

        // Build O(1) lookup sets ONCE — replaces O(n²) .some() calls in steps 3 & 4
        const withinRangeIdsSet = new Set(withinRangeRows.map(c => c.customer_id));
        const outsideRangeIdsSet = new Set(outsideRangeRows.map(c => c.customer_id));
        const noDateIdsSet = new Set(noDateRows.map(c => c.customer_id));

        // ========== STEP 2: SEARCH FILTER ==========
        if (searchTerm) {
            const term = searchTerm.toLowerCase().trim();

            // ✅ Instance ID exact/starts-with match → prioritize these rows first
            const instanceExact = [];
            const instancePartial = [];
            const otherMatches = [];

            filtered.forEach(customer => {
                const instanceId = customer.instance_id?.toLowerCase() || '';

                if (instanceId === term || instanceId.startsWith(term)) {
                    instanceExact.push(customer);
                } else if (instanceId.includes(term)) {
                    instancePartial.push(customer);
                } else if (
                    customer.customer_name?.toLowerCase().includes(term) ||
                    customer.mobile?.includes(searchTerm) ||
                    customer.email?.toLowerCase().includes(term) ||
                    customer.contact_person?.toLowerCase().includes(term) ||
                    customer.last_followup_user?.toLowerCase().includes(term)
                ) {
                    otherMatches.push(customer);
                }
            });

            filtered = [...instanceExact, ...instancePartial, ...otherMatches];
        }

        // ========== STEP 3: CAMPAIGN FILTER ==========
        if (selectedCampaigns.length > 0) {
            let tempWithinRange = [];
            let tempOutsideRange = [];
            let tempNoDate = [];

            filtered.forEach(customer => {
                const wasInWithinRange = withinRangeIdsSet.has(customer.customer_id);
                const wasInOutsideRange = outsideRangeIdsSet.has(customer.customer_id);
                const wasInNoDate = noDateIdsSet.has(customer.customer_id);

                if (wasInWithinRange) {
                    tempWithinRange.push(customer);
                } else if (wasInOutsideRange) {
                    tempOutsideRange.push(customer);
                } else if (wasInNoDate) {
                    tempNoDate.push(customer);
                } else {
                    tempNoDate.push(customer);
                }
            });

            tempWithinRange = tempWithinRange.filter(customer => {
                const matchCount = selectedCampaigns.filter(campaign =>
                    customer.campaigns?.includes(campaign)
                ).length;
                return matchCount > 0;
            });

            tempOutsideRange = tempOutsideRange.filter(customer => {
                const matchCount = selectedCampaigns.filter(campaign =>
                    customer.campaigns?.includes(campaign)
                ).length;
                return matchCount > 0;
            });

            tempNoDate = tempNoDate.filter(customer => {
                const matchCount = selectedCampaigns.filter(campaign =>
                    customer.campaigns?.includes(campaign)
                ).length;
                return matchCount > 0;
            });

            tempWithinRange.sort((a, b) => {
                const aMatches = selectedCampaigns.filter(campaign => a.campaigns?.includes(campaign)).length;
                const bMatches = selectedCampaigns.filter(campaign => b.campaigns?.includes(campaign)).length;

                if (aMatches === bMatches) {
                    const dateA = a.next_followup_date ? new Date(a.next_followup_date).getTime() : 0;
                    const dateB = b.next_followup_date ? new Date(b.next_followup_date).getTime() : 0;
                    return dateA - dateB;
                }
                return bMatches - aMatches;
            });

            tempOutsideRange.sort((a, b) => {
                const aMatches = selectedCampaigns.filter(campaign => a.campaigns?.includes(campaign)).length;
                const bMatches = selectedCampaigns.filter(campaign => b.campaigns?.includes(campaign)).length;

                if (aMatches === bMatches) {
                    const dateA = a.next_followup_date ? new Date(a.next_followup_date).getTime() : 0;
                    const dateB = b.next_followup_date ? new Date(b.next_followup_date).getTime() : 0;
                    return dateA - dateB;
                }
                return bMatches - aMatches;
            });

            tempNoDate.sort((a, b) => {
                const aMatches = selectedCampaigns.filter(campaign => a.campaigns?.includes(campaign)).length;
                const bMatches = selectedCampaigns.filter(campaign => b.campaigns?.includes(campaign)).length;
                return bMatches - aMatches;
            });

            filtered = [...tempWithinRange, ...tempOutsideRange, ...tempNoDate];
        } else if (fromDate || toDate) {
            let tempWithinRange = [];
            let tempOutsideRange = [];
            let tempNoDate = [];

            filtered.forEach(customer => {
                const wasInWithinRange = withinRangeIdsSet.has(customer.customer_id);
                const wasInOutsideRange = outsideRangeIdsSet.has(customer.customer_id);
                const wasInNoDate = noDateIdsSet.has(customer.customer_id);

                if (wasInWithinRange) {
                    tempWithinRange.push(customer);
                } else if (wasInOutsideRange) {
                    tempOutsideRange.push(customer);
                } else {
                    tempNoDate.push(customer);
                }
            });

            filtered = [...tempWithinRange, ...tempOutsideRange, ...tempNoDate];
        }

        // ========== STEP 4: FLAG (C1–C7) + STATUS (NC/R/WIP/FR) FILTERS — INDEPENDENT ==========
        // The two filters are combined with AND: a row must satisfy BOTH the active flag chip
        // and the active status chip. Either one set to 'all' is a no-op for that filter.
        if (selectedFlag !== 'all' || selectedStatus !== 'all') {
            // Flag predicate — C1..C7 only.
            const matchesSelectedFlag = (customer) => {
                if (selectedFlag === 'all') return true;
                return !!customer.followup_flags?.[selectedFlag];
            };

            // Status predicate — NC / R / WIP / FR only (respects selected drives + branch).
            const matchesSelectedStatus = (customer) => {
                if (selectedStatus === 'all') return true;
                const statusKey =
                    selectedStatus === 'NC' ? 'not_connected'
                        : selectedStatus === 'R' ? 'rejected'
                            : selectedStatus === 'WIP' ? 'wip'
                                : selectedStatus === 'FR' ? 'rescheduled'
                                    : null;
                if (!statusKey) return true;
                const status = customer.campaign_status || {};
                if (selectedCampaigns.length > 0) {
                    return selectedCampaigns.some(camp => status[camp] === statusKey);
                }
                return Object.values(status).some(s => s === statusKey);
            };

            const matchesBoth = (c) => matchesSelectedFlag(c) && matchesSelectedStatus(c);

            let tempWithinRange = [];
            let tempOutsideRange = [];
            let tempNoDate = [];

            filtered.forEach(customer => {
                const wasInWithinRange = withinRangeIdsSet.has(customer.customer_id);
                const wasInOutsideRange = outsideRangeIdsSet.has(customer.customer_id);
                const wasInNoDate = noDateIdsSet.has(customer.customer_id);

                if (wasInWithinRange) {
                    tempWithinRange.push(customer);
                } else if (wasInOutsideRange) {
                    tempOutsideRange.push(customer);
                } else if (wasInNoDate) {
                    tempNoDate.push(customer);
                } else {
                    tempNoDate.push(customer);
                }
            });

            tempWithinRange = tempWithinRange.filter(matchesBoth);
            tempOutsideRange = tempOutsideRange.filter(matchesBoth);
            tempNoDate = tempNoDate.filter(matchesBoth);

            filtered = [...tempWithinRange, ...tempOutsideRange, ...tempNoDate];
        }

        // ========== STEP 5: ENHANCED SORTING - CUSTOMERS WITH FOLLOW-UPS FIRST ==========
        if (!fromDate && !toDate) {
            const customersWithFollowups = [];
            const customersWithoutFollowups = [];

            filtered.forEach(customer => {
                const hasFollowups = customer.has_followups === true ||
                    customer.last_followup_date !== null ||
                    customer.last_followup_remark !== null ||
                    (customer.followup_count && customer.followup_count > 0);

                if (hasFollowups) {
                    customersWithFollowups.push(customer);
                } else {
                    customersWithoutFollowups.push(customer);
                }
            });

            customersWithFollowups.sort((a, b) => {
                const aCampaignCount = a.campaigns?.length || 0;
                const bCampaignCount = b.campaigns?.length || 0;

                if (aCampaignCount !== bCampaignCount) {
                    return bCampaignCount - aCampaignCount;
                }

                const aDate = a.next_followup_date ? new Date(a.next_followup_date).getTime() : Number.MAX_SAFE_INTEGER;
                const bDate = b.next_followup_date ? new Date(b.next_followup_date).getTime() : Number.MAX_SAFE_INTEGER;

                return aDate - bDate;
            });

            customersWithoutFollowups.sort((a, b) => {
                const aCampaignCount = a.campaigns?.length || 0;
                const bCampaignCount = b.campaigns?.length || 0;

                if (aCampaignCount !== bCampaignCount) {
                    return bCampaignCount - aCampaignCount;
                }

                const aName = a.customer_name || '';
                const bName = b.customer_name || '';

                return aName.localeCompare(bName);
            });

            filtered = [...customersWithFollowups, ...customersWithoutFollowups];
        }

        // ========== STEP 6: USER SORTING (overrides all default sorting) ==========
        if (sortConfig.key) {
            const dir = sortConfig.direction === 'asc' ? 1 : -1;

            // A value counts as "blank" if it is null / undefined / empty string.
            const isBlankVal = (v) => v === null || v === undefined || v === '';

            filtered.sort((a, b) => {
                // --- Campaign columns keep their own multi-level logic ---
                if (sortConfig.key.startsWith('campaign_')) {
                    const campaignName = sortConfig.key.replace('campaign_', '');

                    const aInCampaign = a.campaigns?.includes(campaignName) || false;
                    const bInCampaign = b.campaigns?.includes(campaignName) || false;
                    if (aInCampaign !== bInCampaign) {
                        return sortConfig.direction === 'asc'
                            ? (aInCampaign ? -1 : 1)
                            : (aInCampaign ? 1 : -1);
                    }

                    const aIsTransferred = a.campaign_transferred?.[campaignName] || false;
                    const bIsTransferred = b.campaign_transferred?.[campaignName] || false;
                    if (aIsTransferred !== bIsTransferred) {
                        return sortConfig.direction === 'asc'
                            ? (aIsTransferred ? -1 : 1)
                            : (aIsTransferred ? 1 : -1);
                    }

                    const statusOrder = { 'wip': 1, 'completed': 2, 'rejected': 3 };
                    const aOrder = statusOrder[a.campaign_status?.[campaignName]] || 0;
                    const bOrder = statusOrder[b.campaign_status?.[campaignName]] || 0;
                    if (aOrder !== bOrder) {
                        return sortConfig.direction === 'asc' ? aOrder - bOrder : bOrder - aOrder;
                    }

                    const dateA = a.next_followup_date ? new Date(a.next_followup_date).getTime() : 0;
                    const dateB = b.next_followup_date ? new Date(b.next_followup_date).getTime() : 0;
                    return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
                }

                // --- Flags column: rows with NO flag always sink to the bottom ---
                if (sortConfig.key === 'flags') {
                    const getFlagPriority = (flags) => {
                        if (!flags) return 99;
                        if (flags.C1) return 1;
                        if (flags.C2) return 2;
                        if (flags.C3) return 3;
                        if (flags.C4) return 4;
                        if (flags.C5) return 5;
                        if (flags.C6) return 6;
                        if (flags.C7) return 7;
                        return 99;
                    };
                    const aP = getFlagPriority(a.followup_flags);
                    const bP = getFlagPriority(b.followup_flags);
                    const aNo = aP === 99, bNo = bP === 99;
                    if (aNo && bNo) return 0;
                    if (aNo) return 1;     // no flag -> bottom
                    if (bNo) return -1;    // no flag -> bottom
                    return (aP - bP) * dir;
                }

                // --- Pick the raw value for the remaining columns ---
                let aRaw, bRaw, isDate = false;
                switch (sortConfig.key) {
                    case 'instance_id': aRaw = a.instance_id; bRaw = b.instance_id; break;
                    case 'customer_name': aRaw = a.customer_name; bRaw = b.customer_name; break;
                    case 'branch_id': aRaw = a.branch_id; bRaw = b.branch_id; break;
                    case 'last_followup_user': aRaw = a.last_followup_user; bRaw = b.last_followup_user; break;
                    case 'remark': aRaw = a.last_followup_remark; bRaw = b.last_followup_remark; break;
                    case 'warranty_expiry': aRaw = a.warranty_expiry_date; bRaw = b.warranty_expiry_date; isDate = true; break;
                    case 'agreement_end_date': aRaw = a.agreement_end_date; bRaw = b.agreement_end_date; isDate = true; break;
                    case 'last_followup_date': aRaw = a.last_followup_date; bRaw = b.last_followup_date; isDate = true; break;
                    case 'next_followup_date': aRaw = a.next_followup_date; bRaw = b.next_followup_date; isDate = true; break;
                    default:
                        return 0;
                }

                // --- Blank handling: blank rows ALWAYS go to the bottom, never sorted in ---
                const aBlank = isBlankVal(aRaw);
                const bBlank = isBlankVal(bRaw);
                if (aBlank && bBlank) return 0;
                if (aBlank) return 1;
                if (bBlank) return -1;

                // --- Compare only the real (non-blank) values ---
                if (isDate) {
                    return (new Date(aRaw).getTime() - new Date(bRaw).getTime()) * dir;
                }
                return String(aRaw).localeCompare(String(bRaw), undefined, { numeric: true, sensitivity: 'base' }) * dir;
            });
        }

        setFilteredCustomers(filtered);
        setTotalCount(filtered.length);

        // ✅ If searching, show ALL results instantly (no lazy loading needed for filtered set)
        if (searchTerm) {
            setDisplayedCustomers(filtered);
            setHasMore(false);
        } else {
            // When a sort is active, keep the same number of rows already loaded
            // so the table re-orders in place instead of collapsing/scrolling (no flicker).
            const keepCount = sortConfig.key
                ? Math.max(displayedCustomers.length, ITEMS_PER_PAGE)
                : ITEMS_PER_PAGE;
            const sliceEnd = Math.min(keepCount, filtered.length);
            setDisplayedCustomers(filtered.slice(0, sliceEnd));
            setHasMore(sliceEnd < filtered.length);
        }

        const counts = { C1: 0, C2: 0, C3: 0, C4: 0, C5: 0, C6: 0, C7: 0 };

        let visibleCustomers = [...customers];

        // Branch filter for non-admin users
        if (!isAdmin && userBranch && userBranch !== 'HO') {
            visibleCustomers = visibleCustomers.filter(customer => {
                if (!customer.branch_id) return true;
                return String(customer.branch_id) === String(userBranch);
            });
        }

        // If specific campaigns are selected, only count flags for customers in those campaigns
        if (selectedCampaigns.length > 0) {
            visibleCustomers = visibleCustomers.filter(customer =>
                selectedCampaigns.some(campaign => customer.campaigns?.includes(campaign))
            );
        }

        visibleCustomers.forEach(customer => {
            if (customer.followup_flags?.C1) counts.C1++;
            if (customer.followup_flags?.C2) counts.C2++;
            if (customer.followup_flags?.C3) counts.C3++;
            if (customer.followup_flags?.C4) counts.C4++;
            if (customer.followup_flags?.C5) counts.C5++;
            if (customer.followup_flags?.C6) counts.C6++;
            if (customer.followup_flags?.C7) counts.C7++;
        });
        setFlagCounts(counts);
    }, [searchTerm, customers, selectedCampaigns, selectedFlag, selectedStatus, sortConfig, isAdmin, userBranch, fromDate, toDate, selectedBranches, campaignColumnFilters, warrantyDateRange, agreementDateRange]);

    // R (Rejected) count — respects campaign + branch filters
    const rejectedCount = useMemo(() => {
        let visible = [...customers];

        // Branch restriction for non-admins
        if (!isAdmin && userBranch && userBranch !== 'HO') {
            visible = visible.filter(c => !c.branch_id || String(c.branch_id) === String(userBranch));
        }

        // Branch filter from header
        if (selectedBranches.length > 0) {
            visible = visible.filter(c => selectedBranches.includes(String(c.branch_id || '')));
        }

        let count = 0;
        visible.forEach(customer => {
            const status = customer.campaign_status || {};
            if (selectedCampaigns.length > 0) {
                // Only count rejected status from selected campaigns
                selectedCampaigns.forEach(camp => {
                    if (status[camp] === 'rejected') count++;
                });
            } else {
                // All campaigns → count every rejected status
                Object.values(status).forEach(s => {
                    if (s === 'rejected') count++;
                });
            }
        });

        return count;
    }, [customers, selectedCampaigns, selectedBranches, isAdmin, userBranch]);

    // NC (Not connected) count — loaded customers whose latest drive status is "not_connected"
    // (respects branch + selected-drive filters, mirrors the Rejected count)
    const notConnectedCount = useMemo(() => {
        let visible = [...customers];
        if (!isAdmin && userBranch && userBranch !== 'HO') {
            visible = visible.filter(c => !c.branch_id || String(c.branch_id) === String(userBranch));
        }
        if (selectedBranches.length > 0) {
            visible = visible.filter(c => selectedBranches.includes(String(c.branch_id || '')));
        }

        let count = 0;
        visible.forEach(customer => {
            const status = customer.campaign_status || {};
            if (selectedCampaigns.length > 0) {
                // Only count not-connected status from selected drives
                selectedCampaigns.forEach(camp => {
                    if (status[camp] === 'not_connected') count++;
                });
            } else {
                // All drives → count every not-connected status
                Object.values(status).forEach(s => {
                    if (s === 'not_connected') count++;
                });
            }
        });

        return count;
    }, [customers, selectedCampaigns, selectedBranches, isAdmin, userBranch]);

    // WIP (Work in Progress) count — mirrors the Not connected / Rejected counts
    const wipCount = useMemo(() => {
        let visible = [...customers];
        if (!isAdmin && userBranch && userBranch !== 'HO') {
            visible = visible.filter(c => !c.branch_id || String(c.branch_id) === String(userBranch));
        }
        if (selectedBranches.length > 0) {
            visible = visible.filter(c => selectedBranches.includes(String(c.branch_id || '')));
        }

        let count = 0;
        visible.forEach(customer => {
            const status = customer.campaign_status || {};
            if (selectedCampaigns.length > 0) {
                selectedCampaigns.forEach(camp => {
                    if (status[camp] === 'wip') count++;
                });
            } else {
                Object.values(status).forEach(s => {
                    if (s === 'wip') count++;
                });
            }
        });

        return count;
    }, [customers, selectedCampaigns, selectedBranches, isAdmin, userBranch]);

    // FR (Follow-up Reschedule) count — mirrors the Not connected / Rejected counts
    const rescheduledCount = useMemo(() => {
        let visible = [...customers];
        if (!isAdmin && userBranch && userBranch !== 'HO') {
            visible = visible.filter(c => !c.branch_id || String(c.branch_id) === String(userBranch));
        }
        if (selectedBranches.length > 0) {
            visible = visible.filter(c => selectedBranches.includes(String(c.branch_id || '')));
        }

        let count = 0;
        visible.forEach(customer => {
            const status = customer.campaign_status || {};
            if (selectedCampaigns.length > 0) {
                selectedCampaigns.forEach(camp => {
                    if (status[camp] === 'rescheduled') count++;
                });
            } else {
                Object.values(status).forEach(s => {
                    if (s === 'rescheduled') count++;
                });
            }
        });

        return count;
    }, [customers, selectedCampaigns, selectedBranches, isAdmin, userBranch]);

    const relatedAssets = useMemo(() => {
        if (!customerDetails) return [];
        let assets = serverRelatedAssets || [];

        // Same branch rule as the main customer list:
        // non-admin + has branch + not HO  →  only show assets of that branch.
        // Assets with no branch_id stay visible (matches existing behavior).
        if (!isAdmin && userBranch && userBranch !== 'HO') {
            assets = assets.filter(a => {
                if (!a.branch_id) return true;
                return String(a.branch_id) === String(userBranch);
            });
        }

        return assets;
    }, [customerDetails, serverRelatedAssets, isAdmin, userBranch]);

    // Campaigns this customer is NOT enrolled in
    const notEnrolledCampaigns = useMemo(() => {
        const enrolledIds = new Set(customerCampaigns.map(c => c.id));
        return (allCampaigns || []).filter(c => !enrolledIds.has(c.id));
    }, [allCampaigns, customerCampaigns]);

    // Enrolled + not-enrolled, used so a selected "other" campaign resolves correctly
    const selectableCampaigns = useMemo(
        () => [...customerCampaigns, ...notEnrolledCampaigns],
        [customerCampaigns, notEnrolledCampaigns]
    );

    // True when a drive is a CSP product (the Subtype column applies to these only).
    // Adjust the match if your CSP drive is named/serviced differently.
    const isCspCampaign = (campaign) =>
        `${campaign?.service || ''} ${campaign?.name || ''}`.toUpperCase().includes('CSP');

    // Auto subtype for this customer:
    //   1) CSP Info box → "SR Subtype" column (first non-blank)
    //   2) else SR Details box → "Last Oil Change SR Sub Type" (first non-blank)
    const getCspAutoSubtype = () => {
        const fromCsp = (cspInfo || []).map(r => (r.sr_subtype || '').trim()).find(Boolean);
        if (fromCsp) return fromCsp;
        const fromService = (customerServices || []).map(s => (s.last_oil_change_sr_sub_type || '').trim()).find(Boolean);
        return fromService || '';
    };

    // Subtype column shows when at least one selected drive is a CSP product
    const showCspSubtypeGlobal = selectedCampaignsForFollowup.some(campaignId => {
        if (campaignId === 'other') return false;
        const campaign = selectableCampaigns.find(c => c.id === parseInt(campaignId));
        return isCspCampaign(campaign);
    });

    // Services available for "Other" (non-campaign) follow-ups — derived from all campaigns
    const campaignServices = useMemo(() => {
        const seen = new Set();
        const list = [];
        (allCampaigns || []).forEach(c => {
            const name = (c.service || '').trim();
            if (name && !seen.has(name.toLowerCase())) {
                seen.add(name.toLowerCase());
                list.push({ id: c.id, name });
            }
        });
        return list;
    }, [allCampaigns]);

    // Short "Product - N" display names — built once, O(1) lookups (never slows the table).
    const campaignShortNameMap = useMemo(
        () => buildCampaignShortNames(campaignsCatalog),
        [campaignsCatalog]
    );
    const getCampaignShortName = useCallback(
        (name) => campaignShortNameMap[name]?.shortName || name,
        [campaignShortNameMap]
    );

    const fetchEngagementData = async () => {
        setLoading(true);
        const loadingToast = toast.loading('Loading engagement data...');
        try {
            let url = `${API_BASE_URL}/v1/engagement/customers`;
            const params = [];

            if (params.length) url += '?' + params.join('&');

            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch engagement data');
            const data = await response.json();

            setActiveCampaigns(data.active_campaigns || []);

            let customersWithCampaigns = (data.customers || []).filter(c => c.campaigns && c.campaigns.length > 0);

            // Apply branch filter for non-admin users
            if (!isAdmin && userBranch && userBranch !== 'HO') {
                customersWithCampaigns = customersWithCampaigns.filter(customer => {
                    // Show if branch_id matches user's branch OR branch_id is null/undefined
                    if (!customer.branch_id) {
                        return true;
                    }
                    const match = String(customer.branch_id) === String(userBranch);
                    return match;
                });
            }

            setCustomers(customersWithCampaigns);
            setDisplayedCustomers(customersWithCampaigns.slice(0, ITEMS_PER_PAGE));
            setHasMore(customersWithCampaigns.length > ITEMS_PER_PAGE);
            setPage(1);

            toast.dismiss(loadingToast);

            fetchCampaignColors();
        } catch (err) {
            toast.dismiss(loadingToast);
            toast.error(err.message || 'Failed to load engagement data');
        } finally {
            setLoading(false);
        }
    };

    // Add this function with other handler functions
    const handleTogglePdfSize = () => {
        if (!isPdfPanelExpanded) {
            setPdfPanelWidth('w-96 sm:w-[800px]'); // Expanded width for better readability
            setIsPdfPanelExpanded(true);
        } else {
            setPdfPanelWidth('w-64 sm:w-96'); // Original width
            setIsPdfPanelExpanded(false);
        }
    };

    // Replace your existing lastCustomerRef with this improved version
    const lastCustomerRef = useCallback(node => {
        if (loadingMore) return;

        if (observerRef.current) {
            observerRef.current.disconnect();
        }

        observerRef.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore && !loadingMore) {
                loadMoreCustomers();
            }
        }, {
            root: tableContainerRef.current,
            rootMargin: '100px',
            threshold: 0.1
        });

        if (node) {
            observerRef.current.observe(node);
        }
    }, [loadingMore, hasMore, filteredCustomers]);

    const loadMoreCustomers = () => {
        if (loadingMore || !hasMore) return;

        setLoadingMore(true);

        // Use setTimeout to prevent UI blocking
        setTimeout(() => {
            try {
                const nextPage = page + 1;
                const start = page * ITEMS_PER_PAGE;
                const end = start + ITEMS_PER_PAGE;
                const newCustomers = filteredCustomers.slice(start, end);

                if (newCustomers.length > 0) {
                    setDisplayedCustomers(prev => [...prev, ...newCustomers]);
                    setPage(nextPage);
                    setHasMore(end < filteredCustomers.length);
                } else {
                    setHasMore(false);
                }
            } catch (error) {
                console.error('Error loading more customers:', error);
                toast.error('Failed to load more customers');
            } finally {
                setLoadingMore(false);
            }
        }, 100);
    };

    const fetchCampaignColors = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/v1/campaigns/`);
            if (!response.ok) throw new Error('Failed to fetch campaigns');
            const campaigns = await response.json();

            const colors = {};
            campaigns.forEach(campaign => {
                colors[campaign.name] = campaign.color || '#406093';
            });
            setCampaignColors(colors);
            // Only ACTIVE drives feed the short "Product (N)" names — keeps the
            // numbering identical to the navbar Drive List (which is active-only too).
            setCampaignsCatalog(Array.isArray(campaigns) ? campaigns.filter(isCampaignActive) : []);
        } catch (err) {
            console.error('Error fetching drive colors:', err);
        }
    };

    // Fetch customer complete data by instance_id
    const fetchCustomerCompleteData = async (instanceId) => {
        setLoadingCompleteData(true);
        try {
            const response = await fetch(`${API_BASE_URL}/customers/instance/${instanceId}/complete-data`);
            if (!response.ok) throw new Error('Failed to fetch customer complete data');
            const data = await response.json();
            setCustomerCompleteData(data);
        } catch (err) {
            console.error('Error fetching customer complete data:', err);
            toast.error('Failed to load customer complete data');
        } finally {
            setLoadingCompleteData(false);
        }
    };

    const fetchCustomerDetails = async (customerId) => {
        setLoading(true);
        const loadingToast = toast.loading('Loading customer details...');
        try {
            // Pull instance_id from existing list so we can fire ALL 3 fetches in true parallel
            const listCustomer = customers.find(c => c.customer_id === customerId);
            const instanceIdFromList = listCustomer?.instance_id;

            // Kick off all parallel fetches BEFORE awaiting anything
            const detailsPromise = fetch(`${API_BASE_URL}/v1/engagement/customers/${customerId}`);
            const nonFollowupsPromise = fetch(`${API_BASE_URL}/v1/engagement/customers/${customerId}/non-followups`);

            const completeDataPromise = instanceIdFromList
                ? fetch(`${API_BASE_URL}/customers/instance/${instanceIdFromList}/complete-data`)
                    .then(r => (r.ok ? r.json() : null))
                    .catch(() => null)
                : null; // fallback below if list didn't have instance_id

            const editInfoPromise = fetch(`${API_BASE_URL}/v1/edit-customer/customers/${customerId}/with-edit-info`)
                .then(r => (r.ok ? r.json() : null))
                .catch(() => null);

            // Show secondary spinners while parallel fetches run
            setLoadingCompleteData(true);
            setLoadingEditInfo(true);

            // Wait for primary details + non-followups (controls main UI)
            const [response, nonFollowupsResponse] = await Promise.all([detailsPromise, nonFollowupsPromise]);
            if (!response.ok) throw new Error('Failed to fetch customer details');
            const data = await response.json();

            let nonFollowups = [];
            if (nonFollowupsResponse.ok) {
                nonFollowups = await nonFollowupsResponse.json();
            }

            // User navigated back while this fetch was still running → abort,
            // so we don't re-open the customer details view (prevents the jump).
            if (activeCustomerRequestRef.current !== customerId) {
                toast.dismiss(loadingToast);
                setLoading(false);
                setLoadingCompleteData(false);
                setLoadingEditInfo(false);
                return;
            }

            const customerData = {
                ...data.customer,
                customer_id: data.customer?.id || customerId,
                last_updated_by: data.customer?.last_updated_by,
                branch_id: data.customer?.branch_id
            };

            setCustomerDetails(customerData);

            const sortedFollowups = [...(data.followups || []), ...nonFollowups].sort((a, b) =>
                new Date(b.followup_date) - new Date(a.followup_date)
            );
            setCustomerFollowups(sortedFollowups);
            setCustomerServices(data.services || []);
            setCustomerLmsData(data.lms_data || []);

            const assignedCampaigns = data.campaigns || [];
            const everyCampaign = data.all_campaigns || [];
            setCustomerCampaigns(assignedCampaigns.length > 0 ? assignedCampaigns : everyCampaign);
            setAllCampaigns(everyCampaign);

            // Related assets are now pre-computed by the backend (one indexed query)
            setServerRelatedAssets(data.related_assets || []);

            // CSP Info (only present when customer is in a CSP campaign)
            setCspInfo(data.csp_info || []);
            setSelectedCustomer(customerId);
            setShowCustomerDetails(true);
            setCampaignPdfs([]);
            setSelectedPdf(null);
            setShowPdfViewer(false);

            toast.dismiss(loadingToast);
            setLoading(false);

            // If list didn't have instance_id, fire complete-data fetch now using the freshly loaded one
            const finalCompleteDataPromise = completeDataPromise
                ? completeDataPromise
                : (customerData.instance_id
                    ? fetch(`${API_BASE_URL}/customers/instance/${customerData.instance_id}/complete-data`)
                        .then(r => (r.ok ? r.json() : null))
                        .catch(() => null)
                    : Promise.resolve(null));

            // Resolve the already-running parallel promises (no extra wait if list had instance_id)
            const [completeData, editInfo] = await Promise.all([finalCompleteDataPromise, editInfoPromise]);

            if (completeData) setCustomerCompleteData(completeData);
            setLoadingCompleteData(false);

            if (editInfo) setCustomerEditInfo(editInfo);
            setLoadingEditInfo(false);

        } catch (err) {
            toast.dismiss(loadingToast);
            toast.error(err.message || 'Failed to load customer details');
            setLoading(false);
            setLoadingCompleteData(false);
            setLoadingEditInfo(false);
        }
    };

    // Check if next followup date is today or overdue
    const isFollowupOverdue = (nextFollowupDate) => {
        if (!nextFollowupDate) return false;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const followupDate = new Date(nextFollowupDate);
        followupDate.setHours(0, 0, 0, 0);

        return followupDate <= today;
    };

    // Function to save customer edit WITHOUT modifying original data
    const handleSaveCustomerEdit = async (e) => {
        e.preventDefault();

        setEditCustomerLoading(true);
        const toastId = toast.loading('Saving customer edits...');

        try {
            // Get user ID and name
            const userId = currentUser?.user_id || currentUser?.id;
            const userName = currentUser?.name || currentUser?.username || 'Unknown User';

            if (!userId) {
                throw new Error('User ID not found');
            }

            // Prepare edit data
            const editData = {
                customer_name: editCustomerForm.customer_name || null,
                phone_number: editCustomerForm.phone_number || null,
                email: editCustomerForm.email || null,
                pan_number: editCustomerForm.pan_number || null,
                location: editCustomerForm.location || null,
                user_id: userId,
                user_name: userName
            };

            // Call the new edit history API
            const response = await fetch(
                `${API_BASE_URL}/v1/edit-customer/customers/${selectedCustomer}/save-edit`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(editData)
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to save customer edits');
            }

            const savedEdit = await response.json();

            toast.dismiss(toastId);
            toast.success('Customer edits saved successfully!');
            setShowEditCustomerModal(false);

            // Refresh customer details to show updated info
            if (selectedCustomer) {
                await fetchCustomerDetails(selectedCustomer);
                // Also fetch edit info to show history
                await fetchCustomerEditInfo(selectedCustomer);
            }
        } catch (err) {
            toast.dismiss(toastId);
            toast.error(err.message || 'Failed to save customer edits');
        } finally {
            setEditCustomerLoading(false);
        }
    };

    // Fetch customer edit information
    const fetchCustomerEditInfo = async (customerId) => {
        setLoadingEditInfo(true);
        try {
            const response = await fetch(
                `${API_BASE_URL}/v1/edit-customer/customers/${customerId}/with-edit-info`
            );

            if (!response.ok) {
                if (response.status !== 404) {
                    throw new Error('Failed to fetch customer edit info');
                }
                return;
            }

            const data = await response.json();
            setCustomerEditInfo(data);
        } catch (err) {
            console.error('Error fetching customer edit info:', err);
        } finally {
            setLoadingEditInfo(false);
        }
    };

    // Drag handlers for PDF panel
    const handleDragStart = (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
        setIsDragging(true);
        dragStartPos.current = {
            x: e.clientX - panelPosition.x,
            y: e.clientY - panelPosition.y
        };
    };

    const handleDragMove = useCallback((e) => {
        if (!isDragging) return;

        e.preventDefault();

        // Calculate new position
        let newX = e.clientX - dragStartPos.current.x;
        let newY = e.clientY - dragStartPos.current.y;

        // Boundary constraints
        const panelWidth = isPdfPanelMinimized ? 288 : 384;
        const panelHeight = isPdfPanelMinimized ? 48 : 600;

        newX = Math.max(0, Math.min(newX, window.innerWidth - panelWidth));
        newY = Math.max(0, Math.min(newY, window.innerHeight - panelHeight));

        setPanelPosition({ x: newX, y: newY });
    }, [isDragging, isPdfPanelMinimized]);

    const handleDragEnd = useCallback(() => {
        setIsDragging(false);
    }, []);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (campaignFilterRef.current && !campaignFilterRef.current.contains(e.target)) {
                setOpenCampaignFilter(null);
            }
        };
        if (openCampaignFilter) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [openCampaignFilter]);

    // Close Branch filter when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (branchFilterRef.current && !branchFilterRef.current.contains(e.target)) {
                setShowBranchFilter(false);
            }
        };
        if (showBranchFilter) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showBranchFilter]);

    // Close Warranty Expiry filter when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (warrantyFilterRef.current && !warrantyFilterRef.current.contains(e.target)) {
                setShowWarrantyFilter(false);
            }
        };
        if (showWarrantyFilter) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showWarrantyFilter]);

    // Close Agreement End filter when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (agreementFilterRef.current && !agreementFilterRef.current.contains(e.target)) {
                setShowAgreementFilter(false);
            }
        };
        if (showAgreementFilter) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showAgreementFilter]);

    // Function to remove customer from a campaign
    const removeCustomerFromCampaign = async (campaignId, customerId) => {
        try {
            const response = await fetch(
                `${API_BASE_URL}/v1/engagement/campaigns/${campaignId}/customers/${customerId}`,
                {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' }
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to remove customer from campaign');
            }

            return true;
        } catch (err) {
            console.error('Remove error:', err);
            throw err;
        }
    };

    // Add drag event listeners
    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleDragMove);
            window.addEventListener('mouseup', handleDragEnd);
        } else {
            window.removeEventListener('mousemove', handleDragMove);
            window.removeEventListener('mouseup', handleDragEnd);
        }

        return () => {
            window.removeEventListener('mousemove', handleDragMove);
            window.removeEventListener('mouseup', handleDragEnd);
        };
    }, [isDragging, handleDragMove, handleDragEnd]);

    const handleViewCustomer = (customerId) => {
        // Mark this customer as the one the user actively opened.
        // fetchCustomerDetails no longer sets this, so a post-save refetch
        // after Back was clicked will NOT re-open the details view.
        activeCustomerRequestRef.current = customerId;

        // Save current scroll position + how many rows are loaded, so Back can restore
        // the same view (same rows, same scroll) instead of snapping to the top.
        if (tableContainerRef.current) {
            savedScrollPosition.current = tableContainerRef.current.scrollTop;
        }
        savedDisplayCount.current = displayedCustomers.length;

        // Pre-populate from list data so the Customer Info box renders instantly
        const listCustomer = customers.find(c => c.customer_id === customerId);
        if (listCustomer) {
            setCustomerDetails({
                id: customerId,
                customer_id: customerId,
                instance_id: listCustomer.instance_id,
                customer_name: listCustomer.customer_name,
                phone_number: listCustomer.mobile,
                email: listCustomer.email,
                branch_id: listCustomer.branch_id,
                location: null,
                pan_number: null,
            });
        }
        // Reset stale data from previous customer so old boxes don't flash
        setCustomerCompleteData(null);
        setCustomerEditInfo(null);
        setServerRelatedAssets([]);
        setCspInfo([]);

        setIsInCustomerDetails(true);
        setShowCustomerDetails(true); // Show the page shell immediately
        setSelectedCustomer(customerId);
        fetchCustomerDetails(customerId);
    };

    const handleBackToList = () => {
        activeCustomerRequestRef.current = null;
        setIsInCustomerDetails(false);
        setShowCustomerDetails(false);
        setSelectedCustomer(null);
        setCustomerDetails(null);
        setCustomerCompleteData(null);
        setCustomerFollowups([]);
        setCustomerServices([]);
        setCustomerLmsData([]);
        setCustomerCampaigns([]);
        setEditingFollowup(null);
        setSelectedPdf(null);
        setCampaignPdfs([]);
        setShowManageCampaigns(false);
        setSelectedFollowup(null);
        setShowFollowupDetails(false);
        setShowPdfViewer(false);
        setIsPdfPanelMinimized(false);
        setSelectedCampaignsForFollowup([]);
        setCampaignFollowupData({});
        setActiveCampaignTab(null);
        setCommonFollowupBy('call');
        setCommonFollowupFlag('');
        setCommonNextFollowupDate('');
        // Do NOT re-fetch the whole list here. It was already refreshed when the follow-up
        // was saved (see handleSubmitFollowup). Re-fetching again would reset the loaded rows
        // + scroll to the top. Skipping it lets the restore effect put the user back exactly
        // where they were, with only the edited row repositioned per the active sort/filter.
        setCustomerEditInfo(null);
        setShowEditHistory(false);
        setIsEditHistoryExpanded(true);
        setIsMultiAssetsExpanded(false);
        setCspInfo([]);
    };

    const handleCampaignToggle = (campaign) => {
        setSelectedCampaigns(prev => {
            if (prev.includes(campaign)) {
                return prev.filter(c => c !== campaign);
            } else {
                return [...prev, campaign];
            }
        });
    };

    const handleAllCampaigns = () => {
        setSelectedCampaigns([]);
    };

    const handleManageCampaigns = () => {
        setShowManageCampaigns(true);
    };

    // Fetch all activities (common for all customers)
    const fetchAllActivities = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/v1/engagement/activities`);
            if (!response.ok) throw new Error('Failed to fetch activities');
            const data = await response.json();
            setActivities(data);
        } catch (err) {
            toast.error(err.message || 'Failed to load activities');
        }
    };

    // Fetch all RR entries (common for all customers)
    const fetchAllRR = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/v1/engagement/rr`);
            if (!response.ok) throw new Error('Failed to fetch RR entries');
            const data = await response.json();
            setRRList(data);
        } catch (err) {
            toast.error(err.message || 'Failed to load RR entries');
        }
    };

    // Function to check if current user has export permission
    const checkExportPermission = async () => {
        if (!currentUser?.user_id) return false;

        try {
            const response = await fetch(
                `${API_BASE_URL}/v1/engagement/check-export-permission?user_id=${currentUser.user_id}`
            );

            if (!response.ok) return false;

            const data = await response.json();
            return data.can_export;
        } catch (error) {
            console.error('Error checking export permission:', error);
            return false;
        }
    };

    // Check export permission when currentUser changes
    useEffect(() => {
        const checkPermission = async () => {
            if (currentUser) {
                const hasPermission = await checkExportPermission();
                setUserCanExport(hasPermission);
            }
        };
        checkPermission();
    }, [currentUser]);

    // Create or update activity
    const handleSaveActivity = async () => {
        if (!activityInput.trim()) {
            toast.error('Please enter activity content');
            return;
        }

        const loadingToast = toast.loading(editingActivity ? 'Updating activity...' : 'Creating activity...');
        try {
            let url = `${API_BASE_URL}/v1/engagement/activities`;
            let method = 'POST';

            if (editingActivity) {
                url = `${API_BASE_URL}/v1/engagement/activities/${editingActivity.id}`;
                method = 'PUT';
            }

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: activityInput })
            });

            if (!response.ok) throw new Error('Failed to save activity');

            toast.dismiss(loadingToast);
            toast.success(editingActivity ? 'Activity updated successfully!' : 'Activity created successfully!');

            setActivityInput('');
            setShowActivityModal(false);
            setEditingActivity(null);
            await fetchAllActivities();
        } catch (err) {
            toast.dismiss(loadingToast);
            toast.error(err.message || 'Failed to save activity');
        }
    };

    // Create or update RR
    const handleSaveRR = async () => {
        if (!rrInput.trim()) {
            toast.error('Please enter RR content');
            return;
        }

        const loadingToast = toast.loading(editingRR ? 'Updating RR...' : 'Creating RR...');
        try {
            let url = `${API_BASE_URL}/v1/engagement/rr`;
            let method = 'POST';

            if (editingRR) {
                url = `${API_BASE_URL}/v1/engagement/rr/${editingRR.id}`;
                method = 'PUT';
            }

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: rrInput })
            });

            if (!response.ok) throw new Error('Failed to save RR');

            toast.dismiss(loadingToast);
            toast.success(editingRR ? 'RR updated successfully!' : 'RR created successfully!');

            setRRInput('');
            setShowRRModal(false);
            setEditingRR(null);
            await fetchAllRR();
        } catch (err) {
            toast.dismiss(loadingToast);
            toast.error(err.message || 'Failed to save RR');
        }
    };

    const handleDeleteActivity = async (activityId) => {
        const result = await Swal.fire({
            title: 'Are you sure?',
            text: 'You won\'t be able to revert this!',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, delete it!'
        });

        if (!result.isConfirmed) return;

        const loadingToast = toast.loading('Deleting activity...');
        try {
            const response = await fetch(`${API_BASE_URL}/v1/engagement/activities/${activityId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                toast.dismiss(loadingToast);
                // Check if it's a foreign key constraint error (activity is in use)
                if (response.status === 500 || response.status === 409 || response.status === 400) {
                    await Swal.fire({
                        title: 'Cannot Delete',
                        text: 'This activity is already in use in one or more follow-ups and cannot be removed.',
                        icon: 'warning',
                        confirmButtonColor: '#2f3192',
                        confirmButtonText: 'OK'
                    });
                    return;
                }
                throw new Error('Failed to delete activity');
            }

            toast.dismiss(loadingToast);
            Swal.fire('Deleted!', 'Activity has been deleted.', 'success');
            await fetchAllActivities();
        } catch (err) {
            toast.dismiss(loadingToast);
            await Swal.fire({
                title: 'Cannot Delete',
                text: 'This activity is already in use in one or more follow-ups and cannot be removed.',
                icon: 'warning',
                confirmButtonColor: '#2f3192',
                confirmButtonText: 'OK'
            });
        }
    };

    const handleDeleteRR = async (rrId) => {
        const result = await Swal.fire({
            title: 'Are you sure?',
            text: 'You won\'t be able to revert this!',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, delete it!'
        });

        if (!result.isConfirmed) return;

        const loadingToast = toast.loading('Deleting Reject Reason...');
        try {
            const response = await fetch(`${API_BASE_URL}/v1/engagement/rr/${rrId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                toast.dismiss(loadingToast);
                // Check if it's a foreign key constraint error (RR is in use)
                if (response.status === 500 || response.status === 409 || response.status === 400) {
                    await Swal.fire({
                        title: 'Cannot Delete',
                        text: 'This reject reason is already in use in one or more follow-ups and cannot be removed.',
                        icon: 'warning',
                        confirmButtonColor: '#2f3192',
                        confirmButtonText: 'OK'
                    });
                    return;
                }
                throw new Error('Failed to delete RR');
            }

            toast.dismiss(loadingToast);
            Swal.fire('Deleted!', 'Reject Reason has been deleted.', 'success');
            await fetchAllRR();
        } catch (err) {
            toast.dismiss(loadingToast);
            await Swal.fire({
                title: 'Cannot Delete',
                text: 'This reject reason is already in use in one or more follow-ups and cannot be removed.',
                icon: 'warning',
                confirmButtonColor: '#2f3192',
                confirmButtonText: 'OK'
            });
        }
    };

    // Edit activity
    const handleEditActivity = (activity) => {
        setEditingActivity(activity);
        setActivityInput(activity.content);
        setShowActivityModal(true);
    };

    // Edit RR
    const handleEditRR = (rr) => {
        setEditingRR(rr);
        setRRInput(rr.content);
        setShowRRModal(true);
    };

    // Fetch common activities and RR when component mounts
    useEffect(() => {
        fetchAllActivities();
        fetchAllRR();
    }, []);

    // Handle common flag change - Updated to include C6 and C7
    const handleCommonFlagChange = (flag) => {
        setCommonFollowupFlag(flag);
        const days = followupFlags[flag] || 15;
        const today = new Date();
        const maxDate = new Date(today);

        if (flag === 'C7') {
            maxDate.setDate(maxDate.getDate() + 90);
        } else {
            maxDate.setDate(maxDate.getDate() + days);
        }

        setCommonNextFollowupDate(maxDate.toISOString().split('T')[0]);
    };

    // Add this helper function before the component definition or inside the component
    const formatPhoneNumber = (phone) => {
        if (!phone) return '-';
        // Convert to string if it's a number
        const phoneStr = String(phone);
        // If length is 11 and ends with '0', take first 10 digits
        if (phoneStr.length === 11 && phoneStr.endsWith('0')) {
            return phoneStr.slice(0, 10);
        }
        return phoneStr;
    };

    // Update campaign-specific data with common values
    const updateCampaignWithCommon = (campaignId) => {
        setCampaignFollowupData(prev => ({
            ...prev,
            [campaignId]: {
                ...prev[campaignId],
                followup_by: commonFollowupBy,
                followup_flag: commonFollowupFlag,
                next_followup_date: commonNextFollowupDate
            }
        }));
    };

    // Update campaign selection
    const handleCampaignSelection = (campaignId) => {
        setSelectedCampaignsForFollowup(prev => {
            if (prev.includes(campaignId)) {
                const newSelected = prev.filter(id => id !== campaignId);
                const newData = { ...campaignFollowupData };
                delete newData[campaignId];
                setCampaignFollowupData(newData);
                return newSelected;
            } else {
                const newSelected = [...prev, campaignId];
                setCampaignFollowupData(prevData => ({
                    ...prevData,
                    [campaignId]: {
                        status: 'rescheduled',
                        quotation_sent: false,
                        quotation_no: '',
                        quotation_value: '',
                        activity_id: '',
                        rr_id: '',
                        remark: '',
                        csp_subtype: '',
                        followup_by: commonFollowupBy,
                        followup_flag: commonFollowupFlag,
                        next_followup_date: commonNextFollowupDate
                    }
                }));
                return newSelected;
            }
        });
    };

    // Handle "Other" selection for non-campaign follow-ups (stored in non_followups)
    const handleOtherSelection = () => {
        const otherId = 'other';

        if (selectedCampaignsForFollowup.includes(otherId)) {
            setSelectedCampaignsForFollowup(prev => prev.filter(id => id !== otherId));
            setCampaignFollowupData(prev => {
                const newData = { ...prev };
                delete newData[otherId];
                return newData;
            });
            if (activeCampaignTab === otherId) {
                setActiveCampaignTab(null);
            }
        } else {
            setSelectedCampaignsForFollowup(prev => [...prev, otherId]);
            setCampaignFollowupData(prev => ({
                ...prev,
                [otherId]: {
                    status: 'rescheduled',
                    quotation_sent: false,
                    quotation_no: '',
                    quotation_value: '',
                    activity_id: '',
                    rr_id: '',
                    remark: '',
                    csp_subtype: '',
                    service: '',
                    followup_by: commonFollowupBy,
                    followup_flag: commonFollowupFlag,
                    next_followup_date: commonNextFollowupDate,
                    is_other: true
                }
            }));
            setActiveCampaignTab(otherId);
        }
    };

    // Update campaign-specific follow-up data
    const updateCampaignFollowupData = (campaignId, field, value) => {
        setCampaignFollowupData(prev => ({
            ...prev,
            [campaignId]: {
                ...prev[campaignId],
                [field]: value
            }
        }));
    };

    // Load PDFs for selected campaign — content is fetched lazily (backend sends metadata only)
    const loadCampaignPdfs = async (campaignId) => {
        const campaign = selectableCampaigns.find(c => c.id === parseInt(campaignId));
        if (!campaign) return;

        // Open the panel immediately using metadata
        setPdfViewerCampaign(campaign);
        setShowPdfViewer(true);
        setIsPdfPanelMinimized(false);
        setActiveCampaignTab(campaignId);
        setCurrentPdfIndex(0);

        const pdfMeta = (campaign.scripts || []).filter(script => script.type === 'pdf');
        if (pdfMeta.length === 0) {
            setCampaignPdfs([]);
            setSelectedPdf(null);
            return;
        }

        try {
            const loaded = await Promise.all(pdfMeta.map(async (meta) => {
                if (meta.content) return meta; // already hydrated
                const res = await fetch(
                    `${API_BASE_URL}/v1/engagement/campaigns/${campaignId}/scripts/${meta.index}`
                );
                if (res.ok) {
                    const full = await res.json();
                    return { ...meta, content: full.content, name: full.name || meta.name };
                }
                return meta;
            }));
            setCampaignPdfs(loaded);
            setSelectedPdf(loaded[0] || null);
        } catch (e) {
            console.error('Failed to load campaign PDFs', e);
            toast.error('Failed to load scripts');
        }
    };

    // Close PDF panel
    const handleClosePdfPanel = () => {
        setShowPdfViewer(false);
        setCampaignPdfs([]);
        setSelectedPdf(null);
        setPdfViewerCampaign(null);
        setIsPdfPanelMinimized(false);
    };

    // Toggle minimize PDF panel
    const handleToggleMinimizePanel = () => {
        setIsPdfPanelMinimized(!isPdfPanelMinimized);
    };

    const handleCreateFollowup = () => {
        if (!currentUser) {
            toast.error('User not found. Please login again.');
            return;
        }

        setEditingFollowup(null);
        setSelectedCampaignsForFollowup([]);
        setCampaignFollowupData({});
        setActiveCampaignTab(null);
        setCommonFollowupBy('call');
        setCommonFollowupFlag('');
        setCommonNextFollowupDate('');
        setShowPdfViewer(false);
        setCampaignPdfs([]);
        setSelectedPdf(null);
    };

    const handleViewFollowup = (followup) => {
        setSelectedFollowup(followup);
        setShowFollowupDetails(true);
    };

    const handleEditFollowup = (followup) => {
        if (!isAdmin) {
            toast.error('Only admin can edit follow-ups');
            return;
        }

        setEditingFollowup(followup);
        setSelectedCampaignsForFollowup([followup.campaign_id]);
        setCommonFollowupBy(followup.followup_by || 'call');
        setCommonFollowupFlag(followup.followup_flag || '');
        setCommonNextFollowupDate(followup.next_followup_date ? followup.next_followup_date.split('T')[0] : '');

        setCampaignFollowupData({
            [followup.campaign_id]: {
                status: followup.status || 'rescheduled',
                quotation_sent: followup.quotation_sent || false,
                quotation_no: followup.quotation_no || '',
                quotation_value: followup.quotation_value || '',
                activity_id: followup.activity_id || '',
                rr_id: followup.rr_id || '',
                remark: followup.followup_remark || '',
                csp_subtype: followup.csp_subtype || '',
                followup_by: followup.followup_by || 'call',
                followup_flag: followup.followup_flag || '',
                next_followup_date: followup.next_followup_date ? followup.next_followup_date.split('T')[0] : ''
            }
        });

        setShowFollowupForm(true);
        setShowFollowupDetails(false);

        setTimeout(() => {
            document.getElementById('followup-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    };

    // Add this function to check if WIP quotation can be created (must be > 90 days since last WIP quotation)
    //nik commented
    // const canCreateWipQuotation = (campaignId) => {
    //     // Get all followups for this campaign with WIP status and quotation sent
    //     const wipQuotations = customerFollowups.filter(
    //         f => f.campaign_id === parseInt(campaignId) &&
    //             f.status === 'wip' &&
    //             f.quotation_sent === true
    //     );

    //     if (wipQuotations.length === 0) {
    //         return true; // No existing WIP quotation, can create
    //     }

    //     // Get the latest WIP quotation
    //     const latestWip = wipQuotations.sort((a, b) =>
    //         new Date(b.followup_date) - new Date(a.followup_date)
    //     )[0];

    //     // Calculate days since last WIP quotation
    //     const today = new Date();
    //     today.setHours(0, 0, 0, 0);
    //     const lastWipDate = new Date(latestWip.followup_date);
    //     lastWipDate.setHours(0, 0, 0, 0);

    //     const diffTime = today - lastWipDate;
    //     const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    //     // Allow only if more than 90 days have passed
    //     return diffDays > 90;
    // };

    //nik - quotation can be send 2 times
    const canCreateWipQuotation = (campaignId) => {
        // Get all followups for this campaign with WIP status and quotation sent
        const wipQuotations = customerFollowups.filter(
            f => f.campaign_id === parseInt(campaignId) &&
                f.status === 'wip' &&
                f.quotation_sent === true
        );

        if (wipQuotations.length === 0) {
            return true; // No existing WIP quotation, can create
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Count how many WIP quotations were sent within the last 90 days
        const recentWipCount = wipQuotations.filter(f => {
            if (!f.followup_date) return false;
            const wipDate = new Date(f.followup_date);
            wipDate.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((today - wipDate) / (1000 * 60 * 60 * 24));
            return diffDays <= 90;
        }).length;

        // Allow up to 2 WIP quotations within 90 days; block the 3rd
        return recentWipCount < 2;
    };

    const handleSubmitFollowup = async (e) => {
        e.preventDefault();
        if (!selectedCustomer) return;
        if (!currentUser) {
            toast.error('User not found. Please login again.');
            return;
        }

        if (selectedCampaignsForFollowup.length === 0) {
            toast.error('Please select at least one drive');
            return;
        }

        // Check for specific reject reasons before submitting
        for (const campaignId of selectedCampaignsForFollowup) {
            if (campaignId === 'other') continue; // Skip for "other" type
            const campaignData = campaignFollowupData[campaignId];

            if (campaignData.status === 'rejected' && campaignData.rr_id) {
                const selectedRR = rrList.find(rr => rr.id === parseInt(campaignData.rr_id));
                const rejectReason = selectedRR?.content?.toLowerCase() || '';

                // Check if reject reason is 'wrong number' or 'call not connected'
                if (REJECT_REASONS_EDIT_TRIGGER.some(reason => rejectReason.includes(reason))) {

                    const result = await Swal.fire({
                        title: 'Edit Customer Details?',
                        html: `You selected "<strong>${selectedRR.content}</strong>" as reject reason.<br/><br/>Do you want to edit customer details?`,
                        icon: 'question',
                        showCancelButton: true,
                        confirmButtonColor: '#406093',
                        cancelButtonColor: '#d33',
                        confirmButtonText: 'Yes, Edit Customer',
                        cancelButtonText: 'No, Continue',
                        reverseButtons: true
                    });

                    if (result.isConfirmed) {
                        // Auto-change status from 'rejected' to 'rescheduled' for this campaign
                        // Also clear quotation data since rescheduled cannot have quotation sent
                        setCampaignFollowupData(prev => ({
                            ...prev,
                            [campaignId]: {
                                ...prev[campaignId],
                                status: 'rescheduled',
                                rr_id: '',              // Clear reject reason
                                quotation_sent: false,  // Uncheck Quote Sent
                                quotation_no: '',       // Clear quotation number
                                quotation_value: ''     // Clear quotation value
                            }
                        }));

                        // Set default next follow-up date (15 days from today) and flag (C1) if not already set
                        if (!commonNextFollowupDate) {
                            const today = new Date();
                            const nextDate = new Date(today);
                            nextDate.setDate(nextDate.getDate() + 15);
                            const dateStr = nextDate.toISOString().split('T')[0];
                            setCommonNextFollowupDate(dateStr);
                            setCommonFollowupFlag('C1');

                            // Update all selected campaigns with the default date/flag
                            selectedCampaignsForFollowup.forEach(cId => {
                                setCampaignFollowupData(prev => ({
                                    ...prev,
                                    [cId]: {
                                        ...prev[cId],
                                        next_followup_date: dateStr,
                                        followup_flag: 'C1'
                                    }
                                }));
                            });
                        }

                        toast.success('Status auto-changed to "Follow-up Reschedule". Edit customer details, then save the follow-up.');

                        // Open edit customer modal
                        handleEditCustomer();
                        return; // Stop form submission
                    }
                }
            }
        }

        // Validate all campaigns data
        for (const campaignId of selectedCampaignsForFollowup) {
            const isOtherType = campaignId === 'other';
            const campaignData = campaignFollowupData[campaignId];

            if (!campaignData) {
                toast.error(`Please fill data for all selected drives`);
                return;
            }

            if (!campaignData.activity_id) {
                if (isOtherType) {
                    toast.error(`Please select an activity for Other follow-up`);
                } else {
                    const campaign = selectableCampaigns.find(c => c.id === parseInt(campaignId));
                    toast.error(`Please select an activity for drive: ${campaign?.name}`);
                }
                return;
            }

            // Remark is mandatory for ALL statuses
            if (!campaignData.remark || campaignData.remark.trim() === '') {
                if (isOtherType) {
                    toast.error(`Please enter a remark for Other follow-up`);
                } else {
                    const campaign = selectableCampaigns.find(c => c.id === parseInt(campaignId));
                    toast.error(`Please enter a remark for drive: ${campaign?.name}`);
                }
                return;
            }

            // Next follow-up date and flag are mandatory for 'rescheduled', 'wip' and 'not_connected' statuses
            if (campaignData.status === 'rescheduled' || campaignData.status === 'wip' || campaignData.status === 'not_connected') {
                const nextDate = campaignData.next_followup_date || commonNextFollowupDate;
                const flag = campaignData.followup_flag || commonFollowupFlag;
                const statusLabel = campaignData.status === 'wip'
                    ? 'WIP'
                    : campaignData.status === 'not_connected'
                        ? 'Not Connected'
                        : 'Follow-up Reschedule';

                if (!nextDate) {
                    if (isOtherType) {
                        toast.error(`Please select Next Follow-up Date for "${statusLabel}" status in Other follow-up`);
                    } else {
                        const campaign = selectableCampaigns.find(c => c.id === parseInt(campaignId));
                        toast.error(`Please select Next Follow-up Date for "${statusLabel}" status in drive: ${campaign?.name}`);
                    }
                    return;
                }

                if (!flag && campaignData.status !== 'not_connected') {
                    if (isOtherType) {
                        toast.error(`Please select Follow-up Flag for "${statusLabel}" status in Other follow-up`);
                    } else {
                        const campaign = selectableCampaigns.find(c => c.id === parseInt(campaignId));
                        toast.error(`Please select Follow-up Flag for "${statusLabel}" status in drive: ${campaign?.name}`);
                    }
                    return;
                }
            }

            // NEW: Reject reason is mandatory when status is rejected
            if (campaignData.status === 'rejected' && !campaignData.rr_id) {
                if (isOtherType) {
                    toast.error(`Please select a reject reason for Other follow-up`);
                } else {
                    const campaign = selectableCampaigns.find(c => c.id === parseInt(campaignId));
                    toast.error(`Please select a reject reason for drive: ${campaign?.name}`);
                }
                return;
            }

            // NEW VALIDATION: For completed OR wip status, require quotation number and value (regular campaigns only, not "other")
            if (!isOtherType && (campaignData.status === 'completed' || campaignData.status === 'wip')) {
                if (!campaignData.quotation_sent) {
                    const campaign = selectableCampaigns.find(c => c.id === parseInt(campaignId));
                    toast.error(`For "${campaignData.status === 'completed' ? 'Completed' : 'WIP'}" status in drive "${campaign?.name}", please check "Quote Sent" checkbox first`);
                    return;
                }
                if (!campaignData.quotation_no || campaignData.quotation_no.trim() === '') {
                    const campaign = selectableCampaigns.find(c => c.id === parseInt(campaignId));
                    toast.error(`For "${campaignData.status === 'completed' ? 'Completed' : 'WIP'}" status in drive "${campaign?.name}", please enter Quotation Number`);
                    return;
                }
                if (!campaignData.quotation_value || campaignData.quotation_value <= 0) {
                    const campaign = selectableCampaigns.find(c => c.id === parseInt(campaignId));
                    toast.error(`For "${campaignData.status === 'completed' ? 'Completed' : 'WIP'}" status in drive "${campaign?.name}", please enter valid Quotation Value`);
                    return;
                }
            }

            // Skip date-window validation for "other" type
            if (!isOtherType && campaignData.status !== 'rejected' && campaignData.status !== 'completed') {
                const nextDate = campaignData.next_followup_date || commonNextFollowupDate;
                const flag = campaignData.followup_flag || commonFollowupFlag;
                if (nextDate && flag && !validateNextFollowupDate(nextDate, flag)) {
                    const campaign = selectableCampaigns.find(c => c.id === parseInt(campaignId));
                    const days = followupFlags[flag];
                    toast.error(`Next follow-up date must be within ${days} days from today for ${flag} flag in drive: ${campaign?.name}`);
                    return;
                }
            }

            // Check if trying to create WIP with quotation and if it's allowed (90-day rule) — regular campaigns only
            if (!isOtherType && campaignData.status === 'wip' && campaignData.quotation_sent) {
                if (!canCreateWipQuotation(campaignId)) {
                    const campaign = selectableCampaigns.find(c => c.id === parseInt(campaignId));
                    // toast.error(`Cannot send quotation with WIP status for campaign "${campaign?.name}". Last WIP quotation was sent within the last 90 days. Please wait until 90 days have passed or use a different status.`);
                    toast.error(`Cannot send quotation with WIP status for drive "${campaign?.name}". Last WIP quotation was sent within the last 90 days. Please wait until 90 days have passed or use a different status.`);
                    return;
                }
            }

            // If status is 'rescheduled' or 'not_connected', quotation_sent must be false
            if (campaignData.status === 'rescheduled' || campaignData.status === 'not_connected') {
                const statusLabel = campaignData.status === 'not_connected' ? 'Not Connected' : 'Follow-up Reschedule';
                if (campaignData.quotation_sent) {
                    if (isOtherType) {
                        toast.error(`Cannot save: Status is "${statusLabel}" but quotation is sent for Other follow-up. Please uncheck "Quote Sent" or change status.`);
                    } else {
                        const campaign = selectableCampaigns.find(c => c.id === parseInt(campaignId));
                        toast.error(`Cannot save: Status is "${statusLabel}" but quotation is sent for drive "${campaign?.name}". Please uncheck "Quote Sent" or change status.`);
                    }
                    return;
                }
                // Clear quotation data for these statuses
                campaignData.quotation_sent = false;
                campaignData.quotation_no = '';
                campaignData.quotation_value = '';
            }
        }
        //commmented by nik
        // setLoading(true);
        // const submitToast = toast.loading(editingFollowup ? 'Updating follow-up...' : 'Creating follow-ups...');

        // try {
        //     for (const campaignId of selectedCampaignsForFollowup) {
        //         const campaignData = campaignFollowupData[campaignId];
        //         const isOtherType = campaignId === 'other';

        //added by nik
        // ===== Same-product (sibling) campaign prompt =====
        // If the customer is also enrolled in OTHER active campaigns with the SAME
        // product (service) as a selected one, offer to record the same follow-up
        // there too. "Yes" -> both campaigns get the same follow-up; "No" -> only
        // the originally selected ones. Skipped when editing an existing follow-up.
        let campaignsToSubmit = [...selectedCampaignsForFollowup];
        const effectiveData = { ...campaignFollowupData };

        if (!editingFollowup) {
            const selectedSet = new Set(selectedCampaignsForFollowup.map(String));
            const siblingToSource = {}; // siblingCampaignId -> sourceCampaignId (data to copy)

            for (const campaignId of selectedCampaignsForFollowup) {
                if (campaignId === 'other') continue;
                const src = selectableCampaigns.find(c => String(c.id) === String(campaignId));
                const service = (src?.service || '').trim().toLowerCase();
                if (!service) continue;

                // enrolled campaigns with the same product, not already selected
                customerCampaigns.forEach(c => {
                    if (String(c.id) === String(campaignId)) return;
                    if (selectedSet.has(String(c.id))) return;
                    if ((c.service || '').trim().toLowerCase() !== service) return;
                    if (!(String(c.id) in siblingToSource)) {
                        siblingToSource[String(c.id)] = campaignId; // first matching source wins
                    }
                });
            }

            const siblingIds = Object.keys(siblingToSource);
            if (siblingIds.length > 0) {
                const listHtml = siblingIds.map(sid => {
                    const c = customerCampaigns.find(cc => String(cc.id) === sid);
                    return `<li><strong>${c?.name || sid}</strong> (${c?.service || ''})</li>`;
                }).join('');

                const result = await Swal.fire({
                    title: 'Same product — apply to other drive too?',
                    html: `This customer is also enrolled in the following drive(s) with the same product:<ul style="text-align:left;margin-top:8px;">${listHtml}</ul>Do you want to record the same follow-up there as well?`,
                    icon: 'question',
                    showCancelButton: true,
                    showCloseButton: true,
                    confirmButtonColor: '#406093',
                    cancelButtonColor: '#d33',
                    confirmButtonText: 'Yes, apply to both',
                    cancelButtonText: 'No, only selected',
                    reverseButtons: true,
                    allowOutsideClick: false,
                    allowEscapeKey: false
                });

                // If user closed the popup (X button) or it was dismissed without a real choice,
                // stop everything — do NOT save anything.
                if (result.dismiss === Swal.DismissReason.close) {
                    setLoading(false);
                    return;
                }

                if (result.isConfirmed) {
                    siblingIds.forEach(sid => {
                        const sourceId = siblingToSource[sid];
                        const c = customerCampaigns.find(cc => String(cc.id) === sid);
                        const realId = c ? c.id : sid;
                        effectiveData[realId] = { ...effectiveData[sourceId] }; // copy same follow-up data
                        campaignsToSubmit.push(realId);
                    });
                }
            }
        }

        setLoading(true);
        const submitToast = toast.loading(editingFollowup ? 'Updating follow-up...' : 'Creating follow-ups...');

        try {
            for (const campaignId of campaignsToSubmit) {
                const campaignData = effectiveData[campaignId];
                const isOtherType = campaignId === 'other';

                if (isOtherType) {
                    // "Other" type — stored in non_followups, NO campaign_id sent
                    let formData = {
                        followup_by: campaignData.followup_by || commonFollowupBy,
                        status: campaignData.status,
                        service: campaignData.service || null,
                        quotation_sent: campaignData.quotation_sent || false,
                        quotation_no: campaignData.quotation_sent ? campaignData.quotation_no : null,
                        quotation_value: campaignData.quotation_sent ? parseFloat(campaignData.quotation_value) : null,
                        activity_id: parseInt(campaignData.activity_id),
                        rr_id: campaignData.rr_id ? parseInt(campaignData.rr_id) : null,
                        user_id: currentUser.user_id || currentUser.id,
                        user_name: currentUser.name,
                        remark_type: "other",
                        followup_remark: campaignData.remark || null
                    };

                    if (editingFollowup && editingFollowup.remark_type === 'other') {
                        formData.followup_date = editingFollowup.followup_date;
                    } else {
                        formData.followup_date = new Date().toISOString();
                    }

                    if (campaignData.status === 'rejected' || campaignData.status === 'completed') {
                        formData.followup_flag = null;
                        formData.next_followup_date = null;
                    } else if (campaignData.status === 'not_connected') {
                        // Not Connected → keep next follow-up date, but DO NOT store a flag
                        formData.followup_flag = null;
                        formData.next_followup_date = (campaignData.next_followup_date || commonNextFollowupDate) ?
                            new Date(campaignData.next_followup_date || commonNextFollowupDate).toISOString() : null;
                    } else {
                        formData.followup_flag = campaignData.followup_flag || commonFollowupFlag || null;
                        formData.next_followup_date = (campaignData.next_followup_date || commonNextFollowupDate) ?
                            new Date(campaignData.next_followup_date || commonNextFollowupDate).toISOString() : null;
                    }

                    let url, method;
                    if (editingFollowup && editingFollowup.remark_type === 'other') {
                        url = `${API_BASE_URL}/v1/engagement/non-followups/${editingFollowup.id}`;
                        method = 'PUT';
                    } else {
                        url = `${API_BASE_URL}/v1/engagement/customers/${selectedCustomer}/non-followups`;
                        method = 'POST';
                    }

                    const response = await fetch(url, {
                        method: method,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(formData),
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.detail || 'Failed to save other follow-up');
                    }
                } else {
                    // Regular campaign follow-up — INCLUDES campaign_id
                    let formData = {
                        followup_date: editingFollowup ? editingFollowup.followup_date : new Date().toISOString(),
                        campaign_id: parseInt(campaignId),
                        followup_by: campaignData.followup_by || commonFollowupBy,
                        followup_remark: campaignData.remark || '',
                        status: campaignData.status,
                        quotation_sent: campaignData.quotation_sent,
                        quotation_no: campaignData.quotation_sent ? campaignData.quotation_no : null,
                        quotation_value: campaignData.quotation_sent ? parseFloat(campaignData.quotation_value) : null,
                        activity_id: parseInt(campaignData.activity_id),
                        rr_id: campaignData.rr_id ? parseInt(campaignData.rr_id) : null,
                        // Stored only for CSP drives — non-CSP rows never set this, so it stays null
                        csp_subtype: isCspCampaign(selectableCampaigns.find(c => c.id === parseInt(campaignId))) ? (getCspAutoSubtype() || null) : null,
                        user_id: currentUser.user_id || currentUser.id,
                        user_name: currentUser.name
                    };

                    if (campaignData.status === 'rejected' || campaignData.status === 'completed') {
                        formData.followup_flag = null;
                        formData.next_followup_date = null;
                    } else if (campaignData.status === 'not_connected') {
                        // Not Connected → keep next follow-up date, but DO NOT store a flag
                        formData.followup_flag = null;
                        formData.next_followup_date = (campaignData.next_followup_date || commonNextFollowupDate) ?
                            new Date(campaignData.next_followup_date || commonNextFollowupDate).toISOString() : null;
                    } else {
                        formData.followup_flag = campaignData.followup_flag || commonFollowupFlag || null;
                        formData.next_followup_date = (campaignData.next_followup_date || commonNextFollowupDate) ?
                            new Date(campaignData.next_followup_date || commonNextFollowupDate).toISOString() : null;
                    }

                    let url, method;
                    if (editingFollowup) {
                        url = `${API_BASE_URL}/v1/engagement/followups/${editingFollowup.id}`;
                        method = 'PUT';
                    } else {
                        url = `${API_BASE_URL}/v1/engagement/customers/${selectedCustomer}/followups`;
                        method = 'POST';
                    }

                    const response = await fetch(url, {
                        method: method,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(formData),
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.detail || `Failed to save follow-up for campaign ${campaignId}`);
                    }

                    if (!editingFollowup && campaignData.status === 'completed') {
                        try {
                            // Only auto-remove if the customer was actually enrolled in this campaign
                            const enrolledCampaign = customerCampaigns.find(c => c.id === parseInt(campaignId));
                            if (enrolledCampaign) {
                                await removeCustomerFromCampaign(enrolledCampaign.id, selectedCustomer);
                                toast.success(`Customer automatically removed from ${enrolledCampaign.name} campaign due to completed status`);
                            }
                        } catch (removeError) {
                            toast.error(`Follow-up saved but failed to remove from campaign ${campaignId}`);
                            console.error('Auto-remove error:', removeError);
                        }
                    }
                }
            }

            toast.dismiss(submitToast);
            //commented by nik
            // toast.success(editingFollowup ? 'Follow-up updated successfully!' : `${selectedCampaignsForFollowup.length} follow-up(s) created successfully!`);

            // // Save each submitted remark to sessionStorage history (last 5)
            // selectedCampaignsForFollowup.forEach(campaignId => {
            //     const remark = campaignFollowupData[campaignId]?.remark;
            //added by nik
            toast.success(editingFollowup ? 'Follow-up updated successfully!' : `${campaignsToSubmit.length} follow-up(s) created successfully!`);

            // Save each submitted remark to sessionStorage history (last 5)
            campaignsToSubmit.forEach(campaignId => {
                const remark = effectiveData[campaignId]?.remark;
                if (remark && remark.trim()) {
                    saveRemarkToHistory(remark);
                }
            });
            setRecentRemarks(getRecentRemarks());

            setSelectedCampaignsForFollowup([]);
            setCampaignFollowupData({});
            setActiveCampaignTab(null);
            setCommonFollowupBy('call');
            setCommonFollowupFlag('');
            setCommonNextFollowupDate('');
            setEditingFollowup(null);

            await fetchCustomerDetails(selectedCustomer);
            await fetchEngagementData();
        } catch (err) {
            toast.dismiss(submitToast);
            toast.error(err.message || 'Failed to save follow-ups');
        } finally {
            setLoading(false);
        }
    };

    // Validate next follow-up date
    const validateNextFollowupDate = (date, flag) => {
        if (!date || !flag) return true;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const selectedDate = new Date(date);
        selectedDate.setHours(0, 0, 0, 0);

        if (flag === 'C7') {
            return selectedDate >= today;
        }

        const days = followupFlags[flag] || 15;
        const maxDate = new Date(today);
        maxDate.setDate(maxDate.getDate() + days);
        return selectedDate >= today && selectedDate <= maxDate;
    };

    const getFlagFromDaysDifference = (selectedDate) => {
        if (!selectedDate) return '';

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const selected = new Date(selectedDate);
        selected.setHours(0, 0, 0, 0);

        const diffTime = selected - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 15) return 'C1';
        if (diffDays <= 30) return 'C2';
        if (diffDays <= 45) return 'C3';
        if (diffDays <= 60) return 'C4';
        if (diffDays <= 75) return 'C5';
        if (diffDays <= 90) return 'C6';
        return 'C7';
    };

    const handleViewPdf = (pdfData) => {
        setSelectedPdf(pdfData);
    };

    const handleDownloadPdf = (pdfData) => {
        if (pdfData.content) {
            try {
                const byteCharacters = atob(pdfData.content);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);

                const link = document.createElement('a');
                link.href = url;
                link.download = pdfData.name || 'script.pdf';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);

                toast.success('PDF downloaded successfully');
            } catch (error) {
                toast.error('Failed to download PDF');
                console.error('PDF download error:', error);
            }
        }
    };

    const handlePrevPdf = () => {
        if (currentPdfIndex > 0) {
            const newIndex = currentPdfIndex - 1;
            setCurrentPdfIndex(newIndex);
            setSelectedPdf(campaignPdfs[newIndex]);
        }
    };

    const handleNextPdf = () => {
        if (currentPdfIndex < campaignPdfs.length - 1) {
            const newIndex = currentPdfIndex + 1;
            setCurrentPdfIndex(newIndex);
            setSelectedPdf(campaignPdfs[newIndex]);
        }
    };

    const exportToXLSX = async () => {
        // Check if user has export permission (admin OR can_export=true)
        const hasPermission = await checkExportPermission();
        if (!hasPermission) {
            toast.error('You do not have permission to export data');
            return;
        }

        if (filteredCustomers.length === 0) {
            toast.error('No data to export');
            return;
        }

        // Prepare data for Excel
        const exportData = filteredCustomers.map((customer, index) => {
            // Create campaign status columns dynamically
            const campaignData = {};
            activeCampaigns.forEach(campaign => {
                const hasCheckmark = customer.campaign_checkmarks?.[campaign] ? '✓' : '';
                const isTransferred = customer.campaign_transferred?.[campaign] || false;
                const status = customer.campaign_status?.[campaign] || '';
                const statusLetter = status ? getStatusLetter(status) : '';

                let displayText = hasCheckmark;

                if (isTransferred && status) {
                    // Transferred with status - show ✓TW, ✓TC, or ✓TR
                    displayText = `${hasCheckmark}T${statusLetter}`;
                } else if (isTransferred) {
                    // Transferred only - show ✓T
                    displayText = `${hasCheckmark}T`;
                } else if (status) {
                    // Regular status - show ✓W, ✓C, or ✓R
                    displayText = `${hasCheckmark}${statusLetter}`;
                } else if (hasCheckmark) {
                    // In campaign only - show ✓
                    displayText = hasCheckmark;
                } else {
                    displayText = '';
                }

                campaignData[`${campaign} (Status)`] = displayText || '-';
            });

            return {
                'Sr. No.': index + 1,
                'Customer ID': customer.customer_id || '',
                'Instance ID': customer.instance_id || '',
                'Customer Name': customer.customer_name || '',
                'Contact': customer.mobile || '',
                'Email': customer.email || '',
                'Branch ID': customer.branch_id || '',
                'Warranty Expiry': formatDate(customer.warranty_expiry_date),
                'Agreement End Date': formatDate(customer.agreement_end_date),
                ...campaignData,
                'Latest Flag': Object.keys(customer.followup_flags || {}).filter(flag => customer.followup_flags[flag]).join(', ') || '-',
                'Last Follow-up': formatDate(customer.last_followup_date),
                'Last Follow-up User': customer.last_followup_user || '-',
                'Next Follow-up': formatDate(customer.next_followup_date),
                'Last Remark': customer.last_followup_remark || '-'
            };
        });

        // Create worksheet
        const ws = XLSX.utils.json_to_sheet(exportData);

        // Auto-size columns (optional - makes columns wider based on content)
        const colWidths = [];
        const headers = Object.keys(exportData[0] || {});
        headers.forEach(header => {
            let maxLength = header.length;
            exportData.forEach(row => {
                const value = String(row[header] || '');
                maxLength = Math.max(maxLength, value.length);
            });
            colWidths.push({ wch: Math.min(maxLength + 2, 50) }); // Cap at 50 chars
        });
        ws['!cols'] = colWidths;

        // Create workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Customer Engagement');

        // Generate filename with date
        const fileName = `customer_engagement_${new Date().toISOString().split('T')[0]}.xlsx`;

        // Export file
        XLSX.writeFile(wb, fileName);

        toast.success('Data exported successfully as Excel');
    };

    // Format date in Indian time
    const formatIndianDateTime = (dateString) => {
        if (!dateString) return '-';
        // Backend stores naive IST datetime; treat the string as IST
        const dt = new Date(dateString);
        return dt.toLocaleString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZone: 'Asia/Kolkata'
        });
    };

    // Add a new note/thought to the user's diary
    const handleAddNewDieryEntry = async () => {
        if (!currentUser) {
            toast.error('User not found. Please login again.');
            return;
        }
        if (!dieryNewForm.content || !dieryNewForm.content.trim()) {
            toast.error('Please write something before saving.');
            return;
        }

        setSavingDieryNew(true);
        const toastId = toast.loading('Saving note...');
        try {
            const response = await fetch(`${API_BASE_URL}/v1/diery/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: String(currentUser.user_id || currentUser.id),
                    user_name: currentUser.name || currentUser.username || 'Unknown',
                    title: dieryNewForm.title || null,
                    content: dieryNewForm.content.trim(),
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Failed to save note');
            }

            toast.dismiss(toastId);
            toast.success('Note saved to your diary!');
            setDieryNewForm({ title: '', content: '' });
            setShowAddDieryForm(false);
            fetchDieryEntries();
        } catch (err) {
            toast.dismiss(toastId);
            toast.error(err.message);
        } finally {
            setSavingDieryNew(false);
        }
    };

    // Fetch the current user's diary entries
    const fetchDieryEntries = async () => {
        if (!currentUser) return;
        setLoadingDiery(true);
        try {
            const userId = String(currentUser.user_id || currentUser.id);
            const response = await fetch(`${API_BASE_URL}/v1/diery/user/${userId}`);
            if (!response.ok) throw new Error('Failed to load diary');
            const data = await response.json();
            setDieryEntries(data);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setLoadingDiery(false);
        }
    };

    const handleOpenDiery = () => {
        setShowDieryModal(true);
        fetchDieryEntries();
    };

    const handleDeleteDieryEntry = async (id) => {
        const result = await Swal.fire({
            title: 'Remove from diary?',
            text: 'This entry will be permanently removed.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, remove it!'
        });
        if (!result.isConfirmed) return;

        const toastId = toast.loading('Removing...');
        try {
            const response = await fetch(`${API_BASE_URL}/v1/diery/${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete');
            toast.dismiss(toastId);
            toast.success('Removed from diary');
            fetchDieryEntries();
        } catch (err) {
            toast.dismiss(toastId);
            toast.error(err.message);
        }
    };

    const handleStartEditDiery = (entry) => {
        setEditingDieryEntry(entry);
        setDieryEditForm({
            title: entry.title || '',
            content: entry.content || ''
        });
    };

    const handleSaveDieryEdit = async () => {
        if (!editingDieryEntry) return;
        if (!dieryEditForm.content || !dieryEditForm.content.trim()) {
            toast.error('Note content cannot be empty.');
            return;
        }
        const toastId = toast.loading('Updating...');
        try {
            const response = await fetch(`${API_BASE_URL}/v1/diery/${editingDieryEntry.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: dieryEditForm.title || null,
                    content: dieryEditForm.content.trim()
                })
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Failed to update');
            }
            toast.dismiss(toastId);
            toast.success('Updated successfully');
            setEditingDieryEntry(null);
            setDieryEditForm({ title: '', content: '' });
            fetchDieryEntries();
        } catch (err) {
            toast.dismiss(toastId);
            toast.error(err.message);
        }
    };

    // SessionStorage helpers for recent remarks (last 5 per user)
    const REMARKS_STORAGE_KEY = 'customerEng_recent_remarks';
    const MAX_RECENT_REMARKS = 5;

    const getRecentRemarks = () => {
        try {
            const stored = sessionStorage.getItem(REMARKS_STORAGE_KEY);
            if (!stored) return [];
            const parsed = JSON.parse(stored);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    };

    const saveRemarkToHistory = (remark) => {
        if (!remark || !remark.trim()) return;
        const trimmed = remark.trim();
        try {
            const existing = getRecentRemarks();
            // Remove duplicate if it exists (case-insensitive), then push to top
            const filtered = existing.filter(r => r.toLowerCase() !== trimmed.toLowerCase());
            const updated = [trimmed, ...filtered].slice(0, MAX_RECENT_REMARKS);
            sessionStorage.setItem(REMARKS_STORAGE_KEY, JSON.stringify(updated));
        } catch (e) {
            console.error('Failed to save remark to history', e);
        }
    };

    const getStatusBadgeClass = (status) => {
        switch (status) {
            case 'completed': return 'text-black';
            case 'wip': return 'text-black';
            case 'rejected': return 'text-black';
            case 'rescheduled': return 'text-black';
            default: return 'text-black';
        }
    };

    const highlightText = (text, search) => {
        if (!search || !text || text === '-') return text;
        const textStr = String(text);
        const searchLower = search.toLowerCase().trim();
        const textLower = textStr.toLowerCase();
        if (!textLower.includes(searchLower)) return text;
        const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedSearch})`, 'gi');
        const parts = textStr.split(regex);
        return parts.map((part, i) =>
            part.toLowerCase() === searchLower
                ? <span key={i} className="px-0.5 rounded" style={{ backgroundColor: '#ffdb62' }}>{part}</span>
                : part
        );
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    };

    const formatDateTime = (dateString) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    };

    const canEditFollowup = (followup) => {
        return isAdmin;
    };

    const getFlagBadgeClass = (flag) => {
        switch (flag) {
            case 'C1': return 'text-black';
            case 'C2': return 'text-black';
            case 'C3': return 'text-black';
            case 'C4': return 'text-black';
            case 'C5': return 'text-black';
            case 'C6': return 'text-black';
            case 'C7': return 'text-black';
            default: return 'text-black';
        }
    };

    // Remembers the table scroll position across a sort-triggered re-render
    const sortScrollRef = useRef(null);

    // Handle sort
    const handleSort = (key) => {
        // Capture scroll BEFORE the rows re-render so the table doesn't jump
        if (tableContainerRef.current) {
            sortScrollRef.current = {
                left: tableContainerRef.current.scrollLeft,
                top: tableContainerRef.current.scrollTop
            };
        }
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    // Restore scroll right after the sort re-renders the rows.
    // Runs before the browser paints, so the table stays put (no visible move).
    useLayoutEffect(() => {
        if (sortScrollRef.current && tableContainerRef.current) {
            tableContainerRef.current.scrollLeft = sortScrollRef.current.left;
            tableContainerRef.current.scrollTop = sortScrollRef.current.top;
            sortScrollRef.current = null;
        }
    }, [displayedCustomers]);

    const getSortIcon = (key) => {
        if (sortConfig.key !== key) {
            return (
                <div className="ml-1 inline-flex flex-col opacity-60">
                    <ChevronUpIcon className="h-3 w-3" style={{ strokeWidth: 2.5 }} />
                    <ChevronDownIcon className="h-3 w-3 -mt-1" style={{ strokeWidth: 2.5 }} />
                </div>
            );
        }
        return sortConfig.direction === 'asc' ? (
            <ChevronUpIcon className="ml-1 h-3 w-3 inline" style={{ color: themeColor, strokeWidth: 3 }} />
        ) : (
            <ChevronDownIcon className="ml-1 h-3 w-3 inline" style={{ color: themeColor, strokeWidth: 3 }} />
        );
    };

    // Handle drag end for column reordering
    const handleColumnDragEnd = (event) => {
        const { active, over } = event;

        if (active.id !== over.id) {
            setColumnOrder((items) => {
                const oldIndex = items.indexOf(active.id);
                const newIndex = items.indexOf(over.id);

                const newOrder = [...items];
                const [movedItem] = newOrder.splice(oldIndex, 1);
                newOrder.splice(newIndex, 0, movedItem);

                return newOrder;
            });
        }
    };

    // Sortable Table Header Component - Updated to make sort icons clickable
    const SortableTableHeader = ({ id, children, onClick, sortIcon, className, style }) => {
        const {
            attributes,
            listeners,
            setNodeRef,
            transform,
            transition,
            isDragging,
        } = useSortable({ id });

        const dragStyle = {
            transform: CSS.Transform.toString(transform),
            transition,
            cursor: isDragging ? 'grabbing' : 'grab',
            backgroundColor: isDragging ? '#f3f4f6' : 'transparent',
            opacity: isDragging ? 0.5 : 1,
            ...style,
        };

        // Handle sort click - stops propagation to prevent drag
        const handleSortClick = (e) => {
            e.stopPropagation();
            if (onClick) {
                onClick();
            }
        };

        // Handle drag handle click separately
        const handleDragHandleClick = (e) => {
            e.stopPropagation();
        };

        return (
            <th
                ref={setNodeRef}
                style={dragStyle}
                {...attributes}
                className={`${className} relative select-none`}
            >
                <div className="flex items-center justify-center gap-1">
                    <div
                        className="cursor-grab active:cursor-grabbing opacity-50 hover:opacity-100"
                        {...listeners}
                        onClick={handleDragHandleClick}
                    >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M7 2a2 2 0 10-4 0 2 2 0 004 0zm0 8a2 2 0 10-4 0 2 2 0 004 0zm0 8a2 2 0 10-4 0 2 2 0 004 0zm10-8a2 2 0 10-4 0 2 2 0 004 0zm0 8a2 2 0 10-4 0 2 2 0 004 0zm0-16a2 2 0 10-4 0 2 2 0 004 0z" />
                        </svg>
                    </div>
                    <span onClick={handleSortClick} className="cursor-pointer flex items-center">
                        {children}
                    </span>
                    <div onClick={handleSortClick} className="cursor-pointer">
                        {sortIcon}
                    </div>
                </div>
            </th>
        );
    };

    // ==================== Send Letter wizard helpers ====================
    // ==================== Send Letter wizard helpers ====================
    const getBranchNameForLetter = (branchId) => {
        const branchMap = {
            'HO': 'Pune Office', '420435_1': 'Ch.Sambhaji Nagar', '420435_2': 'Ahilyanagar',
            '420435_3': 'Beed', '420435_4': 'Nanded', '420435_5': 'Babhaleshwar',
            '420435_6': 'Latur', '420435_7': 'Parbhani', '420435_8': 'Hubli',
            '420435_9': 'Belagavi', '420435_10': 'Hospet', '420435_11': 'Ballari',
            '420435_12': 'Bagalkot', '420435_13': 'Gulbarga', '420435_14': 'Bijapur'
        };
        return branchMap[branchId] || branchId || '';
    };

    const fmtDisplayDate = (val) =>
        val ? new Date(val).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

    // Load a public image as a base64 data URI (so it renders in preview, print AND email)
    const loadImageAsDataUrl = async (path) => {
        try {
            const res = await fetch(path);
            if (!res.ok) return '';
            const blob = await res.blob();
            return await new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onloadend = () => resolve(r.result);
                r.onerror = reject;
                r.readAsDataURL(blob);
            });
        } catch (e) { return ''; }
    };

    // Reuses already-fetched customerDetails + customerCompleteData — no extra fetch
    const getLetterValues = () => {
        const assetDetail = customerCompleteData?.asset_detailed?.[0] || {};
        const amcs = customerCompleteData?.amc_agreements || [];
        const latestAmc = [...amcs].sort((a, b) =>
            new Date(b.agreement_start_date || 0) - new Date(a.agreement_start_date || 0)
        )[0] || {};
        const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        const kva = latestAmc.kva_rating || assetDetail.kva_rating || '';
        return {
            customer_name: customerDetails?.customer_name || '',
            instance_id: customerDetails?.instance_id || '',
            engine_model: assetDetail.engine_model || '',
            kva,
            engine_with_kva: kva ? `${assetDetail.engine_model || ''} (${kva} KVA)`.trim() : (assetDetail.engine_model || ''),
            agreement_no: latestAmc.agreement_number || '',
            agreement_end: fmtD(latestAmc.agreement_end_date),
            warranty_expiry: fmtD(assetDetail.warranty_expiry_date),
            branch_id: customerDetails?.branch_id || '',
            branch_name: getBranchNameForLetter(customerDetails?.branch_id),
            email: customerDetails?.email || '',
            contact: customerDetails?.phone_number || '',
            location: customerDetails?.location || '',
            date: new Date().toISOString().split('T')[0]
        };
    };

    // --- Letter-as-PDF helpers -------------------------------------------------
    // Load an external script once (used to pull in html2canvas + jsPDF on demand).
    const loadScriptOnce = (src) => new Promise((resolve, reject) => {
        if (Array.from(document.scripts).some(s => s.src === src)) return resolve();
        const el = document.createElement('script');
        el.src = src;
        el.onload = () => resolve();
        el.onerror = () => reject(new Error('Failed to load ' + src));
        document.head.appendChild(el);
    });

    // Loads an image and resolves with the element (used to read natural dimensions).
    const loadHtmlImage = (src) => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });

    // Renders the CURRENT letter HTML to a real multi-page A4 PDF and returns it
    // as base64 (no data: prefix) — ready to attach to the email.
    // The footer band is NOT part of the flowed content; it is stamped at the
    // BOTTOM of the LAST page only (so on a 2-page letter it appears once, on the
    // page where the letter ends — never repeated on every page).
    // Renders the CURRENT letter to a multi-page A4 PDF (base64, no data: prefix) for emailing/saving.
    // The header band is stamped at the TOP and the footer band at the BOTTOM of EVERY page, so they
    // repeat identically when the letter content grows onto further pages.
    const generateLetterPdfBase64 = async () => {
        if (!window.html2canvas) await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
        if (!window.jspdf) await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageW = pdf.internal.pageSize.getWidth();   // 210
        const pageH = pdf.internal.pageSize.getHeight();  // 297

        // Band heights in mm (each image is placed at full page width).
        let headerH = 0, footerH = 0;
        if (headerImgDataUrl) {
            try { const h = await loadHtmlImage(headerImgDataUrl); if (h.width) headerH = pageW * (h.height / h.width); } catch (e) { headerH = 0; }
        }
        if (footerImgDataUrl) {
            try { const f = await loadHtmlImage(footerImgDataUrl); if (f.width) footerH = pageW * (f.height / f.width); } catch (e) { footerH = 0; }
        }
        const SAFE_MM = 4;                                  // small safety gap so edges never clip
        const contentTop = headerH;
        const contentH = Math.max(20, pageH - headerH - footerH - SAFE_MM); // body height available per page (mm)

        // Render the BODY only (no header, no footer in the flow).
        const holder = document.createElement('div');
        holder.style.position = 'fixed';
        holder.style.left = '-10000px';
        holder.style.top = '0';
        holder.style.width = '780px';
        holder.style.background = '#ffffff';
        holder.innerHTML = buildLetterHtml(false, true, true);
        document.body.appendChild(holder);

        const imgs = Array.from(holder.querySelectorAll('img'));
        await Promise.all(imgs.map(im => im.complete ? Promise.resolve()
            : new Promise(res => { im.onload = res; im.onerror = res; })));

        try {
            const canvas = await window.html2canvas(holder, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
            const W = canvas.width;
            const H = canvas.height;
            const pxPerMm = W / pageW;                       // body is rendered at full page width
            const sliceHpx = Math.max(1, Math.floor(contentH * pxPerMm));  // body px per page
            const totalPages = Math.max(1, Math.ceil(H / sliceHpx));

            for (let p = 0; p < totalPages; p++) {
                if (p > 0) pdf.addPage();

                const sourceY = p * sliceHpx;
                const thisSliceHpx = Math.min(sliceHpx, H - sourceY);

                const c = document.createElement('canvas');
                c.width = W;
                c.height = thisSliceHpx;
                const ctx = c.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, c.width, c.height);
                ctx.drawImage(canvas, 0, sourceY, W, thisSliceHpx, 0, 0, W, thisSliceHpx);
                const sliceData = c.toDataURL('image/jpeg', 0.92);
                const sliceHmm = thisSliceHpx / pxPerMm;

                // Body slice between the bands
                pdf.addImage(sliceData, 'JPEG', 0, contentTop, pageW, sliceHmm);
                // Header on top of EVERY page
                if (headerImgDataUrl && headerH > 0) pdf.addImage(headerImgDataUrl, 'PNG', 0, 0, pageW, headerH);
                // Footer on bottom of EVERY page
                if (footerImgDataUrl && footerH > 0) pdf.addImage(footerImgDataUrl, 'PNG', 0, pageH - footerH, pageW, footerH);
            }

            return pdf.output('datauristring').split(',')[1];
        } finally {
            document.body.removeChild(holder);
        }
    };

    // Short cover note used as the EMAIL BODY (the full letter rides along as the PDF).
    const buildLetterCoverHtml = () => {
        const f = letterFields;
        return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;">
  <p>Dear Sir/Madam,</p>
  <p>Please find attached the letter${f.subject ? ` regarding <strong>${escapeLetterHtml(f.subject)}</strong>` : ''}${f.ref_no ? ` (Ref No: ${escapeLetterHtml(f.ref_no)})` : ''}.</p>
  <p>Best regards,<br/>${escapeLetterHtml(COMPANY_FULL)}</p>
</div>`;
    };

    // True when the selected format's product is CSP (subtype then shows right after Instance ID)
    const isCspLetter = () =>
        (selectedLetterFormat?.products || []).some(p => (p || '').trim().toUpperCase() === 'CSP');

    // Unique SR subtype(s) for this customer, taken from the CSP Info box.
    // Shown after the Instance ID in CSP letters only.
    const getCspSubtypes = () => {
        if (!cspInfo || cspInfo.length === 0) return '';
        const subs = [...new Set(cspInfo.map(r => (r.sr_subtype || '').trim()).filter(Boolean))];
        return subs.join(', ');
    };

    const applyLetterPlaceholders = (tpl, v) =>
        (tpl || '')
            .replace(/{customer_name}/gi, v.customer_name || '')
            .replace(/{instance_id}/gi, v.instance_id || '')
            .replace(/{engine_model}/gi, v.engine_with_kva || v.engine_model || '')
            .replace(/{kva}/gi, v.kva || '')
            .replace(/{agreement_no}/gi, v.agreement_no || '')
            .replace(/{agreement_end}/gi, v.agreement_end || '')
            .replace(/{warranty_expiry}/gi, v.warranty_expiry || '')
            .replace(/{branch}/gi, v.branch_name || v.branch_id || '')
            .replace(/{date}/gi, v.date || '');

    const buildDefaultStartPara = (v) =>
        `This is to bring to your kind attention that the AMC / warranty for your DG Set (Engine Model ${v.engine_model || '-'}) is due to expire on ${v.warranty_expiry || v.agreement_end || '-'}.

To ensure uninterrupted service and optimal performance of your equipment, we request you to renew your maintenance contract before the due date.`;

    const buildDefaultEndPara = (v) =>
        `Our representative from the ${v.branch_name || 'nearest'} branch will get in touch with you shortly. For any queries, please contact your nearest ${COMPANY_NAME} branch.`;

    // Reference No from the format template: KCGL/26-27/<product>/BranchCode/serial no
    // -> "BranchCode" filled with the customer's branch, "serial no" with the FY sequence.
    const buildLetterReference = (fmt, v, seq, fyOverride) => {
        if (fmt && fmt.reference_no && fmt.reference_no.trim()) {
            return fmt.reference_no
                .replace(/branch[_\s]?code/gi, v.branch_id || '-')
                .replace(/serial[_\s]?no\.?/gi, String(seq).padStart(2, '0'));
        }
        const fy = (fyOverride !== undefined && fyOverride !== null) ? fyOverride : (letterFy || '');
        return `KC/${fy}/${String(seq).padStart(2, '0')}`;
    };

    const fetchLetterFormatsForWizard = async () => {
        setLetterFormatsLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/v1/campaigns/letter-master/formats`);
            if (!res.ok) throw new Error('Failed to load letter formats');
            const data = await res.json();
            setWizardLetterFormats(data);
        } catch (e) {
            toast.error(e.message || 'Failed to load letter formats');
        } finally {
            setLetterFormatsLoading(false);
        }
    };

    const resetLetterWizardState = () => {
        setLetterStep(1);
        // clear any leftover number/FY from the PREVIOUS customer so it can't flash stale
        setLetterSeq(1);
        setLetterRefNo('');
        setLetterFy('');
        setPreviousLetters([]);
        setSelectedLetterFormat(null);
        setLetterAttachments([]);
        setLetterChannels([]);
        setLetterFileName('');
        setEditingLetterRecordId(null);
        setIncludeFollowups(false);
        setIncludeQuotations(false);
        setSelectedFollowupIds([]);
        setSelectedQuotationIds([]);
        setShowFollowupPicker(false);
        setShowQuotationPicker(false);
        setIncludeLetterRefs(false);
        setSelectedLetterRefIds([]);
        setShowLetterRefPicker(false);
        setLetterToList([]);
        setLetterToInput('');
        setLetterMatchedGoems([]);
        setLetterCcList([]);
        setLetterCcInput('');
        setLetterWhatsappList([]);
        setLetterWhatsappInput('');
        // editable References + tables (Step 2)
        setLetterRefFieldValues({});
        setLetterRefHiddenFields([]);
        setFollowupCellEdits({});
        setFollowupHiddenCols([]);
        setQuotationCellEdits({});
        setQuotationHiddenCols([]);
        setLetterRefCellEdits({});
        setLetterRefHiddenCols([]);
    };

    const openLetterWizard = async () => {
        if (!customerDetails) {
            toast.error('Customer details are still loading. Please wait.');
            return;
        }
        resetLetterWizardState();
        setShowLetterWizard(true);
        fetchLetterFormatsForWizard();

        if (!headerImgDataUrl) { const d = await loadImageAsDataUrl(LETTER_HEADER_IMG); if (d) setHeaderImgDataUrl(d); }
        if (!footerImgDataUrl) { const d = await loadImageAsDataUrl(LETTER_FOOTER_IMG); if (d) setFooterImgDataUrl(d); }

        try {
            const res = await fetch(`${API_BASE_URL}/v1/engagement/letter/next-ref?instance_id=${encodeURIComponent(customerDetails.instance_id || '')}`);
            if (res.ok) {
                const d = await res.json();
                setLetterRefNo(d.ref_no);
                setLetterFy(d.financial_year);
                setLetterSeq(d.sequence);
                setPreviousLetters(d.previous_letters || []);
            }
        } catch (e) { /* non-blocking */ }
    };

    const selectLetterFormat = async (fmt) => {
        setSelectedLetterFormat(fmt);
        setLetterAttachments((fmt.default_attachments || []).map(a => ({ ...a })));

        // Re-fetch the sequence/ref using this format's serial_start
        if (customerDetails?.instance_id && fmt?.id) {
            try {
                const res = await fetch(
                    `${API_BASE_URL}/v1/engagement/letter/next-ref?instance_id=${encodeURIComponent(customerDetails.instance_id)}&format_type_id=${fmt.id}`
                );
                if (res.ok) {
                    const d = await res.json();
                    setLetterFy(d.financial_year);
                    setLetterSeq(d.sequence);
                    setPreviousLetters(d.previous_letters || []);
                    // Don't setLetterRefNo here — buildLetterReference fills in BranchCode client-side
                }
            } catch (e) { /* non-blocking */ }
        }
    };

    // Always re-pull the live per-format sequence from the backend (read-only count,
    // never creates a row) so the number is correct even right after a customer change.
    const fetchLetterSequenceForFormat = async () => {
        if (!customerDetails?.instance_id || !selectedLetterFormat?.id) return null;
        try {
            const res = await fetch(
                `${API_BASE_URL}/v1/engagement/letter/next-ref?instance_id=${encodeURIComponent(customerDetails.instance_id)}&format_type_id=${selectedLetterFormat.id}`
            );
            if (res.ok) {
                const d = await res.json();
                setLetterFy(d.financial_year);
                setLetterSeq(d.sequence);
                setPreviousLetters(d.previous_letters || []);
                return { fy: d.financial_year, seq: d.sequence };
            }
        } catch (e) { /* non-blocking */ }
        return null;
    };

    const prepareLetterFields = (explicitSeq, explicitFy) => {
        const v = getLetterValues();
        const fmt = selectedLetterFormat;
        const seq = (explicitSeq !== undefined && explicitSeq !== null) ? explicitSeq : (letterSeq || 1);
        const fy = (explicitFy !== undefined && explicitFy !== null) ? explicitFy : letterFy;
        const refNo = buildLetterReference(fmt, v, seq, fy);
        setLetterRefNo(refNo);

        const startPara = (fmt && fmt.start_para && fmt.start_para.trim())
            ? applyLetterPlaceholders(fmt.start_para, v)
            : buildDefaultStartPara(v);
        const endPara = (fmt && fmt.end_para && fmt.end_para.trim())
            ? applyLetterPlaceholders(fmt.end_para, v)
            : buildDefaultEndPara(v);

        setLetterFields(prev => ({
            ref_no: refNo,
            date: v.date,                          // ISO (for the date input)
            to_name: v.customer_name,              // locked
            to_address: v.location || v.branch_name || '',
            instance_id: v.instance_id,            // locked
            engine_model: v.engine_with_kva,
            agreement_no: v.agreement_no,
            contact: v.contact,
            email: v.email,
            subject: fmt?.format_type_name || '',  // subject = format type name (editable)
            start_para: startPara,
            end_para: endPara,
            // Keep any wording the user already edited; otherwise fall back to the defaults
            followup_intro: (prev.followup_intro && prev.followup_intro.trim()) ? prev.followup_intro : DEFAULT_FOLLOWUP_INTRO,
            quotation_intro: (prev.quotation_intro && prev.quotation_intro.trim()) ? prev.quotation_intro : DEFAULT_QUOTATION_INTRO,
            letterref_intro: (prev.letterref_intro && prev.letterref_intro.trim()) ? prev.letterref_intro : DEFAULT_LETTERREF_INTRO
        }));
    };

    const goToLetterStep = async (step) => {
        if (step >= 2 && !selectedLetterFormat) {
            toast.error('Please select a Format Type first');
            return;
        }
        if (step === 2) {
            setLetterStepLoading(true);                            // show spinner
            const fresh = await fetchLetterSequenceForFormat();   // get the latest number NOW
            prepareLetterFields(fresh?.seq, fresh?.fy);           // build ref from that, not stale state
            const allow = getAllowedEngagementToggles();
            if (!allow.followups) { setIncludeFollowups(false); setSelectedFollowupIds([]); }
            if (!allow.quotations) { setIncludeQuotations(false); setSelectedQuotationIds([]); }
            if (!allow.letterrefs) { setIncludeLetterRefs(false); setSelectedLetterRefIds([]); }
            setLetterStepLoading(false);                           // hide spinner
        }
        if (step === 3) {
            if (!letterFields.subject && !letterFields.start_para) prepareLetterFields();
            setLetterEmailTo(customerDetails?.email || '');
            setLetterWhatsappTo(String(customerDetails?.phone_number || ''));
            // Default the (editable) PDF file name from the subject; keep any name the user already typed
            setLetterFileName(prev => (prev && prev.trim()) ? prev : (letterFields.subject || letterFields.ref_no || 'Letter'));
            prefillDefaultRecipients();   // <-- THIS line is what loads branch email + rule emails into CC
        }
        setLetterStep(step);
    };

    // Follow-ups relevant to this format's products (falls back to all when no match)
    const formatFollowups = () => {
        const products = (selectedLetterFormat?.products || []).map(p => (p || '').toLowerCase());
        const list = customerFollowups || [];
        if (products.length === 0) return list;
        const matched = list.filter(f => {
            const svc = (f.campaign_service || f.campaign_name || '').toLowerCase();
            return products.some(p => p && (svc.includes(p) || p.includes(svc)));
        });
        return matched.length > 0 ? matched : list;
    };
    const quotationFollowups = () => formatFollowups().filter(f => f.quotation_sent);

    const toggleSelectedFollowup = (id) =>
        setSelectedFollowupIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    const toggleSelectedQuotation = (id) =>
        setSelectedQuotationIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    const toggleSelectedLetterRef = (id) =>
        setSelectedLetterRefIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    // Previous letters available to attach as references (this customer's history).
    // When editing a saved letter, exclude that same record from the list.
    const letterRefOptions = () =>
        (letterHistory || []).filter(l => !editingLetterRecordId || l.id !== editingLetterRecordId);

    const addToEmail = () => {
        const e = letterToInput.trim();
        if (!e) return;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { toast.error('Enter a valid email'); return; }
        const lo = e.toLowerCase();
        if (lo === (letterEmailTo || '').toLowerCase()
            || letterToList.some(x => x.toLowerCase() === lo)) { toast.error('Email already added'); return; }
        // if it was sitting in CC, move it to To
        setLetterCcList(prev => prev.filter(x => x.toLowerCase() !== lo));
        setLetterToList(prev => [...prev, e]);
        setLetterToInput('');
    };
    const removeToEmail = (i) => setLetterToList(prev => prev.filter((_, idx) => idx !== i));

    const addCcEmail = () => {
        const e = letterCcInput.trim();
        if (!e) return;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { toast.error('Enter a valid email'); return; }
        const lo = e.toLowerCase();
        if (lo === (letterEmailTo || '').toLowerCase()
            || letterCcList.some(x => x.toLowerCase() === lo)
            || letterToList.some(x => x.toLowerCase() === lo)) { toast.error('Email already added'); return; }
        setLetterCcList(prev => [...prev, e]);
        setLetterCcInput('');
    };
    const removeCcEmail = (i) => setLetterCcList(prev => prev.filter((_, idx) => idx !== i));

    const addWhatsappNumber = () => {
        const n = letterWhatsappInput.replace(/[^\d]/g, '');
        if (!n) return;
        if (n === letterWhatsappTo || letterWhatsappList.includes(n)) { toast.error('Number already added'); return; }
        setLetterWhatsappList(prev => [...prev, n]);
        setLetterWhatsappInput('');
    };
    const removeWhatsappNumber = (i) => setLetterWhatsappList(prev => prev.filter((_, idx) => idx !== i));

    const escapeLetterHtml = (s) =>
        String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // ==================== Step-2 editable letter tables / References ====================
    // editable = inline-editable cell; removable = can be hidden from THIS letter via ✕
    // (the underlying data is never deleted).
    const LETTER_FOLLOWUP_COLS = [
        { key: 'date', label: 'Date', editable: false, removable: false },
        { key: 'drive', label: 'Drive', editable: true, removable: true },
        { key: 'status', label: 'Drive Status', editable: true, removable: true },
        { key: 'product', label: 'Service/Product', editable: true, removable: true },
        { key: 'employee', label: 'Employee', editable: true, removable: true },
        { key: 'mode', label: 'Follow-up By', editable: true, removable: true },
        { key: 'remark', label: 'Remark', editable: true, removable: true },
    ];
    const LETTER_QUOTATION_COLS = [
        { key: 'quote_no', label: 'Quote No', editable: true, removable: true },
        { key: 'date', label: 'Date', editable: false, removable: false },
        { key: 'value', label: 'Value', editable: false, removable: false },
        { key: 'product', label: 'Product', editable: true, removable: true },
        { key: 'employee', label: 'Employee', editable: true, removable: true },
    ];
    const LETTER_REF_COLS = [
        { key: 'ref_no', label: 'Ref No', editable: false, removable: true },
        { key: 'format', label: 'Format Type', editable: true, removable: true },
        { key: 'channels', label: 'Channels', editable: true, removable: true },
        { key: 'date', label: 'Date', editable: false, removable: true },
        { key: 'sent_by', label: 'Sent By', editable: true, removable: true },
    ];

    const _ld = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
    const _followupStatusLabel = (s) =>
        s === 'not_connected' ? 'Not Connected'
            : s === 'rescheduled' ? 'Rescheduled'
                : s === 'wip' ? 'WIP'
                    : s === 'completed' ? 'Completed'
                        : s === 'rejected' ? 'Rejected'
                            : (s || '-');

    // ----- raw (pre-edit) cell values -----
    const followupCellRaw = (fu, k) => {
        switch (k) {
            case 'date': return _ld(fu.followup_date);
            case 'drive': return fu.campaign_name || '-';
            case 'status': return _followupStatusLabel(fu.status);
            case 'product': return fu.campaign_service || fu.campaign_name || '-';
            case 'employee': return fu.user_name || '-';
            case 'mode': return fu.followup_by || '-';
            case 'remark': return fu.followup_remark || '-';
            default: return '-';
        }
    };
    const quotationCellRaw = (q, k) => {
        switch (k) {
            case 'quote_no': return q.quotation_no || '-';
            case 'date': return _ld(q.followup_date);
            case 'value': return q.quotation_value ? '₹' + Number(q.quotation_value).toLocaleString('en-IN') : '-';
            case 'product': return q.campaign_service || q.campaign_name || '-';
            case 'employee': return q.user_name || '-';
            default: return '-';
        }
    };
    const letterRefCellRaw = (l, k) => {
        switch (k) {
            case 'ref_no': return l.ref_no || '-';
            case 'format': return l.format_type_name || '-';
            case 'channels': return letterRefChannelText(l);
            case 'date': return _ld(l.created_at);
            case 'sent_by': return l.sent_by_name || '-';
            default: return '-';
        }
    };

    // ----- edited-or-raw cell values -----
    const followupCellValue = (fu, k) => { const e = followupCellEdits[fu.id]?.[k]; return (e !== undefined && e !== null) ? e : followupCellRaw(fu, k); };
    const quotationCellValue = (q, k) => { const e = quotationCellEdits[q.id]?.[k]; return (e !== undefined && e !== null) ? e : quotationCellRaw(q, k); };
    const letterRefCellValue = (l, k) => { const e = letterRefCellEdits[l.id]?.[k]; return (e !== undefined && e !== null) ? e : letterRefCellRaw(l, k); };

    // ----- per-table cell setters -----
    const setFollowupCell = (id, k, v) => setFollowupCellEdits(p => ({ ...p, [id]: { ...(p[id] || {}), [k]: v } }));
    const setQuotationCell = (id, k, v) => setQuotationCellEdits(p => ({ ...p, [id]: { ...(p[id] || {}), [k]: v } }));
    const setLetterRefCell = (id, k, v) => setLetterRefCellEdits(p => ({ ...p, [id]: { ...(p[id] || {}), [k]: v } }));

    // ----- visible (not-hidden) columns -----
    const visibleFollowupCols = () => LETTER_FOLLOWUP_COLS.filter(c => !followupHiddenCols.includes(c.key));
    const visibleQuotationCols = () => LETTER_QUOTATION_COLS.filter(c => !quotationHiddenCols.includes(c.key));
    const visibleLetterRefCols = () => LETTER_REF_COLS.filter(c => !letterRefHiddenCols.includes(c.key));

    // ----- selected rows -----
    const selectedFollowupRows = () => (customerFollowups || []).filter(f => selectedFollowupIds.includes(f.id));
    const selectedQuotationRows = () => (customerFollowups || []).filter(f => selectedQuotationIds.includes(f.id) && f.quotation_sent);
    const selectedLetterRefRows = () => letterRefOptions().filter(l => selectedLetterRefIds.includes(l.id));

    // ----- References rows: instance_id locked & permanent; everything else editable + removable -----
    const getLetterReferenceRows = () => {
        const map = getCustomerDetailFieldMap();
        const keys = getSelectedCustomerDetailKeys();
        const rows = [];
        keys.forEach(k => {
            if (!map[k]) return;
            const isInstance = k === 'instance_id';
            rows.push({ key: k, label: map[k].label, value: map[k].value, editable: !isInstance, removable: !isInstance });
        });
        if (isCspLetter() && getCspSubtypes()) {
            const cspRow = { key: 'csp_subtype', label: 'SR Subtype', value: getCspSubtypes(), editable: true, removable: true };
            const idx = rows.findIndex(r => r.key === 'instance_id');
            if (idx >= 0) rows.splice(idx + 1, 0, cspRow); else rows.unshift(cspRow);
        }
        return rows;
    };
    const letterRefFieldValue = (key, raw) => {
        const e = letterRefFieldValues[key];
        return (e !== undefined && e !== null) ? e : raw;
    };

    // ----- generic editable table used by all three blocks in Step 2 -----
    const renderLetterEditTable = ({ cols, hiddenCols, setHiddenCols, rows, rowId, getCell, onCellChange, emptyText }) => {
        const visible = cols.filter(c => !hiddenCols.includes(c.key));
        const hidden = cols.filter(c => hiddenCols.includes(c.key));
        if (rows.length === 0) return <p className="text-[10px] text-gray-400 mt-1">{emptyText}</p>;
        return (
            <div className="mt-1">
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="w-full text-[11px]">
                        <thead className="bg-gray-100">
                            <tr>
                                {visible.map(c => (
                                    <th key={c.key} className="px-2 py-1 text-left font-semibold text-black border-r border-gray-200 whitespace-nowrap">
                                        <span className="inline-flex items-center gap-1">
                                            {c.label}
                                            {c.removable && (
                                                <button type="button" title={`Remove "${c.label}" from this letter`}
                                                    onClick={() => setHiddenCols(prev => [...prev, c.key])}
                                                    className="text-gray-400 hover:text-red-600">
                                                    <XMarkIcon className="h-3 w-3" />
                                                </button>
                                            )}
                                        </span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(row => {
                                const id = rowId(row);
                                return (
                                    <tr key={id} className="border-t border-gray-100">
                                        {visible.map(c => (
                                            <td key={c.key} className="px-1.5 py-1 border-r border-gray-100 align-middle">
                                                {c.editable ? (
                                                    <input value={getCell(row, c.key)}
                                                        onChange={(e) => onCellChange(id, c.key, e.target.value)}
                                                        className="w-full border border-gray-200 rounded px-1.5 py-0.5 text-[11px] text-black" />
                                                ) : (
                                                    <span className="text-black">{getCell(row, c.key)}</span>
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {hidden.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <span className="text-[10px] text-gray-500">Hidden:</span>
                        {hidden.map(c => (
                            <button key={c.key} type="button"
                                onClick={() => setHiddenCols(prev => prev.filter(k => k !== c.key))}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-dashed border-gray-300 text-[10px] text-gray-600 hover:bg-gray-50">
                                <PlusIcon className="h-2.5 w-2.5" /> {c.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const buildFollowupLetterHtml = () => {
        const items = selectedFollowupRows();
        const cols = visibleFollowupCols();
        if (items.length === 0 || cols.length === 0) return '';
        const th = cols.map(c => `<th style="border:1px solid #e5e7eb;padding:4px 6px;text-align:left;">${escapeLetterHtml(c.label)}</th>`).join('');
        const rows = items.map(fu => `<tr>${cols.map(c => `<td style="border:1px solid #e5e7eb;padding:4px 6px;">${escapeLetterHtml(followupCellValue(fu, c.key))}</td>`).join('')}</tr>`).join('');
        return `<div style="margin-top:12px;font-size:13px;line-height:1.7;">${escapeLetterHtml(letterFields.followup_intro)}</div>
      <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:11px;">
        <thead><tr style="background:#f3f4f6;">${th}</tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    };

    const buildQuotationLetterHtml = () => {
        const items = selectedQuotationRows();
        const cols = visibleQuotationCols();
        if (items.length === 0 || cols.length === 0) return '';
        const th = cols.map(c => `<th style="border:1px solid #e5e7eb;padding:4px 6px;text-align:left;">${escapeLetterHtml(c.label)}</th>`).join('');
        const rows = items.map(q => `<tr>${cols.map(c => `<td style="border:1px solid #e5e7eb;padding:4px 6px;">${escapeLetterHtml(quotationCellValue(q, c.key))}</td>`).join('')}</tr>`).join('');
        return `<div style="margin-top:12px;font-size:13px;line-height:1.7;">${escapeLetterHtml(letterFields.quotation_intro)}</div>
      <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:11px;">
        <thead><tr style="background:#f3f4f6;">${th}</tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    };

    const buildFollowupLetterText = () => {
        const items = selectedFollowupRows();
        const cols = visibleFollowupCols();
        if (items.length === 0 || cols.length === 0) return '';
        let out = `\n\n${letterFields.followup_intro}`;
        items.forEach((fu, i) => { out += `\n${i + 1}. ` + cols.map(c => `${c.label}: ${followupCellValue(fu, c.key)}`).join(' | '); });
        return out;
    };
    const buildQuotationLetterText = () => {
        const items = selectedQuotationRows();
        const cols = visibleQuotationCols();
        if (items.length === 0 || cols.length === 0) return '';
        let out = `\n\n${letterFields.quotation_intro}`;
        items.forEach((q, i) => { out += `\n${i + 1}. ` + cols.map(c => `${c.label}: ${quotationCellValue(q, c.key)}`).join(' | '); });
        return out;
    };

    // Channels of a stored letter -> readable text ("Email, WhatsApp")
    const letterRefChannelText = (l) => {
        const chs = l.channels || [];
        if (chs.length === 0) return '-';
        return chs.map(c => (c === 'email' ? 'Email' : c === 'whatsapp' ? 'WhatsApp' : c)).join(', ');
    };

    // Table: Ref No | Format Type | Channels | Date | Sent By — Ref No + Date locked; columns removable
    const buildLetterRefHtml = () => {
        const items = selectedLetterRefRows();
        const cols = visibleLetterRefCols();
        if (items.length === 0 || cols.length === 0) return '';
        const th = cols.map(c => `<th style="border:1px solid #e5e7eb;padding:4px 6px;text-align:left;">${escapeLetterHtml(c.label)}</th>`).join('');
        const rows = items.map(l => `<tr>${cols.map(c => `<td style="border:1px solid #e5e7eb;padding:4px 6px;">${escapeLetterHtml(letterRefCellValue(l, c.key))}</td>`).join('')}</tr>`).join('');
        return `<div style="margin-top:12px;font-size:13px;line-height:1.7;">${escapeLetterHtml(letterFields.letterref_intro)}</div>
      <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:11px;">
        <thead><tr style="background:#f3f4f6;">${th}</tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    };

    const buildLetterRefText = () => {
        const items = selectedLetterRefRows();
        const cols = visibleLetterRefCols();
        if (items.length === 0 || cols.length === 0) return '';
        let out = `\n\n${letterFields.letterref_intro}`;
        items.forEach((l, i) => { out += `\n${i + 1}. ` + cols.map(c => `${c.label}: ${letterRefCellValue(l, c.key)}`).join(' | '); });
        return out;
    };

    // Keys MUST match Campaign.jsx → CUSTOMER_DETAIL_OPTIONS exactly
    const CUSTOMER_FIELD_LABELS = {
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
    };

    // key -> { label, value }, from ALREADY-loaded customer data
    const getCustomerDetailFieldMap = () => {
        const v = getLetterValues();
        const asset = customerCompleteData?.asset_detailed?.[0] || {};
        const openSR = customerCompleteData?.open_sr_load_reports?.[0] || {}; // engine_series lives here
        const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        const val = {
            instance_id: v.instance_id,
            account_name: asset.account_name || '',
            kva_rating: v.kva || asset.kva_rating || '',
            commissioning_date: fmtD(asset.commissioning_date),
            application_code: asset.application_code || '',
            engine_no: asset.engine_serial_no || '',          // master key "engine_no" -> asset.engine_serial_no
            engine_model: v.engine_with_kva || v.engine_model || '',
            warranty_expiry: v.warranty_expiry || '',
            product_segment: asset.product_segment || '',
            engine_series: openSR.engine_series || '',         // master key "engine_series" -> open_sr_load_reports
            segment: asset.segment || '',
        };
        const map = {};
        Object.keys(CUSTOMER_FIELD_LABELS).forEach(k => {
            map[k] = { label: CUSTOMER_FIELD_LABELS[k], value: val[k] || '' };
        });
        return map;
    };

    // Which customer keys the format wants in the "References" block (falls back to legacy 3).
    const getSelectedCustomerDetailKeys = () => {
        const keys = selectedLetterFormat?.customer_detail_fields;
        if (Array.isArray(keys) && keys.length > 0) return keys;
        return ['instance_id', 'engine_model', 'agreement_no'];
    };

    // engagement_detail_fields key -> which include toggle it controls
    const ENGAGEMENT_FIELD_TO_TOGGLE = {
        followup_history: 'followups', quotation_history: 'quotations',
        letter_history: 'letterrefs', letterref: 'letterrefs',
    };
    const getAllowedEngagementToggles = () => {
        const keys = selectedLetterFormat?.engagement_detail_fields;
        if (!Array.isArray(keys) || keys.length === 0) {
            return { followups: true, quotations: true, letterrefs: true };
        }
        const allow = { followups: false, quotations: false, letterrefs: false };
        keys.forEach(k => {
            const t = ENGAGEMENT_FIELD_TO_TOGGLE[(k || '').toLowerCase()];
            if (t) allow[t] = true;
        });
        return allow;
    };

    // "References" inner HTML — built from the editable rows, skipping any the user removed
    const buildReferencesHtml = () => {
        const rows = getLetterReferenceRows().filter(r => !letterRefHiddenFields.includes(r.key));
        const parts = [];
        rows.forEach(r => { const v = letterRefFieldValue(r.key, r.value); if (v) parts.push(`${escapeLetterHtml(r.label)}: ${escapeLetterHtml(v)}`); });
        if (parts.length === 0) return '';
        return `<div style="margin-top:6px;color:#333;font-size:12px;"><strong>References:</strong> ${parts.join(' &nbsp;|&nbsp; ')}</div>`;
    };

    const buildReferencesText = () => {
        const rows = getLetterReferenceRows().filter(r => !letterRefHiddenFields.includes(r.key));
        const parts = [];
        rows.forEach(r => { const v = letterRefFieldValue(r.key, r.value); if (v) parts.push(`${r.label}: ${v}`); });
        return parts.join(' | ');
    };

    // Prefill To/CC from format master default_recipients + branch_email_master
    const prefillDefaultRecipients = async () => {
        if (!selectedLetterFormat?.id) return;
        const branchId = customerDetails?.branch_id || '';
        const customerEmailLower = (customerDetails?.email || '').trim().toLowerCase();

        // GOEM/OEM only when it's a real GOEM (CSP info). Anything else (dealer/account
        // names from asset rows) must NOT be sent — it can never equal a rule's GOEM and
        // would wrongly filter out blank-GOEM rules. Send blank so those rules still apply.
        const goem = isCspLetter() ? (cspInfo?.[0]?.goem_oem || '') : '';

        try {
            const res = await fetch(
                `${API_BASE_URL}/v1/engagement/letter/default-recipients` +
                `?format_type_id=${selectedLetterFormat.id}` +
                `&branch_id=${encodeURIComponent(branchId)}` +
                `&goem_oem=${encodeURIComponent(goem)}`
            );
            if (!res.ok) return;
            const d = await res.json();

            const masterTo = (d.to_emails || []).map(e => (e || '').trim()).filter(Boolean);
            // backend already appended the branch_email_master address into cc_emails
            const masterCc = (d.cc_emails || []).map(e => (e || '').trim()).filter(Boolean);
            setLetterMatchedGoems(d.goems || []);

            const primaryTo = customerDetails?.email || '';
            const primaryToLower = primaryTo.trim().toLowerCase();

            // Rule To emails -> the To LIST (real To recipients, alongside the customer).
            // Drop the customer's own address to avoid duplication.
            const toIncoming = masterTo.filter(e => {
                const lo = e.toLowerCase();
                return lo !== primaryToLower && lo !== customerEmailLower;
            });
            if (toIncoming.length > 0) {
                setLetterToList(prev => {
                    const merged = [...prev];
                    toIncoming.forEach(e => {
                        if (!merged.some(x => x.toLowerCase() === e.toLowerCase())) merged.push(e);
                    });
                    return merged;
                });
            }

            // Rule CC emails (incl. branch_email_master) -> the CC list. Skip anything
            // already sitting in To (primary or the extra-To list).
            const toListLower = new Set(toIncoming.map(e => e.toLowerCase()));
            const ccIncoming = masterCc.filter(e => {
                const lo = e.toLowerCase();
                return lo !== primaryToLower && lo !== customerEmailLower && !toListLower.has(lo);
            });
            if (ccIncoming.length > 0) {
                setLetterCcList(prev => {
                    const merged = [...prev];
                    ccIncoming.forEach(e => {
                        if (!merged.some(x => x.toLowerCase() === e.toLowerCase())) merged.push(e);
                    });
                    return merged;
                });
            }
        } catch (e) { /* non-blocking */ }
    };

    const buildLetterHtml = (pinFooter = false, omitFooter = false, omitHeader = false) => {
        const f = letterFields;
        const followupBlock = includeFollowups ? buildFollowupLetterHtml() : '';
        const quotationBlock = includeQuotations ? buildQuotationLetterHtml() : '';
        const letterrefBlock = includeLetterRefs ? buildLetterRefHtml() : '';

        // Header band: single full-width letterhead image (already contains KALA logo + kirloskar care).
        // omitHeader=true → render NO header in the flow (print/PDF stamp the band on EVERY page instead,
        // so it repeats when the letter spills onto more pages).
        const headerBlock = omitHeader
            ? ''
            : (headerImgDataUrl
                ? `<img src="${headerImgDataUrl}" alt="${escapeLetterHtml(COMPANY_FULL)}" style="display:block;width:100%;max-width:780px;height:auto;margin:0 auto;" />`
                : `<div style="border-bottom:2px solid ${themeColor};padding:0 28px 10px;font-size:18px;font-weight:700;color:${themeColor};">${escapeLetterHtml(COMPANY_NAME)}</div>`);

        return `
<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:780px;margin:0 auto;${pinFooter ? 'min-height:1040px;display:flex;flex-direction:column;' : ''}">
  ${headerBlock}

  <div style="padding:6px 28px 24px;">
    <table style="width:100%;border-collapse:collapse;margin-bottom:14px;font-size:12px;line-height:1.7;">
      <tr>
        <td style="text-align:left;vertical-align:top;"><strong>Ref No:</strong> ${escapeLetterHtml(f.ref_no)}</td>
        <td style="text-align:right;vertical-align:top;white-space:nowrap;"><strong>Date:</strong> ${escapeLetterHtml(fmtDisplayDate(f.date))}</td>
      </tr>
    </table>

    <div style="font-size:13px;line-height:1.6;margin-bottom:12px;">
      <div><strong>To,</strong></div>
      <div>${escapeLetterHtml(f.to_name)}</div>
      <div style="white-space:pre-wrap;">${escapeLetterHtml(f.to_address)}</div>
      ${buildReferencesHtml()}
    </div>

    <div style="font-size:13px;margin-bottom:12px;"><strong>Subject:</strong> ${escapeLetterHtml(f.subject)}</div>

    <div style="font-size:13px;line-height:1.7;">Dear Sir/Madam,</div>

    <div style="margin-top:10px;font-size:13px;line-height:1.7;white-space:pre-wrap;">${escapeLetterHtml(f.start_para)}</div>

    ${followupBlock}
    ${quotationBlock}
    ${letterrefBlock}

    <div style="margin-top:14px;font-size:13px;line-height:1.7;white-space:pre-wrap;">${escapeLetterHtml(f.end_para)}</div>

    <div style="margin-top:26px;font-size:13px;line-height:1.7;white-space:pre-wrap;">${escapeLetterHtml(LETTER_SIGNATURE)}</div>
  </div>

  ${(!omitFooter && footerImgDataUrl) ? `<img src="${footerImgDataUrl}" alt="${escapeLetterHtml(COMPANY_FULL)}" style="display:block;width:100%;max-width:780px;height:auto;margin:${pinFooter ? 'auto auto 0' : '14px auto 0'};" />` : ''}
</div>`;
    };

    const buildLetterText = () => {
        const f = letterFields;
        let out = `${COMPANY_NAME}
Ref No: ${f.ref_no}   Date: ${fmtDisplayDate(f.date)}

To,
${f.to_name}
${f.to_address}
References: ${buildReferencesText()}

Subject: ${f.subject}

Dear Sir/Madam,

${f.start_para}`;
        if (includeFollowups) out += buildFollowupLetterText();
        if (includeQuotations) out += buildQuotationLetterText();
        if (includeLetterRefs) out += buildLetterRefText();
        out += `\n\n${f.end_para}\n\n${LETTER_SIGNATURE}`;
        return out;
    };

    const handlePrintLetter = async () => {
        const w = openPrintWindow();
        if (!w) return;
        const t = toast.loading('Preparing letter…');
        let holder = null;
        try {
            if (!window.html2canvas) {
                await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
            }

            // Work entirely in REAL A4 millimetres so nothing scales/clips at print time.
            const LETTER_W = 780;            // render width (css px) of the body capture
            const PAGE_W_MM = 210;
            const PAGE_H_MM = 297;
            const SAFE_MM = 4;               // tiny safety margin so edges never clip

            // Band heights in mm (each image spans the full page width).
            let headerMm = 0, footerMm = 0;
            if (headerImgDataUrl) {
                try { const h = await loadHtmlImage(headerImgDataUrl); if (h.width) headerMm = PAGE_W_MM * (h.height / h.width); } catch (e) { headerMm = 0; }
            }
            if (footerImgDataUrl) {
                try { const f = await loadHtmlImage(footerImgDataUrl); if (f.width) footerMm = PAGE_W_MM * (f.height / f.width); } catch (e) { footerMm = 0; }
            }
            // Usable body height per page (mm), leaving the bands + a small safe gap.
            const bodyRegionMm = Math.max(40, PAGE_H_MM - headerMm - footerMm - SAFE_MM);

            // Render the letter BODY only (no header, no footer in the flow).
            holder = document.createElement('div');
            holder.style.position = 'fixed';
            holder.style.left = '-10000px';
            holder.style.top = '0';
            holder.style.width = `${LETTER_W}px`;
            holder.style.background = '#ffffff';
            holder.innerHTML = buildLetterHtml(false, true, true);
            document.body.appendChild(holder);

            const innerImgs = Array.from(holder.querySelectorAll('img'));
            await Promise.all(innerImgs.map(im => im.complete ? Promise.resolve()
                : new Promise(res => { im.onload = res; im.onerror = res; })));

            const canvas = await window.html2canvas(holder, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
            document.body.removeChild(holder);
            holder = null;

            // Captured-pixels ↔ mm relationship: the canvas width == PAGE_W_MM across the page.
            const pxPerMm = canvas.width / PAGE_W_MM;
            const sliceHpx = Math.max(1, Math.floor(bodyRegionMm * pxPerMm));  // body px per page
            const totalPages = Math.max(1, Math.ceil(canvas.height / sliceHpx));

            const headerHtml = (headerImgDataUrl && headerMm > 0)
                ? `<img src="${headerImgDataUrl}" style="position:absolute;top:0;left:0;width:${PAGE_W_MM}mm;height:${headerMm}mm;display:block;" />`
                : '';
            const footerHtml = (footerImgDataUrl && footerMm > 0)
                ? `<img src="${footerImgDataUrl}" style="position:absolute;bottom:0;left:0;width:${PAGE_W_MM}mm;height:${footerMm}mm;display:block;" />`
                : '';

            // One real A4 page (in mm) per div: header pinned top, body slice between bands, footer pinned bottom.
            const pageDivs = [];
            for (let p = 0; p < totalPages; p++) {
                const sourceY = p * sliceHpx;
                const thisSliceHpx = Math.min(sliceHpx, canvas.height - sourceY);
                const c = document.createElement('canvas');
                c.width = canvas.width;
                c.height = thisSliceHpx;
                const ctx = c.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, c.width, c.height);
                ctx.drawImage(canvas, 0, sourceY, canvas.width, thisSliceHpx, 0, 0, canvas.width, thisSliceHpx);
                const sliceData = c.toDataURL('image/jpeg', 0.92);
                const sliceHmm = thisSliceHpx / pxPerMm;

                pageDivs.push(`
                    <div style="position:relative;width:${PAGE_W_MM}mm;height:${PAGE_H_MM}mm;background:#fff;overflow:hidden;page-break-after:${p < totalPages - 1 ? 'always' : 'auto'};">
                        ${headerHtml}
                        <img src="${sliceData}" style="position:absolute;top:${headerMm}mm;left:0;width:${PAGE_W_MM}mm;height:${sliceHmm}mm;display:block;" />
                        ${footerHtml}
                    </div>`);
            }
            const pagesHtml = pageDivs.join('');

            // Attachment pages after the letter (image full-width, PDF page-by-page).
            let attHtml = '';
            try { attHtml = await buildAttachmentPrintHtmlAsync(letterAttachments); } catch (e) { attHtml = ''; }

            toast.dismiss(t);
            if (!w || w.closed) return;
            try { w.document.title = escapeLetterHtml(letterFields.subject || letterFields.ref_no || 'Letter'); } catch (e) { }
            w.document.body.style.margin = '0';
            w.document.body.innerHTML =
                `<style>@page{size:A4;margin:0;}html,body{margin:0;padding:0;}img{display:block;}</style>
             ${pagesHtml}${attHtml}`;

            const doPrint = () => { try { w.focus(); w.print(); } catch (e) { } };
            const imgs = w.document.images;
            const total = imgs.length;
            if (total === 0) { setTimeout(doPrint, 250); return; }
            let done = 0;
            const check = () => { done++; if (done >= total) setTimeout(doPrint, 300); };
            for (let i = 0; i < total; i++) {
                const im = imgs[i];
                if (im.complete) check(); else { im.onload = check; im.onerror = check; }
            }
        } catch (e) {
            toast.dismiss(t);
            try { if (holder) document.body.removeChild(holder); } catch (err) { }
            try { if (w && !w.closed) w.close(); } catch (err) { }
            toast.error('Could not prepare the letter for printing');
            console.error('Print letter error:', e);
        }
    };

    // ---- Save (download) helpers ----
    // Default file name = letter subject (sanitized), falling back to "Letter".
    const safePdfName = (name) => {
        const base = String(name || 'Letter').trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').slice(0, 120) || 'Letter';
        return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
    };

    const downloadBase64Pdf = (base64, filename) => {
        try {
            const bytes = base64ToUint8Array(base64);
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            toast.error('Could not save the PDF');
            console.error('Download PDF error:', e);
        }
    };

    // Generic html -> multi-page PDF (used for the stored history letter, whose bands flow inline).
    const htmlToPdfBase64 = async (html) => {
        if (!window.html2canvas) await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
        if (!window.jspdf) await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        const holder = document.createElement('div');
        holder.style.position = 'fixed';
        holder.style.left = '-10000px';
        holder.style.top = '0';
        holder.style.width = '780px';
        holder.style.background = '#ffffff';
        holder.innerHTML = `<div style="max-width:780px;margin:0 auto;background:#fff;">${html}</div>`;
        document.body.appendChild(holder);
        const imgs = Array.from(holder.querySelectorAll('img'));
        await Promise.all(imgs.map(im => im.complete ? Promise.resolve()
            : new Promise(res => { im.onload = res; im.onerror = res; })));
        try {
            const canvas = await window.html2canvas(holder, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageW = pdf.internal.pageSize.getWidth();
            const pageH = pdf.internal.pageSize.getHeight();
            const imgW = pageW;
            const imgH = (canvas.height * imgW) / canvas.width;
            const imgData = canvas.toDataURL('image/jpeg', 0.92);
            let heightLeft = imgH;
            let position = 0;
            pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH);
            heightLeft -= pageH;
            while (heightLeft > 0) {
                position -= pageH;
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH);
                heightLeft -= pageH;
            }
            return pdf.output('datauristring').split(',')[1];
        } finally {
            document.body.removeChild(holder);
        }
    };

    // Save the CURRENT wizard letter as a downloaded PDF (per-page bands). File name = subject.
    const handleSaveLetterPdf = async () => {
        const t = toast.loading('Preparing PDF…');
        try {
            const b64 = await generateLetterPdfBase64();
            toast.dismiss(t);
            if (!b64) { toast.error('Could not generate the PDF'); return; }
            downloadBase64Pdf(b64, safePdfName(letterFileName || letterFields.subject || letterFields.ref_no));
            toast.success('Letter PDF downloaded.');
        } catch (e) {
            toast.dismiss(t);
            toast.error('Could not save the PDF');
            console.error('Downloaded letter PDF error:', e);
        }
    };
    const toggleLetterSendChannel = (ch) =>
        setLetterChannels(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]);

    const handleLetterAddAttachment = (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        const accepted = [];
        for (const file of files) {
            const ext = file.name.split('.').pop().toLowerCase();
            if (!LETTER_ATTACH_EXTS.includes(ext)) { toast.error(`"${file.name}" type not allowed`); continue; }
            if (file.size > 25 * 1024 * 1024) { toast.error(`"${file.name}" exceeds 25MB`); continue; }
            accepted.push(file);
        }
        accepted.forEach(file => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64Content = reader.result.split(',')[1];
                setLetterAttachments(prev => [...prev, {
                    name: file.name, content: base64Content,
                    type: file.type || 'application/octet-stream', size: file.size
                }]);
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };

    const removeLetterWizardAttachment = (i) =>
        setLetterAttachments(prev => prev.filter((_, idx) => idx !== i));

    const handleSendLetter = async () => {
        if (letterChannels.length === 0) { toast.error('Select at least one channel to send'); return; }
        if (letterChannels.includes('email') && !letterEmailTo.trim() && letterToList.length === 0) { toast.error('Enter a recipient email address'); return; }
        if (letterChannels.includes('whatsapp') && !letterWhatsappTo.trim()) { toast.error('Enter a WhatsApp number'); return; }

        setLetterSending(true);
        const t = toast.loading('Sending letter...');
        try {
            // Render the letter to a PDF and attach it (only when emailing). The email
            // body becomes a short cover note (email_body_html below).
            let letterPdfAttachment = null;
            if (letterChannels.includes('email')) {
                try {
                    const pdfB64 = await generateLetterPdfBase64();
                    if (pdfB64) {
                        // Attachment file name = the editable name from Review & Send (falls back to subject, then ref no)
                        letterPdfAttachment = { name: safePdfName(letterFileName || letterFields.subject || letterFields.ref_no), content: pdfB64, type: 'application/pdf' };
                    }
                } catch (pdfErr) {
                    console.error('Letter PDF generation failed:', pdfErr);
                }
            }
            const outgoingAttachments = [
                ...(letterPdfAttachment ? [letterPdfAttachment] : []),
                ...letterAttachments
            ];

            const payload = {
                customer_id: selectedCustomer,
                instance_id: customerDetails?.instance_id,
                format_type_id: selectedLetterFormat?.id,
                format_type_name: selectedLetterFormat?.format_type_name,
                record_id: editingLetterRecordId,
                ref_no: letterFields.ref_no,
                financial_year: letterFy,
                sequence: letterSeq,
                subject: letterFields.subject,
                letter_fields: {
                    ...letterFields,
                    include_followups: includeFollowups,
                    include_quotations: includeQuotations,
                    include_letter_refs: includeLetterRefs,
                    selected_followup_ids: selectedFollowupIds,
                    selected_quotation_ids: selectedQuotationIds,
                    selected_letter_ref_ids: selectedLetterRefIds,
                    to_emails: letterToList,
                    cc_emails: letterCcList,
                    whatsapp_numbers: letterWhatsappList,
                    letter_ref_field_values: letterRefFieldValues,
                    letter_ref_hidden_fields: letterRefHiddenFields,
                    followup_cell_edits: followupCellEdits,
                    followup_hidden_cols: followupHiddenCols,
                    quotation_cell_edits: quotationCellEdits,
                    quotation_hidden_cols: quotationHiddenCols,
                    letterref_cell_edits: letterRefCellEdits,
                    letterref_hidden_cols: letterRefHiddenCols
                },
                letter_html: buildLetterHtml(),
                letter_text: buildLetterText(),
                channels: letterChannels,
                email_to: letterEmailTo,
                to_emails: letterToList,
                cc_emails: letterCcList,
                whatsapp_to: letterWhatsappTo,
                whatsapp_numbers: letterWhatsappList,
                email_body_html: buildLetterCoverHtml(),
                attachments: outgoingAttachments.map(a => ({ name: a.name, content: a.content, type: a.type })),
                sent_by_id: currentUser?.user_id || currentUser?.id,
                sent_by_name: currentUser?.name
            };
            const res = await fetch(`${API_BASE_URL}/v1/engagement/letter/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'Failed to send letter');

            toast.dismiss(t);
            if (data.status === 'sent') {
                toast.success(`Letter sent successfully (${data.ref_no})`);
            } else if (data.status === 'partial') {
                toast(`Sent with issues (${data.ref_no}): ${(data.errors || []).join(', ')}`, { icon: '⚠️', duration: 6000 });
            } else {
                toast.error(`Failed to send: ${(data.errors || []).join(', ') || 'Unknown error'}`);
            }
            if (data.status !== 'failed') {
                setEditingLetterRecordId(null);
                setShowLetterWizard(false);
                if (customerDetails?.instance_id) fetchLetterHistory(customerDetails.instance_id);
            }
        } catch (e) {
            toast.dismiss(t);
            toast.error(e.message || 'Failed to send letter');
        } finally {
            setLetterSending(false);
        }
    };

    // ==================== Letter history / draft / view ====================
    const fetchLetterHistory = async (instanceId) => {
        if (!instanceId) return;
        setLetterHistoryLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/v1/engagement/letter/history?instance_id=${encodeURIComponent(instanceId)}`);
            const data = res.ok ? await res.json() : [];
            setLetterHistory(Array.isArray(data) ? data : []);
        } catch (e) {
            setLetterHistory([]);
        } finally {
            setLetterHistoryLoading(false);
        }
    };

    // Click a Ref No → reopen that letter in the wizard (drafts to edit & send, sent to re-send)
    // Click a Ref No → reopen that letter in the wizard (drafts to edit & send, sent to re-send)
    const openLetterDraft = async (recordId) => {
        const t = toast.loading('Loading letter...');
        try {
            const res = await fetch(`${API_BASE_URL}/v1/engagement/letter/record/${recordId}`);
            if (!res.ok) throw new Error('Failed to load letter');
            const r = await res.json();
            toast.dismiss(t);

            const fmt = {
                id: r.format_type_id,
                format_type_name: r.format_type_name || 'Saved Letter',
                products: [],
                reference_no: '',
                default_attachments: [],
                start_para: '',
                end_para: ''
            };
            setSelectedLetterFormat(fmt);
            setEditingLetterRecordId(r.id);
            setLetterRefNo(r.ref_no);
            setLetterFy(r.financial_year || '');
            setLetterSeq(r.sequence_number || 1);
            setLetterAttachments(r.attachments || []);
            setLetterChannels(r.channels || []);
            setLetterEmailTo(r.email_to || '');
            setLetterWhatsappTo(r.whatsapp_to || '');
            setLetterFileName('');
            setPreviousLetters([]);

            const lf = r.letter_fields || {};
            setIncludeFollowups(!!lf.include_followups);
            setIncludeQuotations(!!lf.include_quotations);
            setIncludeLetterRefs(!!lf.include_letter_refs);
            setSelectedFollowupIds(lf.selected_followup_ids || []);
            setSelectedQuotationIds(lf.selected_quotation_ids || []);
            setSelectedLetterRefIds(lf.selected_letter_ref_ids || []);
            setLetterToList(lf.to_emails || []);
            setLetterCcList(lf.cc_emails || []);
            setLetterWhatsappList(lf.whatsapp_numbers || []);
            setLetterRefFieldValues(lf.letter_ref_field_values || {});
            setLetterRefHiddenFields(lf.letter_ref_hidden_fields || []);
            setFollowupCellEdits(lf.followup_cell_edits || {});
            setFollowupHiddenCols(lf.followup_hidden_cols || []);
            setQuotationCellEdits(lf.quotation_cell_edits || {});
            setQuotationHiddenCols(lf.quotation_hidden_cols || []);
            setLetterRefCellEdits(lf.letterref_cell_edits || {});
            setLetterRefHiddenCols(lf.letterref_hidden_cols || []);

            setLetterFields(Object.keys(lf).length
                ? {
                    ref_no: lf.ref_no || r.ref_no, date: lf.date || new Date().toISOString().split('T')[0],
                    to_name: lf.to_name || '', to_address: lf.to_address || '',
                    instance_id: lf.instance_id || r.instance_id, engine_model: lf.engine_model || '',
                    agreement_no: lf.agreement_no || '', contact: lf.contact || '',
                    email: lf.email || r.email_to || '', subject: lf.subject || r.subject || '',
                    start_para: lf.start_para || r.letter_body || '', end_para: lf.end_para || '',
                    followup_intro: lf.followup_intro || DEFAULT_FOLLOWUP_INTRO,
                    quotation_intro: lf.quotation_intro || DEFAULT_QUOTATION_INTRO,
                    letterref_intro: lf.letterref_intro || DEFAULT_LETTERREF_INTRO
                }
                : {
                    ref_no: r.ref_no, date: new Date().toISOString().split('T')[0], to_name: '', to_address: '',
                    instance_id: r.instance_id, engine_model: '', agreement_no: '',
                    contact: '', email: r.email_to || '', subject: r.subject || '',
                    start_para: r.letter_body || '', end_para: '',
                    followup_intro: DEFAULT_FOLLOWUP_INTRO,
                    quotation_intro: DEFAULT_QUOTATION_INTRO,
                    letterref_intro: DEFAULT_LETTERREF_INTRO
                });

            if (!headerImgDataUrl) { const d = await loadImageAsDataUrl(LETTER_HEADER_IMG); if (d) setHeaderImgDataUrl(d); }
            if (!footerImgDataUrl) { const d = await loadImageAsDataUrl(LETTER_FOOTER_IMG); if (d) setFooterImgDataUrl(d); }

            setLetterStep(2);
            setShowLetterWizard(true);
        } catch (e) {
            toast.dismiss(t);
            toast.error(e.message || 'Failed to load letter');
        }
    };

    // Eye icon → read-only view (on-screen shows the To/CC recipients + file names)
    const viewLetterRecord = async (recordId) => {
        const t = toast.loading('Loading letter...');
        try {
            const res = await fetch(`${API_BASE_URL}/v1/engagement/letter/record/${recordId}`);
            if (!res.ok) throw new Error('Failed to load letter');
            const r = await res.json();
            toast.dismiss(t);
            const atts = r.attachments || [];
            const bare = r.letter_html || '<p style="padding:20px;font-family:Arial">No letter content stored.</p>';

            // ---- Recipients this letter was sent to (To + CC) ----
            // Primary "To" sits on the record (email_to); the extra To/CC lists live in letter_fields.
            const lf = r.letter_fields || {};
            const toEmails = [];
            const primaryTo = (r.email_to || '').trim();
            if (primaryTo) toEmails.push(primaryTo);
            const extraTo = (lf.to_emails && lf.to_emails.length) ? lf.to_emails : (r.to_emails || []);
            extraTo.forEach(e => {
                const ev = (e || '').trim();
                if (ev && !toEmails.some(x => x.toLowerCase() === ev.toLowerCase())) toEmails.push(ev);
            });
            const ccEmails = ((lf.cc_emails && lf.cc_emails.length) ? lf.cc_emails : (r.cc_emails || []))
                .map(e => (e || '').trim()).filter(Boolean);

            const chip = (e, color) =>
                `<span style="display:inline-block;background:${color}1a;color:${color};border-radius:4px;padding:2px 8px;margin:2px 4px 2px 0;font-size:11px;">${escapeLetterHtml(e)}</span>`;

            const recipientsHtml = (toEmails.length || ccEmails.length)
                ? `<div style="max-width:780px;margin:18px auto 0;padding-top:12px;border-top:1px solid #ddd;font-family:Arial,Helvetica,sans-serif;">
                     <div style="font-size:12px;font-weight:700;color:#111;margin-bottom:6px;">Recipients:</div>
                     ${toEmails.length ? `<div style="font-size:12px;margin-bottom:4px;"><span style="font-weight:700;color:#111;">To:</span> ${toEmails.map(e => chip(e, '#2f3192')).join('')}</div>` : ''}
                     ${ccEmails.length ? `<div style="font-size:12px;"><span style="font-weight:700;color:#111;">CC:</span> ${ccEmails.map(e => chip(e, '#16a34a')).join('')}</div>` : ''}
                   </div>`
                : '';

            const namesHtml = atts.length
                ? `<div style="max-width:780px;margin:18px auto 0;padding-top:12px;border-top:1px solid #ddd;font-family:Arial,Helvetica,sans-serif;">
                     <div style="font-size:12px;font-weight:700;color:#111;margin-bottom:6px;">Attachments (${atts.length}):</div>
                     <ul style="margin:0;padding-left:18px;font-size:12px;color:#333;line-height:1.7;">
                       ${atts.map(a => `<li>${escapeLetterHtml(a.name)}</li>`).join('')}
                     </ul>
                   </div>`
                : '';
            setViewLetterBareHtml(bare);
            setViewLetterAttachments(atts);
            setViewLetterSubject(r.subject || '');
            setViewLetterHtml(bare + recipientsHtml + namesHtml);
        } catch (e) {
            toast.dismiss(t);
            toast.error(e.message || 'Failed to load letter');
        }
    };

    // Lazy-load pdf.js (once) so PDF attachments can be rasterised to images for printing
    const loadPdfJsForPrint = () => new Promise((resolve, reject) => {
        if (window.pdfjsLib) return resolve(window.pdfjsLib);
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload = () => {
            try {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            } catch (e) { /* ignore */ }
            resolve(window.pdfjsLib);
        };
        s.onerror = () => reject(new Error('Could not load the PDF renderer'));
        document.head.appendChild(s);
    });

    const base64ToUint8Array = (b64) => {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    };

    // Render every page of a base64 PDF to PNG data URLs (so each page prints full-width, page-wise)
    const renderPdfBase64ToImages = async (b64, scale = 2) => {
        const pdfjsLib = await loadPdfJsForPrint();
        const pdf = await pdfjsLib.getDocument({ data: base64ToUint8Array(b64) }).promise;
        const images = [];
        for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            images.push(canvas.toDataURL('image/png'));
        }
        return images;
    };

    // Build attachment print HTML:
    //   image → full-width (name + image)
    //   pdf   → every page rendered as a full-width image, page by page
    //   video → file name only
    const buildAttachmentPrintHtmlAsync = async (attachments) => {
        const atts = attachments || [];
        if (atts.length === 0) return '';
        const page = (title, inner) =>
            `<div style="page-break-before:always;max-width:780px;margin:0 auto;padding:18px 0;font-family:Arial,Helvetica,sans-serif;">
               <div style="font-size:12px;font-weight:700;color:#111;margin-bottom:8px;">${escapeLetterHtml(title)}</div>
               ${inner}
             </div>`;
        const imgStyle = 'max-width:100%;border:1px solid #ddd;border-radius:4px;display:block;margin:0 auto;';
        let html = '';
        for (const a of atts) {
            const type = (a.type || '').toLowerCase();
            const ext = (a.name || '').split('.').pop().toLowerCase();
            const isImage = type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
            const isPdf = type === 'application/pdf' || ext === 'pdf';
            const isVideo = type.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext);

            if (a.content && isImage) {
                html += page(`Attachment: ${a.name}`, `<img src="data:${a.type || 'image/png'};base64,${a.content}" style="${imgStyle}" />`);
            } else if (a.content && isPdf) {
                try {
                    const imgs = await renderPdfBase64ToImages(a.content, 2);
                    imgs.forEach((src, i) => {
                        html += page(`Attachment: ${a.name} — page ${i + 1}/${imgs.length}`, `<img src="${src}" style="${imgStyle}" />`);
                    });
                } catch (e) {
                    html += page(`Attachment: ${a.name}`, `<div style="font-size:11px;color:#888;">[Could not render PDF — name only]</div>`);
                }
            } else if (isVideo) {
                html += page(`Attachment: ${a.name}`, `<div style="font-size:11px;color:#888;">[Video file — name only]</div>`);
            } else {
                html += page(`Attachment: ${a.name}`, `<div style="font-size:11px;color:#888;">[File attached]</div>`);
            }
        }
        return html;
    };

    // Opens the print window synchronously (so pop-up blockers allow it) with a placeholder
    const openPrintWindow = () => {
        const w = window.open('', '_blank');
        if (!w) { toast.error('Please allow pop-ups to print'); return null; }
        w.document.open();
        w.document.write('<html><head><title>Letter</title></head><body style="margin:0;font-family:Arial,Helvetica,sans-serif;"><div style="padding:24px;color:#555;">Preparing print… please wait.</div></body></html>');
        w.document.close();
        return w;
    };

    // Builds attachment pages (async — may rasterise PDF pages), injects everything into the
    // already-open window via the DOM, waits for all images to load, then prints from the parent.
    const renderAndPrint = async (w, letterBodyHtml, attachments, titleText) => {
        let attHtml = '';
        try { attHtml = await buildAttachmentPrintHtmlAsync(attachments); } catch (e) { attHtml = ''; }
        if (!w || w.closed) return;
        try { w.document.title = titleText || 'Letter'; } catch (e) { /* ignore */ }
        const body = w.document.body;
        body.style.margin = '0';
        body.innerHTML = `<div style="max-width:780px;margin:0 auto;">${letterBodyHtml}</div>${attHtml}`;
        const doPrint = () => { try { w.focus(); w.print(); } catch (e) { /* ignore */ } };
        const imgs = w.document.images;
        const total = imgs.length;
        if (total === 0) { setTimeout(doPrint, 250); return; }
        let done = 0;
        const check = () => { done++; if (done >= total) setTimeout(doPrint, 250); };
        for (let i = 0; i < total; i++) {
            const im = imgs[i];
            if (im.complete) check();
            else { im.onload = check; im.onerror = check; }
        }
    };

    const printViewedLetter = async () => {
        if (!viewLetterBareHtml) return;
        const w = openPrintWindow();
        if (!w) return;
        await renderAndPrint(w, viewLetterBareHtml, viewLetterAttachments, viewLetterSubject || 'Letter');
    };

    // Save the currently-viewed (history) letter as a downloaded PDF — file name = subject.
    const saveViewedLetterPdf = async () => {
        if (!viewLetterBareHtml) return;
        const t = toast.loading('Preparing PDF…');
        try {
            const b64 = await htmlToPdfBase64(viewLetterBareHtml);
            toast.dismiss(t);
            if (!b64) { toast.error('Could not generate the PDF'); return; }
            downloadBase64Pdf(b64, safePdfName(viewLetterSubject || 'Letter'));
            toast.success('Letter PDF saved');
        } catch (e) {
            toast.dismiss(t);
            toast.error('Could not save the PDF');
            console.error('Save viewed letter PDF error:', e);
        }
    };

    const handleSaveLetterDraft = async () => {
        if (!letterFields.body && !letterFields.subject) { toast.error('Nothing to save yet'); return; }
        setLetterSending(true);
        const t = toast.loading('Saving draft...');
        try {
            const payload = {
                record_id: editingLetterRecordId,
                customer_id: selectedCustomer,
                instance_id: customerDetails?.instance_id,
                format_type_id: selectedLetterFormat?.id,
                format_type_name: selectedLetterFormat?.format_type_name,
                ref_no: letterFields.ref_no,
                financial_year: letterFy,
                sequence: letterSeq,
                subject: letterFields.subject,
                letter_fields: {
                    ...letterFields,
                    include_followups: includeFollowups,
                    include_quotations: includeQuotations,
                    include_letter_refs: includeLetterRefs,
                    selected_followup_ids: selectedFollowupIds,
                    selected_quotation_ids: selectedQuotationIds,
                    selected_letter_ref_ids: selectedLetterRefIds,
                    cc_emails: letterCcList,
                    whatsapp_numbers: letterWhatsappList,
                    letter_ref_field_values: letterRefFieldValues,
                    letter_ref_hidden_fields: letterRefHiddenFields,
                    followup_cell_edits: followupCellEdits,
                    followup_hidden_cols: followupHiddenCols,
                    quotation_cell_edits: quotationCellEdits,
                    quotation_hidden_cols: quotationHiddenCols,
                    letterref_cell_edits: letterRefCellEdits,
                    letterref_hidden_cols: letterRefHiddenCols
                },
                letter_html: buildLetterHtml(),
                letter_text: buildLetterText(),
                channels: letterChannels.length ? letterChannels : (selectedLetterFormat?.channels || []),
                email_to: letterEmailTo || customerDetails?.email || '',
                whatsapp_to: letterWhatsappTo || String(customerDetails?.phone_number || ''),
                attachments: letterAttachments.map(a => ({ name: a.name, content: a.content, type: a.type })),
                sent_by_id: currentUser?.user_id || currentUser?.id,
                sent_by_name: currentUser?.name
            };
            const res = await fetch(`${API_BASE_URL}/v1/engagement/letter/save-draft`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'Failed to save draft');
            toast.dismiss(t);
            toast.success(`Draft saved (${data.ref_no})`);
            setEditingLetterRecordId(data.record_id);
            setShowLetterWizard(false);
            if (customerDetails?.instance_id) fetchLetterHistory(customerDetails.instance_id);
        } catch (e) {
            toast.dismiss(t);
            toast.error(e.message || 'Failed to save draft');
        } finally {
            setLetterSending(false);
        }
    };

    // Handle edit customer button click
    const handleEditCustomer = () => {
        setEditCustomerForm({
            customer_name: customerDetails?.customer_name || '',
            phone_number: customerDetails?.phone_number || '',
            email: customerDetails?.email || '',
            pan_number: customerDetails?.pan_number || '',
            location: customerDetails?.location || ''
        });
        setShowEditCustomerModal(true);
    };
    // Add this state near your other state declarations (around line 250-300)
    const [boxOrder, setBoxOrder] = useState(() => {
        const savedOrder = localStorage.getItem('customer_details_box_order');
        if (savedOrder) {
            return JSON.parse(savedOrder);
        }
        // Default box order
        return ['branch', 'asset', 'customer', 'agreement', 'quotations', 'sr'];
    });

    // Add this function to handle box reordering
    const handleBoxDragEnd = (event) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            setBoxOrder((items) => {
                // Ensure dynamically-shown boxes (e.g. 'csp') exist before reordering
                let base = [...items];
                if (!base.includes(active.id)) base.push(active.id);
                if (!base.includes(over.id)) base.push(over.id);

                const oldIndex = base.indexOf(active.id);
                const newIndex = base.indexOf(over.id);

                const newOrder = [...base];
                const [movedItem] = newOrder.splice(oldIndex, 1);
                newOrder.splice(newIndex, 0, movedItem);

                // Save to localStorage
                localStorage.setItem('customer_details_box_order', JSON.stringify(newOrder));

                return newOrder;
            });
        }
    };

    // Draggable Box Component with enhanced styling
    const DraggableBox = ({ id, children, title }) => {
        const {
            attributes,
            listeners,
            setNodeRef,
            transform,
            transition,
            isDragging,
        } = useSortable({ id });

        const style = {
            transform: CSS.Transform.toString(transform),
            transition,
            opacity: isDragging ? 0.5 : 1,
            cursor: isDragging ? 'grabbing' : 'grab',
        };

        return (
            <div
                ref={setNodeRef}
                style={style}
                {...attributes}
                className={`bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200 ${isDragging ? 'shadow-lg ring-2 ring-blue-200' : ''}`}
            >
                <div
                    className="px-5 py-1 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200 flex items-center justify-center cursor-grab active:cursor-grabbing relative"
                    {...listeners}
                >

                    <h4 className="font-bold text-gray-800 text-xs flex items-center gap-2.5">

                        {title}
                    </h4>
                </div>
                {children}
            </div>
        );
    };

    const renderCustomerRelatedData = () => {
        // ⚡ Render the box immediately using already-loaded customerDetails.
        // complete-data fields (asset/agreement/quotes) fill in progressively
        // when the API resolves — no blank screen, no blocking spinner.
        const data = customerCompleteData || {};

        const getLatestAMCAgreement = (agreements) => {
            if (!agreements || agreements.length === 0) return null;
            return [...agreements].sort((a, b) => {
                const dateA = a.agreement_start_date ? new Date(a.agreement_start_date) : new Date(0);
                const dateB = b.agreement_start_date ? new Date(b.agreement_start_date) : new Date(0);
                return dateB - dateA;
            })[0];
        };

        const latestAMC = getLatestAMCAgreement(data.amc_agreements);
        const assetData = data.asset_detailed?.[0] || null;
        const anubandhanPlus = data.anubandhan_plus_quotes?.[0] || null;
        const anubandhan = data.anubandhan_quotes?.[0] || null;
        const bandhanPlus = data.bandhan_plus_quotes?.[0] || null;
        const openSRData = data.open_sr_load_reports?.[0] || null;
        const pulseData = data.pulse_quotations?.[0] || null;

        // Branch name mapping
        const getBranchName = (branchId) => {
            const branchMap = {
                'HO': 'Pune Office',
                '420435_1': 'Ch.Sambhaji Nagar',
                '420435_2': 'Ahilyanagar',
                '420435_3': 'Beed',
                '420435_4': 'Nanded',
                '420435_5': 'Babhaleshwar',
                '420435_6': 'Latur',
                '420435_7': 'Parbhani',
                '420435_8': 'Hubli',
                '420435_9': 'Belagavi',
                '420435_10': 'Hospet',
                '420435_11': 'Ballari',
                '420435_12': 'Bagalkot',
                '420435_13': 'Gulbarga',
                '420435_14': 'Bijapur'
            };
            return branchMap[branchId] || branchId || '-';
        };

        // Helper to format date consistently
        const formatShortDate = (dateString) => {
            if (!dateString) return '-';
            return new Date(dateString).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });
        };

        // Define all boxes content with responsive spacing
        const boxesContent = {
            branch: (
                <div className="p-3 sm:p-4">
                    <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-40">
                        <div className="space-y-0.5">
                            <p className="text-[11px] font-bold text-black uppercase tracking-wide">Branch ID</p>
                            <p className="text-xs text-black font-normal break-words">{customerDetails?.branch_id || '-'}</p>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[11px] font-bold text-black uppercase tracking-wide">Branch Name</p>
                            <p className="text-xs text-black font-normal break-words">{getBranchName(customerDetails?.branch_id)}</p>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[11px] font-bold text-black uppercase tracking-wide">District</p>
                            <p className="text-xs text-black font-normal break-words">{assetData?.district || '-'}</p>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[11px] font-bold text-black uppercase tracking-wide">City</p>
                            <p className="text-xs text-black font-normal break-words">{bandhanPlus?.city || assetData?.city || '-'}</p>
                        </div>
                    </div>
                </div>
            ),
            asset: (
                <div className="p-3 sm:p-4">
                    <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 gap-y-3">
                        <div className="space-y-0.5">
                            <p className="text-[11px] font-bold text-black uppercase tracking-wide">Instance ID</p>
                            <p className="text-xs text-black font-normal break-words">{customerDetails?.instance_id || '-'}</p>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[11px] font-bold text-black uppercase tracking-wide">Account Name</p>
                            <p className="text-xs text-black font-normal break-words">{assetData?.account_name || '-'}</p>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[11px] font-bold text-black uppercase tracking-wide">KVA Rating</p>
                            <p className="text-xs text-black font-normal break-words">{latestAMC?.kva_rating || assetData?.kva_rating || '-'}</p>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[11px] font-bold text-black uppercase tracking-wide">Commissioning Date</p>
                            <p className="text-xs text-black font-normal break-words">{formatShortDate(assetData?.commissioning_date)}</p>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[11px] font-bold text-black uppercase tracking-wide">Application Code</p>
                            <p className="text-xs text-black font-normal break-words">{assetData?.application_code || '-'}</p>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[11px] font-bold text-black uppercase tracking-wide">Engine No.</p>
                            <p className="text-xs text-black font-normal break-words">{assetData?.engine_serial_no || '-'}</p>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[11px] font-bold text-black uppercase tracking-wide">Engine Model</p>
                            <p className="text-xs text-black font-normal break-words">{assetData?.engine_model || '-'}</p>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[11px] font-bold text-black uppercase tracking-wide">Warranty Expiry</p>
                            <p className="text-xs text-black font-normal break-words">{formatShortDate(assetData?.warranty_expiry_date)}</p>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[11px] font-bold text-black uppercase tracking-wide">Product Segment</p>
                            <p className="text-xs text-black font-normal break-words">{assetData?.product_segment || '-'}</p>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[11px] font-bold text-black uppercase tracking-wide">Engine Series</p>
                            <p className="text-xs text-black font-normal break-words">{openSRData?.engine_series || '-'}</p>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[11px] font-bold text-black uppercase tracking-wide">Segment</p>
                            <p className="text-xs text-black font-normal break-words">{assetData?.segment || '-'}</p>
                        </div>
                    </div>
                </div>
            ),
            customer: (
                <div className="p-3 sm:p-4 space-y-2 sm:space-y-1.5">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                        <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[140px]">Customer Name:</p>
                        <p className="text-xs text-black font-normal break-words flex-1">{customerDetails?.customer_name || '-'}</p>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                        <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[140px]">Email:</p>
                        <p className="text-xs text-black font-normal break-all flex-1">{customerDetails?.email || '-'}</p>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                        <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[140px]">Phone Number:</p>
                        <p className="text-xs text-black font-normal break-words flex-1">{formatPhoneNumber(customerDetails?.phone_number)}</p>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                        <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[140px]">Location:</p>
                        <p className="text-xs text-black font-normal break-words flex-1">{customerDetails?.location || '-'}</p>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                        <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[140px]">Customer Segment:</p>
                        <p className="text-xs text-black font-normal break-words flex-1">{assetData?.customer_segment || '-'}</p>
                    </div>
                </div>
            ),
            agreement: (
                <div className="p-3 sm:p-4">
                    <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-40">
                        <div className="space-y-0.5">
                            <p className="text-[11px] font-bold text-black uppercase tracking-wide">Agreement No.</p>
                            <p className="text-xs text-black font-normal break-words">{latestAMC?.agreement_number || '-'}</p>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[11px] font-bold text-black uppercase tracking-wide">Product</p>
                            <p className="text-xs text-black font-normal break-words">{latestAMC?.agreement_product_name || '-'}</p>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[11px] font-bold text-black uppercase tracking-wide">Start Date</p>
                            <p className="text-xs text-black font-normal break-words">{formatShortDate(latestAMC?.agreement_start_date)}</p>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[11px] font-bold text-black uppercase tracking-wide">End Date</p>
                            <p className="text-xs text-black font-normal break-words">{formatShortDate(latestAMC?.agreement_end_date)}</p>
                        </div>
                    </div>
                </div>
            ),
            quotations: (
                <div className="p-3 sm:p-4 space-y-3">
                    {/* Existing Quotations Table */}
                    <div className="border-gray-200 pb-3">
                        <div className="space-y-2">
                            {/* Header Row - Hide on mobile, show on larger screens */}
                            <div className="hidden sm:grid sm:grid-cols-3 gap-40">
                                <p className="text-[11px] font-bold text-black text-center uppercase tracking-wide">Quotation Type</p>
                                <p className="text-[11px] font-bold text-black text-center uppercase tracking-wide">Created Date</p>
                                <p className="text-[11px] font-bold text-black text-center uppercase tracking-wide">Expiry Date</p>
                            </div>

                            {/* Row 1: Anubandhan Plus - Mobile responsive */}
                            <div className="border rounded-lg p-2 sm:p-0 sm:border-none sm:grid sm:grid-cols-3 sm:gap-40">
                                <div className="flex justify-between sm:justify-center items-center sm:block">
                                    <span className="text-[11px] font-bold text-black sm:hidden">Type: </span>
                                    <p className="text-xs text-black font-normal text-left sm:text-center">{anubandhanPlus?.quotation_type || '-'}</p>
                                </div>
                                <div className="flex justify-between sm:justify-center items-center sm:block mt-1 sm:mt-0">
                                    <span className="text-[11px] font-bold text-black sm:hidden">Created: </span>
                                    <p className="text-xs text-black font-normal text-left sm:text-center">{formatShortDate(anubandhanPlus?.created_date_time)}</p>
                                </div>
                                <div className="flex justify-between sm:justify-center items-center sm:block mt-1 sm:mt-0">
                                    <span className="text-[11px] font-bold text-black sm:hidden">Expiry: </span>
                                    <p className="text-xs text-black font-normal text-left sm:text-center">{formatShortDate(anubandhanPlus?.quotation_expiry_date)}</p>
                                </div>
                            </div>

                            {/* Row 2: Anubandhan - Mobile responsive */}
                            <div className="border rounded-lg p-2 sm:p-0 sm:border-none sm:grid sm:grid-cols-3 sm:gap-40">
                                <div className="flex justify-between sm:justify-center items-center sm:block">
                                    <span className="text-[11px] font-bold text-black sm:hidden">Type: </span>
                                    <p className="text-xs text-black font-normal text-left sm:text-center">{anubandhan?.quotation_type || '-'}</p>
                                </div>
                                <div className="flex justify-between sm:justify-center items-center sm:block mt-1 sm:mt-0">
                                    <span className="text-[11px] font-bold text-black sm:hidden">Created: </span>
                                    <p className="text-xs text-black font-normal text-left sm:text-center">{formatShortDate(anubandhan?.created_date_time)}</p>
                                </div>
                                <div className="flex justify-between sm:justify-center items-center sm:block mt-1 sm:mt-0">
                                    <span className="text-[11px] font-bold text-black sm:hidden">Expiry: </span>
                                    <p className="text-xs text-black font-normal text-left sm:text-center">{formatShortDate(anubandhan?.quotation_expiry_date)}</p>
                                </div>
                            </div>

                            {/* Row 3: Bandhan Plus - Mobile responsive */}
                            <div className="border rounded-lg p-2 sm:p-0 sm:border-none sm:grid sm:grid-cols-3 sm:gap-40">
                                <div className="flex justify-between sm:justify-center items-center sm:block">
                                    <span className="text-[11px] font-bold text-black sm:hidden">Type: </span>
                                    <p className="text-xs text-black font-normal text-left sm:text-center">{bandhanPlus?.quotation_type || '-'}</p>
                                </div>
                                <div className="flex justify-between sm:justify-center items-center sm:block mt-1 sm:mt-0">
                                    <span className="text-[11px] font-bold text-black sm:hidden">Created: </span>
                                    <p className="text-xs text-black font-normal text-left sm:text-center">{formatShortDate(bandhanPlus?.created_date_time)}</p>
                                </div>
                                <div className="flex justify-between sm:justify-center items-center sm:block mt-1 sm:mt-0">
                                    <span className="text-[11px] font-bold text-black sm:hidden">Expiry: </span>
                                    <p className="text-xs text-black font-normal text-left sm:text-center">{formatShortDate(bandhanPlus?.quotation_expiry_date)}</p>
                                </div>
                            </div>

                            {/* Row 4: Pulse Quotation - Mobile responsive */}
                            <div className="border rounded-lg p-2 sm:p-0 sm:border-none sm:grid sm:grid-cols-3 sm:gap-40">
                                <div className="flex justify-between sm:justify-center items-center sm:block">
                                    <span className="text-[11px] font-bold text-black sm:hidden">Type: </span>
                                    <p className="text-xs text-black font-normal text-left sm:text-center">
                                        {pulseData?.quote_id ? 'Pulse Quotation' : '-'}
                                    </p>
                                </div>
                                <div className="flex justify-between sm:justify-center items-center sm:block mt-1 sm:mt-0">
                                    <span className="text-[11px] font-bold text-black sm:hidden">Created: </span>
                                    <p className="text-xs text-black font-normal text-left sm:text-center">{formatShortDate(pulseData?.quote_submitted_date)}</p>
                                </div>
                                <div className="flex justify-between sm:justify-center items-center sm:block mt-1 sm:mt-0">
                                    <span className="text-[11px] font-bold text-black sm:hidden">Expiry: </span>
                                    <p className="text-xs text-black font-normal text-left sm:text-center">-</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* New Section: All WIP Quotations with 90-day expiry */}
                    {(() => {
                        // First, identify which campaigns have a completed follow-up that is newer than the WIP follow-up
                        const allFollowups = customerFollowups || [];

                        // Group followups by campaign
                        const campaignFollowupsMap = new Map();
                        allFollowups.forEach(followup => {
                            if (!followup.campaign_id) return;
                            if (!campaignFollowupsMap.has(followup.campaign_id)) {
                                campaignFollowupsMap.set(followup.campaign_id, []);
                            }
                            campaignFollowupsMap.get(followup.campaign_id).push(followup);
                        });

                        // For each campaign, find the latest follow-up date and status
                        const campaignLatestStatus = new Map();
                        campaignFollowupsMap.forEach((followups, campaignId) => {
                            // Sort by followup date (latest first)
                            const sorted = [...followups].sort((a, b) =>
                                new Date(b.followup_date) - new Date(a.followup_date)
                            );
                            const latest = sorted[0];
                            campaignLatestStatus.set(campaignId, {
                                status: latest.status,
                                date: latest.followup_date,
                                campaign_name: latest.campaign_name,
                                campaign_service: latest.campaign_service
                            });
                        });

                        // Filter all followups with status 'wip' and quotation_sent = true
                        // But exclude if campaign has a newer completed follow-up
                        const allWipQuotations = allFollowups.filter(followup => {
                            // Must be WIP with quotation
                            if (followup.status !== 'wip') return false;
                            if (!followup.quotation_sent) return false;
                            if (!followup.quotation_no && !followup.quotation_value) return false;

                            // Check if this campaign has a completed follow-up that is newer
                            const latestCampaignStatus = campaignLatestStatus.get(followup.campaign_id);
                            if (latestCampaignStatus && latestCampaignStatus.status === 'completed') {
                                const latestCompletedDate = new Date(latestCampaignStatus.date);
                                const currentWipDate = new Date(followup.followup_date);

                                // If completed follow-up is newer than this WIP follow-up, hide this WIP
                                if (latestCompletedDate > currentWipDate) {
                                    return false;
                                }
                            }

                            return true;
                        });

                        if (allWipQuotations.length === 0) return null;

                        // Calculate days difference for each followup (90-day expiry)
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        return (
                            <div className="mt-4 pt-3 border-t-2 border-gray-200">
                                <h5 className="text-[11px] font-bold text-black uppercase tracking-wide mb-2 flex items-center gap-2">
                                    <ClockIcon className="h-3 w-3" style={{ color: themeColor }} />
                                    Active WIP Quotations - {allWipQuotations.length}
                                </h5>

                                {/* Mobile view - Card layout */}
                                <div className="block lg:hidden space-y-3">
                                    {allWipQuotations.map((followup) => {
                                        const followupDate = followup.followup_date ? new Date(followup.followup_date) : null;
                                        let diffDays = 0;
                                        let isExpired = false;

                                        if (followupDate) {
                                            followupDate.setHours(0, 0, 0, 0);
                                            const diffTime = today - followupDate;
                                            diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                            isExpired = diffDays > 90;
                                        }

                                        const statusText = isExpired ? 'Expired' : 'Active';
                                        const statusBgClass = isExpired
                                            ? 'bg-orange-200 text-orange-800'
                                            : 'bg-green-200 text-green-800';

                                        return (
                                            <div key={followup.id} className={`border rounded-lg p-3 ${isExpired ? 'bg-orange-50' : 'bg-green-50'}`}>
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-start">
                                                        <span className="text-[11px] font-bold text-black">Drive:</span>
                                                        <span className="text-xs text-black font-normal text-right flex-1 ml-2">{followup.campaign_name || '-'}</span>
                                                    </div>
                                                    <div className="flex justify-between items-start">
                                                        <span className="text-[11px] font-bold text-black">Service:</span>
                                                        <span className="text-xs text-black font-normal text-right flex-1 ml-2">{followup.campaign_service || followup.campaign_name || '-'}</span>
                                                    </div>
                                                    <div className="flex justify-between items-start">
                                                        <span className="text-[11px] font-bold text-black">Send Date:</span>
                                                        <span className="text-xs text-black font-normal text-right flex-1 ml-2">{formatShortDate(followup.followup_date)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-start">
                                                        <span className="text-[11px] font-bold text-black">Days Passed:</span>
                                                        <span className={`text-xs font-normal text-right flex-1 ml-2 ${isExpired ? 'text-orange-600 font-bold' : 'text-black'}`}>
                                                            {diffDays > 0 ? `${diffDays} days` : 'Today'}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-start">
                                                        <span className="text-[11px] font-bold text-black">Quotation No.:</span>
                                                        <span className="text-xs text-black font-normal text-right flex-1 ml-2">{followup.quotation_no || '-'}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[11px] font-bold text-black">Status:</span>
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusBgClass}`}>
                                                            {statusText}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Desktop view - Table layout */}
                                <div className="hidden lg:block overflow-x-auto">
                                    <table className="w-full min-w-[700px] border-collapse">
                                        <thead className="bg-gray-100">
                                            <tr className="border-b border-gray-200">
                                                <th className="px-2 py-1.5 text-center text-[10px] font-bold text-black border-r border-gray-200 whitespace-nowrap">
                                                    Drive Name
                                                </th>
                                                <th className="px-2 py-1.5 text-center text-[10px] font-bold text-black border-r border-gray-200 whitespace-nowrap">
                                                    Service/Product
                                                </th>
                                                <th className="px-2 py-1.5 text-center text-[10px] font-bold text-black border-r border-gray-200 whitespace-nowrap">
                                                    Quotation Send Date
                                                </th>
                                                <th className="px-2 py-1.5 text-center text-[10px] font-bold text-black border-r border-gray-200 whitespace-nowrap">
                                                    Days Passed
                                                </th>
                                                <th className="px-2 py-1.5 text-center text-[10px] font-bold text-black border-r border-gray-200 whitespace-nowrap">
                                                    Quotation No.
                                                </th>
                                                <th className="px-2 py-1.5 text-center text-[10px] font-bold text-black whitespace-nowrap">
                                                    Status
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {allWipQuotations.map((followup) => {
                                                const followupDate = followup.followup_date ? new Date(followup.followup_date) : null;
                                                let diffDays = 0;
                                                let isExpired = false;

                                                if (followupDate) {
                                                    followupDate.setHours(0, 0, 0, 0);
                                                    const diffTime = today - followupDate;
                                                    diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                                    isExpired = diffDays > 90;
                                                }

                                                const rowBgClass = isExpired
                                                    ? 'bg-orange-50 hover:bg-orange-100'
                                                    : 'bg-green-50 hover:bg-green-100';
                                                const statusText = isExpired ? 'Expired' : 'Active';
                                                const statusBgClass = isExpired
                                                    ? 'bg-orange-200 text-orange-800'
                                                    : 'bg-green-200 text-green-800';

                                                return (
                                                    <tr key={followup.id} className={`border-b border-gray-100 ${rowBgClass}`}>
                                                        <td className="px-0.5 py-1.5 text-center text-[11px] text-black border-r border-gray-300">
                                                            {followup.campaign_name || '-'}
                                                        </td>
                                                        <td className="px-0.5 py-1.5 text-center text-[11px] text-black border-r border-gray-300">
                                                            {followup.campaign_service || followup.campaign_name || '-'}
                                                        </td>
                                                        <td className="px-0.5 py-1.5 text-center text-[11px] text-black border-r border-gray-300">
                                                            {formatShortDate(followup.followup_date)}
                                                        </td>
                                                        <td className={`px-0.5 py-1.5 text-center text-[11px] border-r border-gray-300 ${isExpired ? 'text-orange-600 font-bold' : 'text-black'}`}>
                                                            {diffDays > 0 ? `${diffDays} days` : 'Today'}
                                                        </td>
                                                        <td className="px-0.5 py-1.5 text-center text-[11px] text-black border-r border-gray-300">
                                                            {followup.quotation_no || '-'}
                                                        </td>
                                                        <td className="px-0.5 py-1.5 text-center">
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusBgClass}`}>
                                                                {statusText}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Show expired count summary */}
                                {(() => {
                                    const expiredCount = allWipQuotations.filter(followup => {
                                        if (!followup.followup_date) return false;
                                        const followupDate = new Date(followup.followup_date);
                                        followupDate.setHours(0, 0, 0, 0);
                                        const diffDays = Math.ceil((today - followupDate) / (1000 * 60 * 60 * 24));
                                        return diffDays > 90;
                                    }).length;

                                    if (expiredCount > 0) {
                                        return (
                                            <div className="mt-2 text-center">
                                                <span className="text-[10px] text-orange-600 font-medium">
                                                    {expiredCount} quotation(s) expired (older than 90 days)
                                                </span>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}
                            </div>
                        );
                    })()}
                </div>
            ),
            sr: (
                <div className="p-3 sm:p-4">
                    <div className="flex flex-col lg:flex-row lg:gap-4 relative">
                        {/* Vertical Divider Line - Hidden on mobile, visible on lg screens */}
                        <div className="hidden lg:block absolute left-1/2 top-0 bottom-0 w-px bg-gray-300 transform -translate-x-1/2"></div>

                        {/* Left Side - SR Data */}
                        <div className="flex-1 mb-4 lg:mb-0">
                            <div className="space-y-2">
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                                    <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[140px]">SR Number:</p>
                                    <p className="text-xs text-black font-normal break-words flex-1 sm:text-right">{openSRData?.service_request_no || '-'}</p>
                                </div>
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                                    <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[140px]">Type:</p>
                                    <p className="text-xs text-black font-normal break-words flex-1 sm:text-right">{openSRData?.sr_type || '-'}</p>
                                </div>
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                                    <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[140px]">Sub-Type:</p>
                                    <p className="text-xs text-black font-normal break-words flex-1 sm:text-right">{openSRData?.sr_sub_type || '-'}</p>
                                </div>
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                                    <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[140px]">Status:</p>
                                    <p className="text-xs text-black font-normal break-words flex-1 sm:text-right">{openSRData?.status || '-'}</p>
                                </div>
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                                    <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[140px]">Due Date:</p>
                                    <p className="text-xs text-black font-normal break-words flex-1 sm:text-right">{formatShortDate(openSRData?.sr_due_date)}</p>
                                </div>
                            </div>
                        </div>

                        {/* Right Side - Service History Data */}
                        <div className="flex-1 lg:pl-8">
                            {customerServices && customerServices.length > 0 ? (
                                <div className="space-y-4">
                                    {customerServices.map((service, idx) => (
                                        <div key={idx} className="space-y-2">
                                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                                                <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[180px]">Last Closed SR Number:</p>
                                                <p className="text-xs text-black font-normal break-words flex-1 sm:text-right">{service.last_closed_sr_number || '-'}</p>
                                            </div>
                                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                                                <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[180px]">Last SR Type:</p>
                                                <p className="text-xs text-black font-normal break-words flex-1 sm:text-right">{service.last_sr_type || '-'}</p>
                                            </div>
                                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                                                <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[180px]">Last SR Sub Type:</p>
                                                <p className="text-xs text-black font-normal break-words flex-1 sm:text-right">{service.last_sr_subtype || '-'}</p>
                                            </div>
                                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                                                <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[180px]">Last SR Close Date:</p>
                                                <p className="text-xs text-black font-normal break-words flex-1 sm:text-right">{formatShortDate(service.last_sr_close_date)}</p>
                                            </div>
                                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                                                <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[180px]">Last Oil Change SR Number:</p>
                                                <p className="text-xs text-black font-normal break-words flex-1 sm:text-right">{service.last_oil_change_sr_number || '-'}</p>
                                            </div>
                                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                                                <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[180px]">Last Oil Change SR Type:</p>
                                                <p className="text-xs text-black font-normal break-words flex-1 sm:text-right">{service.last_oil_change_sr_type || '-'}</p>
                                            </div>
                                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                                                <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[180px]">Last Oil Change SR Sub Type:</p>
                                                <p className="text-xs text-black font-normal break-words flex-1 sm:text-right">{service.last_oil_change_sr_sub_type || '-'}</p>
                                            </div>
                                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                                                <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[180px]">Last Oil Change Date:</p>
                                                <p className="text-xs text-black font-normal break-words flex-1 sm:text-right">{formatShortDate(service.last_oil_change_date)}</p>
                                            </div>
                                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                                                <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[180px]">Service Hours:</p>
                                                <p className="text-xs text-black font-normal break-words flex-1 sm:text-right">{service.last_service_hrs || '-'}</p>
                                            </div>
                                            {idx < customerServices.length - 1 && (
                                                <div className="border-t border-gray-200 mt-3 pt-3"></div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {customerServices.map((service, idx) => (
                                        <div key={idx} className="space-y-2">
                                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                                                <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[180px]">Last Closed SR Number:</p>
                                                <p className="text-xs text-black font-normal break-words flex-1 sm:text-right">-</p>
                                            </div>
                                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                                                <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[180px]">Last SR Type:</p>
                                                <p className="text-xs text-black font-normal break-words flex-1 sm:text-right">-</p>
                                            </div>
                                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                                                <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[180px]">Last SR Sub Type:</p>
                                                <p className="text-xs text-black font-normal break-words flex-1 sm:text-right">-</p>
                                            </div>
                                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                                                <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[180px]">Last SR Close Date:</p>
                                                <p className="text-xs text-black font-normal break-words flex-1 sm:text-right">-</p>
                                            </div>
                                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                                                <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[180px]">Last Oil Change SR Number:</p>
                                                <p className="text-xs text-black font-normal break-words flex-1 sm:text-right">-</p>
                                            </div>
                                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                                                <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[180px]">Last Oil Change SR Type:</p>
                                                <p className="text-xs text-black font-normal break-words flex-1 sm:text-right">-</p>
                                            </div>
                                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                                                <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[180px]">Last Oil Change SR Sub Type:</p>
                                                <p className="text-xs text-black font-normal break-words flex-1 sm:text-right">-</p>
                                            </div>
                                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                                                <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[180px]">Last Oil Change Date:</p>
                                                <p className="text-xs text-black font-normal break-words flex-1 sm:text-right">-</p>
                                            </div>
                                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                                                <p className="text-[11px] font-bold text-black uppercase tracking-wide min-w-[180px]">Service Hours:</p>
                                                <p className="text-xs text-black font-normal break-words flex-1 sm:text-right">-</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ),
            csp: (() => {
                // Parse common date formats: DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD
                const parseDate = (str) => {
                    if (!str) return null;
                    const s = String(str).trim();

                    let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
                    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

                    m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
                    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);

                    const d = new Date(s);
                    return isNaN(d.getTime()) ? null : d;
                };

                // Due date = SR Open Date + 30 days.
                // If the asset's warranty expiry falls WITHIN that window
                // (on/after SR open date and on/before the +30-day date),
                // the warranty expiry date becomes the due date instead.
                const getDueDate = (openDateStr, warrantyDateStr) => {
                    const open = parseDate(openDateStr);
                    if (!open) return '-';
                    open.setHours(0, 0, 0, 0);

                    const due = new Date(open);
                    due.setDate(due.getDate() + 30);

                    let finalDue = due;
                    const warranty = parseDate(warrantyDateStr);
                    if (warranty) {
                        warranty.setHours(0, 0, 0, 0);
                        if (warranty >= open && warranty <= due) {
                            finalDue = warranty;   // warranty falls inside the 30-day range
                        }
                    }

                    const dd = String(finalDue.getDate()).padStart(2, '0');
                    const mm = String(finalDue.getMonth() + 1).padStart(2, '0');
                    const yyyy = finalDue.getFullYear();
                    return `${dd}-${mm}-${yyyy}`;
                };

                return (
                    <div className="p-3 sm:p-4">
                        <div className="overflow-x-auto">
                            <table className="w-full table-fixed">
                                <thead>
                                    <tr>
                                        <th className="px-2 py-1 text-left text-[11px] font-bold text-black whitespace-nowrap">GOEM/OEM</th>                                        <th className="px-2 py-1 text-center text-[11px] font-bold text-black whitespace-nowrap">SR Number</th>
                                        <th className="px-2 py-1 text-left text-[11px] font-bold text-black whitespace-nowrap">SR Open Date</th>
                                        <th className="px-2 py-1 text-left text-[11px] font-bold text-black whitespace-nowrap">SR Close Date</th>
                                        <th className="px-2 py-1 text-left text-[11px] font-bold text-black whitespace-nowrap">SR Subtype</th>
                                        <th className="px-2 py-1 text-left text-[11px] font-bold text-black whitespace-nowrap">SR Status</th>
                                        <th className="px-2 py-1 text-left text-[11px] font-bold text-black whitespace-nowrap">Segment</th>
                                        <th className="px-2 py-1 text-left text-[11px] font-bold text-black whitespace-nowrap">Due Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {cspInfo.map((row, idx) => (
                                        <tr key={idx}>
                                            <td
                                                className="px-2 py-1.5 text-left text-[11px] text-black truncate max-w-0"
                                                title={row.goem_oem || ''}
                                            >
                                                {row.goem_oem || '-'}
                                            </td>                                                                          <td className="px-2 py-1.5 text-center text-[11px] text-black">{row.sr_number || '-'}</td>
                                            <td className="px-2 py-1.5 text-left text-[11px] text-black">{row.sr_open_date || '-'}</td>
                                            <td className="px-2 py-1.5 text-left text-[11px] text-black">{row.sr_close_date || '-'}</td>
                                            <td className="px-2 py-1.5 text-left text-[11px] text-black">{row.sr_subtype || '-'}</td>
                                            <td className="px-2 py-1.5 text-left text-[11px] text-black">{row.sr_status || '-'}</td>
                                            <td className="px-2 py-1.5 text-left text-[11px] text-black">{row.segment || '-'}</td>
                                            <td className="px-2 py-1.5 text-left text-[11px] font-bold text-black bg-[#ffdb62]">
                                                {getDueDate(row.sr_open_date, assetData?.warranty_expiry_date)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })()
        };

        // Box titles mapping with enhanced header styling
        const boxTitles = {
            branch: 'Branch Details',
            asset: 'Asset Details',
            customer: 'Customer Details',
            agreement: 'Active Agreement Details',
            quotations: 'Quotations Details',
            sr: 'SR Details',
            csp: 'CSP Info'
        };

        // Show the CSP box whenever there is CSP data, regardless of saved order.
        let boxOrderToRender = boxOrder.filter(id => id !== 'csp');
        if (cspInfo.length > 0) {
            boxOrderToRender = [...boxOrderToRender, 'csp'];
        }

        return (
            <DndContext
                collisionDetection={closestCenter}
                onDragEnd={handleBoxDragEnd}
            >
                <SortableContext
                    items={boxOrderToRender}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="space-y-3">
                        {boxOrderToRender.map((boxId) => (
                            <DraggableBox
                                key={boxId}
                                id={boxId}
                                title={boxTitles[boxId]}
                            >
                                {boxesContent[boxId]}
                            </DraggableBox>
                        ))}
                    </div>
                </SortableContext>
            </DndContext>
        );
    };

    // Main List View
    if (!showCustomerDetails) {
        return (
            <div className="min-h-screen">
                <div className="max-w-7xl mx-auto px-4 sm:px-3">

                    {/* Row 1 : Title + Filters */}
                    <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg sm:text-base lg:text-xl font-bold text-black mb-1">
                                Drive Progress
                            </h1>
                        </div>

                        {/* Filters */}
                        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-end gap-2">
                            {/* From and To Date Row - Stack on mobile, row on desktop */}
                            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
                                {/* From */}
                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2 w-full sm:w-auto">
                                    <label className="text-xs text-black whitespace-nowrap">Next Call From:</label>
                                    <input
                                        type="date"
                                        value={fromDate}
                                        onChange={(e) => {
                                            const newFromDate = e.target.value;
                                            setFromDate(newFromDate);
                                            // If To date is set and is earlier than new From date, clear or update it
                                            if (toDate && newFromDate && new Date(toDate) < new Date(newFromDate)) {
                                                setToDate('');
                                                toast.info('To date cannot be earlier than From date. Please select a valid To date.');
                                            }
                                        }}
                                        max={toDate || undefined}
                                        className="border border-gray-300 rounded-md px-2 py-1 text-xs bg-white w-full sm:w-auto"
                                    />
                                </div>

                                {/* To */}
                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2 w-full sm:w-auto">
                                    <label className="text-xs text-black whitespace-nowrap">To:</label>
                                    <input
                                        type="date"
                                        value={toDate}
                                        onChange={(e) => {
                                            const newToDate = e.target.value;
                                            // Validate that To date is not earlier than From date
                                            if (fromDate && newToDate && new Date(newToDate) < new Date(fromDate)) {
                                                toast.error('To date cannot be earlier than From date');
                                                return;
                                            }
                                            setToDate(newToDate);
                                        }}
                                        min={fromDate || undefined}
                                        className="border border-gray-300 rounded-md px-2 py-1 text-xs bg-white w-full sm:w-auto"
                                    />
                                </div>
                            </div>

                            {/* Clear Date Filter Button - Only shows when date filters are applied */}
                            {(fromDate || toDate) && (
                                <button
                                    onClick={() => {
                                        setFromDate('');
                                        setToDate('');
                                        toast.success('Date filters cleared');
                                    }}
                                    className="px-2 py-1 text-xs text-red-600 border border-red-300 rounded-md bg-red-50 hover:bg-red-100 hover:text-red-700 transition-all duration-200 flex items-center gap-1 w-full sm:w-auto justify-center"
                                    title="Clear date filters"
                                >
                                    <XMarkIcon className="h-3.5 w-3.5" />
                                    <span className="sm:hidden">Clear Dates</span>
                                </button>
                            )}

                            {/* Search - Full width on mobile, fixed width on desktop */}
                            <div className="relative w-full sm:w-52 flex flex-col">
                                <MagnifyingGlassIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search by ID, name, mobile..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-7 pr-7 py-1 text-xs border-2 border-black rounded-md bg-white text-black placeholder-gray-400"
                                />
                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm('')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        <XMarkIcon className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>

                            {/* Diary Button */}
                            <button
                                onClick={handleOpenDiery}
                                className="px-2 py-1 text-xs border border-gray-300 rounded-md bg-white hover:bg-gray-50 flex items-center gap-1 w-full sm:w-auto justify-center"
                                title="View My Note"
                            >
                                <DocumentTextIcon className="h-3.5 w-3.5" style={{ color: themeColor }} />
                                <span>Note</span>
                            </button>

                            {/* Export - Show only if user has can_export permission in DB */}
                            {userCanExport && (
                                <button
                                    onClick={exportToXLSX}
                                    className="px-2 py-1 text-xs border border-gray-300 rounded-md bg-white hover:bg-gray-50 flex items-center gap-1 w-full sm:w-auto justify-center"
                                >
                                    <CiExport className="h-3.5 w-3.5" style={{ color: themeColor }} />
                                    <span>Export</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Row 2 : Flag + Campaign (Left = drive filter, Right = flag filter fixed) */}
                    <div className="bg-white rounded-xl shadow-sm px-3 py-1 mb-2">
                        <div className="flex items-stretch gap-2">
                            {/* ===== LEFT: Customers/Assets 2-row column + campaign chips wrapping ===== */}
                            <div className="flex items-stretch gap-2 flex-1 min-w-0">
                                {/* Fixed 2-row column: Customers on top, Assets below */}
                                <div className="flex flex-col gap-1 justify-center flex-shrink-0">
                                    <button
                                        onClick={handleAllCampaigns}
                                        className={`px-2 py-0.5 rounded-md text-sm font-bold whitespace-nowrap ${selectedCampaigns.length === 0
                                            ? 'bg-[#2f3192] text-white'
                                            : 'bg-transparent text-black hover:bg-gray-50'
                                            }`}
                                    >
                                        Customers - {customers.filter(c => {
                                            if (!isAdmin && userBranch && c.branch_id && userBranch !== 'HO') {
                                                return String(c.branch_id) === String(userBranch);
                                            }
                                            return true;
                                        }).length}
                                    </button>
                                    <button
                                        onClick={handleAllCampaigns}
                                        className={`px-2 py-0.5 rounded-md text-sm font-bold whitespace-nowrap ${selectedCampaigns.length === 0
                                            ? 'bg-[#2f3192] text-white'
                                            : 'bg-transparent text-black hover:bg-gray-50'
                                            }`}
                                    >
                                        Assets - {
                                            activeCampaigns.reduce((sum, campaign) => {
                                                return sum + customers.filter(c => {
                                                    if (!isAdmin && userBranch && c.branch_id && userBranch !== 'HO') {
                                                        if (String(c.branch_id) !== String(userBranch)) return false;
                                                    }
                                                    return c.campaigns?.includes(campaign);
                                                }).length;
                                            }, 0)
                                        }
                                    </button>
                                </div>

                                {/* Vertical divider */}
                                <div className="w-px bg-gray-200 flex-shrink-0" />

                                {/* Campaign chips — wrap row by row top to bottom, scrollable, with ↑↓ arrow */}
                                <div className="flex items-center gap-1 flex-1 min-w-0">
                                    <div
                                        id="campaign-chips-scroll"
                                        className="flex flex-wrap gap-1.5 flex-1 min-w-0 overflow-y-auto"
                                        style={{ maxHeight: '44px', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                                    >
                                        {activeCampaigns.map((campaign, idx) => {
                                            const campaignCount = customers.filter(c => {
                                                if (!isAdmin && userBranch && c.branch_id && userBranch !== 'HO') {
                                                    if (String(c.branch_id) !== String(userBranch)) return false;
                                                }
                                                return c.campaigns?.includes(campaign);
                                            }).length;
                                            const color = campaignColors[campaign] || '#406093';
                                            return (
                                                <button
                                                    key={idx}
                                                    onClick={() => handleCampaignToggle(campaign)}
                                                    title={campaign}
                                                    className={`px-2 py-0.5 rounded-lg text-sm font-bold text-left break-words leading-tight max-w-full ${selectedCampaigns.includes(campaign)
                                                        ? 'text-white'
                                                        : 'text-gray-700 hover:bg-gray-50'
                                                        }`}
                                                    style={selectedCampaigns.includes(campaign) ? { backgroundColor: color } : {}}
                                                >
                                                    {campaign} - {campaignCount}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Single ↑↓ scroll button pair */}
                                    <div className="flex flex-col gap-0.5 flex-shrink-0">
                                        <button
                                            onClick={() => {
                                                const el = document.getElementById('campaign-chips-scroll');
                                                if (el) el.scrollBy({ top: -40, behavior: 'smooth' });
                                            }}
                                            className="p-0.5 rounded hover:bg-gray-100 text-gray-400"
                                            title="Scroll up"
                                        >
                                            <ChevronUpIcon className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            onClick={() => {
                                                const el = document.getElementById('campaign-chips-scroll');
                                                if (el) el.scrollBy({ top: 40, behavior: 'smooth' });
                                            }}
                                            className="p-0.5 rounded hover:bg-gray-100 text-gray-400"
                                            title="Scroll down"
                                        >
                                            <ChevronDownIcon className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* ===== RIGHT: Flag filter — fixed, never moves ===== */}
                            <div className="border-l border-gray-200 pl-3 flex flex-col gap-0 justify-center flex-shrink-0">

                                {/* ---- Top section: All (spans 2 rows) + C1–C7 ---- */}
                                <div className="grid gap-x-0.5 gap-y-0" style={{ gridTemplateColumns: 'repeat(5, auto)' }}>
                                    {/* All button — spans & centers across the first two rows only (left side) */}
                                    <button
                                        onClick={() => setSelectedFlag("all")}
                                        title="Show all customers regardless of follow-up flag"
                                        className={`mr-1 self-center flex items-center justify-center px-2.5 py-0.5 text-sm rounded-md whitespace-nowrap font-bold transition-colors ${selectedFlag === "all"
                                            ? "bg-[#2f3192] text-white shadow-sm"
                                            : "text-black"
                                            }`}
                                        style={{ gridColumn: 1, gridRow: '1 / span 2' }}
                                    >
                                        All - {
                                            ["C1", "C2", "C3", "C4", "C5", "C6", "C7"]
                                                .reduce((sum, key) => sum + (flagCounts[key] || 0), 0)
                                        }
                                    </button>

                                    {/* Row 1 — C1, C2, C3, C4 */}
                                    {["C1", "C2", "C3", "C4"].map((key, i) => {
                                        const titles = {
                                            C1: 'Follow-up required within 15 days',
                                            C2: 'Follow-up required within 30 days',
                                            C3: 'Follow-up required within 45 days',
                                            C4: 'Follow-up required within 60 days',
                                        };
                                        return (
                                            <button
                                                key={key}
                                                onClick={() => setSelectedFlag(key)}
                                                title={titles[key]}
                                                style={{ gridColumn: i + 2, gridRow: 1 }}
                                                className={`px-2 py-0.5 text-[12px] whitespace-nowrap font-semibold rounded-md transition-colors text-center ${selectedFlag === key
                                                    ? "bg-[#2f3192] text-white shadow-sm"
                                                    : "text-black hover:bg-gray-50"
                                                    }`}
                                            >
                                                {key} · {flagCounts[key] || 0}
                                            </button>
                                        );
                                    })}

                                    {/* Row 2 — C5, C6, C7 */}
                                    {["C5", "C6", "C7"].map((key, i) => {
                                        const titles = {
                                            C5: 'Follow-up required within 75 days',
                                            C6: 'Follow-up required within 90 days',
                                            C7: 'Follow-up required after 90+ days',
                                        };
                                        return (
                                            <button
                                                key={key}
                                                onClick={() => setSelectedFlag(key)}
                                                title={titles[key]}
                                                style={{ gridColumn: i + 2, gridRow: 2 }}
                                                className={`px-2 py-0.5 text-[12px] whitespace-nowrap font-semibold rounded-md transition-colors text-center ${selectedFlag === key
                                                    ? "bg-[#2f3192] text-white shadow-sm"
                                                    : "text-black hover:bg-gray-50"
                                                    }`}
                                            >
                                                {key} · {flagCounts[key] || 0}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* ---- Bottom section: Status filter (independent of the flag filter above) ---- */}
                                <div className="flex items-center gap-0.5 pb-1.5">
                                    {/* All for statuses — resets ONLY the status filter */}
                                    <button
                                        onClick={() => setSelectedStatus("all")}
                                        title="Show all records regardless of status"
                                        className={`mr-1 flex items-center justify-center px-2.5 py-0.5 text-sm rounded-md whitespace-nowrap font-bold transition-colors ${selectedStatus === "all"
                                            ? "bg-[#2f3192] text-white shadow-sm"
                                            : "text-black"
                                            }`}
                                    >
                                        All - {notConnectedCount + rejectedCount + wipCount + rescheduledCount + completedCountFromAPI}                                    </button>

                                    {/* Divider sits ONLY above these status buttons, not over the All */}
                                    <div className="flex items-center gap-0.5 border-t border-gray-300 pt-0.5">
                                        <button
                                            onClick={() => setSelectedStatus('NC')}
                                            title="Not connected — drives with 'Not Connected' status (respects drive & branch filters)"
                                            className={`px-2 py-0.5 text-[12px] whitespace-nowrap font-semibold rounded-md transition-colors text-center ${selectedStatus === 'NC'
                                                ? "bg-[#2f3192] text-white shadow-sm"
                                                : "text-black hover:bg-gray-50"
                                                }`}
                                        >
                                            NC · {notConnectedCount}
                                        </button>

                                        <button
                                            onClick={() => setSelectedStatus('R')}
                                            title="Rejected — show rejected records (respects drive & branch filters)"
                                            style={selectedStatus === 'R'
                                                ? { backgroundColor: '#e34019' }
                                                : { color: '#e34019' }}
                                            className={`px-2 py-0.5 text-[12px] whitespace-nowrap font-semibold rounded-md transition-colors text-center ${selectedStatus === 'R'
                                                ? "text-white shadow-sm"
                                                : "hover:bg-orange-50"
                                                }`}
                                        >
                                            R · {rejectedCount}
                                        </button>

                                        <span
                                            className="px-2 py-0.5 text-[12px] whitespace-nowrap font-semibold rounded-md text-center text-green-600 cursor-default flex items-center justify-center"
                                            title={
                                                (currentUser?.role === 'master_admin' || currentUser?.role === 'it_admin')
                                                    ? 'Overall company completed (from Dashboard)'
                                                    : 'Your completed count (from My Performance)'
                                            }
                                        >
                                            C · {completedCountFromAPI}
                                        </span>

                                        <button
                                            onClick={() => setSelectedStatus('WIP')}
                                            title="Work in Progress — drives with 'WIP' status (respects drive & branch filters)"
                                            className={`px-2 py-0.5 text-[12px] whitespace-nowrap font-semibold rounded-md transition-colors text-center ${selectedStatus === 'WIP'
                                                ? "bg-[#2f3192] text-white shadow-sm"
                                                : "text-black hover:bg-gray-50"
                                                }`}
                                        >
                                            WIP · {wipCount}
                                        </button>

                                        <button
                                            onClick={() => setSelectedStatus('FR')}
                                            title="Follow-up Reschedule — drives with 'Rescheduled' status (respects drive & branch filters)"
                                            className={`px-2 py-0.5 text-[12px] whitespace-nowrap font-semibold rounded-md transition-colors text-center ${selectedStatus === 'FR'
                                                ? "bg-[#2f3192] text-white shadow-sm"
                                                : "text-black hover:bg-gray-50"
                                                }`}
                                        >
                                            FR · {rescheduledCount}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Customers Table with Lazy Loading */}
                    <div className="bg-white rounded-xl shadow-lg overflow-hidden mt-0 pt-0 mb-4">
                        <div
                            className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 overflow-x-auto"
                            style={{
                                scrollbarWidth: 'thin',
                                msOverflowStyle: 'auto',
                                WebkitOverflowScrolling: 'touch'
                            }}
                            ref={(el) => {
                                const tableContainer = document.getElementById('table-container');
                                if (tableContainer && el) {
                                    // Function to sync scroll positions
                                    const handleTableScroll = () => {
                                        if (el.scrollLeft !== tableContainer.scrollLeft) {
                                            el.scrollLeft = tableContainer.scrollLeft;
                                        }
                                    };

                                    // Function to update top scrollbar width to match table's scroll width
                                    const updateTopScrollbarWidth = () => {
                                        const scrollWidth = tableContainer.scrollWidth;
                                        const innerDiv = el.querySelector('.top-scroll-inner');
                                        if (innerDiv) {
                                            innerDiv.style.width = `${scrollWidth}px`;
                                        }
                                    };

                                    tableContainer.addEventListener('scroll', handleTableScroll);

                                    // Set initial width and sync
                                    setTimeout(() => {
                                        updateTopScrollbarWidth();
                                        el.scrollLeft = tableContainer.scrollLeft;
                                    }, 100);

                                    // Update width when table content changes
                                    const observer = new MutationObserver(updateTopScrollbarWidth);
                                    observer.observe(tableContainer, { childList: true, subtree: true, attributes: true });

                                    // Also update on window resize
                                    window.addEventListener('resize', updateTopScrollbarWidth);

                                    return () => {
                                        tableContainer.removeEventListener('scroll', handleTableScroll);
                                        observer.disconnect();
                                        window.removeEventListener('resize', updateTopScrollbarWidth);
                                    };
                                }
                            }}
                            onScroll={(e) => {
                                const tableContainer = document.getElementById('table-container');
                                if (tableContainer && tableContainer.scrollLeft !== e.currentTarget.scrollLeft) {
                                    tableContainer.scrollLeft = e.currentTarget.scrollLeft;
                                }
                            }}
                        >
                            <div className="top-scroll-inner" style={{ width: '100%', height: '1px' }} />
                        </div>

                        <div
                            className="overflow-auto max-h-[600px] custom-scrollbar"
                            id="table-container"
                            ref={tableContainerRef}
                            style={{
                                overflowX: 'auto',
                                overflowY: 'auto',
                                cursor: 'grab',
                                userSelect: 'none'
                            }}
                            onMouseDown={(e) => {
                                if (e.target.tagName === 'TD' || e.target.tagName === 'TR' || e.target.tagName === 'TABLE') {
                                    const container = e.currentTarget;
                                    const startX = e.pageX - container.offsetLeft;
                                    const startY = e.pageY - container.offsetTop;
                                    const scrollLeft = container.scrollLeft;
                                    const scrollTop = container.scrollTop;

                                    const handleMouseMove = (e) => {
                                        e.preventDefault();
                                        const x = e.pageX - container.offsetLeft;
                                        const y = e.pageY - container.offsetTop;
                                        const walkX = (x - startX) * 2;
                                        const walkY = (y - startY) * 2;
                                        container.scrollLeft = scrollLeft - walkX;
                                        container.scrollTop = scrollTop - walkY;
                                    };

                                    const handleMouseUp = () => {
                                        document.removeEventListener('mousemove', handleMouseMove);
                                        document.removeEventListener('mouseup', handleMouseUp);
                                        container.style.cursor = 'grab';
                                    };

                                    document.addEventListener('mousemove', handleMouseMove);
                                    document.addEventListener('mouseup', handleMouseUp);
                                    container.style.cursor = 'grabbing';
                                }
                            }}
                        >
                            <table className="w-full border-collapse border border-gray-200" style={{ minWidth: `${(activeCampaigns.length + 13) * 105}px` }}>
                                <thead className="bg-gray-50 sticky top-0 z-10">
                                    <DndContext collisionDetection={closestCenter} onDragEnd={handleColumnDragEnd}>
                                        <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                                            <tr className="border-b border-gray-200">
                                                {columnOrder.map(colId => {
                                                    if (colId === 'sr_no') {
                                                        return (
                                                            <SortableTableHeader
                                                                key={colId}
                                                                id={colId}
                                                                className="px-1 py-1 text-center text-[11px] font-bold text-black uppercase whitespace-nowrap border-r border-gray-200 w-[30px]"
                                                            >
                                                                <div className="flex items-center justify-center">
                                                                    Sr. No.
                                                                </div>
                                                            </SortableTableHeader>
                                                        );
                                                    }
                                                    if (colId === 'instance_id') {
                                                        return (
                                                            <SortableTableHeader
                                                                key={colId}
                                                                id={colId}
                                                                onClick={() => handleSort('instance_id')}
                                                                className="px-1 py-1 text-center text-[11px] font-bold text-black uppercase whitespace-nowrap cursor-pointer hover:bg-gray-100 border-r border-gray-200 w-[70px]"
                                                                sortIcon={getSortIcon('instance_id')}
                                                            >
                                                                Instance ID
                                                            </SortableTableHeader>
                                                        );
                                                    }
                                                    if (colId === 'customer_name') {
                                                        return (
                                                            <SortableTableHeader
                                                                key={colId}
                                                                id={colId}
                                                                onClick={() => handleSort('customer_name')}
                                                                className="px-2 py-1 text-center text-[11px] font-bold text-black uppercase whitespace-nowrap cursor-pointer hover:bg-gray-100 border-r border-gray-200 w-[100px]"
                                                                sortIcon={getSortIcon('customer_name')}
                                                            >
                                                                Customer Name
                                                            </SortableTableHeader>
                                                        );
                                                    }
                                                    if (colId === 'contact') {
                                                        return (
                                                            <SortableTableHeader
                                                                key={colId}
                                                                id={colId}
                                                                className="px-1 py-1 text-center text-[11px] font-bold text-black uppercase whitespace-nowrap border-r border-gray-200 w-[70px]"
                                                            >
                                                                Contact
                                                            </SortableTableHeader>
                                                        );
                                                    }
                                                    if (colId === 'email') {
                                                        return (
                                                            <SortableTableHeader
                                                                key={colId}
                                                                id={colId}
                                                                className="px-2 py-1 text-center text-[11px] font-bold text-black uppercase whitespace-nowrap border-r border-gray-200 w-[120px]"
                                                            >
                                                                Email
                                                            </SortableTableHeader>
                                                        );
                                                    }
                                                    if (colId === 'warranty_expiry') {
                                                        const hasWarrantyFilter = warrantyDateRange.from || warrantyDateRange.to;
                                                        return (
                                                            <SortableTableHeader
                                                                key={colId}
                                                                id={colId}
                                                                onClick={() => handleSort('warranty_expiry')}
                                                                className="px-1 py-1 text-center text-[11px] font-bold text-black uppercase whitespace-nowrap cursor-pointer hover:bg-gray-100 border-r border-gray-200 w-[70px]"
                                                                sortIcon={getSortIcon('warranty_expiry')}
                                                            >
                                                                <div className="relative flex items-center gap-1" ref={warrantyFilterRef}>
                                                                    <div className="flex flex-col items-center justify-center leading-tight">
                                                                        <span>Warranty</span>
                                                                        <span>Expiry</span>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (!showWarrantyFilter) {
                                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                                setWarrantyFilterPosition({ top: rect.bottom + 4, left: rect.left });
                                                                            }
                                                                            setShowWarrantyFilter(prev => !prev);
                                                                        }}
                                                                        className={`p-0.5 rounded hover:bg-gray-200 transition-colors ${hasWarrantyFilter ? 'text-blue-600' : 'text-gray-400'}`}
                                                                        title="Filter warranty expiry date"
                                                                    >
                                                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                                            <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L13 10.414V17a1 1 0 01-.553.894l-4 2A1 1 0 017 19v-8.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
                                                                        </svg>
                                                                    </button>

                                                                    {showWarrantyFilter && warrantyFilterPosition && (
                                                                        <div
                                                                            className="bg-white border border-gray-300 rounded-lg shadow-2xl min-w-[220px]"
                                                                            style={{
                                                                                position: 'fixed',
                                                                                top: `${warrantyFilterPosition.top}px`,
                                                                                left: `${warrantyFilterPosition.left}px`,
                                                                                fontSize: '11px',
                                                                                zIndex: 999999
                                                                            }}
                                                                            onClick={e => e.stopPropagation()}
                                                                            onMouseDown={e => e.stopPropagation()}
                                                                        >
                                                                            <div className="px-2 py-1.5 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-lg">
                                                                                <span className="font-bold text-black text-[11px] normal-case">Filter Warranty Expiry</span>
                                                                                {hasWarrantyFilter && (
                                                                                    <button
                                                                                        onClick={() => setWarrantyDateRange({ from: '', to: '' })}
                                                                                        className="text-[10px] text-red-500 hover:text-red-700 font-medium normal-case"
                                                                                    >
                                                                                        Clear
                                                                                    </button>
                                                                                )}
                                                                            </div>

                                                                            <div className="p-2 space-y-2 normal-case">
                                                                                <div>
                                                                                    <label className="block text-[10px] font-semibold text-black mb-0.5">From</label>
                                                                                    <input
                                                                                        type="date"
                                                                                        value={warrantyDateRange.from}
                                                                                        max={warrantyDateRange.to || undefined}
                                                                                        onChange={(e) => setWarrantyDateRange(prev => ({ ...prev, from: e.target.value }))}
                                                                                        className="w-full border border-gray-300 rounded px-2 py-1 text-[11px] text-black"
                                                                                    />
                                                                                </div>
                                                                                <div>
                                                                                    <label className="block text-[10px] font-semibold text-black mb-0.5">To</label>
                                                                                    <input
                                                                                        type="date"
                                                                                        value={warrantyDateRange.to}
                                                                                        min={warrantyDateRange.from || undefined}
                                                                                        onChange={(e) => setWarrantyDateRange(prev => ({ ...prev, to: e.target.value }))}
                                                                                        className="w-full border border-gray-300 rounded px-2 py-1 text-[11px] text-black"
                                                                                    />
                                                                                </div>
                                                                            </div>

                                                                            <div className="px-2 py-1.5 border-t border-gray-200 bg-gray-50 rounded-b-lg">
                                                                                <button
                                                                                    onClick={() => setShowWarrantyFilter(false)}
                                                                                    className="w-full text-[11px] text-white rounded px-2 py-1 font-medium hover:opacity-90 normal-case"
                                                                                    style={{ backgroundColor: '#2f3192' }}
                                                                                >
                                                                                    Apply
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </SortableTableHeader>
                                                        );
                                                    }
                                                    if (colId === 'agreement_end_date') {
                                                        const hasAgreementFilter = agreementDateRange.from || agreementDateRange.to;
                                                        return (
                                                            <SortableTableHeader
                                                                key={colId}
                                                                id={colId}
                                                                onClick={() => handleSort('agreement_end_date')}
                                                                className="px-1 py-1 text-center text-[11px] font-bold text-black uppercase whitespace-nowrap cursor-pointer hover:bg-gray-100 border-r border-gray-200 w-[75px]"
                                                                sortIcon={getSortIcon('agreement_end_date')}
                                                            >
                                                                <div className="relative flex items-center gap-1" ref={agreementFilterRef}>
                                                                    <div className="flex flex-col items-center justify-center leading-tight">
                                                                        <span>Agreement</span>
                                                                        <span>End Date</span>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (!showAgreementFilter) {
                                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                                setAgreementFilterPosition({ top: rect.bottom + 4, left: rect.left });
                                                                            }
                                                                            setShowAgreementFilter(prev => !prev);
                                                                        }}
                                                                        className={`p-0.5 rounded hover:bg-gray-200 transition-colors ${hasAgreementFilter ? 'text-blue-600' : 'text-gray-400'}`}
                                                                        title="Filter agreement end date"
                                                                    >
                                                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                                            <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L13 10.414V17a1 1 0 01-.553.894l-4 2A1 1 0 017 19v-8.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
                                                                        </svg>
                                                                    </button>

                                                                    {showAgreementFilter && agreementFilterPosition && (
                                                                        <div
                                                                            className="bg-white border border-gray-300 rounded-lg shadow-2xl min-w-[220px]"
                                                                            style={{
                                                                                position: 'fixed',
                                                                                top: `${agreementFilterPosition.top}px`,
                                                                                left: `${agreementFilterPosition.left}px`,
                                                                                fontSize: '11px',
                                                                                zIndex: 999999
                                                                            }}
                                                                            onClick={e => e.stopPropagation()}
                                                                            onMouseDown={e => e.stopPropagation()}
                                                                        >
                                                                            <div className="px-2 py-1.5 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-lg">
                                                                                <span className="font-bold text-black text-[11px] normal-case">Filter Agreement End</span>
                                                                                {hasAgreementFilter && (
                                                                                    <button
                                                                                        onClick={() => setAgreementDateRange({ from: '', to: '' })}
                                                                                        className="text-[10px] text-red-500 hover:text-red-700 font-medium normal-case"
                                                                                    >
                                                                                        Clear
                                                                                    </button>
                                                                                )}
                                                                            </div>

                                                                            <div className="p-2 space-y-2 normal-case">
                                                                                <div>
                                                                                    <label className="block text-[10px] font-semibold text-black mb-0.5">From</label>
                                                                                    <input
                                                                                        type="date"
                                                                                        value={agreementDateRange.from}
                                                                                        max={agreementDateRange.to || undefined}
                                                                                        onChange={(e) => setAgreementDateRange(prev => ({ ...prev, from: e.target.value }))}
                                                                                        className="w-full border border-gray-300 rounded px-2 py-1 text-[11px] text-black"
                                                                                    />
                                                                                </div>
                                                                                <div>
                                                                                    <label className="block text-[10px] font-semibold text-black mb-0.5">To</label>
                                                                                    <input
                                                                                        type="date"
                                                                                        value={agreementDateRange.to}
                                                                                        min={agreementDateRange.from || undefined}
                                                                                        onChange={(e) => setAgreementDateRange(prev => ({ ...prev, to: e.target.value }))}
                                                                                        className="w-full border border-gray-300 rounded px-2 py-1 text-[11px] text-black"
                                                                                    />
                                                                                </div>
                                                                            </div>

                                                                            <div className="px-2 py-1.5 border-t border-gray-200 bg-gray-50 rounded-b-lg">
                                                                                <button
                                                                                    onClick={() => setShowAgreementFilter(false)}
                                                                                    className="w-full text-[11px] text-white rounded px-2 py-1 font-medium hover:opacity-90 normal-case"
                                                                                    style={{ backgroundColor: '#2f3192' }}
                                                                                >
                                                                                    Apply
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </SortableTableHeader>
                                                        );
                                                    }
                                                    if (colId === 'branch_id') {
                                                        const branchMap = {
                                                            'HO': 'Pune Office',
                                                            '420435_1': 'Ch.Sambhaji Nagar',
                                                            '420435_2': 'Ahilyanagar',
                                                            '420435_3': 'Beed',
                                                            '420435_4': 'Nanded',
                                                            '420435_5': 'Babhaleshwar',
                                                            '420435_6': 'Latur',
                                                            '420435_7': 'Parbhani',
                                                            '420435_8': 'Hubli',
                                                            '420435_9': 'Belagavi',
                                                            '420435_10': 'Hospet',
                                                            '420435_11': 'Ballari',
                                                            '420435_12': 'Bagalkot',
                                                            '420435_13': 'Gulbarga',
                                                            '420435_14': 'Bijapur'
                                                        };
                                                        const uniqueBranches = [...new Set(customers.map(c => String(c.branch_id || '')))].sort();
                                                        return (
                                                            <SortableTableHeader
                                                                key={colId}
                                                                id={colId}
                                                                onClick={() => handleSort('branch_id')}
                                                                className="px-1 py-1 text-center text-[11px] font-bold text-black uppercase whitespace-nowrap cursor-pointer hover:bg-gray-100 border-r border-gray-200 w-[70px]"
                                                                sortIcon={getSortIcon('branch_id')}
                                                            >
                                                                <div className="relative flex items-center gap-1" ref={branchFilterRef}>
                                                                    <span>Branch ID</span>
                                                                    {!(currentUser?.role === 'employee' && userBranch !== 'HO') && (
                                                                        <>
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    if (!showBranchFilter) {
                                                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                                                        setBranchFilterPosition({ top: rect.bottom + 4, left: rect.left });
                                                                                    }
                                                                                    setShowBranchFilter(prev => !prev);
                                                                                }}
                                                                                className={`p-0.5 rounded hover:bg-gray-200 transition-colors ${selectedBranches.length > 0 ? 'text-blue-600' : 'text-gray-400'}`}
                                                                                title="Filter branches"
                                                                            >
                                                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                                                    <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L13 10.414V17a1 1 0 01-.553.894l-4 2A1 1 0 017 19v-8.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
                                                                                </svg>
                                                                            </button>

                                                                            {showBranchFilter && branchFilterPosition && (
                                                                                <div
                                                                                    className="bg-white border border-gray-300 rounded-lg shadow-2xl min-w-[220px]"
                                                                                    style={{
                                                                                        position: 'fixed',
                                                                                        top: `${branchFilterPosition.top}px`,
                                                                                        left: `${branchFilterPosition.left}px`,
                                                                                        fontSize: '11px',
                                                                                        zIndex: 999999
                                                                                    }}
                                                                                    onClick={e => e.stopPropagation()}
                                                                                    onMouseDown={e => e.stopPropagation()}
                                                                                >
                                                                                    {/* Header */}
                                                                                    <div className="px-2 py-1.5 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-lg">
                                                                                        <span className="font-bold text-black text-[11px]">Filter Branch</span>
                                                                                        {selectedBranches.length > 0 && (
                                                                                            <button
                                                                                                onClick={() => setSelectedBranches([])}
                                                                                                className="text-[10px] text-red-500 hover:text-red-700 font-medium"
                                                                                            >
                                                                                                Clear ({selectedBranches.length})
                                                                                            </button>
                                                                                        )}
                                                                                    </div>

                                                                                    {/* Select All */}
                                                                                    <div className="px-2 py-1 border-b border-gray-200 hover:bg-gray-50">
                                                                                        <label className="flex items-center gap-1.5 cursor-pointer">
                                                                                            <input
                                                                                                type="checkbox"
                                                                                                checked={selectedBranches.length === 0}
                                                                                                onChange={() => setSelectedBranches([])}
                                                                                                className="h-3 w-3 rounded border-gray-300"
                                                                                                style={{ accentColor: '#2f3192' }}
                                                                                            />
                                                                                            <span className="text-black font-semibold text-[11px]">(Select All)</span>
                                                                                        </label>
                                                                                    </div>

                                                                                    {/* Branch options with name */}
                                                                                    <div className="max-h-[220px] overflow-y-auto">
                                                                                        {uniqueBranches.map(branch => (
                                                                                            <div key={branch} className="px-2 py-1 hover:bg-blue-50 border-b border-gray-50">
                                                                                                <label className="flex items-center gap-1.5 cursor-pointer">
                                                                                                    <input
                                                                                                        type="checkbox"
                                                                                                        checked={selectedBranches.includes(branch)}
                                                                                                        onChange={() => {
                                                                                                            setSelectedBranches(prev =>
                                                                                                                prev.includes(branch)
                                                                                                                    ? prev.filter(b => b !== branch)
                                                                                                                    : [...prev, branch]
                                                                                                            );
                                                                                                        }}
                                                                                                        className="h-3 w-3 rounded border-gray-300 flex-shrink-0"
                                                                                                        style={{ accentColor: '#2f3192' }}
                                                                                                    />
                                                                                                    <div className="flex flex-col min-w-0">
                                                                                                        <span className="text-black text-[11px] font-medium leading-tight text-left">
                                                                                                            {branch === '' ? '(Blank)' : branch}
                                                                                                        </span>
                                                                                                        {branch !== '' && branchMap[branch] && (
                                                                                                            <span className="text-gray-500 text-[10px] leading-tight truncate">
                                                                                                                {branchMap[branch]}
                                                                                                            </span>
                                                                                                        )}
                                                                                                    </div>
                                                                                                </label>
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>

                                                                                    {/* Footer */}
                                                                                    <div className="px-2 py-1.5 border-t border-gray-200 bg-gray-50 rounded-b-lg">
                                                                                        <button
                                                                                            onClick={() => setShowBranchFilter(false)}
                                                                                            className="w-full text-[11px] text-white rounded px-2 py-1 font-medium hover:opacity-90"
                                                                                            style={{ backgroundColor: '#2f3192' }}
                                                                                        >
                                                                                            Apply
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </SortableTableHeader>
                                                        );
                                                    }
                                                    if (colId.startsWith('campaign_')) {
                                                        const campaignName = colId.replace('campaign_', '');

                                                        const activeFilters = campaignColumnFilters[campaignName] || [];
                                                        const hasActiveFilter = activeFilters.length > 0;
                                                        const isThisFilterOpen = openCampaignFilter === campaignName;

                                                        const statusOptions = [
                                                            { value: 'transferred', label: 'T - Transferred' },
                                                            { value: 'wip', label: 'W - Work in Progress' },
                                                            { value: 'not_connected', label: 'NC - Not Connected' },
                                                            { value: 'rejected', label: 'R - Rejected' },
                                                            { value: 'rescheduled', label: 'FR - Rescheduled' }
                                                        ];

                                                        return (
                                                            <SortableTableHeader
                                                                key={colId}
                                                                id={colId}
                                                                onClick={() => handleSort(colId)}
                                                                className="px-1 py-1 text-center text-[11px] font-bold text-black uppercase border-r border-gray-200 w-[80px]"
                                                                sortIcon={getSortIcon(colId)}
                                                            >
                                                                <div
                                                                    className="flex items-center justify-center gap-1 relative"
                                                                    ref={isThisFilterOpen ? campaignFilterRef : null}
                                                                >
                                                                    <div className="flex flex-col items-center leading-[12px]" title={campaignName}>
                                                                        <span className="break-words text-center">{campaignName}</span>
                                                                    </div>

                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (!isThisFilterOpen) {
                                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                                setCampaignFilterPosition({ top: rect.bottom + 4, left: rect.left });
                                                                            }
                                                                            setOpenCampaignFilter(isThisFilterOpen ? null : campaignName);
                                                                        }}
                                                                        className={`p-0.5 rounded hover:bg-gray-200 transition-colors ${hasActiveFilter ? 'text-blue-600' : 'text-gray-400'}`}
                                                                        title="Filter drive status"
                                                                    >
                                                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                                            <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L13 10.414V17a1 1 0 01-.553.894l-4 2A1 1 0 017 19v-8.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
                                                                        </svg>
                                                                    </button>

                                                                    {isThisFilterOpen && campaignFilterPosition && (
                                                                        <div
                                                                            className="bg-white border border-gray-300 rounded-lg shadow-2xl min-w-[200px]"
                                                                            style={{
                                                                                position: 'fixed',
                                                                                top: `${campaignFilterPosition.top}px`,
                                                                                left: `${campaignFilterPosition.left}px`,
                                                                                fontSize: '11px',
                                                                                zIndex: 999999
                                                                            }}
                                                                            onClick={e => e.stopPropagation()}
                                                                            onMouseDown={e => e.stopPropagation()}
                                                                        >
                                                                            {/* Header */}
                                                                            <div className="px-2 py-1.5 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-lg">
                                                                                <span className="font-bold text-black text-[11px] normal-case">
                                                                                    {campaignName}
                                                                                </span>
                                                                                {hasActiveFilter && (
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            setCampaignColumnFilters(prev => {
                                                                                                const newState = { ...prev };
                                                                                                delete newState[campaignName];
                                                                                                return newState;
                                                                                            });
                                                                                        }}
                                                                                        className="text-[10px] text-red-500 hover:text-red-700 font-medium normal-case"
                                                                                    >
                                                                                        Clear ({activeFilters.length})
                                                                                    </button>
                                                                                )}
                                                                            </div>

                                                                            {/* Status checkboxes */}
                                                                            <div className="max-h-[260px] overflow-y-auto">
                                                                                {statusOptions.map(option => (
                                                                                    <div key={option.value} className="px-2 py-1 hover:bg-blue-50 border-b border-gray-50">
                                                                                        <label className="flex items-center gap-1.5 cursor-pointer normal-case">
                                                                                            <input
                                                                                                type="checkbox"
                                                                                                checked={activeFilters.includes(option.value)}
                                                                                                onChange={(e) => {
                                                                                                    e.stopPropagation();
                                                                                                    setCampaignColumnFilters(prev => {
                                                                                                        const current = prev[campaignName] || [];
                                                                                                        const newList = current.includes(option.value)
                                                                                                            ? current.filter(v => v !== option.value)
                                                                                                            : [...current, option.value];

                                                                                                        if (newList.length === 0) {
                                                                                                            const newState = { ...prev };
                                                                                                            delete newState[campaignName];
                                                                                                            return newState;
                                                                                                        }
                                                                                                        return { ...prev, [campaignName]: newList };
                                                                                                    });
                                                                                                }}
                                                                                                className="h-3 w-3 rounded border-gray-300 flex-shrink-0"
                                                                                                style={{ accentColor: '#2f3192' }}
                                                                                            />
                                                                                            <span className="text-black text-[11px] font-medium">{option.label}</span>
                                                                                        </label>
                                                                                    </div>
                                                                                ))}
                                                                            </div>

                                                                            {/* Footer */}
                                                                            <div className="px-2 py-1.5 border-t border-gray-200 bg-gray-50 rounded-b-lg flex gap-1.5">
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setCampaignColumnFilters(prev => {
                                                                                            const newState = { ...prev };
                                                                                            delete newState[campaignName];
                                                                                            return newState;
                                                                                        });
                                                                                    }}
                                                                                    disabled={!hasActiveFilter}
                                                                                    className={`flex-1 text-[11px] rounded px-2 py-1 font-medium normal-case border transition-colors ${hasActiveFilter
                                                                                        ? 'bg-white text-red-600 border-red-300 hover:bg-red-50'
                                                                                        : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                                                                        }`}
                                                                                >
                                                                                    Clear
                                                                                </button>
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setOpenCampaignFilter(null);
                                                                                    }}
                                                                                    className="flex-1 text-[11px] text-white rounded px-2 py-1 font-medium hover:opacity-90 normal-case"
                                                                                    style={{ backgroundColor: '#2f3192' }}
                                                                                >
                                                                                    Apply
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </SortableTableHeader>
                                                        );
                                                    }
                                                    if (colId === 'latest_flag') {
                                                        return (
                                                            <SortableTableHeader
                                                                key={colId}
                                                                id={colId}
                                                                onClick={() => handleSort('flags')}
                                                                className="px-1 py-1 text-center text-[11px] font-bold text-black uppercase whitespace-nowrap cursor-pointer hover:bg-gray-100 border-r border-gray-200 w-[55px]"
                                                                sortIcon={getSortIcon('flags')}
                                                            >
                                                                <div className="flex flex-col items-center justify-center leading-tight">
                                                                    <span>Latest</span>
                                                                    <span>Flag</span>
                                                                </div>
                                                            </SortableTableHeader>
                                                        );
                                                    }
                                                    if (colId === 'last_followup_date') {
                                                        return (
                                                            <SortableTableHeader
                                                                key={colId}
                                                                id={colId}
                                                                onClick={() => handleSort('last_followup_date')}
                                                                className="px-1 py-1 text-center text-[11px] font-bold text-black uppercase whitespace-nowrap cursor-pointer hover:bg-gray-100 border-r border-gray-200 w-[65px]"
                                                                sortIcon={getSortIcon('last_followup_date')}
                                                            >
                                                                <div className="flex flex-col items-center justify-center leading-tight">
                                                                    <span>Last</span>
                                                                    <span>Follow-up</span>
                                                                </div>
                                                            </SortableTableHeader>
                                                        );
                                                    }
                                                    if (colId === 'last_followup_user') {
                                                        return (
                                                            <SortableTableHeader
                                                                key={colId}
                                                                id={colId}
                                                                onClick={() => handleSort('last_followup_user')}
                                                                className="px-1 py-1 text-center text-[11px] font-bold text-black uppercase whitespace-nowrap cursor-pointer hover:bg-gray-100 border-r border-gray-200 w-[65px]"
                                                                sortIcon={getSortIcon('last_followup_user')}
                                                            >
                                                                <div className="flex flex-col items-center justify-center leading-tight">
                                                                    <span>Last Follow-up</span>
                                                                    <span>User</span>
                                                                </div>
                                                            </SortableTableHeader>
                                                        );
                                                    }
                                                    if (colId === 'next_followup_date') {
                                                        return (
                                                            <SortableTableHeader
                                                                key={colId}
                                                                id={colId}
                                                                onClick={() => handleSort('next_followup_date')}
                                                                className="px-1 py-1 text-center text-[11px] font-bold text-black uppercase whitespace-nowrap cursor-pointer hover:bg-gray-100 border-r border-gray-200 w-[65px]"
                                                                sortIcon={getSortIcon('next_followup_date')}
                                                            >
                                                                <div className="flex flex-col items-center justify-center leading-tight">
                                                                    <span>Next</span>
                                                                    <span>Follow-up</span>
                                                                </div>
                                                            </SortableTableHeader>
                                                        );
                                                    }
                                                    if (colId === 'remark') {
                                                        return (
                                                            <SortableTableHeader
                                                                key={colId}
                                                                id={colId}
                                                                onClick={() => handleSort('remark')}
                                                                className="px-1 py-1 text-center text-[11px] font-bold text-black uppercase whitespace-nowrap cursor-pointer hover:bg-gray-100 w-[120px]"
                                                            >
                                                                <div className="flex flex-col items-center justify-center leading-tight">
                                                                    <span>Last</span>
                                                                    <span>Remark</span>
                                                                </div>
                                                            </SortableTableHeader>
                                                        );
                                                    }
                                                    return null;
                                                })}
                                            </tr>
                                        </SortableContext>
                                    </DndContext>
                                </thead>
                                <tbody className="divide-y divide-gray-100 transition-opacity duration-200">
                                    {loading && displayedCustomers.length === 0 && (
                                        Array.from({ length: 10 }).map((_, i) => (
                                            <tr key={`skeleton-${i}`} className="animate-pulse">
                                                {columnOrder.map(colId => (
                                                    <td key={colId} className="px-1 py-2 border-r border-gray-200">
                                                        <div className="h-3 bg-gray-200 rounded mx-auto w-3/4"></div>
                                                    </td>
                                                ))}
                                            </tr>
                                        ))
                                    )}
                                    {displayedCustomers.map((customer, index) => {
                                        const isLastElement = index === displayedCustomers.length - 1;
                                        const serialNumber = index + 1;
                                        const isPastOrToday = isFollowupOverdue(customer.next_followup_date);

                                        return (
                                            <tr
                                                key={customer.customer_id}
                                                ref={isLastElement ? lastCustomerRef : null}
                                                onClick={() => handleViewCustomer(customer.customer_id)}
                                                className={`transition-all cursor-pointer ${isPastOrToday ? "bg-orange-200 hover:bg-orange-400" : "hover:bg-gray-50"}`}
                                            >
                                                {columnOrder.map(colId => {
                                                    if (colId === 'sr_no') {
                                                        return (
                                                            <td key={colId} className="px-1 py-1 text-center text-[12px] text-black whitespace-nowrap border-r border-gray-200 w-[30px]">
                                                                {serialNumber}
                                                            </td>
                                                        );
                                                    }
                                                    if (colId === 'instance_id') {
                                                        return (
                                                            <td key={colId} className="px-1 py-1 text-[12px] text-black whitespace-nowrap border-r border-gray-200 w-[70px] text-center">
                                                                <div className="truncate">
                                                                    {searchTerm && customer.instance_id?.toLowerCase().includes(searchTerm.toLowerCase()) ? (
                                                                        <span className="px-1 py-0.5 rounded" style={{ backgroundColor: '#ffdb62' }}>{customer.instance_id || "-"}</span>
                                                                    ) : (customer.instance_id || "-")}
                                                                </div>
                                                            </td>
                                                        );
                                                    }
                                                    if (colId === 'customer_name') {
                                                        const customerName = customer.customer_name || "-";
                                                        const isHighlighted = searchTerm && customer.customer_name?.toLowerCase().includes(searchTerm.toLowerCase());
                                                        const displayName = customerName.length > 20 ? customerName.substring(0, 20) + '...' : customerName;

                                                        return (
                                                            <td key={colId} className="px-2 py-1 text-[12px] text-black border-r border-gray-200 w-[100px] text-left">
                                                                <div className="truncate" title={customerName}>
                                                                    {isHighlighted ? (
                                                                        <span className="px-1 py-0.5 rounded inline-block max-w-full truncate" title={customerName} style={{ backgroundColor: '#ffdb62' }}>
                                                                            {displayName}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-block max-w-full truncate font-normal" title={customerName}>
                                                                            {displayName}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        );
                                                    }
                                                    if (colId === 'contact') {
                                                        return (
                                                            <td key={colId} className="px-1 py-1 text-[12px] text-black whitespace-nowrap border-r border-gray-200 w-[70px] text-center">
                                                                {searchTerm && customer.mobile?.includes(searchTerm) ? (
                                                                    <span className="px-1 py-0.5 rounded" style={{ backgroundColor: '#ffdb62' }}>{formatPhoneNumber(customer.mobile)}</span>
                                                                ) : (formatPhoneNumber(customer.mobile))}
                                                            </td>
                                                        );
                                                    }
                                                    if (colId === 'email') {
                                                        const email = customer.email || "-";
                                                        const isHighlighted = searchTerm && customer.email?.toLowerCase().includes(searchTerm.toLowerCase());
                                                        const displayEmail = email.length > 18 ? email.substring(0, 18) + '...' : email;

                                                        return (
                                                            <td key={colId} className="px-2 py-1 text-[12px] text-black border-r border-gray-200 w-[120px] text-left">
                                                                <div className="truncate" title={email}>
                                                                    {isHighlighted ? (
                                                                        <span className="px-1 py-0.5 rounded inline-block max-w-full truncate" title={email} style={{ backgroundColor: '#ffdb62' }}>
                                                                            {displayEmail}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-block max-w-full truncate" title={email}>
                                                                            {displayEmail}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        );
                                                    }
                                                    if (colId === 'warranty_expiry') {
                                                        return (
                                                            <td key={colId} className="px-1 py-1 text-[12px] text-black whitespace-nowrap border-r border-gray-200 w-[70px] text-center">
                                                                {formatDate(customer.warranty_expiry_date)}
                                                            </td>
                                                        );
                                                    }
                                                    if (colId === 'agreement_end_date') {
                                                        return (
                                                            <td key={colId} className="px-1 py-1 text-[12px] text-black whitespace-nowrap border-r border-gray-200 w-[75px] text-center">
                                                                {formatDate(customer.agreement_end_date)}
                                                            </td>
                                                        );
                                                    }
                                                    if (colId === 'branch_id') {
                                                        return (
                                                            <td key={colId} className="px-1 py-1 text-[12px] text-black whitespace-nowrap border-r border-gray-200 w-[70px] text-center">
                                                                {customer.branch_id || '-'}
                                                            </td>
                                                        );
                                                    }
                                                    if (colId.startsWith('campaign_')) {
                                                        const campaignName = colId.replace('campaign_', '');
                                                        const hasCheckmark = customer.campaign_checkmarks?.[campaignName];
                                                        const isTransferred = customer.campaign_transferred?.[campaignName];
                                                        const currentStatus = customer.campaign_status?.[campaignName];

                                                        let statusLetter = '';
                                                        let statusTitle = '';
                                                        if (currentStatus === 'wip') {
                                                            statusLetter = 'W';
                                                            statusTitle = 'Work in Progress';
                                                        } else if (currentStatus === 'completed') {
                                                            statusLetter = 'C';
                                                            statusTitle = 'Completed';
                                                        } else if (currentStatus === 'rejected') {
                                                            statusLetter = 'R';
                                                            statusTitle = 'Rejected';
                                                        } else if (currentStatus === 'rescheduled') {
                                                            statusLetter = 'FR';
                                                            statusTitle = 'Follow-up Reschedule';
                                                        } else if (currentStatus === 'not_connected') {
                                                            statusLetter = 'NC';
                                                            statusTitle = 'Not Connected';
                                                        }

                                                        return (
                                                            <td key={colId} className="px-1 py-1 text-center whitespace-nowrap border-r border-gray-200 w-[55px]">
                                                                <div className="flex gap-0.5 justify-center items-center">
                                                                    <span
                                                                        className="text-black text-[12px] font-medium w-4 text-center"
                                                                        title={hasCheckmark ? 'In Drive' : ''}
                                                                    >
                                                                        {hasCheckmark ? '✓' : ''}
                                                                    </span>
                                                                    <span
                                                                        className="text-black text-[12px] font-medium w-4 text-center"
                                                                        title={isTransferred ? 'Transferred' : ''}
                                                                    >
                                                                        {isTransferred ? 'T' : ''}
                                                                    </span>
                                                                    <span
                                                                        className="text-black text-[12px] font-medium w-4 text-center"
                                                                        title={statusTitle}
                                                                    >
                                                                        {statusLetter || ''}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                        );
                                                    }
                                                    if (colId === 'latest_flag') {
                                                        return (
                                                            <td key={colId} className="px-1 py-1 whitespace-nowrap border-r border-gray-200 w-[55px] text-center">
                                                                <div className="flex gap-0.5 justify-center flex-wrap text-[12px]">
                                                                    {customer.followup_flags?.C1 && (
                                                                        <span className="text-black font-medium" title="Follow-up within 15 days">C1</span>
                                                                    )}
                                                                    {customer.followup_flags?.C2 && (
                                                                        <span className="text-black font-medium" title="Follow-up within 30 days">C2</span>
                                                                    )}
                                                                    {customer.followup_flags?.C3 && (
                                                                        <span className="text-black font-medium" title="Follow-up within 45 days">C3</span>
                                                                    )}
                                                                    {customer.followup_flags?.C4 && (
                                                                        <span className="text-black font-medium" title="Follow-up within 60 days">C4</span>
                                                                    )}
                                                                    {customer.followup_flags?.C5 && (
                                                                        <span className="text-black font-medium" title="Follow-up within 75 days">C5</span>
                                                                    )}
                                                                    {customer.followup_flags?.C6 && (
                                                                        <span className="text-black font-medium" title="Follow-up within 90 days">C6</span>
                                                                    )}
                                                                    {customer.followup_flags?.C7 && (
                                                                        <span className="text-black font-medium" title="Follow-up after 90+ days">C7</span>
                                                                    )}
                                                                    {!customer.followup_flags?.C1 && !customer.followup_flags?.C2 && !customer.followup_flags?.C3 &&
                                                                        !customer.followup_flags?.C4 && !customer.followup_flags?.C5 && !customer.followup_flags?.C6 &&
                                                                        !customer.followup_flags?.C7 && "-"}
                                                                </div>
                                                            </td>
                                                        );
                                                    }
                                                    if (colId === 'last_followup_date') {
                                                        return (
                                                            <td key={colId} className="px-1 py-1 text-[12px] text-black whitespace-nowrap border-r border-gray-200 w-[65px] text-center">
                                                                {formatDate(customer.last_followup_date)}
                                                            </td>
                                                        );
                                                    }
                                                    if (colId === 'last_followup_user') {
                                                        return (
                                                            <td key={colId} className="px-1 py-1 text-[12px] text-black whitespace-nowrap border-r border-gray-200 w-[65px] text-left">
                                                                <div className="truncate" title={customer.last_followup_user || "-"}>
                                                                    {/* {customer.last_followup_user || "-"} */}
                                                                    {searchTerm && customer.last_followup_user
                                                                        ? highlightText(customer.last_followup_user, searchTerm)
                                                                        : (customer.last_followup_user || "-")}
                                                                </div>
                                                            </td>
                                                        );
                                                    }
                                                    if (colId === 'next_followup_date') {
                                                        return (
                                                            <td key={colId} className="px-1 py-1 text-[12px] text-black whitespace-nowrap border-r border-gray-200 w-[65px] text-center">
                                                                {formatDate(customer.next_followup_date)}
                                                            </td>
                                                        );
                                                    }
                                                    if (colId === 'remark') {
                                                        const remarkText = customer.last_followup_remark || '-';
                                                        return (
                                                            <td key={colId} className="px-2 py-1 text-[12px] text-black whitespace-nowrap w-[120px] text-left relative group">
                                                                <div className="truncate max-w-[110px]" title={remarkText !== '-' ? remarkText : ''}>
                                                                    {remarkText}
                                                                </div>
                                                                {/* Tooltip on hover for long remarks */}
                                                                {remarkText !== '-' && remarkText.length > 25 && (
                                                                    <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block z-50">
                                                                        <div className="bg-black text-white text-[11px] rounded-md px-2 py-1 whitespace-normal max-w-[250px] break-words shadow-lg">
                                                                            {remarkText}
                                                                            <div className="absolute left-2 top-full border-4 border-transparent border-t-black"></div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </td>
                                                        );
                                                    }
                                                    return null;
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            {/* Loading indicator for lazy loading */}
                            {loadingMore && (
                                <div className="py-4 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                        <ArrowPathIcon className="h-5 w-5 animate-spin" style={{ color: themeColor }} />
                                        <span className="text-sm text-gray-500">Loading more customers...</span>
                                    </div>
                                </div>
                            )}

                            {!hasMore && displayedCustomers.length > 0 && (
                                <div className="py-4 text-center text-xs text-gray-500">
                                    No more customers to load
                                </div>
                            )}
                        </div>

                        {/* Floating scroll to top / bottom buttons — bottom-right corner */}
                        <div className="fixed bottom-6 right-4 z-40 flex flex-col gap-1.5">
                            <button
                                onClick={() => {
                                    if (tableContainerRef.current) {
                                        tableContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                                    }
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                className="w-8 h-8 rounded-full flex items-center justify-center shadow-lg hover:opacity-90 transition-opacity"
                                style={{ backgroundColor: themeColor }}
                                title="Scroll to top"
                            >
                                <ChevronUpIcon className="h-4 w-4 text-white" />
                            </button>
                            <button
                                onClick={() => {
                                    if (tableContainerRef.current) {
                                        tableContainerRef.current.scrollTo({ top: tableContainerRef.current.scrollHeight, behavior: 'smooth' });
                                    }
                                    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                                }}
                                className="w-8 h-8 rounded-full flex items-center justify-center shadow-lg hover:opacity-90 transition-opacity"
                                style={{ backgroundColor: themeColor }}
                                title="Scroll to bottom"
                            >
                                <ChevronDownIcon className="h-4 w-4 text-white" />
                            </button>
                        </div>

                        {/* Diary Modal — Personal Notes / Thoughts */}
                        {showDieryModal && (
                            <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center z-50 p-3">
                                <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                                    {/* Header */}
                                    <div
                                        className="px-4 py-3 border-b border-gray-200 flex justify-between items-center"
                                        style={{ background: `linear-gradient(135deg, ${themeColor} 0%, ${themeShades.dark} 100%)` }}
                                    >
                                        <div>
                                            <h3 className="text-base font-semibold text-white flex items-center gap-2">
                                                <DocumentTextIcon className="h-4 w-4 text-white" />
                                                My Note
                                            </h3>
                                            <p className="text-[11px] text-white/80 mt-0.5">
                                                {dieryEntries.length} {dieryEntries.length === 1 ? 'note' : 'notes'} • Your personal thoughts
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {!showAddDieryForm && !editingDieryEntry && (
                                                <button
                                                    onClick={() => setShowAddDieryForm(true)}
                                                    className="px-3 py-1.5 bg-white text-xs font-medium rounded-lg hover:bg-gray-100 flex items-center gap-1.5"
                                                    style={{ color: themeColor }}
                                                >
                                                    <PlusIcon className="h-3.5 w-3.5" />
                                                    New Note
                                                </button>
                                            )}
                                            <button
                                                onClick={() => {
                                                    setShowDieryModal(false);
                                                    setEditingDieryEntry(null);
                                                    setShowAddDieryForm(false);
                                                    setDieryNewForm({ title: '', content: '' });
                                                }}
                                                className="w-7 h-7 sm:w-8 sm:h-8 bg-white rounded-lg flex items-center justify-center transition-all duration-200 group flex-shrink-0"
                                            >
                                                <XMarkIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black group-hover:rotate-90 transition-transform duration-200" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Add New Note Form */}
                                    {showAddDieryForm && (
                                        <div className="px-4 py-3 bg-blue-50 border-b border-blue-200">
                                            <h4 className="text-sm font-semibold mb-2" style={{ color: themeColor }}>
                                                Write a new note
                                            </h4>
                                            <div className="space-y-2">
                                                <input
                                                    type="text"
                                                    value={dieryNewForm.title}
                                                    onChange={(e) => setDieryNewForm({ ...dieryNewForm, title: e.target.value })}
                                                    placeholder="Title (optional)"
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs text-black focus:outline-none focus:ring-2"
                                                    style={{ '--tw-ring-color': themeColor }}
                                                />
                                                <textarea
                                                    value={dieryNewForm.content}
                                                    onChange={(e) => setDieryNewForm({ ...dieryNewForm, content: e.target.value })}
                                                    placeholder="Write your thoughts here... You can write as much as you want."
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs min-h-[150px] text-black focus:outline-none focus:ring-2 resize-y"
                                                    style={{ '--tw-ring-color': themeColor, whiteSpace: 'pre-wrap' }}
                                                    autoFocus
                                                />
                                            </div>
                                            <div className="flex justify-end gap-2 mt-2">
                                                <button
                                                    onClick={() => {
                                                        setShowAddDieryForm(false);
                                                        setDieryNewForm({ title: '', content: '' });
                                                    }}
                                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-[11px] font-medium hover:bg-white text-black"
                                                    disabled={savingDieryNew}
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={handleAddNewDieryEntry}
                                                    disabled={savingDieryNew || !dieryNewForm.content.trim()}
                                                    className="px-3 py-1.5 text-white rounded-lg text-[11px] font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                                                    style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                                                >
                                                    {savingDieryNew && <ArrowPathIcon className="h-3 w-3 animate-spin" />}
                                                    Save Note
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Edit Form (inline) */}
                                    {editingDieryEntry && (
                                        <div className="px-4 py-3 bg-yellow-50 border-b border-yellow-200">
                                            <h4 className="text-sm font-semibold mb-2" style={{ color: themeColor }}>
                                                Edit Note
                                            </h4>
                                            <div className="space-y-2">
                                                <input
                                                    type="text"
                                                    value={dieryEditForm.title}
                                                    onChange={(e) => setDieryEditForm({ ...dieryEditForm, title: e.target.value })}
                                                    placeholder="Title (optional)"
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs text-black focus:outline-none focus:ring-2"
                                                    style={{ '--tw-ring-color': themeColor }}
                                                />
                                                <textarea
                                                    value={dieryEditForm.content}
                                                    onChange={(e) => setDieryEditForm({ ...dieryEditForm, content: e.target.value })}
                                                    placeholder="Write your thoughts..."
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs min-h-[150px] text-black focus:outline-none focus:ring-2 resize-y"
                                                    style={{ '--tw-ring-color': themeColor, whiteSpace: 'pre-wrap' }}
                                                />
                                            </div>
                                            <div className="flex justify-end gap-2 mt-2">
                                                <button
                                                    onClick={() => {
                                                        setEditingDieryEntry(null);
                                                        setDieryEditForm({ title: '', content: '' });
                                                    }}
                                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-[11px] font-medium hover:bg-white text-black"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={handleSaveDieryEdit}
                                                    className="px-3 py-1.5 text-white rounded-lg text-[11px] font-medium hover:opacity-90"
                                                    style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                                                >
                                                    Save Changes
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Body — list of notes in paragraph format */}
                                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                                        {loadingDiery ? (
                                            <div className="text-center py-8">
                                                <ArrowPathIcon className="h-6 w-6 animate-spin mx-auto" style={{ color: themeColor }} />
                                                <p className="mt-2 text-xs text-gray-500">Loading diary...</p>
                                            </div>
                                        ) : dieryEntries.length === 0 ? (
                                            <div className="text-center py-12">
                                                <DocumentTextIcon className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                                                <p className="text-sm text-gray-500 font-medium">Your diary is empty</p>
                                                <p className="text-xs text-gray-400 mt-1">Click "New Note" to write your first thought.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {dieryEntries.map((entry) => (
                                                    <div
                                                        key={entry.id}
                                                        className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                                                    >
                                                        {/* Header row */}
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div className="flex-1 min-w-0">
                                                                {entry.title && (
                                                                    <h5 className="text-sm font-bold text-black mb-0.5 break-words">
                                                                        {entry.title}
                                                                    </h5>
                                                                )}
                                                                <p className="text-[10px] text-gray-500">
                                                                    {formatIndianDateTime(entry.created_at)}
                                                                    {entry.updated_at && entry.updated_at !== entry.created_at && (
                                                                        <span className="ml-2 italic">(edited)</span>
                                                                    )}
                                                                </p>
                                                            </div>
                                                            <div className="flex gap-1 shrink-0 ml-2">
                                                                <button
                                                                    onClick={() => handleStartEditDiery(entry)}
                                                                    className="p-1.5 hover:bg-gray-100 rounded-lg"
                                                                    title="Edit note"
                                                                >
                                                                    <PencilIcon className="h-3.5 w-3.5" style={{ color: themeColor }} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteDieryEntry(entry.id)}
                                                                    className="p-1.5 hover:bg-gray-100 rounded-lg"
                                                                    title="Delete note"
                                                                >
                                                                    <XMarkIcon className="h-3.5 w-3.5 text-red-500" />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Note content in paragraph format */}
                                                        <p
                                                            className="text-xs text-black leading-relaxed"
                                                            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                                                        >
                                                            {entry.content}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Customer Details View (with all the service history and other sections)
    return (
        <div className="min-h-screen">
            <div className="max-w-7xl mx-auto px-3 sm:px-3">
                <div className="sticky top-0 z-20 -mx-1 sm:-mx-2 px-2 sm:px-2 mb-1 sm:mb-2">
                    <button
                        onClick={handleBackToList}
                        className="flex items-center gap-1 text-[10px] sm:text-xs font-medium px-1.5 sm:px-2 py-1 sm:py-1.5 rounded-md transition-all duration-200 hover:shadow-sm"
                        style={{
                            backgroundColor: '#000000',
                            color: 'white',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.08)'
                        }}
                    >
                        <ChevronLeftIcon className="h-3 w-3" />
                        BACK
                    </button>
                </div>

                {/* Multi-Assets Alert Box — shown only when this customer owns >1 assets */}
                {relatedAssets.length > 0 && (
                    <div
                        className="bg-white rounded-xl shadow-lg mb-3 border-2 overflow-hidden"
                        style={{ borderColor: themeColor }}
                    >
                        <button
                            onClick={() => setIsMultiAssetsExpanded(prev => !prev)}
                            className="w-full px-3 sm:px-5 py-3 sm:py-3.5 flex items-center justify-between transition-colors"
                            style={{ backgroundColor: isMultiAssetsExpanded ? themeShades.light : '#f7f8fc' }}
                        >
                            <div className="flex items-center gap-2.5">
                                <CubeIcon className="h-5 w-5" style={{ color: themeColor }} />
                                <span className="text-sm sm:text-base font-semibold" style={{ color: themeColor }}>
                                    This customer has {relatedAssets.length + 1} assets
                                </span>
                                <span
                                    className="px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white"
                                    style={{ backgroundColor: themeColor }}
                                >
                                    {relatedAssets.length + 1}
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[11px] hidden sm:inline" style={{ color: themeColor, opacity: 0.75 }}>
                                    {isMultiAssetsExpanded ? 'Click to minimize' : 'Click to maximize'}
                                </span>
                                {isMultiAssetsExpanded
                                    ? <ChevronUpIcon className="h-5 w-5" style={{ color: themeColor }} />
                                    : <ChevronDownIcon className="h-5 w-5" style={{ color: themeColor }} />
                                }
                            </div>
                        </button>

                        {isMultiAssetsExpanded && (
                            <div className="p-3 bg-white border-t" style={{ borderColor: themeShades.light }}>
                                <div className="overflow-x-auto max-h-[280px] overflow-y-auto custom-scrollbar">
                                    <table className="w-full min-w-[900px] border-collapse">
                                        <thead className="bg-gray-50 sticky top-0">
                                            <tr className="border-b border-gray-200">
                                                <th className="px-2 py-1 text-center text-[11px] font-bold text-black border-r border-gray-200">Sr.</th>
                                                <th className="px-2 py-1 text-center text-[11px] font-bold text-black border-r border-gray-200">Instance ID</th>
                                                <th className="px-2 py-1 text-center text-[11px] font-bold text-black border-r border-gray-200">Customer Name</th>
                                                <th className="px-2 py-1 text-center text-[11px] font-bold text-black border-r border-gray-200">Contact</th>
                                                <th className="px-2 py-1 text-center text-[11px] font-bold text-black border-r border-gray-200">Branch</th>
                                                <th className="px-2 py-1 text-center text-[11px] font-bold text-black border-r border-gray-200">Segment</th>
                                                <th className="px-2 py-1 text-center text-[11px] font-bold text-black border-r border-gray-200">Engine Model</th>
                                                <th className="px-2 py-1 text-center text-[11px] font-bold text-black border-r border-gray-200">Applicable Drives</th>
                                                <th className="px-2 py-1 text-center text-[11px] font-bold text-black">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(() => {
                                                // Current asset (the one open right now)
                                                const currentAsset = {
                                                    customer_id: customerDetails?.customer_id,
                                                    instance_id: customerDetails?.instance_id,
                                                    customer_name: customerDetails?.customer_name,
                                                    mobile: customerDetails?.phone_number,
                                                    branch_id: customerDetails?.branch_id,
                                                    segment: customerCompleteData?.asset_detailed?.[0]?.segment || '-',
                                                    engine_model: customerCompleteData?.asset_detailed?.[0]?.engine_model || '-',
                                                    campaigns_count: customerCampaigns?.length || 0,
                                                    isCurrent: true,
                                                };

                                                // The other assets of the same customer
                                                const others = relatedAssets.map(a => ({
                                                    customer_id: a.customer_id,
                                                    instance_id: a.instance_id,
                                                    customer_name: a.customer_name,
                                                    mobile: a.mobile,
                                                    branch_id: a.branch_id,
                                                    segment: a.segment || '-',
                                                    engine_model: a.engine_model || '-',
                                                    campaigns_count: a.campaigns?.length || 0,
                                                    isCurrent: false,
                                                }));

                                                // FREEZE the order: stable numeric sort by Instance ID.
                                                // Same set of assets => same order, no matter which one is open.
                                                const allAssets = [currentAsset, ...others].sort((a, b) =>
                                                    String(a.instance_id || '').localeCompare(
                                                        String(b.instance_id || ''),
                                                        undefined,
                                                        { numeric: true }
                                                    )
                                                );

                                                return allAssets.map((asset, idx) => {
                                                    const isViewing = asset.isCurrent;
                                                    return (
                                                        <tr
                                                            key={`${asset.customer_id}-${asset.instance_id}`}
                                                            className={isViewing ? 'border-b border-gray-100' : 'hover:bg-gray-50 border-b border-gray-100'}
                                                            style={isViewing ? { backgroundColor: themeShades.light } : {}}
                                                        >
                                                            <td className="px-2 py-1.5 text-center text-[11px] text-black border-r border-gray-100">{idx + 1}</td>
                                                            <td
                                                                className="px-2 py-1.5 text-center text-[11px] border-r border-gray-100"
                                                                style={isViewing ? { color: themeColor, fontWeight: 700 } : { color: '#000' }}
                                                            >
                                                                {asset.instance_id || '-'}
                                                            </td>
                                                            <td className="px-2 py-1.5 text-center text-[11px] text-black border-r border-gray-100">{asset.customer_name || '-'}</td>
                                                            <td className="px-2 py-1.5 text-center text-[11px] text-black border-r border-gray-100">{formatPhoneNumber(asset.mobile)}</td>
                                                            <td className="px-2 py-1.5 text-center text-[11px] text-black border-r border-gray-100">{asset.branch_id || '-'}</td>
                                                            <td className="px-2 py-1.5 text-center text-[11px] text-black border-r border-gray-100">{asset.segment || '-'}</td>
                                                            <td className="px-2 py-1.5 text-center text-[11px] text-black border-r border-gray-100">{asset.engine_model || '-'}</td>
                                                            <td className="px-2 py-1.5 text-center text-[11px] text-black border-r border-gray-100">{asset.campaigns_count}</td>
                                                            <td className="px-2 py-1.5 text-center text-[11px]">
                                                                {isViewing ? (
                                                                    <span className="font-semibold text-[10px]" style={{ color: themeColor }}>● Viewing</span>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => handleViewCustomer(asset.customer_id)}
                                                                        className="px-2 py-0.5 text-white rounded-md text-[10px] font-medium hover:opacity-90"
                                                                        style={{ backgroundColor: themeColor }}
                                                                    >
                                                                        View
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                });
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Customer Basic Info Section with Box Layout */}
                <div className="bg-white rounded-xl shadow-lg p-3 sm:p-4 mb-3 sm:mb-3">
                    <div className="flex justify-between items-center mb-3">
                        <h2 className="text-sm sm:text-base font-semibold flex items-center gap-2">
                            <MdEmojiPeople className="h-3 w-3 sm:h-4 sm:w-4" style={{ color: themeColor }} />
                            Customer Information
                        </h2>

                    </div>

                    {/* Scrollable Content Area with Box Layout */}
                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                        {/* ⚡ Box shows instantly with customerDetails.
                            A thin inline strip indicates extra fields are still loading
                            instead of blocking the entire section. */}
                        {loadingCompleteData && (
                            <div className="flex items-center gap-2 mb-2 px-1 text-[11px] text-gray-400">
                                <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" style={{ color: themeColor }} />
                                <span>Loading more details…</span>
                            </div>
                        )}
                        {renderCustomerRelatedData()}
                    </div>
                </div>

                {/* Edit History Section — always visible, no dropdown */}
                {customerEditInfo && customerEditInfo.total_edits > 0 && (
                    <div className="bg-white rounded-xl shadow-lg p-3 sm:p-4 mb-3 sm:mb-4">
                        <h3 className="text-sm sm:text-base font-semibold text-black mb-3 flex items-center gap-2">
                            <ClockIcon className="h-3 w-3 sm:h-4 sm:w-4" style={{ color: themeColor }} />
                            Edit History
                        </h3>

                        {customerEditInfo.current_edited_data && (
                            <div className="mb-3 p-2 bg-blue-50 rounded-lg border border-blue-200">
                                <h4 className="text-[11px] font-semibold text-black mb-1.5">Current Edited Data</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                                    {Object.entries(customerEditInfo.current_edited_data)
                                        .filter(([key]) => key !== "pan_number")
                                        .map(([key, value]) => {
                                            const originalValue = customerEditInfo.original_customer[key];
                                            const hasChanged = originalValue !== value;
                                            return (
                                                <div key={key} className="flex flex-col">
                                                    <span className="text-[10px] text-black capitalize">
                                                        {key.replace(/_/g, " ")}
                                                    </span>
                                                    <span className={`font-medium ${hasChanged ? "text-blue-600" : "text-black"}`}>
                                                        {value || "-"}
                                                        {hasChanged && (
                                                            <span className="ml-1 text-[10px] text-black">
                                                                (was: {originalValue || "-"})
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                </div>
                                {customerEditInfo.last_edited_by && (
                                    <div className="mt-1.5 text-[10px] text-black">
                                        Last edited by: {customerEditInfo.last_edited_by.name}{" "}
                                        on {formatDateTime(customerEditInfo.last_edited_at)}
                                    </div>
                                )}
                            </div>
                        )}

                        {customerEditInfo.edit_history && customerEditInfo.edit_history.length > 0 && (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[600px] border-collapse">
                                    <thead className="bg-gray-50">
                                        <tr className="border-b border-gray-200">
                                            <th className="px-2 py-1.5 text-center text-[11px] font-medium text-black border-r border-gray-200">
                                                Date
                                            </th>
                                            <th className="px-2 py-1.5 text-center text-[11px] font-medium text-black border-r border-gray-200">
                                                Edited By
                                            </th>
                                            <th className="px-2 py-1.5 text-center text-[11px] font-medium text-black border-r border-gray-200">
                                                Changes
                                            </th>
                                            <th className="px-2 py-1.5 text-center text-[11px] font-medium text-black">
                                                Edit #
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {customerEditInfo.edit_history.map((history) => (
                                            <tr key={history.id} className="hover:bg-gray-50 border-b border-gray-100">
                                                <td className="px-2 py-1.5 text-[11px] whitespace-nowrap text-black border-r border-gray-100">
                                                    {formatDateTime(history.edited_at)}
                                                </td>
                                                <td className="px-2 py-1.5 text-[11px] whitespace-nowrap text-black border-r border-gray-100">
                                                    {history.user_name}
                                                </td>
                                                <td className="px-2 py-1.5 text-[11px] border-r border-gray-100">
                                                    <div className="space-y-0.5">
                                                        {Object.entries(history.edited_data)
                                                            .filter(([field]) => field !== "pan_number")
                                                            .map(([field, value]) => {
                                                                const originalValue = customerEditInfo.original_customer[field];
                                                                if (originalValue !== value) {
                                                                    return (
                                                                        <div key={field} className="text-[11px]">
                                                                            <span className="font-semibold text-black capitalize">
                                                                                {field.replace(/_/g, " ")}:
                                                                            </span>
                                                                            <span className="ml-1 text-black line-through mr-1">
                                                                                {originalValue || "-"}
                                                                            </span>
                                                                            <span className="text-emerald-600 font-medium">
                                                                                → {value || "-"}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                }
                                                                return null;
                                                            })}
                                                    </div>
                                                </td>
                                                <td className="px-2 py-1.5 text-[11px] whitespace-nowrap text-black">
                                                    #{history.edit_count}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {customerEditInfo.edit_history && customerEditInfo.edit_history.length === 0 && (
                            <p className="text-[11px] text-black text-center py-3">No edit history available</p>
                        )}
                    </div>
                )}

                {/* LMS Data Section */}
                <div className="bg-white rounded-xl shadow-lg p-3 sm:p-4 mb-3 sm:mb-3">
                    <h2 className="text-sm sm:text-base font-semibold mb-2 sm:mb-3 flex items-center gap-2">
                        <BsGraphUpArrow
                            className="h-3 w-3 sm:h-4 sm:w-4"
                            style={{ color: themeColor }}
                        />
                        LMS Data
                    </h2>

                    <div className="overflow-x-auto overflow-y-auto max-h-[400px] custom-scrollbar">
                        <table className="w-full min-w-[1000px] border-collapse">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr className="border-b border-gray-200">
                                    <th className="px-2 py-1.5 text-center text-[11px] font-semibold text-black whitespace-nowrap border-r border-gray-200">
                                        Sr. No.
                                    </th>
                                    <th className="px-2 py-1.5 text-center text-[11px] font-semibold text-black whitespace-nowrap border-r border-gray-200">
                                        Instance ID
                                    </th>
                                    <th className="px-2 py-1.5 text-center text-[11px] font-semibold text-black whitespace-nowrap border-r border-gray-200">
                                        SR Type
                                    </th>
                                    <th className="px-2 py-1.5 text-center text-[11px] font-semibold text-black whitespace-nowrap border-r border-gray-200">
                                        SR Sub Type
                                    </th>
                                    <th className="px-2 py-1.5 text-center text-[11px] font-semibold text-black whitespace-nowrap border-r border-gray-200">
                                        Lead Status
                                    </th>
                                    <th className="px-2 py-1.5 text-center text-[11px] font-semibold text-black whitespace-nowrap border-r border-gray-200">
                                        KVA Rating
                                    </th>
                                    <th className="px-2 py-1.5 text-center text-[11px] font-semibold text-black whitespace-nowrap border-r border-gray-200">
                                        Service Engineer
                                    </th>
                                    <th className="px-2 py-1.5 text-center text-[11px] font-semibold text-black whitespace-nowrap border-r border-gray-200">
                                        Tele Caller
                                    </th>
                                    <th className="px-2 py-1.5 text-center text-[11px] font-semibold text-black whitespace-nowrap border-r border-gray-200">
                                        Quotation Number
                                    </th>
                                    <th className="px-2 py-1.5 text-center text-[11px] font-semibold text-black whitespace-nowrap border-r border-gray-200">
                                        Quotation Submit Date
                                    </th>
                                    <th className="px-2 py-1.5 text-center text-[11px] font-semibold text-black whitespace-nowrap border-r border-gray-200">
                                        Quotation Approval Date
                                    </th>
                                    <th className="px-2 py-1.5 text-center text-[11px] font-semibold text-black whitespace-nowrap">
                                        Order Number
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {customerLmsData.map((lms, idx) => (
                                    <tr key={lms.id} className="border-b border-gray-100">
                                        <td className="px-2 py-1.5 text-center text-[11px] sm:text-xs whitespace-nowrap border-r border-gray-100">
                                            {idx + 1}
                                        </td>
                                        <td className="px-2 py-1.5 text-center text-[11px] sm:text-xs whitespace-nowrap border-r border-gray-100">
                                            {lms.instance_id || "-"}
                                        </td>
                                        <td className="px-2 py-1.5 text-center text-[11px] sm:text-xs whitespace-nowrap border-r border-gray-100">
                                            {lms.sr_type || "-"}
                                        </td>
                                        <td className="px-2 py-1.5 text-center text-[11px] sm:text-xs whitespace-nowrap border-r border-gray-100">
                                            {lms.sr_sub_type || "-"}
                                        </td>
                                        <td className="px-2 py-1.5 text-center text-[11px] sm:text-xs whitespace-nowrap border-r border-gray-100">
                                            {lms.lead_status || "-"}
                                        </td>
                                        <td className="px-2 py-1.5 text-center text-[11px] sm:text-xs whitespace-nowrap border-r border-gray-100">
                                            {lms.kva_rating || "-"}
                                        </td>
                                        <td className="px-2 py-1.5 text-center text-[11px] sm:text-xs whitespace-nowrap border-r border-gray-100">
                                            {lms.service_engineer_name || "-"}
                                        </td>
                                        <td className="px-2 py-1.5 text-center text-[11px] sm:text-xs whitespace-nowrap border-r border-gray-100">
                                            {lms.tele_caller_name || "-"}
                                        </td>
                                        <td className="px-2 py-1.5 text-center text-[11px] sm:text-xs whitespace-nowrap border-r border-gray-100">
                                            {lms.quotation_number || "-"}
                                        </td>
                                        <td className="px-2 py-1.5 text-center text-[11px] sm:text-xs whitespace-nowrap border-r border-gray-100">
                                            {formatDate(lms.quotation_submit_date)}
                                        </td>
                                        <td className="px-2 py-1.5 text-center text-[11px] sm:text-xs whitespace-nowrap border-r border-gray-100">
                                            {formatDate(lms.quotation_approval_date)}
                                        </td>
                                        <td className="px-2 py-1.5 text-center text-[11px] sm:text-xs whitespace-nowrap">
                                            {lms.order_number || "-"}
                                        </td>
                                    </tr>
                                ))}
                                {customerLmsData.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan="12"
                                            className="px-2 py-3 text-center text-[11px] sm:text-xs text-gray-500"
                                        >
                                            No LMS data found
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div
                    id="followup-form"
                    className="bg-white rounded-xl shadow-lg p-3 sm:p-4 mt-3 mb-3 border-2 scroll-mt-20"
                    style={{ borderColor: themeColor }}
                >
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-sm sm:text-base font-semibold" style={{ color: "black" }}>
                            {editingFollowup ? 'Edit Follow-up' : 'Create New Follow-ups'}
                        </h3>
                        <div className="flex gap-1.5">
                            {isAdmin && (
                                <button
                                    onClick={openLetterWizard}
                                    className="px-2 py-1 text-[11px] text-white rounded-lg hover:opacity-90 transition-all flex items-center gap-1.5"
                                    style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                                >
                                    <PaperAirplaneIcon className="h-2.5 w-2.5" />
                                    Send Letter
                                </button>
                            )}
                            {isAdmin && (
                                <>
                                    <button
                                        onClick={() => {
                                            setEditingActivity(null);
                                            setActivityInput('');
                                            setShowActivityModal(true);
                                        }}
                                        className="px-2 py-1 text-[11px] text-white rounded-lg hover:opacity-90 transition-all flex items-center gap-1.5"
                                        style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                                    >
                                        <PlusIcon className="h-2.5 w-2.5" />
                                        Add Activity
                                    </button>
                                    <button
                                        onClick={() => {
                                            setEditingRR(null);
                                            setRRInput('');
                                            setShowRRModal(true);
                                        }}
                                        className="px-2 py-1 text-[11px] text-white rounded-lg hover:opacity-90 transition-all flex items-center gap-1.5"
                                        style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                                    >
                                        <PlusIcon className="h-2.5 w-2.5" />
                                        Add Reject Reason
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Campaign Selection */}
                    <div className="mb-3">
                        <label className="block text-[11px] font-semibold text-black mb-1.5">Select Drives for Follow-up *</label>

                        <div className="grid grid-cols-[7fr_3fr] gap-2">
                            {/* Enrolled campaigns */}
                            <div className="border border-gray-200 rounded-lg p-2 min-w-0">
                                <p className="text-[10px] font-bold text-black uppercase mb-1.5">Enrolled Drives</p>
                                <div className="flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar" style={{ scrollbarWidth: 'thin' }}>
                                    {customerCampaigns.map(campaign => (
                                        <button
                                            key={campaign.id}
                                            type="button"
                                            onClick={() => handleCampaignSelection(campaign.id)}
                                            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${selectedCampaignsForFollowup.includes(campaign.id)
                                                ? 'text-white'
                                                : 'bg-gray-100 text-black hover:bg-gray-200'
                                                }`}
                                            style={selectedCampaignsForFollowup.includes(campaign.id) ? { backgroundColor: campaign.color || themeColor } : {}}
                                        >
                                            <span>{campaign.name}</span>
                                            {selectedCampaignsForFollowup.includes(campaign.id) && (
                                                <CheckCircleIcon className="h-3 w-3" />
                                            )}
                                        </button>
                                    ))}
                                    {customerCampaigns.length === 0 && (
                                        <span className="text-[11px] text-gray-400">Loading...</span>
                                    )}
                                </div>
                            </div>

                            {/* Other (not enrolled) campaigns — collapsed behind a toggle */}
                            <div className="border border-dashed border-gray-300 rounded-lg bg-gray-50 overflow-hidden min-w-0">
                                <button
                                    type="button"
                                    onClick={() => setShowOtherCampaigns(prev => !prev)}
                                    className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-gray-100 transition-colors"
                                >
                                    <span className="text-[10px] font-bold text-black uppercase flex items-center gap-1.5">
                                        Other Campaigns (Not Enrolled)
                                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold text-white" style={{ backgroundColor: themeColor }}>
                                            {notEnrolledCampaigns.length}
                                        </span>
                                    </span>
                                    <ChevronDownIcon
                                        className={`h-3.5 w-3.5 text-gray-500 transition-transform duration-200 ${showOtherCampaigns ? 'rotate-180' : ''}`}
                                    />
                                </button>

                                {showOtherCampaigns && (
                                    <div className="px-2 pb-2 pt-1 border-t border-dashed border-gray-300">
                                        <div className="flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar" style={{ scrollbarWidth: 'thin' }}>
                                            {notEnrolledCampaigns.map(campaign => (
                                                <button
                                                    key={campaign.id}
                                                    type="button"
                                                    onClick={() => handleCampaignSelection(campaign.id)}
                                                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${selectedCampaignsForFollowup.includes(campaign.id)
                                                        ? 'text-white'
                                                        : 'bg-white border border-gray-300 text-black hover:bg-gray-100'
                                                        }`}
                                                    style={selectedCampaignsForFollowup.includes(campaign.id) ? { backgroundColor: campaign.color || themeColor } : {}}
                                                >
                                                    <span>{campaign.name}</span>
                                                    {selectedCampaignsForFollowup.includes(campaign.id) && (
                                                        <CheckCircleIcon className="h-3 w-3" />
                                                    )}
                                                </button>
                                            ))}

                                            {/* Other (non-campaign) follow-up — stored in non_followups */}
                                            <button
                                                type="button"
                                                onClick={() => handleOtherSelection()}
                                                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${selectedCampaignsForFollowup.includes('other')
                                                    ? 'text-white'
                                                    : 'bg-white border border-gray-300 text-black hover:bg-gray-100'
                                                    }`}
                                                style={selectedCampaignsForFollowup.includes('other') ? { backgroundColor: '#9CA3AF' } : {}}
                                            >
                                                <span>Other</span>
                                                {selectedCampaignsForFollowup.includes('other') && (
                                                    <CheckCircleIcon className="h-3 w-3" />
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {selectedCampaignsForFollowup.length === 0 && (
                            <p className="text-[11px] text-red-500 mt-1">Please select at least one drive</p>
                        )}
                    </div>

                    {/* Common Fields Section */}
                    <div className="mb-4 p-2 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                            <div>
                                <label className="block text-[11px] font-semibold text-black mb-0.5 text-center">Follow-up Date</label>
                                <input
                                    type="date"
                                    value={commonFollowupDate}
                                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-[11px] bg-gray-100 cursor-not-allowed text-black"
                                    disabled
                                    readOnly
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-black mb-0.5 text-center">Follow-up By *</label>
                                <select
                                    value={commonFollowupBy}
                                    onChange={(e) => {
                                        setCommonFollowupBy(e.target.value);
                                        selectedCampaignsForFollowup.forEach(campaignId => {
                                            updateCampaignFollowupData(campaignId, 'followup_by', e.target.value);
                                        });
                                    }}
                                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-[11px] focus:ring-2 focus:ring-opacity-50 text-black"
                                    style={{ '--tw-ring-color': themeColor }}
                                >
                                    <option value="call">Call</option>
                                    <option value="whatsapp">WhatsApp</option>
                                    <option value="email">Email</option>
                                    <option value="visit">Visit</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-black mb-0.5 text-center">Next Follow-up Date <span className="text-red-500">*</span></label>
                                <input
                                    type="date"
                                    value={allSelectedNoNextDate ? '' : commonNextFollowupDate}
                                    disabled={allSelectedNoNextDate}
                                    onChange={(e) => {
                                        const selectedDateValue = e.target.value;
                                        setCommonNextFollowupDate(selectedDateValue);

                                        if (selectedDateValue) {
                                            const autoFlag = getFlagFromDaysDifference(selectedDateValue);
                                            setCommonFollowupFlag(autoFlag);
                                            selectedCampaignsForFollowup.forEach(campaignId => {
                                                updateCampaignFollowupData(campaignId, 'followup_flag', autoFlag);
                                                updateCampaignFollowupData(campaignId, 'next_followup_date', selectedDateValue);
                                            });
                                        } else {
                                            setCommonFollowupFlag('');
                                            selectedCampaignsForFollowup.forEach(campaignId => {
                                                updateCampaignFollowupData(campaignId, 'followup_flag', '');
                                                updateCampaignFollowupData(campaignId, 'next_followup_date', '');
                                            });
                                        }
                                    }}
                                    min={new Date().toISOString().split('T')[0]}
                                    className={`w-full border border-gray-300 rounded-lg px-2 py-1 text-[11px] focus:ring-2 focus:ring-opacity-50 text-black ${allSelectedNoNextDate ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                    style={{ '--tw-ring-color': themeColor }}
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-black mb-0.5 text-center">Follow-up Flag <span className="text-red-500">*</span></label>
                                <div className="w-full border border-gray-200 rounded-lg px-2 py-1 text-[11px] bg-gray-50 text-center min-h-[28px] flex items-center justify-center">
                                    {allSelectedNoFlag ? (
                                        <span className="text-gray-400">—</span>
                                    ) : commonFollowupFlag ? (
                                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700">
                                            {commonFollowupFlag}
                                        </span>
                                    ) : (
                                        <span className="text-gray-400">Auto-set</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Campaigns Table */}
                    {selectedCampaignsForFollowup.length > 0 && (
                        <div className="mb-4 overflow-x-auto border border-gray-300 rounded-lg shadow-sm">
                            <table className="w-full min-w-[1500px] border-collapse">
                                <thead className="bg-gradient-to-r from-gray-100 to-gray-50 sticky top-0">
                                    <tr className="border-b border-gray-300">
                                        <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border border-gray-300 whitespace-nowrap w-[120px] bg-gray-100">Drive Name & Script</th>
                                        <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border border-gray-300 whitespace-nowrap w-[120px] bg-gray-100">Service or Product</th>
                                        {showCspSubtypeGlobal && (
                                            <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border border-gray-300 whitespace-nowrap w-[140px] bg-gray-100">Subtype</th>
                                        )}
                                        <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border border-gray-300 whitespace-nowrap w-[150px] bg-gray-100">Activity <span className="text-red-500">*</span></th>
                                        <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border border-gray-300 whitespace-nowrap w-[100px] bg-gray-100">Status <span className="text-red-500">*</span></th>

                                        {/* Reject Reason Column - Only visible when any campaign has status 'rejected' */}
                                        {selectedCampaignsForFollowup.some(campaignId => campaignFollowupData[campaignId]?.status === 'rejected') && (
                                            <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border border-gray-300 whitespace-nowrap w-[150px] bg-gray-100">Reject Reason <span className="text-red-500">*</span></th>
                                        )}

                                        {/* Quote Sent Column - Always visible */}
                                        <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border border-gray-300 whitespace-nowrap w-[70px] bg-gray-100">Quote Sent</th>

                                        {/* Quote No. Column - Only visible when any campaign has quote sent */}
                                        {selectedCampaignsForFollowup.some(campaignId => campaignFollowupData[campaignId]?.quotation_sent) && (
                                            <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border border-gray-300 whitespace-nowrap w-[120px] bg-gray-100">Quote No.</th>
                                        )}

                                        {/* Quote Value Column - Only visible when any campaign has quote sent */}
                                        {selectedCampaignsForFollowup.some(campaignId => campaignFollowupData[campaignId]?.quotation_sent) && (
                                            <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border border-gray-300 whitespace-nowrap w-[120px] bg-gray-100">Quote Value</th>
                                        )}

                                        <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border border-gray-300 whitespace-nowrap w-[200px] bg-gray-100">Remark <span className="text-red-500">*</span></th>                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedCampaignsForFollowup.map((campaignId, index) => {
                                        const isOther = campaignId === 'other';
                                        const campaign = !isOther ? selectableCampaigns.find(c => c.id === parseInt(campaignId)) : null;
                                        const campaignData = campaignFollowupData[campaignId] || {};
                                        const remarkText = campaignData.remark || '';
                                        const showQuoteColumns = campaignData.quotation_sent === true;
                                        const showRejectReason = campaignData.status === 'rejected';

                                        return (
                                            <tr
                                                key={campaignId}
                                                className={`hover:bg-gray-50 transition-colors ${index !== selectedCampaignsForFollowup.length - 1 ? 'border-b border-gray-200' : ''
                                                    }`}
                                            >
                                                <td className="px-2 py-1.5 border border-gray-300 text-left align-middle">
                                                    {isOther ? (
                                                        <span className="font-semibold text-[11px]" style={{ color: "black" }}>
                                                            Other
                                                        </span>
                                                    ) : campaign ? (
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => loadCampaignPdfs(campaignId)}
                                                                className="p-0.5 text-black hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
                                                                title="View PDFs"
                                                            >
                                                                <DocumentTextIcon className="h-3.5 w-3.5" style={{ color: "black" }} />
                                                            </button>
                                                            <span className="font-semibold text-[11px]" style={{ color: "black" }}>
                                                                {campaign.name}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-[11px] text-green-600 font-semibold">Completed Drive</span>
                                                    )}
                                                </td>
                                                <td className="px-2 py-1.5 border border-gray-300 text-center align-middle">
                                                    {isOther ? (
                                                        <select
                                                            value={campaignData.service || ''}
                                                            onChange={(e) => updateCampaignFollowupData(campaignId, 'service', e.target.value)}
                                                            className="w-full border border-gray-300 rounded-lg px-2 py-1 text-[11px] text-black"
                                                            style={{ '--tw-ring-color': themeColor }}
                                                        >
                                                            <option value="">-- Optional --</option>
                                                            {campaignServices.map((cs) => (
                                                                <option key={cs.id} value={cs.name}>
                                                                    {cs.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    ) : campaign ? (
                                                        <span className="text-[11px] text-black flex items-center justify-center gap-1">
                                                            {campaign.service || '-'}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[11px] text-black">-</span>
                                                    )}
                                                </td>
                                                {showCspSubtypeGlobal && (
                                                    <td className="px-2 py-1.5 border border-gray-300 text-center align-middle">
                                                        {!isOther && campaign && isCspCampaign(campaign) ? (
                                                            <span className="text-[11px] text-black">{getCspAutoSubtype() || '-'}</span>
                                                        ) : (
                                                            <span className="text-[11px] text-black">-</span>
                                                        )}
                                                    </td>
                                                )}
                                                <td className="px-2 py-1.5 border border-gray-300 text-center align-middle">
                                                    <select
                                                        value={campaignData.activity_id || ''}
                                                        //commented by nik
                                                        // onChange={(e) => updateCampaignFollowupData(campaignId, 'activity_id', e.target.value)}
                                                        //added by nik
                                                        onChange={(e) => {
                                                            const newActivityId = e.target.value;
                                                            updateCampaignFollowupData(campaignId, 'activity_id', newActivityId);

                                                            if (newActivityId) {
                                                                const selectedActivity = activities.find(a => a.id === parseInt(newActivityId));
                                                                const content = (selectedActivity?.content || '').toLowerCase();

                                                                const currentStatus = campaignData.status || 'rescheduled';

                                                                const isNowBlocked =
                                                                    (content.includes('quotation send') && (currentStatus === 'rescheduled' || currentStatus === 'not_connected')) ||
                                                                    (content.includes('quotation required') && (currentStatus === 'wip' || currentStatus === 'completed'));

                                                                if (isNowBlocked) {
                                                                    const safeDefault = content.includes('quotation send') ? 'wip' : 'rescheduled';
                                                                    updateCampaignFollowupData(campaignId, 'status', safeDefault);
                                                                }
                                                            }
                                                        }}
                                                        className="w-full border border-gray-300 rounded-lg px-2 py-1 text-[11px] focus:ring-2 focus:border-transparent transition-all text-center text-black"
                                                        style={{ '--tw-ring-color': themeColor }}
                                                        required
                                                    >
                                                        <option value="">Select Activity</option>
                                                        {(() => {
                                                            const serviceText = isOther
                                                                ? (campaignData.service || '').trim()
                                                                : (campaign?.service || '').trim();

                                                            // Build whole-word regex (escapes regex special chars)
                                                            const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                                            const otherRegex = /\bOther\b/i;

                                                            let matched = [];
                                                            let otherActivities = [];

                                                            if (serviceText) {
                                                                const wordRegex = new RegExp(`\\b${escapeRegex(serviceText)}\\b`, 'i');
                                                                activities.forEach(activity => {
                                                                    const content = activity.content || '';
                                                                    if (wordRegex.test(content)) {
                                                                        matched.push(activity);
                                                                    } else if (otherRegex.test(content)) {
                                                                        otherActivities.push(activity);
                                                                    }
                                                                });
                                                            } else {
                                                                // No service text → show only "Other" activities
                                                                activities.forEach(activity => {
                                                                    if (otherRegex.test(activity.content || '')) {
                                                                        otherActivities.push(activity);
                                                                    }
                                                                });
                                                            }

                                                            return (
                                                                <>
                                                                    {matched.map(activity => (
                                                                        <option key={activity.id} value={activity.id}>
                                                                            {activity.content.substring(0, 50)}{activity.content.length > 50 ? '...' : ''}
                                                                        </option>
                                                                    ))}
                                                                    {otherActivities.map(activity => (
                                                                        <option key={activity.id} value={activity.id}>
                                                                            {activity.content.substring(0, 50)}{activity.content.length > 50 ? '...' : ''}
                                                                        </option>
                                                                    ))}
                                                                </>
                                                            );
                                                        })()}
                                                    </select>
                                                </td>
                                                <td className="px-2 py-1.5 border border-gray-300 text-center align-middle">
                                                    {/* commented by nik */}
                                                    {/* <select
                                                        value={campaignData.status || 'rescheduled'}
                                                        onChange={(e) => {
                                                            const newStatus = e.target.value;

                                                            // If quotation is sent, prevent changing status to "rescheduled"
                                                            if (campaignData.quotation_sent && newStatus === 'rescheduled') {
                                                                const campaign = selectableCampaigns.find(c => c.id === parseInt(campaignId));
                                                                toast.error(`Cannot change status to "Follow-up Reschedule" because quotation has already been sent for campaign "${campaign?.name}".`);
                                                                return;
                                                            }

                                                            updateCampaignFollowupData(campaignId, 'status', newStatus);
                                                            if (newStatus !== 'rejected') {
                                                                updateCampaignFollowupData(campaignId, 'rr_id', '');
                                                            }
                                                        }}
                                                        className="w-full border border-gray-300 rounded-lg px-2 py-1 text-[11px] focus:ring-2 focus:border-transparent transition-all font-medium text-center text-black"
                                                        style={{ '--tw-ring-color': "themeColor" }}
                                                    >
                                                        <option value="rescheduled">Follow-up Reschedule</option>
                                                        <option value="wip">Work in Progress</option>
                                                        <option value="completed">Completed</option>
                                                        <option value="rejected">Rejected</option>
                                                    </select> */}
                                                    {/* added by nik */}
                                                    <select
                                                        value={campaignData.status || 'rescheduled'}
                                                        onChange={(e) => {
                                                            const newStatus = e.target.value;

                                                            // If quotation is sent, block switching to a status that forbids quotations
                                                            if (campaignData.quotation_sent && (newStatus === 'rescheduled' || newStatus === 'not_connected')) {
                                                                const campaign = selectableCampaigns.find(c => c.id === parseInt(campaignId));
                                                                const label = newStatus === 'not_connected' ? 'Not Connected' : 'Follow-up Reschedule';
                                                                toast.error(`Cannot change status to "${label}" because quotation has already been sent for drive "${campaign?.name}".`);
                                                                return;
                                                            }

                                                            updateCampaignFollowupData(campaignId, 'status', newStatus);
                                                            if (newStatus !== 'rejected') {
                                                                updateCampaignFollowupData(campaignId, 'rr_id', '');
                                                            }
                                                        }}
                                                        className="w-full border border-gray-300 rounded-lg px-2 py-1 text-[11px] focus:ring-2 focus:border-transparent transition-all font-medium text-center text-black"
                                                        style={{ '--tw-ring-color': "themeColor" }}
                                                    >
                                                        {(() => {
                                                            const selectedActivity = activities.find(
                                                                a => a.id === parseInt(campaignData.activity_id)
                                                            );
                                                            const activityContent = (selectedActivity?.content || '').toLowerCase();

                                                            const isQuotationSendActivity = activityContent.includes('quotation send');
                                                            const isQuotationRequiredActivity = activityContent.includes('quotation required');

                                                            const options = [
                                                                { value: 'rescheduled', label: 'Follow-up Reschedule' },
                                                                { value: 'not_connected', label: 'Not Connected' },
                                                                { value: 'wip', label: 'Work in Progress' },
                                                                { value: 'completed', label: 'Completed' },
                                                                { value: 'rejected', label: 'Rejected' },
                                                            ];

                                                            return options.map(opt => {
                                                                if (isQuotationSendActivity && opt.value === 'rescheduled') return null;
                                                                if (isQuotationSendActivity && opt.value === 'not_connected') return null;
                                                                if (isQuotationRequiredActivity && opt.value === 'wip') return null;
                                                                if (isQuotationRequiredActivity && opt.value === 'completed') return null;

                                                                return (
                                                                    <option key={opt.value} value={opt.value}>
                                                                        {opt.label}
                                                                    </option>
                                                                );
                                                            });
                                                        })()}
                                                    </select>
                                                </td>

                                                {showRejectReasonGlobal && (
                                                    <td className="px-2 py-1.5 border border-gray-300 text-center align-middle">
                                                        {campaignData.status === 'rejected' ? (
                                                            <select
                                                                value={campaignData.rr_id || ''}
                                                                onChange={(e) => updateCampaignFollowupData(campaignId, 'rr_id', e.target.value)}
                                                                className={`w-full border rounded-lg px-2 py-1 text-[11px] ${!campaignData.rr_id ? 'border-red-500 bg-red-50' : 'border-gray-300'
                                                                    }`}
                                                                style={{ '--tw-ring-color': themeColor }}
                                                                required
                                                            >
                                                                <option value="">Select Reason</option>
                                                                {rrList.map(rr => (
                                                                    <option key={rr.id} value={rr.id}>
                                                                        {rr.content}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        ) : (
                                                            <span className="text-gray-400 text-[11px]">-</span>
                                                        )}
                                                    </td>
                                                )}

                                                <td className="px-2 py-1.5 border border-gray-300 text-center align-middle">
                                                    <div className="flex items-center justify-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={campaignData.quotation_sent || false}
                                                            disabled={campaignData.status === 'rescheduled' || campaignData.status === 'not_connected'}
                                                            onChange={(e) => {
                                                                // Statuses that forbid quotations
                                                                if (campaignData.status === 'rescheduled' || campaignData.status === 'not_connected') {
                                                                    const label = campaignData.status === 'not_connected' ? 'Not Connected' : 'Follow-up Reschedule';
                                                                    toast.error(`Cannot send quotation when status is "${label}"`);
                                                                    return;
                                                                }

                                                                // If trying to check WIP quotation, validate 90-day rule
                                                                if (e.target.checked && campaignData.status === 'wip') {
                                                                    if (!canCreateWipQuotation(campaignId)) {
                                                                        const campaign = selectableCampaigns.find(c => c.id === parseInt(campaignId));
                                                                        toast.error(`Cannot send quotation with WIP status for campaign "${campaign?.name}". 2 WIP quotations have already been sent within the last 90 days.`);
                                                                        return;
                                                                    }
                                                                }

                                                                updateCampaignFollowupData(campaignId, 'quotation_sent', e.target.checked);
                                                                if (!e.target.checked) {
                                                                    updateCampaignFollowupData(campaignId, 'quotation_no', '');
                                                                    updateCampaignFollowupData(campaignId, 'quotation_value', '');
                                                                }
                                                            }}
                                                            className={`rounded border border-gray-400 h-3.5 w-3.5 focus:ring-2 ${(campaignData.status === 'rescheduled' || campaignData.status === 'not_connected') ? 'opacity-50 cursor-not-allowed' : ''
                                                                }`}
                                                            style={{ accentColor: themeColor }}
                                                        />
                                                    </div>
                                                </td>

                                                {showQuoteColumnsGlobal && (
                                                    <td className="px-2 py-1.5 border border-gray-300 text-left align-middle">
                                                        {campaignData.quotation_sent ? (
                                                            <input
                                                                type="text"
                                                                value={campaignData.quotation_no || ''}
                                                                onChange={(e) => updateCampaignFollowupData(campaignId, 'quotation_no', e.target.value)}
                                                                className={`w-full border rounded-lg px-2 py-1 text-[11px] ${(campaignData.status === 'completed' || campaignData.status === 'wip') && !campaignData.quotation_no
                                                                    ? 'border-red-500 bg-red-50'
                                                                    : 'border-gray-300'
                                                                    }`}
                                                                style={{ '--tw-ring-color': themeColor }}
                                                                placeholder="Quotation No. *"
                                                            />
                                                        ) : (
                                                            <span className="text-gray-400 text-[11px] text-center block">-</span>
                                                        )}
                                                    </td>
                                                )}

                                                {showQuoteColumnsGlobal && (
                                                    <td className="px-2 py-1.5 border border-gray-300 text-left align-middle">
                                                        {campaignData.quotation_sent ? (
                                                            <input
                                                                type="number"
                                                                value={campaignData.quotation_value || ''}
                                                                onChange={(e) => updateCampaignFollowupData(campaignId, 'quotation_value', e.target.value)}
                                                                className={`w-full border rounded-lg px-2 py-1 text-[11px] ${(campaignData.status === 'completed' || campaignData.status === 'wip') &&
                                                                    (!campaignData.quotation_value || campaignData.quotation_value <= 0)
                                                                    ? 'border-red-500 bg-red-50'
                                                                    : 'border-gray-300'
                                                                    }`}
                                                                style={{ '--tw-ring-color': themeColor }}
                                                                placeholder="Quote Value *"
                                                            />
                                                        ) : (
                                                            <span className="text-gray-400 text-[11px] text-center block">-</span>
                                                        )}
                                                    </td>
                                                )}

                                                <td className="px-2 py-1.5 border border-gray-300 text-left align-middle relative">
                                                    <div className="relative" ref={activeRemarkDropdown === campaignId ? remarkDropdownRef : null}>
                                                        <div className="flex gap-1 items-stretch" id={`remark-input-wrapper-${campaignId}`}>
                                                            <input
                                                                type="text"
                                                                value={campaignData.remark || ''}
                                                                onChange={(e) => updateCampaignFollowupData(campaignId, 'remark', e.target.value)}
                                                                onFocus={(e) => {
                                                                    if (recentRemarks.length > 0) {
                                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                                        setRemarkDropdownPosition({
                                                                            top: rect.bottom + 4,
                                                                            left: rect.left,
                                                                            width: rect.width
                                                                        });
                                                                        setActiveRemarkDropdown(campaignId);
                                                                    }
                                                                }}
                                                                className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-[11px] focus:ring-2 focus:border-transparent transition-all text-left text-black"
                                                                style={{ '--tw-ring-color': themeColor }}
                                                                placeholder="Add detailed remark here..."
                                                            />

                                                            {selectedCampaignsForFollowup.length > 1 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const currentRemark = (campaignData.remark || '').trim();
                                                                        if (!currentRemark) {
                                                                            toast.error('Please enter a remark first');
                                                                            return;
                                                                        }
                                                                        selectedCampaignsForFollowup.forEach(cId => {
                                                                            if (cId !== campaignId) {
                                                                                updateCampaignFollowupData(cId, 'remark', currentRemark);
                                                                            }
                                                                        });
                                                                        toast.success(`Remark applied to all ${selectedCampaignsForFollowup.length} campaigns`);
                                                                    }}
                                                                    className="px-1.5 border border-gray-300 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors flex items-center"
                                                                    title="Apply this remark to all selected drives"
                                                                >
                                                                    <DocumentDuplicateIcon className="h-3 w-3 text-blue-600" />
                                                                </button>
                                                            )}
                                                            {recentRemarks.length > 0 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (activeRemarkDropdown !== campaignId) {
                                                                            const wrapper = document.getElementById(`remark-input-wrapper-${campaignId}`);
                                                                            if (wrapper) {
                                                                                const rect = wrapper.getBoundingClientRect();
                                                                                setRemarkDropdownPosition({
                                                                                    top: rect.bottom + 4,
                                                                                    left: rect.left,
                                                                                    width: rect.width
                                                                                });
                                                                            }
                                                                            setActiveRemarkDropdown(campaignId);
                                                                        } else {
                                                                            setActiveRemarkDropdown(null);
                                                                        }
                                                                    }}
                                                                    className="px-1.5 border border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors flex items-center"
                                                                    title="Pick from recent remarks"
                                                                >
                                                                    <ChevronDownIcon
                                                                        className={`h-3 w-3 text-gray-600 transition-transform ${activeRemarkDropdown === campaignId ? 'rotate-180' : ''}`}
                                                                    />
                                                                </button>
                                                            )}

                                                        </div>

                                                        {/* Recent remarks dropdown */}
                                                        {activeRemarkDropdown === campaignId && recentRemarks.length > 0 && remarkDropdownPosition && (
                                                            <div
                                                                className="bg-white border-2 border-gray-400 rounded-lg overflow-hidden"
                                                                style={{
                                                                    position: 'fixed',
                                                                    top: `${remarkDropdownPosition.top}px`,
                                                                    left: `${remarkDropdownPosition.left}px`,
                                                                    width: `${Math.max(remarkDropdownPosition.width, 280)}px`,
                                                                    maxWidth: '400px',
                                                                    zIndex: 999999,
                                                                    boxShadow: '0 20px 50px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.05)'
                                                                }}
                                                            >
                                                                <div className="px-2 py-1 bg-gradient-to-r from-blue-50 to-gray-50 border-b border-gray-200 flex items-center justify-between">
                                                                    <span className="text-[10px] font-bold text-black uppercase tracking-wide flex items-center gap-1">
                                                                        <ClockIcon className="h-2.5 w-2.5" style={{ color: themeColor }} />
                                                                        Recent Remarks (Last {recentRemarks.length})
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setActiveRemarkDropdown(null)}
                                                                        className="text-gray-400 hover:text-gray-600"
                                                                    >
                                                                        <XMarkIcon className="h-3 w-3" />
                                                                    </button>
                                                                </div>
                                                                <div className="max-h-[200px] overflow-y-auto custom-scrollbar">
                                                                    {recentRemarks.map((remark, idx) => (
                                                                        <button
                                                                            key={idx}
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                updateCampaignFollowupData(campaignId, 'remark', remark);
                                                                                setActiveRemarkDropdown(null);
                                                                            }}
                                                                            className="w-full text-left px-2 py-1.5 text-[11px] text-black hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors group flex items-start gap-1.5"
                                                                            title="Click to use this remark"
                                                                        >
                                                                            <span
                                                                                className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white mt-0.5"
                                                                                style={{ backgroundColor: themeColor }}
                                                                            >
                                                                                {idx + 1}
                                                                            </span>
                                                                            <span className="flex-1 break-words leading-tight group-hover:text-blue-700">
                                                                                {remark}
                                                                            </span>
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Tooltip for long remarks (only shows when dropdown is closed) */}
                                                    {activeRemarkDropdown !== campaignId && remarkText && remarkText.length > 30 && (
                                                        <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block z-40">
                                                            <div className="bg-black text-white text-[11px] rounded-md px-2 py-1 whitespace-normal max-w-[300px] break-words shadow-lg">
                                                                {remarkText}
                                                                <div className="absolute left-2 top-full border-4 border-transparent border-t-black"></div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Form Actions */}
                    <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                        <button
                            type="button"
                            onClick={() => {
                                setShowFollowupForm(false);
                                setSelectedCampaignsForFollowup([]);
                                setCampaignFollowupData({});
                                setActiveCampaignTab(null);
                                setCommonFollowupBy('call');
                                setCommonFollowupFlag('');
                                setCommonNextFollowupDate('');
                                setCampaignPdfs([]);
                                setSelectedPdf(null);
                                setShowPdfViewer(false);
                            }}
                            className="px-3 py-1.5 border border-gray-300 rounded-lg text-[11px] font-medium text-black hover:bg-gray-50"
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmitFollowup}
                            disabled={loading || selectedCampaignsForFollowup.length === 0}
                            className="px-3 py-1.5 text-white rounded-lg text-[11px] font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                            style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                        >
                            {loading && <ArrowPathIcon className="h-3 w-3 animate-spin" />}
                            Save {selectedCampaignsForFollowup.length} Follow-up(s)
                        </button>
                    </div>
                </div>

                {/* Follow-ups Section with Activity and RR Buttons */}
                <div className="bg-white rounded-xl shadow-lg p-3 sm:p-4 mb-3 sm:mb-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2 sm:mb-3">
                        <h2 className="text-sm sm:text-base font-semibold flex items-center gap-2">
                            <MdOutlineFollowTheSigns className="h-3 w-3 sm:h-4 sm:w-4" style={{ color: themeColor }} />
                            Follow-up Details
                        </h2>
                    </div>

                    {/* Filter Bar for Follow-up History */}
                    <div className="mb-3 p-2 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                            <div>
                                <label className="block text-[11px] font-semibold text-black mb-0.5 text-center">Date</label>
                                <input
                                    type="date"
                                    value={followupFilters.date}
                                    onChange={(e) => setFollowupFilters({ ...followupFilters, date: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-[11px] focus:ring-2 focus:ring-opacity-50 text-black"
                                    style={{ '--tw-ring-color': themeColor }}
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-black mb-0.5 text-center">Drive</label>
                                <select
                                    value={followupFilters.campaign}
                                    onChange={(e) => setFollowupFilters({ ...followupFilters, campaign: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-[11px] focus:ring-2 focus:ring-opacity-50 text-black"
                                    style={{ '--tw-ring-color': themeColor }}
                                >
                                    <option value="">All Drives</option>
                                    {[...new Set(customerFollowups
                                        .filter(followup => followup.campaign_name)
                                        .map(followup => followup.campaign_name)
                                    )].map((campaignName, index) => (
                                        <option key={index} value={campaignName}>
                                            {campaignName}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-black mb-0.5 text-center">Service/Product</label>
                                <input
                                    type="text"
                                    value={followupFilters.service}
                                    onChange={(e) => setFollowupFilters({ ...followupFilters, service: e.target.value })}
                                    placeholder="Search service..."
                                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-[11px] focus:ring-2 focus:ring-opacity-50 text-black"
                                    style={{ '--tw-ring-color': themeColor }}
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-black mb-0.5 text-center">Employee</label>
                                <input
                                    type="text"
                                    value={followupFilters.user}
                                    onChange={(e) => setFollowupFilters({ ...followupFilters, user: e.target.value })}
                                    placeholder="Search employee..."
                                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-[11px] focus:ring-2 focus:ring-opacity-50 text-black"
                                    style={{ '--tw-ring-color': themeColor }}
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-black mb-0.5 text-center">Follow-up By</label>
                                <select
                                    value={followupFilters.followupBy}
                                    onChange={(e) => setFollowupFilters({ ...followupFilters, followupBy: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-[11px] focus:ring-2 focus:ring-opacity-50 text-black"
                                    style={{ '--tw-ring-color': themeColor }}
                                >
                                    <option value="">All Methods</option>
                                    <option value="call">Call</option>
                                    <option value="whatsapp">WhatsApp</option>
                                    <option value="email">Email</option>
                                    <option value="visit">Visit</option>
                                </select>
                            </div>
                        </div>

                        {(followupFilters.date || followupFilters.campaign || followupFilters.service ||
                            followupFilters.user || followupFilters.followupBy) && (
                                <div className="mt-1.5 flex justify-end">
                                    <button
                                        onClick={() => setFollowupFilters({
                                            date: '',
                                            campaign: '',
                                            service: '',
                                            user: '',
                                            followupBy: ''
                                        })}
                                        className="text-[11px] px-1.5 py-0.5 text-red-600 hover:text-red-900 flex items-center gap-0.5"
                                    >
                                        <XMarkIcon className="h-2.5 w-2.5" />
                                        Clear Filters
                                    </button>
                                </div>
                            )}
                    </div>

                    {/* Follow-up Details Modal */}
                    {showFollowupDetails && selectedFollowup && (
                        <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center z-50 p-3">
                            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                                <div className="p-3 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
                                    <h3 className="text-base font-semibold" style={{ color: "black" }}>
                                        Follow-up Details
                                    </h3>
                                    <button
                                        onClick={() => {
                                            setShowFollowupDetails(false);
                                            setSelectedFollowup(null);
                                        }}
                                        className="text-black hover:text-gray-600"
                                    >
                                        <XMarkIcon className="h-4 w-4" />
                                    </button>
                                </div>
                                <div className="p-3 space-y-2">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[11px] text-black">Date</label>
                                            <p className="font-medium text-[11px] text-black">{formatDateTime(selectedFollowup.followup_date)}</p>
                                        </div>
                                        <div>
                                            <label className="text-[11px] text-black">Drive</label>
                                            <p className="font-medium text-[11px]" style={{ color: "black" }}>
                                                {selectedFollowup.campaign_name || '-'}
                                            </p>
                                        </div>
                                        {selectedFollowup.csp_subtype && (
                                            <div>
                                                <label className="text-[11px] text-black">Subtype</label>
                                                <p className="font-medium text-[11px] text-black">{selectedFollowup.csp_subtype}</p>
                                            </div>
                                        )}
                                        <div>
                                            <label className="text-[11px] text-black">Follow-up By</label>
                                            <p className="font-medium text-[11px] capitalize text-black">{selectedFollowup.followup_by || '-'}</p>
                                        </div>
                                        <div className="flex flex-col items-start text-left">
                                            <label className="text-[11px] text-black">Flag</label>
                                            <p className="font-medium text-[11px] capitalize text-black">{selectedFollowup.followup_flag || '-'}</p>
                                        </div>
                                        <div>
                                            <label className="text-[11px] text-black">Status</label>
                                            <p className="font-medium text-[11px] capitalize text-black">{selectedFollowup.status === 'rescheduled' ? 'Rescheduled (FR)' : selectedFollowup.status === 'not_connected' ? 'Not Connected (NC)' : selectedFollowup.status || '-'}</p>
                                        </div>
                                        <div>
                                            <label className="text-[11px] text-black">Next Follow-up</label>
                                            <p className="font-medium text-[11px] text-black">{formatDate(selectedFollowup.next_followup_date)}</p>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[11px] text-black">Remark</label>
                                        <p className="font-medium text-[11px] p-1.5 pl-0 rounded text-black">{selectedFollowup.followup_remark || '-'}</p>
                                    </div>

                                    {selectedFollowup.quotation_sent && (
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="text-[11px] text-black">Quotation No.</label>
                                                <p className="font-medium text-[11px] text-black">{selectedFollowup.quotation_no || '-'}</p>
                                            </div>
                                            <div>
                                                <label className="text-[11px] text-black">Quotation Value</label>
                                                <p className="font-medium text-[11px] text-black">₹{selectedFollowup.quotation_value || '0'}</p>
                                            </div>
                                        </div>
                                    )}

                                    {selectedFollowup.activity_content && (
                                        <div>
                                            <label className="text-[11px] text-black">Activity</label>
                                            <p className="font-medium text-[11px] p-1.5 pl-0 rounded text-black">{selectedFollowup.activity_content}</p>
                                        </div>
                                    )}

                                    {selectedFollowup.rr_content && (
                                        <div>
                                            <label className="text-[11px] text-black">RR</label>
                                            <p className="font-medium text-[11px] bg-green-50 p-1.5 rounded text-black">{selectedFollowup.rr_content}</p>
                                        </div>
                                    )}

                                    <div>
                                        <label className="text-[11px] text-black">Created By</label>
                                        <p className="font-medium text-[11px] text-black">{selectedFollowup.user_name} (ID: {selectedFollowup.user_id})</p>
                                    </div>
                                    <div>
                                        <label className="text-[11px] text-black">Created At</label>
                                        <p className="font-medium text-[11px] text-black">{formatDateTime(selectedFollowup.created_at)}</p>
                                    </div>
                                </div>
                                <div className="p-3 border-t border-gray-200 flex justify-end gap-2">
                                    {canEditFollowup(selectedFollowup) && (
                                        <button
                                            onClick={() => handleEditFollowup(selectedFollowup)}
                                            className="px-3 py-1.5 text-white rounded-lg text-[11px] font-medium hover:opacity-90 flex items-center gap-1.5"
                                            style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                                        >
                                            <PencilIcon className="h-3 w-3" />
                                            Edit
                                        </button>
                                    )}
                                    <button
                                        onClick={() => {
                                            setShowFollowupDetails(false);
                                            setSelectedFollowup(null);
                                        }}
                                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-[11px] font-medium hover:bg-gray-50 text-black"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="overflow-x-auto overflow-y-auto max-h-[400px] custom-scrollbar">
                        <table className="w-full min-w-[1500px] border-collapse">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr className="border-b border-gray-200">
                                    <th className="px-2 py-1.5 text-center text-[11px] font-medium text-black border-r border-gray-200 whitespace-nowrap">Date</th>
                                    <th className="px-2 py-1.5 text-center text-[11px] font-medium text-black border-r border-gray-200 whitespace-nowrap">Drive</th>
                                    <th className="px-2 py-1.5 text-center text-[11px] font-medium text-black border-r border-gray-200 whitespace-nowrap">Drive Status</th>
                                    <th className="px-2 py-1.5 text-center text-[11px] font-medium text-black border-r border-gray-200 whitespace-nowrap">Service/Product</th>
                                    <th className="px-2 py-1.5 text-center text-[11px] font-medium text-black border-r border-gray-200 whitespace-nowrap">Subtype</th>
                                    <th className="px-2 py-1.5 text-center text-[11px] font-medium text-black border-r border-gray-200 whitespace-nowrap">Employee</th>
                                    <th className="px-2 py-1.5 text-center text-[11px] font-medium text-black border-r border-gray-200 whitespace-nowrap">Follow-up By</th>
                                    <th className="px-2 py-1.5 text-center text-[11px] font-medium text-black border-r border-gray-200 whitespace-nowrap">Flag</th>
                                    <th className="px-2 py-1.5 text-center text-[11px] font-medium text-black border-r border-gray-200 whitespace-nowrap w-[150px]">Remark</th>
                                    <th className="px-2 py-1.5 text-center text-[11px] font-medium text-black border-r border-gray-200 whitespace-nowrap">Status</th>
                                    <th className="px-2 py-1.5 text-center text-[11px] font-medium text-black border-r border-gray-200 whitespace-nowrap">Next Follow-up</th>
                                    <th className="px-2 py-1.5 text-center text-[11px] font-medium text-black border-r border-gray-200 whitespace-nowrap">Quote Sent</th>
                                    <th className="px-2 py-1.5 text-center text-[11px] font-medium text-black border-r border-gray-200 whitespace-nowrap">Quote No.</th>
                                    <th className="px-2 py-1.5 text-center text-[11px] font-medium text-black border-r border-gray-200 whitespace-nowrap">Quote Value</th>
                                    <th className="px-2 py-1.5 text-center text-[11px] font-medium text-black whitespace-nowrap">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {customerFollowups
                                    .filter(followup => {
                                        if (followupFilters.date) {
                                            const followupDate = new Date(followup.followup_date).toISOString().split('T')[0];
                                            if (followupDate !== followupFilters.date) return false;
                                        }
                                        if (followupFilters.campaign && followup.campaign_name) {
                                            if (!followup.campaign_name.toLowerCase().includes(followupFilters.campaign.toLowerCase())) return false;
                                        }
                                        if (followupFilters.service) {
                                            const campaign = customerCampaigns.find(c => c.id === followup.campaign_id);
                                            const service = campaign?.service || '';
                                            if (!service.toLowerCase().includes(followupFilters.service.toLowerCase())) return false;
                                        }
                                        if (followupFilters.user && followup.user_name) {
                                            if (!followup.user_name.toLowerCase().includes(followupFilters.user.toLowerCase())) return false;
                                        }
                                        if (followupFilters.followupBy && followup.followup_by !== followupFilters.followupBy) return false;
                                        return true;
                                    })
                                    .map((followup) => {
                                        const editable = canEditFollowup(followup);
                                        const campaign = customerCampaigns.find(c => c.id === followup.campaign_id);
                                        const remarkText = followup.followup_remark || '-';
                                        return (
                                            <tr key={followup.id} className="hover:bg-gray-50 border-b border-gray-100">
                                                <td className="px-2 py-1.5 text-center text-[11px] whitespace-nowrap text-black border-r border-gray-100">{formatDate(followup.followup_date)}</td>
                                                <td className="px-2 py-1.5 text-center text-[11px] whitespace-nowrap border-r border-gray-100">
                                                    <span style={{ color: "black" }}>
                                                        {followup.campaign_name ? highlightText(followup.campaign_name, followupFilters.campaign) : '-'}
                                                    </span>
                                                </td>
                                                <td className="px-2 py-1.5 text-center text-[11px] whitespace-nowrap border-r border-gray-100">
                                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${followup.campaign_status === 'active'
                                                        ? 'text-black'
                                                        : followup.campaign_status === 'inactive'
                                                            ? 'text-black'
                                                            : 'text-black'
                                                        }`}>
                                                        {followup.campaign_status === 'active' ? 'Active' : followup.campaign_status === 'inactive' ? 'Inactive' : '-'}
                                                    </span>
                                                </td>
                                                <td className="px-2 py-1.5 text-center text-[11px] whitespace-nowrap text-black border-r border-gray-100">
                                                    {highlightText(followup.campaign_service || followup.campaign_name || '-', followupFilters.service)}
                                                </td>
                                                <td className="px-2 py-1.5 text-center text-[11px] whitespace-nowrap text-black border-r border-gray-100">
                                                    {followup.csp_subtype || '-'}
                                                </td>
                                                <td className="px-2 py-1.5 text-center text-[11px] whitespace-nowrap text-black border-r border-gray-100">{followup.user_name ? highlightText(followup.user_name, followupFilters.user) : '-'}</td>
                                                <td className="px-2 py-1.5 text-center text-[11px] whitespace-nowrap capitalize text-black border-r border-gray-100">{followup.followup_by || '-'}</td>
                                                <td className="px-2 py-1.5 text-center text-[11px] whitespace-nowrap border-r border-gray-100">
                                                    {followup.followup_flag && (
                                                        <span className={`px-1.5 py-0.5 rounded-full text-[11px] ${getFlagBadgeClass(followup.followup_flag)}`}>
                                                            {followup.followup_flag}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-2 py-1.5 text-center text-[11px] max-w-[150px] truncate text-black border-r border-gray-100 relative group">
                                                    <span className="cursor-help block truncate" title={remarkText !== '-' ? remarkText : ''}>
                                                        {remarkText}
                                                    </span>
                                                    {remarkText !== '-' && remarkText.length > 20 && (
                                                        <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block z-50">
                                                            <div className="bg-black text-white text-[11px] rounded-md px-2 py-1 whitespace-normal max-w-[300px] break-words">
                                                                {remarkText}
                                                                <div className="absolute left-2 top-full border-4 border-transparent border-t-black"></div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-2 py-1.5 text-center whitespace-nowrap border-r border-gray-100">
                                                    <span className={`px-1.5 py-0.5 rounded-full text-[11px] capitalize ${getStatusBadgeClass(followup.status)}`}>
                                                        {followup.status === 'not_connected' ? 'Not Connected' : followup.status}
                                                    </span>
                                                </td>
                                                <td className="px-2 py-1.5 text-center text-[11px] whitespace-nowrap text-black border-r border-gray-100">{formatDate(followup.next_followup_date)}</td>
                                                <td className="px-2 py-1.5 text-center text-[11px] whitespace-nowrap border-r border-gray-100">
                                                    {followup.quotation_sent ? (
                                                        <span className="text-green-600 font-semibold">Yes</span>
                                                    ) : (
                                                        <span className="text-red-500">No</span>
                                                    )}
                                                </td>
                                                <td className="px-2 py-1.5 text-center text-[11px] whitespace-nowrap border-r border-gray-100">
                                                    <span className="text-black" title={followup.quotation_no || '-'}>
                                                        {followup.quotation_no || '-'}
                                                    </span>
                                                </td>
                                                <td className="px-2 py-1.5 text-center text-[11px] whitespace-nowrap border-r border-gray-100">
                                                    <span className="text-black">
                                                        {followup.quotation_value ? `₹${parseFloat(followup.quotation_value).toLocaleString('en-IN')}` : '-'}
                                                    </span>
                                                </td>
                                                <td className="px-2 py-1.5 text-center whitespace-nowrap">
                                                    <div className="flex gap-1 justify-center">
                                                        <button
                                                            onClick={() => handleViewFollowup(followup)}
                                                            className="p-0.5 hover:bg-gray-100 rounded-lg"
                                                            title="View details"
                                                        >
                                                            <EyeIcon className="h-3 w-3 text-black" />
                                                        </button>
                                                        {editable && (
                                                            <button
                                                                onClick={() => handleEditFollowup(followup)}
                                                                className="p-0.5 hover:bg-gray-100 rounded-lg"
                                                                title="Edit follow-up"
                                                            >
                                                                <PencilIcon className="h-3 w-3" style={{ color: themeColor }} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                {followupFilters.date || followupFilters.campaign || followupFilters.service ||
                                    followupFilters.user || followupFilters.followupBy ? (
                                    customerFollowups.filter(followup => {
                                        if (followupFilters.date) {
                                            const followupDate = new Date(followup.followup_date).toISOString().split('T')[0];
                                            if (followupDate !== followupFilters.date) return false;
                                        }
                                        if (followupFilters.campaign && followup.campaign_name) {
                                            if (!followup.campaign_name.toLowerCase().includes(followupFilters.campaign.toLowerCase())) return false;
                                        }
                                        if (followupFilters.service) {
                                            const campaign = customerCampaigns.find(c => c.id === followup.campaign_id);
                                            const service = campaign?.service || '';
                                            if (!service.toLowerCase().includes(followupFilters.service.toLowerCase())) return false;
                                        }
                                        if (followupFilters.user && followup.user_name) {
                                            if (!followup.user_name.toLowerCase().includes(followupFilters.user.toLowerCase())) return false;
                                        }
                                        if (followupFilters.followupBy && followup.followup_by !== followupFilters.followupBy) return false;
                                        return true;
                                    }).length === 0 && (
                                        <tr>
                                            <td colSpan="15" className="px-2 py-3 text-center text-[11px] text-black">
                                                No follow-ups match the selected filters
                                            </td>
                                        </tr>
                                    )
                                ) : customerFollowups.length === 0 && (
                                    <tr>
                                        <td colSpan="15" className="px-2 py-3 text-center text-[11px] text-black">
                                            No follow-ups found
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Letter History — admin only */}
                {isAdmin && (
                    <div className="bg-white rounded-xl shadow-lg p-3 sm:p-4 mb-3 sm:mb-4">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm sm:text-base font-semibold flex items-center gap-2">
                                <PaperAirplaneIcon className="h-3 w-3 sm:h-4 sm:w-4" style={{ color: themeColor }} />
                                Letter History
                            </h2>
                            {letterHistoryLoading && (
                                <span className="text-[11px] text-gray-400 flex items-center gap-1">
                                    <ArrowPathIcon className="h-3 w-3 animate-spin" /> Loading…
                                </span>
                            )}
                        </div>

                        <div className="overflow-x-auto overflow-y-auto max-h-[360px] custom-scrollbar">
                            <table className="w-full min-w-[800px] border-collapse">
                                <thead className="bg-gray-50 sticky top-0">
                                    <tr className="border-b border-gray-200">
                                        <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border-r border-gray-200 whitespace-nowrap">Ref No</th>
                                        <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border-r border-gray-200 whitespace-nowrap">Format Type</th>
                                        <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border-r border-gray-200 whitespace-nowrap">Channels</th>
                                        <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border-r border-gray-200 whitespace-nowrap">Date</th>
                                        <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border-r border-gray-200 whitespace-nowrap">Sent By</th>
                                        <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border-r border-gray-200 whitespace-nowrap">Status</th>
                                        <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black whitespace-nowrap">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {letterHistory.map((lt) => {
                                        const isDraft = lt.status === 'draft';
                                        const statusStyle =
                                            lt.status === 'sent' ? 'bg-green-100 text-green-700'
                                                : lt.status === 'draft' ? 'bg-amber-100 text-amber-700'
                                                    : lt.status === 'partial' ? 'bg-orange-100 text-orange-700'
                                                        : 'bg-red-100 text-red-700';
                                        const chs = lt.channels || [];
                                        return (
                                            <tr key={lt.id} className="hover:bg-gray-50 border-b border-gray-100">
                                                <td className="px-2 py-1.5 text-center text-[11px] whitespace-nowrap border-r border-gray-100">
                                                    {isDraft ? (
                                                        <button
                                                            onClick={() => openLetterDraft(lt.id)}
                                                            className="font-semibold underline hover:opacity-80"
                                                            style={{ color: themeColor }}
                                                            title="Open draft to edit & send"
                                                        >
                                                            {lt.ref_no}
                                                        </button>
                                                    ) : (
                                                        <span className="font-semibold text-black" title="Already sent">{lt.ref_no}</span>
                                                    )}
                                                </td>
                                                <td className="px-2 py-1.5 text-center text-[11px] text-black border-r border-gray-100">{lt.format_type_name || '-'}</td>
                                                <td className="px-2 py-1.5 text-center text-[11px] border-r border-gray-100">
                                                    <div className="flex gap-1 justify-center flex-wrap">
                                                        {chs.length === 0 && <span className="text-gray-400">-</span>}
                                                        {chs.includes('email') && (
                                                            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] ${lt.sent_email ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                                                                <EnvelopeIcon className="h-2.5 w-2.5" /> Email
                                                            </span>
                                                        )}
                                                        {chs.includes('whatsapp') && (
                                                            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] ${lt.sent_whatsapp ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                                                <ChatBubbleLeftRightIcon className="h-2.5 w-2.5" /> WhatsApp
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-2 py-1.5 text-center text-[11px] text-black border-r border-gray-100 whitespace-nowrap">{formatDateTime(lt.created_at)}</td>
                                                <td className="px-2 py-1.5 text-center text-[11px] text-black border-r border-gray-100 whitespace-nowrap">
                                                    {lt.sent_by_name || '-'}{lt.sent_by_id ? ` (${lt.sent_by_id})` : ''}
                                                </td>
                                                <td className="px-2 py-1.5 text-center text-[11px] border-r border-gray-100">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${statusStyle}`}>
                                                        {lt.status || '-'}
                                                    </span>
                                                </td>
                                                <td className="px-2 py-1.5 text-center whitespace-nowrap">
                                                    <button
                                                        onClick={() => viewLetterRecord(lt.id)}
                                                        className="p-0.5 hover:bg-gray-100 rounded-lg"
                                                        title="View letter PDF"
                                                    >
                                                        <EyeIcon className="h-3.5 w-3.5" style={{ color: themeColor }} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {letterHistory.length === 0 && !letterHistoryLoading && (
                                        <tr>
                                            <td colSpan="7" className="px-2 py-3 text-center text-[11px] text-gray-500">
                                                No letters yet for this customer
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* PDF Chat Panel */}
                {showPdfViewer && pdfViewerCampaign && (
                    <div
                        className={`fixed z-50 transition-all duration-300 ease-in-out ${isDragging ? 'cursor-grabbing' : ''
                            } ${isPdfPanelMinimized
                                ? 'w-48 sm:w-72 h-12'
                                : `${pdfPanelWidth} h-[400px] sm:h-[450px] md:h-[500px] lg:h-[550px]`
                            }`}
                        style={{
                            left: `${Math.min(Math.max(panelPosition.x, 0), window.innerWidth - (isPdfPanelMinimized ? 192 : 320))}px`,
                            top: `${Math.min(Math.max(panelPosition.y, 0), window.innerHeight - (isPdfPanelMinimized ? 48 : 400))}px`,
                        }}
                    >
                        <div
                            className="bg-white rounded-t-xl shadow-lg border border-gray-200 cursor-move flex items-center justify-between p-2 sm:p-3 select-none"
                            style={{
                                borderBottom: isPdfPanelMinimized ? 'none' : `2px solid ${pdfViewerCampaign.color || themeColor}`,
                                cursor: isDragging ? 'grabbing' : 'grab'
                            }}
                            onMouseDown={handleDragStart}
                            onTouchStart={handleDragStart}
                        >
                            <div className="flex items-center gap-1 sm:gap-2 overflow-hidden flex-1 min-w-0">
                                <DocumentTextIcon className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" style={{ color: pdfViewerCampaign.color || themeColor }} />
                                <span className="font-medium text-xs sm:text-sm truncate" style={{ color: pdfViewerCampaign.color || themeColor }}>
                                    {pdfViewerCampaign.name} - Scripts
                                </span>
                                {campaignPdfs.length > 0 && (
                                    <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                        {currentPdfIndex + 1}/{campaignPdfs.length}
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
                                {/* Increase Size Button */}
                                {!isPdfPanelMinimized && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleTogglePdfSize();
                                        }}
                                        className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
                                        title={isPdfPanelExpanded ? "Reduce Size" : "Increase Size"}
                                    >
                                        <svg
                                            className="h-3 w-3 sm:h-4 sm:w-4"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d={isPdfPanelExpanded
                                                    ? "M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                                                    : "M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"
                                                }
                                            />
                                        </svg>
                                    </button>
                                )}

                                {!isPdfPanelMinimized && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleClosePdfPanel();
                                        }}
                                        className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600"
                                    >
                                        <XMarkIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                                    </button>
                                )}

                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleMinimizePanel();
                                    }}
                                    className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600"
                                >
                                    <ChevronDownIcon
                                        className={`h-4 w-4 sm:h-5 sm:w-5 transition-transform duration-200 ${isPdfPanelMinimized ? 'rotate-180' : ''
                                            }`}
                                    />
                                </button>
                            </div>
                        </div>

                        {!isPdfPanelMinimized && (
                            <div className="bg-white rounded-b-xl shadow-lg border-x border-b border-gray-200 overflow-hidden flex flex-col h-[calc(100%-48px)]">
                                {/* PDF Tabs - Scrollable on mobile */}
                                {campaignPdfs.length > 1 && (
                                    <div className="p-1 sm:p-2 border-b border-gray-200 overflow-x-auto" style={{ scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}>
                                        <div className="flex gap-1 min-w-max">
                                            {campaignPdfs.map((pdf, index) => (
                                                <button
                                                    key={index}
                                                    type="button"
                                                    onClick={() => {
                                                        setCurrentPdfIndex(index);
                                                        setSelectedPdf(pdf);
                                                    }}
                                                    className={`px-1.5 sm:px-2 py-1 text-[11px] sm:text-xs whitespace-nowrap rounded ${currentPdfIndex === index
                                                        ? "bg-gray-200 text-gray-900 font-medium"
                                                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                                        }`}
                                                >
                                                    {pdf.name?.length > 30 ? pdf.name.substring(0, 27) + '...' : pdf.name || `PDF ${index + 1}`}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* PDF Navigation Bar */}
                                {campaignPdfs.length > 0 && (
                                    <div className="flex items-center justify-between p-1.5 sm:p-2 bg-gray-50 border-b border-gray-200">
                                        <button
                                            onClick={handlePrevPdf}
                                            disabled={currentPdfIndex === 0}
                                            className="p-1 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                                            aria-label="Previous PDF"
                                        >
                                            <ChevronLeftIconSmall className="h-3 w-3 sm:h-4 sm:w-4" />
                                        </button>

                                        <span className="text-[10px] sm:text-xs font-medium truncate max-w-[120px] sm:max-w-[200px] md:max-w-[300px]">
                                            {selectedPdf?.name?.length > 40 ? selectedPdf.name.substring(0, 37) + '...' : selectedPdf?.name || `PDF ${currentPdfIndex + 1}`}
                                        </span>

                                        <button
                                            onClick={handleNextPdf}
                                            disabled={currentPdfIndex === campaignPdfs.length - 1}
                                            className="p-1 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                                            aria-label="Next PDF"
                                        >
                                            <ChevronRightIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                                        </button>
                                    </div>
                                )}

                                {/* PDF Viewer Area */}
                                <div className="flex-1 overflow-auto bg-gray-100 p-1 sm:p-2">
                                    {selectedPdf ? (
                                        <div className="h-full flex flex-col">
                                            <div className="flex-1 border rounded-lg overflow-hidden bg-white">
                                                <iframe
                                                    src={`data:application/pdf;base64,${selectedPdf.content}#toolbar=0&navpanes=0&scrollbar=1&zoom=page-fit&print=0&download=0`}
                                                    className="w-full h-full min-h-[250px] sm:min-h-[300px]"
                                                    title="PDF Viewer"
                                                    style={{ touchAction: 'pan-y pinch-zoom' }}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-center p-4">
                                            <DocumentTextIcon className="h-8 w-8 sm:h-12 sm:w-12 text-gray-300 mb-2" />
                                            <p className="text-[10px] sm:text-xs text-gray-500 text-center">
                                                {campaignPdfs.length === 0
                                                    ? 'No PDF scripts available for this drive'
                                                    : 'Select a PDF from above to view'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Activity Modal */}
                {showActivityModal && isAdmin && (
                    <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center z-50 p-3">
                        <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                            <div className="p-3 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
                                <h3
                                    className="text-base font-semibold"
                                    style={{ color: "black" }}
                                >
                                    {editingActivity ? "Edit Activity" : "Add New Activity"}
                                </h3>
                                <button
                                    onClick={() => {
                                        setShowActivityModal(false);
                                        setEditingActivity(null);
                                        setActivityInput("");
                                    }}
                                    className="text-gray-400 hover:text-gray-600"
                                >
                                    <XMarkIcon className="h-4 w-4" />
                                </button>
                            </div>
                            <div className="p-3">
                                <textarea
                                    value={activityInput}
                                    onChange={(e) => setActivityInput(e.target.value)}
                                    placeholder="Enter activity details..."
                                    className="w-full border border-gray-300 rounded-lg p-2 text-xs focus:ring-2 min-h-[100px]"
                                    style={{ "--tw-ring-color": themeColor }}
                                    autoFocus
                                />
                            </div>
                            <div className="p-3 border-t border-gray-200 flex justify-end gap-2">
                                <button
                                    onClick={() => {
                                        setShowActivityModal(false);
                                        setEditingActivity(null);
                                        setActivityInput("");
                                    }}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveActivity}
                                    className="px-3 py-1.5 text-white rounded-lg text-xs font-medium hover:opacity-90"
                                    style={{
                                        background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})`,
                                    }}
                                >
                                    {editingActivity ? "Update" : "Save"}
                                </button>
                            </div>

                            {activities.length > 0 && (
                                <div className="p-3 border-t border-gray-200">
                                    <h4 className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                                        <DocumentTextIcon
                                            className="h-3.5 w-3.5"
                                            style={{ color: themeColor }}
                                        />
                                        Recent Activities
                                    </h4>
                                    <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                                        {activities.map((activity) => (
                                            <div
                                                key={activity.id}
                                                className="bg-gray-50 rounded-lg p-1.5 border border-gray-200 flex justify-between items-start"
                                            >
                                                <p className="text-[11px] text-gray-700 flex-1 mr-2">
                                                    {activity.content}
                                                </p>
                                                <div className="flex gap-0.5 shrink-0">
                                                    <button
                                                        onClick={() => handleEditActivity(activity)}
                                                        className="p-0.5 hover:bg-gray-200 rounded"
                                                    >
                                                        <PencilIcon
                                                            className="h-2.5 w-2.5"
                                                            style={{ color: themeColor }}
                                                        />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteActivity(activity.id)}
                                                        className="p-0.5 hover:bg-gray-200 rounded"
                                                    >
                                                        <XMarkIcon className="h-2.5 w-2.5 text-red-500" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* RR Modal */}
                {showRRModal && isAdmin && (
                    <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center z-50 p-3">
                        <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                            <div className="p-3 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
                                <h3
                                    className="text-base font-semibold"
                                    style={{ color: "black" }}
                                >
                                    {editingRR ? "Edit Rejected Reason" : "Add New Rejected Reason"}
                                </h3>
                                <button
                                    onClick={() => {
                                        setShowRRModal(false);
                                        setEditingRR(null);
                                        setRRInput("");
                                    }}
                                    className="text-gray-400 hover:text-gray-600"
                                >
                                    <XMarkIcon className="h-4 w-4" />
                                </button>
                            </div>
                            <div className="p-3">
                                <textarea
                                    value={rrInput}
                                    onChange={(e) => setRRInput(e.target.value)}
                                    placeholder="Enter Rejected Reason details..."
                                    className="w-full border border-gray-300 rounded-lg p-2 text-xs focus:ring-2 min-h-[100px]"
                                    style={{ "--tw-ring-color": themeColor }}
                                    autoFocus
                                />
                            </div>
                            <div className="p-3 border-t border-gray-200 flex justify-end gap-2">
                                <button
                                    onClick={() => {
                                        setShowRRModal(false);
                                        setEditingRR(null);
                                        setRRInput("");
                                    }}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveRR}
                                    className="px-3 py-1.5 text-white rounded-lg text-xs font-medium hover:opacity-90"
                                    style={{
                                        background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})`,
                                    }}
                                >
                                    {editingRR ? "Update" : "Save"}
                                </button>
                            </div>

                            {rrList.length > 0 && (
                                <div className="p-3 border-t border-gray-200">
                                    <h4 className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                                        <DocumentTextIcon
                                            className="h-3.5 w-3.5"
                                            style={{ color: themeColor }}
                                        />
                                        Recent Rejected Reasons
                                    </h4>
                                    <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                                        {rrList.map((rr) => (
                                            <div
                                                key={rr.id}
                                                className="bg-gray-50 rounded-lg p-1.5 border border-gray-200 flex justify-between items-start"
                                            >
                                                <p className="text-[11px] text-gray-700 flex-1 mr-2">
                                                    {rr.content}
                                                </p>
                                                <div className="flex gap-0.5 shrink-0">
                                                    <button
                                                        onClick={() => handleEditRR(rr)}
                                                        className="p-0.5 hover:bg-gray-200 rounded"
                                                    >
                                                        <PencilIcon
                                                            className="h-2.5 w-2.5"
                                                            style={{ color: themeColor }}
                                                        />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteRR(rr.id)}
                                                        className="p-0.5 hover:bg-gray-200 rounded"
                                                    >
                                                        <XMarkIcon className="h-2.5 w-2.5 text-red-500" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* View Letter (read-only PDF) */}
                {viewLetterHtml && (
                    <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center z-[60] p-3">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
                            <div className="px-4 py-3 flex justify-between items-center border-b border-gray-200"
                                style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>
                                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                    <DocumentTextIcon className="h-4 w-4 text-white" /> Letter
                                </h3>
                                <div className="flex items-center gap-2">
                                    <button onClick={saveViewedLetterPdf}
                                        className="px-2 py-1 bg-white text-[11px] rounded-md font-medium hover:bg-gray-100 flex items-center gap-1"
                                        style={{ color: themeColor }}>
                                        <ArrowDownTrayIcon className="h-3 w-3" /> Download
                                    </button>
                                    <button onClick={printViewedLetter}
                                        className="px-2 py-1 bg-white text-[11px] rounded-md font-medium hover:bg-gray-100 flex items-center gap-1"
                                        style={{ color: themeColor }}>
                                        <DocumentTextIcon className="h-3 w-3" /> Print
                                    </button>
                                    <button onClick={() => setViewLetterHtml(null)}
                                        className="w-7 h-7 bg-white text-black rounded-lg flex items-center justify-center hover:bg-gray-100">
                                        <XMarkIcon className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-3 bg-gray-50 custom-scrollbar">
                                <div dangerouslySetInnerHTML={{ __html: viewLetterHtml }} />
                            </div>
                        </div>
                    </div>
                )}

                {/* Send Letter Wizard */}
                {/* Send Letter Wizard */}
                {showLetterWizard && (
                    <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-end lg:items-center justify-center z-50 p-2 sm:p-3">
                        <div className="relative bg-white rounded-xl shadow-2xl w-full lg:max-w-4xl max-h-[94vh] overflow-hidden flex flex-col">
                            {/* Loading overlay — spinning circle while the serial number is fetched */}
                            {letterStepLoading && (
                                <div className="absolute inset-0 z-30 bg-white/70 flex items-center justify-center">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="h-10 w-10 rounded-full border-4 border-gray-200 animate-spin" style={{ borderTopColor: themeColor }} />
                                        <span className="text-[11px] font-medium text-gray-600">Loading letter…</span>
                                    </div>
                                </div>
                            )}
                            {/* Header */}
                            <div className="px-4 py-3 flex justify-between items-center"
                                style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>
                                <h3 className="text-sm sm:text-base font-semibold text-white flex items-center gap-2">
                                    <PaperAirplaneIcon className="h-4 w-4 text-white" />
                                    Send Letter
                                </h3>
                                <button onClick={() => !letterSending && setShowLetterWizard(false)}
                                    className="w-7 h-7 bg-white text-black rounded-lg flex items-center justify-center hover:bg-gray-100" disabled={letterSending}>
                                    <XMarkIcon className="h-4 w-4" />
                                </button>
                            </div>

                            {/* Step indicator (3 steps — Customer Details tab removed) */}
                            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                                <div className="flex items-center justify-between max-w-xl mx-auto">
                                    {[
                                        { n: 1, label: 'Format Type' },
                                        { n: 2, label: 'Letter' },
                                        { n: 3, label: 'Review & Send' },
                                    ].map((s, idx) => (
                                        <React.Fragment key={s.n}>
                                            <button type="button"
                                                onClick={() => (s.n < letterStep ? setLetterStep(s.n) : goToLetterStep(s.n))}
                                                className="flex flex-col items-center gap-1 flex-shrink-0">
                                                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${letterStep >= s.n ? 'text-white' : 'bg-gray-200 text-gray-600'}`}
                                                    style={(letterStep >= s.n) ? { backgroundColor: themeColor } : {}}>
                                                    {letterStep > s.n ? '✓' : s.n}
                                                </span>
                                                <span className={`text-[10px] font-medium ${letterStep >= s.n ? 'text-black' : 'text-gray-400'}`}>{s.label}</span>
                                            </button>
                                            {idx < 2 && (
                                                <div className="flex-1 h-0.5 mx-1" style={{ backgroundColor: letterStep > s.n ? themeColor : '#e5e7eb' }} />
                                            )}
                                        </React.Fragment>
                                    ))}
                                </div>
                            </div>

                            {/* Body */}
                            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                                {/* STEP 1 — Format Type */}
                                {letterStep === 1 && (
                                    <div className="space-y-4 max-w-2xl mx-auto">
                                        <div>
                                            <label className="block text-xs font-semibold text-black mb-1">Format Type *</label>
                                            {letterFormatsLoading ? (
                                                <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
                                                    <ArrowPathIcon className="h-4 w-4 animate-spin" style={{ color: themeColor }} /> Loading formats...
                                                </div>
                                            ) : (
                                                <select
                                                    value={selectedLetterFormat?.id || ''}
                                                    onChange={(e) => {
                                                        const fmt = wizardLetterFormats.find(f => String(f.id) === e.target.value);
                                                        if (fmt) selectLetterFormat(fmt); else setSelectedLetterFormat(null);
                                                    }}
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black focus:ring-2"
                                                    style={{ '--tw-ring-color': themeColor }}
                                                >
                                                    <option value="">-- Select a format --</option>
                                                    {wizardLetterFormats.map(f => (
                                                        <option key={f.id} value={f.id}>{f.format_type_name}</option>
                                                    ))}
                                                </select>
                                            )}
                                            {!letterFormatsLoading && wizardLetterFormats.length === 0 && (
                                                <p className="text-[11px] text-red-500 mt-1">No letter formats found. Add one from Drive → Letter Master.</p>
                                            )}
                                        </div>

                                        {selectedLetterFormat && (
                                            <div className="space-y-3">
                                                <div className="border border-gray-200 rounded-lg p-3">
                                                    <p className="text-[11px] font-bold text-black uppercase mb-1.5">Product</p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {(selectedLetterFormat.products || []).length === 0 && <span className="text-xs text-gray-400">None</span>}
                                                        {(selectedLetterFormat.products || []).map((p, i) => (
                                                            <span key={i} className="inline-flex items-center px-2 py-0.5 bg-[#2f3192]/10 text-[#2f3192] rounded text-xs font-medium">{p}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="border border-gray-200 rounded-lg p-3">
                                                    <p className="text-[11px] font-bold text-black uppercase mb-1.5">Reference No</p>
                                                    <span className="text-xs text-black font-mono break-all">{selectedLetterFormat.reference_no || '—'}</span>
                                                </div>
                                                <div className="border border-gray-200 rounded-lg p-3">
                                                    <p className="text-[11px] font-bold text-black uppercase mb-1.5">Customer Detail Fields</p>
                                                    {(selectedLetterFormat.customer_detail_fields || []).length === 0 ? (
                                                        <span className="text-xs text-gray-400">None configured</span>
                                                    ) : (
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {selectedLetterFormat.customer_detail_fields.map((k, i) => (
                                                                <span key={i} className="inline-flex items-center px-2 py-0.5 bg-[#2f3192]/10 text-[#2f3192] rounded text-xs font-medium">
                                                                    {CUSTOMER_FIELD_LABELS[k] || k}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="border border-gray-200 rounded-lg p-3">
                                                    <p className="text-[11px] font-bold text-black uppercase mb-1.5">Engagement Detail Fields</p>
                                                    {(selectedLetterFormat.engagement_detail_fields || []).length === 0 ? (
                                                        <span className="text-xs text-gray-400">None configured</span>
                                                    ) : (
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {selectedLetterFormat.engagement_detail_fields.map((k, i) => {
                                                                const labels = { followup_history: 'Follow-up History', quotation_history: 'Quotation History', letter_history: 'Letter Ref', letterref: 'Letter Ref' };
                                                                return (
                                                                    <span key={i} className="inline-flex items-center px-2 py-0.5 bg-[#2f3192]/10 text-[#2f3192] rounded text-xs font-medium">
                                                                        {labels[(k || '').toLowerCase()] || k}
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="border border-gray-200 rounded-lg p-3">
                                                    <p className="text-[11px] font-bold text-black uppercase mb-1.5">Default Attachments</p>
                                                    {(selectedLetterFormat.default_attachments || []).length === 0 ? (
                                                        <span className="text-xs text-gray-400">None</span>
                                                    ) : (
                                                        <div className="space-y-1">
                                                            {selectedLetterFormat.default_attachments.map((a, i) => (
                                                                <div key={i} className="flex items-center gap-2 text-xs text-black">
                                                                    <DocumentTextIcon className="h-3.5 w-3.5" style={{ color: themeColor }} />
                                                                    <span className="truncate">{a.name}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* STEP 2 — Generated, editable letter */}
                                {letterStep === 2 && (
                                    <div className="space-y-3 max-w-3xl mx-auto">
                                        <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
                                            {/* Header band: single full-width letterhead image */}
                                            {headerImgDataUrl ? (
                                                <img src={headerImgDataUrl} alt={COMPANY_FULL} className="block w-full h-auto" style={{ maxWidth: '780px', margin: '0 auto' }} />
                                            ) : (
                                                <div className="px-4 py-3 border-b-2 text-base font-bold" style={{ borderColor: themeColor, color: themeColor }}>{COMPANY_NAME}</div>
                                            )}

                                            <div className="px-4 sm:px-6 pt-2 pb-4 sm:pb-6">
                                                {/* Ref No (left) + Date (right, editable) */}
                                                <div className="flex items-start justify-between gap-3 mb-4">
                                                    <div className="flex items-center gap-1 text-[11px] flex-1 min-w-0">
                                                        <span className="font-semibold w-16 shrink-0">Ref No:</span>
                                                        <input value={letterFields.ref_no} readOnly disabled
                                                            className="border border-gray-200 rounded px-1.5 py-0.5 text-[11px] flex-1 min-w-0 bg-gray-100 cursor-not-allowed font-mono" />
                                                    </div>
                                                    <div className="flex items-center gap-1 text-[11px] shrink-0">
                                                        <span className="font-semibold shrink-0">Date:</span>
                                                        <input type="date" value={letterFields.date}
                                                            onChange={(e) => setLetterFields(p => ({ ...p, date: e.target.value }))}
                                                            className="border border-gray-300 rounded px-1.5 py-0.5 text-[11px] w-36" />
                                                    </div>
                                                </div>

                                                {/* Customer details (name + instance id locked, rest editable) */}
                                                <div className="space-y-1.5 text-xs mb-3">
                                                    <span className="font-semibold">To,</span>
                                                    <input value={letterFields.to_name} onChange={(e) => setLetterFields(p => ({ ...p, to_name: e.target.value }))}
                                                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs" placeholder="Customer Name" />
                                                    <textarea value={letterFields.to_address} onChange={(e) => setLetterFields(p => ({ ...p, to_address: e.target.value }))}
                                                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs" rows="2" placeholder="Address" />
                                                    {/* References — fields from the format master. Instance ID is locked & permanent;
                                                        every other field is editable and can be removed from THIS letter via the ✕. */}
                                                    <div className="pt-1">
                                                        <label className="text-[10px] text-gray-500 font-semibold">References</label>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                                                            {getLetterReferenceRows()
                                                                .filter(r => !letterRefHiddenFields.includes(r.key))
                                                                .map(r => (
                                                                    <div key={r.key}>
                                                                        <label className="text-[10px] text-gray-500 flex items-center justify-between">
                                                                            <span>{r.label}</span>
                                                                            {r.removable && (
                                                                                <button type="button" title={`Remove "${r.label}" from this letter`}
                                                                                    onClick={() => setLetterRefHiddenFields(prev => [...prev, r.key])}
                                                                                    className="text-gray-400 hover:text-red-600">
                                                                                    <XMarkIcon className="h-3 w-3" />
                                                                                </button>
                                                                            )}
                                                                        </label>
                                                                        {r.editable ? (
                                                                            <input
                                                                                value={letterRefFieldValue(r.key, r.value)}
                                                                                onChange={(e) => setLetterRefFieldValues(prev => ({ ...prev, [r.key]: e.target.value }))}
                                                                                className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-black" />
                                                                        ) : (
                                                                            <input value={letterRefFieldValue(r.key, r.value) || '-'} readOnly disabled
                                                                                className="w-full border border-gray-200 rounded px-2 py-1 text-xs bg-gray-100 cursor-not-allowed" />
                                                                        )}
                                                                    </div>
                                                                ))}
                                                        </div>
                                                        {getLetterReferenceRows().some(r => letterRefHiddenFields.includes(r.key)) && (
                                                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                                                <span className="text-[10px] text-gray-500">Removed:</span>
                                                                {getLetterReferenceRows()
                                                                    .filter(r => letterRefHiddenFields.includes(r.key))
                                                                    .map(r => (
                                                                        <button key={r.key} type="button"
                                                                            onClick={() => setLetterRefHiddenFields(prev => prev.filter(k => k !== r.key))}
                                                                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-dashed border-gray-300 text-[10px] text-gray-600 hover:bg-gray-50">
                                                                            <PlusIcon className="h-2.5 w-2.5" /> {r.label}
                                                                        </button>
                                                                    ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Subject (= format type name, editable) */}
                                                <div className="mb-3">
                                                    <label className="text-[10px] text-gray-500">Subject</label>
                                                    <input value={letterFields.subject} onChange={(e) => setLetterFields(p => ({ ...p, subject: e.target.value }))}
                                                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs font-semibold" />
                                                </div>

                                                <div className="text-xs mb-2">Dear Sir/Madam,</div>

                                                {/* Start para */}
                                                <div className="mb-3">
                                                    <label className="text-[10px] text-gray-500">Start Paragraph</label>
                                                    <textarea value={letterFields.start_para} onChange={(e) => setLetterFields(p => ({ ...p, start_para: e.target.value }))}
                                                        className="w-full border border-gray-200 rounded px-2 py-2 text-xs leading-relaxed" style={{ minHeight: '120px' }} />
                                                </div>

                                                {/* Middle: Follow-up + Quotation + Letter Ref checkboxes */}
                                                <div className="mb-3 border border-dashed border-gray-300 rounded-lg p-3 bg-gray-50 space-y-2">
                                                    <div className="flex flex-wrap items-center gap-4">
                                                        {getAllowedEngagementToggles().followups && (<>
                                                            <label className="flex items-center gap-1.5 text-xs font-medium text-black cursor-pointer">
                                                                <input type="checkbox" checked={includeFollowups}
                                                                    onChange={(e) => {
                                                                        if (e.target.checked) {
                                                                            if (formatFollowups().length === 0) {
                                                                                toast.error('No follow-up records available to include');
                                                                                return; // keep the box unticked
                                                                            }
                                                                            setIncludeFollowups(true);
                                                                            setShowFollowupPicker(true);
                                                                        } else {
                                                                            setIncludeFollowups(false);
                                                                            setSelectedFollowupIds([]);
                                                                        }
                                                                    }}
                                                                    style={{ accentColor: themeColor }} />
                                                                Include Follow-up history
                                                            </label>
                                                            {includeFollowups && (
                                                                <button type="button" onClick={() => setShowFollowupPicker(true)}
                                                                    className="text-[11px] px-2 py-0.5 rounded border" style={{ color: themeColor, borderColor: themeColor }}>
                                                                    Select follow-ups ({selectedFollowupIds.length})
                                                                </button>
                                                            )}
                                                        </>)}

                                                        {getAllowedEngagementToggles().quotations && (<>
                                                            <label className="flex items-center gap-1.5 text-xs font-medium text-black cursor-pointer">
                                                                <input type="checkbox" checked={includeQuotations}
                                                                    onChange={(e) => {
                                                                        if (e.target.checked) {
                                                                            if (quotationFollowups().length === 0) {
                                                                                toast.error('No quotation records available to include');
                                                                                return; // keep the box unticked
                                                                            }
                                                                            setIncludeQuotations(true);
                                                                            setShowQuotationPicker(true);
                                                                        } else {
                                                                            setIncludeQuotations(false);
                                                                            setSelectedQuotationIds([]);
                                                                        }
                                                                    }}
                                                                    style={{ accentColor: themeColor }} />
                                                                Include Quotation
                                                            </label>
                                                            {includeQuotations && (
                                                                <button type="button" onClick={() => setShowQuotationPicker(true)}
                                                                    className="text-[11px] px-2 py-0.5 rounded border" style={{ color: themeColor, borderColor: themeColor }}>
                                                                    Select quotations ({selectedQuotationIds.length})
                                                                </button>
                                                            )}
                                                        </>)}

                                                        {getAllowedEngagementToggles().letterrefs && (<>
                                                            <label className="flex items-center gap-1.5 text-xs font-medium text-black cursor-pointer">
                                                                <input type="checkbox" checked={includeLetterRefs}
                                                                    onChange={(e) => {
                                                                        if (e.target.checked) {
                                                                            if (letterRefOptions().length === 0) {
                                                                                toast.error('No previous letters available to include');
                                                                                return; // keep the box unticked
                                                                            }
                                                                            setIncludeLetterRefs(true);
                                                                            setShowLetterRefPicker(true);
                                                                        } else {
                                                                            setIncludeLetterRefs(false);
                                                                            setSelectedLetterRefIds([]);
                                                                        }
                                                                    }}
                                                                    style={{ accentColor: themeColor }} />
                                                                Include Letter Ref
                                                            </label>
                                                            {includeLetterRefs && (
                                                                <button type="button" onClick={() => setShowLetterRefPicker(true)}
                                                                    className="text-[11px] px-2 py-0.5 rounded border" style={{ color: themeColor, borderColor: themeColor }}>
                                                                    Select letters ({selectedLetterRefIds.length})
                                                                </button>
                                                            )}
                                                        </>)}
                                                    </div>
                                                    {includeFollowups && (
                                                        <div className="pt-1">
                                                            <label className="text-[10px] text-gray-500">Follow-up intro line (editable)</label>
                                                            <textarea
                                                                value={letterFields.followup_intro}
                                                                onChange={(e) => setLetterFields(p => ({ ...p, followup_intro: e.target.value }))}
                                                                className="w-full border border-gray-200 rounded px-2 py-1 text-[11px] leading-relaxed"
                                                                rows="2"
                                                            />
                                                            {renderLetterEditTable({
                                                                cols: LETTER_FOLLOWUP_COLS,
                                                                hiddenCols: followupHiddenCols,
                                                                setHiddenCols: setFollowupHiddenCols,
                                                                rows: selectedFollowupRows(),
                                                                rowId: (r) => r.id,
                                                                getCell: followupCellValue,
                                                                onCellChange: setFollowupCell,
                                                                emptyText: 'No follow-ups selected. Use “Select follow-ups” above.'
                                                            })}
                                                        </div>
                                                    )}
                                                    {includeQuotations && (
                                                        <div className="pt-1">
                                                            <label className="text-[10px] text-gray-500">Quotation intro line (editable)</label>
                                                            <textarea
                                                                value={letterFields.quotation_intro}
                                                                onChange={(e) => setLetterFields(p => ({ ...p, quotation_intro: e.target.value }))}
                                                                className="w-full border border-gray-200 rounded px-2 py-1 text-[11px] leading-relaxed"
                                                                rows="2"
                                                            />
                                                            {renderLetterEditTable({
                                                                cols: LETTER_QUOTATION_COLS,
                                                                hiddenCols: quotationHiddenCols,
                                                                setHiddenCols: setQuotationHiddenCols,
                                                                rows: selectedQuotationRows(),
                                                                rowId: (r) => r.id,
                                                                getCell: quotationCellValue,
                                                                onCellChange: setQuotationCell,
                                                                emptyText: 'No quotations selected. Use “Select quotations” above.'
                                                            })}
                                                        </div>
                                                    )}
                                                    {includeLetterRefs && (
                                                        <div className="pt-1">
                                                            <label className="text-[10px] text-gray-500">Letter Ref intro line (editable)</label>
                                                            <textarea
                                                                value={letterFields.letterref_intro}
                                                                onChange={(e) => setLetterFields(p => ({ ...p, letterref_intro: e.target.value }))}
                                                                className="w-full border border-gray-200 rounded px-2 py-1 text-[11px] leading-relaxed"
                                                                rows="2"
                                                            />
                                                            {renderLetterEditTable({
                                                                cols: LETTER_REF_COLS,
                                                                hiddenCols: letterRefHiddenCols,
                                                                setHiddenCols: setLetterRefHiddenCols,
                                                                rows: selectedLetterRefRows(),
                                                                rowId: (r) => r.id,
                                                                getCell: letterRefCellValue,
                                                                onCellChange: setLetterRefCell,
                                                                emptyText: 'No letters selected. Use “Select letters” above.'
                                                            })}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* End para */}
                                                <div className="mb-3">
                                                    <label className="text-[10px] text-gray-500">End Paragraph</label>
                                                    <textarea value={letterFields.end_para} onChange={(e) => setLetterFields(p => ({ ...p, end_para: e.target.value }))}
                                                        className="w-full border border-gray-200 rounded px-2 py-2 text-xs leading-relaxed" style={{ minHeight: '90px' }} />
                                                </div>

                                                {/* Common signature (not editable) */}
                                                <div className="text-xs whitespace-pre-wrap text-gray-700 border-t border-gray-100 pt-2">{LETTER_SIGNATURE}</div>
                                            </div>

                                            {/* Footer image (pic 2) */}
                                            {footerImgDataUrl && <img src={footerImgDataUrl} alt={COMPANY_FULL} className="block w-full h-auto" style={{ maxWidth: '780px', margin: '0 auto' }} />}
                                        </div>

                                        {/* Attachments */}
                                        <div className="border border-gray-200 rounded-lg p-3">
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-[11px] font-bold text-black uppercase">Attachments ({letterAttachments.length})</p>
                                                <div className="flex items-center gap-2">
                                                    <input type="file" multiple accept=".mp4,.jpg,.jpeg,.png,.pdf,.doc,.docx,.xlsx,.xls,.csv"
                                                        onChange={handleLetterAddAttachment} className="hidden" id="letter-extra-attach" />
                                                    <label htmlFor="letter-extra-attach"
                                                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-white rounded-md cursor-pointer"
                                                        style={{ backgroundColor: themeColor }}>
                                                        <PlusIcon className="h-3 w-3" /> Add file
                                                    </label>
                                                    <button onClick={handlePrintLetter}
                                                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] border border-gray-300 rounded-md hover:bg-gray-50 text-black">
                                                        <DocumentTextIcon className="h-3 w-3" /> Print
                                                    </button>
                                                </div>
                                            </div>
                                            {letterAttachments.length === 0 ? (
                                                <span className="text-xs text-gray-400">No attachments</span>
                                            ) : (
                                                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                                                    {letterAttachments.map((a, i) => (
                                                        <div key={i} className="flex items-center justify-between p-1.5 bg-gray-50 rounded border">
                                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                                <DocumentTextIcon className="h-3.5 w-3.5 shrink-0" style={{ color: themeColor }} />
                                                                <span className="text-[11px] text-black truncate">{a.name}</span>
                                                                {a.size && <span className="text-[10px] text-gray-400 shrink-0">({(a.size / 1024).toFixed(0)} KB)</span>}
                                                            </div>
                                                            <button onClick={() => removeLetterWizardAttachment(i)} className="text-red-500 hover:text-red-700 shrink-0 ml-1">
                                                                <XMarkIcon className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* STEP 3 — Review & Send */}
                                {letterStep === 3 && (
                                    <div className="space-y-3 max-w-3xl mx-auto">
                                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                                            <div className="px-3 py-1.5 bg-gray-50 text-xs font-bold text-black flex items-center justify-between">
                                                <span>Letter Preview</span>
                                                <div className="flex items-center gap-1.5">
                                                    <button onClick={handleSaveLetterPdf} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-white rounded hover:opacity-90" style={{ backgroundColor: themeColor }}>
                                                        <ArrowDownTrayIcon className="h-3 w-3" /> Download
                                                    </button>
                                                    <button onClick={handlePrintLetter} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] border border-gray-300 rounded hover:bg-gray-100">
                                                        <DocumentTextIcon className="h-3 w-3" /> Print
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="p-2 max-h-[65vh] overflow-y-auto bg-gray-50">
                                                <div dangerouslySetInnerHTML={{ __html: buildLetterHtml() }} />
                                            </div>
                                        </div>

                                        <div className="border border-gray-200 rounded-lg p-3 space-y-3">
                                            <div>
                                                <label className="text-[10px] text-gray-500">Letter file name (PDF)</label>
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        value={letterFileName}
                                                        onChange={(e) => setLetterFileName(e.target.value)}
                                                        className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-xs text-black"
                                                        placeholder="e.g. AMC Renewal Letter"
                                                    />
                                                    <span className="text-[11px] text-gray-400 shrink-0">.pdf</span>
                                                </div>
                                                <p className="text-[10px] text-gray-400 mt-0.5">Used for the emailed PDF and the Download button.</p>
                                            </div>
                                            <p className="text-[11px] font-bold text-black uppercase">Send Via</p>
                                            <div className="flex flex-wrap gap-2">
                                                <label className={`flex items-center gap-1.5 px-3 py-2 border rounded-md cursor-pointer text-sm ${letterChannels.includes('email') ? 'border-[#2f3192] bg-[#2f3192]/10 text-[#2f3192]' : 'border-gray-300 text-black'}`}>
                                                    <input type="checkbox" className="hidden" checked={letterChannels.includes('email')} onChange={() => toggleLetterSendChannel('email')} />
                                                    <EnvelopeIcon className="h-4 w-4" /> Email
                                                </label>
                                                <label className={`flex items-center gap-1.5 px-3 py-2 border rounded-md cursor-pointer text-sm ${letterChannels.includes('whatsapp') ? 'border-green-600 bg-green-50 text-green-700' : 'border-gray-300 text-black'}`}>
                                                    <input type="checkbox" className="hidden" checked={letterChannels.includes('whatsapp')} onChange={() => toggleLetterSendChannel('whatsapp')} />
                                                    <ChatBubbleLeftRightIcon className="h-4 w-4" /> WhatsApp
                                                </label>
                                            </div>

                                            {letterChannels.includes('email') && (
                                                <div className="space-y-2">
                                                    {/* {letterMatchedGoems.length > 0 && (
                                                        <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 bg-orange-50 border border-orange-200 rounded-lg">
                                                            <span className="text-[10px] font-semibold text-orange-700">
                                                                GOEM for this branch{letterMatchedGoems.length > 1 ? 's' : ''}:
                                                            </span>
                                                            {letterMatchedGoems.map((g, i) => (
                                                                <span key={i} className="inline-flex items-center px-1.5 py-0.5 bg-orange-100 text-orange-800 rounded text-[11px] font-medium">
                                                                    {g}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )} */}
                                                    <div>
                                                        <label className="text-[10px] text-gray-500">Recipient Email (To)</label>
                                                        <input value={letterEmailTo} onChange={(e) => setLetterEmailTo(e.target.value)}
                                                            className="w-full border border-gray-300 rounded-lg px-2 py-1 text-xs text-black" placeholder="customer@email.com" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-gray-500">Add more emails (To)</label>
                                                        <div className="flex gap-1.5">
                                                            <input value={letterToInput}
                                                                onChange={(e) => setLetterToInput(e.target.value)}
                                                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addToEmail(); } }}
                                                                className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-xs text-black" placeholder="another@email.com" />
                                                            <button type="button" onClick={addToEmail}
                                                                className="px-2.5 py-1 text-[11px] text-white rounded-lg" style={{ backgroundColor: themeColor }}>Add</button>
                                                        </div>
                                                        {letterToList.length > 0 && (
                                                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                                {letterToList.map((e, i) => (
                                                                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-[11px]">
                                                                        {e}
                                                                        <button type="button" onClick={() => removeToEmail(i)} className="hover:text-red-600"><XMarkIcon className="h-3 w-3" /></button>
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-gray-500">Add more emails (CC)</label>
                                                        <div className="flex gap-1.5">
                                                            <input value={letterCcInput}
                                                                onChange={(e) => setLetterCcInput(e.target.value)}
                                                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCcEmail(); } }}
                                                                className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-xs text-black" placeholder="another@email.com" />
                                                            <button type="button" onClick={addCcEmail}
                                                                className="px-2.5 py-1 text-[11px] text-white rounded-lg" style={{ backgroundColor: themeColor }}>Add</button>
                                                        </div>
                                                        {letterCcList.length > 0 && (
                                                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                                {letterCcList.map((e, i) => (
                                                                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#2f3192]/10 text-[#2f3192] rounded text-[11px]">
                                                                        {e}
                                                                        <button type="button" onClick={() => removeCcEmail(i)} className="hover:text-red-600"><XMarkIcon className="h-3 w-3" /></button>
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {letterChannels.includes('whatsapp') && (
                                                <div className="space-y-2">
                                                    <div>
                                                        <label className="text-[10px] text-gray-500">WhatsApp Number (with country code)</label>
                                                        <input value={letterWhatsappTo} onChange={(e) => setLetterWhatsappTo(e.target.value)}
                                                            className="w-full border border-gray-300 rounded-lg px-2 py-1 text-xs text-black" placeholder="9198xxxxxxxx" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-gray-500">Add more WhatsApp numbers</label>
                                                        <div className="flex gap-1.5">
                                                            <input value={letterWhatsappInput}
                                                                onChange={(e) => setLetterWhatsappInput(e.target.value)}
                                                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addWhatsappNumber(); } }}
                                                                className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-xs text-black" placeholder="9198xxxxxxxx" />
                                                            <button type="button" onClick={addWhatsappNumber}
                                                                className="px-2.5 py-1 text-[11px] text-white rounded-lg" style={{ backgroundColor: themeColor }}>Add</button>
                                                        </div>
                                                        {letterWhatsappList.length > 0 && (
                                                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                                {letterWhatsappList.map((n, i) => (
                                                                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded text-[11px]">
                                                                        {n}
                                                                        <button type="button" onClick={() => removeWhatsappNumber(i)} className="hover:text-red-600"><XMarkIcon className="h-3 w-3" /></button>
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                        <p className="text-[10px] text-gray-400 mt-0.5">Letter text is sent over WhatsApp; file attachments go via email.</p>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="text-[11px] text-gray-600">
                                                <span className="font-semibold">Ref No:</span> {letterFields.ref_no} &nbsp;·&nbsp;
                                                <span className="font-semibold">Attachments:</span> {letterAttachments.length}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Footer / navigation */}
                            <div className="px-4 py-3 border-t border-gray-200 flex justify-between gap-2 bg-white">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => letterStep > 1 ? setLetterStep(letterStep - 1) : setShowLetterWizard(false)}
                                        disabled={letterSending}
                                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-[11px] font-medium text-black hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        {letterStep > 1 ? 'Back' : 'Cancel'}
                                    </button>
                                    {(letterStep === 2 || letterStep === 3) && (
                                        <button
                                            onClick={handleSaveLetterDraft}
                                            disabled={letterSending}
                                            className="px-3 py-1.5 border rounded-lg text-[11px] font-medium hover:bg-gray-50 disabled:opacity-50"
                                            style={{ color: themeColor, borderColor: themeColor }}
                                        >
                                            Save as Draft
                                        </button>
                                    )}
                                </div>
                                {letterStep < 3 ? (
                                    <button
                                        onClick={() => goToLetterStep(letterStep + 1)}
                                        disabled={letterStepLoading}
                                        className="px-4 py-1.5 text-white rounded-lg text-[11px] font-medium hover:opacity-90 disabled:opacity-60 flex items-center gap-1.5"
                                        style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                                    >
                                        {letterStepLoading
                                            ? <><ArrowPathIcon className="h-3 w-3 animate-spin" /> Loading…</>
                                            : <>Next <ChevronRightIcon className="h-3 w-3" /></>}
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleSendLetter}
                                        disabled={letterSending}
                                        className="px-4 py-1.5 text-white rounded-lg text-[11px] font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                                        style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                                    >
                                        {letterSending ? <ArrowPathIcon className="h-3 w-3 animate-spin" /> : <PaperAirplaneIcon className="h-3 w-3" />}
                                        Send Letter
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Follow-up picker popup */}
                {showFollowupPicker && (
                    <div className="fixed inset-0 backdrop-blur-sm bg-black/40 flex items-center justify-center z-[70] p-3">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
                            <div className="px-4 py-3 flex justify-between items-center" style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>
                                <h3 className="text-sm font-semibold text-white">Select Follow-up history</h3>
                                <button onClick={() => { setShowFollowupPicker(false); if (selectedFollowupIds.length === 0) setIncludeFollowups(false); }} className="w-7 h-7 bg-white text-black rounded-lg flex items-center justify-center hover:bg-gray-100">
                                    <XMarkIcon className="h-4 w-4" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-hidden p-3">
                                {formatFollowups().length === 0 ? (
                                    <p className="text-xs text-gray-500 text-center py-6">No follow-ups found for this product.</p>
                                ) : (
                                    <div className="overflow-x-auto overflow-y-auto max-h-[60vh] border border-gray-200 rounded-lg custom-scrollbar">
                                        <table className="w-full min-w-[860px] border-collapse">
                                            <thead className="bg-gray-50 sticky top-0 z-10">
                                                <tr className="border-b border-gray-200">
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border-r border-gray-200 w-[44px]"></th>
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border-r border-gray-200 whitespace-nowrap">Date</th>
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border-r border-gray-200 whitespace-nowrap">Drive</th>
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border-r border-gray-200 whitespace-nowrap">Service/Product</th>
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border-r border-gray-200 whitespace-nowrap">Status</th>
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border-r border-gray-200 whitespace-nowrap">Employee</th>
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border-r border-gray-200 whitespace-nowrap">Follow-up By</th>
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border-r border-gray-200 whitespace-nowrap">Remark</th>
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black whitespace-nowrap">Next Follow-up</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {formatFollowups().map(fu => {
                                                    const checked = selectedFollowupIds.includes(fu.id);
                                                    return (
                                                        <tr key={fu.id}
                                                            onClick={() => toggleSelectedFollowup(fu.id)}
                                                            className={`cursor-pointer border-b border-gray-100 ${checked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                                            <td className="px-2 py-1.5 text-center border-r border-gray-100">
                                                                <input type="checkbox" checked={checked} onChange={() => toggleSelectedFollowup(fu.id)}
                                                                    onClick={(e) => e.stopPropagation()} style={{ accentColor: themeColor }} />
                                                            </td>
                                                            <td className="px-2 py-1.5 text-center text-[11px] text-black border-r border-gray-100 whitespace-nowrap">{formatDate(fu.followup_date)}</td>
                                                            <td className="px-2 py-1.5 text-center text-[11px] text-black border-r border-gray-100">{fu.campaign_name || '-'}</td>
                                                            <td className="px-2 py-1.5 text-center text-[11px] text-black border-r border-gray-100">{fu.campaign_service || fu.campaign_name || '-'}</td>
                                                            <td className="px-2 py-1.5 text-center text-[11px] text-black border-r border-gray-100 capitalize">{_followupStatusLabel(fu.status)}</td>
                                                            <td className="px-2 py-1.5 text-center text-[11px] text-black border-r border-gray-100">{fu.user_name || '-'}</td>
                                                            <td className="px-2 py-1.5 text-center text-[11px] text-black border-r border-gray-100 capitalize">{fu.followup_by || '-'}</td>
                                                            <td className="px-2 py-1.5 text-left text-[11px] text-black border-r border-gray-100 max-w-[220px]">
                                                                <div className="truncate" title={fu.followup_remark || '-'}>{fu.followup_remark || '-'}</div>
                                                            </td>
                                                            <td className="px-2 py-1.5 text-center text-[11px] text-black whitespace-nowrap">{formatDate(fu.next_followup_date)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                            <div className="px-4 py-3 border-t border-gray-200 flex justify-between items-center">
                                <span className="text-[11px] text-gray-500">{selectedFollowupIds.length} selected</span>
                                <button onClick={() => { setShowFollowupPicker(false); if (selectedFollowupIds.length === 0) setIncludeFollowups(false); }}
                                    className="px-4 py-1.5 text-white rounded-lg text-[11px] font-medium" style={{ backgroundColor: themeColor }}>
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Quotation picker popup (only quotation-sent = Yes) */}
                {showQuotationPicker && (
                    <div className="fixed inset-0 backdrop-blur-sm bg-black/40 flex items-center justify-center z-[70] p-3">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
                            <div className="px-4 py-3 flex justify-between items-center" style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>
                                <h3 className="text-sm font-semibold text-white">Select Quotation(s)</h3>
                                <button onClick={() => { setShowQuotationPicker(false); if (selectedQuotationIds.length === 0) setIncludeQuotations(false); }} className="w-7 h-7 bg-white text-black rounded-lg flex items-center justify-center hover:bg-gray-100">
                                    <XMarkIcon className="h-4 w-4" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-hidden p-3">
                                {quotationFollowups().length === 0 ? (
                                    <p className="text-xs text-gray-500 text-center py-6">No quotations found for this product.</p>
                                ) : (
                                    <div className="overflow-x-auto overflow-y-auto max-h-[60vh] border border-gray-200 rounded-lg custom-scrollbar">
                                        <table className="w-full min-w-[700px] border-collapse">
                                            <thead className="bg-gray-50 sticky top-0 z-10">
                                                <tr className="border-b border-gray-200">
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border-r border-gray-200 w-[44px]"></th>
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border-r border-gray-200 whitespace-nowrap">Quote No</th>
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border-r border-gray-200 whitespace-nowrap">Date</th>
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border-r border-gray-200 whitespace-nowrap">Value</th>
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border-r border-gray-200 whitespace-nowrap">Product</th>
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black whitespace-nowrap">Employee</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {quotationFollowups().map(q => {
                                                    const checked = selectedQuotationIds.includes(q.id);
                                                    return (
                                                        <tr key={q.id}
                                                            onClick={() => toggleSelectedQuotation(q.id)}
                                                            className={`cursor-pointer border-b border-gray-100 ${checked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                                            <td className="px-2 py-1.5 text-center border-r border-gray-100">
                                                                <input type="checkbox" checked={checked} onChange={() => toggleSelectedQuotation(q.id)}
                                                                    onClick={(e) => e.stopPropagation()} style={{ accentColor: themeColor }} />
                                                            </td>
                                                            <td className="px-2 py-1.5 text-center text-[11px] text-black border-r border-gray-100">{q.quotation_no || '-'}</td>
                                                            <td className="px-2 py-1.5 text-center text-[11px] text-black border-r border-gray-100 whitespace-nowrap">{formatDate(q.followup_date)}</td>
                                                            <td className="px-2 py-1.5 text-center text-[11px] text-black border-r border-gray-100 whitespace-nowrap">{q.quotation_value ? `₹${Number(q.quotation_value).toLocaleString('en-IN')}` : '-'}</td>
                                                            <td className="px-2 py-1.5 text-center text-[11px] text-black border-r border-gray-100">{q.campaign_service || q.campaign_name || '-'}</td>
                                                            <td className="px-2 py-1.5 text-center text-[11px] text-black">{q.user_name || '-'}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                            <div className="px-4 py-3 border-t border-gray-200 flex justify-between items-center">
                                <span className="text-[11px] text-gray-500">{selectedQuotationIds.length} selected</span>
                                <button onClick={() => { setShowQuotationPicker(false); if (selectedQuotationIds.length === 0) setIncludeQuotations(false); }}
                                    className="px-4 py-1.5 text-white rounded-lg text-[11px] font-medium" style={{ backgroundColor: themeColor }}>
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Letter Ref picker popup (this customer's previously saved/sent letters) */}
                {showLetterRefPicker && (
                    <div className="fixed inset-0 backdrop-blur-sm bg-black/40 flex items-center justify-center z-[70] p-3">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
                            <div className="px-4 py-3 flex justify-between items-center" style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>
                                <h3 className="text-sm font-semibold text-white">Select Letter Reference(s)</h3>
                                <button onClick={() => setShowLetterRefPicker(false)} className="w-7 h-7 bg-white text-black rounded-lg flex items-center justify-center hover:bg-gray-100">
                                    <XMarkIcon className="h-4 w-4" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-hidden p-3">
                                {letterRefOptions().length === 0 ? (
                                    <p className="text-xs text-gray-500 text-center py-6">No previous letters found for this customer.</p>
                                ) : (
                                    <div className="overflow-x-auto overflow-y-auto max-h-[60vh] border border-gray-200 rounded-lg custom-scrollbar">
                                        <table className="w-full min-w-[760px] border-collapse">
                                            <thead className="bg-gray-50 sticky top-0 z-10">
                                                <tr className="border-b border-gray-200">
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border-r border-gray-200 w-[44px]"></th>
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border-r border-gray-200 whitespace-nowrap">Ref No</th>
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border-r border-gray-200 whitespace-nowrap">Format Type</th>
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border-r border-gray-200 whitespace-nowrap">Channels</th>
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black border-r border-gray-200 whitespace-nowrap">Date</th>
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-bold text-black whitespace-nowrap">Sent By</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {letterRefOptions().map(l => {
                                                    const checked = selectedLetterRefIds.includes(l.id);
                                                    return (
                                                        <tr key={l.id}
                                                            onClick={() => toggleSelectedLetterRef(l.id)}
                                                            className={`cursor-pointer border-b border-gray-100 ${checked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                                            <td className="px-2 py-1.5 text-center border-r border-gray-100">
                                                                <input type="checkbox" checked={checked} onChange={() => toggleSelectedLetterRef(l.id)}
                                                                    onClick={(e) => e.stopPropagation()} style={{ accentColor: themeColor }} />
                                                            </td>
                                                            <td className="px-2 py-1.5 text-center text-[11px] text-black border-r border-gray-100 whitespace-nowrap">{l.ref_no || '-'}</td>
                                                            <td className="px-2 py-1.5 text-center text-[11px] text-black border-r border-gray-100">{l.format_type_name || '-'}</td>
                                                            <td className="px-2 py-1.5 text-center text-[11px] text-black border-r border-gray-100">{letterRefChannelText(l)}</td>
                                                            <td className="px-2 py-1.5 text-center text-[11px] text-black border-r border-gray-100 whitespace-nowrap">{formatDate(l.created_at)}</td>
                                                            <td className="px-2 py-1.5 text-center text-[11px] text-black">{l.sent_by_name || '-'}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                            <div className="px-4 py-3 border-t border-gray-200 flex justify-between items-center">
                                <span className="text-[11px] text-gray-500">{selectedLetterRefIds.length} selected</span>
                                <button onClick={() => { setShowLetterRefPicker(false); if (selectedLetterRefIds.length === 0) setIncludeLetterRefs(false); }}
                                    className="px-4 py-1.5 text-white rounded-lg text-[11px] font-medium" style={{ backgroundColor: themeColor }}>
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Edit Customer Modal */}
                {showEditCustomerModal && (
                    <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center z-50 p-3">
                        <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                            <div className="p-3 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
                                <h3
                                    className="text-base font-semibold"
                                    style={{ color: "black" }}
                                >
                                    Edit Customer Details
                                </h3>
                                <button
                                    onClick={() => setShowEditCustomerModal(false)}
                                    className="text-black hover:text-gray-600"
                                >
                                    <XMarkIcon className="h-4 w-4" />
                                </button>
                            </div>
                            <form onSubmit={handleSaveCustomerEdit} className="p-3 space-y-3">
                                <div>
                                    <label className="block text-[11px] font-semibold text-black mb-0.5">
                                        Instance ID
                                    </label>
                                    <input
                                        type="text"
                                        value={customerDetails?.instance_id || ""}
                                        className="w-full border border-gray-300 rounded-lg px-2 py-1 text-[11px] bg-gray-100 cursor-not-allowed text-black"
                                        disabled
                                        readOnly
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-semibold text-black mb-0.5">
                                        Customer Name
                                    </label>
                                    <input
                                        type="text"
                                        value={editCustomerForm.customer_name}
                                        onChange={(e) =>
                                            setEditCustomerForm({
                                                ...editCustomerForm,
                                                customer_name: e.target.value,
                                            })
                                        }
                                        className="w-full border border-gray-300 rounded-lg px-2 py-1 text-[11px] focus:ring-2 text-black"
                                        style={{ "--tw-ring-color": themeColor }}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-semibold text-black mb-0.5">
                                        Phone Number
                                    </label>
                                    <input
                                        type="text"
                                        value={editCustomerForm.phone_number}
                                        onChange={(e) =>
                                            setEditCustomerForm({
                                                ...editCustomerForm,
                                                phone_number: e.target.value,
                                            })
                                        }
                                        className="w-full border border-gray-300 rounded-lg px-2 py-1 text-[11px] focus:ring-2 text-black"
                                        style={{ "--tw-ring-color": themeColor }}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-semibold text-black mb-0.5">
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        value={editCustomerForm.email}
                                        onChange={(e) =>
                                            setEditCustomerForm({
                                                ...editCustomerForm,
                                                email: e.target.value,
                                            })
                                        }
                                        className="w-full border border-gray-300 rounded-lg px-2 py-1 text-[11px] focus:ring-2 text-black"
                                        style={{ "--tw-ring-color": themeColor }}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-semibold text-black mb-0.5">
                                        Location
                                    </label>
                                    <textarea
                                        value={editCustomerForm.location}
                                        onChange={(e) =>
                                            setEditCustomerForm({
                                                ...editCustomerForm,
                                                location: e.target.value,
                                            })
                                        }
                                        className="w-full border border-gray-300 rounded-lg px-2 py-1 text-[11px] focus:ring-2 min-h-[60px] text-black"
                                        style={{ "--tw-ring-color": themeColor }}
                                    />
                                </div>
                                <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                                    <button
                                        type="button"
                                        onClick={() => setShowEditCustomerModal(false)}
                                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-[11px] font-medium hover:bg-gray-50 text-black"
                                        disabled={editCustomerLoading}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={editCustomerLoading}
                                        className="px-3 py-1.5 text-white rounded-lg text-[11px] font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                                        style={{
                                            background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})`,
                                        }}
                                    >
                                        {editCustomerLoading && (
                                            <ArrowPathIcon className="h-3 w-3 animate-spin" />
                                        )}
                                        Save Changes
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

            </div>

            {/* Custom scrollbar styles */}
            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                    height: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: #f1f1f1;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #cbd5e1;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #94a3b8;
                }
                
                .overflow-x-auto {
                    scrollbar-width: thin;
                    -ms-overflow-style: auto;
                }
                
                #table-container {
                    scrollbar-width: thin;
                    -ms-overflow-style: auto;
                }
                
                .overflow-x-auto::-webkit-scrollbar {
                    height: 8px;
                }
                .overflow-x-auto::-webkit-scrollbar-track {
                    background: #f1f1f1;
                    border-radius: 4px;
                }
                .overflow-x-auto::-webkit-scrollbar-thumb {
                    background: #cbd5e1;
                    border-radius: 4px;
                }
                .overflow-x-auto::-webkit-scrollbar-thumb:hover {
                    background: #94a3b8;
                }
            `}</style>
        </div>
    );
};

export default CustomerEng;