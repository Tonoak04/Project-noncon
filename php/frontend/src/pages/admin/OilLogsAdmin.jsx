import { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../../api.js';
import { oilChecklistItems, oilTimeSegments, checklistOtherNoteKey, oilChecklistOtherId } from '../../data/oilLog.js';

const limits = [50, 100, 200, 400];

const numberFormat = (value) => {
    if (value === null || typeof value === 'undefined') return '-';
    return Number(value).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const formatTimeValue = (time) => {
    if (!time) return '-';
    return time.slice(0, 5);
};

const formatHourValue = (value) => {
    if (value === null || typeof value === 'undefined' || value === '') {
        return '-';
    }
    return Number(value).toFixed(2);
};

const thaiDateTimeFormatter = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

const formatThaiDateTime = (value) => {
    if (!value) return '-';
    try {
        return thaiDateTimeFormatter.format(new Date(value));
    } catch (_) {
        return value;
    }
};

const describePersonTimestamp = (value, prefix) => {
    if (!value) return '';
    const formatted = formatThaiDateTime(value);
    if (!formatted || formatted === '-') {
        return '';
    }
    return `${prefix} ${formatted}`;
};

const formatDateDMY = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
};

const getBrowserOrigin = () => (typeof window !== 'undefined' && window.location ? window.location.origin : '');

const API_BASE = (() => {
    const envBase = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE)
        ? import.meta.env.VITE_API_BASE
        : '';
    if (envBase) {
        return envBase.replace(/\/+/g, '/').replace(/\/+$/, '');
    }
    const origin = getBrowserOrigin();
    if (origin && /localhost|127\.0\.0\.1/i.test(origin)) {
        return 'http://localhost:8080';
    }
    return origin ? origin.replace(/\/+$/, '') : '';
})();

const absolutizeUrl = (url) => {
    if (!url) return '';
    if (/^(https?:)?\/\//i.test(url)) {
        if (url.startsWith('//')) {
            const protocol = (typeof window !== 'undefined' && window.location && window.location.protocol)
                ? window.location.protocol
                : 'https:';
            return `${protocol}${url}`;
        }
        return url;
    }
    const base = (API_BASE || getBrowserOrigin() || '').replace(/\/+$/, '');
    if (!base) return url;
    return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
};

