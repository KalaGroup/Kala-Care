import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import {
  MegaphoneIcon,
  PlusIcon,
  XMarkIcon,
  FunnelIcon,
  CalendarIcon,
  ClockIcon,
  CheckCircleIcon,
  PencilIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
  ArrowPathIcon,
  DocumentArrowUpIcon,
  DocumentDuplicateIcon,
  DocumentIcon,
  CloudArrowUpIcon
} from '@heroicons/react/24/outline';
import CampaignCustomersFollowupModal from '../components/CampaignCustomersFollowupModal';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;

// ⚡ Module-level cache: lives for the whole browser tab session (NOT reset on
// component unmount). Reopening the Campaign page reads from here instantly
// instead of refetching. Keyed by the active service+status filter so each
// filter combination caches independently.
const campaignCache = {
  data: {},        // { "<service>|<status>": sortedCampaigns[] }
  counts: {},      // { campaignId: { pending, completed } }  (shared across filters)
  services: null,  // services[] (filter-independent)
  stats: null,     // dashboard stats (filter-independent)
};
const cacheKey = (service, status) => `${service}|${status}`;

// Color options for campaigns
const colorOptions = [
  { value: '#000000', label: 'Cyan', class: 'bg-[#000000]' },
  { value: '#ffaa00', label: 'Orange', class: 'bg-[#ffaa00]' },
  { value: '#02b343', label: 'Green', class: 'bg-[#02b343]' },
  { value: '#3B82F6', label: 'Blue', class: 'bg-blue-500' },
  { value: '#8B5CF6', label: 'Purple', class: 'bg-purple-500' },
  { value: '#EC4899', label: 'Pink', class: 'bg-pink-500' },
  { value: '#fdf500', label: 'Yellow', class: 'bg-[#fdf500]' },
  { value: '#ff0000', label: 'Gray', class: 'bg-[#ff0000]' },
  { value: '#14B8A6', label: 'Teal', class: 'bg-teal-500' },
  { value: '#fd5d00', label: 'Red', class: 'bg-[#fd5d00]' },
  { value: '#3bfd00', label: 'Red', class: 'bg-[#3bfd00]' },
  { value: '#660185', label: 'Red', class: 'bg-[#660185]' },
];

// Required columns and field mapping for the SP Info (CSP) file
const SP_INFO_REQUIRED_COLUMNS = [
  'ZONE NAME', 'SD ID', 'SD NAME', 'BRANCH ID', 'BRANCH NAME', 'GOEM OEM',
  'SR NUMBER', 'SR OPEN DATE', 'SR CLOSE DATE', 'SR TYPE', 'SR SUBTYPE', 'SR STATUS',
  'SEGMENT', 'PRODUCT SEGMENT', 'INSTANCE ID', 'APPLICATION CODE', 'ENGINE SERIAL NUMBER',
  'ACCOUNT NAME', 'CUSTOMER NAME', 'CUSTOMER PHONE NUMBER', 'SR INSTALLATION SITE ADDRESS', 'OIL CHANGE FLAG'
];

const SP_INFO_COLUMN_MAP = {
  'ZONE NAME': 'zone_name',
  'SD ID': 'sd_id',
  'SD NAME': 'sd_name',
  'BRANCH ID': 'branch_id',
  'BRANCH NAME': 'branch_name',
  'GOEM OEM': 'goem_oem',
  'SR NUMBER': 'sr_number',
  'SR OPEN DATE': 'sr_open_date',
  'SR CLOSE DATE': 'sr_close_date',
  'SR TYPE': 'sr_type',
  'SR SUBTYPE': 'sr_subtype',
  'SR STATUS': 'sr_status',
  'SEGMENT': 'segment',
  'PRODUCT SEGMENT': 'product_segment',
  'INSTANCE ID': 'instance_id',
  'APPLICATION CODE': 'application_code',
  'ENGINE SERIAL NUMBER': 'engine_serial_number',
  'ACCOUNT NAME': 'account_name',
  'CUSTOMER NAME': 'customer_name',
  'CUSTOMER PHONE NUMBER': 'customer_phone_number',
  'SR INSTALLATION SITE ADDRESS': 'sr_installation_site_address',
  'OIL CHANGE FLAG': 'oil_change_flag'
};

