import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPatch } from '../../api.js';

const STATUS_META = {
    new: { label: 'ใหม่', pill: 'status-pill--new' },
    in_progress: { label: 'กำลังดำเนินการ', pill: 'status-pill--progress' },
    'in-progress': { label: 'กำลังดำเนินการ', pill: 'status-pill--progress' },
    resolved: { label: 'เสร็จสิ้น', pill: 'status-pill--resolved' },
    closed: { label: 'เสร็จสิ้น', pill: 'status-pill--resolved' },
};

const dateFormatter = new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
});

const statusOptions = [
    { value: 'all', label: 'ทุกสถานะ' },
    { value: 'new', label: 'ใหม่' },
    { value: 'in_progress', label: 'กำลังดำเนินการ' },
    { value: 'resolved', label: 'เสร็จสิ้น' },
];

const statusUpdateOptions = statusOptions.filter((option) => option.value !== 'all');
const STATUS_FLOW = ['new', 'in_progress', 'resolved'];

const limitOptions = [50, 100, 200, 500];

const getBrowserOrigin = () => (typeof window !== 'undefined' && window.location ? window.location.origin : '');

const API_BASE = (() => {
    const envBase = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE)
        ? import.meta.env.VITE_API_BASE
        : '';
    if (envBase) return envBase.replace(/\/+/g, '/').replace(/\/+$/, '');
    const origin = getBrowserOrigin();
    if (origin && /localhost|127\.0\.0\.1/i.test(origin)) {
        return 'http://localhost:8080';
    }
    return origin ? origin.replace(/\/+$/, '') : '';
})();

