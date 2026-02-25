import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { apiGet } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import {
    DAY_COLUMNS,
    STATUS_OPTIONS,
    LEGEND,
    BASE_DEPARTMENT_OPTIONS,
    CHECKLIST_ITEMS,
    SIGNATURE_ROWS,
    CHECKLIST_TABLE_STYLES,
    defaultMetaForm,
    normalizeMachineRow,
    mapSignatureValues,
    normalizeChecklistMatrix,
    COMPANY_TITLE,
    FORM_TITLE,
    formatStatusForExport,
    formatSignatureForExport,
    formatPeriodLabel,
    formatThaiDateValue,
    sanitizeFilename,
} from '../checklistShared.js';

export default function ChecklistAdmin() {
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
    const isAdminUser = hasRole('admin');

    const [metaForm, setMetaForm] = useState(() => defaultMetaForm());
    const [machines, setMachines] = useState([]);
    const [machineLoading, setMachineLoading] = useState(false);
    const [machineError, setMachineError] = useState('');
    const [vehicleType, setVehicleType] = useState('-');
    const [checklistLoading, setChecklistLoading] = useState(false);
    const [checklistError, setChecklistError] = useState('');
    const [foremanSignatures, setForemanSignatures] = useState({});
    const [driverSignatures, setDriverSignatures] = useState({});
    const [checklistValues, setChecklistValues] = useState({});
    const [issueNotes, setIssueNotes] = useState('');
    const [selectedMachineId, setSelectedMachineId] = useState(null);
    const [showOptions, setShowOptions] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(0);
    const [adminSearchVersion, setAdminSearchVersion] = useState(0);
    const pickerRef = useRef(null);
    const periodInputRef = useRef(null);
    const lastAdminSearchVersionRef = useRef(0);

    const isAdminSearchReady = Boolean(metaForm.machineCode.trim() && metaForm.department.trim() && metaForm.period);
    const hasChecklistResult = Boolean(
        selectedMachineId
        && metaForm.machineCode.trim()
        && metaForm.period
        && metaForm.department.trim(),
    );

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
        const current = (metaForm.department || '').trim();
        if (current) {
            labels.set(current, current);
        }
        return Array.from(labels.values()).map((label) => ({ value: label, label }));
    }, [machines, metaForm.department]);

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

    const handleAdminSearchSubmit = (event) => {
        if (event) {
            event.preventDefault();
        }
        if (!metaForm.machineCode.trim() || !metaForm.department.trim() || !metaForm.period) {
            alert('กรุณาเลือกเดือน รหัสรถ และสถานที่ให้ครบก่อนค้นหา');
            return;
        }
        setAdminSearchVersion((prev) => prev + 1);
    };

    useEffect(() => {
        if (adminSearchVersion === 0) {
            return;
        }
        if (adminSearchVersion === lastAdminSearchVersionRef.current) {
            return;
        }

        const trimmedCode = metaForm.machineCode.trim();
        const trimmedDepartment = metaForm.department.trim();
        if (!trimmedCode || !metaForm.period || !trimmedDepartment) {
            lastAdminSearchVersionRef.current = adminSearchVersion;
            setChecklistError('กรุณาเลือกเดือน รหัสรถ และสถานที่ให้ครบก่อนค้นหา');
            setChecklistValues({});
            setDriverSignatures({});
            setForemanSignatures({});
            setIssueNotes('');
            setSelectedMachineId(null);
            return;
        }

        let ignore = false;
        lastAdminSearchVersionRef.current = adminSearchVersion;
        setChecklistLoading(true);
        setChecklistError('');
        const params = new URLSearchParams({
            machine: trimmedCode,
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
                    setMetaForm((prev) => ({
                        ...prev,
                        department: data.meta.department || prev.department,
                    }));
                    setIssueNotes(data.meta.issueNotes || '');
                } else {
                    setIssueNotes('');
                }
                const driverDataset = mapSignatureValues(data.driver?.values);
                const foremanDataset = mapSignatureValues(data.foreman?.values);
                setDriverSignatures(driverDataset.labels);
                setForemanSignatures(foremanDataset.labels);
                const normalizedItems = normalizeChecklistMatrix(data.items?.values);
                setChecklistValues(normalizedItems);
            } catch (error) {
                if (!ignore) {
                    if (error?.status === 401) {
                        logout('session-expired');
                    } else {
                        setChecklistError(error?.message || 'ไม่สามารถโหลดข้อมูลลายเซ็นได้');
                        setChecklistValues({});
                        setDriverSignatures({});
                        setForemanSignatures({});
                        setIssueNotes('');
                        setSelectedMachineId(null);
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
    }, [logout, metaForm.machineCode, metaForm.period, metaForm.department, adminSearchVersion]);

    const buildChecklistExportRows = () => {
        const rows = [];
        const machineCode = (metaForm.machineCode || '').trim() || '-';
        const departmentLabel = (metaForm.department || '').trim() || '-';
        const dateLabel = formatThaiDateValue(metaForm.date);
        const vehicleLabel = vehicleType || '-';
        const periodLabel = formatPeriodLabel(metaForm.period);

        rows.push([ '', COMPANY_TITLE, '', '', '', '', '', '', FORM_TITLE]);
        rows.push(['รหัสเครื่องจักร', machineCode, vehicleLabel, '', '', '']);
        rows.push(['หน่วยงานที่รับผิดชอบ', departmentLabel, 'ประจำเดือน', periodLabel, '', '']);
        rows.push(['วันที่บันทึก', dateLabel, '', '']);
        rows.push(['','','','','','','','','','','','','','','','','','','วันที่ตรวจเช็ก']);

        const tableHeader = ['ลำดับ', 'รายการตรวจสอบ', 'มาตรฐาน/เกณฑ์', 'ความถี่', ...DAY_COLUMNS.map((day) => `${day}`)];
        const tableHeaderRowIndex = rows.length + 1;
        rows.push(tableHeader);

        CHECKLIST_ITEMS.forEach((item) => {
            const dayValues = DAY_COLUMNS.map((day) => {
                const value = checklistValues[String(day)]?.[item.order] ?? '';
                return formatStatusForExport(value);
            });
            rows.push([item.order, item.topic, item.method, item.frequency, ...dayValues]);
        });

        rows.push([
            '',
            '',
            '',
            'ผู้ตรวจสอบ/พขร.',
            ...DAY_COLUMNS.map((day) => formatSignatureForExport(driverSignatures[String(day)])),
        ]);
        rows.push([
            '',
            '',
            '',
            'โฟร์แมนผู้ตรวจสอบ',
            ...DAY_COLUMNS.map((day) => formatSignatureForExport(foremanSignatures[String(day)])),
        ]);

        rows.push([]);
        rows.push(['ปัญหาที่ตรวจพบ', issueNotes || '-']);
        rows.push(['คำอธิบายสัญลักษณ์', '✓ = ปกติ, ✗ = ผิดปกติ, S = Stand by, B = จอดซ่อม']);

        return { rows, freezeRow: tableHeaderRowIndex };
    };

    const handleExportExcel = () => {
        const machineCodeValue = (metaForm.machineCode || '').trim();
        const departmentValue = (metaForm.department || '').trim();
        if (!machineCodeValue || !metaForm.period || !departmentValue) {
            alert('กรุณากรอกเดือน รหัสรถ และสถานที่ก่อนส่งออก');
            return;
        }
        if (!hasChecklistResult) {
            alert('กรุณาค้นหาแบบฟอร์มให้พบข้อมูลก่อนส่งออก Excel');
            return;
        }
        try {
            const { rows, freezeRow } = buildChecklistExportRows();
            const worksheet = XLSX.utils.aoa_to_sheet(rows);
            worksheet['!cols'] = [
                { wch: 16 },
                { wch: 44 },
                { wch: 24 },
                { wch: 16 },
                ...DAY_COLUMNS.map(() => ({ wch: 4 })),
            ];
            worksheet['!freeze'] = { xSplit: 5, ySplit: freezeRow };
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Checklist');
            const machineCodeSafe = sanitizeFilename(machineCodeValue);
            const periodSafe = sanitizeFilename(metaForm.period);
            const departmentSafe = sanitizeFilename(departmentValue);
            const filename = `checklist-${machineCodeSafe}-${periodSafe}-${departmentSafe}.xlsx`;
            XLSX.writeFile(workbook, filename);
        } catch (error) {
            console.error('export-checklist', error);
            alert('ไม่สามารถส่งออกไฟล์ Excel ได้ กรุณาลองใหม่อีกครั้ง');
        }
    };

    if (!isAdminUser) {
        return (
            <div className="portal">
                <section>
                    <div className="error-row" style={{ marginBottom: '1rem' }}>
                        <strong>ไม่มีสิทธิ์เข้าถึงแบบฟอร์มนี้</strong>
                        <p style={{ marginTop: 4 }}>บัญชีนี้ไม่ได้รับสิทธิ์หลังบ้านสำหรับตรวจเช็กลิสต์</p>
                    </div>
                    <button type="button" className="button" onClick={() => navigate('/admin')}>
                        กลับหน้าผู้ดูแล
                    </button>
                </section>
            </div>
        );
    }

    const renderSignatureCell = (role, day) => {
        const dayKey = String(day);
        const value = role === 'foreman'
            ? formatSignatureForExport(foremanSignatures[dayKey])
            : formatSignatureForExport(driverSignatures[dayKey]);
        return (
            <input
                type="text"
                className="signature-grid-input"
                value={value || ''}
                readOnly
                aria-label={`ลงชื่อ ${role} วันที่ ${day}`}
            />
        );
    };

    const renderChecklistBody = () => (
        <>
            {checklistError && (
                <p style={{ color: '#c0392b', fontWeight: 600, marginTop: '0.75rem' }}>{checklistError}</p>
            )}

            {hasChecklistResult ? (
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
                                    <tr key={item.order} className={`checklist-row${item.isSignature ? ' signature-row' : ''}`}>
                                        <td className="col-order">{item.order}</td>
                                        <td className="col-topic">{item.topic}</td>
                                        <td className="col-method">{item.method}</td>
                                        <td className="col-frequency">{item.frequency}</td>
                                        {DAY_COLUMNS.map((day) => (
                                            <td key={`${item.order}-${day}`}>
                                                {item.isSignature ? (
                                                    renderSignatureCell(item.signatureRole, day)
                                                ) : (
                                                    <select
                                                        className="status-select"
                                                        value={checklistValues[String(day)]?.[item.order] ?? ''}
                                                        aria-label={`สถานะ ข้อ ${item.order} วันที่ ${day}`}
                                                        disabled
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
                        <label className="issue-panel__field" htmlFor="issue-notes-admin">
                            <span>รายละเอียด</span>
                            <textarea
                                id="issue-notes-admin"
                                rows="4"
                                placeholder="ยังไม่มีข้อมูลปัญหา"
                                value={issueNotes}
                                readOnly
                            />
                        </label>
                    </section>
                </>
            ) : (
                <section className="admin-empty-state">
                    <h3>ยังไม่มีผลการค้นหา</h3>
                    <p>กรุณาเลือกเดือน รหัสรถ และสถานที่ แล้วกด "ค้นหาแบบฟอร์ม" เพื่อดูรายละเอียดการตรวจเช็ก</p>
                </section>
            )}
        </>
    );

    return (
        <div className="checklist-page checklist-page--admin">
            <style>{CHECKLIST_TABLE_STYLES}</style>
            <div className="page-banner-wrapper">
                <section className="admin-hero-banner">
                    <div className="page-banner__content">
                        <p className="admin-eyebrow page-banner__eyebrow">ศูนย์ข้อมูลตรวจเช็ก</p>
                        <h1 className="page-banner__title">เช็กลิสต์เครื่องจักร (ADMIN)</h1>
                        <p className="page-banner__subtitle">ตรวจสอบข้อมูลการเช็กลิสต์เครื่องจักรทั้งหมด</p>
                    </div>
                    <div className="admin-hero-actions page-banner__actions">
                        <button type="button" className="button ghost" onClick={() => navigate('/admin')}>
                            ย้อนกลับ
                        </button>
                        <button
                            type="button"
                            className="button primary"
                            onClick={handleExportExcel}
                            disabled={!hasChecklistResult || checklistLoading}
                        >
                            ส่งออก Excel
                        </button>
                    </div>
                </section>
            </div>
            <section className="admin-search-card">
                <form onSubmit={handleAdminSearchSubmit}>
                    <div className="admin-search-grid">
                        <label className="meta-field admin-search-field" htmlFor="period-input">
                            <span className="meta-label">เดือน / ปี</span>
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
                        <label className="meta-field meta-field--picker admin-search-field" htmlFor="machineCode">
                            <span className="meta-label">รหัสรถ</span>
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
                        </label>
                        <label className="meta-field admin-search-field" htmlFor="department">
                            <span className="meta-label">สถานที่ / หน่วยงาน</span>
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
                    </div>
                    <div className="admin-search-actions">
                        <div className="admin-search-status">
                            {checklistLoading
                                ? 'กำลังค้นหาแบบฟอร์ม...'
                                : 'กรอกเดือน รหัสรถ และสถานที่เพื่อค้นหาแบบฟอร์ม'}
                        </div>
                        <button
                            type="submit"
                            className="button primary"
                            disabled={!isAdminSearchReady || checklistLoading}
                        >
                            {checklistLoading ? 'กำลังค้นหา...' : 'ค้นหาแบบฟอร์ม'}
                        </button>
                    </div>
                </form>
                {machineError && <p className="field-error">{machineError}</p>}
            </section>
            {renderChecklistBody()}
        </div>
    );
}
