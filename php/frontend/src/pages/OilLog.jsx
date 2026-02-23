import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Link, useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../api.js';
import {
    oilChecklistItems,
    oilTimeSegments,
    createChecklistState,
    oilChecklistOtherId,
    fuelCategories,
    createFuelDetailsState,
} from '../data/oilLog.js';
import { BASE_DEPARTMENT_OPTIONS } from './checklistShared.js';
import { useAuth } from '../context/AuthContext.jsx';


import oil from '../images/oil.jpg';


const MAX_PHOTO_ATTACHMENTS = 5;
const MAX_PHOTO_SIZE_MB = 8;
const MAX_PHOTO_SIZE_BYTES = MAX_PHOTO_SIZE_MB * 1024 * 1024;
const operatorRoleKeys = ['operator', 'driver'];
const BASE_PUMP_LOCATION_OPTIONS = ['ปั้มในบริษัท'];
const resolveApprovalHost = () => {
    const envHost = typeof import.meta !== 'undefined' ? (import.meta.env?.VITE_APPROVAL_HOST || import.meta.env?.VITE_API_HOST || '') : '';
    const trimmedEnv = envHost ? envHost.trim() : '';
    if (trimmedEnv) return trimmedEnv.replace(/\/$/, '');
    if (typeof window !== 'undefined' && window.location?.hostname) {
        return window.location.hostname;
    }
    return 'localhost';
};

const resolveApprovalOrigin = () => {
    if (typeof window === 'undefined') {
        return '';
    }
    const protocol = window.location?.protocol || 'http:';
    const portSegment = window.location?.port ? `:${window.location.port}` : '';
    const host = resolveApprovalHost();
    return `${protocol}//${host}${portSegment}`;
};
const approvalModalStyles = {
    backdrop: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        zIndex: 1000,
    },
    card: {
        width: '100%',
        maxWidth: '520px',
        background: '#fff',
        borderRadius: '20px',
        padding: '28px',
        boxShadow: '0 25px 60px rgba(15, 24, 56, 0.35)',
        textAlign: 'center',
        position: 'relative',
    },
    closeButton: {
        position: 'absolute',
        top: '14px',
        right: '14px',
        border: 'none',
        background: 'transparent',
        fontSize: '24px',
        cursor: 'pointer',
        lineHeight: 1,
    },
    qrImage: {
        width: '100%',
        maxWidth: '320px',
        margin: '0 auto 16px auto',
        display: 'block',
    },
    linkRow: {
        display: 'flex',
        gap: '8px',
        alignItems: 'stretch',
        marginTop: '12px',
    },
    linkInput: {
        flex: 1,
        borderRadius: '10px',
        border: '1px solid #d0d7de',
        padding: '10px 12px',
        fontSize: '14px',
    },
    copyButton: {
        borderRadius: '10px',
        border: 'none',
        background: '#0b6efd',
        color: '#fff',
        padding: '0 16px',
        fontWeight: 600,
        cursor: 'pointer',
    },
    primaryButton: {
        marginTop: '16px',
        width: '100%',
        borderRadius: '12px',
        border: 'none',
        background: '#111b47',
        color: '#fff',
        padding: '12px 16px',
        fontSize: '16px',
        fontWeight: 600,
        cursor: 'pointer',
    },
    secondaryButton: {
        marginTop: '12px',
        width: '100%',
        borderRadius: '12px',
        border: '1px solid #d0d7de',
        background: '#f5f7fb',
        color: '#111b47',
        padding: '12px 16px',
        fontSize: '15px',
        fontWeight: 600,
        cursor: 'pointer',
    },
    feedbackText: {
        marginTop: '8px',
        fontSize: '13px',
        color: '#198754',
    },
};

const normalizeRoleList = (rolesInput) => {
    if (!Array.isArray(rolesInput)) {
        return [];
    }
    return rolesInput
        .map((role) => (typeof role === 'string' ? role.trim().toLowerCase() : ''))
        .filter(Boolean);
};

const userHasAnyRole = (user, expectedRoles) => {
    if (!user || !Array.isArray(expectedRoles) || !expectedRoles.length) {
        return false;
    }
    const source = Array.isArray(user.roles) && user.roles.length
        ? user.roles
        : (user.role ? [user.role] : []);
    const normalized = normalizeRoleList(source);
    return normalized.some((role) => expectedRoles.includes(role));
};

const resolveOperatorDefaults = (user) => {
    if (!user) {
        return { operatorName: '', operatorAccountId: null };
    }
    if (!userHasAnyRole(user, operatorRoleKeys)) {
        return { operatorName: '', operatorAccountId: null };
    }
    const preferredLabel = (user.displayName || '').trim();
    const constructedName = [user.name, user.lastname]
        .map((part) => (part || '').trim())
        .filter(Boolean)
        .join(' ')
        .trim();
    const fallbackUsername = (user.Username || '').trim();
    const operatorName = preferredLabel || constructedName || fallbackUsername;
    const numericCenterId = Number(user.Center_Id);
    return {
        operatorName,
        operatorAccountId: Number.isFinite(numericCenterId) && numericCenterId > 0 ? numericCenterId : null,
    };
};

const formatPersonnelOptionLabel = (option) => {
    if (!option) {
        return '';
    }
    const base = (option.fullName || option.username || '').trim();
    const parts = [];
    if (option.centerName) {
        parts.push(option.centerName);
    }
    if (option.employeeId) {
        parts.push(`#${option.employeeId}`);
    }
    return parts.length ? `${base || 'ไม่ระบุชื่อ'} · ${parts.join(' · ')}` : (base || 'ไม่ระบุชื่อ');
};

