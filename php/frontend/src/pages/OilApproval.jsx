import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

const OILER_ROLE_KEYS = ['oiler', 'oil', 'fuel', 'fueler', 'pump', 'recorder'];
const INSPECTOR_ROLE_KEYS = ['inspector', 'assistant'];

const userHasAnyRole = (user, roles) => {
    if (!user || !Array.isArray(roles) || roles.length === 0) {
        return false;
    }
    const source = Array.isArray(user.roles) && user.roles.length ? user.roles : (user.role ? [user.role] : []);
    return source.some((role) => roles.includes(role));
};

const formatDate = (value) => {
    if (!value) return '-';
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return value;
    return new Date(parsed).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short', hour12: false });
};

const formatLiters = (value) => {
    if (value === null || value === undefined) return '-';
    const num = Number(value);
    return Number.isFinite(num) ? `${num.toFixed(2)} ลิตร` : `${value} ลิตร`;
};

const formatName = (value) => {
    if (!value) {
        return 'ยังไม่ยืนยัน';
    }
    return value;
};

const approvalStyles = {
    page: {
        padding: '32px 24px',
        maxWidth: '1000px',
        margin: '0 auto',
    },
    hero: {
        display: 'flex',
        justifyContent: 'space-between',
        gap: '16px',
        alignItems: 'flex-start',
        marginBottom: '24px',
    },
    ghostLink: {
        color: '#0b6efd',
        textDecoration: 'none',
        fontWeight: 600,
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '20px',
    },
    card: {
        background: '#fff',
        borderRadius: '20px',
        padding: '24px',
        boxShadow: '0 25px 60px rgba(15,24,56,0.08)',
    },
    errorCard: {
        background: '#fff5f5',
        border: '1px solid #f3c2c2',
        color: '#8c2f39',
    },
    statusList: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        marginBottom: '16px',
    },
    chip: {
        borderRadius: '14px',
        border: '1px solid #d0d7de',
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
    },
    chipOk: {
        borderColor: '#198754',
        background: '#e8f5ec',
        color: '#0f5132',
    },
    remarkArea: {
        marginTop: '12px',
    },
    textarea: {
        width: '100%',
        minHeight: '96px',
        borderRadius: '12px',
        border: '1px solid #d0d7de',
        padding: '12px',
        resize: 'vertical',
    },
    actions: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        marginTop: '16px',
    },
    banner: {
        marginBottom: '16px',
        padding: '12px 16px',
        borderRadius: '14px',
        background: '#e7f6ef',
        color: '#0f5132',
        border: '1px solid #badfcc',
    },
    statusBoard: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '16px',
        marginBottom: '24px',
    },
    statusTile: {
        borderRadius: '18px',
        border: '1px solid #e1e6ef',
        padding: '16px 18px',
        background: '#f9fbff',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
    },
    statusTileDone: {
        borderColor: '#badfcc',
        background: '#f0f9f3',
    },
    statusBadge: {
        alignSelf: 'flex-start',
        padding: '4px 10px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 600,
    },
    badgeWaiting: {
        background: '#fff8e5',
        color: '#a06a00',
    },
    badgeDone: {
        background: '#e1fbef',
        color: '#0f5132',
    },
};

const ApprovalStatusChip = ({ label, approvedAt }) => {
    const isDone = Boolean(approvedAt);
    return (
        <span style={{
            ...approvalStyles.chip,
            ...(isDone ? approvalStyles.chipOk : {}),
        }}>
            {label}
            {isDone && <small>ยืนยันแล้ว {formatDate(approvedAt)}</small>}
            {!isDone && <small>รอการยืนยัน</small>}
        </span>
    );
};

