import { useEffect, useMemo, useRef, useState } from 'react';
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


import ปลากรอบ from '../images/ปลากรอบ.jpg';


const workTypes = ['งานปกติ', 'งานพิเศษ', 'งานซ่อมบำรุง'];
const checklistStatuses = ['ปกติ', 'ผิดปกติ'];
const MAX_PHOTO_ATTACHMENTS = 5;
const MAX_PHOTO_SIZE_MB = 8;
const MAX_PHOTO_SIZE_BYTES = MAX_PHOTO_SIZE_MB * 1024 * 1024;

const formatFileSize = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return '0.00 MB';
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const sanitizeManualTimeInput = (value) => value.replace(/[^0-9:.\s]/g, '').replace(/\s+/g, '');

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

const calculateTimeDurationHours = (start, end) => {
    const startMinutes = parseTimeToMinutes(start);
    const endMinutes = parseTimeToMinutes(end);
    if (startMinutes === null || endMinutes === null) {
        return '';
    }
    let diff = endMinutes - startMinutes;
    if (diff < 0) {
        diff += 24 * 60;
    }
    return formatMinutesToClock(diff);
};

const createDefaultForm = () => ({
    documentDate: new Date().toISOString().slice(0, 10),
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
    assistantName: '',
    recorderName: '',
    notes: '',
    checklist: createChecklistState(),
    checklistOtherNote: '',
    fuelDetails: createFuelDetailsState(),
});