const formatFileSize = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return '0.00 MB';
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const parseTimeToMinutes = (value) => {
    if (!value) {
        return null;
    }
    let sanitized = value.trim();
    if (!sanitized) {
        return null;
    }
    sanitized = sanitized.replace(/\s+/g, '');
    sanitized = sanitized.replace(/\.+/g, ':');
    sanitized = sanitized.replace(/[^0-9:]/g, '');
    if (!sanitized) {
        return null;
    }
    if (sanitized.includes(':')) {
        const [hoursPart, minutesPart] = sanitized.split(':');
        if (typeof minutesPart === 'undefined') {
            return null;
        }
        const hours = Number(hoursPart);
        const minutes = Number(minutesPart);
        if ([hours, minutes].some((segment) => Number.isNaN(segment))) {
            return null;
        }
        if (minutes < 0 || minutes >= 60) {
            return null;
        }
        return (hours * 60) + minutes;
    }
    if (/^\d{3,4}$/.test(sanitized)) {
        const padded = sanitized.padStart(4, '0');
        const hours = Number(padded.slice(0, 2));
        const minutes = Number(padded.slice(2));
        if (minutes < 0 || minutes >= 60) {
            return null;
        }
        return (hours * 60) + minutes;
    }
    if (/^\d{1,2}$/.test(sanitized)) {
        return Number(sanitized) * 60;
    }
    return null;
};

const formatMinutesToClock = (minutes) => {
    if (!Number.isFinite(minutes)) {
        return '';
    }
    const safeMinutes = Math.max(0, Math.round(minutes));
    const hours = Math.floor(safeMinutes / 60);
    const mins = safeMinutes % 60;
    return `${hours}:${String(mins).padStart(2, '0')}`;
};

const clockStringToDecimalHours = (value) => {
    const minutes = parseTimeToMinutes(value);
    if (minutes === null) {
        return null;
    }
    return Number((minutes / 60).toFixed(2));
};

