import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
const roleDictionary = {
    admin: 'ผู้ดูแลระบบ',
    operator: 'ผู้ใช้งานดูได้ทั้งเว็บ',
    inspector: 'ผู้ตรวจสอบ',
    assistant: 'ผู้ตรวจสอบ(น้ำมัน)',
    driver: 'พลขับรถ',
    foreman: 'ผู้ตรวจสอบ(รถ)',
    oiler: 'คนจ่ายน้ำมัน',
};
const PencilIcon = () => (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path
            fill="currentColor"
            d="M2.5 13.8V17h3.2l9.4-9.4-3.2-3.2-9.4 9.4zm13.7-8.3a.9.9 0 0 0 0-1.2L13.7 2.8a.9.9 0 0 0-1.2 0l-1.8 1.8 3.2 3.2 1.8-1.8z"
        />
    </svg>
);
const TrashIcon = () => (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path
            fill="currentColor"
            d="M7 17a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V7H7v10zm9-12h-3.6l-.6-1.3A1 1 0 0 0 11 3H9a1 1 0 0 0-.8.7L7.6 5H4v2h12V5z"
        />
    </svg>
);
const resolveLastLogin = (user) => user?.lastLogin || user?.updatedAt || user?.createdAt;
const formatThaiDate = (value) => {
    if (!value) return '-';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
};
export default function UsersDirectory() {
    const navigate = useNavigate();
    const { logout } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [lastSync, setLastSync] = useState(null);
    const [filters, setFilters] = useState({ search: '', role: '', center: '' });
    const [viewMode, setViewMode] = useState('table');
    const [refreshTick, setRefreshTick] = useState(0);
    useEffect(() => {
        let active = true;
        const controller = new AbortController();
        async function fetchUsersFromApi() {
            setLoading(true);
            setError('');
            try {
                const data = await apiGet('/api/admin/users.php', { signal: controller.signal });
                if (!active) return;
                setUsers(Array.isArray(data.items) ? data.items : []);
                setLastSync(data.syncedAt ? new Date(data.syncedAt) : new Date());
            } catch (err) {
                if (!active || err?.name === 'AbortError') {
                    return;
                }
                if (err?.status === 401) {
                    setError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
                    logout('session-expired').catch(() => { });
                } else if (err?.status === 403) {
                    setError('บัญชีนี้ไม่มีสิทธิ์เปิดดูรายชื่อทั้งหมด');
                } else {
                    setError(err?.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูลผู้ใช้งาน');
                }
                setUsers([]);
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        }
        fetchUsersFromApi();
        return () => {
            active = false;
            controller.abort();
        };
    }, [logout, refreshTick]);
    const centerOptions = useMemo(() => {
        const entries = new Set();
        users.forEach((user) => {
            if (user.centerName) {
                entries.add(user.centerName);
            }
        });
        return Array.from(entries);
    }, [users]);
    const stats = useMemo(() => {
        const total = users.length;
        const admins = users.filter((user) => (user.roles || []).includes('admin')).length;
        const multiRole = users.filter((user) => (user.roles || []).length > 1).length;
        const contacts = users.filter((user) => (user.phone || '').trim() !== '').length;
        return { total, admins, multiRole, centers: centerOptions.length, contacts };
    }, [users, centerOptions]);
    const filteredUsers = useMemo(() => {
        const searchValue = filters.search.trim().toLowerCase();
        return users.filter((user) => {
            const matchesSearch = !searchValue || [user.fullName, user.username, user.centerName, user.employeeId]
                .some((value) => (value || '').toLowerCase().includes(searchValue));
            const matchesRole = !filters.role || (user.roles || []).includes(filters.role);
            const matchesCenter = !filters.center || user.centerName === filters.center;
            return matchesSearch && matchesRole && matchesCenter;
        });
    }, [users, filters]);
    const handleFilterChange = (field) => (event) => {
        const value = event.target.value;
        setFilters((prev) => ({ ...prev, [field]: value }));
    };
    const handleRefresh = () => {
        setError('');
        setRefreshTick((prev) => prev + 1);
    };
    const handleEditUser = (user) => {
        if (!user) return;
        navigate('/admin/users', { state: { editingUser: user } });
    };
    const handleDeleteUser = (user) => {
        if (!user) return;
        const label = user.fullName || user.username || `#${user.id}`;
        if (!window.confirm(`ต้องการลบบัญชี ${label} ออกจากรายการหรือไม่?`)) {
            return;
        }
        setUsers((prev) => prev.filter((entry) => entry.id !== user.id));
    };
    const formatRoles = (roles = []) => {
        if (!roles.length) return '-';
        return roles.map((role) => roleDictionary[role] || role).join(', ');
    };
    const renderActions = (user) => (
        <div
            className="users-directory__action-panel"
            role="group"
            aria-label={`การจัดการ ${user.fullName || user.username || ''}`}
        >
            <button
                type="button"
                className="users-directory__action-pill"
                onClick={() => handleEditUser(user)}
                title="แก้ไขผู้ใช้งาน"
            >
                <span className="users-directory__action-icon" aria-hidden="true">
                    <PencilIcon />
                </span>
                <span>แก้ไข</span>
            </button>
            <button
                type="button"
                className="users-directory__action-pill users-directory__action-pill--danger"
                onClick={() => handleDeleteUser(user)}
                title="ลบบัญชีผู้ใช้งาน"
            >
                <span className="users-directory__action-icon" aria-hidden="true">
                    <TrashIcon />
                </span>
                <span>ลบ</span>
            </button>
        </div>
    );
    const renderTable = () => (
        <div className="users-directory__table-wrapper">
            <table className="users-directory__table">
                <thead>
                    <tr>
                        <th>ผู้ใช้งาน</th>
                        <th>ศูนย์/ฝ่าย</th>
                        <th>ติดต่อ</th>
                        <th>บทบาท</th>
                        <th>เข้าสู่ระบบล่าสุด</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredUsers.map((user) => (
                        <tr key={user.id}>
                            <td>
                                <div className="users-directory__identity">
                                    {renderActions(user)}
                                    <div className="users-directory__identity-body">
                                        <div className="users-directory__identity-head">
                                            <div>
                                                <strong>{user.fullName || user.username || '-'}</strong>
                                                <div className="muted">{user.username} · #{user.employeeId || '-'}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </td>
                            <td>
                                <div>{user.centerName || '-'}</div>
                                <div className="muted">{user.address || 'ไม่ระบุที่อยู่'}</div>
                            </td>
                            <td>
                                <div>{user.phone || '-'}</div>
                            </td>
                            <td>{formatRoles(user.roles)}</td>
                            <td>{formatThaiDate(resolveLastLogin(user))}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
    const renderCards = () => (
        <div className="users-directory__card-grid">
            {filteredUsers.map((user) => (
                <article key={user.id} className="users-directory__card">
                    <header className="users-directory__card-header">
                        {renderActions(user)}
                        <div className="users-directory__card-identity">
                            <div className="users-directory__avatar users-directory__avatar--lg">
                                {(user.fullName || user.username || '?').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="users-directory__card-head">
                                <strong>{user.fullName || user.username || '-'}</strong>
                                <div className="muted">{user.centerName || '-'} · #{user.employeeId || '-'}</div>
                                <div className="muted">{user.username}</div>
                            </div>
                        </div>
                    </header>
                    <dl>
                        <div>
                            <dt>บทบาท</dt>
                            <dd>{formatRoles(user.roles)}</dd>
                        </div>
                        <div>
                            <dt>ติดต่อ</dt>
                            <dd>{user.phone || 'ไม่ระบุ'}</dd>
                        </div>
                        <div>
                            <dt>ที่อยู่</dt>
                            <dd>{user.address || 'ไม่ระบุที่อยู่'}</dd>
                        </div>
                        <div>
                            <dt>เข้าสู่ระบบล่าสุด</dt>
                            <dd>{formatThaiDate(resolveLastLogin(user))}</dd>
                        </div>
                    </dl>
                    <footer>
                        <span>Username: {user.username}</span>
                        <span>Center ID: {user.id}</span>
                    </footer>
                </article>
            ))}
        </div>
    );
    return (
        <div className="portal users-directory">
            <div className="page-banner-wrapper">
                <section className="page-banner page-banner--admin admin-directory--hero">
                    <div className="page-banner__content">
                        <p className="admin-eyebrow page-banner__eyebrow">ฐานข้อมูลผู้ใช้งาน</p>
                        <h1 className="page-banner__title">ภาพรวมผู้ใช้งาน</h1>
                        <p className="page-banner__subtitle">ตรวจสอบสถานะผู้ใช้งานและจัดการสิทธิ์จากทุกศูนย์ได้ในหน้าจอเดียว</p>
                    </div>
                    <div className="page-banner__actions admin-hero-actions">
                        <button className="button ghost" type="button" onClick={() => navigate('/admin')}>
                            ย้อนกลับ
                        </button>
                        <button type="button" className="button ghost" onClick={() => navigate('/admin/users')}>
                            + เพิ่มผู้ใช้งาน
                        </button>
                    </div>
                </section>
            </div>
            <section className="floating-panel users-directory__filters">
                <div className="users-directory__filters-row">
                    <label>
                        <span>ค้นหา</span>
                        <input
                            type="text"
                            placeholder="ชื่อ, username หรือศูนย์"
                            value={filters.search}
                            onChange={handleFilterChange('search')}
                        />
                    </label>
                    <label>
                        <span>บทบาท</span>
                        <select value={filters.role} onChange={handleFilterChange('role')}>
                            <option value="">ทั้งหมด</option>
                            {Object.entries(roleDictionary).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                    </label>
                    <label>
                        <span>ศูนย์</span>
                        <select value={filters.center} onChange={handleFilterChange('center')}>
                            <option value="">ทั้งหมด</option>
                            {centerOptions.map((center) => (
                                <option key={center} value={center}>{center}</option>
                            ))}
                        </select>
                    </label>
                </div>
                <div className="users-directory__result-info">
                    {loading ? 'กำลังโหลดข้อมูล...' : `พบ ${filteredUsers.length} รายการ`}
                </div>
            </section>
            <section className="floating-panel users-directory__content">
                {error && !loading ? (
                    <div className="users-directory__empty users-directory__empty--error">
                        <p>{error}</p>
                        <button type="button" className="button" onClick={handleRefresh}>
                            ลองโหลดอีกครั้ง
                        </button>
                    </div>
                ) : filteredUsers.length === 0 && !loading ? (
                    <div className="users-directory__empty">
                        <p>ไม่พบผู้ใช้งานที่ตรงกับตัวกรอง</p>
                        <button type="button" className="button ghost" onClick={() => setFilters({ search: '', role: '', center: '' })}>
                            ล้างตัวกรอง
                        </button>
                    </div>
                ) : (
                    (viewMode === 'table' ? renderTable() : renderCards())
                )}
            </section>
        </div>
    );



}



