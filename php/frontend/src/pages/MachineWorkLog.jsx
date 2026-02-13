import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { apiGet, apiPost } from '../api.js';
import { oilTimeSegments,
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

    const [form, setForm] = useState(() => ({
        documentDate: formatDateTimeLocal(),
        machineCode: '',
        machineName: '',
        machineDescription: '',
        workOrder: '',
        workOrders: [''],
        operatorName: user?.fullName || '',
        operationDetails: '',
        meterHourStart: '',
        meterHourEnd: '',
        odometerStart: '',
        odometerEnd: '',
        workMeterStart: '',
        workMeterEnd: '',
        workMeterTotal: '',
        ...buildInitialTimeFields(),
        hours: '',
        checklist: createChecklistState(),
        checklistOtherNote: '',
    }));
    const checklistStatuses = ['ปกติ', 'ผิดปกติ'];
    const [logs, setLogs] = useState([]);
    const [machines, setMachines] = useState([]);
    const [showMachineOptions, setShowMachineOptions] = useState(false);
    const [machineHighlightIndex, setMachineHighlightIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const machinePickerRef = useRef(null);
    const navigate = useNavigate();

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
            // ensure we send workOrders array and keep single workOrder for backward compatibility
            const payload = { ...form };
            if (!Array.isArray(payload.workOrders)) {
                payload.workOrders = Array.isArray(form.workOrders) ? form.workOrders : (form.workOrders ? [form.workOrders] : []);
            }
            payload.workOrder = payload.workOrders && payload.workOrders.length ? payload.workOrders[0] : (payload.workOrder || '');
            // try to post to backend; if not available, just prepend locally
            const res = await apiPost('/api/machine_work_logs.php', payload).catch(() => null);
            if (res && res.item) {
                setLogs((prev) => [res.item, ...prev]);
            } else {
                setLogs((prev) => [{ id: Date.now(), ...payload }, ...prev]);
            }
            setForm((prev) => ({
                ...prev,
                operationDetails: '',
                hours: '',
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
                    <Link to="/worksite" className="back-link">ย้อนกลับ</Link>
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
                            พนักงาน/ผู้ปฏิบัติงาน
                            <input type="text" value={form.operatorName} disabled />
                            <span className="muted small-text">ชื่อผู้ปฏิบัติงานถูกล็อกตามบัญชีที่เข้าสู่ระบบ</span>
                        </label>
                        <label>
                            รายละเอียดการทำงาน
                            <textarea rows={4} value={form.operationDetails} onChange={handleChange('operationDetails')} required />
                        </label>

                        <header>
                            <h3>มิเตอร์ / เลขไมล์</h3>
                        </header>
                        <div className="grid three-cols">
                            <label>
                                ชั่วโมงเครื่อง (HR) ก่อน
                                <input type="number" inputMode="decimal" step="0.1" value={form.meterHourStart} onChange={handleChange('meterHourStart')} />
                            </label>
                            <label>
                                ชั่วโมงเครื่อง (HR) หลัง
                                <input type="number" inputMode="decimal" step="0.1" value={form.meterHourEnd} onChange={handleChange('meterHourEnd')} />
                            </label>
                            <label>
                                รวมชั่วโมง (HR)
                                <input type="number" inputMode="decimal" step="0.1" value={form.hours} onChange={handleChange('hours')} />
                            </label>
                        </div>
                        <div className="grid three-cols">
                            <label>
                                เลขไมล์ (KM) ก่อน
                                <input type="number" inputMode="decimal" step="0.1" value={form.odometerStart} onChange={handleChange('odometerStart')} />
                            </label>
                            <label>
                                เลขไมล์ (KM) หลัง
                                <input type="number" inputMode="decimal" step="0.1" value={form.odometerEnd} onChange={handleChange('odometerEnd')} />
                            </label>
                            <label>
                                หมายเหตุ
                                <input type="text" value={form.operationNote} onChange={handleChange('operationNote')} />
                            </label>
                        </div>

                        <header>
                            <h3>การใช้งานหน่วยงาน (เมตร)</h3>
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
                            <h3>เวลาปฏิบัติงานตามช่วง</h3>
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
                        {error && <div className="error-row">{error}</div>}
                        <button type="submit" className="button primary full-width" disabled={saving}>
                            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
                        </button>
                    </form>
                </div>
            </section >
        </div>
    );
}
