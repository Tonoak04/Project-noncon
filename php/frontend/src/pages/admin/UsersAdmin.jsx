import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const roleOptions = [
    { value: 'admin', label: 'Admin / ผู้ดูแล' },
    { value: 'operator', label: 'หัวหน้างาน' },
    { value: 'inspector', label: 'ผู้ตรวจสอบ' },
    { value: 'viewer', label: 'อ่านอย่างเดียว' },
];

const departmentOptions = [
    { value: 'operations', label: 'ฝ่ายปฏิบัติการ' },
    { value: 'maintenance', label: 'ฝ่ายซ่อมบำรุง' },
    { value: 'safety', label: 'ฝ่ายความปลอดภัย' },
    { value: 'business', label: 'ฝ่ายลูกค้า/ธุรกิจ' },
];

const scopeOptions = [
    { value: 'central-yard', label: 'Central Yard', description: 'คลังกลางและสำนักงานหลัก' },
    { value: 'north-field', label: 'North Field', description: 'ไซต์ภาคเหนือ/เชียงราย' },
    { value: 'east-lab', label: 'East Lab', description: 'ศูนย์ซ่อมและทดสอบเครื่องจักร' },
    { value: 'mobile-team', label: 'Mobile Team', description: 'หน่วยเคลื่อนที่/สนับสนุนฉุกเฉิน' },
];

const moduleOptions = [
    { id: 'machines', label: 'ฐานข้อมูลเครื่องจักร', description: 'สร้าง/แก้ไขข้อมูลเครื่องจักรและไฟล์แนบ', color: '#2c8bff', glyph: 'MC', defaultEnabled: true },
    { id: 'reports', label: 'รายงานเหตุขัดข้อง', description: 'รับแจ้ง/คอมเมนต์รายงานซ่อม', color: '#f0506e', glyph: 'RP', defaultEnabled: true },
    { id: 'oil', label: 'บันทึกน้ำมัน', description: 'บันทึกสต็อกและออกรายงานเติมน้ำมัน', color: '#f39c12', glyph: 'OL', defaultEnabled: true },
    { id: 'checklist', label: 'แบบฟอร์มตรวจเช็ก', description: 'ดูและลงนามเช็กลิสต์รายวัน', color: '#3ac27b', glyph: 'CL', defaultEnabled: false },
    { id: 'analytics', label: 'แดชบอร์ดวิเคราะห์', description: 'เข้าถึง KPI และการวิเคราะห์การใช้งาน', color: '#8e5cff', glyph: 'BI', defaultEnabled: false },
];

const onboardingSteps = [
    { id: 1, title: 'ส่งคำเชิญ', detail: 'ระบบจะยิงอีเมลพร้อมลิงก์ตั้งรหัสผ่านแรกเข้า', eta: 'ภายใน 5 นาที' },
    { id: 2, title: 'ยืนยันตัวตน', detail: 'เจ้าหน้าที่ต้องยืนยันหมายเลขโทรศัพท์/OTP', eta: 'ภายในวันเดียวกัน' },
    { id: 3, title: 'ผูกสิทธิ์และโมดูล', detail: 'ระบบกำหนดสิทธิ์โมดูลตามบทบาทและขอบเขตงาน', eta: 'อัตโนมัติหลังยืนยัน' },
    { id: 4, title: 'ตรวจสอบอุปกรณ์', detail: 'แจ้งทีม IT เพิ่มอุปกรณ์ Mobile หรือ Token ตามสิทธิ์', eta: '2-3 วันทำการ' },
];

const buildModuleState = () => moduleOptions.reduce((acc, option) => {
    acc[option.id] = option.defaultEnabled !== false;
    return acc;
}, {});

const createEmptyForm = () => ({
    fullName: '',
    username: '',
    email: '',
    phone: '',
    roles: ['operator'],
    scopes: scopeOptions.length ? [scopeOptions[0].value] : [],
    modules: buildModuleState(),
    password: '',
    confirmPassword: '',
    expiresOn: '',
    note: '',
    notifyEmail: true,
    notifySms: false,
    notifyReport: true,
});

