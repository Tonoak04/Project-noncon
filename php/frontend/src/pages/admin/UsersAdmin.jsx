import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiPatch, apiPost } from '../../api.js';

const roleOptions = [
    { value: 'admin', label: 'Admin' },
    { value: 'operator', label: 'เยื่ยมชมเว็บไซต์' },
    { value: 'driver', label: 'พลขับรถ' },
    { value: 'foreman', label: 'ผู้ตรวจสอบ(รถ)' },
    { value: 'assistant', label: 'ผู้ตรวจสอบ(น้ำมัน)' },
    { value: 'oiler', label: 'คนจ่ายน้ำมัน' },
];

const usernamePattern = /^[a-z0-9._-]{4,24}$/i;
const phonePattern = /^[0-9+\-\s]{7,20}$/;

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

const createEmptyForm = () => ({
    fullName: '',
    centerName: '',
    address: '',
    username: '',
    employeeId: '',
    phone: '',
    roles: ['operator'],
    password: '',
    confirmPassword: '',
});

const mapDirectoryUserToForm = (user) => {
    const template = createEmptyForm();
    if (!user) {
        return template;
    }
    return {
        ...template,
        fullName: user.fullName || template.fullName,
        centerName: user.centerName || template.centerName,
        address: user.address || template.address,
        username: user.username || template.username,
        employeeId: user.employeeId || template.employeeId,
        phone: user.phone || template.phone,
        roles: Array.isArray(user.roles) && user.roles.length ? [...user.roles] : template.roles,
    };
};

