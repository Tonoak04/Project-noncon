import { useState, useEffect, useRef, useMemo } from 'react';
import QRCode from 'qrcode';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { apiGet, apiPost } from '../api.js';
import {
    oilTimeSegments,
    oilChecklistItems,
    createChecklistState,
    oilChecklistOtherId,
} from '../data/oilLog.js';

export default function MachineWorkLog() {
    const { user } = useAuth();
    const buildInitialTimeFields = () => {
        const fields = {};
        (Array.isArray(oilTimeSegments) ? oilTimeSegments : []).forEach((seg) => {
            fields[`time${seg.key}Start`] = '';
            fields[`time${seg.key}End`] = '';
            fields[`time${seg.key}Total`] = '';
        });
        return fields;
    };

    const formatDateTimeLocal = (input = new Date()) => {
        const date = input instanceof Date ? input : new Date(input);
        if (Number.isNaN(date.getTime())) return '';
        const pad = (v) => String(v).padStart(2, '0');
        const year = date.getFullYear();
        const month = pad(date.getMonth() + 1);
        const day = pad(date.getDate());
        const hours = pad(date.getHours());
        const minutes = pad(date.getMinutes());
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    const operatorRoleKeys = ['operator', 'driver'];

    const normalizeRoleList = (rolesInput) => {
        if (!Array.isArray(rolesInput)) {
            return [];
        }
        return rolesInput
            .map((role) => (typeof role === 'string' ? role.trim().toLowerCase() : ''))
            .filter(Boolean);
    };

    const userHasAnyRole = (userObj, expectedRoles) => {
        if (!userObj || !Array.isArray(expectedRoles) || !expectedRoles.length) {
            return false;
        }
        const source = Array.isArray(userObj.roles) && userObj.roles.length
            ? userObj.roles
            : (userObj.role ? [userObj.role] : []);
        const normalized = normalizeRoleList(source);
        return normalized.some((r) => expectedRoles.includes(r));
    };

    const resolveOperatorDefaults = (user) => {
        if (!userHasAnyRole(user, operatorRoleKeys)) {
            return { operatorName: '', operatorAccountId: null };
        }
        const preferredLabel = (user?.fullName || user?.displayName || '').trim();
        const fallbackUsername = (user?.username || user?.Username || '').trim();
        const composedName = [user?.name, user?.lastname]
            .map((part) => (part || '').trim())
            .filter(Boolean)
            .join(' ')
            .trim();
        const operatorName = preferredLabel || composedName || fallbackUsername;
        const numericCenterId = Number(user?.Center_Id);
        const operatorAccountId = Number.isFinite(numericCenterId) && numericCenterId > 0 ? numericCenterId : null;
        return {
            operatorName,
            operatorAccountId,
        };
    };

    const formatPersonnelOptionLabel = (option) => {
        if (!option) return '';
        const base = (option.fullName || option.username || '').trim();
        const parts = [];
        if (option.centerName) parts.push(option.centerName);
        if (option.employeeId) parts.push(`#${option.employeeId}`);
        return parts.length ? `${base || 'ไม่ระบุชื่อ'} · ${parts.join(' · ')}` : (base || 'ไม่ระบุชื่อ');
    };

    const APPROVAL_IP_HOST = '172.16.3.106';
    const resolveApprovalOrigin = () => {
        if (typeof window === 'undefined') return '';
        const protocol = window.location?.protocol || 'http:';
        const portSegment = window.location?.port ? `:${window.location.port}` : '';
        return `${protocol}//${APPROVAL_IP_HOST}${portSegment}`;
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

    const [approvalPreview, setApprovalPreview] = useState({ visible: false, url: '', token: '', expiresAt: '', oilLogId: null });
    const [approvalCopyFeedback, setApprovalCopyFeedback] = useState('');
    const [approvalQrDataUrl, setApprovalQrDataUrl] = useState('');
    const [approvalStatus, setApprovalStatus] = useState(null);
    const approvalWatcherRef = useRef(null);

    const resolveApprovalPath = (path = '') => {
        if (!path) return '';
        if (/^https?:\/\//i.test(path)) return path;
        if (path.startsWith('#')) return `${resolveApprovalOrigin()}${path}`;
        return `${resolveApprovalOrigin()}${path.startsWith('/') ? path : `/${path}`}`;
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
        const shouldClose = typeof window === 'undefined' ? true : window.confirm('ยืนยันที่จะปิดหน้าต่างนี้หรือไม่? หากปิดจะกลับไปหน้าหลักและไม่สามารถเปิดหน้านี้ได้อีก');
        if (shouldClose) closeApprovalPreview();
    };

    const handleCopyApprovalUrl = async () => {
        if (!approvalPreview.url) return;
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
        if (!approvalQrDataUrl) return;
        const slug = approvalPreview.oilLogId ? `approval-${approvalPreview.oilLogId}` : 'approval';
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
                    color: { dark: '#111b47', light: '#ffffff' },
                });
                if (!cancelled) setApprovalQrDataUrl(dataUrl);
            } catch (_) {
                if (!cancelled) setApprovalQrDataUrl('');
            }
        }
        generateQr();
        return () => { cancelled = true; };
    }, [approvalPreview.url]);

    const approvalQrSrc = approvalQrDataUrl || '';
    const approvalExpiryLabel = useMemo(() => {
        if (!approvalPreview.expiresAt) return '';
        const parsed = Date.parse(approvalPreview.expiresAt);
        if (Number.isNaN(parsed)) return '';
        const diff = parsed - Date.now();
        if (diff <= 0) return 'หมดอายุแล้ว';
        const mins = Math.round(diff / 60000);
        if (mins < 60) return `${mins} นาที`;
        const hours = Math.round(mins / 60);
        return `${hours} ชั่วโมง`;
    }, [approvalPreview.expiresAt]);

    const operatorDefaults = useMemo(() => resolveOperatorDefaults(user), [user]);

    const [form, setForm] = useState(() => ({
        documentDate: formatDateTimeLocal(),
        machineCode: '',
        machineName: '',
        machineDescription: '',
        workOrder: '',
        workOrders: [''],
        operatorName: operatorDefaults.operatorName || '',
        operatorAccountId: operatorDefaults.operatorAccountId,
        operationDetails: '',
        meterHour: '',
        odometer: '',
        workMeterStart: '',
        workMeterEnd: '',
        workMeterTotal: '',
        ...buildInitialTimeFields(),
        checklist: createChecklistState(),
        checklistOtherNote: '',
    }));
    const checklistStatuses = ['ปกติ', 'ผิดปกติ'];
    const [logs, setLogs] = useState([]);
    const [machines, setMachines] = useState([]);
    const [driverOptions, setDriverOptions] = useState([]);
    const [loadingPersonnel, setLoadingPersonnel] = useState(true);
    const [showMachineOptions, setShowMachineOptions] = useState(false);
    const [machineHighlightIndex, setMachineHighlightIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const machinePickerRef = useRef(null);
    const navigate = useNavigate();
    const [personnelError, setPersonnelError] = useState('');
    const canAutoFillOperator = useMemo(() => userHasAnyRole(user, operatorRoleKeys), [user]);

    useEffect(() => {
        if (!canAutoFillOperator) {
            return;
        }
        setForm((prev) => {
            const sameId = (prev.operatorAccountId ?? null) === (operatorDefaults.operatorAccountId ?? null);
            const sameName = (prev.operatorName || '') === (operatorDefaults.operatorName || '');
            if (sameId && sameName) {
                return prev;
            }
            return {
                ...prev,
                operatorName: operatorDefaults.operatorName || '',
                operatorAccountId: operatorDefaults.operatorAccountId,
            };
        });
    }, [canAutoFillOperator, operatorDefaults]);


    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const data = await apiGet('/api/machine_work_logs.php?limit=20').catch(() => null);
                setLogs(Array.isArray(data?.items) ? data.items : []);
            } catch (err) {
            } finally {
                setLoading(false);
            }
        })();
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
        let cancelled = false;
        const controller = new AbortController();

        async function fetchDriverDirectory() {
            if (userHasAnyRole(user, operatorRoleKeys)) {
                setDriverOptions([]);
                setLoadingPersonnel(false);
                return;
            }
            setLoadingPersonnel(true);
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
                if (!cancelled) setLoadingPersonnel(false);
            }
        }

        fetchDriverDirectory();
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [user?.Center_Id]);

    const handleChange = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }));

    const findMachineByCode = (code) => {
        if (!code) {
            return null;
        }
        const lookup = code.trim().toLowerCase();
        return machines.find((machine) => machine.code.toLowerCase() === lookup) || null;
    };

    const deriveMachineName = (machine) => {
        if (!machine) return '';
        return machine.Equipment || machine.equipment || machine.description || machine.Description || machine.name || machine.Name || machine.label || '';
    };

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

    useEffect(() => {
        if (!filteredMachineOptions.length) {
            setMachineHighlightIndex(0);
            return;
        }
        setMachineHighlightIndex((prev) => Math.min(prev, filteredMachineOptions.length - 1));
    }, [filteredMachineOptions]);

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
                if (!filteredMachineOptions.length) return 0;
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

    const parseTimeToMinutes = (value) => {
        if (!value) return null;
        const parts = String(value).split(':');
        if (parts.length !== 2) return null;
        const h = Number(parts[0]);
        const m = Number(parts[1]);
        if (Number.isNaN(h) || Number.isNaN(m)) return null;
        return h * 60 + m;
    };

    const formatMinutesToClock = (minutes) => {
        if (!Number.isFinite(minutes)) return '';
        const safe = Math.max(0, Math.round(minutes));
        const h = Math.floor(safe / 60);
        const m = safe % 60;
        return `${h}:${String(m).padStart(2, '0')}`;
    };

    const calculateTimeDurationHours = (start, end) => {
        const s = parseTimeToMinutes(start);
        const e = parseTimeToMinutes(end);
        if (s === null || e === null) return '';
        let diff = e - s;
        if (diff < 0) diff += 24 * 60;
        return formatMinutesToClock(diff);
    };

    const handleTimeFieldChange = (segmentKey, type) => (e) => {
        const raw = e.target.value;
        const startField = `time${segmentKey}Start`;
        const endField = `time${segmentKey}End`;
        const totalField = `time${segmentKey}Total`;
        setForm((prev) => {
            const next = { ...prev, [type === 'start' ? startField : (type === 'end' ? endField : totalField)]: raw };
            const s = next[startField];
            const en = next[endField];
            const total = calculateTimeDurationHours(s, en);
            next[totalField] = total;
            return next;
        });
    };

    const handleChecklistChange = (itemId, status) => {
        setForm((prev) => {
            const next = {
                ...prev,
                checklist: {
                    ...prev.checklist,
                    [itemId]: status,
                },
            };
            if (itemId === oilChecklistOtherId && status === '') {
                next.checklistOtherNote = '';
            }
            return next;
        });
    };

    const handleChecklistOtherNoteChange = (event) => {
        const value = event.target.value;
        setForm((prev) => {
            if (prev.checklist[oilChecklistOtherId] !== 'เลือก') {
                return prev;
            }
            return { ...prev, checklistOtherNote: value };
        });
    };

    const handleChecklistSingleToggle = (itemId) => (event) => {
        const checked = event.target.checked;
        handleChecklistChange(itemId, checked ? 'เลือก' : '');
    };

    const handleMeterChange = (field) => (e) => {
        const val = e.target.value;
        setForm((prev) => {
            const next = { ...prev, [field]: val };
            const s = parseFloat(next.workMeterStart);
            const en = parseFloat(next.workMeterEnd);
            if (Number.isFinite(s) && Number.isFinite(en)) {
                next.workMeterTotal = (en - s).toString();
            }
            return next;
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        try {
            const payload = { ...form };
            if (!Array.isArray(payload.workOrders)) {
                payload.workOrders = Array.isArray(form.workOrders) ? form.workOrders : (form.workOrders ? [form.workOrders] : []);
            }
            payload.workOrder = payload.workOrders && payload.workOrders.length ? payload.workOrders[0] : (payload.workOrder || '');
            const res = await apiPost('/api/machine_work_logs.php', payload).catch(() => null);
            if (res && res.item) {
                setLogs((prev) => [res.item, ...prev]);
            } else {
                setLogs((prev) => [{ id: Date.now(), ...payload }, ...prev]);
            }

            const approvalPayload = res?.approval || null;
            const approvalUrl = approvalPayload ? resolveApprovalPath(approvalPayload.path || approvalPayload.url || '') : '';
            const approvalLogId = res?.item?.MachineWorkLog_Id ?? res?.item?.machineWorkLogId ?? res?.item?.id ?? null;
            if (approvalUrl) {
                stopApprovalWatcher();
                setApprovalPreview({
                    visible: true,
                    url: approvalUrl,
                    token: approvalPayload.token || '',
                    expiresAt: approvalPayload.expires_at || approvalPayload.expiresAt || '',
                    oilLogId: approvalLogId,
                });
            }
            const statusPayload = res?.approvalStatus || null;
            if (statusPayload) {
                setApprovalStatus({
                    inspectorName: statusPayload.inspectorName || '',
                    inspectorDone: Boolean(statusPayload.inspectorDone),
                    error: statusPayload.error || '',
                });
            } else {
                setApprovalStatus(null);
            }
            setForm((prev) => ({
                ...prev,
                operationDetails: '',
                meterHour: '',
                odometer: '',
                workOrder: '',
                workOrders: [''],
                workMeterStart: '',
                workMeterEnd: '',
                workMeterTotal: '',
                ...buildInitialTimeFields(),
            }));
        } catch (err) {
            setError(err.message || 'บันทึกไม่สำเร็จ');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="portal">
            <section className="machine-work-page">
                <div className="page-banner">
                    <Link to="/worksite" className="back-link">
                    ย้อนกลับ
                    </Link>
                    <div>
                        <h2>บันทึกการทำงานของเครื่องจักร</h2>
                    </div>
                </div>

                <div className="oil-log-layout">
                    <form className="oil-log-form" onSubmit={handleSubmit}>
                        <header>
                            <h3>ฟอร์มบันทึก</h3>
                        </header>
                        <div className="grid two-cols">
                            <label>
                                วันที่และเวลา
                                <input
                                    type="datetime-local"
                                    value={form.documentDate}
                                    onChange={handleChange('documentDate')}
                                    required />
                            </label>
                        </div>
                        <header>
                            <h2>รายการเครื่องจักร</h2>
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
                        <div>
                            <label>
                                WBS / รหัสงาน
                            </label>
                            <div className="dynamic-list">
                                {form.workOrders.map((wo, idx) => (
                                    <div key={idx} className="dynamic-list__row">
                                        <input
                                            type="text"
                                            value={wo}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setForm((prev) => {
                                                    const nextList = Array.isArray(prev.workOrders) ? [...prev.workOrders] : [];
                                                    nextList[idx] = v;
                                                    return { ...prev, workOrders: nextList, workOrder: nextList[0] || '' };
                                                });
                                            }}
                                        />
                                        <button
                                            type="button"
                                            className="small"
                                            onClick={() => {
                                                setForm((prev) => {
                                                    const nextList = Array.isArray(prev.workOrders) ? [...prev.workOrders] : [];
                                                    nextList.splice(idx, 1);
                                                    if (nextList.length === 0) nextList.push('');
                                                    return { ...prev, workOrders: nextList, workOrder: nextList[0] || '' };
                                                });
                                            }}
                                        >ลบ</button>
                                    </div>
                                ))}
                                <div>
                                    <button
                                        type="button"
                                        onClick={() => setForm((prev) => ({ ...prev, workOrders: [...(prev.workOrders || []), ''] }))}
                                    >+ เพิ่มบรรทัด</button>
                                </div>
                            </div>
                        </div>
                        <label>
                            รายละเอียดการทำงาน
                            <textarea rows={4} value={form.operationDetails} onChange={handleChange('operationDetails')} />
                        </label>

                        <header>
                            <h3>เลขชั่วโมง / เลขไมล์</h3>
                        </header>
                        <div className="grid three-cols">
                            <label>
                                เลขชั่วโมง (HR)
                                <input type="number" inputMode="decimal" step="0.1" value={form.meterHour} onChange={handleChange('meterHour')} />
                            </label>
                        </div>
                        <div className="grid three-cols">
                            <label>
                                เลขไมล์ (KM)
                                <input type="number" inputMode="decimal" step="0.1" value={form.odometer} onChange={handleChange('odometer')} />
                            </label>
                        </div>

                        <header>
                            <h3>การใช้งานหน่วยงาน</h3>
                        </header>
                        <div className="grid three-cols">
                            <label>
                                มิเตอร์ก่อนเริ่มงาน
                                <input type="number" inputMode="decimal" step="0.01" value={form.workMeterStart} onChange={handleMeterChange('workMeterStart')} />
                            </label>
                            <label>
                                มิเตอร์หลังเสร็จงาน
                                <input type="number" inputMode="decimal" step="0.01" value={form.workMeterEnd} onChange={handleMeterChange('workMeterEnd')} />
                            </label>
                            <label>
                                รวม (หน่วย)
                                <input type="number" inputMode="decimal" step="0.01" value={form.workMeterTotal} readOnly disabled />
                            </label>
                        </div>

                        <header>
                            <h3>เวลาปฏิบัติงาน</h3>
                        </header>
                        <div className="time-grid">
                            {(Array.isArray(oilTimeSegments) ? oilTimeSegments : []).map((segment) => {
                                const startField = `time${segment.key}Start`;
                                const endField = `time${segment.key}End`;
                                const totalField = `time${segment.key}Total`;
                                return (
                                    <div className="time-row" key={segment.key}>
                                        <div className="time-row__meta">
                                            <strong>{segment.label}</strong>
                                            {segment.hint && <p className="muted">{segment.hint}</p>}
                                        </div>
                                        <label className="time-field">
                                            <span>เริ่มงาน</span>
                                            <input
                                                type="time"
                                                value={form[startField]}
                                                onChange={handleTimeFieldChange(segment.key, 'start')}
                                            />
                                        </label>
                                        <label className="time-field">
                                            <span>เลิกงาน</span>
                                            <input
                                                type="time"
                                                value={form[endField]}
                                                onChange={handleTimeFieldChange(segment.key, 'end')}
                                            />
                                        </label>
                                        <label className="time-field">
                                            <span>รวม (ชม.)</span>
                                            <input
                                                type="text"
                                                value={form[totalField]}
                                                readOnly
                                            />
                                        </label>
                                    </div>
                                );
                            })}
                        </div>
                        <header>
                            <h3>รายการตรวจเช็คเครื่องจักร</h3>
                        </header>
                        <div className="checklist-grid">
                            {oilChecklistItems.map((item) => {
                                const isSingle = Boolean(item.singleOption);
                                const singleSelected = isSingle ? form.checklist[item.id] === 'เลือก' : false;
                                const shouldShowNote = item.allowNote && (isSingle ? singleSelected : Boolean(form.checklist[item.id]));
                                const noteValue = item.id === oilChecklistOtherId ? form.checklistOtherNote : '';
                                return (
                                    <div className="checklist-card" key={item.id}>
                                        <h4>{item.label}</h4>
                                        {isSingle ? (
                                            <div className="check-status check-status--single">
                                                <label className={`status-chip status-chip--single${singleSelected ? ' status-chip--single-active' : ''}`}>
                                                    <input
                                                        type="checkbox"
                                                        checked={singleSelected}
                                                        onChange={handleChecklistSingleToggle(item.id)}
                                                    />
                                                    <span className="single-check-icon" aria-hidden="true" />
                                                </label>
                                            </div>
                                        ) : (
                                            <div className="check-status">
                                                {checklistStatuses.map((status) => {
                                                    const isActive = form.checklist[item.id] === status;
                                                    const tone = status === 'ปกติ' ? 'ok' : 'bad';
                                                    return (
                                                        <label key={status} className={`status-chip${isActive ? ` status-chip--${tone}` : ''}`}>
                                                            <input
                                                                type="radio"
                                                                name={`check-${item.id}`}
                                                                value={status}
                                                                checked={isActive}
                                                                onChange={() => handleChecklistChange(item.id, status)}
                                                            />
                                                            <span>{status}</span>
                                                        </label>
                                                    );
                                                })}
                                                <button type="button" className="status-chip status-chip--ghost" onClick={() => handleChecklistChange(item.id, '')}>
                                                    ล้าง
                                                </button>
                                            </div>
                                        )}
                                        {shouldShowNote && (
                                            <input
                                                type="text"
                                                className="checklist-note-input"
                                                value={noteValue}
                                                onChange={handleChecklistOtherNoteChange}
                                                placeholder={item.notePlaceholder || 'ระบุรายละเอียดเพิ่มเติม'}
                                            />
                                        )}
                                    </div>

                                );
                            })}
                        </div>
                        <header>
                            <h3>ผู้รับผิดชอบ</h3>
                            <p>ระบบจะแสดงเฉพาะชื่อพนักงานขับ ส่วนผู้ตรวจสอบจะยืนยันผ่าน QR หลังบันทึก</p>
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
                                    ผู้ตรวจสอบจะสแกน QR เพื่อกรอกชื่อและหมายเหตุด้วยตัวเองหลังบันทึกใบงาน
                                </p>
                            </div>
                        </div>
                        {error && <div className="error-row">{error}</div>}
                        <button type="submit" className="button primary full-width" disabled={saving}>
                            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
                        </button>
                    </form>
                </div>
            </section >
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
                        <h3>แชร์ QR ให้ผู้ตรวจสอบ</h3>
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
                                <p><strong>ผู้ตรวจสอบ:</strong> {approvalStatus.inspectorName || 'รอยืนยัน'} {approvalStatus.inspectorDone ? '✅' : '⏳'}</p>
                                {approvalStatus.inspectorDone && (
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
