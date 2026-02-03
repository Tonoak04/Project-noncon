import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

const DAY_COLUMNS = Array.from({ length: 31 }, (_, index) => index + 1);

const STATUS_OPTIONS = [
    { value: '', label: '-' },
    { value: 'ปกติ', label: '✓ ปกติ' },
    { value: 'ผิดปกติ', label: '✗ ผิดปกติ' },
    { value: 'S', label: 'S (Stand by)' },
    { value: 'B', label: 'B (จอดซ่อม)' },
];

const LEGEND = [
    { symbol: '✓', label: 'ปกติ' },
    { symbol: '✗', label: 'ผิดปกติ' },
    { symbol: 'S', label: 'กรณีเครื่องจักร จอด Stand by' },
    { symbol: 'B', label: 'กรณีเครื่องจักรเสีย จอดซ่อม' },
];

const CHECKLIST_ITEMS = [
    { order: 1, topic: 'ระดับน้ำมันเครื่อง', method: 'อยู่ระดับที่กำหนด', frequency: 'รายวัน' },
    { order: 2, topic: 'เช็กระดับสารหล่อเย็นหม้อน้ำ', method: 'อยู่ระดับที่กำหนด', frequency: 'รายวัน' },
    { order: 3, topic: 'ตรวจดูรอยรั่วซึมระบบเครื่องยนต์', method: 'ไม่มีการรั่วซึมของน้ำมัน', frequency: 'รายวัน' },
    { order: 4, topic: 'เช็คระดับน้ำมันไฮดรอลิก', method: 'อยู่ระดับที่กำหนด', frequency: 'รายวัน' },
    { order: 5, topic: 'เช็คกรองดักน้ำและDrain น้ำทิ้ง', method: 'อยู่ระดับที่กำหนด', frequency: 'รายวัน' },
    { order: 6, topic: 'เช็ค/อัดจารบีตามจุดข้อต่อและจุดหมุนต่างๆ', method: 'อัดจารบีทุกจุด', frequency: 'รายวัน' },
    { order: 7, topic: 'เช็คสภาพยางและแรงลมยาง', method: 'สภาพพร้อมใช้งาน', frequency: 'รายวัน' },
    { order: 8, topic: 'เช็คความตึงโซ่แทร็คและโรลเลอร์ต่างๆ', method: 'ไม่สึกหรอ,ไม่ตึง-หย่อนเกินไป', frequency: 'รายวัน' },
    { order: 9, topic: 'เช็คการรั่วซึมกระบอกไฮดรอลิกต่างๆ', method: 'ไม่มีการรั่วซึมของน้ำมัน', frequency: 'รายวัน' },
    { order: 10, topic: 'เช็คการทำงานระบบไฟฟ้าและสัญญานไฟต่างๆ', method: 'ใช้งานได้ปกติ', frequency: 'รายวัน' },
    { order: 11, topic: 'เช็คสภาพอุปกรณ์ เช่น ปุ้งกี้,เล็บขุด,ใบมีดฯลฯ', method: 'ใช้งานได้ปกติ', frequency: 'รายวัน' },
    { order: 12, topic: 'เช็คสภาพตัวรถและอุปกรณ์เสริม เช่นกระบะตัวถังฯลฯ', method: 'ใช้งานได้ปกติ', frequency: 'รายวัน' },
    { order: 13, topic: 'เช็คระดับสารละลายในแบตเตอรี่', method: 'อยู่ระดับที่กำหนด', frequency: 'รายสัปดาห์' },
    { order: 14, topic: 'เช็คสภาพ/ความดึงสายพานต่างๆหน้าเครื่องยนต์', method: 'สภาพดี,ไม่ตึง-หย่อนเกินไป', frequency: 'รายสัปดาห์' },
    { order: 15, topic: 'ทำความสะอาด/เป่าไส้กรองอากาศ', method: 'ไม่เสียรูป', frequency: 'รายสัปดาห์' },
];

const SIGNATURE_ROWS = [
    {
        order: "",
        topic: 'ผู้ตรวจสอบ/พขร.',
        method: 'ลงชื่อ',
        frequency: 'รายวัน',
        isSignature: true,
        signatureRole: 'driver',
    },
    {
        order: "",
        topic: 'โฟร์แมนผู้ตรวจสอบ',
        method: 'ลงชื่อ',
        frequency: 'รายวัน',
        isSignature: true,
        signatureRole: 'foreman',
    },
];