const formatDateTimeLocal = (input = new Date()) => {
    const date = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    const pad = (value) => String(value).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const createDefaultForm = (overrides = {}) => {
    const normalizedOverrides = { ...overrides };
    if (normalizedOverrides.documentDate) {
        normalizedOverrides.documentDate = formatDateTimeLocal(normalizedOverrides.documentDate);
    }
    return {
        documentDate: formatDateTimeLocal(),
        documentNo: '',
        projectName: '',
        locationName: '',
        requesterName: '',
        workOrder: '',
        supervisorName: '',
        machineCode: '',
        machineName: '',
        operationDetails: '',
        fuelType: '',
        customFuelType: '',
        fuelAmountLiters: '',
        fuelTicketNo: '',
        fuelTime: '',
        tankBeforeLiters: '',
        tankAfterLiters: '',
        meterHourStart: '',
        meterHourEnd: '',
        odometerStart: '',
        odometerEnd: '',
        workMeterStart: '',
        workMeterEnd: '',
        workMeterTotal: '',
        timeMorningStart: '',
        timeMorningEnd: '',
        timeMorningTotal: '',
        timeAfternoonStart: '',
        timeAfternoonEnd: '',
        timeAfternoonTotal: '',
        timeOtStart: '',
        timeOtEnd: '',
        timeOtTotal: '',
        operatorName: '',
        operatorAccountId: null,
        assistantName: '',
        assistantAccountId: null,
        recorderName: '',
        recorderAccountId: null,
        notes: '',
        checklist: createChecklistState(),
        checklistOtherNote: '',
        fuelDetails: createFuelDetailsState(),
        ...normalizedOverrides,
    };
};

export default function OilLog() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const canAutoFillOperator = useMemo(() => userHasAnyRole(user, operatorRoleKeys), [user]);
    const operatorDefaults = useMemo(() => resolveOperatorDefaults(user), [user]);
    const [form, setForm] = useState(() => createDefaultForm(operatorDefaults));
    const [approvalOrigin] = useState(() => resolveApprovalOrigin());
    const [machines, setMachines] = useState([]);
    const [projectOptions, setProjectOptions] = useState([]);
    const [projectIsOther, setProjectIsOther] = useState(false);
    const [locationIsOther, setLocationIsOther] = useState(false);
    const [logs, setLogs] = useState([]);
    const [summary, setSummary] = useState({ count: 0, total_liters: 0 });
    const [loadingLogs, setLoadingLogs] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [showMachineOptions, setShowMachineOptions] = useState(false);
    const [machineHighlightIndex, setMachineHighlightIndex] = useState(0);
    const [photoFiles, setPhotoFiles] = useState([]);
    const [photoError, setPhotoError] = useState('');
    const [driverOptions, setDriverOptions] = useState([]);
    const [loadingPersonnel, setLoadingPersonnel] = useState(true);
    const [personnelError, setPersonnelError] = useState('');
    const [approvalPreview, setApprovalPreview] = useState({ visible: false, url: '', token: '', expiresAt: '', oilLogId: null });
    const [approvalCopyFeedback, setApprovalCopyFeedback] = useState('');
    const [approvalQrDataUrl, setApprovalQrDataUrl] = useState('');
    const [approvalStatus, setApprovalStatus] = useState(null);
    const machinePickerRef = useRef(null);
    const photoInputRef = useRef(null);
    const approvalWatcherRef = useRef(null);

    const buildApprovalUrl = (path = '') => {
        if (!path) {
            return '';
        }
        if (/^https?:\/\//i.test(path)) {
            return path;
        }
        if (path.startsWith('#')) {
            return `${approvalOrigin}${path}`;
        }
        return `${approvalOrigin}${path.startsWith('/') ? path : `/${path}`}`;
    };

    const stopApprovalWatcher = () => {
        if (approvalWatcherRef.current) {
            window.clearInterval(approvalWatcherRef.current);
            approvalWatcherRef.current = null;
        }
    };

    const closeApprovalPreview = () => {
        stopApprovalWatcher();
        setApprovalPreview((prev) => ({ ...prev, visible: false }));
        setApprovalCopyFeedback('');
        setApprovalQrDataUrl('');
        setApprovalStatus(null);
        navigate('/worksite', { replace: true });
    };

    const confirmCloseApprovalPreview = () => {
        const shouldClose = typeof window === 'undefined'
            ? true
            : window.confirm('ยืนยันที่จะปิดหน้าต่างนี้หรือไม่? หากปิดจะกลับไปหน้าหลักและไม่สามารถเปิดหน้านี้ได้อีก');
        if (shouldClose) {
            closeApprovalPreview();
        }
    };

    const handleCopyApprovalUrl = async () => {
        if (!approvalPreview.url) {
            return;
        }
        if (typeof navigator === 'undefined' || !navigator.clipboard) {
            setApprovalCopyFeedback('อุปกรณ์นี้ไม่รองรับการคัดลอกอัตโนมัติ');
            window.setTimeout(() => setApprovalCopyFeedback(''), 2500);
            return;
        }
        try {
            await navigator.clipboard.writeText(approvalPreview.url);
            setApprovalCopyFeedback('คัดลอกลิงก์แล้ว');
            window.setTimeout(() => setApprovalCopyFeedback(''), 2500);
        } catch (_) {
            setApprovalCopyFeedback('คัดลอกไม่สำเร็จ');
            window.setTimeout(() => setApprovalCopyFeedback(''), 2500);
        }
    };

    const handleDownloadApprovalQr = () => {
        if (!approvalQrDataUrl) {
            return;
        }
        const slug = approvalPreview.oilLogId ? `oil-approval-${approvalPreview.oilLogId}` : 'oil-approval';
        const anchor = document.createElement('a');
        anchor.href = approvalQrDataUrl;
        anchor.download = `${slug}.png`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    };

    useEffect(() => {
        let cancelled = false;
        async function generateQr() {
            if (!approvalPreview.url) {
                setApprovalQrDataUrl('');
                return;
            }
            try {
                const dataUrl = await QRCode.toDataURL(approvalPreview.url, {
                    width: 360,
                    margin: 1,
                    errorCorrectionLevel: 'H',
                    color: {
                        dark: '#111b47',
                        light: '#ffffff',
                    },
                });
                if (!cancelled) {
                    setApprovalQrDataUrl(dataUrl);
                }
            } catch (_) {
                if (!cancelled) {
                    setApprovalQrDataUrl('');
                }
            }
        }
        generateQr();
        return () => {
            cancelled = true;
        };
    }, [approvalPreview.url]);

    useEffect(() => {
        if (!approvalPreview.visible || !approvalPreview.token || !approvalPreview.oilLogId) {
            stopApprovalWatcher();
            setApprovalStatus(null);
            return;
        }
        let cancelled = false;
        const fetchStatus = async () => {
            try {
                const data = await apiGet(`/api/oillog_approvals.php?oilLogId=${approvalPreview.oilLogId}&token=${approvalPreview.token}`);
                if (cancelled) {
                    return;
                }
                setApprovalStatus({
                    oilerDone: Boolean(data?.approval?.oiler?.approved_at),
                    oilerName: data?.approval?.oiler?.full_name || '',
                    fetchedAt: Date.now(),
                });
            } catch (err) {
                if (!cancelled) {
                    setApprovalStatus((prev) => prev ? { ...prev, error: err.message || 'โหลดสถานะไม่สำเร็จ' } : { error: err.message || 'โหลดสถานะไม่สำเร็จ' });
                }
            }
        };
        fetchStatus();
        stopApprovalWatcher();
        approvalWatcherRef.current = window.setInterval(fetchStatus, 5000);
        return () => {
            cancelled = true;
            stopApprovalWatcher();
        };
    }, [approvalPreview.visible, approvalPreview.token, approvalPreview.oilLogId]);

    useEffect(() => {
        if (approvalStatus?.oilerDone) {
            stopApprovalWatcher();
            setSuccessMessage('บันทึกข้อมูลเรียบร้อย (พนักงานออยเลอร์ยืนยันแล้ว)');
        }
    }, [approvalStatus]);

    useEffect(() => {
        (async () => {
            try {
                const data = await apiGet('/api/machines.php?limit=5000');
                const normalized = (data.items || []).map((row) => ({
                    code: row.Equipment || String(row.Machine_Id),
                    description: (row.Description || '').trim(),
                    type: row.Machine_Type || '',
                }));
                setMachines(normalized);
            } catch (_) {
            }
        })();
    }, []);

    useEffect(() => {
        try {
            const list = Array.isArray(BASE_DEPARTMENT_OPTIONS) ? BASE_DEPARTMENT_OPTIONS.slice() : [];
            setProjectOptions(list);
        } catch (_) {
            setProjectOptions([]);
        }
    }, []);

    useEffect(() => {
        if (!canAutoFillOperator) {
            return;
        }
        const defaults = resolveOperatorDefaults(user);
        setForm((prev) => {
            const sameName = (defaults.operatorName || '') === (prev.operatorName || '');
            const sameId = (defaults.operatorAccountId ?? null) === (prev.operatorAccountId ?? null);
            if (sameName && sameId) {
                return prev;
            }
            return { ...prev, ...defaults };
        });
    }, [user, canAutoFillOperator]);

    const refreshLogs = async () => {
        try {
            setLoadingLogs(true);
            const data = await apiGet('/api/oillogs.php?limit=5');
            setLogs(data.items || []);
            setSummary(data.summary || { count: 0, total_liters: 0 });
        } catch (err) {
            setError(err.message || 'ไม่สามารถโหลดประวัติได้');
        } finally {
            setLoadingLogs(false);
        }
    };

    useEffect(() => {
        refreshLogs();
    }, []);

    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();

        async function fetchDriverDirectory() {
            if (canAutoFillOperator) {
                setDriverOptions([]);
                setLoadingPersonnel(false);
                setPersonnelError('');
                return;
            }
            setLoadingPersonnel(true);
            setPersonnelError('');
            try {
                const params = new URLSearchParams();
                operatorRoleKeys.forEach((role) => params.append('role', role));
                params.append('limit', '500');
                const data = await apiGet(`/api/users.php?${params.toString()}`, { signal: controller.signal });
                if (!cancelled) {
                    setDriverOptions(Array.isArray(data.items) ? data.items : []);
                }
            } catch (err) {
                if (!cancelled && err?.name !== 'AbortError') {
                    setPersonnelError(err.message || 'ไม่สามารถโหลดรายชื่อพนักงานขับได้');
                    setDriverOptions([]);
                }
            } finally {
                if (!cancelled) {
                    setLoadingPersonnel(false);
                }
            }
        }

        fetchDriverDirectory();
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [user?.Center_Id, canAutoFillOperator]);

    const activeFuelItems = useMemo(() => {
        return fuelCategories
            .map((category) => {
                const entry = form.fuelDetails[category.id] || {};
                if (!entry.enabled) {
                    return null;
                }
                const liters = parseFloat(entry.liters);
                if (Number.isNaN(liters) || liters <= 0) {
                    return null;
                }
                return {
                    id: category.id,
                    label: category.label,
                    code: (entry.code || '').trim(),
                    liters,
                };
            })
            .filter(Boolean);
    }, [form.fuelDetails]);

    const totalFuelLiters = useMemo(() => {
        return activeFuelItems.reduce((sum, item) => sum + item.liters, 0);
    }, [activeFuelItems]);

    const formattedFuelTotal = totalFuelLiters > 0 ? totalFuelLiters.toFixed(2) : '0.00';

    const machineOptions = useMemo(() => {
        const mapped = machines.map((machine) => {
            const description = (machine.description || '').trim();
            const label = description ? `${machine.code} · ${description}` : machine.code;
            return {
                value: machine.code,
                label,
                description,
                type: machine.type || '',
            };
        });
        mapped.sort((a, b) => a.value.localeCompare(b.value));
        return mapped;
    }, [machines]);

    const filteredMachineOptions = useMemo(() => {
        const query = (form.machineCode || '').trim().toLowerCase();
        const baseList = query
            ? machineOptions.filter((option) => option.value.toLowerCase().includes(query))
            : machineOptions;
        return baseList.slice(0, 50);
    }, [form.machineCode, machineOptions]);

    const filteredMachineCount = filteredMachineOptions.length;

    useEffect(() => {
        if (!filteredMachineCount) {
            setMachineHighlightIndex(0);
            return;
        }
        setMachineHighlightIndex((prev) => Math.min(prev, filteredMachineCount - 1));
    }, [filteredMachineCount]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (!machinePickerRef.current) {
                return;
            }
            if (!machinePickerRef.current.contains(event.target)) {
                setShowMachineOptions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const findMachineByCode = (code) => {
        if (!code) {
            return null;
        }
        const lookup = code.trim().toLowerCase();
        return machines.find((machine) => machine.code.toLowerCase() === lookup) || null;
    };

    const handleChange = (field) => (event) => {
        const value = event.target.value;
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleMachineInputChange = (event) => {
        const value = event.target.value;
        setForm((prev) => {
            const next = { ...prev, machineCode: value };
            if (!value) {
                next.machineName = '';
                next.machineDescription = '';
            } else {
                const match = findMachineByCode(value);
                if (match) {
                    const label = match.description || match.code;
                    next.machineName = label;
                    next.machineDescription = match.type ? `${label} (${match.type})` : label;
                } else {
                    next.machineName = '';
                    next.machineDescription = '';
                }
            }
            return next;
        });
        setShowMachineOptions(true);
        setMachineHighlightIndex(0);
    };

    const handleDriverSelect = (event) => {
        const selectedValue = event.target.value;
        setForm((prev) => {
            if (!selectedValue) {
                return { ...prev, operatorName: '', operatorAccountId: null };
            }
            const selected = driverOptions.find((option) => {
                const rawId = option.id ?? option.username ?? '';
                return String(rawId) === selectedValue;
            });
            if (!selected) {
                return { ...prev, operatorName: '', operatorAccountId: null };
            }
            const label = (selected.fullName || selected.username || '').trim();
            return {
                ...prev,
                operatorName: label,
                operatorAccountId: selected.id ?? null,
            };
        });
    };

    const handleFuelToggle = (categoryId) => (event) => {
        const enabled = event.target.checked;
        setForm((prev) => {
            const nextDetails = {
                ...prev.fuelDetails,
                [categoryId]: {
                    ...(prev.fuelDetails[categoryId] || {}),
                    enabled,
                    liters: enabled ? prev.fuelDetails[categoryId]?.liters || '' : '',
                    code: enabled ? prev.fuelDetails[categoryId]?.code || '' : '',
                },
            };
            return {
                ...prev,
                fuelDetails: nextDetails,
            };
        });
    };

    const handleFuelDetailChange = (categoryId, field) => (event) => {
        const value = event.target.value;
        setForm((prev) => ({
            ...prev,
            fuelDetails: {
                ...prev.fuelDetails,
                [categoryId]: {
                    ...(prev.fuelDetails[categoryId] || {}),
                    [field]: value,
                },
            },
        }));
    };

    const handleSelectMachine = (option) => {
        if (!option) return;
        setForm((prev) => {
            const label = option.description || option.value;
            const descriptionText = option.type ? `${label} (${option.type})` : label;
            return {
                ...prev,
                machineCode: option.value,
                machineName: label,
                machineDescription: descriptionText,
            };
        });
        setShowMachineOptions(false);
        setMachineHighlightIndex(0);
    };

    const handleMachineBlur = () => {
        window.setTimeout(() => setShowMachineOptions(false), 120);
        setForm((prev) => {
            if (!prev.machineCode) {
                if (!prev.machineName && !prev.machineDescription) {
                    return prev;
                }
                return { ...prev, machineName: '', machineDescription: '' };
            }
            const match = findMachineByCode(prev.machineCode);
            if (!match) {
                if (!prev.machineName && !prev.machineDescription) {
                    return prev;
                }
                return { ...prev, machineName: '', machineDescription: '' };
            }
            const label = match.description || match.code;
            return {
                ...prev,
                machineName: label,
                machineDescription: match.type ? `${label} (${match.type})` : label,
            };
        });
    };

    const handleMachineInputKeyDown = (event) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setShowMachineOptions(true);
            setMachineHighlightIndex((prev) => {
                if (!filteredMachineOptions.length) {
                    return 0;
                }
                return Math.min(prev + 1, filteredMachineOptions.length - 1);
            });
            return;
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setMachineHighlightIndex((prev) => Math.max(prev - 1, 0));
            return;
        }
        if (event.key === 'Enter') {
            if (showMachineOptions && filteredMachineOptions[machineHighlightIndex]) {
                event.preventDefault();
                handleSelectMachine(filteredMachineOptions[machineHighlightIndex]);
            }
            return;
        }
        if (event.key === 'Escape') {
            setShowMachineOptions(false);
        }
    };

    const handlePhotoChange = (event) => {
        const files = Array.from(event.target.files || []);
        if (!files.length) {
            return;
        }
        const remainingSlots = MAX_PHOTO_ATTACHMENTS - photoFiles.length;
        if (remainingSlots <= 0) {
            setPhotoError(`แนบรูปได้สูงสุด ${MAX_PHOTO_ATTACHMENTS} รูปต่อใบงาน`);
            if (event.target) {
                event.target.value = '';
            }
            return;
        }
        let validationError = '';
        const accepted = [];
        files.forEach((file) => {
            const mimeType = file.type || '';
            const isJpeg = /^image\/jpe?g$/i.test(mimeType);
            if (!isJpeg) {
                validationError = 'รองรับเฉพาะไฟล์ JPG เท่านั้น';
                return;
            }
            const hasJpgExtension = file.name ? /\.jpe?g$/i.test(file.name) : true;
            if (!hasJpgExtension) {
                validationError = 'กรุณาเลือกไฟล์นามสกุล .jpg';
                return;
            }
            if (file.size > MAX_PHOTO_SIZE_BYTES) {
                validationError = `ไฟล์ ${file.name || 'ที่เลือก'} มีขนาดเกิน ${MAX_PHOTO_SIZE_MB}MB`;
                return;
            }
            accepted.push(file);
        });
        const limited = accepted.slice(0, remainingSlots);
        if (!validationError && accepted.length > limited.length) {
            validationError = `แนบรูปได้สูงสุด ${MAX_PHOTO_ATTACHMENTS} รูปต่อใบงาน`;
        }
        if (!limited.length && validationError === '') {
            validationError = 'ไม่พบไฟล์ที่สามารถอัปโหลดได้';
        }
        if (limited.length) {
            setPhotoFiles((prev) => [...prev, ...limited]);
        }
        if (validationError) {
            setPhotoError(validationError);
        } else {
            setPhotoError('');
        }
        if (event.target) {
            event.target.value = '';
        }
    };

    const handleRemovePhoto = (index) => {
        setPhotoFiles((prev) => prev.filter((_, idx) => idx !== index));
        if (photoInputRef.current) {
            photoInputRef.current.value = '';
        }
        setPhotoError('');
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        setPhotoError('');
        if (!activeFuelItems.length) {
            setSaving(false);
            setError('กรุณาเลือกประเภทน้ำมันและระบุจำนวนลิตรอย่างน้อย 1 รายการ');
            return;
        }
        if (totalFuelLiters <= 0) {
            setSaving(false);
            setError('จำนวนลิตรของน้ำมันต้องมากกว่า 0');
            return;
        }
        if (!photoFiles.length) {
            const message = 'กรุณาแนปรูปภาพประกอบอย่างน้อย 1 รูป';
            setSaving(false);
            setError(message);
            setPhotoError(message);
            return;
        }
        if (!canAutoFillOperator) {
            if (!form.operatorAccountId || !form.operatorName) {
                setSaving(false);
                setError('กรุณาเลือกพนักงานขับรถ');
                return;
            }
        }
        const enforcedOperator = canAutoFillOperator ? resolveOperatorDefaults(user) : null;
        const adjustedForm = canAutoFillOperator ? { ...form, ...enforcedOperator } : form;
        const fuelDetailsPayload = activeFuelItems.map((item) => ({
            id: item.id,
            label: item.label,
            code: item.code,
            liters: item.liters,
        }));
        const derivedFuelType = fuelDetailsPayload.length === 1
            ? `${fuelDetailsPayload[0].label}${fuelDetailsPayload[0].code ? ` #${fuelDetailsPayload[0].code}` : ''}`
            : 'หลายประเภท';
        const timeTotalsPayload = {
            timeMorningTotal: clockStringToDecimalHours(adjustedForm.timeMorningTotal),
            timeAfternoonTotal: clockStringToDecimalHours(adjustedForm.timeAfternoonTotal),
            timeOtTotal: clockStringToDecimalHours(adjustedForm.timeOtTotal),
        };
        const submissionPayload = {
            ...adjustedForm,
            ...timeTotalsPayload,
            fuelType: derivedFuelType,
            fuelAmountLiters: Number(totalFuelLiters.toFixed(2)),
            customFuelType: '',
            fuelDetails: fuelDetailsPayload,
        };
        const multipartPayload = new FormData();
        multipartPayload.append('payload', JSON.stringify(submissionPayload));
        photoFiles.forEach((file, index) => {
            const safeName = file.name && file.name.trim() ? file.name : `photo-${index + 1}.jpg`;
            multipartPayload.append('attachments[]', file, safeName);
        });
        try {
            const result = await apiPost('/api/oillogs.php', multipartPayload);
            setForm(createDefaultForm(resolveOperatorDefaults(user)));
            setPhotoFiles([]);
            setPhotoError('');
            if (photoInputRef.current) {
                photoInputRef.current.value = '';
            }
            await refreshLogs();
            const approvalPayload = result?.approval || null;
            const approvalNotice = typeof result?.approval_notice === 'string' ? result.approval_notice : '';
            const successText = approvalPayload || !approvalNotice
                ? 'บันทึกข้อมูลเรียบร้อย'
                : `บันทึกข้อมูลเรียบร้อย (${approvalNotice})`;
            setSuccessMessage(successText);
            const createdOilLogId = result?.item?.OilLog_Id ?? result?.item?.oilLog_id ?? null;
            if (approvalPayload) {
                const absoluteUrl = buildApprovalUrl(approvalPayload.path || approvalPayload.url || '');
                if (absoluteUrl) {
                    setApprovalPreview({
                        visible: true,
                        url: absoluteUrl,
                        token: approvalPayload.token || '',
                        expiresAt: approvalPayload.expires_at || approvalPayload.expiresAt || '',
                        oilLogId: createdOilLogId,
                    });
                }
            }
            window.setTimeout(() => setSuccessMessage(''), 3000);
        } catch (err) {
            setError(err.message || 'บันทึกไม่สำเร็จ');
        } finally {
            setSaving(false);
        }
    };

    const totalWorkMinutes = oilTimeSegments.reduce((sum, segment) => {
        const minutes = parseTimeToMinutes(form[`time${segment.key}Total`] || '');
        if (minutes === null) {
            return sum;
        }
        return sum + minutes;
    }, 0);
    const formattedTotalWorkHours = totalWorkMinutes > 0 ? formatMinutesToClock(totalWorkMinutes) : '0:00';
    const approvalQrSrc = approvalQrDataUrl || '';
    const approvalExpiryLabel = useMemo(() => {
        if (!approvalPreview.expiresAt) {
            return '';
        }
        const parsed = Date.parse(approvalPreview.expiresAt);
        if (Number.isNaN(parsed)) {
            return '';
        }
        return new Date(parsed).toLocaleString('th-TH', { hour12: false });
    }, [approvalPreview.expiresAt]);

    return (
        <div className="portal">
            <section className="oil-log-page">
                <div className="page-banner">
                    <Link to="/worksite" className="back-link">
                        ย้อนกลับ
                    </Link>
                    <div>
                        <h2>ใบรายงานการบันทึกน้ำมัน</h2>
                    </div>
                </div>
                <div className="oil-log-layout">
                    <form className="oil-log-form" onSubmit={handleSubmit}>
                        <header>
                            <h3>ข้อมูลทั่วไป</h3>
                            <p>วันที่ เวลากะ และประเภทงานที่ต้องการเติมน้ำมัน</p>
                        </header>
                        <div className="grid two-cols">
                            <label>
                                วันที่และเวลา
                                <input
                                    type="datetime-local"
                                    value={form.documentDate}
                                    onChange={handleChange('documentDate')}
                                    required
                                />
                            </label>
                            <label>
                                เลขที่เอกสาร (ถ้ามี)
                                <input type="text" value={form.documentNo} onChange={handleChange('documentNo')} placeholder="เช่น OIL-001" />
                            </label>
                        </div>
                        <div className="grid three-cols">
                            <label>
                                โครงการ/หน่วยงาน
                                <select
                                    value={projectIsOther ? '__other__' : (form.projectName || '')}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        if (v === '__other__') {
                                            setProjectIsOther(true);
                                            setForm((p) => ({ ...p, projectName: '' }));
                                        } else {
                                            setProjectIsOther(false);
                                            setForm((p) => ({ ...p, projectName: v }));
                                        }
                                    }}
                                    required={!projectIsOther}
                                >
                                    <option value="">เลือกโครงการ/หน่วยงาน</option>
                                    {projectOptions.map((name) => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                                    {/* <option value="__other__">อื่นๆ (ระบุเอง)</option> */}
                                </select>
                                {/* {projectIsOther && (
                                    <input type="text" value={form.projectName} onChange={handleChange('projectName')} placeholder="พิมพ์ชื่อโครงการ/หน่วยงาน" required />
                                )} */}
                            </label>
                            <label>
                                ปั้มน้ำมันในบริษัท/ภายนอก
                                <select
                                    value={locationIsOther ? '__other__' : (form.locationName || '')}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        if (v === '__other__') {
                                            setLocationIsOther(true);
                                            setForm((p) => ({ ...p, locationName: '' }));
                                        } else {
                                            setLocationIsOther(false);
                                            setForm((p) => ({ ...p, locationName: v }));
                                        }
                                    }}
                                    required={!locationIsOther}
                                >
                                    <option value="">เลือกสถานที่เติมน้ำมัน</option>
                                    {BASE_PUMP_LOCATION_OPTIONS.map((name) => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                                    <option value="__other__">ปั้มนอกบริษัท</option>
                                </select>
                                {locationIsOther && (
                                    <input
                                        type="text"
                                        value={form.locationName}
                                        onChange={handleChange('locationName')}
                                        placeholder="เช่น ปั๊มบางจาก สาขาอโศก"
                                        required
                                    />
                                )}
                            </label>
                        </div>
                        <header>
                            <h3>รายละเอียดเครื่องจักร</h3>
                        </header>
                            <div className="grid two-cols machine-info-grid">
                                <label>
                                    รหัสเครื่องจักร
                                    <div className="machine-picker" ref={machinePickerRef}>
                                        <input
                                            type="text"
                                            className="machine-input"
                                            placeholder="เช่น BH-354"
                                            value={form.machineCode}
                                            onChange={handleMachineInputChange}
                                            onBlur={handleMachineBlur}
                                            onFocus={() => setShowMachineOptions(true)}
                                            onKeyDown={handleMachineInputKeyDown}
                                            role="combobox"
                                            aria-expanded={showMachineOptions}
                                            aria-controls="machine-picker-options"
                                            aria-autocomplete="list"
                                            autoComplete="off"
                                            required
                                        />
                                        {showMachineOptions && filteredMachineOptions.length > 0 && (
                                            <ul className="picker-options" id="machine-picker-options" role="listbox">
                                                {filteredMachineOptions.map((option, index) => (
                                                    <li key={option.value}>
                                                        <button
                                                            type="button"
                                                            className={`picker-option${index === machineHighlightIndex ? ' active' : ''}`}
                                                            onMouseDown={(event) => {
                                                                event.preventDefault();
                                                                handleSelectMachine(option);
                                                            }}
                                                            role="option"
                                                            aria-selected={index === machineHighlightIndex}
                                                        >
                                                            <strong>{option.value}</strong>
                                                            <span>{option.description || 'ไม่มีชื่อเครื่อง'}</span>
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </label>
                                <label className="machine-name-label">
                                    ชื่อเครื่อง/รุ่น
                                    <div className={`machine-name-display${form.machineName ? '' : ' is-empty'}`}>
                                        {form.machineName ? (
                                            <>
                                                <strong>{form.machineName}</strong>
                                                {form.machineDescription && form.machineDescription !== form.machineName && (
                                                    <span>{form.machineDescription}</span>
                                                )}
                                            </>
                                        ) : (
                                            <span className="muted">-</span>
                                        )}
                                    </div>
                                </label>
                            </div>

                        <header>
                            <h3>ประเภทและปริมาณน้ำมัน</h3>
                            <p>เลือกหัวข้อที่ใช้จริง พร้อมระบุเกรดและจำนวนลิตรของแต่ละรายการ</p>
                        </header>
                        <div className="fuel-category-grid">
                            {fuelCategories.map((category) => {
                                const entry = form.fuelDetails[category.id] || {};
                                return (
                                    <div
                                        className={`fuel-category-card${entry.enabled ? ' fuel-category-card--active' : ''}`}
                                        key={category.id}
                                    >
                                        <label className="fuel-toggle">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(entry.enabled)}
                                                onChange={handleFuelToggle(category.id)}
                                            />
                                            <span>{category.label}</span>
                                        </label>
                                        {category.allowCode && (
                                            <label>
                                                {category.codeLabel || 'รายละเอียด'}
                                                <input
                                                    type="text"
                                                    value={entry.code}
                                                    onChange={handleFuelDetailChange(category.id, 'code')}
                                                    placeholder={category.codePlaceholder}
                                                    disabled={!entry.enabled}
                                                />
                                            </label>
                                        )}
                                        <label>
                                            จำนวนลิตร
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                step="0.01"
                                                value={entry.liters}
                                                onChange={handleFuelDetailChange(category.id, 'liters')}
                                                placeholder="0.00"
                                                disabled={!entry.enabled}
                                            />
                                        </label>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="fuel-total-pill" aria-live="polite">
                            <span>รวมปริมาณทั้งหมด</span>
                            <strong>{formattedFuelTotal} ลิตร</strong>
                        </div>
                        <div className="grid two-cols">
                            <label>
                                เลขที่ใบจ่ายน้ำมัน
                                <input type="text" value={form.fuelTicketNo} onChange={handleChange('fuelTicketNo')} />
                            </label>
                            <label>
                                เวลาเติม (ถ้ามี)
                                <input type="time" value={form.fuelTime} onChange={handleChange('fuelTime')} />
                            </label>
                        </div>
                        <div className="grid three-cols">
                            <label>
                                คงเหลือก่อนเติม (ลิตร)
                                <input type="number" inputMode="decimal" step="0.01" value={form.tankBeforeLiters} onChange={handleChange('tankBeforeLiters')} required/>
                            </label>
                            <label>
                                คงเหลือหลังเติม (ลิตร)
                                <input type="number" inputMode="decimal" step="0.01" value={form.tankAfterLiters} onChange={handleChange('tankAfterLiters')} required/>
                            </label>
                            <label>
                                หมายเหตุ
                                <input type="text" value={form.notes} onChange={handleChange('notes')} placeholder="เช่น เติมสำรอง" />
                            </label>
                        </div>

                        <header>
                            <h3>ผู้รับผิดชอบ</h3>
                            <p>ระบบจะแสดงเฉพาะชื่อพนักงานขับ ส่วนพนักงานออยเลอร์จะยืนยันผ่าน QR หลังบันทึก</p>
                        </header>
                        {personnelError && <div className="error-row">{personnelError}</div>}
                        <div className="grid two-cols">
                            <label>
                                พนักงานขับรถ
                                {canAutoFillOperator ? (
                                    <select
                                        value={form.operatorAccountId ? String(form.operatorAccountId) : 'locked-operator'}
                                        disabled
                                        required
                                    >
                                        {form.operatorName ? (
                                            <option value={form.operatorAccountId ? String(form.operatorAccountId) : 'locked-operator'}>
                                                {form.operatorName}
                                            </option>
                                        ) : (
                                            <option value="locked-operator">
                                                {loadingPersonnel ? 'กำลังโหลดชื่อผู้ใช้งาน...' : 'ไม่พบข้อมูลผู้ใช้'}
                                            </option>
                                        )}
                                    </select>
                                ) : (
                                    <select
                                        value={form.operatorAccountId ? String(form.operatorAccountId) : ''}
                                        onChange={handleDriverSelect}
                                        disabled={loadingPersonnel}
                                        required
                                    >
                                        <option value="">เลือกพนักงานขับรถ</option>
                                        {driverOptions.map((option) => (
                                            <option
                                                key={option.id ?? option.username}
                                                value={String(option.id ?? option.username ?? '')}
                                            >
                                                {formatPersonnelOptionLabel(option)}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                <span className="muted small-text">
                                    {canAutoFillOperator
                                        ? 'ระบบจะล็อกตามบัญชีที่เข้าสู่ระบบ'
                                        : (loadingPersonnel
                                            ? 'กำลังโหลดรายชื่อพนักงานขับ...'
                                            : (driverOptions.length
                                                ? 'เลือกจากรายชื่อพนักงานขับที่อนุมัติแล้ว'
                                                : 'ยังไม่มีพนักงานขับในระบบ'))}
                                </span>
                            </label>
                            <div
                                style={{
                                    border: '1px dashed #d0d7de',
                                    borderRadius: '12px',
                                    padding: '16px',
                                    background: '#f8fafc',
                                }}
                            >
                                <strong>การยืนยันผ่าน QR</strong>
                                <p className="muted" style={{ marginTop: '8px' }}>
                                    พนักงานออยเลอร์จะสแกน QR เพื่อกรอกชื่อและหมายเหตุด้วยตัวเองหลังบันทึกใบงาน
                                </p>
                            </div>
                        </div>

                        <header>
                            <h3>รูปภาพประกอบ</h3>
                            <p>แนบหลักฐานการเติมน้ำมันอย่างน้อย 1 รูป</p>

                            <p>
                            <img src={oil} alt="oil" style={{maxWidth: '300px', display: 'block', marginTop: '8px', marginLeft: 'auto', marginRight: 'auto'}} 
                            />
                            </p>
                            <p style={{marginRight:'auto', marginLeft:'auto' , maxWidth:'100px' , color:'black'}}>ภาพประกอบ</p>

                        </header>
                        <div className="photo-upload-card">
                            <label className="photo-upload-field">
                                <span>แนบรูปภาพ (สูงสุด {MAX_PHOTO_ATTACHMENTS} รูป)</span>
                                <input
                                    type="file"
                                    accept="image/jpeg"
                                    multiple
                                    ref={photoInputRef}
                                    onChange={handlePhotoChange}
                                    required={!photoFiles.length}
                                />
                            </label>
                            <p className="muted small-text">รองรับเฉพาะไฟล์ JPG (สูงสุด {MAX_PHOTO_SIZE_MB}MB ต่อไฟล์)</p>
                            {photoError && <div className="photo-error">{photoError}</div>}
                            {photoFiles.length > 0 && (
                                <ul className="photo-upload-list">
                                    {photoFiles.map((file, index) => (
                                        <li className="photo-upload-item" key={`${file.name || 'photo'}-${index}`}>
                                            <div>
                                                <strong>{file.name || `รูปที่ ${index + 1}`}</strong>
                                                <span>{formatFileSize(file.size)}</span>
                                            </div>
                                            <button
                                                type="button"
                                                className="photo-upload-remove"
                                                onClick={() => handleRemovePhoto(index)}
                                            >
                                                ลบ
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <header>
                            <h3 style={{color:'red'}}>ทุกอย่างต้องเป็นไปตามที่กรอกไว้ข้างต้นหากมีการดัดแปลงข้อมูลหรือข้อมูลไม่ถูกต้องอาจส่งผลต่อการพิจารณา จุ๊บๆ💓</h3>
                        </header>

                        {error && <div className="error-row">{error}</div>}
                        {successMessage && <div className="success-row">{successMessage}</div>}
                        <button style={{fontSize: '16px'}} type="submit" className="button primary full-width" disabled={saving}>
                            {saving ? 'กำลังบันทึก…' : 'บันทึกใบรายงานน้ำมัน'}
                        </button>
                    </form>
                </div>
            </section>
            {approvalPreview.visible && (
                <div style={approvalModalStyles.backdrop} role="dialog" aria-modal="true" aria-label="ลิงก์ยืนยันใบงานใหม่">
                    <div style={approvalModalStyles.card}>
                        <button
                            type="button"
                            style={approvalModalStyles.closeButton}
                            aria-label="ปิดหน้าต่าง"
                            onClick={confirmCloseApprovalPreview}
                        >
                            ×
                        </button>
                        <h3>แชร์ QR ให้พนักงานออยเลอร์</h3>
                        <p className="muted">สแกนหรือเปิดลิงก์เพื่อยืนยันการส่งข้อมูลไปยังศูนย์ใหญ่</p>
                        {approvalExpiryLabel && (
                            <p className="muted small-text">ลิงก์หมดอายุโดยประมาณ: {approvalExpiryLabel}</p>
                        )}
                        {approvalQrSrc ? (
                            <img
                                src={approvalQrSrc}
                                alt="QR code สำหรับยืนยันใบงานน้ำมัน"
                                style={approvalModalStyles.qrImage}
                            />
                        ) : (
                            <p className="muted" style={{ margin: '24px 0' }}>กำลังสร้าง QR code…</p>
                        )}
                        {approvalStatus && (
                            <div style={{ marginTop: '8px', marginBottom: '12px', textAlign: 'left' }}>
                                <p><strong>พนักงานออยเลอร์:</strong> {approvalStatus.oilerName || 'รอยืนยัน'} {approvalStatus.oilerDone ? '✅' : '⏳'}</p>
                                {approvalStatus.oilerDone && (
                                    <p style={{ color: '#0f5132', marginTop: '6px' }}>บันทึกข้อมูลเรียบร้อย ส่งข้อมูลไปยังศูนย์ใหญ่แล้ว</p>
                                )}
                                {approvalStatus.error && (
                                    <p className="muted small-text">{approvalStatus.error}</p>
                                )}
                            </div>
                        )}
                        <div style={approvalModalStyles.linkRow}>
                            <input
                                type="text"
                                value={approvalPreview.url}
                                style={approvalModalStyles.linkInput}
                                readOnly
                                onFocus={(event) => event.target.select()}
                            />
                            <button
                                type="button"
                                style={approvalModalStyles.copyButton}
                                onClick={handleCopyApprovalUrl}
                            >
                                คัดลอก
                            </button>
                        </div>
                        {approvalCopyFeedback && (
                            <div style={approvalModalStyles.feedbackText}>{approvalCopyFeedback}</div>
                        )}
                        <button
                            type="button"
                            style={approvalModalStyles.secondaryButton}
                            onClick={handleDownloadApprovalQr}
                            disabled={!approvalQrSrc}
                        >
                            บันทึกรูป QR Code
                        </button>
                        <p>หากกดปิดหน้าต่างแล้วจะไม่สามารถเข้าหน้าต่างนี้ได้อีก</p>
                        <button
                            type="button"
                            style={approvalModalStyles.primaryButton}
                            onClick={confirmCloseApprovalPreview}
                        >
                            ปิดหน้าต่าง
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