const absolutizeUrl = (url) => {
    if (!url) return url;
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

const normalizeReportPhotos = (report) => {
    if (!report) return report;
    if (Array.isArray(report.photos)) {
        report.photos = report.photos
            .map((photo) => {
                if (!photo || !photo.url) return null;
                return {
                    ...photo,
                    url: absolutizeUrl(photo.url),
                };
            })
            .filter(Boolean);
    }
    return report;
};

const formatDateTime = (input) => {
    if (!input) return '-';
    try {
        return dateFormatter.format(new Date(input));
    } catch (_) {
        return input;
    }
};

const normalizeStatus = (value) => {
    if (!value) return '';
    const lower = String(value).toLowerCase();
    if (lower === 'in-progress') return 'in_progress';
    if (lower === 'done' || lower === 'complete' || lower === 'closed') return 'resolved';
    return lower;
};

const getReporterDisplayName = (report) => {
    if (!report) return '';
    const candidates = [
        report.Reporter_FirstName ?? report.Name ?? report.first_name ?? report.Name,
        report.Reporter_LastName ?? report.LastName ?? report.LastName ?? report.LastName ?? report.LastName,
    ];
    const names = candidates
        .map((value) => {
            if (value === undefined || value === null) {
                return '';
            }
            return String(value).trim();
        })
        .filter(Boolean);
    if (names.length > 0) {
        return names.join(' ');
    }
    if (report.CenterName) {
        return String(report.CenterName).trim();
    }
    if (report.Center_Id) {
        return `ศูนย์ ${report.Center_Id}`;
    }
    return '';
};

export default function ReportsAdmin() {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [statusFilter, setStatusFilter] = useState('all');
    const [centerFilter, setCenterFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [limit, setLimit] = useState(100);
    const [reloadKey, setReloadKey] = useState(0);
    const [activeReportId, setActiveReportId] = useState(null);
    const [activeReport, setActiveReport] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState(null);
    const [statusDraft, setStatusDraft] = useState('new');
    const [remarkDraft, setRemarkDraft] = useState('');
    const [statusSaving, setStatusSaving] = useState(false);
    const [statusFeedback, setStatusFeedback] = useState('');
    const [statusFeedbackError, setStatusFeedbackError] = useState(false);
    const navigate = useNavigate();

    const availableStatusOptions = useMemo(() => {
        if (!activeReport) {
            return statusUpdateOptions;
        }
        const normalized = normalizeStatus(activeReport.Status);
        const currentIndex = STATUS_FLOW.indexOf(normalized);
        if (currentIndex === -1) {
            return statusUpdateOptions;
        }
        return statusUpdateOptions.filter((option) => STATUS_FLOW.indexOf(option.value) > currentIndex);
    }, [activeReport]);

    const hasAvailableStatus = availableStatusOptions.length > 0;

    useEffect(() => {
        let cancelled = false;
        async function fetchReports() {
            setLoading(true);
            try {
                const data = await apiGet(`/api/admin/reports.php?limit=${limit}`);
                if (!cancelled) {
                    const normalized = (data.items || []).map((item) => normalizeReportPhotos({ ...item }));
                    setReports(normalized);
                    setError(null);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err.message || 'โหลดรายการไม่สำเร็จ');
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }
        fetchReports();
        return () => {
            cancelled = true;
        };
    }, [limit, reloadKey]);

    const centerOptions = useMemo(() => {
        const options = new Map();
        reports.forEach((report) => {
            const id = report.Center_Id || 'unknown';
            const key = String(id);
            const label = report.CenterName || (report.Center_Id ? `ศูนย์ ${report.Center_Id}` : 'ไม่ระบุศูนย์');
            if (!options.has(key)) {
                options.set(key, label);
            }
        });
        return Array.from(options.entries()).map(([value, label]) => ({ value, label }));
    }, [reports]);

    const filteredReports = useMemo(() => {
        const search = searchTerm.trim().toLowerCase();
        return reports.filter((report) => {
            const normalizedStatus = normalizeStatus(report.Status);
            if (statusFilter !== 'all' && normalizedStatus !== statusFilter) {
                return false;
            }
            if (centerFilter !== 'all') {
                if (centerFilter === 'unknown') {
                    if (report.Center_Id) {
                        return false;
                    }
                } else if (String(report.Center_Id) !== String(centerFilter)) {
                    return false;
                }
            }
            if (search) {
                const haystack = [
                    report.Details,
                    report.Machine_Code,
                    report.Machine_Description,
                    report.Report_Id,
                ]
                    .filter(Boolean)
                    .map((value) => String(value).toLowerCase())
                    .join(' ');
                if (!haystack.includes(search)) {
                    return false;
                }
            }
            return true;
        });
    }, [reports, statusFilter, centerFilter, searchTerm]);

    const summary = useMemo(() => {
        const base = {
            total: reports.length,
            new: 0,
            in_progress: 0,
            resolved: 0,
        };
        reports.forEach((report) => {
            const normalizedStatus = normalizeStatus(report.Status);
            if (normalizedStatus === 'new') base.new += 1;
            else if (normalizedStatus === 'in_progress') base.in_progress += 1;
            else if (normalizedStatus === 'resolved' || normalizedStatus === 'closed') base.resolved += 1;
        });
        return base;
    }, [reports]);

    const handleRefresh = () => {
        setReloadKey((key) => key + 1);
    };

    const handleReportOpen = (reportId) => {
        if (!reportId) return;
        setActiveReportId(reportId);
        setActiveReport(null);
        setDetailError(null);
    };

    const handleCardKey = (event, reportId) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleReportOpen(reportId);
        }
    };

    const closeDetail = () => {
        setActiveReportId(null);
        setActiveReport(null);
        setDetailError(null);
    };

    const handleNavigateMachine = (report) => {
        if (!report) return;
        const rawTarget = report.Machine_Id ?? report.Machine_Code;
        if (rawTarget === undefined || rawTarget === null || rawTarget === '') return;
        const machineTarget = String(rawTarget);
        const params = new URLSearchParams();
        const category = report.Machine_Type || report.machine_type;
        if (category) {
            params.set('category', category);
        }
        const machineClass = report.Machine_Class || report.Class;
        if (machineClass) {
            params.set('class', machineClass);
        }
        params.set('admin', '1');
        const query = params.toString();
        closeDetail();
        navigate(`/machines/${encodeURIComponent(machineTarget)}${query ? `?${query}` : ''}`);
    };

    const handleStatusSubmit = async (event) => {
        event.preventDefault();
        if (!activeReport) {
            return;
        }
        if (!statusDraft) {
            setStatusFeedback('ไม่มีสถานะถัดไปให้เลือก');
            setStatusFeedbackError(true);
            return;
        }
        setStatusSaving(true);
        setStatusFeedback('');
        setStatusFeedbackError(false);
        try {
            const payload = {
                id: activeReport.Report_Id,
                status: statusDraft,
                admin_note: remarkDraft,
            };
            const response = await apiPatch('/api/admin/reports.php', payload);
            const updated = normalizeReportPhotos(response.item || null);
            if (updated) {
                setActiveReport(updated);
                setReports((prev) => prev.map((report) => (
                    report.Report_Id === updated.Report_Id ? { ...report, ...updated } : report
                )));
            }
            setStatusFeedback('บันทึกการอัปเดตเรียบร้อย');
            setStatusFeedbackError(false);
            setReloadKey((key) => key + 1);
        } catch (err) {
            setStatusFeedback(err.message || 'ไม่สามารถอัปเดตสถานะได้');
            setStatusFeedbackError(true);
        } finally {
            setStatusSaving(false);
        }
    };

    useEffect(() => {
        if (!activeReportId) {
            return undefined;
        }
        let cancelled = false;
        (async () => {
            setDetailLoading(true);
            try {
                const data = await apiGet(`/api/admin/reports.php?id=${activeReportId}`);
                if (!cancelled) {
                    setActiveReport(normalizeReportPhotos(data.item || null));
                    setDetailError(null);
                }
            } catch (err) {
                if (!cancelled) {
                    setDetailError(err.message || 'โหลดรายละเอียดไม่สำเร็จ');
                }
            } finally {
                if (!cancelled) {
                    setDetailLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [activeReportId]);

    useEffect(() => {
        if (!activeReport) {
            setStatusDraft('');
            setRemarkDraft('');
            setStatusFeedback('');
            setStatusFeedbackError(false);
            return;
        }
        setStatusDraft(availableStatusOptions[0]?.value || '');
        setRemarkDraft(activeReport.Admin_Remark || '');
        setStatusFeedback('');
        setStatusFeedbackError(false);
    }, [activeReport, availableStatusOptions]);

    return (
        <div className="portal">
            <div className="page-banner-wrapper">
                <section className="page-banner page-banner--admin admin-reports-hero">
                    <div className="page-banner__content">
                        <p className="admin-eyebrow page-banner__eyebrow">ศูนย์รายงานเหตุขัดข้อง</p>
                        <h1 className="page-banner__title">รายงานปัญหา (Admin)</h1>
                        <p className="page-banner__subtitle">ติดตามสถานะการแจ้งซ่อมแบบเรียลไทม์และอัปเดตกลับไปยังศูนย์</p>
                    </div>
                    <div className="page-banner__actions admin-hero-actions">
                        <button type="button" className="button ghost" onClick={() => navigate('/admin')}>
                            ย้อนกลับ
                        </button>
                            <span>แสดง</span>
                            <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
                                {limitOptions.map((value) => (
                                    <option key={value} value={value}>
                                        {value}
                                    </option>
                                ))}
                            </select>
                        <button type="button" className="button ghost" onClick={handleRefresh} disabled={loading}>
                            {loading ? 'กำลังโหลด...' : 'รีเฟรช'}
                        </button>
                    </div>
                </section>
            </div>
            <section>

                <div className="admin-report-toolbar">
                    <label>
                        ค้นหา
                        <input
                            type="search"
                            placeholder="พิมพ์รหัสเครื่อง / รายละเอียด"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                        />
                    </label>
                    <label>
                        สถานะ
                        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                            {statusOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                <div className="summary-grid admin-report-summary">
                    <div className="summary-card">
                        <strong>{summary.total}</strong>
                        <span>ทั้งหมด</span>
                    </div>
                    <div className="summary-card">
                        <strong>{summary.new}</strong>
                        <span>ใหม่</span>
                    </div>
                    <div className="summary-card">
                        <strong>{summary.in_progress}</strong>
                        <span>กำลังดำเนินการ</span>
                    </div>
                    <div className="summary-card">
                        <strong>{summary.resolved}</strong>
                        <span>เสร็จสิ้น</span>
                    </div>
                </div>

                {error && <div className="error-row">{error}</div>}
                {!loading && filteredReports.length === 0 && !error && <div className="muted">ไม่พบรายการ</div>}

                {loading && <div className="loading-row">กำลังโหลดข้อมูล...</div>}

                <div className="admin-report-grid">
                    {filteredReports.map((report) => {
                        const normalizedStatus = normalizeStatus(report.Status);
                        const statusMeta = STATUS_META[normalizedStatus] || { label: report.Status || 'ไม่ทราบ', pill: 'status-pill--default' };
                        const reporterName = getReporterDisplayName(report);
                        return (
                            <article
                                key={report.Report_Id}
                                className="admin-report-card"
                                role="button"
                                tabIndex={0}
                                onClick={() => handleReportOpen(report.Report_Id)}
                                onKeyDown={(event) => handleCardKey(event, report.Report_Id)}
                            >
                                <header>
                                    <div className={`status-pill ${statusMeta.pill}`}>{statusMeta.label}</div>
                                    <span className="report-id">#{report.Report_Id}</span>
                                    <span className="muted">{formatDateTime(report.RPCreated_at)}</span>
                                </header>
                                <div className="report-metadata">
                                    <div>
                                        <strong>เครื่องจักร:</strong>{' '}
                                        {report.Machine_Code || `ID ${report.Machine_Id || 'ไม่ระบุ'}`}
                                        {report.Machine_Description ? ` · ${report.Machine_Description}` : ''}
                                    </div>
                                    <div>
                                        <strong>ผู้แจ้ง:</strong>{' '}
                                        {reporterName || 'ไม่ระบุ'}
                                    </div>
                                </div>
                                <p className="report-details">{report.Details || 'ไม่มีรายละเอียด'}</p>
                                {report.photos && report.photos.length > 0 && (
                                    <div>
                                        <div className="muted">รูปแนบ {report.photos.length} รูป</div>
                                        <div className="admin-report-photos">
                                            {report.photos.map((photo) => (
                                                <a
                                                    key={`${report.Report_Id}-${photo.name}`}
                                                    href={photo.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="admin-report-photo"
                                                    onClick={(event) => event.stopPropagation()}
                                                >
                                                    <img src={photo.url} alt={photo.name} loading="lazy" />
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div className="report-card-actions">คลิกเพื่อดูรายละเอียด</div>
                            </article>
                        );
                    })}
                </div>
            </section>
            {activeReportId && (
                <div className="admin-report-detail-overlay" role="dialog" aria-modal="true" onClick={closeDetail}>
                    <div className="admin-report-detail-panel" onClick={(event) => event.stopPropagation()}>
                        <button type="button" className="detail-close" onClick={closeDetail} aria-label="ปิดหน้าต่าง">
                            ×
                        </button>
                        {detailLoading && <div className="loading-row">กำลังโหลดรายละเอียด...</div>}
                        {!detailLoading && detailError && <div className="error-row">{detailError}</div>}
                        {!detailLoading && !detailError && activeReport && (
                            <div className="report-detail-body">
                                <header className="detail-header">
                                    <div>
                                        <div className={`status-pill ${(STATUS_META[normalizeStatus(activeReport.Status)] || { pill: 'status-pill--default' }).pill
                                            }`}>
                                            {(STATUS_META[normalizeStatus(activeReport.Status)] || { label: activeReport.Status || 'ไม่ทราบ' }).label}
                                        </div>
                                        <h3>รายงาน #{activeReport.Report_Id}</h3>
                                        <p className="muted">แจ้งเมื่อ {formatDateTime(activeReport.RPCreated_at)}</p>
                                    </div>
                                    <div className="detail-stamp">
                                        <span>อัปเดตล่าสุด</span>
                                        <strong>{formatDateTime(activeReport.Updated_at)}</strong>
                                    </div>
                                </header>
                                <div className="detail-meta-grid">
                                    <div>
                                        <span className="label">เครื่องจักร</span>
                                        <strong>
                                            {activeReport.Machine_Code || `ID ${activeReport.Machine_Id || 'ไม่ระบุ'}`}
                                        </strong>
                                        {activeReport.Machine_Description && (
                                            <p className="muted">{activeReport.Machine_Description}</p>
                                        )}
                                    </div>
                                    <div>
                                        <span className="label">ผู้แจ้ง</span>
                                        <strong>{getReporterDisplayName(activeReport) || 'ไม่ระบุ'}</strong>
                                    </div>
                                    <div>
                                        <span className="label">สถานะ</span>
                                        <strong>{(STATUS_META[normalizeStatus(activeReport.Status)] || { label: activeReport.Status || 'ไม่ทราบ' }).label}</strong>
                                    </div>
                                    <div>
                                        <span className="label">เลขอ้างอิง</span>
                                        <strong>#{activeReport.Report_Id}</strong>
                                    </div>
                                </div>
                                <div className="detail-notes">
                                    <h4>รายละเอียด</h4>
                                    <p>{activeReport.Details || 'ไม่มีรายละเอียด'}</p>
                                </div>
                                {activeReport.photos && activeReport.photos.length > 0 && (
                                    <div className="detail-photos">
                                        <h4>รูปแนบ ({activeReport.photos.length})</h4>
                                        <div className="detail-photo-grid">
                                            {activeReport.photos.map((photo) => (
                                                <a
                                                    key={`${activeReport.Report_Id}-detail-${photo.name}`}
                                                    href={photo.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="admin-report-photo admin-report-photo--large"
                                                >
                                                    <img src={photo.url} alt={photo.name} loading="lazy" />
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div className="detail-admin-panel">
                                    <h4>จัดการสถานะ</h4>
                                    <form className="detail-admin-form" onSubmit={handleStatusSubmit}>
                                        <label>
                                            สถานะถัดไป
                                            <select
                                                value={statusDraft}
                                                onChange={(event) => setStatusDraft(event.target.value)}
                                                disabled={!hasAvailableStatus || statusSaving}
                                            >
                                                {availableStatusOptions.map((option) => (
                                                    <option key={option.value} value={option.value}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        <label>
                                            บันทึกการดำเนินงาน
                                            <textarea
                                                rows="3"
                                                value={remarkDraft}
                                                onChange={(event) => setRemarkDraft(event.target.value)}
                                                placeholder="สรุปการแก้ไขหรือแจ้งเตือนทีมที่เกี่ยวข้อง"
                                                disabled={!hasAvailableStatus}
                                            />
                                        </label>
                                        {!hasAvailableStatus && (
                                            <p className="muted">
                                                รายการนี้อยู่สถานะสุดท้ายแล้ว ไม่สามารถย้อนกลับหรือเลือกสถานะเดิมได้
                                            </p>
                                        )}
                                        {statusFeedback && (
                                            <p className={`status-feedback ${statusFeedbackError ? 'is-error' : 'is-success'}`}>
                                                {statusFeedback}
                                            </p>
                                        )}
                                        {hasAvailableStatus && (
                                            <div className="detail-admin-actions">
                                                <button
                                                    type="submit"
                                                    className="button primary"
                                                    disabled={statusSaving || !statusDraft}
                                                >
                                                    {statusSaving ? 'กำลังบันทึก…' : 'บันทึกการอัปเดต'}
                                                </button>
                                            </div>
                                        )}
                                    </form>
                                </div>
                                <div className="report-detail-actions">
                                    {(activeReport.Machine_Code || activeReport.Machine_Id) && (
                                        <button type="button" className="button" onClick={() => handleNavigateMachine(activeReport)}>
                                            เปิดหน้าเครื่องจักร
                                        </button>
                                    )}
                                    <button type="button" className="button secondary" onClick={closeDetail}>
                                        ปิดหน้าต่าง
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
