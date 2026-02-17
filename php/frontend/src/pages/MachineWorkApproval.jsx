import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

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

const formatName = (value) => {
    if (!value) {
        return 'ยังไม่ยืนยัน';
    }
    return value;
};

const formatWorkOrders = (orders) => {
    if (Array.isArray(orders) && orders.length) {
        return orders.join(', ');
    }
    return '-';
};

const formatWorkMeter = (value) => {
    if (value === null || value === undefined || value === '') {
        return '-';
    }
    const num = Number(value);
    return Number.isFinite(num) ? `${num.toFixed(2)} หน่วย` : String(value);
};

const formatChecklistItems = (items) => {
    if (Array.isArray(items) && items.length) {
        return items.join(', ');
    }
    return '-';
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

export default function MachineWorkApproval() {
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
    const machineWorkLogId = useMemo(() => {
        const raw = params.get('machineWorkLogId');
        return raw ? Number(raw) : null;
    }, [params]);
    const token = useMemo(() => (params.get('token') || '').trim(), [params]);
    const [context, setContext] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [remark, setRemark] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    const canApproveInspector = userHasAnyRole(user, INSPECTOR_ROLE_KEYS);

    const fetchContext = async () => {
        if (!machineWorkLogId || !token) {
            setError('ลิงก์ไม่ถูกต้อง');
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const data = await apiGet(`/api/machine_work_log_approvals.php?machineWorkLogId=${machineWorkLogId}&token=${encodeURIComponent(token)}`);
            setContext(data);
        } catch (err) {
            setError(err.message || 'โหลดข้อมูลไม่สำเร็จ');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchContext();
    }, [machineWorkLogId, token]);

    const handleConfirm = async () => {
        if (!context || !machineWorkLogId || !token) {
            return;
        }
        setSubmitting(true);
        setSuccessMessage('');
        setError('');
        try {
            const payload = {
                action: 'confirm',
                machineWorkLogId,
                token,
                remark,
            };
            const data = await apiPost('/api/machine_work_log_approvals.php', payload);
            setContext(data);
            setRemark('');
            setSuccessMessage('บันทึกการยืนยันเรียบร้อย');
            window.setTimeout(() => setSuccessMessage(''), 3000);
            navigate('/worksite', { replace: true });
        } catch (err) {
            setError(err.message || 'ยืนยันไม่สำเร็จ');
        } finally {
            setSubmitting(false);
        }
    };

    const approval = context?.approval;
    const machineWorkLog = context?.machineWorkLog;
    const inspectorDone = Boolean(approval?.inspector?.approved_at);

    return (
        <div style={approvalStyles.page}>
            <header style={approvalStyles.hero}>
                <div>
                    <p className="muted">ยืนยันบันทึกการทำงานของเครื่องจักร</p>
                    {machineWorkLog ? (
                        <h1>{machineWorkLog.document_no || `MWL-${machineWorkLog.id}`}</h1>
                    ) : (
                        <h1>กำลังโหลด...</h1>
                    )}
                    {machineWorkLog && (
                        <p className="muted">วันที่บันทึก {formatDate(machineWorkLog.document_date)}</p>
                    )}
                </div>
                <Link style={approvalStyles.ghostLink} to="/worksite">กลับหน้าไซต์</Link>
            </header>

            {!machineWorkLogId || !token ? (
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
                                    <dt>เครื่องจักร</dt>
                                    <dd>{machineWorkLog.machine_code || '-'} · {machineWorkLog.machine_name || '-'}</dd>
                                </div>
                                <div>
                                    <dt>รายละเอียดการทำงาน</dt>
                                    <dd>{machineWorkLog.operation_details || '-'}</dd>
                                </div>
                                <div>
                                    <dt>WBS / รหัสงาน</dt>
                                    <dd>{formatWorkOrders(machineWorkLog.work_orders)}</dd>
                                </div>
                                <div>
                                    <dt>รวมมิเตอร์การทำงาน</dt>
                                    <dd>{formatWorkMeter(machineWorkLog.work_meter_total)}</dd>
                                </div>
                                <div>
                                    <dt>รายการตรวจสอบ</dt>
                                    <dd>{formatChecklistItems(machineWorkLog.checklist_items)}</dd>
                                </div>
                                <div>
                                    <dt>ผู้บันทึก</dt>
                                    <dd>{machineWorkLog.created_by || '-'}</dd>
                                </div>
                            </dl>
                        </article>
                        <article style={approvalStyles.card}>
                            <h2>สถานะการยืนยัน</h2>
                            <div style={approvalStyles.statusBoard}>
                                <div style={{
                                    ...approvalStyles.statusTile,
                                    ...(inspectorDone ? approvalStyles.statusTileDone : {}),
                                }}>
                                    <span style={{
                                        ...approvalStyles.statusBadge,
                                        ...(inspectorDone ? approvalStyles.badgeDone : approvalStyles.badgeWaiting),
                                    }}>
                                        {inspectorDone ? 'ยืนยันแล้ว' : 'รอการยืนยัน'}
                                    </span>
                                    <strong>ผู้ตรวจสอบ</strong>
                                    <span>{formatName(approval?.inspector?.full_name)}</span>
                                    {approval?.inspector?.remark && (
                                        <small>หมายเหตุ: {approval.inspector.remark}</small>
                                    )}
                                </div>
                            </div>
                            <div style={approvalStyles.remarkArea}>
                                <label>
                                    หมายเหตุ (ถ้ามี)
                                    <textarea
                                        value={remark}
                                        onChange={(event) => setRemark(event.target.value)}
                                        maxLength={500}
                                        placeholder="เช่น ระบุสถานะเครื่องจักร"
                                        style={approvalStyles.textarea}
                                    />
                                </label>
                            </div>
                            <div style={approvalStyles.actions}>
                                {canApproveInspector ? (
                                    <button
                                        type="button"
                                        className="button primary"
                                        disabled={inspectorDone || submitting}
                                        onClick={handleConfirm}
                                    >
                                        {inspectorDone ? 'ยืนยันแล้ว' : (submitting ? 'กำลังบันทึก...' : 'ยืนยัน (ผู้ตรวจสอบ)')}
                                    </button>
                                ) : (
                                    <p className="muted small-text">บัญชีนี้ไม่มีสิทธิ์ยืนยันบทบาทผู้ตรวจสอบ</p>
                                )}
                            </div>
                        </article>
                    </section>
                </>
            )}
        </div>
    );
}
