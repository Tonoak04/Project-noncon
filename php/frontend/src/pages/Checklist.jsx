import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
    DAY_COLUMNS,
    STATUS_OPTIONS,
    LEGEND,
    CHECKLIST_ITEMS,
    SIGNATURE_ROWS,
    CHECKLIST_TABLE_STYLES,
    BASE_DEPARTMENT_OPTIONS,
    defaultMetaForm,
    normalizeMachineRow,
    formatUserName,
    mapSignatureValues,
    resolveSignatureDisplay,
    normalizeChecklistMatrix,
    buildChecklistLocks,
} from './checklistShared.js';

export default function Checklist() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const pickerRef = useRef(null);
    const periodInputRef = useRef(null);

    const [metaForm, setMetaForm] = useState(() => defaultMetaForm());
    const [machines, setMachines] = useState([]);
    const [machineLoading, setMachineLoading] = useState(false);
    const [machineError, setMachineError] = useState('');
    const [vehicleType, setVehicleType] = useState('-');
    const [showOptions, setShowOptions] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(0);

    const [checklistLoading, setChecklistLoading] = useState(false);
    const [checklistError, setChecklistError] = useState('');
    const [issueNotes, setIssueNotes] = useState('');
    const [savedIssueNotes, setSavedIssueNotes] = useState('');
    const [selectedMachineId, setSelectedMachineId] = useState(null);
    const [status, setStatus] = useState('idle');

    const [foremanSignatures, setForemanSignatures] = useState({});
    const [foremanSignatureLabels, setForemanSignatureLabels] = useState({});
    const [foremanLockedDays, setForemanLockedDays] = useState(() => new Set());
    const [pendingForemanDays, setPendingForemanDays] = useState(() => new Set());

    const [driverSignatures, setDriverSignatures] = useState({});
    const [driverSignatureLabels, setDriverSignatureLabels] = useState({});
    const [driverLockedDays, setDriverLockedDays] = useState(() => new Set());
    const [pendingDriverSignatureDays, setPendingDriverSignatureDays] = useState(() => new Set());

    const [checklistValues, setChecklistValues] = useState({});
    const [lockedChecklistCells, setLockedChecklistCells] = useState(() => new Set());
    const [pendingChecklistCells, setPendingChecklistCells] = useState(() => new Set());

    const currentPeriod = useMemo(() => {
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        return `${now.getFullYear()}-${month}`;
    }, []);
    const isPeriodEditable = Boolean(metaForm.period && metaForm.period === currentPeriod);

    const normalizedRoles = useMemo(() => {
        const source = Array.isArray(user?.roles) && user.roles.length
            ? user.roles
            : (user?.role ? [user.role] : []);
        return source
            .map((role) => (typeof role === 'string' ? role.trim().toLowerCase() : ''))
            .filter(Boolean);
    }, [user]);
    const hasRole = (role) => normalizedRoles.includes(role);
    const isDriver = hasRole('driver');
    const isForeman = hasRole('foreman');
    const isAdmin = hasRole('admin');
    const isOperator = hasRole('operator');
    const canAccessChecklist = Boolean(user) && (isDriver || isForeman || isOperator || isAdmin);
    const isOnlyView = !isDriver && !isForeman && !isAdmin && isOperator;

    const trimmedMachineCode = metaForm.machineCode.trim();
    const trimmedDepartment = metaForm.department.trim();
    const isMetaComplete = Boolean(trimmedMachineCode && trimmedDepartment && metaForm.period);
    const shouldShowChecklistTable = isMetaComplete;

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

    const departmentOptions = useMemo(() => {
        const labels = new Map();
        BASE_DEPARTMENT_OPTIONS.forEach((label) => {
            const trimmed = label.trim();
            if (trimmed) {
                labels.set(trimmed, trimmed);
            }
        });
        machines.forEach((machine) => {
            const label = (machine.department || '').trim();
            if (label) {
                labels.set(label, label);
            }
        });
        if (trimmedDepartment) {
            labels.set(trimmedDepartment, trimmedDepartment);
        }
        return Array.from(labels.values()).map((label) => ({ value: label, label }));
    }, [machines, trimmedDepartment]);

    const createDaySet = useCallback(
        (values) => new Set((Array.isArray(values) ? values : []).map((value) => Number(value))),
        [],
    );

    const clearForemanState = useCallback(() => {
        setForemanSignatures({});
        setForemanSignatureLabels({});
        setForemanLockedDays(new Set());
        setPendingForemanDays(new Set());
    }, []);

    const clearDriverState = useCallback(() => {
        setDriverSignatures({});
        setDriverSignatureLabels({});
        setDriverLockedDays(new Set());
        setPendingDriverSignatureDays(new Set());
        setChecklistValues({});
        setLockedChecklistCells(new Set());
        setPendingChecklistCells(new Set());
        setIssueNotes('');
        setSavedIssueNotes('');
    }, []);

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
                    .filter(Boolean)
                    .sort((a, b) => a.value.localeCompare(b.value));
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

    useEffect(() => {
        if (highlightIndex >= filteredMachineOptions.length) {
            setHighlightIndex(0);
        }
    }, [filteredMachineOptions.length, highlightIndex]);

    useEffect(() => {
        if (!trimmedMachineCode || !metaForm.period || !trimmedDepartment) {
            clearDriverState();
            clearForemanState();
            setSelectedMachineId(null);
            if (!trimmedMachineCode) {
                setVehicleType('-');
            }
            setIssueNotes('');
            setChecklistError('');
            setStatus('idle');
            return;
        }

        let ignore = false;
        setChecklistLoading(true);
        setChecklistError('');
        const params = new URLSearchParams({
            machine: trimmedMachineCode,
            period: metaForm.period,
            department: trimmedDepartment,
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
                if (data.meta) {
                    const serverDepartment = data.meta.department || '';
                    setMetaForm((prev) => {
                        if (!serverDepartment) {
                            return prev;
                        }
                        if (prev.department && prev.department !== serverDepartment) {
                            return prev;
                        }
                        return {
                            ...prev,
                            department: serverDepartment,
                        };
                    });
                    const serverIssueNotes = data.meta.issueNotes ?? '';
                    setIssueNotes(serverIssueNotes);
                    setSavedIssueNotes(serverIssueNotes.trim());
                } else {
                    setIssueNotes('');
                    setSavedIssueNotes('');
                }
                const driverDataset = mapSignatureValues(data.driver?.values);
                const driverLockedInitial = createDaySet(data.driver?.lockedDays);
                const driverValuesResolved = { ...driverDataset.values };
                const currentUserLabel = formatUserName(user) || '';
                const currentUserCode = user?.employeeId || user?.Username || user?.username || '';
                if (currentUserLabel && currentUserCode) {
                    Object.entries(driverDataset.labels).forEach(([day, label]) => {
                        if (
                            label
                            && driverValuesResolved[day]
                            && driverValuesResolved[day] === label
                            && label === currentUserLabel
                        ) {
                            driverValuesResolved[day] = currentUserCode;
                        }
                    });
                }
                setDriverSignatures(driverValuesResolved);
                setDriverSignatureLabels(driverDataset.labels);
                setDriverLockedDays(isPeriodEditable ? new Set() : driverLockedInitial);
                setPendingDriverSignatureDays(new Set());
                const foremanDataset = mapSignatureValues(data.foreman?.values);
                const foremanLockedInitial = createDaySet(data.foreman?.lockedDays);
                setForemanSignatures(foremanDataset.values);
                setForemanSignatureLabels(foremanDataset.labels);
                setForemanLockedDays(isPeriodEditable ? new Set() : foremanLockedInitial);
                setPendingForemanDays(new Set());
                const normalizedItems = normalizeChecklistMatrix(data.items?.values);
                setChecklistValues(normalizedItems);
                setLockedChecklistCells(isPeriodEditable ? new Set() : buildChecklistLocks(normalizedItems));
                setPendingChecklistCells(new Set());
            } catch (error) {
                if (!ignore) {
                    if (error?.status === 401) {
                        logout('session-expired');
                    } else {
                        setChecklistError(error?.message || 'ไม่สามารถโหลดข้อมูลลายเซ็นได้');
                        clearDriverState();
                        clearForemanState();
                        setSelectedMachineId(null);
                        setVehicleType('-');
                        setIssueNotes('');
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
    }, [
        logout,
        trimmedMachineCode,
        metaForm.period,
        trimmedDepartment,
        clearDriverState,
        clearForemanState,
        createDaySet,
        isPeriodEditable,
        user,
    ]);

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
                const displayValue = resolveSignatureDisplay(value, foremanOptions, foremanSignatureLabels[dayKey]);
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
                    disabled={!isMetaComplete || !isPeriodEditable || isLocked || checklistLoading || foremanOptions.length === 0}
                    onChange={(event) => {
                        const nextValue = event.target.value;
                        setForemanSignatures((prev) => ({ ...prev, [dayKey]: nextValue }));
                        const label = foremanOptions.find((option) => option.value === nextValue)?.label || '';
                        setForemanSignatureLabels((prev) => ({ ...prev, [dayKey]: label || '' }));
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
            if (driverLocked || isForeman || isOnlyView) {
                const displayValue = resolveSignatureDisplay(driverValue, driverOptions, driverSignatureLabels[dayKey]);
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
                    disabled={!isMetaComplete || !isPeriodEditable || checklistLoading || driverOptions.length === 0 || isOnlyView}
                    onChange={(event) => {
                        const nextValue = event.target.value;
                        setDriverSignatures((prev) => ({ ...prev, [dayKey]: nextValue }));
                        const label = driverOptions.find((option) => option.value === nextValue)?.label || '';
                        setDriverSignatureLabels((prev) => ({ ...prev, [dayKey]: label || '' }));
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
        const dayKey = String(day);
        const key = `${dayKey}:${order}`;
        if (lockedChecklistCells.has(key) || !isPeriodEditable) {
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
    const issueNotesTrimmed = issueNotes.trim();
    const hasIssueNotesChange = issueNotesTrimmed !== savedIssueNotes;

    const handleSave = async () => {
        if (!isMetaComplete || !metaForm.period) {
            alert('กรุณากรอกชื่อหน่วยงาน รหัสเครื่องจักร และเดือน/ปี ให้ครบ');
            return;
        }

        if (!isPeriodEditable) {
            alert('แบบฟอร์มของเดือนที่เลือกถูกปิดไม่ให้แก้ไขแล้ว');
            return;
        }

        if (isDriver) {
            if (!hasPendingDriverSignatures && !hasPendingDriverStatuses && !hasIssueNotesChange) {
                alert('ยังไม่มีข้อมูลใหม่สำหรับบันทึก');
                return;
            }

            const payload = {
                machineCode: metaForm.machineCode,
                period: metaForm.period,
                signatureType: 'driver',
                department: trimmedDepartment,
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

            if (hasIssueNotesChange) {
                payload.issueNotes = issueNotesTrimmed;
            }

            if (!payload.signatures && !payload.items && !payload.issueNotes) {
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
                    if (!isPeriodEditable) {
                        setDriverLockedDays((prev) => {
                            const next = new Set(prev);
                            lockedDays.forEach((day) => next.add(Number(day)));
                            return next;
                        });
                    } else {
                        setDriverLockedDays(new Set());
                    }
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
                        if (!isPeriodEditable) {
                            setLockedChecklistCells((prev) => {
                                const next = new Set(prev);
                                fallbackItems.forEach((item) => {
                                    next.add(`${String(item.day)}:${Number(item.order)}`);
                                });
                                return next;
                            });
                        } else {
                            setLockedChecklistCells(new Set());
                        }
                    }
                    setPendingChecklistCells(new Set());
                }
                if (hasIssueNotesChange) {
                    setSavedIssueNotes(issueNotesTrimmed);
                }
                setStatus('saved');
                setTimeout(() => setStatus('idle'), 1500);
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
            department: trimmedDepartment,
        };
        if (selectedMachineId) {
            payload.machineId = selectedMachineId;
        }

        setStatus('saving');
        try {
            const response = await apiPost('/api/checklist.php', payload);
            const lockedDays = Array.isArray(response.lockedDays) ? response.lockedDays : pendingDays;
            if (!isPeriodEditable) {
                setForemanLockedDays((prev) => {
                    const next = new Set(prev);
                    lockedDays.forEach((day) => next.add(Number(day)));
                    return next;
                });
            } else {
                setForemanLockedDays(new Set());
            }
            setPendingForemanDays(new Set());
            setStatus('saved');
            setTimeout(() => setStatus('idle'), 1500);
        } catch (error) {
            setStatus('idle');
            if (error?.status === 401) {
                logout('session-expired');
            } else {
                alert(error?.message || 'ไม่สามารถบันทึกข้อมูลได้');
            }
        }
    };

    const isSaveDisabled = isForeman
        ? (!isMetaComplete || !metaForm.period || !isPeriodEditable || !hasPendingForemanSignatures || status === 'saving' || checklistLoading)
        : (!isMetaComplete
            || !metaForm.period
            || !isPeriodEditable
            || (!hasPendingDriverSignatures && !hasPendingDriverStatuses && !hasIssueNotesChange)
            || status === 'saving'
            || checklistLoading);

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

    const onlyViewBanner = isOnlyView ? (
        <div style={{ margin: '0.5rem 0', padding: '0.5rem 0.75rem', background: '#f6f8fa', borderRadius: 6 }}>
            <strong>เฉพาะการดู</strong>
            <div style={{ fontSize: 13 }}>คุณมีสิทธิ์ดูแบบฟอร์มนี้ในโหมดอ่านอย่างเดียว (ไม่สามารถแก้ไขหรือบันทึกได้)</div>
        </div>
    ) : null;

    const periodLockBanner = metaForm.period && !isPeriodEditable ? (
        <div style={{ margin: '0.5rem 0', padding: '0.5rem 0.75rem', background: '#fff3cd', borderRadius: 6, color: '#7c5b00' }}>
            <strong>ปิดการแก้ไข</strong>
            <div style={{ fontSize: 13 }}>อนุญาตให้แก้ไขเฉพาะแบบฟอร์มเดือน {currentPeriod} เท่านั้น</div>
        </div>
    ) : null;

    const renderChecklistBody = () => (
        <>
            {onlyViewBanner}
            {periodLockBanner}

            {checklistError && (
                <p style={{ color: '#c0392b', fontWeight: 600, marginTop: '0.75rem' }}>{checklistError}</p>
            )}
            {!isAdmin && !isMetaComplete && (
                <p style={{ color: '#c0392b', fontWeight: 600, marginTop: '0.5rem' }}>
                    กรุณาเลือก "ชื่อหน่วยงาน" และ "รหัสเครื่อง" ให้ครบก่อนเริ่มบันทึกผลการตรวจ
                </p>
            )}

            {shouldShowChecklistTable ? (
                <>
                    <section id="checklist-table-section" className="checklist-table-wrapper">
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
                                    <tr key={item.order || item.topic} className={`checklist-row${item.isSignature ? ' signature-row' : ''}`}>
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
                                                        disabled={!isMetaComplete || !isPeriodEditable || isForeman || lockedChecklistCells.has(`${String(day)}:${item.order}`) || checklistLoading || isOnlyView}
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
                                disabled={!isMetaComplete || !isPeriodEditable || isForeman || isOnlyView}
                                onChange={(event) => setIssueNotes(event.target.value)}
                            />
                        </label>
                    </section>

                    {!isAdmin && (
                        <>
                            <section className="checklist-actions">
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
                        </>
                    )}
                </>
            ) : (
                isAdmin && (
                    <section className="admin-empty-state">
                        <h3>ยังไม่มีผลการค้นหา</h3>
                        <p>กรุณาเลือกเดือน รหัสรถ และสถานที่ แล้วกด "ค้นหาแบบฟอร์ม" เพื่อดูรายละเอียดการตรวจเช็ก</p>
                    </section>
                )
            )}
        </>
    );

    return (
        <div className="checklist-page">
            <style>{CHECKLIST_TABLE_STYLES}</style>
            <div className="page-banner-wrapper">
                <section className="checklist-cover page-banner page-banner--user">
                    <div className="page-banner__content">
                        <button type="button" className="brand-back" style={{margin:'4px'}} onClick={() => navigate('/worksite')}>
                            กลับหน้าหลัก
                        </button>
                        <br></br>
                        <span className="brand-label" style={{color: '#0b2644'}}> Daily Form </span>
                        <p className="checklist-company brand-babel" >บริษัท ซีวิลเอนจิเนียริง จำกัด (มหาชน) และกลุ่มบริษัทในเครือ</p>
                        <h1 className="brand-babel" fontcolor="white" >การบำรุงรักษาประจำวัน</h1>
                        <p className="brand-babel__subtitle" style={{color:'#0b2644'}}>Daily Preventive Maintenance</p>
                    </div>
                    <div className="checklist-meta-grid page-banner__meta">
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
                            <select
                                id="department"
                                value={metaForm.department}
                                onChange={handleMetaChange('department')}
                            >
                                <option value="">เลือกหน่วยงาน</option>
                                {departmentOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
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
            </div>
            {renderChecklistBody()}
        </div>
    );
}