const mapDirectoryUserToForm = (user) => {
    const template = createEmptyForm();
    if (!user) {
        return template;
    }
    return {
        ...template,
        fullName: user.fullName || template.fullName,
        username: user.username || template.username,
        phone: user.phone || template.phone,
        roles: user.roles?.length ? [...user.roles] : template.roles,
        note: user.centerName ? `ข้อมูลจาก ${user.centerName}` : template.note,
    };
};

const usernamePattern = /^[a-z0-9._-]{4,24}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[0-9+\-\s]{7,20}$/;

const badgeBaseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase',
};

const roleColors = {
    admin: '#f0506e',
    operator: '#2c8bff',
    inspector: '#865dff',
    viewer: '#5f6b7b',
};

const describeStrength = (password) => {
    if (!password) {
        return { label: 'ยังไม่ได้กรอกรหัสผ่าน', score: 0 };
    }
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    const labels = ['อ่อนมาก', 'อ่อน', 'ปานกลาง', 'ดี', 'ดีมาก'];
    return { label: labels[score] || labels[4], score };
};

export default function UsersAdmin() {
    const navigate = useNavigate();
    const location = useLocation();
    const editingUser = location.state?.editingUser;
    const [form, setForm] = useState(createEmptyForm);
    const [formErrors, setFormErrors] = useState({});
    const [flashMessage, setFlashMessage] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [editingSource, setEditingSource] = useState(null);
    const [editingLabel, setEditingLabel] = useState('');

    const passwordStrength = useMemo(() => describeStrength(form.password), [form.password]);
    const previewData = useMemo(() => {
        const department = departmentOptions.find((dept) => dept.value === form.department);
        const selectedRoles = roleOptions.filter((option) => (form.roles || []).includes(option.value));
        const scopes = scopeOptions.filter((scope) => (form.scopes || []).includes(scope.value));
        const modules = moduleOptions.filter((module) => (form.modules || {})[module.id]);
        return {
            departmentLabel: department?.label || 'ไม่ระบุฝ่าย',
            roleLabel: selectedRoles[0]?.label || (form.roles?.[0] ?? ''),
            roleLabels: selectedRoles.map((option) => option.label),
            scopes,
            modules,
        };
    }, [form]);

    const updateFormField = (field) => (event) => {
        const value = event.target.value;
        setForm((prev) => ({ ...prev, [field]: value }));
        if (formErrors[field]) {
            setFormErrors((prev) => {
                const next = { ...prev };
                delete next[field];
                return next;
            });
        }
    };

    const validateForm = () => {
        const errors = {};
        if (!form.fullName.trim()) errors.fullName = 'กรุณากรอกชื่อ-นามสกุล';
        if (!usernamePattern.test(form.username.trim())) {
            errors.username = 'ต้องมี 4-24 ตัวอักษร (a-z, 0-9, ._- )';
        }
        if (!emailPattern.test(form.email.trim())) {
            errors.email = 'รูปแบบอีเมลไม่ถูกต้อง';
        }
        if (form.phone && !phonePattern.test(form.phone.trim())) {
            errors.phone = 'เบอร์โทรไม่ถูกต้อง';
        }
        if (!form.department) {
            errors.department = 'เลือกฝ่ายที่สังกัด';
        }
        if (!form.roles || form.roles.length === 0) {
            errors.roles = 'เลือกสิทธิ์อย่างน้อย 1 รายการ';
        }
        if (!form.scopes || form.scopes.length === 0) {
            errors.scopes = 'เลือกขอบเขตงานอย่างน้อย 1 รายการ';
        }
        if (!Object.values(form.modules || {}).some(Boolean)) {
            errors.modules = 'ต้องเปิดใช้งานอย่างน้อย 1 โมดูล';
        }
        if (form.expiresOn) {
            const today = new Date();
            const expiryDate = new Date(form.expiresOn);
            if (expiryDate < new Date(today.toISOString().slice(0, 10))) {
                errors.expiresOn = 'วันที่หมดอายุต้องอยู่ในอนาคต';
            }
        }
        if (!form.password || form.password.length < 8) {
            errors.password = 'รหัสผ่านขั้นต่ำ 8 ตัวอักษร';
        }
        if (form.password !== form.confirmPassword) {
            errors.confirmPassword = 'รหัสผ่านไม่ตรงกัน';
        }
        return errors;
    };

    const handleScopeToggle = (value) => () => {
        setForm((prev) => {
            const exists = prev.scopes.includes(value);
            const nextScopes = exists
                ? prev.scopes.filter((scope) => scope !== value)
                : [...prev.scopes, value];
            return { ...prev, scopes: nextScopes };
        });
    };

    const handleModuleToggle = (moduleId) => (event) => {
        const checked = event.target.checked;
        setForm((prev) => ({
            ...prev,
            modules: {
                ...prev.modules,
                [moduleId]: checked,
            },
        }));
    };

    const handleNotificationToggle = (field) => (event) => {
        setForm((prev) => ({ ...prev, [field]: event.target.checked }));
    };

    const handleRoleToggle = (value) => () => {
        setForm((prev) => {
            const currentRoles = Array.isArray(prev.roles) ? prev.roles : [];
            const exists = currentRoles.includes(value);
            const nextRoles = exists
                ? currentRoles.filter((role) => role !== value)
                : [...currentRoles, value];
            return { ...prev, roles: nextRoles };
        });
        if (formErrors.roles) {
            setFormErrors((prev) => {
                const next = { ...prev };
                delete next.roles;
                return next;
            });
        }
    };

    const previewInitials = (form.fullName || form.username || 'ผู้ใช้').slice(0, 2).toUpperCase();
    const notificationSummary = [
        form.notifyEmail ? 'Email' : null,
        form.notifySms ? 'SMS' : null,
        form.notifyReport ? 'สรุปรายวัน' : null,
    ].filter(Boolean).join(', ') || 'ยังไม่ตั้งค่าแจ้งเตือน';

    useEffect(() => {
        if (editingUser) {
            setIsEditing(true);
            setEditingSource(editingUser);
            setEditingLabel(editingUser.fullName || editingUser.username || `Center #${editingUser.id}`);
            setForm(mapDirectoryUserToForm(editingUser));
            setFormErrors({});
        }
    }, [editingUser]);

    const exitEditingMode = () => {
        setIsEditing(false);
        setEditingSource(null);
        setEditingLabel('');
        setForm(createEmptyForm());
        setFormErrors({});
        if (editingUser) {
            navigate('/admin/users', { replace: true });
        }
    };

    const handleResetForm = () => {
        if (isEditing && editingSource) {
            setForm(mapDirectoryUserToForm(editingSource));
            setFormErrors({});
            return;
        }
        setForm(createEmptyForm());
        setFormErrors({});
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        const errors = validateForm();
        if (Object.keys(errors).length) {
            setFormErrors(errors);
            return;
        }
        const now = new Date();
        const newUser = {
            id: `USR-${(Math.floor(Math.random() * 9000) + 1000).toString()}`,
            fullName: form.fullName.trim(),
            username: form.username.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            department: form.department,
            role: form.roles?.[0] || 'operator',
            roles: [...(form.roles || [])],
            scopes: [...form.scopes],
            modules: { ...form.modules },
            expiresOn: form.expiresOn,
            lastLogin: now.toLocaleString('th-TH', { hour12: false }),
        };
        const actionLabel = isEditing ? 'บันทึกการแก้ไข' : 'เพิ่มผู้ใช้งาน';
        setFlashMessage(`${actionLabel} "${newUser.fullName}" เรียบร้อย (ตัวอย่าง)`);
        if (isEditing) {
            exitEditingMode();
        } else {
            setForm(createEmptyForm());
            setFormErrors({});
        }
        window.setTimeout(() => setFlashMessage(''), 3500);
    };

    const handleReset = () => {
        handleResetForm();
    };

    const formTitle = isEditing ? 'แก้ไขผู้ใช้งาน' : 'เพิ่มผู้ใช้งาน';
    const formSubtitle = isEditing
        ? 'แก้ไขรายละเอียดผู้ใช้งานที่เลือกจากรายชื่อทั้งหมด'
        : 'ระบุรายละเอียดผู้ใช้งานที่ต้องการเชิญ';
    const submitLabel = isEditing ? 'บันทึกการแก้ไข (ตัวอย่าง)' : 'บันทึกผู้ใช้งาน (ตัวอย่าง)';
    const resetLabel = isEditing ? 'คืนค่าแบบฟอร์ม' : 'ล้างฟอร์ม';

    return (
        <div className="portal admin-users">
            <section className="page-banner admin-users__banner">
                <div className="admin-users__banner-info">
                    <button className="back-link" type="button" onClick={() => navigate('/admin')}>
                        ย้อนกลับ
                    </button>
                    <div>
                        <h2>ศูนย์จัดการผู้ใช้งาน</h2> 
                    </div>
                </div>
            </section>

            {flashMessage && (
                <div className="alert success admin-users__alert">
                    {flashMessage}
                </div>
            )}

            <div className="admin-users__grid">
                <form className="floating-panel" onSubmit={handleSubmit}>
                    <header className="admin-users__form-head">
                        <div>
                            <h3>{formTitle}</h3>
                            <p className="muted">{formSubtitle}</p>
                            {isEditing && (
                                <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: '#0f3e68' }}>
                                    กำลังแก้ไข: {editingLabel}
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            className="button ghost"
                            onClick={() => navigate('/admin/users/all')}
                        >
                            ดูรายชื่อทั้งหมด
                        </button>
                    </header>

                    <label className="form-field">
                        <span>
                            ชื่อ-นามสกุล <span className="required-mark">*</span>
                        </span>
                        <input type="text" value={form.fullName} onChange={updateFormField('fullName')} required />
                        {formErrors.fullName && <small className="error-row">{formErrors.fullName}</small>}
                    </label>

                    <label className="form-field">
                        <span>
                            รหัสพนักงาน (Username) <span className="required-mark">*</span>
                        </span>
                        <input type="text" value={form.username} onChange={updateFormField('username')} placeholder="รหัสพนักงาน" required />
                        {formErrors.username && <small className="error-row">{formErrors.username}</small>}
                    </label>

                    <label className="form-field">
                        <span>อีเมล </span>
                        <input type="email" value={form.email} onChange={updateFormField('email')} placeholder="name@example.com" />
                        {formErrors.email && <small className="error-row">{formErrors.email}</small>}
                    </label>

                    <div className="form-field">
                        <span>
                            เบอร์ติดต่อ <span className="required-mark">*</span>
                        </span>
                        <input type="text" value={form.phone} onChange={updateFormField('phone')} placeholder="08x-xxx-xxxx" required />
                        {formErrors.phone && <small className="error-row">{formErrors.phone}</small>}
                    </div>

                    <div className="form-field">
                        <span>
                            สิทธิ์ในระบบ <span className="required-mark">*</span>
                        </span>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginTop: 8 }}>
                            {roleOptions.map((role) => {
                                const checked = (form.roles || []).includes(role.value);
                                return (
                                    <label
                                        key={role.value}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            border: '1px solid rgba(15, 35, 58, 0.15)',
                                            borderRadius: 12,
                                            padding: '8px 12px',
                                            cursor: 'pointer',
                                            background: checked ? 'rgba(44, 139, 255, 0.08)' : '#fff',
                                            transition: 'background 0.2s ease, border 0.2s ease',
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={handleRoleToggle(role.value)}
                                            style={{ accentColor: '#2c8bff' }}
                                        />
                                        <span>{role.label}</span>
                                    </label>
                                );
                            })}
                        </div>
                        {formErrors.roles && <small className="error-row">{formErrors.roles}</small>}
                    </div>

                    <label className="form-field">
                        <span>
                            รหัสผ่าน <span className="required-mark">*</span>
                        </span>
                        <input type="password" value={form.password} onChange={updateFormField('password')} placeholder="อย่างน้อย 8 ตัวอักษร" required />
                        {formErrors.password && <small className="error-row">{formErrors.password}</small>}
                        <div className="muted" style={{ fontSize: 12 }}>ความแข็งแรง: {passwordStrength.label}</div>
                    </label>
                                
                    <label className="form-field">
                        <span>
                            ยืนยันรหัสผ่าน <span className="required-mark">*</span>
                        </span>
                        <input type="password" value={form.confirmPassword} onChange={updateFormField('confirmPassword')} placeholder="กรอกรหัสผ่านอีกครั้ง" required/>
                        {formErrors.confirmPassword && <small className="error-row">{formErrors.confirmPassword}</small>}
                    </label>

                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        <button type="button" className="button ghost" onClick={handleReset}>{resetLabel}</button>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {isEditing && (
                                <button type="button" className="button ghost" onClick={exitEditingMode}>
                                    ยกเลิกการแก้ไข
                                </button>
                            )}
                            <button type="submit" className="button primary">{submitLabel}</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