export default function OilLog() {
    const navigate = useNavigate();
    const [form, setForm] = useState(() => createDefaultForm());
    const [machines, setMachines] = useState([]);
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
    const machinePickerRef = useRef(null);
    const photoInputRef = useRef(null);

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
                // silently ignore; users can type manually
            }
        })();
    }, []);

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

    const handleMeterChange = (field) => (event) => {
        const value = event.target.value;
        setForm((prev) => {
            const next = { ...prev, [field]: value };
            if (field === 'workMeterStart' || field === 'workMeterEnd') {
                const start = parseFloat(next.workMeterStart);
                const end = parseFloat(next.workMeterEnd);
                if (!Number.isNaN(start) && !Number.isNaN(end)) {
                    next.workMeterTotal = (end - start).toFixed(2);
                }
            }
            return next;
        });
    };

    const handleTimeFieldChange = (segmentKey, type) => (event) => {
        const rawValue = event.target.value;
        const sanitizedValue = sanitizeManualTimeInput(rawValue);
        const startField = `time${segmentKey}Start`;
        const endField = `time${segmentKey}End`;
        const totalField = `time${segmentKey}Total`;
        const targetField = type === 'start' ? startField : (type === 'end' ? endField : totalField);
        setForm((prev) => {
            const next = { ...prev };
            if (type === 'total') {
                if (!sanitizedValue) {
                    next[targetField] = '';
                } else {
                    const manualMinutes = parseTimeToMinutes(sanitizedValue);
                    next[targetField] = manualMinutes === null ? sanitizedValue : formatMinutesToClock(manualMinutes);
                }
                return next;
            }
            if (!sanitizedValue) {
                next[targetField] = '';
            } else {
                const manualMinutes = parseTimeToMinutes(sanitizedValue);
                next[targetField] = manualMinutes === null ? sanitizedValue : formatMinutesToClock(manualMinutes);
            }
            if (type === 'start' || type === 'end') {
                const startVal = next[startField];
                const endVal = next[endField];
                if (startVal && endVal) {
                    next[totalField] = calculateTimeDurationHours(startVal, endVal);
                } else {
                    next[totalField] = '';
                }
            }
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
            timeMorningTotal: clockStringToDecimalHours(form.timeMorningTotal),
            timeAfternoonTotal: clockStringToDecimalHours(form.timeAfternoonTotal),
            timeOtTotal: clockStringToDecimalHours(form.timeOtTotal),
        };
        const submissionPayload = {
            ...form,
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
            await apiPost('/api/oillogs.php', multipartPayload);
            setSuccessMessage('บันทึกข้อมูลเรียบร้อย');
            setForm(createDefaultForm());
            setPhotoFiles([]);
            setPhotoError('');
            if (photoInputRef.current) {
                photoInputRef.current.value = '';
            }
            await refreshLogs();
            window.setTimeout(() => setSuccessMessage(''), 3000);
            navigate('/worksite');
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

    return (
        <div className="portal">
            <section className="oil-log-page">
                <div className="page-banner">
                    <Link to="/worksite" className="back-link">
                        ย้อนกลับ
                    </Link>
                    <div>
                        <h2>ใบรายงานการปฏิบัติงานและบันทึกน้ำมัน</h2>
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
                                วันที่บันทึก
                                <input type="date" value={form.documentDate} onChange={handleChange('documentDate')} required />
                            </label>
                            <label>
                                เลขที่เอกสาร (ถ้ามี)
                                <input type="text" value={form.documentNo} onChange={handleChange('documentNo')} placeholder="เช่น OIL-001" />
                            </label>
                        </div>
                        <div className="grid three-cols">
                            <label>
                                โครงการ/หน่วยงาน
                                <input type="text" value={form.projectName} onChange={handleChange('projectName')} placeholder="เช่น โครงการทางด่วน" required/>
                            </label>
                            <label>
                                สถานที่
                                <input type="text" value={form.locationName} onChange={handleChange('locationName')} placeholder="เช่น ไซต์ A" required/>
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
                            <div className="grid two-cols operation-grid">
                                <label>
                                    รายละเอียดการทำงาน
                                    <textarea rows="4" value={form.operationDetails} onChange={handleChange('operationDetails')} placeholder="เช่น ส่งของ" />
                                </label>
                                <label>
                                    WBS / รหัสงาน
                                    <input type="text" value={form.workOrder} onChange={handleChange('workOrder')} placeholder="เช่น โครงการสร้างสะพาน" />
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
                            <h3>มิเตอร์หัวจ่ายน้ำมัน</h3>
                            <p>คัดลอกตัวเลขจากมิเตอร์หัวจ่ายก่อน/หลังการทำงาน เพื่อคำนวณจำนวนที่ใช้จริง</p>
                        </header>
                        <div className="grid three-cols">
                            <label>
                                มิเตอร์ก่อนเริ่มงาน
                                <input type="number" inputMode="decimal" step="0.01" value={form.workMeterStart} onChange={handleMeterChange('workMeterStart')} required/>
                            </label>
                            <label>
                                มิเตอร์หลังเสร็จงาน
                                <input type="number" inputMode="decimal" step="0.01" value={form.workMeterEnd} onChange={handleMeterChange('workMeterEnd')} required/>
                            </label>
                            <label>
                                รวม (หน่วยมิเตอร์)
                                <input type="number" inputMode="decimal" step="0.01" value={form.workMeterTotal} onChange={handleChange('workMeterTotal')} />
                            </label>
                        </div>

                        <header>
                            <h3>เวลาปฏิบัติงานตามช่วง</h3>
                            <p>แยกเวลาปฏิบัติงานเป็นเช้า บ่าย และ OT ตามแบบฟอร์ม</p>
                        </header>
                        <div className="time-grid">
                            {oilTimeSegments.map((segment) => {
                                const startField = `time${segment.key}Start`;
                                const endField = `time${segment.key}End`;
                                const totalField = `time${segment.key}Total`;
                                return (
                                    <div className="time-row" key={segment.key}>
                                        <div className="time-row__meta">
                                            <strong>{segment.label}</strong>
                                            <p className="muted">{segment.hint}</p>
                                        </div>
                                        <label className="time-field">
                                            <span>เริ่มงาน</span>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                pattern="[0-9:]*"
                                                autoComplete="off"
                                                value={form[startField]}
                                                onChange={handleTimeFieldChange(segment.key, 'start')}
                                            />
                                        </label>
                                        <label className="time-field">
                                            <span>เลิกงาน</span>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                pattern="[0-9:]*"
                                                autoComplete="off"
                                                value={form[endField]}
                                                onChange={handleTimeFieldChange(segment.key, 'end')}
                                            />
                                        </label>
                                        <label className="time-field">
                                            <span>รวม (ชม.)</span>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                pattern="[0-9:]*"
                                                placeholder="0:00"
                                                autoComplete="off"
                                                value={form[totalField]}
                                                onChange={handleTimeFieldChange(segment.key, 'total')}
                                            />
                                        </label>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="time-total-pill" aria-live="polite">
                            <span>รวมเวลาทั้งหมด</span>
                            <strong>{formattedTotalWorkHours} ชม.</strong>
                        </div>

                        <header>
                            <h3>ชั่วโมงเครื่อง / เลขไมล์</h3>
                        </header>
                        <div className="grid two-cols">
                            <label>
                                ชั่วโมงเครื่อง (HR)
                                <input type="number" inputMode="decimal" step="0.1" value={form.meterHourStart} onChange={handleChange('meterHourStart')} />
                            </label>
                            <label>
                                เลขกิโลเมตร (KM)
                                <input type="number" inputMode="decimal" step="0.1" value={form.odometerStart} onChange={handleChange('odometerStart')} />
                            </label>
                        </div>

                        <header>
                            <h3>ผู้รับผิดชอบ</h3>
                        </header>
                        <div className="grid three-cols">
                            <label>
                                พนักงานขับรถ
                                <input type="text" value={form.operatorName} onChange={handleChange('operatorName')} placeholder="ชื่อ-นามสกุล" required/>
                            </label>
                            <label>
                                ผู้ตรวจสอบ
                                <input type="text" value={form.assistantName} onChange={handleChange('assistantName')} placeholder="ชื่อ-นามสกุล" required/>
                            </label>
                            <label>
                                พนักงานออยเลอร์
                                <input type="text" value={form.recorderName} onChange={handleChange('recorderName')} placeholder="ชื่อ-นามสกุล" required/>
                            </label>
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
                            <h3>รูปภาพประกอบ</h3>
                            <p>แนบหลักฐานการเติมน้ำมันอย่างน้อย 1 รูป</p>
                            
                            {/* เล่นๆโดนด่าก่อนเดี๋ยวมาลบ */}
                            <p>
                            <img src={ปลากรอบ} alt="ปลากรอบ" style={{maxWidth: '200px', display: 'block', marginTop: '8px', marginLeft: 'auto', marginRight: 'auto'}} 
                            />
                            </p>
                            <p style={{marginRight:'auto', marginLeft:'auto' , maxWidth:'100px' , color:'black'}}>ภาพปลากรอบ</p>
                        
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
        </div>
    );
}
