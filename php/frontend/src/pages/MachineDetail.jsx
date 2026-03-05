import { useEffect, useMemo, useState, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { apiGet } from '../api.js';
import { categories as localCategories } from '../data/machines.js';

const getBrowserOrigin = () => (typeof window !== 'undefined' && window.location ? window.location.origin : '');

const API_BASE = (() => {
    const envBase = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE) ? import.meta.env.VITE_API_BASE : '';
    if (envBase) return envBase.replace(/\/+$/, '');
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
            const protocol = (typeof window !== 'undefined' && window.location && window.location.protocol) ? window.location.protocol : 'https:';
            return `${protocol}${url}`;
        }
        return url;
    }
    const base = (API_BASE || getBrowserOrigin() || '').replace(/\/+$/, '');
    if (!base) return url;
    return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
};

const toUploadsPath = (url) => {
    if (!url) return url;
    if (!/^(https?:)?\/\//i.test(url)) {
        return url;
    }
    try {
        const resolved = new URL(url.startsWith('//') ? `${(typeof window !== 'undefined' && window.location ? window.location.protocol : 'https:')}${url}` : url, API_BASE || getBrowserOrigin() || undefined);
        const fullPath = `${resolved.pathname || ''}${resolved.search || ''}${resolved.hash || ''}`;
        const markerIndex = fullPath.indexOf('/uploads/');
        return markerIndex >= 0 ? fullPath.slice(markerIndex) : fullPath;
    } catch {
        return url;
    }
};

const MAX_MACHINE_IMAGES = 5;

const normalizeMachine = (input) => {
    if (!input) return input;
    const normalized = { ...input };
    const ensureAbsoluteField = (field) => {
        if (normalized[field]) normalized[field] = absolutizeUrl(normalized[field]);
    };
    ensureAbsoluteField('image_url');
    ensureAbsoluteField('Image');

    if (Array.isArray(normalized.images)) {
        normalized.images = normalized.images
            .map((img) => {
                if (!img) return null;
                const raw = img.url || img.path || img.src;
                if (!raw) return null;
                const absolute = absolutizeUrl(raw);
                if (!absolute) return null;
                return {
                    ...img,
                    url: absolute,
                    path: toUploadsPath(raw) || raw,
                };
                })
                .filter((img) => Boolean(img && img.url))
                .slice(0, MAX_MACHINE_IMAGES);
    }

    return normalized;
};