const CHECKLIST_TABLE_STYLES = `
    .checklist-table-wrapper {
        overflow-x: auto;
        position: relative;
    }

    /* avoid collapsed borders interfering with sticky positioning */
    .checklist-table {
        border-collapse: separate;
        border-spacing: 0;
    }

    /* keep header visible during vertical scroll */
    .checklist-table thead th {
        position: sticky;
        top: 0;
        z-index: 10000;
        background: var(--bg-panel, #fff);
    }

    /* Sticky left columns: tightened widths to reduce gaps */
    .checklist-table th.col-order,
    .checklist-table td.col-order {
        position: sticky;
        left: 0;
        z-index: 10010;
        background: var(--bg-panel, #fff);
        width: 56px;
        min-width: 40px;
        max-width: 56px;
        text-align: center;
        box-shadow: 2px 0 8px rgba(12, 34, 56, 0.08);
        transform: translateZ(0);
        will-change: transform;
    }

    .checklist-table th.col-topic,
    .checklist-table td.col-topic {
        position: sticky;
        left: 47px;
        z-index: 10011;
        background: var(--bg-panel, #fff);
        width: 50px;
        min-width: 47px;
        text-align: left;
        padding-left: 0.5rem;
        box-shadow: 2px 0 8px rgba(12, 34, 56, 0.08);
        transform: translateZ(0);
        will-change: transform;
    }

    .checklist-table th.col-method,
    .checklist-table td.col-method {
        position: sticky;
        left: 115px;
        z-index: 10012;
        background: var(--bg-panel, #fff);
        width: 120px;
        min-width: 65px;
        text-align: left;
        padding-left: 0.5rem;
        box-shadow: 2px 0 8px rgba(12, 34, 56, 0.08);
        transform: translateZ(0);
        will-change: transform;
    }

    .checklist-table th.col-frequency,
    .checklist-table td.col-frequency {
        position: sticky;
        left: 182px;
        z-index: 10013;
        background: var(--bg-panel, #fff);
        width: 120px;
        min-width: 40px;
        text-align: center;
        box-shadow: 2px 0 8px rgba(12, 34, 56, 0.08);
        transform: translateZ(0);
        will-change: transform;
    }

    /* avoid underlying cells showing through */
    .checklist-table th,
    .checklist-table td {
        background-clip: padding-box;
        background: var(--bg-panel, #fff);
    }
`;

const defaultMetaForm = () => {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return {
        machineCode: '',
        department: '',
        date,
        period,
    };
};

const formatUserName = (user = {}) => {
    const primary = `${user.name ?? ''} ${user.lastname ?? ''}`.trim();
    if (primary) {
        return primary;
    }
    return user.displayName || user.Username || user.username || '';
};

const normalizeMachineRow = (row = {}) => {
    const code = (row.Equipment || row.Machine_Id || '').toString().trim();
    if (!code) {
        return null;
    }
    const description = (row.Description || row.Name || '').trim();
    const label = description ? `${code} · ${description}` : code;
    return {
        value: code,
        label,
        id: row.Machine_Id ? Number(row.Machine_Id) : null,
        type: row.Machine_Type || row.Class || '-',
        department: row.CenterName || row.Department || '',
        description,
    };
};

const mapSignatureValues = (values = {}) => {
    const entries = Object.entries(values || {});
    if (entries.length === 0) {
        return {};
    }
    return entries.reduce((acc, [day, entry]) => {
        if (typeof entry === 'string') {
            acc[day] = entry;
        } else if (entry && typeof entry === 'object' && 'signature' in entry) {
            acc[day] = entry.signature || '';
        } else {
            acc[day] = '';
        }
        return acc;
    }, {});
};

const resolveSignatureDisplay = (value, options) => {
    if (!value) {
        return '';
    }
    const match = options.find((option) => option.value === value);
    return match ? match.label : value;
};

const normalizeChecklistMatrix = (matrix = {}) => {
    const normalized = {};
    Object.entries(matrix || {}).forEach(([day, items]) => {
        const dayKey = String(day);
        normalized[dayKey] = {};
        Object.entries(items || {}).forEach(([order, value]) => {
            normalized[dayKey][Number(order)] = value || '';
        });
    });
    return normalized;
};

const buildChecklistLocks = (matrix = {}) => {
    const locks = new Set();
    Object.entries(matrix || {}).forEach(([day, items]) => {
        Object.entries(items || {}).forEach(([order, value]) => {
            if (value) {
                locks.add(`${day}:${order}`);
            }
        });
    });
    return locks;
};