const Campaign = () => {
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [showEditCampaign, setShowEditCampaign] = useState(false);
  const [showDeleteServiceConfirm, setShowDeleteServiceConfirm] = useState(false);
  const [selectedService, setSelectedService] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('active');
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [serviceToDelete, setServiceToDelete] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [importedFile, setImportedFile] = useState(null);
  const [showFollowupModal, setShowFollowupModal] = useState(false);
  const [selectedCampaignForModal, setSelectedCampaignForModal] = useState(null);

  // Validation states
  const [validAssets, setValidAssets] = useState([]);
  const [invalidAssets, setInvalidAssets] = useState([]);
  const [isValidating, setIsValidating] = useState(false);

  // Loading states
  const [loading, setLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [serviceLoading, setServiceLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [campaignCounts, setCampaignCounts] = useState({});
  const [loadingMore, setLoadingMore] = useState(false);
  // ⚡ Progressive render: how many campaign cards are currently painted.
  // Starts small so the first cards show instantly, then grows in chunks.
  const [visibleCount, setVisibleCount] = useState(8);
  const navigate = useNavigate();
  const [showDeleteCampaignConfirm, setShowDeleteCampaignConfirm] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [showEditServiceForm, setShowEditServiceForm] = useState(false);
  const [editServiceData, setEditServiceData] = useState({
    id: null,
    name: '',
    description: ''
  });
  const [editServiceLoading, setEditServiceLoading] = useState(false);

  const themeColor = '#2f3192';
  const themeShades = {
    light: 'rgba(64, 96, 147, 0.1)',
    medium: 'rgba(64, 96, 147, 0.5)',
    dark: '#335478',
  };

  // State for data from API — seeded from the module cache so a revisit paints
  // immediately with whatever was loaded last time (then refreshes in background).
  const [campaigns, setCampaigns] = useState(
    () => campaignCache.data[cacheKey('all', 'active')] || []
  );
  const [services, setServices] = useState(() => campaignCache.services || []);
  const [stats, setStats] = useState(
    () => campaignCache.stats || {
      total_campaigns: 0,
      active_campaigns: 0,
      total_customers: 0,
      total_completed: 0
    }
  );

  // Refs to prevent duplicate requests
  const fetchingRef = useRef(false);
  const initialLoadRef = useRef(false);
  const filterTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);

  const [newCampaign, setNewCampaign] = useState({
    name: '',
    service: '',
    description: '',
    color: '#406093',
    start_date: '',
    end_date: '',
    status: 'active',
    asset_numbers: [],
    scripts: []
  });

  const [editCampaignData, setEditCampaignData] = useState({
    id: null,
    name: '',
    service: '',
    description: '',
    color: '',
    start_date: '',
    end_date: '',
    status: '',
    asset_numbers: [],
    scripts: []
  });

  const [newService, setNewService] = useState({
    name: '',
    description: ''
  });

  const openFollowupModal = (campaign, e) => {
    e.stopPropagation();
    setSelectedCampaignForModal(campaign);
    setShowFollowupModal(true);
  };

  // On mount: if we already have cached data for the current filter, show it
  // instantly and skip the blocking fetch. Otherwise fetch normally.
  useEffect(() => {
    const key = cacheKey(selectedService, selectedStatus);

    if (campaignCache.services) {
      setServices(campaignCache.services);
    } else {
      fetchServices();
    }

    if (campaignCache.data[key]) {
      setCampaigns(campaignCache.data[key]);
      setCampaignCounts(campaignCache.counts);
      initialLoadRef.current = true;
      // refresh quietly in the background so cache doesn't go stale
      fetchCampaignsLazy({ background: true });
    } else {
      fetchCampaignsLazy();
    }

    if (campaignCache.stats) {
      setStats(campaignCache.stats);
    } else {
      fetchStats();
    }
  }, []);

  // Debounced filter change
  useEffect(() => {
    if (filterTimeoutRef.current) {
      clearTimeout(filterTimeoutRef.current);
    }

    filterTimeoutRef.current = setTimeout(() => {
      if (initialLoadRef.current) {
        fetchCampaignsLazy();
      }
    }, 300);

    return () => {
      if (filterTimeoutRef.current) {
        clearTimeout(filterTimeoutRef.current);
      }
    };
  }, [selectedService, selectedStatus]);

  const fetchServices = async () => {
    if (serviceLoading) return;

    setServiceLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/campaigns/services`);
      if (!response.ok) throw new Error('Failed to fetch services');
      const data = await response.json();
      campaignCache.services = data;
      setServices(data);
    } catch (err) {
      toast.error(err.message || 'Failed to load products');
    } finally {
      setServiceLoading(false);
    }
  };

  const parseAssetWithBranch = (value) => {
    if (!value) return null;

    const strValue = String(value).trim();

    const match = strValue.match(/^(\d+)\(([^)]+)\)$/);

    if (match) {
      return {
        asset_number: match[1],
        branch_id: match[2]
      };
    }

    return {
      asset_number: strValue,
      branch_id: null
    };
  };

  const [pendingBranchUpdates, setPendingBranchUpdates] = useState([]);

  // SP Info (CSP) file states
  const [spInfoFile, setSpInfoFile] = useState(null);
  const [spInfoData, setSpInfoData] = useState([]);
  const [spInfoLoading, setSpInfoLoading] = useState(false);

  const handleEditService = async (e) => {
    e.preventDefault();

    if (!editServiceData.name) {
      toast.error('Product name is required');
      return;
    }

    setEditServiceLoading(true);
    const editToast = toast.loading('Updating product...');

    try {
      const response = await fetch(`${API_BASE_URL}/v1/campaigns/services/${editServiceData.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: editServiceData.name,
          description: editServiceData.description || ''
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update product');
      }

      const data = await response.json();

      setServices(services.map(s => s.id === data.id ? data : s));
      setShowEditServiceForm(false);
      setEditServiceData({ id: null, name: '', description: '' });
      toast.dismiss(editToast);
      toast.success('Product updated successfully!');
      fetchServices();
    } catch (err) {
      toast.dismiss(editToast);
      toast.error(err.message || 'Failed to update product');
    } finally {
      setEditServiceLoading(false);
    }
  };

  const handleCampaignClick = (campaign) => {
    navigate('/customer-engagement', {
      state: {
        campaign: campaign,
        campaignId: campaign.id
      }
    });
  };

  const openEditServiceModal = (service, e) => {
    e.stopPropagation();
    setEditServiceData({
      id: service.id,
      name: service.name,
      description: service.description || ''
    });
    setShowEditServiceForm(true);
  };

  // Add this helper function near your other utility functions (around line 200-250)
  const isPastDate = (dateString) => {
    if (!dateString) return false;
    const selectedDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return selectedDate < today;
  };

  // Optimized lazy loading implementation with duplicate prevention.
  // Pass { background: true } to refresh without clearing the screen or
  // showing the skeleton (used when we already painted from cache).
  const fetchCampaignsLazy = async ({ background = false } = {}) => {
    // Prevent duplicate requests
    if (fetchingRef.current) {
      console.log('Already fetching campaigns, skipping...');
      return;
    }

    // Cancel previous request if exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    fetchingRef.current = true;
    if (!background) setLoading(true);

    // Only clear the screen on a foreground load; a background refresh keeps
    // the cached cards visible until fresh data replaces them.
    if (!background) {
      setCampaigns([]);
      setCampaignCounts({});
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    try {
      let url = `${API_BASE_URL}/v1/campaigns/?`;
      const params = [];
      if (selectedService && selectedService !== 'all') {
        params.push(`service=${encodeURIComponent(selectedService)}`);
      }
      if (selectedStatus && selectedStatus !== 'all') {
        params.push(`status=${selectedStatus}`);
      }
      url += params.join('&');

      const response = await fetch(url, {
        headers: {
          ...getUserHeaders()
        },
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) throw new Error('Failed to fetch campaigns');
      const data = await response.json();

      const campaignsWithAssets = data.map(campaign => ({
        ...campaign,
        asset_numbers: campaign.asset_numbers || []
      }));

      const sortedCampaigns = campaignsWithAssets.sort((a, b) => {
        const dateA = new Date(a.created_at || a.updated_at || 0);
        const dateB = new Date(b.created_at || b.updated_at || 0);
        return dateB - dateA;
      });

      // Set all campaigns at once for better performance + write to cache
      setCampaigns(sortedCampaigns);
      campaignCache.data[cacheKey(selectedService, selectedStatus)] = sortedCampaigns;
      initialLoadRef.current = true;

    } catch (err) {
      if (err.name !== 'AbortError') {
        toast.error(err.message || 'Failed to load campaigns');
      }
    } finally {
      setLoading(false);
      fetchingRef.current = false;
      abortControllerRef.current = null;
    }
  };

  const fetchCampaignCounts = useCallback(async (campaignId) => {
    // Don't fetch if already have counts
    if (campaignCounts[campaignId]) return;

    try {
      const response = await fetch(`${API_BASE_URL}/v1/campaigns/${campaignId}/counts`);
      if (response.ok) {
        const data = await response.json();
        campaignCache.counts[campaignId] = data; // persist across navigation
        setCampaignCounts(prev => ({
          ...prev,
          [campaignId]: data
        }));
      }
    } catch (err) {
      console.error('Failed to fetch campaign counts:', err);
    }
  }, [campaignCounts]);

  // Load counts only for the campaigns currently revealed on screen.
  // Computes the visible slice inline (from campaigns + visibleCount) so it
  // does NOT depend on `visibleCampaigns`, which is declared lower in the file.
  useEffect(() => {
    const revealed = campaigns.slice(0, visibleCount);
    if (revealed.length > 0) {
      const loadCountsInBatches = async () => {
        for (let i = 0; i < revealed.length; i += 5) {
          const batch = revealed.slice(i, i + 5);
          await Promise.all(batch.map(campaign => fetchCampaignCounts(campaign.id)));
          if (i + 5 < revealed.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      };

      loadCountsInBatches();
    }
  }, [campaigns, visibleCount, fetchCampaignCounts]);

  const getUserHeaders = () => {
    const userData = sessionStorage.getItem('user');
    if (userData) {
      try {
        const user = JSON.parse(userData);
        return {
          'X-User-Id': user.user_id || user.id || '',
          'X-User-Name': user.name || ''
        };
      } catch (error) {
        console.error('Error parsing user data:', error);
      }
    }
    return {};
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/campaigns/stats/dashboard`);
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      const nextStats = {
        total_campaigns: data.total_campaigns,
        active_campaigns: data.active_campaigns,
        total_customers: data.total_customers,
        total_completed: data.total_completed || 0
      };
      campaignCache.stats = nextStats;
      setStats(nextStats);
    } catch (err) {
      toast.error(err.message || 'Failed to load statistics');
    }
  };

  const validateAssets = async (assetList) => {
    if (!assetList || assetList.length === 0) {
      setValidAssets([]);
      setInvalidAssets([]);
      return { valid: [], invalid: [] };
    }

    setIsValidating(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/campaigns/validate-assets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getUserHeaders()
        },
        body: JSON.stringify(assetList)
      });

      if (!response.ok) {
        throw new Error(`Validation failed: ${response.status}`);
      }

      const data = await response.json();

      let valid = [];
      let invalid = [];

      if (Array.isArray(data)) {
        valid = data;
        invalid = assetList.filter(asset => !valid.includes(asset));
      } else if (data.valid_assets && data.invalid_assets) {
        valid = data.valid_assets;
        invalid = data.invalid_assets;
      } else if (data.valid && data.invalid) {
        valid = data.valid;
        invalid = data.invalid;
      } else {
        valid = assetList;
        invalid = [];
      }

      setValidAssets(valid);
      setInvalidAssets(invalid);

      return { valid, invalid };
    } catch (err) {
      console.error('Validation error:', err);
      toast.error('Failed to validate assets: ' + err.message);
      setValidAssets([]);
      setInvalidAssets(assetList);
      return { valid: [], invalid: assetList };
    } finally {
      setIsValidating(false);
    }
  };

  const handleFileImport = async (e, isEdit = false) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileExt = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(fileExt)) {
      toast.error('Please upload only Excel files (.xlsx, .xls, .csv)');
      e.target.value = '';
      return;
    }

    setImportLoading(true);
    const importToast = toast.loading('Reading file...');

    try {
      const data = await readExcelFile(file);

      if (data.length === 0) {
        toast.error('File is empty');
        e.target.value = '';
        setImportLoading(false);
        toast.dismiss(importToast);
        return;
      }

      const firstRow = data[0];
      const hasBranchCodeColumn = Object.keys(firstRow).some(key =>
        key.toLowerCase() === 'branch code' ||
        key.toLowerCase() === 'branch_code' ||
        key.toLowerCase() === 'branchcode' ||
        key.toLowerCase() === 'branch'
      );

      if (!hasBranchCodeColumn) {
        toast.error('❌ File must contain a "Branch Code" column. Please add Branch Code column to your Excel file.', {
          duration: 6000,
        });
        e.target.value = '';
        setImportLoading(false);
        toast.dismiss(importToast);
        return;
      }

      const extractedAssets = [];
      const extractedBranchUpdates = [];

      for (const item of data) {
        let assetNumberValue = null;
        if (item['ASSET NUMBER']) assetNumberValue = item['ASSET NUMBER'];
        else if (item['asset_number']) assetNumberValue = item['asset_number'];
        else if (item['Asset Number']) assetNumberValue = item['Asset Number'];
        else if (item['Asset']) assetNumberValue = item['Asset'];
        else if (item['asset']) assetNumberValue = item['asset'];
        else if (item['ASSET']) assetNumberValue = item['ASSET'];

        let branchCodeValue = null;
        if (item['Branch Code']) branchCodeValue = item['Branch Code'];
        else if (item['branch_code']) branchCodeValue = item['branch_code'];
        else if (item['BRANCH CODE']) branchCodeValue = item['BRANCH CODE'];
        else if (item['BRANCH Code']) branchCodeValue = item['BRANCH Code'];
        else if (item['Branch CODE']) branchCodeValue = item['Branch CODE'];
        else if (item['BranchCode']) branchCodeValue = item['BranchCode'];
        else if (item['branch']) branchCodeValue = item['branch'];
        else if (item['BRANCH']) branchCodeValue = item['BRANCH'];

        if (assetNumberValue) {
          const parsedAsset = parseAssetWithBranch(assetNumberValue);

          if (parsedAsset) {
            extractedAssets.push(parsedAsset.asset_number);

            const branchId = parsedAsset.branch_id || (branchCodeValue ? String(branchCodeValue).trim() : null);

            if (branchId) {
              extractedBranchUpdates.push({
                asset_number: parsedAsset.asset_number,
                branch_id: branchId
              });
            } else {
              console.warn(`No branch code found for asset: ${parsedAsset.asset_number}`);
            }
          }
        }
      }

      if (extractedAssets.length === 0) {
        toast.error('No valid asset numbers found in the file');
        e.target.value = '';
        setImportLoading(false);
        toast.dismiss(importToast);
        return;
      }

      if (extractedBranchUpdates.length === 0) {
        toast.error('❌ No branch codes found in the file. Please ensure each row has a Branch Code value.', {
          duration: 5000,
        });
        e.target.value = '';
        setImportLoading(false);
        toast.dismiss(importToast);
        return;
      }

      const uniqueImportedAssets = [...new Set(extractedAssets)];

      const uniqueBranchUpdates = [];
      const assetMap = new Map();
      for (const update of extractedBranchUpdates) {
        assetMap.set(update.asset_number, update.branch_id);
      }
      for (const [asset_number, branch_id] of assetMap) {
        uniqueBranchUpdates.push({ asset_number, branch_id });
      }

      setImportedFile(file);
      setPendingBranchUpdates(uniqueBranchUpdates);

      let allAssets;
      if (isEdit) {
        const currentAssets = editCampaignData.asset_numbers || [];
        allAssets = [...new Set([...currentAssets, ...uniqueImportedAssets])];
        setEditCampaignData(prev => ({
          ...prev,
          asset_numbers: allAssets
        }));
      } else {
        const currentAssets = newCampaign.asset_numbers || [];
        allAssets = [...new Set([...currentAssets, ...uniqueImportedAssets])];
        setNewCampaign(prev => ({
          ...prev,
          asset_numbers: allAssets
        }));
      }

      // Start validation immediately without awaiting — show success toast first
      toast.dismiss(importToast);
      toast.success(`✅ Imported ${uniqueImportedAssets.length} unique asset numbers`);
      toast.success(`✅ Found ${uniqueBranchUpdates.length} branch codes to update`, {
        duration: 4000,
      });

      // Validate in background so UI is not blocked
      validateAssets(allAssets);
    } catch (err) {
      toast.dismiss(importToast);
      toast.error('Failed to read file: ' + err.message);
    } finally {
      setImportLoading(false);
      e.target.value = '';
    }
  };

  const updateBranchCodes = async (branchUpdates) => {
    if (!branchUpdates || branchUpdates.length === 0) {
      return { success: [], failed: [], not_found: [] };
    }

    const userData = sessionStorage.getItem('user');
    let userId = null;
    let userName = null;

    if (userData) {
      try {
        const user = JSON.parse(userData);
        userId = user.user_id || user.id;
        userName = user.name;
      } catch (error) {
        console.error('Error parsing user data:', error);
      }
    }

    const updateToast = toast.loading(`Updating ${branchUpdates.length} branch codes in customer records...`);

    try {
      const response = await fetch(`${API_BASE_URL}/v1/campaigns/update-branch-codes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId || '',
          'X-User-Name': userName || ''
        },
        body: JSON.stringify(branchUpdates)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update branch codes');
      }

      const results = await response.json();

      toast.dismiss(updateToast);

      if (results.success.length > 0) {
        toast.success(`✅ Updated ${results.success.length} customer branch codes`, { duration: 4000 });
      }

      if (results.not_found.length > 0) {
        toast.error(`⚠️ ${results.not_found.length} asset numbers not found in customer table`, { duration: 5000 });
      }

      if (results.failed.length > 0) {
        toast.error(`❌ Failed to update ${results.failed.length} branch codes`, { duration: 4000 });
      }

      return results;
    } catch (err) {
      toast.dismiss(updateToast);
      toast.error('Failed to update branch codes: ' + err.message);
      return { success: [], failed: [], not_found: [] };
    }
  };

  const readExcelFile = (file, options = {}) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target.result;
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, options);
          resolve(jsonData);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  };

  const handleSpInfoImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileExt = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(fileExt)) {
      toast.error('Please upload only Excel files (.xlsx, .xls, .csv)');
      e.target.value = '';
      return;
    }

    setSpInfoLoading(true);
    const spToast = toast.loading('Reading CSP Info file...');

    try {
      // Read raw rows and data in a single parallel pass
      const [data, headerRow] = await Promise.all([
        readExcelFile(file),
        readExcelFile(file, { header: 1 })
      ]);

      if (data.length === 0) {
        toast.dismiss(spToast);
        toast.error('SP Info file is empty');
        e.target.value = '';
        setSpInfoLoading(false);
        return;
      }

      const normalize = (k) => String(k).trim().toUpperCase().replace(/\s+/g, ' ');

      const headerCells = (headerRow && headerRow[0]) ? headerRow[0] : [];
      const presentColumns = headerCells
        .filter(h => h !== undefined && h !== null && String(h).trim() !== '')
        .map(normalize);

      // Verify the file format (all required columns must be present)
      const missingColumns = SP_INFO_REQUIRED_COLUMNS.filter(col => !presentColumns.includes(col));

      if (missingColumns.length > 0) {
        toast.dismiss(spToast);
        toast.error(`❌ File format is mismatched. Missing required column(s): ${missingColumns.join(', ')}. Please upload a file with the exact CSP Info format.`, {
          duration: 8000,
        });
        e.target.value = '';
        setSpInfoFile(null);
        setSpInfoData([]);
        setSpInfoLoading(false);
        return;
      }

      // Helper: format Excel date cells (Date objects or serial numbers) to "DD-MMM-YYYY"
      const formatSpDate = (value) => {
        if (value === undefined || value === null || value === '') return null;

        let dateObj = null;

        if (value instanceof Date && !isNaN(value)) {
          dateObj = value;
        } else if (typeof value === 'number') {
          // Excel serial number -> JS Date (Excel epoch starts 1899-12-30)
          dateObj = new Date(Math.round((value - 25569) * 86400 * 1000));
        } else {
          const parsed = new Date(value);
          if (!isNaN(parsed)) dateObj = parsed;
        }

        // If we couldn't parse it as a date, keep the original trimmed text
        if (!dateObj || isNaN(dateObj)) return String(value).trim();

        const day = String(dateObj.getDate()).padStart(2, '0');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = months[dateObj.getMonth()];
        const year = dateObj.getFullYear();
        return `${day}-${month}-${year}`;
      };

      const DATE_FIELDS = new Set(['sr_open_date', 'sr_close_date']);

      // Process rows in a deferred non-blocking way using chunked processing
      toast.dismiss(spToast);
      const processToast = toast.loading(`Processing ${data.length} rows...`);

      // Use setTimeout to yield to the browser between chunks
      const CHUNK_SIZE = 500;
      const allMapped = [];

      const processChunk = (startIdx) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            const end = Math.min(startIdx + CHUNK_SIZE, data.length);
            for (let i = startIdx; i < end; i++) {
              const row = data[i];
              const normalizedRow = {};
              Object.keys(row).forEach(key => {
                normalizedRow[normalize(key)] = row[key];
              });
              const mapped = {};
              Object.entries(SP_INFO_COLUMN_MAP).forEach(([col, field]) => {
                const value = normalizedRow[col];
                if (DATE_FIELDS.has(field)) {
                  mapped[field] = formatSpDate(value);
                } else {
                  mapped[field] = (value === undefined || value === null) ? null : String(value).trim();
                }
              });
              allMapped.push(mapped);
            }
            resolve();
          }, 0);
        });
      };

      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        await processChunk(i);
      }

      setSpInfoFile(file);
      setSpInfoData(allMapped);

      toast.dismiss(processToast);
      toast.success(`✅ Loaded ${allMapped.length} CSP Info rows`);
    } catch (err) {
      toast.dismiss(spToast);
      toast.error('Failed to read SP Info file: ' + err.message);
    } finally {
      setSpInfoLoading(false);
      e.target.value = '';
    }
  };

  const uploadSpInfo = async (campaignId) => {
    if (!spInfoData || spInfoData.length === 0) return;

    const spToast = toast.loading('Saving SP Info data...');
    try {
      const response = await fetch(`${API_BASE_URL}/v1/campaigns/${campaignId}/sp-info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getUserHeaders()
        },
        body: JSON.stringify(spInfoData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to save SP Info');
      }

      const result = await response.json();
      toast.dismiss(spToast);
      toast.success(`✅ SP Info saved (${result.inserted} added, ${result.updated} updated)`);
      return result;
    } catch (err) {
      toast.dismiss(spToast);
      toast.error('Failed to save SP Info: ' + err.message);
    }
  };

  const handlePdfUpload = async (e, isEdit = false) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Please upload only PDF files');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size should be less than 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64Content = reader.result.split(',')[1];
      const scriptObj = {
        name: file.name,
        content: base64Content,
        type: 'pdf',
        size: file.size,
        uploaded_at: new Date().toISOString()
      };

      if (isEdit) {
        setEditCampaignData(prev => ({
          ...prev,
          scripts: [...prev.scripts, scriptObj]
        }));
      } else {
        setNewCampaign(prev => ({
          ...prev,
          scripts: [...prev.scripts, scriptObj]
        }));
      }
      toast.success('PDF uploaded successfully');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeScript = (index, isEdit = false) => {
    if (isEdit) {
      setEditCampaignData(prev => ({
        ...prev,
        scripts: prev.scripts.filter((_, i) => i !== index)
      }));
    } else {
      setNewCampaign(prev => ({
        ...prev,
        scripts: prev.scripts.filter((_, i) => i !== index)
      }));
    }
  };

  const removeAssetNumber = async (assetNumber, isEdit = false) => {
    let updatedAssets;
    if (isEdit) {
      updatedAssets = editCampaignData.asset_numbers.filter(num => num !== assetNumber);
      setEditCampaignData(prev => ({
        ...prev,
        asset_numbers: updatedAssets
      }));
    } else {
      updatedAssets = newCampaign.asset_numbers.filter(num => num !== assetNumber);
      setNewCampaign(prev => ({
        ...prev,
        asset_numbers: updatedAssets
      }));
    }
    await validateAssets(updatedAssets);
  };

  // Remove ALL invalid (not found) asset numbers at once
  const removeAllInvalidAssets = async (isEdit = false) => {
    if (invalidAssets.length === 0) return;

    const invalidSet = new Set(invalidAssets);
    let updatedAssets;

    if (isEdit) {
      updatedAssets = editCampaignData.asset_numbers.filter(num => !invalidSet.has(num));
      setEditCampaignData(prev => ({
        ...prev,
        asset_numbers: updatedAssets
      }));
    } else {
      updatedAssets = newCampaign.asset_numbers.filter(num => !invalidSet.has(num));
      setNewCampaign(prev => ({
        ...prev,
        asset_numbers: updatedAssets
      }));
    }

    const removedCount = invalidAssets.length;
    await validateAssets(updatedAssets);
    toast.success(`Removed ${removedCount} invalid asset number${removedCount > 1 ? 's' : ''}`);
  };

  const handleCreateCampaign = async (e) => {
    e.preventDefault();

    if (!newCampaign.name) {
      toast.error('Campaign name is required');
      return;
    }
    if (!newCampaign.service) {
      toast.error('Please select a product');
      return;
    }
    if (!newCampaign.start_date) {
      toast.error('Start date is required');
      return;
    }
    if (invalidAssets.length > 0) {
      toast.error('Please remove all invalid asset numbers before creating campaign');
      return;
    }
    if (newCampaign.asset_numbers.length === 0) {
      toast.error('Please add at least one valid asset number');
      return;
    }

    setCreateLoading(true);
    const createToast = toast.loading('Creating campaign...');

    try {
      const campaignData = {
        name: newCampaign.name,
        service: newCampaign.service,
        description: newCampaign.description || '',
        color: newCampaign.color || '#406093',
        start_date: newCampaign.start_date || null,
        end_date: newCampaign.end_date || null,
        status: newCampaign.status || 'active',
        asset_numbers: newCampaign.asset_numbers,
        scripts: newCampaign.scripts
      };

      const response = await fetch(`${API_BASE_URL}/v1/campaigns/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getUserHeaders()
        },
        body: JSON.stringify(campaignData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create campaign');
      }

      const data = await response.json();

      if (pendingBranchUpdates.length > 0) {
        toast.loading('Updating branch codes in customer records...', { id: 'branch-update' });
        const branchResults = await updateBranchCodes(pendingBranchUpdates);

        if (branchResults.success.length > 0) {
          toast.success(`Updated ${branchResults.success.length} customer branch codes`, { id: 'branch-update' });
        } else if (branchResults.not_found.length > 0) {
          toast.warning(`${branchResults.not_found.length} asset numbers not found in customer table`, { id: 'branch-update' });
        }
      }

      if (newCampaign.service === 'CSP' && spInfoData.length > 0) {
        await uploadSpInfo(data.id);
      }

      // Add new campaign to the list
      const newCampaignObj = { ...data, asset_numbers: data.asset_numbers || [] };
      setCampaigns(prev => [newCampaignObj, ...prev]);

      setShowCampaignForm(false);
      resetForm();
      setPendingBranchUpdates([]);
      toast.dismiss(createToast);
      toast.success('Campaign created successfully!');
      fetchStats();
    } catch (err) {
      toast.dismiss(createToast);
      toast.error(err.message || 'Failed to create campaign');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleEditCampaign = async (e) => {
    e.preventDefault();

    if (!editCampaignData.name || !editCampaignData.service) {
      toast.error('Campaign name and product are required');
      return;
    }
    if (!editCampaignData.start_date) {
      toast.error('Start date is required');
      return;
    }
    if (invalidAssets.length > 0) {
      toast.error('Please remove all invalid asset numbers before updating campaign');
      return;
    }

    setEditLoading(true);
    const editToast = toast.loading('Updating campaign...');

    try {
      const updateData = {
        id: editCampaignData.id,
        name: editCampaignData.name,
        service: editCampaignData.service,
        description: editCampaignData.description || '',
        color: editCampaignData.color || '#406093',
        start_date: editCampaignData.start_date || null,
        end_date: editCampaignData.end_date || null,
        status: editCampaignData.status || 'active',
        asset_numbers: editCampaignData.asset_numbers,
        scripts: editCampaignData.scripts || []
      };

      const response = await fetch(`${API_BASE_URL}/v1/campaigns/${editCampaignData.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getUserHeaders()
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update campaign');
      }

      const data = await response.json();

      if (pendingBranchUpdates.length > 0) {
        toast.loading('Updating branch codes in customer records...', { id: 'branch-update' });
        const branchResults = await updateBranchCodes(pendingBranchUpdates);

        if (branchResults.success.length > 0) {
          toast.success(`Updated ${branchResults.success.length} customer branch codes`, { id: 'branch-update' });
        } else if (branchResults.not_found.length > 0) {
          toast.warning(`${branchResults.not_found.length} asset numbers not found in customer table`, { id: 'branch-update' });
        }
      }

      if (editCampaignData.service === 'CSP' && spInfoData.length > 0) {
        await uploadSpInfo(data.id);
      }

      setCampaigns(campaigns.map(c => c.id === data.id ? { ...data, asset_numbers: data.asset_numbers || [] } : c));

      setShowEditCampaign(false);
      setSelectedCampaign(null);
      setPendingBranchUpdates([]);
      toast.dismiss(editToast);
      toast.success('Campaign updated successfully!');

      await fetchStats();
    } catch (err) {
      toast.dismiss(editToast);
      toast.error(err.message || 'Failed to update campaign');
    } finally {
      setEditLoading(false);
    }
  };

  const handleAddService = async (e) => {
    e.preventDefault();

    if (!newService.name) {
      toast.error('Product name is required');
      return;
    }

    setServiceLoading(true);
    const serviceToast = toast.loading('Adding product...');

    try {
      const response = await fetch(`${API_BASE_URL}/v1/campaigns/services`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newService),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to add product');
      }

      const data = await response.json();
      setServices([...services, data]);
      setShowServiceForm(false);
      setNewService({ name: '', description: '' });
      toast.dismiss(serviceToast);
      toast.success('Product added successfully!');
      fetchServices();
    } catch (err) {
      toast.dismiss(serviceToast);
      toast.error(err.message || 'Failed to add product');
    } finally {
      setServiceLoading(false);
    }
  };

  const handleDeleteService = async () => {
    if (!serviceToDelete) return;

    setServiceLoading(true);
    const deleteToast = toast.loading('Deleting product...');

    try {
      const response = await fetch(`${API_BASE_URL}/v1/campaigns/services/${serviceToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to delete product');
      }

      setServices(services.filter(s => s.id !== serviceToDelete.id));
      setShowDeleteServiceConfirm(false);
      setServiceToDelete(null);
      toast.dismiss(deleteToast);
      toast.success('Product deleted successfully!');
      fetchServices();
    } catch (err) {
      toast.dismiss(deleteToast);
      toast.error(err.message || 'Failed to delete product');
    } finally {
      setServiceLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (refreshLoading) return;

    setRefreshLoading(true);
    const refreshToast = toast.loading('Refreshing data...');
    try {
      await Promise.all([fetchCampaignsLazy(), fetchStats(), fetchServices()]);
      toast.dismiss(refreshToast);
      toast.success('Data refreshed successfully!');
    } catch (error) {
      toast.dismiss(refreshToast);
      toast.error('Failed to refresh data');
    } finally {
      setRefreshLoading(false);
    }
  };

  const openEditModal = async (campaign, e) => {
    e.stopPropagation();

    setEditCampaignData({
      id: campaign.id,
      name: campaign.name,
      service: campaign.service,
      description: campaign.description || '',
      color: campaign.color || '#406093',
      start_date: campaign.start_date ? campaign.start_date.split('T')[0] : '',
      end_date: campaign.end_date ? campaign.end_date.split('T')[0] : '',
      status: campaign.status,
      asset_numbers: campaign.asset_numbers || [],
      scripts: campaign.scripts || []
    });
    setImportedFile(null);
    await validateAssets(campaign.asset_numbers || []);
    setShowEditCampaign(true);
  };

  const openDeleteServiceConfirm = (service, e) => {
    e.stopPropagation();
    setServiceToDelete(service);
    setShowDeleteServiceConfirm(true);
  };

  const resetForm = () => {
    setNewCampaign({
      name: '',
      service: '',
      description: '',
      color: '#406093',
      start_date: '',
      end_date: '',
      status: 'active',
      asset_numbers: [],
      scripts: []
    });
    setImportedFile(null);
    setValidAssets([]);
    setInvalidAssets([]);
    setPendingBranchUpdates([]);
    setSpInfoFile(null);
    setSpInfoData([]);
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const exportInvalidAssets = () => {
    if (invalidAssets.length === 0) return;

    const ws = XLSX.utils.json_to_sheet(
      invalidAssets.map(asset => ({ 'Invalid Asset Number': asset }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invalid Assets');
    const fileName = `invalid_assets_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success(`Exported ${invalidAssets.length} invalid asset numbers to Excel`);
  };

  // Recompute only when the source list or the search term actually changes.
  const filteredCampaigns = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return campaigns.filter(campaign =>
      campaign.name.toLowerCase().includes(term) ||
      campaign.description?.toLowerCase().includes(term)
    );
  }, [campaigns, searchTerm]);

  // ⚡ Progressive reveal: after the first batch paints, grow visibleCount in
  // chunks on each animation frame until all filtered cards are shown.
  // The first cards appear immediately; the rest stream in without blocking.
  useEffect(() => {
    if (visibleCount >= filteredCampaigns.length) return;
    const id = requestAnimationFrame(() => {
      setVisibleCount((c) => Math.min(c + 8, filteredCampaigns.length));
    });
    return () => cancelAnimationFrame(id);
  }, [visibleCount, filteredCampaigns.length]);

  // Reset the reveal window whenever the filtered set changes (search/filter/refetch)
  useEffect(() => {
    setVisibleCount(8);
  }, [searchTerm, selectedService, selectedStatus, campaigns.length]);

  // Only the cards currently revealed get rendered (memoized)
  const visibleCampaigns = useMemo(
    () => filteredCampaigns.slice(0, visibleCount),
    [filteredCampaigns, visibleCount]
  );

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      return 'Invalid Date';
    }
  };

  const openDeleteCampaignConfirm = (campaign) => {
    setCampaignToDelete(campaign);
    setShowDeleteCampaignConfirm(true);
  };

  const handleDeleteCampaign = async () => {
    if (!campaignToDelete) return;
    setDeleteLoading(true);
    const deleteToast = toast.loading('Deleting campaign...');
    try {
      const response = await fetch(`${API_BASE_URL}/v1/campaigns/${campaignToDelete.id}`, {
        method: 'DELETE',
        headers: { ...getUserHeaders() }
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to delete campaign');
      }
      setCampaigns(prev => prev.filter(c => c.id !== campaignToDelete.id));
      setShowDeleteCampaignConfirm(false);
      setCampaignToDelete(null);
      toast.dismiss(deleteToast);
      toast.success('Campaign deleted successfully!');
      fetchStats();
    } catch (err) {
      toast.dismiss(deleteToast);
      toast.error(err.message || 'Failed to delete campaign');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Skeleton loader component for campaigns
  const CampaignSkeleton = () => (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden flex flex-col h-[300px] animate-pulse">
      <div className="px-3 py-2.5 bg-gray-200 shrink-0">
        <div className="h-5 bg-gray-300 rounded w-3/4"></div>
      </div>
      <div className="flex-1 p-3 space-y-3">
        <div className="h-4 bg-gray-200 rounded w-full"></div>
        <div className="h-4 bg-gray-200 rounded w-5/6"></div>
        <div className="space-y-2">
          <div className="h-3 bg-gray-200 rounded w-1/3"></div>
          <div className="h-8 bg-gray-200 rounded w-full"></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="h-4 bg-gray-200 rounded w-full"></div>
          <div className="h-4 bg-gray-200 rounded w-full"></div>
        </div>
        <div className="flex items-center justify-between pt-3 mt-auto">
          <div className="h-6 bg-gray-200 rounded w-20"></div>
          <div className="flex items-center gap-3">
            <div className="h-6 bg-gray-200 rounded w-16"></div>
            <div className="h-6 w-12 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-3">
        {/* Header Section */}
        <div className="flex flex-wrap items-start sm:items-center justify-between gap-2 sm:gap-3 mb-4 sm:mb-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <h1 className="text-base sm:text-lg lg:text-xl font-bold text-black mb-1">
              Create Your Drive!!!
            </h1>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            <div className="flex sm:hidden items-center gap-1.5">
              <div className="bg-white rounded-lg shadow-sm px-2 py-1.5">
                <div className="flex items-center gap-1">
                  <div className="p-0.5 rounded" style={{ backgroundColor: themeShades.light }}>
                    <MegaphoneIcon className="h-3.5 w-3.5" style={{ color: themeColor }} />
                  </div>
                  <span className="text-xs font-bold text-black">{stats.total_campaigns}</span>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm px-2 py-1.5">
                <div className="flex items-center gap-1">
                  <div className="p-0.5 rounded" style={{ backgroundColor: themeShades.light }}>
                    <CheckCircleIcon className="h-3.5 w-3.5" style={{ color: themeColor }} />
                  </div>
                  <span className="text-xs font-bold text-black">{stats.active_campaigns}</span>
                </div>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2">
              <div className="bg-white rounded-lg shadow-sm px-3 py-1">
                <div className="flex items-center gap-1">
                  <div className="flex items-center gap-0.5">
                    <span className="text-xs text-black">Total:</span>
                    <span className="text-sm font-bold text-black">{stats.total_campaigns}</span>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm px-3 py-1">
                <div className="flex items-center gap-1">
                  <div className="flex items-center gap-0.5">
                    <span className="text-xs text-black">Active:</span>
                    <span className="text-sm font-bold text-black">{stats.active_campaigns}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                onClick={() => {
                  resetForm();
                  setShowCampaignForm(true);
                }}
                className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs text-white font-medium rounded-md transition-all shadow-sm hover:shadow-md whitespace-nowrap"
                style={{ background: "#2f3192" }}
              >
                <PlusIcon className="h-3.5 w-3.5" />
                <span className="text-xs">Create</span>
              </button>

              <button
                onClick={() => setShowServiceForm(true)}
                disabled={serviceLoading}
                className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs text-white font-medium rounded-md transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                style={{ background: "#2f3192" }}
              >
                {serviceLoading ? (
                  <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" style={{ color: 'white' }} />
                ) : (
                  <PlusIcon className="h-3.5 w-3.5" />
                )}
                <span className="text-xs">Service/Product</span>
              </button>

              <button
                onClick={handleRefresh}
                disabled={refreshLoading}
                className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs text-white font-medium rounded-md hover:opacity-90 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                style={{ background: "#2f3192" }}
              >
                {refreshLoading ? (
                  <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" style={{ color: 'white' }} />
                ) : (
                  <ArrowPathIcon className="h-3.5 w-3.5" />
                )}
                <span className="text-xs">Refresh</span>
              </button>
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-white rounded-xl shadow-lg p-1.5 px-3 mb-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-3">
              <div className="lg:hidden">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <FunnelIcon className="h-4 w-4" style={{ color: themeColor }} />
                  <span className="text-xs text-black">Filter by:</span>
                </div>
                <div className="flex gap-2">
                  <select
                    value={selectedService}
                    onChange={(e) => setSelectedService(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:ring-2 transition-all bg-white text-black"
                    style={{ '--tw-ring-color': themeColor }}
                    disabled={loading}
                  >
                    <option value="all">All Service/Products</option>
                    {services.map(service => (
                      <option key={service.id} value={service.name}>
                        {service.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:ring-2 transition-all bg-white text-black"
                    style={{ '--tw-ring-color': themeColor }}
                    disabled={loading}
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="hidden lg:flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <FunnelIcon className="h-4 w-4 shrink-0" style={{ color: themeColor }} />
                  <span className="text-xs text-black">Filter by:</span>
                </div>

                <select
                  value={selectedService}
                  onChange={(e) => setSelectedService(e.target.value)}
                  className="border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:ring-2 transition-all text-black"
                  style={{ '--tw-ring-color': themeColor }}
                  disabled={loading}
                >
                  <option value="all">All Service/Products</option>
                  {services.map(service => (
                    <option key={service.id} value={service.name}>
                      {service.name}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:ring-2 transition-all text-black"
                  style={{ '--tw-ring-color': themeColor }}
                  disabled={loading}
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="relative w-full lg:w-72">
              <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search campaigns..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 w-full border-2 border-black rounded-md px-2 py-1.5 text-xs focus:ring-2 transition-all text-black"
                style={{ '--tw-ring-color': themeColor }}
                disabled={loading}
              />
            </div>
          </div>
        </div>

        {/* Create Campaign Modal */}
        {showCampaignForm && (
          <div className="fixed inset-0 flex items-end lg:items-center justify-center z-50 p-3">
            <div
              className="absolute inset-0 backdrop-blur-sm bg-black/20"
              onClick={() => !createLoading && setShowCampaignForm(false)}
            />

            <div className="relative bg-white rounded-xl shadow-xl w-full lg:max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 px-4 py-3 lg:px-5 lg:py-3.5 rounded-t-xl flex justify-between items-center z-10"
                style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>
                <h2 className="text-sm lg:text-base font-semibold text-white">Create New Drive</h2>
                <button
                  onClick={() => !createLoading && setShowCampaignForm(false)}
                  className="w-7 h-7 bg-white rounded-lg text-black flex items-center justify-center"
                  disabled={createLoading}
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateCampaign} className="p-4 lg:p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-black mb-1">Campaign Name *</label>
                  <input
                    type="text"
                    value={newCampaign.name}
                    onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black"
                    style={{ '--tw-ring-color': themeColor }}
                    placeholder="e.g., Summer Oil Change Drive"
                    disabled={createLoading}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-black mb-1">Service/Product *</label>
                  <select
                    value={newCampaign.service}
                    onChange={(e) => setNewCampaign({ ...newCampaign, service: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black"
                    style={{ '--tw-ring-color': themeColor }}
                    disabled={createLoading}
                    required
                  >
                    <option value="">Select Product</option>
                    {services.map(service => (
                      <option key={service.id} value={service.name}>{service.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-black mb-1">Description</label>
                  <textarea
                    value={newCampaign.description}
                    onChange={(e) => setNewCampaign({ ...newCampaign, description: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black"
                    style={{ '--tw-ring-color': themeColor }}
                    rows="2"
                    placeholder="Campaign description..."
                    disabled={createLoading}
                  />
                </div>

                {/* Import Excel Section */}
                <div className="border border-dashed border-gray-300 rounded-lg p-4">
                  <label className="block text-xs font-semibold text-black mb-1.5">
                    Import Asset Numbers from Excel (ASSET NUMBER, BRANCH CODE) *
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={(e) => handleFileImport(e, false)}
                      className="hidden"
                      id="file-upload"
                      disabled={importLoading || createLoading}
                    />
                    <label
                      htmlFor="file-upload"
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed rounded-md cursor-pointer transition-all ${importLoading ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#406093]'
                        }`}
                      style={{ borderColor: importLoading ? '#9CA3AF' : themeColor }}
                    >
                      {importLoading ? (
                        <ArrowPathIcon className="h-4 w-4 animate-spin" style={{ color: themeColor }} />
                      ) : (
                        <DocumentArrowUpIcon className="h-4 w-4" style={{ color: themeColor }} />
                      )}
                      <span className="text-sm text-black">
                        {importedFile ? importedFile.name : 'Choose Excel file'}
                      </span>
                    </label>
                  </div>

                  {/* Asset Validation Preview */}
                  {(newCampaign.asset_numbers.length > 0 || isValidating) && (
                    <div className="mt-3 space-y-2">
                      {isValidating && (
                        <div className="flex items-center justify-center py-3">
                          <ArrowPathIcon className="h-4 w-4 animate-spin" style={{ color: themeColor }} />
                          <span className="ml-2 text-sm text-black">Validating assets...</span>
                        </div>
                      )}

                      {!isValidating && (
                        <>
                          {validAssets.length > 0 && (
                            <div className="bg-green-50 border border-green-200 rounded-md p-3">
                              <p className="text-xs font-semibold text-green-700 mb-1.5">
                                ✓ Valid Assets ({validAssets.length}):
                              </p>
                              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                                {validAssets.map((asset, index) => (
                                  <span
                                    key={index}
                                    className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs"
                                  >
                                    {asset}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {invalidAssets.length > 0 && (
                            <div className="bg-red-50 border border-red-200 rounded-md p-3">
                              <div className="flex items-center justify-between mb-1.5">
                                <p className="text-xs font-semibold text-red-700">
                                  ✗ Not Found in Database ({invalidAssets.length}):
                                </p>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => removeAllInvalidAssets(false)}
                                    className="text-xs text-red-600 hover:text-red-800 font-medium flex items-center gap-0.5"
                                  >
                                    <XMarkIcon className="h-3 w-3" />
                                    Remove All
                                  </button>
                                  <button
                                    type="button"
                                    onClick={exportInvalidAssets}
                                    className="text-xs text-red-600 hover:text-red-800 font-medium flex items-center gap-0.5"
                                  >
                                    <DocumentArrowUpIcon className="h-3 w-3" />
                                    Export
                                  </button>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                                {invalidAssets.map((asset, index) => (
                                  <span
                                    key={index}
                                    className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs"
                                  >
                                    {asset}
                                    <button
                                      type="button"
                                      onClick={() => removeAssetNumber(asset, false)}
                                      className="hover:text-red-600"
                                    >
                                      <XMarkIcon className="h-3 w-3" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="bg-gray-50 rounded-md p-2.5">
                            <p className="text-xs font-semibold text-black">
                              Total: {newCampaign.asset_numbers.length} assets ({validAssets.length} valid, {invalidAssets.length} invalid)
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* SP Info Upload Section - only for CSP product */}
                {newCampaign.service === 'CSP' && (
                  <div className="border border-dashed border-gray-300 rounded-lg p-4">
                    <label className="block text-xs font-semibold text-black mb-1.5">
                      Upload CSP Info File (CSP) — columns must match the CSP Info format
                    </label>
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-2 mb-2">
                      <p className="text-[11px] font-semibold text-blue-800 mb-1">
                        Required columns (exact names, any order):
                      </p>
                      <p className="text-[11px] text-blue-700 leading-relaxed break-words">
                        {SP_INFO_REQUIRED_COLUMNS.join(', ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleSpInfoImport}
                        className="hidden"
                        id="sp-info-upload"
                        disabled={spInfoLoading || createLoading}
                      />
                      <label
                        htmlFor="sp-info-upload"
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed rounded-md cursor-pointer transition-all ${spInfoLoading ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#406093]'
                          }`}
                        style={{ borderColor: spInfoLoading ? '#9CA3AF' : themeColor }}
                      >
                        {spInfoLoading ? (
                          <ArrowPathIcon className="h-4 w-4 animate-spin" style={{ color: themeColor }} />
                        ) : (
                          <DocumentArrowUpIcon className="h-4 w-4" style={{ color: themeColor }} />
                        )}
                        <span className="text-sm text-black">
                          {spInfoFile ? spInfoFile.name : 'Choose CSP Info Excel file'}
                        </span>
                      </label>
                    </div>
                    {spInfoData.length > 0 && (
                      <div className="mt-3 bg-green-50 border border-green-200 rounded-md p-2.5">
                        <p className="text-xs font-semibold text-green-700">
                          ✓ {spInfoData.length} CSP Info rows ready to upload
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* PDF Upload and Color Selection */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="border border-dashed border-gray-300 rounded-lg p-4">
                    <label className="block text-xs font-semibold text-black mb-1.5">
                      Upload Script PDFs (Max 10MB each)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={(e) => handlePdfUpload(e, false)}
                        className="hidden"
                        id="pdf-upload"
                        disabled={createLoading}
                      />
                      <label
                        htmlFor="pdf-upload"
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed rounded-md cursor-pointer transition-all hover:border-[#406093]"
                        style={{ borderColor: themeColor }}
                      >
                        <CloudArrowUpIcon className="h-4 w-4" style={{ color: themeColor }} />
                        <span className="text-sm text-black">Choose PDF file</span>
                      </label>
                    </div>

                    {newCampaign.scripts.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-black mb-1.5">
                          Uploaded Scripts ({newCampaign.scripts.length}):
                        </p>
                        <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 bg-gray-50 rounded-md">
                          {newCampaign.scripts.map((script, index) => (
                            <div key={index} className="flex items-center justify-between p-2 bg-white rounded-md border">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <DocumentIcon className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                <span className="text-xs text-black truncate">{script.name}</span>
                                <span className="text-xs text-black shrink-0">
                                  ({(script.size / 1024).toFixed(2)} KB)
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeScript(index, false)}
                                className="text-red-500 hover:text-red-700 shrink-0 ml-1"
                              >
                                <XMarkIcon className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border border-gray-300 rounded-lg p-4">
                    <label className="block text-xs font-semibold text-black mb-1.5">Campaign Color</label>
                    <div className="flex flex-wrap gap-2">
                      {colorOptions.map((color) => (
                        <button
                          key={color.value}
                          type="button"
                          onClick={() => setNewCampaign({ ...newCampaign, color: color.value })}
                          className={`w-8 h-8 rounded-full ${color.class} ${newCampaign.color === color.value ? 'ring-2 ring-offset-1 ring-gray-400' : ''
                            }`}
                          title={color.label}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-black mb-1">Start Date *</label>
                    <input
                      type="date"
                      value={newCampaign.start_date}
                      required
                      onChange={(e) => {
                        const newStartDate = e.target.value;
                        if (isPastDate(newStartDate)) {
                          toast.error('Start date cannot be a past date. Please select today or a future date.');
                          return;
                        }
                        if (newCampaign.end_date && newStartDate > newCampaign.end_date) {
                          setNewCampaign({
                            ...newCampaign,
                            start_date: newStartDate,
                            end_date: ''
                          });
                          toast.error('End date cannot be before start date. Please re-select end date.');
                        } else {
                          setNewCampaign({ ...newCampaign, start_date: newStartDate });
                        }
                      }}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black"
                      style={{ '--tw-ring-color': themeColor }}
                      disabled={createLoading}
                      min={new Date().toISOString().split('T')[0]} // Add this line to disable past dates in the date picker UI
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-black mb-1">End Date</label>
                    <input
                      type="date"
                      value={newCampaign.end_date}
                      onChange={(e) => {
                        const newEndDate = e.target.value;
                        if (newCampaign.start_date && newEndDate < newCampaign.start_date) {
                          toast.error('End date cannot be before start date');
                          return;
                        }
                        setNewCampaign({ ...newCampaign, end_date: newEndDate });
                      }}
                      min={newCampaign.start_date || undefined}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black"
                      style={{ '--tw-ring-color': themeColor }}
                      disabled={createLoading}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={createLoading || !newCampaign.name || !newCampaign.service || !newCampaign.start_date || newCampaign.asset_numbers.length === 0 || invalidAssets.length > 0} className="w-full text-white font-medium rounded-md py-2.5 text-sm hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                >
                  {createLoading ? (
                    <>
                      <ArrowPathIcon className="h-4 w-4 animate-spin" style={{ color: 'white' }} />
                      Creating...
                    </>
                  ) : 'Create Campaign'}
                </button>
                {invalidAssets.length > 0 && (
                  <p className="text-xs text-red-600 text-center">
                    Please remove all invalid assets before creating the campaign
                  </p>
                )}
              </form>
            </div>
          </div>
        )}

        {/* Edit Campaign Modal */}
        {showEditCampaign && (
          <div className="fixed inset-0 flex items-end lg:items-center justify-center z-50 p-3">
            <div
              className="absolute inset-0 backdrop-blur-sm bg-black/20"
              onClick={() => !editLoading && setShowEditCampaign(false)}
            />

            <div className="relative bg-white rounded-xl shadow-xl w-full lg:max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 px-4 py-3 lg:px-5 lg:py-3.5 rounded-t-xl flex justify-between items-center z-10"
                style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>
                <h2 className="text-sm lg:text-base font-semibold text-white">Edit Campaign</h2>
                <button
                  onClick={() => !editLoading && setShowEditCampaign(false)}
                  className="w-7 h-7 bg-white text-black rounded-lg flex items-center justify-center hover:bg-gray-100"
                  disabled={editLoading}
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleEditCampaign} className="p-4 lg:p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-black mb-1">Campaign Name *</label>
                  <input
                    type="text"
                    value={editCampaignData.name}
                    onChange={(e) => setEditCampaignData({ ...editCampaignData, name: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black"
                    style={{ '--tw-ring-color': themeColor }}
                    disabled={editLoading}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-black mb-1">Service/Product *</label>
                  <select
                    value={editCampaignData.service}
                    onChange={(e) => setEditCampaignData({ ...editCampaignData, service: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black"
                    style={{ '--tw-ring-color': themeColor }}
                    disabled={editLoading}
                    required
                  >
                    <option value="">Select Product</option>
                    {services.map(service => (
                      <option key={service.id} value={service.name}>{service.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-black mb-1">Description</label>
                  <textarea
                    value={editCampaignData.description}
                    onChange={(e) => setEditCampaignData({ ...editCampaignData, description: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black"
                    style={{ '--tw-ring-color': themeColor }}
                    rows="2"
                    disabled={editLoading}
                  />
                </div>

                {/* Import Excel Section for Edit */}
                <div className="border border-dashed border-gray-300 rounded-lg p-4">
                  <label className="block text-xs font-semibold text-black mb-1.5">
                    Import Additional Asset Numbers (ASSET NUMBER, BRANCH CODE)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={(e) => handleFileImport(e, true)}
                      className="hidden"
                      id="edit-file-upload"
                      disabled={importLoading || editLoading}
                    />
                    <label
                      htmlFor="edit-file-upload"
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed rounded-md cursor-pointer transition-all ${importLoading ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#406093]'
                        }`}
                      style={{ borderColor: importLoading ? '#9CA3AF' : themeColor }}
                    >
                      {importLoading ? (
                        <ArrowPathIcon className="h-4 w-4 animate-spin" style={{ color: themeColor }} />
                      ) : (
                        <DocumentArrowUpIcon className="h-4 w-4" style={{ color: themeColor }} />
                      )}
                      <span className="text-sm text-black">
                        {importedFile ? importedFile.name : 'Choose Excel file'}
                      </span>
                    </label>
                  </div>

                  {/* Asset Validation Preview for Edit */}
                  {(editCampaignData.asset_numbers.length > 0 || isValidating) && (
                    <div className="mt-3 space-y-2">
                      {isValidating && (
                        <div className="flex items-center justify-center py-3">
                          <ArrowPathIcon className="h-4 w-4 animate-spin" style={{ color: themeColor }} />
                          <span className="ml-2 text-sm text-black">Validating assets...</span>
                        </div>
                      )}

                      {!isValidating && (
                        <>
                          {validAssets.length > 0 && (
                            <div className="bg-green-50 border border-green-200 rounded-md p-3">
                              <p className="text-xs font-semibold text-green-700 mb-1.5">
                                ✓ Valid Assets ({validAssets.length}):
                              </p>
                              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                                {validAssets.map((asset, index) => (
                                  <span
                                    key={index}
                                    className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs"
                                  >
                                    {asset}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {invalidAssets.length > 0 && (
                            <div className="bg-red-50 border border-red-200 rounded-md p-3">
                              <div className="flex items-center justify-between mb-1.5">
                                <p className="text-xs font-semibold text-red-700">
                                  ✗ Not Found in Database ({invalidAssets.length}):
                                </p>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => removeAllInvalidAssets(true)}
                                    className="text-xs text-red-600 hover:text-red-800 font-medium flex items-center gap-0.5"
                                  >
                                    <XMarkIcon className="h-3 w-3" />
                                    Remove All
                                  </button>
                                  <button
                                    type="button"
                                    onClick={exportInvalidAssets}
                                    className="text-xs text-red-600 hover:text-red-800 font-medium flex items-center gap-0.5"
                                  >
                                    <DocumentArrowUpIcon className="h-3 w-3" />
                                    Export
                                  </button>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                                {invalidAssets.map((asset, index) => (
                                  <span
                                    key={index}
                                    className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs"
                                  >
                                    {asset}
                                    <button
                                      type="button"
                                      onClick={() => removeAssetNumber(asset, true)}
                                      className="hover:text-red-600"
                                    >
                                      <XMarkIcon className="h-3 w-3" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="bg-gray-50 rounded-md p-2.5">
                            <p className="text-xs font-semibold text-black">
                              Total: {editCampaignData.asset_numbers.length} assets ({validAssets.length} valid, {invalidAssets.length} invalid)
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* SP Info Upload Section for Edit - only for CSP product */}
                {editCampaignData.service === 'CSP' && (
                  <div className="border border-dashed border-gray-300 rounded-lg p-4">
                    <label className="block text-xs font-semibold text-black mb-1.5">
                      Upload SP Info File (CSP) — re-uploading updates rows by Instance ID
                    </label>
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-2 mb-2">
                      <p className="text-[11px] font-semibold text-blue-800 mb-1">
                        Required columns (exact names, any order):
                      </p>
                      <p className="text-[11px] text-blue-700 leading-relaxed break-words">
                        {SP_INFO_REQUIRED_COLUMNS.join(', ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleSpInfoImport}
                        className="hidden"
                        id="edit-sp-info-upload"
                        disabled={spInfoLoading || editLoading}
                      />
                      <label
                        htmlFor="edit-sp-info-upload"
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed rounded-md cursor-pointer transition-all ${spInfoLoading ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#406093]'
                          }`}
                        style={{ borderColor: spInfoLoading ? '#9CA3AF' : themeColor }}
                      >
                        {spInfoLoading ? (
                          <ArrowPathIcon className="h-4 w-4 animate-spin" style={{ color: themeColor }} />
                        ) : (
                          <DocumentArrowUpIcon className="h-4 w-4" style={{ color: themeColor }} />
                        )}
                        <span className="text-sm text-black">
                          {spInfoFile ? spInfoFile.name : 'Choose CSP Info Excel file'}
                        </span>
                      </label>
                    </div>
                    {spInfoData.length > 0 && (
                      <div className="mt-3 bg-green-50 border border-green-200 rounded-md p-2.5">
                        <p className="text-xs font-semibold text-green-700">
                          ✓ {spInfoData.length} CSP Info rows ready to upload
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* PDF Upload and Color Selection for Edit */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="border border-dashed border-gray-300 rounded-lg p-4">
                    <label className="block text-xs font-semibold text-black mb-1.5">
                      Upload Script PDFs (Max 10MB each)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={(e) => handlePdfUpload(e, true)}
                        className="hidden"
                        id="edit-pdf-upload"
                        disabled={editLoading}
                      />
                      <label
                        htmlFor="edit-pdf-upload"
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed rounded-md cursor-pointer transition-all hover:border-[#406093]"
                        style={{ borderColor: themeColor }}
                      >
                        <CloudArrowUpIcon className="h-4 w-4" style={{ color: themeColor }} />
                        <span className="text-sm text-black">Choose PDF file</span>
                      </label>
                    </div>

                    {editCampaignData.scripts.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-black mb-1.5">
                          Uploaded Scripts ({editCampaignData.scripts.length}):
                        </p>
                        <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 bg-gray-50 rounded-md">
                          {editCampaignData.scripts.map((script, index) => (
                            <div key={index} className="flex items-center justify-between p-2 bg-white rounded-md border">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <DocumentIcon className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                <span className="text-xs text-black truncate">{script.name}</span>
                                <span className="text-xs text-black shrink-0">
                                  ({(script.size / 1024).toFixed(2)} KB)
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeScript(index, true)}
                                className="text-red-500 hover:text-red-700 shrink-0 ml-1"
                              >
                                <XMarkIcon className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border border-gray-300 rounded-lg p-4">
                    <label className="block text-xs font-semibold text-black mb-1.5">Campaign Color</label>
                    <div className="flex flex-wrap gap-2">
                      {colorOptions.map((color) => (
                        <button
                          key={color.value}
                          type="button"
                          onClick={() => setEditCampaignData({ ...editCampaignData, color: color.value })}
                          className={`w-8 h-8 rounded-full ${color.class} ${editCampaignData.color === color.value ? 'ring-2 ring-offset-1 ring-gray-400' : ''
                            }`}
                          title={color.label}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Dates and Status */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-black mb-1">Start Date *</label>
                    <input
                      type="date"
                      value={editCampaignData.start_date}
                      required
                      onChange={(e) => {
                        const newStartDate = e.target.value;
                        if (isPastDate(newStartDate)) {
                          toast.error('Start date cannot be a past date. Please select today or a future date.');
                          return;
                        }
                        if (editCampaignData.end_date && newStartDate > editCampaignData.end_date) {
                          setEditCampaignData({
                            ...editCampaignData,
                            start_date: newStartDate,
                            end_date: ''
                          });
                          toast.error('End date cannot be before start date. Please re-select end date.');
                        } else {
                          setEditCampaignData({ ...editCampaignData, start_date: newStartDate });
                        }
                      }}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black"
                      style={{ '--tw-ring-color': themeColor }}
                      disabled={editLoading}
                      min={new Date().toISOString().split('T')[0]} // Add this line
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-black mb-1">End Date</label>
                    <input
                      type="date"
                      value={editCampaignData.end_date}
                      onChange={(e) => {
                        const newEndDate = e.target.value;
                        if (editCampaignData.start_date && newEndDate < editCampaignData.start_date) {
                          toast.error('End date cannot be before start date');
                          return;
                        }
                        setEditCampaignData({ ...editCampaignData, end_date: newEndDate });
                      }}
                      min={editCampaignData.start_date || undefined}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black"
                      style={{ '--tw-ring-color': themeColor }}
                      disabled={editLoading}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-black mb-1">Status</label>
                    <div className="flex gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => setEditCampaignData({ ...editCampaignData, status: "active" })}
                        className={`flex-1 px-2 py-1 rounded-md text-sm font-medium transition-all ${editCampaignData.status === "active"
                          ? "bg-green-500 text-white"
                          : "bg-gray-100 text-black hover:bg-gray-200"
                          }`}
                      >
                        Active
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditCampaignData({ ...editCampaignData, status: "inactive" })}
                        className={`flex-1 px-2 py-1 rounded-md text-sm font-medium transition-all ${editCampaignData.status === "inactive"
                          ? "bg-gray-500 text-white"
                          : "bg-gray-100 text-black hover:bg-gray-200"
                          }`}
                      >
                        Inactive
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={editLoading || !editCampaignData.name || !editCampaignData.service || !editCampaignData.start_date || editCampaignData.asset_numbers.length === 0 || invalidAssets.length > 0} className="w-full text-white font-medium rounded-md py-1.5 text-sm hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                >
                  {editLoading ? (
                    <>
                      <ArrowPathIcon className="h-4 w-4 animate-spin" style={{ color: 'white' }} />
                      Updating...
                    </>
                  ) : 'Update Campaign'}
                </button>
                {invalidAssets.length > 0 && (
                  <p className="text-xs text-red-600 text-center">
                    Please remove all invalid assets before updating the campaign
                  </p>
                )}
              </form>
            </div>
          </div>
        )}

        {/* Add Service Modal */}
        {showServiceForm && (
          <div className="fixed inset-0 flex items-end lg:items-center justify-center z-50 p-3">
            <div
              className="absolute inset-0 backdrop-blur-sm bg-black/20"
              onClick={() => !serviceLoading && setShowServiceForm(false)}
            />

            <div className="relative bg-white rounded-xl shadow-xl w-full lg:max-w-md max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 px-4 py-3 lg:px-5 lg:py-3.5 rounded-t-xl flex justify-between items-center z-10"
                style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>
                <h2 className="text-sm lg:text-base font-semibold text-white">Add New Product</h2>
                <button
                  onClick={() => !serviceLoading && setShowServiceForm(false)}
                  className="w-7 h-7 bg-white text-black rounded-lg flex items-center justify-center hover:bg-gray-100"
                  disabled={serviceLoading}
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleAddService} className="p-4 lg:p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-black mb-1">Product Name *</label>
                  <input
                    type="text"
                    value={newService.name}
                    onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black"
                    style={{ '--tw-ring-color': themeColor }}
                    placeholder="e.g., Battery"
                    disabled={serviceLoading}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={serviceLoading || !newService.name}
                  className="w-full text-white font-medium rounded-md py-1.5 text-sm hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                >
                  {serviceLoading ? (
                    <>
                      <ArrowPathIcon className="h-4 w-4 animate-spin" style={{ color: 'white' }} />
                      Adding...
                    </>
                  ) : 'Add Product'}
                </button>
              </form>

              {/* Products List Section with Scrollbar */}
              {services.length > 0 && (
                <div className="px-4 lg:px-5 pb-5">
                  <div className="border-t pt-4">
                    <h3 className="text-xs font-semibold text-black mb-2.5 flex items-center gap-1.5">
                      Available Products ({services.length})
                    </h3>
                    <div className="max-h-52 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                      {services.map(service => (
                        <div
                          key={service.id}
                          className="flex items-center justify-between p-2 bg-gray-50 rounded-md hover:bg-gray-100 transition-all group"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-black truncate">{service.name}</p>
                            {service.description && (
                              <p className="text-xs text-black truncate mt-0.5">{service.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5 ml-2">
                            <button
                              onClick={(e) => openEditServiceModal(service, e)}
                              className="p-1 text-black hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all"
                              title="Edit product"
                            >
                              <PencilIcon className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => openDeleteServiceConfirm(service, e)}
                              className="p-1 text-black hover:text-red-600 hover:bg-red-50 rounded-md transition-all"
                              title="Delete product"
                            >
                              <XMarkIcon className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Edit Service Modal */}
        {showEditServiceForm && (
          <div className="fixed inset-0 flex items-end lg:items-center justify-center z-50 p-3">
            <div
              className="absolute inset-0 backdrop-blur-sm bg-black/20"
              onClick={() => !editServiceLoading && setShowEditServiceForm(false)}
            />

            <div className="relative bg-white rounded-xl shadow-xl w-full lg:max-w-md">
              <div className="px-4 py-3 lg:px-5 lg:py-3.5 rounded-t-xl flex justify-between items-center"
                style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>
                <h2 className="text-sm lg:text-base font-semibold text-white">Edit Product</h2>
                <button
                  onClick={() => !editServiceLoading && setShowEditServiceForm(false)}
                  className="w-7 h-7 bg-white text-black rounded-lg flex items-center justify-center hover:bg-gray-100"
                  disabled={editServiceLoading}
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleEditService} className="p-4 lg:p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-black mb-1">Product Name *</label>
                  <input
                    type="text"
                    value={editServiceData.name}
                    onChange={(e) => setEditServiceData({ ...editServiceData, name: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black"
                    style={{ '--tw-ring-color': themeColor }}
                    placeholder="e.g., Battery"
                    disabled={editServiceLoading}
                    required
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowEditServiceForm(false)}
                    disabled={editServiceLoading}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-black hover:bg-gray-50 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editServiceLoading || !editServiceData.name}
                    className="flex-1 text-white font-medium rounded-md py-2 text-sm hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                  >
                    {editServiceLoading ? (
                      <>
                        <ArrowPathIcon className="h-4 w-4 animate-spin" style={{ color: 'white' }} />
                        Updating...
                      </>
                    ) : 'Update Product'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Service Confirmation Modal */}
        {showDeleteServiceConfirm && serviceToDelete && (
          <div className="fixed inset-0 flex items-end lg:items-center justify-center z-50 p-0 lg:p-3">
            <div
              className="absolute inset-0 backdrop-blur-sm bg-black/20"
              onClick={() => !serviceLoading && setShowDeleteServiceConfirm(false)}
            />

            <div className="relative bg-white rounded-xl shadow-xl w-full lg:max-w-md">
              <div className="px-4 py-3 lg:px-5 lg:py-3.5 rounded-t-xl bg-red-500 flex justify-between items-center">
                <h2 className="text-sm lg:text-base font-semibold text-white">Delete Product</h2>
                <button
                  onClick={() => !serviceLoading && setShowDeleteServiceConfirm(false)}
                  className="text-white hover:text-gray-200 p-0.5"
                  disabled={serviceLoading}
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="p-4 lg:p-5">
                <p className="text-sm lg:text-sm text-black mb-4">
                  Are you sure you want to delete product <span className="font-semibold">{serviceToDelete.name}</span>?
                  This action cannot be undone if the product is not used in any campaign.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => !serviceLoading && setShowDeleteServiceConfirm(false)}
                    disabled={serviceLoading}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-black hover:bg-gray-50 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteService}
                    disabled={serviceLoading}
                    className="flex-1 px-3 py-2 bg-red-500 text-white rounded-md text-sm font-medium hover:bg-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {serviceLoading ? (
                      <>
                        <ArrowPathIcon className="h-4 w-4 animate-spin" style={{ color: 'white' }} />
                        Deleting...
                      </>
                    ) : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Campaigns Grid with Optimized Loading */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Show loading skeletons while campaigns are being loaded */}
          {loading && campaigns.length === 0 && (
            <>
              <CampaignSkeleton />
              <CampaignSkeleton />
              <CampaignSkeleton />
              <CampaignSkeleton />
            </>
          )}

          {/* Show campaigns progressively — first batch instantly, rest stream in */}
          {!loading && visibleCampaigns.map(campaign => (
            <div
              key={campaign.id}
              className="bg-white rounded-xl shadow-lg overflow-hidden transition-all hover:shadow-xl flex flex-col h-[300px] animate-fadeIn"
            >
              <div className="px-3 py-2.5 flex justify-between items-center shrink-0" style={{ backgroundColor: campaign.color || themeColor }}>
                <h3
                  className="font-semibold text-white text-sm lg:text-base truncate pr-2 hover:underline cursor-pointer"
                  onClick={() => handleCampaignClick(campaign)}
                >
                  {campaign.name}
                </h3>
                <div className="flex items-center gap-1 shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${getStatusBadgeClass(campaign.status)}`}>
                    {campaign.status}
                  </span>
                  <button
                    onClick={(e) => openEditModal(campaign, e)}
                    className="p-1 text-white hover:bg-white/20 rounded-md transition-all"
                    title="Edit campaign"
                  >
                    <PencilIcon className="h-3.5 w-3.5" />
                  </button>
                  {campaign.status === 'inactive' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openDeleteCampaignConfirm(campaign); }}
                      className="p-1 text-white hover:bg-white/20 rounded-md transition-all"
                      title="Delete campaign"
                    >
                      <XMarkIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                <div className="mb-3">
                  <p className="text-sm text-black break-words whitespace-pre-wrap">
                    {campaign.description || 'No description provided'}
                  </p>
                </div>

                {campaign.scripts && campaign.scripts.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-black mb-1">Scripts ({campaign.scripts?.length || 0}):</p>
                    <div className="flex flex-wrap gap-2">
                      {campaign.scripts?.slice(0, 2).map((script, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 text-xs text-black">
                          <DocumentIcon className="h-3 w-3 text-red-500 shrink-0" />
                          <span className="truncate max-w-[150px]">{script.name}</span>
                        </div>
                      ))}
                      {campaign.scripts?.length > 2 && (
                        <p className="text-xs text-black">+{campaign.scripts.length - 2} more</p>
                      )}
                    </div>
                  </div>
                )}

                {campaign.created_by_name && (
                  <div className="mb-2 text-xs text-black">
                    Created by: {campaign.created_by_name} {campaign.created_by_id && `(ID: ${campaign.created_by_id})`}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="flex items-center gap-1.5 text-sm min-w-0">
                    <CalendarIcon className="h-3.5 w-3.5 shrink-0" style={{ color: themeColor }} />
                    <span className="text-black truncate">
                      Start: {formatDate(campaign.start_date)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm min-w-0">
                    <ClockIcon className="h-3.5 w-3.5 shrink-0" style={{ color: themeColor }} />
                    <span className="text-black truncate">
                      End: {campaign.end_date ? formatDate(campaign.end_date) : 'Ongoing'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t mt-auto">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-800 rounded-full truncate max-w-[120px]">
                      {campaign.service}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 ml-auto">
                    <button
                      onClick={(e) => openFollowupModal(campaign, e)}
                      className="px-2 py-1 text-xs font-medium text-white bg-[#2f3192] rounded-md hover:bg-[#2f3192]/90 transition-all whitespace-nowrap"
                      title="View customer follow-ups"
                    >
                      View All
                    </button>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-sm text-black" title="Pending Follow-ups">
                        <UserGroupIcon className="h-3.5 w-3.5" style={{ color: themeColor }} />
                        <span>
                          {campaignCounts[campaign.id]?.pending !== undefined
                            ? campaignCounts[campaign.id].pending
                            : campaign.asset_numbers?.length || 0}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 text-sm text-green-600" title="Completed Follow-ups">
                        <CheckCircleIcon className="h-3.5 w-3.5" />
                        <span>{campaignCounts[campaign.id]?.completed || 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {!loading && filteredCampaigns.length === 0 && campaigns.length === 0 && (
            <div className="col-span-1 lg:col-span-2 text-center py-10 bg-white rounded-xl">
              <MegaphoneIcon className="h-10 w-10 mx-auto mb-3" style={{ color: themeColor }} />
              <p className="text-sm text-black">No campaigns found</p>
              <button
                onClick={() => {
                  resetForm();
                  setShowCampaignForm(true);
                }}
                className="mt-2 text-sm font-medium hover:underline"
                style={{ color: themeColor }}
              >
                Create your first campaign
              </button>
            </div>
          )}

          {!loading && filteredCampaigns.length === 0 && campaigns.length > 0 && (
            <div className="col-span-1 lg:col-span-2 text-center py-10 bg-white rounded-xl">
              <MagnifyingGlassIcon className="h-10 w-10 mx-auto mb-3" style={{ color: themeColor }} />
              <p className="text-sm text-black">No campaigns match your search criteria</p>
              <button
                onClick={() => setSearchTerm('')}
                className="mt-2 text-sm font-medium hover:underline"
                style={{ color: themeColor }}
              >
                Clear search
              </button>
            </div>
          )}

          {showDeleteCampaignConfirm && campaignToDelete && (
            <div className="fixed inset-0 flex items-center justify-center z-50 p-3">
              <div
                className="absolute inset-0 backdrop-blur-sm bg-black/20"
                onClick={() => !deleteLoading && setShowDeleteCampaignConfirm(false)}
              />
              <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
                <div className="flex items-center justify-center w-14 h-14 mx-auto mb-4 rounded-full bg-red-100">
                  <XMarkIcon className="h-7 w-7 text-red-500" />
                </div>
                <h2 className="text-base font-bold text-black mb-1">Delete Campaign?</h2>
                <p className="text-sm text-gray-500 mb-1">
                  Are you really sure you want to permanently delete
                </p>
                <p className="text-sm font-semibold text-black mb-4">
                  "{campaignToDelete.name}"?
                </p>
                <p className="text-xs text-red-500 mb-5">
                  ⚠️ This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => !deleteLoading && setShowDeleteCampaignConfirm(false)}
                    disabled={deleteLoading}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-black hover:bg-gray-50 transition-all disabled:opacity-50"
                  >
                    No, Keep it
                  </button>
                  <button
                    onClick={handleDeleteCampaign}
                    disabled={deleteLoading}
                    className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {deleteLoading ? (
                      <><ArrowPathIcon className="h-4 w-4 animate-spin" /> Deleting...</>
                    ) : 'Yes, Delete!'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Customer Follow-ups Modal */}
      <CampaignCustomersFollowupModal
        isOpen={showFollowupModal}
        onClose={() => {
          setShowFollowupModal(false);
          setSelectedCampaignForModal(null);
        }}
        campaign={selectedCampaignForModal}
        apiBaseUrl={API_BASE_URL}
      />

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
        
        .overflow-y-auto {
          scrollbar-width: thin;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default Campaign;