const formatDate = (value) => {
    if (!value && value !== 0) return null;
    const str = String(value).trim();
    if (!str) return null;
    // Try native Date parsing first
    let d = new Date(str);
    if (isNaN(d)) {
        // Try YYYY-MM-DD or YYYY/MM/DD
        const m1 = str.match(/^(\d{4})[-:\/](\d{1,2})[-:\/](\d{1,2})/);
        if (m1) {
            const [_, y, mo, da] = m1;
            d = new Date(Number(y), Number(mo) - 1, Number(da));
        }
    }
    if (isNaN(d)) return str;
    try {
        const fmt = new Intl.DateTimeFormat('th-TH-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
        return fmt.format(d);
    } catch {
        // fallback
        return d.toLocaleDateString();
    }
};

export default function MachineDetail() {
    const params = useParams();
    const [searchParams] = useSearchParams();
    const idFromParams = (params && (params.id || params.machineId || params.code)) ? (params.id || params.machineId || params.code) : '';
    const idFromQuery = searchParams.get('id') || '';
    let id = idFromParams || idFromQuery || '';
    if (!id && typeof window !== 'undefined') {
        try {
            const hash = window.location.hash || '';
            const m = hash.match(/\/machines\/(\d+)/);
            if (m && m[1]) id = m[1];
            else {
                const q = hash.split('?')[1] || '';
                const params = new URLSearchParams(q);
                if (params.has('id')) id = params.get('id');
            }
        } catch (err) {
        }
    }
    const categoryFilter = searchParams.get('category');
    const classFilter = searchParams.get('class');
    const isAdminView = (searchParams.get('admin') === '1' || searchParams.get('admin') === 'true');
    const manageImages = (searchParams.get('manageImages') === '1' || searchParams.get('manageImages') === 'true');
    const backTarget = (() => {
        if (isAdminView) {
            return categoryFilter
                ? `/admin/machines?category=${encodeURIComponent(categoryFilter)}${classFilter ? `&class=${encodeURIComponent(classFilter)}` : ''}`
                : '/admin/machines';
        }
        return categoryFilter
            ? `/machines?category=${encodeURIComponent(categoryFilter)}${classFilter ? `&class=${encodeURIComponent(classFilter)}` : ''}`
            : '/machines';
    })();

    const [machine, setMachine] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [debugInfo, setDebugInfo] = useState([]);
    const [selectedImage, setSelectedImage] = useState(null);
    const thumbsRef = useRef(null);

    const VISIBLE_THUMBS = 5;

    const getThumbStep = () => {
        const el = thumbsRef.current;
        if (!el) return 84; 
        const btn = el.querySelector('.thumb-btn');
        const gap = parseFloat(getComputedStyle(el).gap) || 8;
        const btnWidth = btn ? btn.offsetWidth : 64;
        return btnWidth + gap;
    };

    const pageScroll = (direction = 1) => {
        const el = thumbsRef.current;
        if (!el) return;
        const step = getThumbStep() * VISIBLE_THUMBS;
        el.scrollBy({ left: step * direction, behavior: 'smooth' });
    };

    const scrollLeft = () => pageScroll(-1);
    const scrollRight = () => pageScroll(1);

    const handleThumbsWheel = (e) => {
        const el = thumbsRef.current;
        if (!el) return;
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            el.scrollLeft += e.deltaY;
            e.preventDefault();
        }
    };

    useEffect(() => {
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const url = `/api/machines.php?id=${encodeURIComponent(id)}`;
                console.log('MachineDetail fetching URL:', url, 'id=', id);
                let proxiedResult = { url, status: null, payload: null, error: null };
                try {
                    const data = await apiGet(url);
                    console.log('Machine detail response:', data);
                    proxiedResult.status = 200;
                    proxiedResult.payload = data;
                    setMachine(normalizeMachine(data.item || null));
                    if (!data.item) {
                        setError((data && data.error) ? data.error : 'ไม่พบข้อมูล (API returned empty)');
                    }
                } catch (e) {
                    console.error('Machine detail error', e);
                    proxiedResult.error = e.message || String(e);
                    const payload = e && e.payload ? e.payload : null;
                    if (payload) proxiedResult.payload = payload;
                    setError((e && e.message) ? e.message : 'ไม่สามารถโหลดข้อมูลได้');
                } finally {
                    setDebugInfo((prev) => [...prev, { type: 'proxied', ...proxiedResult }]);
                }

                if (!(proxiedResult.payload && proxiedResult.payload.item)) {
                    let directResult = { url: null, status: null, payload: null, error: null };
                    try {
                        const fallbackOrigin = (API_BASE && API_BASE !== '') ? API_BASE : (getBrowserOrigin() || 'http://localhost:8080');
                        const normalizedBase = fallbackOrigin.replace(/\/+$/, '');
                        const directUrl = `${normalizedBase ? `${normalizedBase}` : ''}/api/machines.php?id=${encodeURIComponent(id)}`;
                        directResult.url = directUrl;
                        console.log('MachineDetail fallback direct fetch:', directUrl);
                        const res = await fetch(directUrl, { credentials: 'include' });
                        directResult.status = res.status;
                        const directData = await res.json().catch(() => null);
                        directResult.payload = directData;
                        console.log('MachineDetail fallback response:', directData);
                        if (directData && directData.item) {
                            setMachine(normalizeMachine(directData.item));
                            setError(null);
                        }
                    } catch (err) {
                        console.warn('Direct fetch fallback failed', err);
                        directResult.error = String(err);
                    } finally {
                        setDebugInfo((prev) => [...prev, { type: 'direct', ...directResult }]);
                    }
                }
            } catch (e) {
                console.error('Machine detail error', e);
                const payload = e && e.payload ? JSON.stringify(e.payload) : null;
                setError((e && e.message) ? `${e.message}${payload ? ' — ' + payload : ''}` : 'ไม่สามารถโหลดข้อมูลได้');
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    useEffect(() => {
        if (!machine) {
            setSelectedImage(null);
            return;
        }
        const primary = machine?.image_url || (machine?.images && machine.images.length ? machine.images[0].url : null) || machine?.Image || null;
        setSelectedImage(primary);
    }, [machine]);

    const fields = [
        { label: 'รหัสเครื่องจักร', value: machine?.Equipment ?? '-' },
        { label: 'รายการเครื่องจักร', value: machine?.Description ?? '-' },
        { label: 'หน่วยงาน', value: machine?.Recipient ?? '-' },
        { label: 'เลขทะเบียน', value: machine?.License_plate_Number ?? '-' },
        { label: 'รหัสบริษัท', value: machine?.Company_code ?? '-' },
        { label: 'เลขทรัพย์สิน', value: machine?.Assest_Number ?? machine?.Assest ?? '-' },
        { label: 'หมายเลขตัวรถ', value: machine?.Chassis_Number ?? '-' },
        { label: 'หมายเลขเครื่องยนต์', value: machine?.Engine_Serial_Number ?? '-' },
        { label: 'รุ่นเครื่องยนต์', value: machine?.Engine_Model ?? '-' },
        { label: 'ความจุเครื่องยนต์ (ซีซี)', value: machine?.Engine_Capacity ?? '-' },
        { label: 'กำลังเครื่องยนต์ (แรงม้า)', value: machine?.Engine_Power ?? '-' },
        { label: 'หมายเหตุ/ข้อมูลพิเศษ', value: machine?.Specification ?? '-' },
        { label: 'สถานะ', value: machine?.Status ?? '-' },
        { label: 'ภาษี', value: machine?.Duties ? `${machine.Duties} บาท` : '-' },
        { label: 'บันทึกเพิ่ม', value: machine?.Note ?? '-' },
        { label: 'บริษัทผู้ผลิต', value: machine?.Manufacture ?? '-' },
        { label: 'ประกันภัย', value: formatDate(machine?.Insurance) || (machine?.Insurance ? machine.Insurance : '-') },
        { label: 'วันสิ้นสุดภาษี', value: formatDate(machine?.Tax) || (machine?.Tax ? machine.Tax : '-') },
        { label: 'วันที่จดทะเบียน', value: formatDate(machine?.Registered || machine?.MCCreated_at) || (machine?.Registered || machine?.MCCreated_at ? (machine?.Registered || machine?.MCCreated_at) : '-') },
    ];

    const { imageForType, machineTypeTitle } = useMemo(() => {
        const type = (machine?.Machine_Type || '').toLowerCase();
        const found = localCategories.find((c) => type.includes((c.id || '').toLowerCase()));
        return {
            imageForType: found ? found.image : null,
            machineTypeTitle: found ? found.title : (machine?.Machine_Type ?? null),
        };
    }, [machine]);

    const [uploading, setUploading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState({});

    const handleDeleteImage = async (img) => {
        if (!confirm(`ลบรูป ${img.filename || img.url}?`)) return;
        const targetPath = (img && (img.path || toUploadsPath(img.url))) || null;
        if (!targetPath) {
            alert('ไม่พบรูปภาพ');
            return;
        }
        try {
            const res = await fetch('/api/admin/machines_images.php', {
                method: 'DELETE',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: targetPath }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error((data && data.error) ? data.error : res.statusText);
            // remove from local state and select a new preview if needed
            setMachine((m) => {
                if (!m) return m;
                const remaining = (m.images || []).filter((i) => i.url !== img.url);
                const nextMachine = { ...m, images: remaining };
                if (selectedImage === img.url) {
                    const fallbackImage = remaining[0]?.url || nextMachine.image_url || nextMachine.Image || null;
                    setSelectedImage(fallbackImage);
                }
                return nextMachine;
            });
        } catch (e) {
            alert(e.message || 'Delete failed');
        }
    };

    const fileInputRef = useRef(null);

    const handleChooseFiles = () => {
        if ((machine?.images?.length || 0) >= MAX_MACHINE_IMAGES) {
            alert(`อัปโหลดได้สูงสุด ${MAX_MACHINE_IMAGES} รูปต่อเครื่อง`);
            return;
        }
        if (fileInputRef.current) fileInputRef.current.click();
    };

    const handleFilesSelected = async (e) => {
        const files = (e.target && e.target.files) ? e.target.files : null;
        if (!files || files.length === 0 || !machine) return;
        const currentCount = machine.images?.length || 0;
        const remainingSlots = Math.max(0, MAX_MACHINE_IMAGES - currentCount);
        if (remainingSlots <= 0) {
            alert(`มีรูปครบ ${MAX_MACHINE_IMAGES} รูปแล้ว`);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }
        const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        const MAX_SIZE_BYTES = 5 * 1024 * 1024;
        const invalidType = Array.from(files).find(f => !ALLOWED_TYPES.includes(f.type));
        if (invalidType) {
            alert(`ไฟล์ "${invalidType.name}" ไม่ใช่รูปภาพที่รองรับ (รองรับ: jpg, png, webp, gif เท่านั้น)`);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }
        const oversized = Array.from(files).find(f => f.size > MAX_SIZE_BYTES);
        if (oversized) {
            alert(`ไฟล์ "${oversized.name}" มีขนาดเกิน 5MB`);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }
        const allowedFiles = Array.from(files).slice(0, remainingSlots);
        if (allowedFiles.length === 0) {
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }
        if (allowedFiles.length < files.length) {
            alert(`เลือกรูปได้อีกไม่เกิน ${remainingSlots} รูป`);
        }
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('Machine_Id', String(machine.Machine_Id));
            for (let i = 0; i < allowedFiles.length; i++) fd.append('files[]', allowedFiles[i]);
            const res = await fetch('/api/admin/machines_images.php', {
                method: 'POST',
                credentials: 'include',
                body: fd,
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error((data && data.error) ? data.error : res.statusText);
            // append returned files to machine.images
            const added = data.files || [];
            const appended = added
                .map((u) => {
                    if (!u) return null;
                    const path = toUploadsPath(u) || u;
                    const url = absolutizeUrl(u);
                    if (!url) return null;
                    return {
                        url,
                        path,
                        filename: path.split('/').pop(),
                    };
                })
                .filter(Boolean);
            setMachine((m) => {
                if (!m) return m;
                return { ...m, images: [...(m.images || []), ...appended].slice(0, MAX_MACHINE_IMAGES) };
            });
        } catch (e) {
            alert(e.message || 'Upload failed');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    if (loading) {
        return (
            <div className="portal">
                <section>
                    <div className="loading-row">กำลังโหลดข้อมูล…</div>
                </section>
            </div>
        );
    }

    if (!machine) {
        return (
            <div className="portal">
                <section>
                    <div className="panel-header">
                        <Link to={backTarget} className="ghost-btn">
                            ย้อนกลับ
                        </Link>
                        <h2>ไม่พบข้อมูลเครื่องจักร</h2>
                    </div>
                    <p>ตรวจสอบรหัสอีกครั้งหรือกลับไปยังหน้ารายการ</p>
                    {error && (
                        <div className="error-row" style={{ margin: '1rem 0' }}>
                            <strong>รายละเอียดข้อผิดพลาด:</strong>
                            <div style={{ whiteSpace: 'pre-wrap' }}>{String(error)}</div>
                        </div>
                    )}
                    {debugInfo.length > 0 && (
                        <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f8f9fb', borderRadius: 6 }}>
                            <strong>Debug (API fetch attempts):</strong>
                            {debugInfo.map((d, i) => (
                                <div key={i} style={{ marginTop: 8, fontSize: 13 }}>
                                    <div><em>Type:</em> {d.type}</div>
                                    <div><em>URL:</em> {d.url || d.url === null ? d.url : 'n/a'}</div>
                                    <div><em>Status:</em> {String(d.status)}</div>
                                    {d.error && <div style={{ color: 'crimson' }}><em>Error:</em> {String(d.error)}</div>}
                                    {d.payload && (
                                        <details style={{ marginTop: 6 }}>
                                            <summary>Response payload</summary>
                                            <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 240, overflow: 'auto' }}>{JSON.stringify(d.payload, null, 2)}</pre>
                                        </details>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    <Link to={backTarget} className="button primary">
                        กลับไปหน้ารายการ
                    </Link>
                </section>
            </div>
        );
    }

    return (
        <div className="portal">
            <section className="section-spaced">
                <div className="page-banner detail-banner">
                    <Link to={backTarget} className="back-link">
                        ย้อนกลับ
                    </Link>
                    <div className="detail-hero">
                        <div className="detail-meta">
                            <h2>{machine.Equipment ?? `#${machine.Machine_Id}`}</h2>
                            <div className="detail-badges">
                                <span className="chip">{machineTypeTitle ?? '-'}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="detail-image framed">
                    {selectedImage ? (
                        <img src={selectedImage} alt={machine.Equipment ?? `#${machine.Machine_Id}`} width="300" height="300" />
                    ) : (
                        <div className="no-image">ไม่มีรูป</div>
                    )}
                </div>

                {isAdminView && (
                    <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                        {!isEditing ? (
                            <button className="button" onClick={() => {
                                setEditData({
                                    Equipment: machine.Equipment || '',
                                    Description: machine.Description || '',
                                    Recipient: machine.Recipient || '',
                                    License_plate_Number: machine.License_plate_Number || '',
                                    Company_code: machine.Company_code || '',
                                    Assest_Number: machine.Assest_Number || machine.Assest || '',
                                    Chassis_Number: machine.Chassis_Number || '',
                                    Engine_Serial_Number: machine.Engine_Serial_Number || '',
                                    Engine_Model: machine.Engine_Model || '',
                                    Engine_Capacity: machine.Engine_Capacity || '',
                                    Engine_Power: machine.Engine_Power || '',
                                    Specification: machine.Specification || '',
                                    Status: machine.Status || '',
                                    Duties: machine.Duties || '',
                                    Note: machine.Note || '',
                                    Manufacture: machine.Manufacture || '',
                                    Insurance: machine.Insurance || '',
                                    Tax: machine.Tax || '',
                                    Registered: machine.Registered || machine.MCCreated_at || '',
                                });
                                setIsEditing(true);
                            }}>แก้ไขข้อมูล</button>
                        ) : (
                            <>
                                <button className="button primary" onClick={async () => {
                                    try {
                                        const res = await fetch('/api/admin/machines.php', {
                                            method: 'PUT',
                                            credentials: 'include',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ Machine_Id: machine.Machine_Id, ...editData }),
                                        });
                                        const data = await res.json().catch(() => null);
                                        if (!res.ok) throw new Error((data && data.error) ? data.error : res.statusText || 'Save failed');
                                        // update local machine state
                                        if (data && data.item) setMachine(data.item);
                                        setIsEditing(false);
                                    } catch (e) {
                                        alert(e.message || 'Save failed');
                                    }
                                }}>บันทึก</button>
                                <button className="button" onClick={() => { setIsEditing(false); setEditData({}); }}>ยกเลิก</button>
                            </>
                        )}
                    </div>
                )}

                {machine?.images && machine.images.length > 1 && (
                    <div className="thumbnail-wrap">
                        <button type="button" className="thumb-arrow left" onClick={scrollLeft} aria-label="เลื่อนซ้าย">‹</button>
                        <div className="detail-thumbs" ref={thumbsRef} onWheel={handleThumbsWheel}>
                            {machine.images.map((img, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    className={`thumb-btn ${selectedImage === img.url ? 'active' : ''}`}
                                    onClick={() => setSelectedImage(img.url)}
                                    title={`รูปที่ ${idx + 1}`}
                                >
                                    <img src={img.url} alt={`thumb-${idx}`} />
                                </button>
                            ))}
                        </div>
                        <button type="button" className="thumb-arrow right" onClick={scrollRight} aria-label="เลื่อนขวา">›</button>
                    </div>
                )}
                
                {isAdminView && (
                    <div style={{ marginTop: 16 }}>
                        <h3>จัดการรูปภาพ (Admin)</h3>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple style={{ display: 'none' }} onChange={handleFilesSelected} />
                            <button className="button" type="button" onClick={handleChooseFiles} disabled={uploading}>{uploading ? 'กำลังอัพโหลด...' : 'อัปโหลดรูป'}</button>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {(machine.images || []).map((img, idx) => (
                                <div key={idx} style={{ textAlign: 'center' }}>
                                    <img src={img.url} alt={img.filename || `img-${idx}`} style={{ width: 120, height: 80, objectFit: 'cover', display: 'block' }} />
                                    <div style={{ marginTop: 4 }}>
                                        <button className="button primary" onClick={() => handleDeleteImage(img)}>ลบ</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="field-grid">
                    {isEditing ? (
                        <>
                            <div className="field-row">
                                <span>รหัสเครื่องจักร</span>
                                <input value={editData.Equipment || ''} onChange={(e) => setEditData((s) => ({ ...s, Equipment: e.target.value }))} />
                            </div>
                            <div className="field-row">
                                <span>รายการเครื่องจักร</span>
                                <input value={editData.Description || ''} onChange={(e) => setEditData((s) => ({ ...s, Description: e.target.value }))} />
                            </div>
                            <div className="field-row">
                                <span>หน่วยงาน</span>
                                <input value={editData.Recipient || ''} onChange={(e) => setEditData((s) => ({ ...s, Recipient: e.target.value }))} />
                            </div>
                            <div className="field-row">
                                <span>เลขทะเบียน</span>
                                <input value={editData.License_plate_Number || ''} onChange={(e) => setEditData((s) => ({ ...s, License_plate_Number: e.target.value }))} />
                            </div>
                            <div className="field-row">
                                <span>รหัสบริษัท</span>
                                <input value={editData.Company_code || ''} onChange={(e) => setEditData((s) => ({ ...s, Company_code: e.target.value }))} />
                            </div>
                            <div className="field-row">
                                <span>เลขทรัพย์สิน</span>
                                <input value={editData.Assest_Number || ''} onChange={(e) => setEditData((s) => ({ ...s, Assest_Number: e.target.value }))} />
                            </div>
                            <div className="field-row">
                                <span>หมายเลขตัวรถ</span>
                                <input value={editData.Chassis_Number || ''} onChange={(e) => setEditData((s) => ({ ...s, Chassis_Number: e.target.value }))} />
                            </div>
                            <div className="field-row">
                                <span>หมายเลขเครื่องยนต์</span>
                                <input value={editData.Engine_Serial_Number || ''} onChange={(e) => setEditData((s) => ({ ...s, Engine_Serial_Number: e.target.value }))} />
                            </div>
                            <div className="field-row">
                                <span>รุ่นเครื่องยนต์</span>
                                <input value={editData.Engine_Model || ''} onChange={(e) => setEditData((s) => ({ ...s, Engine_Model: e.target.value }))} />
                            </div>
                            <div className="field-row">
                                <span>ความจุเครื่องยนต์ (ซีซี)</span>
                                <input value={editData.Engine_Capacity || ''} onChange={(e) => setEditData((s) => ({ ...s, Engine_Capacity: e.target.value }))} />
                            </div>
                            <div className="field-row">
                                <span>กำลังเครื่องยนต์ (แรงม้า)</span>
                                <input value={editData.Engine_Power || ''} onChange={(e) => setEditData((s) => ({ ...s, Engine_Power: e.target.value }))} />
                            </div>
                            <div className="field-row">
                                <span>หมายเหตุ/ข้อมูลพิเศษ</span>
                                <input value={editData.Specification || ''} onChange={(e) => setEditData((s) => ({ ...s, Specification: e.target.value }))} />
                            </div>
                            <div className="field-row">
                                <span>สถานะ</span>
                                <input value={editData.Status || ''} onChange={(e) => setEditData((s) => ({ ...s, Status: e.target.value }))} />
                            </div>
                            <div className="field-row">
                                <span>ภาษี</span>
                                <input value={editData.Duties || ''} onChange={(e) => setEditData((s) => ({ ...s, Duties: e.target.value }))} />
                            </div>
                            <div className="field-row">
                                <span>บันทึกเพิ่ม</span>
                                <input value={editData.Note || ''} onChange={(e) => setEditData((s) => ({ ...s, Note: e.target.value }))} />
                            </div>
                            <div className="field-row">
                                <span>บริษัทผู้ผลิต</span>
                                <input value={editData.Manufacture || ''} onChange={(e) => setEditData((s) => ({ ...s, Manufacture: e.target.value }))} />
                            </div>
                            <div className="field-row">
                                <span>ประกันภัย</span>
                                <input value={editData.Insurance || ''} onChange={(e) => setEditData((s) => ({ ...s, Insurance: e.target.value }))} />
                            </div>
                            <div className="field-row">
                                <span>วันสิ้นสุดภาษี</span>
                                <input value={editData.Tax || ''} onChange={(e) => setEditData((s) => ({ ...s, Tax: e.target.value }))} />
                            </div>
                            <div className="field-row">
                                <span>วันที่จดทะเบียน</span>
                                <input value={editData.Registered || ''} onChange={(e) => setEditData((s) => ({ ...s, Registered: e.target.value }))} />
                            </div>
                        </>
                    ) : (
                        fields.map((field) => (
                            <div key={field.label} className="field-row">
                                <span>{field.label}</span>
                                <strong>{field.value}</strong>
                            </div>
                        ))
                    )}
                </div>
            </section>
        </div>
    );
}