export default function OilLogsAdmin() {
    const navigate = useNavigate();
    const [filters, setFilters] = useState({ from: '', to: '', fuelType: 'ทั้งหมด', search: '', limit: 100 });
    const [query, setQuery] = useState(filters);
    const [items, setItems] = useState([]);
    const [summary, setSummary] = useState({ count: 0, total_liters: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selected, setSelected] = useState(null);
    const [latestItems, setLatestItems] = useState([]);
    const [latestLoading, setLatestLoading] = useState(true);
    const [latestError, setLatestError] = useState('');
    const unauthorizedTimerRef = useRef(null);

    const timeDetails = useMemo(() => {
        if (!selected) return [];
        return oilTimeSegments.map((segment) => {
            const prefix = `Time_${segment.key}`;
            return {
                key: segment.key,
                label: segment.label,
                hint: segment.hint,
                start: selected[`${prefix}_Start`] || '',
                end: selected[`${prefix}_End`] || '',
                total: selected[`${prefix}_Total`],
            };
        });
    }, [selected]);
    
    const hasOilTimeSegments = timeDetails.some((row) => (
        Boolean(row.start || row.end || (row.total !== null && row.total !== undefined && row.total !== ''))
    ));

    const mwlTimeDetails = useMemo(() => {
        if (!selected || !selected.MWL_Id) return [];
        return oilTimeSegments.map((segment) => {
            const prefix = `MWL_Time_${segment.key}`;
            return {
                key: segment.key,
                label: segment.label,
                hint: segment.hint,
                start: selected[`${prefix}_Start`] || '',
                end: selected[`${prefix}_End`] || '',
                total: selected[`${prefix}_Total`],
            };
        });
    }, [selected]);

    const mwlTotalTimeHours = mwlTimeDetails.reduce((sum, row) => {
        const value = parseFloat(row.total);
        if (Number.isNaN(value)) return sum;
        return sum + value;
    }, 0);

    const hasMwlTimeSegments = mwlTimeDetails.some((row) => (
        Boolean(row.start || row.end || (row.total !== null && row.total !== undefined && row.total !== ''))
    ));

    const handleUnauthorized = (message = 'เซสชั่นหมดอายุ กรุณาเข้าสู่ระบบใหม่') => {
        setError(message);
        if (unauthorizedTimerRef.current === null) {
            unauthorizedTimerRef.current = window.setTimeout(() => {
                unauthorizedTimerRef.current = null;
                navigate('/login');
            }, 1500);
        }
    };

    const buildQueryString = (params) => {
        const searchParams = new URLSearchParams();
        searchParams.set('limit', params.limit);
        if (params.from) searchParams.set('from', params.from);
        if (params.to) searchParams.set('to', params.to);
        if (params.search) searchParams.set('search', params.search);
        if (params.fuelType && params.fuelType !== 'ทั้งหมด') searchParams.set('fuelType', params.fuelType);
        return searchParams.toString();
    };
    const fetchData = async (params) => {
        setLoading(true);
        setError('');
        try {
            const qs = buildQueryString(params);
            const data = await apiGet(`/api/oillogs.php?${qs}`);
            setItems(data.items || []);
            setSummary(data.summary || { count: 0, total_liters: 0 });
            setSelected((prev) => {
                if (!prev) {
                    return null;
                }
                const nextMatch = (data.items || []).find((row) => row.OilLog_Id === prev.OilLog_Id);
                return nextMatch || null;
            });
        } catch (err) {
            if (err?.status === 401) {
                handleUnauthorized();
            } else {
                setError(err.message || 'ไม่สามารถโหลดข้อมูลได้');
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchLatest = async () => {
        setLatestLoading(true);
        setLatestError('');
        try {
            const data = await apiGet('/api/oillogs.php?limit=5');
            setLatestItems(data.items || []);
        } catch (err) {
            if (err?.status === 401) {
                handleUnauthorized();
            } else {
                setLatestError(err.message || 'โหลดข้อมูลล่าสุดไม่สำเร็จ');
            }
        } finally {
            setLatestLoading(false);
        }
    };

    useEffect(() => {
        fetchData(query);
    }, [query]);

    useEffect(() => {
        fetchLatest();
        return () => {
            if (unauthorizedTimerRef.current !== null) {
                window.clearTimeout(unauthorizedTimerRef.current);
                unauthorizedTimerRef.current = null;
            }
        };
    }, []);

    const applyFilters = (event) => {
        event?.preventDefault();
        setQuery({ ...filters });
    };

    const exportCsv = () => {
        if (!items.length) return;
        const headers = ['Document Date', 'Document No', 'Machine', 'Project', 'Fuel Type', 'Liters', 'Operator', 'Assistant', 'Recorder', 'Ticket', 'Created', 'Fuel Meter Start', 'Fuel Meter End', 'Fuel Meter Total', 'Morning Hours', 'Afternoon Hours', 'OT Hours'];
        const rows = items.map((row) => {
            const assistantDisplay = row.Assistant_Name || row.Approval_Inspector_Name || row.Requester_Name || '';
            const recorderDisplay = row.Recorder_Name || row.Approval_Oiler_Name || '';
            return [
                row.Document_Date || '',
                row.Document_No || row.OilLog_Id,
                row.Machine_Code || '',
                row.Project_Name || '',
                row.Fuel_Type || '',
                row.Fuel_Amount_Liters || '',
                row.Operator_Name || row.Requester_Name || '',
                assistantDisplay,
                recorderDisplay,
                row.Fuel_Ticket_No || '',
                row.Created_At || '',
                row.Work_Meter_Start || '',
                row.Work_Meter_End || '',
                row.Work_Meter_Total || '',
                row.Time_Morning_Total || '',
                row.Time_Afternoon_Total || '',
                row.Time_Ot_Total || '',
            ];
        });
        const csv = [headers, ...rows]
            .map((cols) => cols.map((col) => `"${String(col).replace(/"/g, '""')}"`).join(','))
            .join('\n');
        const bom = '\uFEFF';
        const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `oil-logs-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    const handleFilterChange = (field) => (event) => {
        const value = event.target.value;
        setFilters((prev) => ({ ...prev, [field]: value }));
    };

    const detailPairs = useMemo(() => {
        if (!selected) return [];
        return [
            { label: 'วันที่', value: formatDateDMY(selected.Document_Date) },
            { label: 'รหัสเครื่อง', value: selected.Machine_Code || '-' },
            { label: 'รายละเอียดเครื่องยนต์', value: selected.Machine_Description || selected.Machine_Name || '-' },
            { label: 'โครงการ/หน่วยงาน', value: selected.Project_Name || selected.MWL_Project_Name || '-' },
            { label: 'ปั้มน้ำมันในบริษัท/นอกบริษัท', value: selected.Location_Name || '-' },
            { label: 'ก่อนเติม → หลังเติม', value: `${numberFormat(selected.Tank_Before_Liters)} → ${numberFormat(selected.Tank_After_Liters)} ลิตร` },
            { label: 'บันทึกโดย', value: selected.Recorder_Name || selected.Created_By || '-' },
        ];
    }, [selected]);
    const checklistDetails = useMemo(() => {
        const raw = (selected && selected.Checklist) || {};
        const otherNote = raw[checklistOtherNoteKey] || '';
        return oilChecklistItems.map((item) => ({
            id: item.id,
            label: item.label,
            status: raw[item.id] || '',
            note: item.allowNote ? otherNote : '',
            isOther: item.id === oilChecklistOtherId,
        }));
    }, [selected]);

    const photoAttachments = useMemo(() => {
        if (!selected || !Array.isArray(selected.Photo_Attachments)) {
            return [];
        }
        return selected.Photo_Attachments
            .map((photo, index) => {
                if (!photo) {
                    return null;
                }
                if (typeof photo === 'string') {
                    const urlFromString = absolutizeUrl(photo);
                    if (!urlFromString) {
                        return null;
                    }
                    return {
                        url: urlFromString,
                        name: `รูปที่ ${index + 1}`,
                    };
                }
                const rawUrl = photo.url || photo.path || photo.href || '';
                const url = absolutizeUrl(rawUrl);
                if (!url) {
                    return null;
                }
                return {
                    url,
                    name: photo.name || photo.label || photo.filename || `รูปที่ ${index + 1}`,
                };
            })
            .filter(Boolean);
    }, [selected]);

    const quickStats = useMemo(() => {
        if (!selected) {
            return [];
        }
        return [
            {
                label: 'ชนิดน้ำมัน',
                value: selected.Fuel_Type || 'ไม่ระบุ',
            },
            {
                label: 'ปริมาณที่ใช้',
                value: selected.Fuel_Amount_Liters ? `${numberFormat(selected.Fuel_Amount_Liters)} ลิตร` : '—',
            },
            {
                label: 'ผู้ปฏิบัติงาน',
                value: selected.Operator_Name || selected.Requester_Name || 'ไม่ระบุ',
            },
        ];
    }, [selected]);

    const fuelDetailEntries = useMemo(() => {
        if (!selected) {
            return [];
        }
        const details = Array.isArray(selected.Fuel_Details) ? selected.Fuel_Details : [];
        if (!details.length) {
            return [];
        }
        return details.map((detail, index) => ({
            key: detail.id || detail.label || `fuel-${index}`,
            label: detail.label || detail.id || 'น้ำมัน',
            code: detail.code || '',
            liters: detail.liters,
        }));
    }, [selected]);

    const operatorEntries = useMemo(() => {
        if (!selected) {
            return [];
        }
        const inspectorName = selected.MWL_Inspector_Name || selected.Approval_Inspector_Name || selected.Assistant_Name || '';
        const oilerName = selected.Approval_Oiler_Name || selected.Recorder_Name || selected.Requester_Name || '';
        const createdTime = describePersonTimestamp(selected.Created_At, 'บันทึกเมื่อ');
        const inspectorApprovedTime = describePersonTimestamp(
            selected.Approval_Inspector_Approved_At || selected.MWL_Inspector_Approved_At,
            'ยืนยันเมื่อ'
        );
        const oilerApprovedTime = describePersonTimestamp(selected.Approval_Oiler_Approved_At, 'ยืนยันเมื่อ');
        return [
            {
                label: 'พนักงานขับรถ',
                value: selected.Operator_Name || 'ไม่ระบุ',
                timeText: createdTime,
            },
            {
                label: 'ผู้ตรวจสอบ',
                value: inspectorName || 'ไม่ระบุ',
                timeText: inspectorApprovedTime,
            },
            {
                label: 'พนักงานออยเลอร์',
                value: oilerName || 'ไม่ระบุ',
                timeText: oilerApprovedTime,
            },
        ];
    }, [selected]);

    return (
        <div className="portal">
            <div className="page-banner-wrapper">
                <section className="page-banner page-banner--admin admin-oil-hero">
                    <div className="page-banner__content">
                        <p className="admin-eyebrow page-banner__eyebrow">ศูนย์ข้อมูลน้ำมัน</p>
                        <h1 className="page-banner__title">บันทึกน้ำมัน (ADMIN)</h1>
                        <p className="page-banner__subtitle">ตรวจสอบรายการน้ำมันและสรุปปริมาณ</p>
                    </div>
                    <div className="page-banner__actions admin-hero-actions">
                        <button type="button" className="button ghost" onClick={() => navigate('/admin')}>
                            ย้อนกลับ
                        </button>
                    </div>
                </section>
            </div>
            <section className="admin-oil-page">

                <form className="oil-filter" onSubmit={applyFilters}>
                    <label>
                        จากวันที่
                        <input type="date" value={filters.from} onChange={handleFilterChange('from')} />
                    </label>
                    <label>
                        ถึงวันที่
                        <input type="date" value={filters.to} onChange={handleFilterChange('to')} />
                    </label>
                    <label>
                        คำค้นหา
                        <input type="text" value={filters.search} onChange={handleFilterChange('search')} placeholder="เครื่อง, โครงการ, ใบจ่าย, ผู้ปฏิบัติงาน" />
                    </label>
                    <label>
                        จำนวนที่แสดง
                        <select value={filters.limit} onChange={handleFilterChange('limit')}>
                            {limits.map((limit) => (
                                <option key={limit} value={limit}>{limit} รายการ</option>
                            ))}
                        </select>
                    </label>
                    <div className="filter-actions">
                        <button type="submit" className="button primary">ค้นหา</button>
                        <button type="button" className="button" onClick={exportCsv} disabled={!items.length}>Export CSV</button>
                    </div>
                </form>

                {error && <div className="error-row">{error}</div>}

                <div className="summary-grid">
                    <div className="summary-card">
                        <h3>จำนวนรายการ</h3>
                        <strong>{summary.count || 0} รายการ</strong>
                        <span>ตามตัวกรองล่าสุด</span>
                    </div>
                    <div className="summary-card">
                        <h3>รวมปริมาณ</h3>
                        <strong>{numberFormat(summary.total_liters || 0)} ลิตร</strong>
                        <span>เฉพาะข้อมูลที่แสดง</span>
                    </div>
                </div>

                <div className="admin-oil-layout">
                    <div className="table-card">
                        <div className="table-head">
                            <h3>รายการบันทึก ({items.length})</h3>
                            {loading && <span className="text-muted">กำลังโหลด…</span>}
                        </div>
                        <div className="table-scroll">
                            <table className="oil-table">
                                <thead>
                                    <tr>
                                        <th>วันที่</th>
                                        <th>เลขที่</th>
                                        <th>เครื่องจักร</th>
                                        <th>โครงการ</th>
                                        <th>ผู้ปฏิบัติงาน</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {!items.length && !loading && (
                                        <tr>
                                            <td colSpan="8" className="empty-row">ไม่พบข้อมูลตรงตามตัวกรอง</td>
                                        </tr>
                                    )}
                                    {items.map((row) => (
                                        <tr
                                            key={row.OilLog_Id}
                                            className={selected && selected.OilLog_Id === row.OilLog_Id ? 'is-selected' : ''}
                                            onClick={() => setSelected(row)}
                                        >
                                            <td>{formatDateDMY(row.Document_Date)}</td>
                                            <td>{row.Document_No || row.OilLog_Id}</td>
                                            <td>
                                                <strong>{row.Machine_Code || '-'}</strong>
                                                <span className="muted">{row.Machine_Name || ''}</span>
                                            </td>
                                            <td>{row.Project_Name || '-'}</td>
                                            <td>{row.Operator_Name || row.Requester_Name || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </section>
            {selected && (
                <div className="oil-detail-overlay" role="dialog" aria-modal="true" onClick={() => setSelected(null)}>
                    <div className="oil-detail-panel" onClick={(event) => event.stopPropagation()}>
                        <button type="button" className="detail-close" aria-label="ปิดรายละเอียด" onClick={() => setSelected(null)}>
                            ×
                        </button>
                        <div className="detail-panel-header">
                            <div>
                                <span className="detail-panel-subtitle">{formatDateDMY(selected.Document_Date)} · #{selected.OilLog_Id}</span>
                                <h2>{selected.Machine_Code || 'ไม่ระบุเครื่อง'}</h2>
                                <p className="detail-panel-description">{selected.Machine_Description || selected.Machine_Name || selected.Operation_Details || 'ไม่มีรายละเอียดเครื่อง'}</p>
                            </div>
                            <div className="detail-panel-actions">
                                <span className="detail-status-chip">{selected.Fuel_Type || 'ไม่ระบุชนิดน้ำมัน'}</span>
                                <button type="button" className="button secondary" onClick={() => setSelected(null)}>
                                    ปิดหน้าต่าง
                                </button>
                            </div>
                        </div>
                        <div className="detail-panel-meta">
                            <span>บันทึกเมื่อ {formatThaiDateTime(selected.Created_At)}</span>
                            {selected.CenterName && <span>ศูนย์ {selected.CenterName}</span>}
                        </div>
                        <div className="detail-panel-body">
                            {quickStats.length > 0 && (
                                <section className="detail-quick-grid">
                                    {quickStats.map((stat) => (
                                        <div className="detail-quick-card" key={stat.label}>
                                            <span>{stat.label}</span>
                                            <strong>{stat.value}</strong>
                                        </div>
                                    ))}
                                </section>
                            )}
                            <div className="detail-main-grid">
                                <section className="detail-card-block">
                                    <h3>ข้อมูลหลัก</h3>
                                    <dl className="detail-dl-grid">
                                        {detailPairs.map((pair) => (
                                            <div key={pair.label}>
                                                <dt>{pair.label}</dt>
                                                <dd>{pair.value || '-'}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                    {fuelDetailEntries.length > 0 && (
                                        <div className="detail-pill-list">
                                            {fuelDetailEntries.map((entry) => (
                                                <span className="detail-pill" key={entry.key}>
                                                    <strong>{entry.label}</strong>
                                                    {entry.code && <small>#{entry.code}</small>}
                                                    <em>{entry.liters ? `${numberFormat(entry.liters)} ลิตร` : ''}</em>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </section>
                                <section className="detail-card-block">
                                    <h3>รายละเอียดการทำงาน</h3>
                                    {selected.MWL_Id && (
                                        <div className="mwlog-summary">
                                            <div className="muted">เลขที่: {selected.MWL_Document_No || selected.MWL_Id}</div>
                                            <div className="muted">โครงการ/หน่วยงาน: {selected.MWL_Project_Name || selected.Project_Name || '—'}</div>
                                            <div className="mw-meters">
                                                <div>เลขชั่วโมง : {selected.MWL_Meter_Hour ? numberFormat(selected.MWL_Meter_Hour) : '—'}</div>
                                                <div>เลขไมล์ : {selected.MWL_Odometer ? numberFormat(selected.MWL_Odometer) : '—'}</div>
                                                {/* <div>มิเตอร์ก่อนเริ่มงาน/หลังเลิกงาน: {selected.MWL_Work_Meter_Start ? `${numberFormat(selected.MWL_Work_Meter_Start)} → ${numberFormat(selected.MWL_Work_Meter_End)} (${numberFormat(selected.MWL_Work_Meter_Total)})` : '—'}</div> */}
                                            </div>
                                            {selected.MWL_Operation_Details && (
                                                <div className="mw-operation">
                                                    <strong>รายละเอียดงาน</strong>
                                                    <p>{selected.MWL_Operation_Details}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div className="detail-wbs">
                                        <strong>WBS / รหัสงาน</strong>
                                        <span>
                                            {(Array.isArray(selected.MWL_Work_Orders) && selected.MWL_Work_Orders.length > 0) ? (
                                                <div className="wbs-list">
                                                    {selected.MWL_Work_Orders.map((entry, idx) => (
                                                        <div key={idx}>{entry}</div>
                                                    ))}
                                                </div>
                                            ) : (
                                                selected.Work_Order || '—'
                                            )}
                                        </span>
                                    </div>
                                    <h4>หมายเหตุ</h4>
                                    <p>{selected.Notes || '—'}</p>
                                </section>
                                {operatorEntries.length > 0 && (
                                    <section className="detail-card-block detail-card-block--people">
                                        <h3>ผู้ปฏิบัติงาน</h3>
                                        <ul className="detail-person-list">
                                            {operatorEntries.map((entry) => (
                                                <li key={entry.label}>
                                                    <span>{entry.label}</span>
                                                    <div className="detail-person-value">
                                                        <strong>{entry.value}</strong>
                                                        {entry.timeText && (
                                                            <small className="muted small-text">{entry.timeText}</small>
                                                        )}
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    </section>
                                )}
                                <section className="detail-card-block detail-card-block--meter">
                                    <h3>มิเตอร์ก่อนเริ่มงาน/หลังเลิกงาน</h3>
                                    {selected.MWL_Id && (
                                        <div className="detail-meter-group">
                                            <div className="detail-meter-row">
                                                <span>ก่อนเริ่ม</span>
                                                <strong>{numberFormat(selected.MWL_Work_Meter_Start)}</strong>
                                            </div>
                                            <div className="detail-meter-row">
                                                <span>เลิกงาน</span>
                                                <strong>{numberFormat(selected.MWL_Work_Meter_End)}</strong>
                                            </div>
                                            <div className="detail-meter-row detail-meter-row--total">
                                                <span>รวม</span>
                                                <strong>{numberFormat(selected.MWL_Work_Meter_Total)}</strong>
                                            </div>
                                        </div>
                                    )}
                                </section>
                                <section className="detail-card-block detail-card-block--time">
                                    <h3>เวลาปฏิบัติงาน</h3>
                                    {selected.MWL_Id && hasMwlTimeSegments && (
                                        <div className="time-group">
                                            <div className="time-grid time-grid--static">
                                                <div className="time-row time-row--header">
                                                    <span>ช่วง</span>
                                                    <span>เริ่ม</span>
                                                    <span>เลิก</span>
                                                </div>
                                                {mwlTimeDetails.map((row) => (
                                                    <div className="time-row" key={`mwl-${row.key}`}>
                                                        <div>
                                                            <strong>{row.label}</strong>
                                                            <p className="muted">{row.hint}</p>
                                                        </div>
                                                        <span>{formatTimeValue(row.start)}</span>
                                                        <span>{formatTimeValue(row.end)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="time-total-pill time-total-pill--static">
                                                <span>รวมเวลาทั้งหมด</span>
                                                <strong>{formatHourValue(mwlTotalTimeHours)} ชม.</strong>
                                            </div>
                                        </div>
                                    )}
                                    {!hasOilTimeSegments && (!selected.MWL_Id || !hasMwlTimeSegments) && (
                                        <p className="muted">ไม่มีข้อมูลเวลาปฏิบัติงาน</p>
                                    )}
                                </section>
                                <section className="detail-card-block">
                                    <h3>รายการตรวจเช็ค</h3>
                                    <div className="checklist-grid checklist-grid--static">
                                        {checklistDetails.map((item) => {
                                            let pillClass = 'status-pill status-pill--empty';
                                            let pillLabel = 'ไม่ระบุ';
                                            if (item.isOther) {
                                                if (item.status === 'เลือก') {
                                                    pillClass = 'status-pill status-pill--note';
                                                    pillLabel = 'เลือกแล้ว';
                                                } else if (item.status === 'ปกติ' || item.status === 'ผิดปกติ') {
                                                    pillClass = `status-pill ${item.status === 'ปกติ' ? 'status-pill--ok' : 'status-pill--bad'}`;
                                                    pillLabel = item.status;
                                                }
                                            } else if (item.status === 'ปกติ') {
                                                pillClass = 'status-pill status-pill--ok';
                                                pillLabel = 'ปกติ';
                                            } else if (item.status === 'ผิดปกติ') {
                                                pillClass = 'status-pill status-pill--bad';
                                                pillLabel = 'ผิดปกติ';
                                            }
                                            return (
                                                <div className="checklist-card" key={item.id}>
                                                    <h4>{item.label}</h4>
                                                    <div className="status-display">
                                                        <span className={pillClass}>{pillLabel}</span>
                                                    </div>
                                                    {item.note && (
                                                        <p className="checklist-note-value">{item.note}</p>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                                {photoAttachments.length > 0 && (
                                    <section className="detail-card-block">
                                        <h3>รูปภาพประกอบ ({photoAttachments.length})</h3>
                                        <div className="detail-photo-grid">
                                            {photoAttachments.map((photo) => (
                                                <a
                                                    key={photo.url}
                                                    href={photo.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="detail-photo-item"
                                                >
                                                    <img src={photo.url} alt={photo.name} loading="lazy" />
                                                    <span className="muted small-text">{photo.name}</span>
                                                </a>
                                            ))}
                                        </div>
                                    </section>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