export default function OilApproval() {
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
    const oilLogId = useMemo(() => {
        const raw = params.get('oilLogId');
        return raw ? Number(raw) : null;
    }, [params]);
    const token = useMemo(() => (params.get('token') || '').trim(), [params]);
    const [context, setContext] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [remark, setRemark] = useState('');
    const [submittingRole, setSubmittingRole] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const canApproveOiler = userHasAnyRole(user, OILER_ROLE_KEYS);
    const canApproveInspector = userHasAnyRole(user, INSPECTOR_ROLE_KEYS);

    const fetchContext = async () => {
        if (!oilLogId || !token) {
            setError('ลิงก์ไม่ถูกต้อง');
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const data = await apiGet(`/api/oillog_approvals.php?oilLogId=${oilLogId}&token=${encodeURIComponent(token)}`);
            setContext(data);
        } catch (err) {
            setError(err.message || 'โหลดข้อมูลไม่สำเร็จ');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchContext();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [oilLogId, token]);

    const handleConfirm = async (approvalType) => {
        if (!context || !oilLogId || !token) {
            return;
        }
        setSubmittingRole(approvalType);
        setSuccessMessage('');
        setError('');
        try {
            const payload = {
                action: 'confirm',
                oilLogId,
                token,
                approvalType,
                remark,
            };
            const data = await apiPost('/api/oillog_approvals.php', payload);
            setContext(data);
            setRemark('');
            setSuccessMessage('บันทึกการยืนยันเรียบร้อย');
            window.setTimeout(() => setSuccessMessage(''), 3000);
            navigate('/worksite', { replace: true });
        } catch (err) {
            setError(err.message || 'ยืนยันไม่สำเร็จ');
        } finally {
            setSubmittingRole('');
        }
    };

    const approval = context?.approval;
    const oilLog = context?.oilLog;
    const oilerDone = Boolean(approval?.oiler?.approved_at);
    const inspectorDone = Boolean(approval?.inspector?.approved_at);
    const statusTiles = [
        {
            key: 'inspector',
            label: 'ผู้ตรวจสอบ',
            info: approval?.inspector,
            done: inspectorDone,
        },
        {
            key: 'oiler',
            label: 'พนักงานออยเลอร์',
            info: approval?.oiler,
            done: oilerDone,
        },
    ];

    return (
        <div style={approvalStyles.page}>
            <header style={approvalStyles.hero}>
                <div>
                    <p className="muted">ยืนยันใบรายงานน้ำมัน</p>
                    {oilLog ? (
                        <h1>{oilLog.document_no || `OIL-${oilLog.id}`}</h1>
                    ) : (
                        <h1>กำลังโหลด...</h1>
                    )}
                    {oilLog && (
                        <p className="muted">วันที่บันทึก {formatDate(oilLog.document_date)}</p>
                    )}
                </div>
                <Link style={approvalStyles.ghostLink} to="/worksite">กลับหน้าไซต์</Link>
            </header>

            {!oilLogId || !token ? (
                <div style={{ ...approvalStyles.card, ...approvalStyles.errorCard }}>ไม่พบพารามิเตอร์ที่จำเป็น</div>
            ) : loading ? (
                <div style={approvalStyles.card}>กำลังโหลดข้อมูล...</div>
            ) : error ? (
                <div style={{ ...approvalStyles.card, ...approvalStyles.errorCard }}>{error}</div>
            ) : (
                <>
                    {successMessage && <div style={approvalStyles.banner}>{successMessage}</div>}
                    <section style={approvalStyles.grid}>
                        <article style={approvalStyles.card}>
                            <h2>รายละเอียดใบงาน</h2>
                            <dl style={{ display: 'grid', gap: '12px' }}>
                                <div>
                                    <dt>โครงการ / สถานที่</dt>
                                    <dd>{oilLog.project_name || '-'} · {oilLog.location_name || '-'}</dd>
                                </div>
                                <div>
                                    <dt>เครื่องจักร</dt>
                                    <dd>{oilLog.machine_code || '-'} · {oilLog.machine_name || '-'}</dd>
                                </div>
                                <div>
                                    <dt>ประเภทน้ำมัน</dt>
                                    <dd>{oilLog.fuel_type || '-'} ({formatLiters(oilLog.fuel_amount_liters)})</dd>
                                </div>
                                <div>
                                    <dt>หมายเหตุ</dt>
                                    <dd>{oilLog.notes || '-'}</dd>
                                </div>
                            </dl>
                        </article>
                        <article style={approvalStyles.card}>
                            <h2>สถานะการยืนยัน</h2>
                            <div style={approvalStyles.statusList}>
                                <ApprovalStatusChip label="พนักงานออยเลอร์" approvedAt={approval?.oiler?.approved_at} />
                                <ApprovalStatusChip label="ผู้ตรวจสอบ" approvedAt={approval?.inspector?.approved_at} />
                            </div>
                            <div style={approvalStyles.remarkArea}>
                                <label>
                                    หมายเหตุ (ถ้ามี)
                                    <textarea
                                        value={remark}
                                        onChange={(event) => setRemark(event.target.value)}
                                        maxLength={500}
                                        placeholder="เช่น ระบุเวลาส่ง, สภาพเอกสาร"
                                        style={approvalStyles.textarea}
                                    />
                                </label>
                            </div>
                            <div style={approvalStyles.actions}>
                                {canApproveOiler && (
                                    <button
                                        type="button"
                                        className="button primary"
                                        disabled={oilerDone || submittingRole === 'inspector' || submittingRole === 'oiler'}
                                        onClick={() => handleConfirm('oiler')}
                                    >
                                        {oilerDone ? 'ยืนยันแล้ว' : (submittingRole === 'oiler' ? 'กำลังบันทึก...' : 'ยืนยัน (พนักงานออยเลอร์)')}
                                    </button>
                                )}
                                {canApproveInspector && (
                                    <button
                                        type="button"
                                        className="button secondary"
                                        disabled={inspectorDone || submittingRole === 'oiler' || submittingRole === 'inspector'}
                                        onClick={() => handleConfirm('inspector')}
                                    >
                                        {inspectorDone ? 'ยืนยันแล้ว' : (submittingRole === 'inspector' ? 'กำลังบันทึก...' : 'ยืนยัน (ผู้ตรวจสอบ)')}
                                    </button>
                                )}
                                {!canApproveOiler && !canApproveInspector && (
                                    <p className="muted small-text">บัญชีนี้ไม่มีสิทธิ์ยืนยันบทบาท</p>
                                )}
                            </div>
                        </article>
                    </section>
                </>
            )}
        </div>
    );
}