export default function Checklist() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const normalizedRoles = useMemo(() => {
        const rolesSource = Array.isArray(user?.roles) && user.roles.length
            ? user.roles
            : (user?.role ? [user.role] : []);
        return rolesSource
            .map((value) => (typeof value === 'string' ? value.toLowerCase() : ''))
            .filter(Boolean);
    }, [user]);
    const hasRole = (value) => normalizedRoles.includes(value);
    const isForeman = hasRole('foreman');
    const isAdmin = hasRole('admin');
    const isDriver = hasRole('driver');
    const isOperator = hasRole('operator');
    const isReadOnlyViewer = isAdmin && !isForeman && !isOperator;
    const isOnlyView = isOperator && !isForeman && !isAdmin;
    const canAccessChecklist = isForeman || isAdmin || isDriver || isOperator;

    const [metaForm, setMetaForm] = useState(() => defaultMetaForm());
    const [machines, setMachines] = useState([]);
    const [machineLoading, setMachineLoading] = useState(false);
    const [machineError, setMachineError] = useState('');
    const [vehicleType, setVehicleType] = useState('-');
    const [status, setStatus] = useState('idle');
    const [showOptions, setShowOptions] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(0);
    const [selectedMachineId, setSelectedMachineId] = useState(null);
    const [checklistLoading, setChecklistLoading] = useState(false);
    const [checklistError, setChecklistError] = useState('');
    const [foremanSignatures, setForemanSignatures] = useState({});
    const [driverSignatures, setDriverSignatures] = useState({});
    const [foremanLockedDays, setForemanLockedDays] = useState(() => new Set());
    const [driverLockedDays, setDriverLockedDays] = useState(() => new Set());
    const [pendingForemanDays, setPendingForemanDays] = useState(() => new Set());
    const [pendingDriverSignatureDays, setPendingDriverSignatureDays] = useState(() => new Set());
    const [checklistValues, setChecklistValues] = useState({});
    const [lockedChecklistCells, setLockedChecklistCells] = useState(() => new Set());
    const [pendingChecklistCells, setPendingChecklistCells] = useState(() => new Set());
    const [issueNotes, setIssueNotes] = useState('');
    const pickerRef = useRef(null);
    const dateInputRef = useRef(null);
    const periodInputRef = useRef(null);
    const isMetaComplete = Boolean(metaForm.machineCode.trim() && metaForm.department.trim() && metaForm.date);

    useEffect(() => {
        let ignore = false;
        setMachineLoading(true);
        setMachineError('');
        (async () => {
            try {
                const data = await apiGet('/api/machines.php?limit=5000');
                if (ignore) {
                    return;
                }
                const normalized = (data.items || [])
                    .map((item) => normalizeMachineRow(item))
                    .filter(Boolean);
                normalized.sort((a, b) => {
                    if (a.value < b.value) return -1;
                    if (a.value > b.value) return 1;
                    return 0;
                });
                setMachines(normalized);
            } catch (error) {
                if (!ignore) {
                    setMachineError(error?.message || 'ไม่สามารถโหลดรายชื่อเครื่องจักรได้');
                }
            } finally {
                if (!ignore) {
                    setMachineLoading(false);
                }
            }
        })();
        return () => {
            ignore = true;
        };
    }, []);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (!pickerRef.current) {
                return;
            }
            if (!pickerRef.current.contains(event.target)) {
                setShowOptions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const machineOptions = useMemo(() => machines, [machines]);
    const filteredMachineOptions = useMemo(() => {
        const query = metaForm.machineCode.trim().toLowerCase();
        if (!query) {
            return machineOptions;
        }
        return machineOptions.filter((option) => {
            const value = option.value.toLowerCase();
            const label = option.label.toLowerCase();
            return value.includes(query) || label.includes(query);
        });
    }, [machineOptions, metaForm.machineCode]);

    useEffect(() => {
        if (highlightIndex >= filteredMachineOptions.length) {
            setHighlightIndex(0);
        }
    }, [filteredMachineOptions.length, highlightIndex]);

    const handleSelectMachine = (code) => {
        const chosen = machineOptions.find((option) => option.value === code);
        setMetaForm((prev) => {
            const next = { ...prev, machineCode: code };
            if (!prev.department && chosen?.department) {
                next.department = chosen.department;
            }
            return next;
        });
        setShowOptions(false);
        if (chosen) {
            setSelectedMachineId(chosen.id);
            setVehicleType(chosen.description || chosen.type || '-');
        } else {
            setSelectedMachineId(null);
            setVehicleType('-');
        }
    };

    const handleMetaChange = (field) => (event) => {
        const value = event.target.value;
        setMetaForm((prev) => ({ ...prev, [field]: value }));
    };

    const openDatePicker = () => {
        try {
            if (dateInputRef.current && typeof dateInputRef.current.showPicker === 'function') {
                dateInputRef.current.showPicker();
                return;
            }
            if (dateInputRef.current) {
                dateInputRef.current.focus();
                dateInputRef.current.click();
            }
        } catch (error) {
            console.debug('openDatePicker failed', error);
        }
    };

    const openPeriodPicker = () => {
        try {
            if (periodInputRef.current && typeof periodInputRef.current.showPicker === 'function') {
                periodInputRef.current.showPicker();
                return;
            }
            if (periodInputRef.current) {
                periodInputRef.current.focus();
                periodInputRef.current.click();
            }
        } catch (error) {
            console.debug('openPeriodPicker failed', error);
        }
    };

    const clearForemanState = () => {
        setForemanSignatures({});
        setForemanLockedDays(new Set());
        setPendingForemanDays(new Set());
    };

    const clearDriverState = () => {
        setDriverSignatures({});
        setDriverLockedDays(new Set());
        setPendingDriverSignatureDays(new Set());
        setChecklistValues({});
        setLockedChecklistCells(new Set());
        setPendingChecklistCells(new Set());
    };

    useEffect(() => {
        const trimmedCode = metaForm.machineCode.trim();
        if (!trimmedCode || !metaForm.period) {
            clearDriverState();
            clearForemanState();
            setSelectedMachineId(null);
            if (!trimmedCode) {
                setVehicleType('-');
            }
            return;
        }

        let ignore = false;
        setChecklistLoading(true);
        setChecklistError('');
        const params = new URLSearchParams({
            machine: trimmedCode,
            period: metaForm.period,
        });

        (async () => {
            try {
                const data = await apiGet(`/api/checklist.php?${params.toString()}`);
                if (ignore) {
                    return;
                }
                setSelectedMachineId(data.machine?.id ?? null);
                if (data.machine?.description) {
                    setVehicleType(data.machine.description);
                }
                setDriverSignatures(mapSignatureValues(data.driver?.values));
                setDriverLockedDays(new Set(data.driver?.lockedDays || []));
                setPendingDriverSignatureDays(new Set());
                setForemanSignatures(mapSignatureValues(data.foreman?.values));
                setForemanLockedDays(new Set(data.foreman?.lockedDays || []));
                setPendingForemanDays(new Set());
                const normalizedItems = normalizeChecklistMatrix(data.items?.values);
                setChecklistValues(normalizedItems);
                setLockedChecklistCells(buildChecklistLocks(normalizedItems));
                setPendingChecklistCells(new Set());
            } catch (error) {
                if (!ignore) {
                    if (error?.status === 401) {
                        logout('session-expired');
                    } else {
                        setChecklistError(error?.message || 'ไม่สามารถโหลดข้อมูลลายเซ็นได้');
                        clearDriverState();
                        clearForemanState();
                    }
                }
            } finally {
                if (!ignore) {
                    setChecklistLoading(false);
                }
            }
        })();

        return () => {
            ignore = true;
        };
    }, [logout, metaForm.machineCode, metaForm.period]);

    const foremanOptions = useMemo(() => {
        if (!isForeman || !user) {
            return [];
        }
        const label = formatUserName(user);
        const value = user.employeeId || user.Username || user.username || 'foreman';
        return label ? [{ value, label }] : [];
    }, [isForeman, user]);

    const driverOptions = useMemo(() => {
        if (!user) {
            return [];
        }
        const label = formatUserName(user);
        const value = user.employeeId || user.Username || user.username || 'driver';
        return label ? [{ value, label }] : [];
    }, [user]);

    const updatePendingForemanDay = (day, hasValue) => {
        setPendingForemanDays((prev) => {
            const next = new Set(prev);
            if (hasValue) {
                next.add(day);
            } else {
                next.delete(day);
            }
            return next;
        });
    };

    const updatePendingDriverSignatureDay = (day, hasValue) => {
        setPendingDriverSignatureDays((prev) => {
            const next = new Set(prev);
            if (hasValue) {
                next.add(day);
            } else {
                next.delete(day);
            }
            return next;
        });
    };

    const updatePendingChecklistCell = (day, order, hasValue) => {
        const key = `${String(day)}:${order}`;
        setPendingChecklistCells((prev) => {
            const next = new Set(prev);
            if (hasValue) {
                next.add(key);
            } else {
                next.delete(key);
            }
            return next;
        });
    };

    const renderSignatureInput = (item, day) => {
        const dayKey = String(day);
        const value = foremanSignatures[dayKey] ?? '';
        const isLocked = foremanLockedDays.has(day);

        if (item.signatureRole === 'foreman') {
            if (!isForeman) {
                const displayValue = resolveSignatureDisplay(value, foremanOptions);
                return (
                    <input
                        type="text"
                        className="signature-grid-input"
                        value={displayValue}
                        readOnly
                        aria-label={`ลงชื่อ ข้อ ${item.order} วันที่ ${day}`}
                    />
                );
            }
            return (
                <select
                    className="signature-grid-input"
                    value={value}
                    disabled={!isMetaComplete || isLocked || checklistLoading || foremanOptions.length === 0}
                    onChange={(event) => {
                        const nextValue = event.target.value;
                        setForemanSignatures((prev) => ({ ...prev, [dayKey]: nextValue }));
                        updatePendingForemanDay(day, Boolean(nextValue));
                    }}
                    aria-label={`ลงชื่อ ข้อ ${item.order} วันที่ ${day}`}
                    title={isLocked ? 'บันทึกแล้ว' : undefined}
                >
                    <option value="">-</option>
                    {foremanOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            );
        }

        if (item.signatureRole === 'driver') {
            const driverValue = driverSignatures[dayKey] ?? '';
            const driverLocked = driverLockedDays.has(day);
            if (driverLocked || isForeman || isReadOnlyViewer || isOnlyView) {
                const displayValue = resolveSignatureDisplay(driverValue, driverOptions);
                return (
                    <input
                        type="text"
                        className="signature-grid-input"
                        value={displayValue}
                        readOnly
                        aria-label={`ลงชื่อ ข้อ ${item.order} วันที่ ${day}`}
                    />
                );
            }
            return (
                <select
                    className="signature-grid-input"
                    value={driverValue}
                    disabled={!isMetaComplete || checklistLoading || driverOptions.length === 0 || isReadOnlyViewer || isOnlyView}
                    onChange={(event) => {
                        const nextValue = event.target.value;
                        setDriverSignatures((prev) => ({ ...prev, [dayKey]: nextValue }));
                        updatePendingDriverSignatureDay(day, Boolean(nextValue));
                    }}
                    aria-label={`ลงชื่อ ข้อ ${item.order} วันที่ ${day}`}
                >
                    <option value="">-</option>
                    {driverOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            );
        }

        return null;
    };

    const handleStatusChange = (day, order, nextValue) => {
        if (isReadOnlyViewer) {
            return;
        }
        const dayKey = String(day);
        const key = `${dayKey}:${order}`;
        if (lockedChecklistCells.has(key)) {
            return;
        }
        setChecklistValues((prev) => {
            const nextDayValues = { ...(prev[dayKey] || {}) };
            nextDayValues[order] = nextValue;
            return { ...prev, [dayKey]: nextDayValues };
        });
        updatePendingChecklistCell(day, order, Boolean(nextValue));
    };

    const hasPendingForemanSignatures = pendingForemanDays.size > 0;
    const hasPendingDriverSignatures = pendingDriverSignatureDays.size > 0;
    const hasPendingDriverStatuses = pendingChecklistCells.size > 0;

    const handleSave = async () => {
        if (!isMetaComplete || !metaForm.period) {
            alert('กรุณากรอกชื่อหน่วยงาน รหัสเครื่องจักร วัน และเดือน/ปี');
            return;
        }

        if (isReadOnlyViewer) {
            alert('คุณไม่มีสิทธิ์บันทึกแบบฟอร์มนี้');
            return;
        }

        if (isDriver) {
            if (!hasPendingDriverSignatures && !hasPendingDriverStatuses) {
                alert('ยังไม่มีข้อมูลใหม่สำหรับบันทึก');
                return;
            }

            const payload = {
                machineCode: metaForm.machineCode,
                period: metaForm.period,
                signatureType: 'driver',
            };

            let pendingSignatureDays = [];
            if (hasPendingDriverSignatures) {
                pendingSignatureDays = Array.from(pendingDriverSignatureDays).sort((a, b) => a - b);
                payload.signatures = pendingSignatureDays.reduce((acc, day) => {
                    acc[String(day)] = driverSignatures[String(day)] || 'signed';
                    return acc;
                }, {});
            }

            if (hasPendingDriverStatuses) {
                const statusPayload = {};
                pendingChecklistCells.forEach((key) => {
                    const [dayStr, orderStr] = key.split(':');
                    const value = checklistValues[dayStr]?.[Number(orderStr)] ?? '';
                    if (!value) {
                        return;
                    }
                    if (!statusPayload[dayStr]) {
                        statusPayload[dayStr] = {};
                    }
                    statusPayload[dayStr][Number(orderStr)] = value;
                });
                if (Object.keys(statusPayload).length > 0) {
                    payload.items = statusPayload;
                }
            }

            if (!payload.signatures && !payload.items) {
                alert('ยังไม่มีข้อมูลใหม่สำหรับบันทึก');
                return;
            }

            if (selectedMachineId) {
                payload.machineId = selectedMachineId;
            }

            setStatus('saving');
            try {
                const response = await apiPost('/api/checklist.php', payload);
                if (hasPendingDriverSignatures) {
                    const lockedDays = Array.isArray(response.lockedDays) ? response.lockedDays : pendingSignatureDays;
                    setDriverLockedDays((prev) => {
                        const next = new Set(prev);
                        lockedDays.forEach((day) => next.add(Number(day)));
                        return next;
                    });
                    setPendingDriverSignatureDays(new Set());
                }
                if (hasPendingDriverStatuses) {
                    const responseItems = Array.isArray(response.itemsLocked) ? response.itemsLocked : [];
                    const fallbackItems = responseItems.length
                        ? responseItems
                        : Array.from(pendingChecklistCells).map((key) => {
                            const [dayStr, orderStr] = key.split(':');
                            return {
                                day: Number(dayStr),
                                order: Number(orderStr),
                                value: checklistValues[dayStr]?.[Number(orderStr)] || '',
                            };
                        });
                    if (fallbackItems.length > 0) {
                        setChecklistValues((prev) => {
                            const next = { ...prev };
                            fallbackItems.forEach((item) => {
                                const dayKey = String(item.day);
                                const existingDay = next[dayKey] || {};
                                next[dayKey] = { ...existingDay, [Number(item.order)]: item.value || '' };
                            });
                            return next;
                        });
                        setLockedChecklistCells((prev) => {
                            const next = new Set(prev);
                            fallbackItems.forEach((item) => {
                                next.add(`${String(item.day)}:${Number(item.order)}`);
                            });
                            return next;
                        });
                    }
                    setPendingChecklistCells(new Set());
                }
                setStatus('saved');
                window.setTimeout(() => setStatus('idle'), 1500);
            } catch (error) {
                setStatus('idle');
                if (error?.status === 401) {
                    logout('session-expired');
                } else {
                    alert(error?.message || 'ไม่สามารถบันทึกข้อมูลได้');
                }
            }
            return;
        }

        if (!hasPendingForemanSignatures) {
            alert('ยังไม่มีลายเซ็นใหม่สำหรับบันทึก');
            return;
        }

        const pendingDays = Array.from(pendingForemanDays).sort((a, b) => a - b);
        const signaturesPayload = pendingDays.reduce((acc, day) => {
            acc[String(day)] = foremanSignatures[String(day)] || 'signed';
            return acc;
        }, {});

        const payload = {
            machineCode: metaForm.machineCode,
            period: metaForm.period,
            signatures: signaturesPayload,
            signatureType: 'foreman',
        };
        if (selectedMachineId) {
            payload.machineId = selectedMachineId;
        }

        setStatus('saving');
        try {
            const response = await apiPost('/api/checklist.php', payload);
            const lockedDays = Array.isArray(response.lockedDays) ? response.lockedDays : pendingDays;
            setForemanLockedDays((prev) => {
                const next = new Set(prev);
                lockedDays.forEach((day) => next.add(Number(day)));
                return next;
            });
            setPendingForemanDays(new Set());
            setStatus('saved');
            window.setTimeout(() => setStatus('idle'), 1500);
        } catch (error) {
            setStatus('idle');
            if (error?.status === 401) {
                logout('session-expired');
            } else {
                alert(error?.message || 'ไม่สามารถบันทึกข้อมูลได้');
            }
        }
    };

    const isSaveDisabled = isReadOnlyViewer
        ? true
        : isForeman
            ? (!isMetaComplete || !metaForm.period || !hasPendingForemanSignatures || status === 'saving' || checklistLoading)
            : (!isMetaComplete
                || !metaForm.period
                || (!hasPendingDriverSignatures && !hasPendingDriverStatuses)
                || status === 'saving'
                || checklistLoading);

    // Operators in OnlyView mode cannot save
    if (isOnlyView) {
        // always disable save for only-view operators
        // keep existing disabled state for buttons
        // override to true
        // This ensures Save button is non-interactive for operator-only view.
        // eslint-disable-next-line no-unused-vars
        const _forceDisable = true;
    }

    if (!canAccessChecklist) {
        return (
            <div className="portal">
                <section>
                    <div className="error-row" style={{ marginBottom: '1rem' }}>
                        <strong>ไม่มีสิทธิ์เข้าถึงแบบฟอร์มนี้</strong>
                        <p style={{ marginTop: 4 }}>คุณไม่มีสิทธิ์บันทึกแบบฟอร์มนี้</p>
                    </div>
                    <button type="button" className="button" onClick={() => navigate('/worksite')}>
                        กลับหน้าหลัก
                    </button>
                </section>
            </div>
        );
    }

    // If operator-only view, show a small info banner
    const onlyViewBanner = isOnlyView ? (
        <div style={{ margin: '0.5rem 0', padding: '0.5rem 0.75rem', background: '#f6f8fa', borderRadius: 6 }}>
            <strong>เฉพาะการดู</strong>
            <div style={{ fontSize: 13 }}>คุณมีสิทธิ์ดูแบบฟอร์มนี้ในโหมดอ่านอย่างเดียว (ไม่สามารถแก้ไขหรือบันทึกได้)</div>
        </div>
    ) : null;

    return (
        <div className="checklist-page">
            <style>{CHECKLIST_TABLE_STYLES}</style>
            <section className="checklist-cover">
                <div>
                    <p className="checklist-company">บริษัท ซีวิลเอนจิเนียริง จำกัด (มหาชน) และกลุ่มบริษัทในเครือ</p>
                    <h1>การบำรุงรักษาประจำวัน</h1>
                    <p>Daily Preventive Maintenance</p>
                </div>
                <div className="checklist-meta-grid">
                    <label className="meta-field meta-field--picker" htmlFor="machineCode">
                        <span className="meta-label">รหัสเครื่อง</span>
                        <div className="machine-picker" ref={pickerRef}>
                            <input
                                id="machineCode"
                                type="text"
                                className="machine-input"
                                placeholder={machineLoading ? 'กำลังโหลดรายการ...' : 'พิมพ์หรือเลือกจากรายการ'}
                                value={metaForm.machineCode}
                                disabled={machineLoading}
                                onChange={(event) => {
                                    handleMetaChange('machineCode')(event);
                                    setShowOptions(true);
                                    setHighlightIndex(0);
                                }}
                                onFocus={() => setShowOptions(true)}
                                onKeyDown={(event) => {
                                    if (event.key === 'ArrowDown') {
                                        event.preventDefault();
                                        setShowOptions(true);
                                        setHighlightIndex((prev) =>
                                            Math.min(prev + 1, Math.max(filteredMachineOptions.length - 1, 0)),
                                        );
                                    } else if (event.key === 'ArrowUp') {
                                        event.preventDefault();
                                        setHighlightIndex((prev) => Math.max(prev - 1, 0));
                                    } else if (event.key === 'Enter') {
                                        if (showOptions && filteredMachineOptions[highlightIndex]) {
                                            event.preventDefault();
                                            handleSelectMachine(filteredMachineOptions[highlightIndex].value);
                                        }
                                    } else if (event.key === 'Escape') {
                                        setShowOptions(false);
                                    }
                                }}
                                role="combobox"
                                aria-expanded={showOptions}
                                aria-controls="checklist-machine-options"
                                aria-autocomplete="list"
                            />
                            {showOptions && filteredMachineOptions.length > 0 && (
                                <ul className="picker-options" id="checklist-machine-options" role="listbox">
                                    {filteredMachineOptions.map((option, index) => (
                                        <li key={option.value}>
                                            <button
                                                type="button"
                                                className={`picker-option${index === highlightIndex ? ' active' : ''}`}
                                                onMouseDown={(event) => {
                                                    event.preventDefault();
                                                    handleSelectMachine(option.value);
                                                }}
                                                role="option"
                                                aria-selected={index === highlightIndex}
                                            >
                                                <strong>{option.value}</strong>
                                                <span>{option.label.replace(option.value, '').replace(/^\s*·\s*/, '')}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        {machineError && <p className="field-error">{machineError}</p>}
                    </label>
                    <label className="meta-field" htmlFor="machineType">
                        <span className="meta-label">รุ่น/ยี่ห้อ</span>
                        <input id="machineType" type="text" value={vehicleType} readOnly placeholder="-" />
                    </label>
                    <label className="meta-field" htmlFor="department">
                        <span className="meta-label">หน่วยงาน</span>
                        <input
                            id="department"
                            type="text"
                            placeholder="ชื่อหน่วยงาน"
                            value={metaForm.department}
                            onChange={handleMetaChange('department')}
                        />
                    </label>
                    <label
                        className="meta-field"
                        htmlFor="date"
                        onClick={(event) => {
                            if (event.target.id !== 'date') {
                                openDatePicker();
                            }
                        }}
                    >
                        <span className="meta-label">วันที่บังคับใช้(ไม่มีผลกับแบบฟอร์ม)</span>
                        <input
                            id="date"
                            type="date"
                            value={metaForm.date}
                            onClick={openDatePicker}
                            onFocus={openDatePicker}
                            onChange={handleMetaChange('date')}
                            ref={dateInputRef}
                        />
                    </label>
                    <label className="meta-field" htmlFor="period-input">
                        <span className="meta-label">ประจำเดือน / ปี</span>
                        <input
                            id="period-input"
                            type="month"
                            value={metaForm.period}
                            ref={periodInputRef}
                            onFocus={openPeriodPicker}
                            onClick={openPeriodPicker}
                            onChange={handleMetaChange('period')}
                        />
                    </label>
                </div>
            </section>

            {checklistError && (
                <p style={{ color: '#c0392b', fontWeight: 600, marginTop: '0.75rem' }}>{checklistError}</p>
            )}
            {!isMetaComplete && (
                <p style={{ color: '#c0392b', fontWeight: 600, marginTop: '0.5rem' }}>
                    กรุณากรอก "ชื่อหน่วยงาน" และ "รหัสเครื่อง" ให้ครบก่อนเริ่มบันทึกผลการตรวจ
                </p>
            )}

            <section className="checklist-table-wrapper">
                <table className="checklist-table">
                    <thead>
                        <tr>
                            <th rowSpan="2" className="col-order">
                                ลำดับ
                            </th>
                            <th rowSpan="2" className="col-topic">
                                รายการตรวจสอบ
                            </th>
                            <th rowSpan="2" className="col-method">
                                มาตรฐานการตรวจสอบ
                            </th>
                            <th rowSpan="2" className="col-frequency">
                                ความถี่
                            </th>
                        </tr>
                        <tr>
                            {DAY_COLUMNS.map((day) => (
                                <th key={`day-${day}`}>{day}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {[...CHECKLIST_ITEMS, ...SIGNATURE_ROWS].map((item) => (
                            <tr key={item.order} className={`checklist-row${item.isSignature ? ' signature-row' : ''}`}>
                                <td className="col-order">{item.order}</td>
                                <td className="col-topic">{item.topic}</td>
                                <td className="col-method">{item.method}</td>
                                <td className="col-frequency">{item.frequency}</td>
                                {DAY_COLUMNS.map((day) => (
                                    <td key={`${item.order}-${day}`}>
                                        {item.isSignature ? (
                                            renderSignatureInput(item, day)
                                        ) : (
                                            <select
                                                className="status-select"
                                                value={checklistValues[String(day)]?.[item.order] ?? ''}
                                                aria-label={`เลือกสถานะ ข้อ ${item.order} วันที่ ${day}`}
                                                disabled={!isMetaComplete || isForeman || lockedChecklistCells.has(`${String(day)}:${item.order}`) || checklistLoading || isReadOnlyViewer || isOnlyView}
                                                onChange={(event) => handleStatusChange(day, item.order, event.target.value)}
                                            >
                                                {STATUS_OPTIONS.map((option) => (
                                                    <option key={`${item.order}-${day}-${option.value || 'blank'}`} value={option.value}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            <section className="checklist-footer">
                <div className="legend">
                    {LEGEND.map((item) => (
                        <div key={item.symbol} className="legend-item">
                            <span className="legend-symbol">{item.symbol}</span>
                            <span>{item.label}</span>
                        </div>
                    ))}
                </div>
            </section>

            <section className="issue-panel">
                <div className="issue-panel__header">
                    <h3>ปัญหาที่ตรวจพบ (ถ้ามี)</h3>
                </div>
                <label className="issue-panel__field" htmlFor="issue-notes">
                    <span>รายละเอียด</span>
                    <textarea
                        id="issue-notes"
                        rows="4"
                        placeholder="กรอกรายละเอียดปัญหาที่พบระหว่างการตรวจเช็ก"
                        value={issueNotes}
                        onChange={(event) => setIssueNotes(event.target.value)}
                    />
                </label>
            </section>

            <section className="checklist-actions">
                <button
                    type="button"
                    className="button ghost"
                    onClick={() => navigate(isReadOnlyViewer ? '/admin' : '/worksite')}
                >
                    ย้อนกลับ
                </button>
                <button type="button" className="button primary" disabled={isSaveDisabled || isOnlyView} onClick={handleSave}>
                    {isForeman ? 'บันทึกลายเซ็นโฟร์แมน' : 'บันทึกข้อมูลพขร.'}
                </button>
                {status === 'saving' && <span className="text-muted">กำลังบันทึก...</span>}
                {status === 'saved' && <span className="text-success">บันทึกแล้ว</span>}
            </section>

            {status === 'saved' && (
                <div className="dialog-overlay" role="dialog" aria-modal="true">
                    <div className="dialog-card checklist-dialog">
                        <h3>บันทึกสำเร็จ</h3>
                        <p>ระบบเก็บบันทึกแบบฟอร์มเรียบร้อยแล้ว</p>
                        <div className="dialog-actions">
                            <button
                                type="button"
                                className="button primary"
                                onClick={() => {
                                    setStatus('idle');
                                    navigate('/worksite');
                                }}
                            >
                                กลับหน้าหลัก
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