export default function UsersAdmin() {
    const navigate = useNavigate();
    const location = useLocation();
    const editingUser = location.state?.editingUser;
    const [form, setForm] = useState(createEmptyForm);
    const [formErrors, setFormErrors] = useState({});
    const [toast, setToast] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editingSource, setEditingSource] = useState(null);
    const [editingLabel, setEditingLabel] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const toastTimerRef = useRef(null);
    const passwordStrength = useMemo(() => describeStrength(form.password), [form.password]);

    const showToast = (type, message, duration = 3500) => {
        if (toastTimerRef.current) {
            window.clearTimeout(toastTimerRef.current);
        }
        setToast({ type, message });
        toastTimerRef.current = window.setTimeout(() => {
            setToast(null);
            toastTimerRef.current = null;
        }, duration);
    };

    useEffect(() => () => {
        if (toastTimerRef.current) {
            window.clearTimeout(toastTimerRef.current);
        }
    }, []);

    const clearFieldError = (field) => {
        setFormErrors((prev) => {
            if (!prev[field]) {
                return prev;
            }
            const next = { ...prev };
            delete next[field];
            return next;
        });
    };

    const updateFormField = (field) => (event) => {
        const value = event.target.value;
        setForm((prev) => ({ ...prev, [field]: value }));
        clearFieldError(field);
    };

    const validateForm = () => {
        const errors = {};
        if (!form.fullName.trim()) errors.fullName = 'กรุณากรอกชื่อ-นามสกุล';
        if (!form.centerName.trim()) errors.centerName = 'กรุณากรอกชื่อศูนย์/หน่วยงาน';
        if (!form.address.trim()) errors.address = 'กรุณากรอกที่อยู่';
        if (!usernamePattern.test(form.username.trim())) {
            errors.username = 'ต้องมี 4-24 ตัวอักษร (a-z, 0-9, ._- )';
        }
        if (!form.employeeId.trim()) {
            errors.employeeId = 'กรุณากรอกรหัสพนักงาน (Employee ID)';
        }
        const phoneValue = form.phone.trim();
        if (!phoneValue) {
            errors.phone = 'กรุณากรอกเบอร์ติดต่อ';
        } else if (!phonePattern.test(phoneValue)) {
            errors.phone = 'เบอร์โทรไม่ถูกต้อง';
        }
        if (!form.roles || form.roles.length === 0) {
            errors.roles = 'เลือกสิทธิ์อย่างน้อย 1 รายการ';
        }
        const passwordValue = form.password;
        const confirmValue = form.confirmPassword;
        if (!isEditing) {
            if (!passwordValue || passwordValue.length < 8) {
                errors.password = 'รหัสผ่านขั้นต่ำ 8 ตัวอักษร';
            }
            if (passwordValue !== confirmValue) {
                errors.confirmPassword = 'รหัสผ่านไม่ตรงกัน';
            }
        } else if (passwordValue || confirmValue) {
            if (!passwordValue || passwordValue.length < 8) {
                errors.password = 'รหัสผ่านขั้นต่ำ 8 ตัวอักษร';
            }
            if (!confirmValue) {
                errors.confirmPassword = 'กรุณายืนยันรหัสผ่านให้ครบถ้วน';
            } else if (passwordValue !== confirmValue) {
                errors.confirmPassword = 'รหัสผ่านไม่ตรงกัน';
            }
        }
        return errors;
    };

    const handleRolesSelectChange = (event) => {
        // Support both the old <select multiple> and the new checkbox inputs
        if (event.target.type === 'checkbox') {
            const roleValue = event.target.value;
            const checked = event.target.checked;
            setForm((prev) => {
                const prevRoles = Array.isArray(prev.roles) ? [...prev.roles] : [];
                const nextRoles = checked
                    ? Array.from(new Set([...prevRoles, roleValue]))
                    : prevRoles.filter((r) => r !== roleValue);
                return { ...prev, roles: nextRoles };
            });
            clearFieldError('roles');
            return;
        }
        const selectedRoles = Array.from(event.target.selectedOptions || []).map((option) => option.value);
        setForm((prev) => ({ ...prev, roles: selectedRoles }));
        clearFieldError('roles');
    };

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
        navigate('/admin/users/all');
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

    const handleSubmit = async (event) => {
        event.preventDefault();
        const errors = validateForm();
        if (Object.keys(errors).length) {
            setFormErrors(errors);
            return;
        }

        const trimmedPassword = form.password.trim();
        const trimmedConfirm = form.confirmPassword.trim();

        const payload = {
            fullName: form.fullName.trim(),
            centerName: form.centerName.trim(),
            address: form.address.trim(),
            username: form.username.trim(),
            employeeId: form.employeeId.trim(),
            phone: form.phone.trim(),
            roles: [...(form.roles || [])],
        };

        if (isEditing) {
            const editingId = Number(editingSource?.id);
            if (!Number.isInteger(editingId) || editingId <= 0) {
                showToast('error', 'ไม่พบรหัสผู้ใช้งานที่ต้องการแก้ไข');
                setIsSubmitting(false);
                return;
            }
            payload.id = editingId;
        }

        if (!isEditing || trimmedPassword || trimmedConfirm) {
            payload.password = trimmedPassword;
            payload.confirmPassword = trimmedConfirm;
        }

        setIsSubmitting(true);
        try {
            const apiCall = isEditing ? apiPatch : apiPost;
            const response = await apiCall('/api/admin/users.php', payload);
            const savedUser = response?.user;
            const displayName = savedUser?.fullName || payload.fullName;
            const actionLabel = isEditing ? 'บันทึกการแก้ไข' : 'เพิ่มผู้ใช้งาน';
            showToast('success', `${actionLabel} "${displayName}" เรียบร้อย`);
            if (isEditing) {
                exitEditingMode();
            } else {
                setForm(createEmptyForm());
                setFormErrors({});
            }
        } catch (error) {
            const message = error?.message || 'ไม่สามารถบันทึกข้อมูลได้';
            showToast('error', `บันทึกไม่สำเร็จ: ${message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleReset = () => {
        handleResetForm();
    };

    const formTitle = isEditing ? 'แก้ไขผู้ใช้งาน' : 'เพิ่มผู้ใช้งาน';
    const formSubtitle = isEditing
        ? 'แก้ไขรายละเอียดผู้ใช้งานที่เลือกจากรายชื่อทั้งหมด'
        : 'ระบุรายละเอียดผู้ใช้งานใหม่เพื่อลงทะเบียนเข้าสู่ระบบ';
    const submitLabel = isEditing ? 'บันทึกการแก้ไข' : 'บันทึกผู้ใช้งาน';
    const resetLabel = isEditing ? 'คืนค่าแบบฟอร์ม' : 'ล้างฟอร์ม';

    return (
        <div className="portal admin-users">
            <div className="page-banner-wrapper">
                <section className="page-banner page-banner--admin admin-users--hero">
                    <div className="page-banner__content">
                        <p className="admin-eyebrow page-banner__eyebrow">ศูนย์ควบคุมสิทธิ์</p>
                        <h1 className="page-banner__title">ศูนย์จัดการผู้ใช้งาน</h1>
                        <p className="page-banner__subtitle">เพิ่มสิทธิ์ สมาชิกเข้าสู่ระบบ</p>
                    </div>
                    <div className="page-banner__actions admin-hero-actions">
                        <button className="button ghost" type="button" onClick={() => navigate('/admin')}>
                            ย้อนกลับ
                        </button>
                        <button type="button" className="button ghost" onClick={() => navigate('/admin/users/all')}>
                            ดูรายชื่อทั้งหมด
                        </button>
                    </div>
                </section>
            </div>

            {toast && (
                <div
                    className={`alert ${toast.type === 'success' ? 'success' : 'danger'} admin-users__alert`}
                    role="alert"
                >
                    {toast.message}
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
                            ศูนย์/หน่วยงาน (Center Name) <span className="required-mark">*</span>
                        </span>
                        <input
                            type="text"
                            value={form.centerName}
                            onChange={updateFormField('centerName')}
                            placeholder="เช่น Main Center"
                            required
                        />
                        {formErrors.centerName && <small className="error-row">{formErrors.centerName}</small>}
                    </label>

                    <label className="form-field">
                        <span>
                            ที่อยู่หน่วยงาน <span className="required-mark">*</span>
                        </span>
                        <input
                            type="text"
                            value={form.address}
                            onChange={updateFormField('address')}
                            placeholder="HQ"
                            required
                        />
                        {formErrors.address && <small className="error-row">{formErrors.address}</small>}
                    </label>

                    <label className="form-field">
                        <span>
                            รหัสพนักงาน (Username) <span className="required-mark">*</span>
                        </span>
                        <input
                            type="text"
                            value={form.username}
                            onChange={updateFormField('username')}
                            placeholder="รหัสพนักงาน"
                            required
                        />
                        {formErrors.username && <small className="error-row">{formErrors.username}</small>}
                    </label>

                    <label className="form-field">
                        <span>
                            หมายเลขพนักงาน (Employee ID) <span className="required-mark">*</span>
                        </span>
                        <input
                            type="text"
                            value={form.employeeId}
                            onChange={updateFormField('employeeId')}
                            placeholder="เช่น EMP-00123"
                            required
                        />
                        {formErrors.employeeId && <small className="error-row">{formErrors.employeeId}</small>}
                    </label>

                    <div className="form-field">
                        <span>
                            เบอร์ติดต่อ <span className="required-mark">*</span>
                        </span>
                        <input
                            type="text"
                            value={form.phone}
                            onChange={updateFormField('phone')}
                            placeholder="08x-xxx-xxxx"
                            required
                        />
                        {formErrors.phone && <small className="error-row">{formErrors.phone}</small>}
                    </div>

                    <label className="form-field">
                        <span>
                            สิทธิ์ในระบบ <span className="required-mark">*</span>
                        </span>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                            {roleOptions.map((role) => {
                                const id = `role_${role.value}`;
                                return (
                                    <label key={role.value} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <input
                                            id={id}
                                            type="checkbox"
                                            value={role.value}
                                            checked={Array.isArray(form.roles) && form.roles.includes(role.value)}
                                            onChange={handleRolesSelectChange}
                                        />
                                        <span>{role.label}</span>
                                    </label>
                                );
                            })}
                        </div>
                        {formErrors.roles && <small className="error-row">{formErrors.roles}</small>}
                    </label>

                    <label className="form-field">
                        <span>
                            รหัสผ่าน <span className="required-mark">*</span>
                        </span>
                        <input
                            type="password"
                            value={form.password}
                            onChange={updateFormField('password')}
                            placeholder="อย่างน้อย 8 ตัวอักษร"
                            required={!isEditing}
                        />
                        {formErrors.password && <small className="error-row">{formErrors.password}</small>}
                        <div className="muted" style={{ fontSize: 12 }}>ความแข็งแรง: {passwordStrength.label}</div>
                    </label>

                    <label className="form-field">
                        <span>
                            ยืนยันรหัสผ่าน <span className="required-mark">*</span>
                        </span>
                        <input
                            type="password"
                            value={form.confirmPassword}
                            onChange={updateFormField('confirmPassword')}
                            placeholder="กรอกรหัสผ่านอีกครั้ง"
                            required={!isEditing}
                        />
                        {formErrors.confirmPassword && <small className="error-row">{formErrors.confirmPassword}</small>}
                    </label>

                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 12,
                            marginTop: 12,
                            flexWrap: 'wrap',
                            alignItems: 'center',
                        }}
                    >
                        <button type="button" className="button primary" onClick={handleReset}>
                            {resetLabel}
                        </button>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {isEditing && (
                                <button type="button" className="button primary" onClick={exitEditingMode}>
                                    ยกเลิกการแก้ไข
                                </button>
                            )}
                            <button type="submit" className="button primary" disabled={isSubmitting}>
                                {submitLabel}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}