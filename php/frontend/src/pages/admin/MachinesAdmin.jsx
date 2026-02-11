import { useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiPost } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNavigate, useLocation } from 'react-router-dom';
import { categories as categoryList } from '../../data/machines.js';
import * as XLSX from 'xlsx';

const excelKeyMap = {
    machine_id: 'Machine_Id',
    id: 'Machine_Id',
    equipment: 'Equipment',
    description: 'Description',
    class: 'Class',
    license_plate_number: 'License_plate_Number',
    license_plate: 'License_plate_Number',
    license: 'License_plate_Number',
    machine_type: 'Machine_Type',
    company_code: 'Company_code',
    recipient: 'Recipient',
    status: 'Status',
    keyword: 'Keyword',
    note: 'Note',
};

export default function MachinesAdmin() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const navigate = useNavigate();
    const location = useLocation();
    const params = new URLSearchParams(location.search);
    const selectedCategory = params.get('category');
    const selectedClass = params.get('class');
    const { user } = useAuth();

    const [isAdminView, setIsAdminView] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const data = await apiGet('/api/admin/machines.php?limit=5000');
                setItems(data.items || []);
                setIsAdminView(true);
            } catch (e) {
                if (e.status === 401) {
                    try {
                        const publicData = await apiGet('/api/machines.php?limit=5000');
                        setItems(publicData.items || []);
                        setIsAdminView(false);
                        setError(null);
                    } catch (e2) {
                        setError(e2.message || 'Failed to load');
                    }
                } else {
                    setError(e.message || 'Failed to load');
                }
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const uniqueTypes = useMemo(() => {
        const set = new Set();
        items.forEach((it) => { if (it.Machine_Type) set.add(String(it.Machine_Type)); });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [items]);

    const uniqueClasses = useMemo(() => {
        const set = new Set();
        const catLower = selectedCategory ? String(selectedCategory).toLowerCase() : '';
        items.forEach((it) => {
            if (selectedCategory) {
                if (String(it.Machine_Type).toLowerCase() !== catLower) return;
            }
            if (it.Class !== undefined && it.Class !== null && String(it.Class) !== '') {
                set.add(String(it.Class));
            }
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }, [items, selectedCategory]);

    const [filterType, setFilterType] = useState('');
    const [filterClass, setFilterClass] = useState('');
    const [sortOrder, setSortOrder] = useState('az');
    const [editingId, setEditingId] = useState(null);
    const [editingData, setEditingData] = useState({});
    const fileInputRef = useRef(null);
    const [bulkStatus, setBulkStatus] = useState('');
    const [bulkUploading, setBulkUploading] = useState(false);

    useEffect(() => {
        const cat = selectedCategory;
        if (!cat) return;
        const target = String(cat).toLowerCase();
        if (uniqueTypes.length === 0) return;
        const match = uniqueTypes.find((t) => String(t).toLowerCase() === target);
        if (match) {
            setFilterType(match);
            return;
        }
        const catObj = categoryList.find((c) => String(c.id).toLowerCase() === target);
        if (catObj) {
            const titleLower = (catObj.title || '').toLowerCase();
            const match2 = uniqueTypes.find((t) => {
                const lower = String(t).toLowerCase();
                return lower === titleLower || lower.includes(titleLower);
            });
            if (match2) setFilterType(match2);
        }
    }, [selectedCategory, uniqueTypes]);

    const displayed = useMemo(() => {
        let out = items.slice();
        if (filterType) {
            out = out.filter((it) => String(it.Machine_Type) === filterType);
        }
        if (filterClass) {
            out = out.filter((it) => String(it.Class) === filterClass);
        }
        out.sort((a, b) => {
            const aLabel = (a.Equipment || a.Description || String(a.Machine_Id)).toString();
            const bLabel = (b.Equipment || b.Description || String(b.Machine_Id)).toString();
            return sortOrder === 'az'
                ? aLabel.localeCompare(bLabel, undefined, { sensitivity: 'base' })
                : bLabel.localeCompare(aLabel, undefined, { sensitivity: 'base' });
        });
        return out;
    }, [items, filterType, filterClass, sortOrder]);

    const apiPut = async (id, body) => {
        const res = await fetch('/api/admin/machines.php', {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ Machine_Id: id, ...body }),
        });
        if (!res.ok) throw new Error((await res.json()).error || res.statusText);
        return await res.json();
    };

    const apiDelete = async (id) => {
        const res = await fetch(`/api/admin/machines.php?id=${encodeURIComponent(id)}`, {
            method: 'DELETE',
            credentials: 'include',
        });
        if (!res.ok) throw new Error((await res.json()).error || res.statusText);
        return await res.json();
    };

    const handleCreate = async () => {
        if (!user) return;
        const code = prompt('รหัส/Equipment');
        if (!code) return;
        const desc = prompt('คำอธิบาย (Description)') || '';
        try {
            const res = await apiPost('/api/admin/machines.php', { Equipment: code, Description: desc });
            setItems((s) => [res.item, ...s]);
        } catch (e) {
            alert(e.message || 'Failed');
        }
    };

    const handleEdit = (m) => {
        setEditingId(m.Machine_Id);
        setEditingData({
            Equipment: m.Equipment || '',
            Description: m.Description || '',
            Class: m.Class || '',
            License_plate_Number: m.License_plate_Number || '',
        });
    };

    const handleSave = async () => {
        if (!editingId) return;
        try {
            const res = await apiPut(editingId, editingData);
            setItems((s) => s.map((it) => (it.Machine_Id === res.item.Machine_Id ? res.item : it)));
            setEditingId(null);
            setEditingData({});
        } catch (e) {
            alert(e.message || 'Update failed');
        }
    };

    const handleCancel = () => {
        setEditingId(null);
        setEditingData({});
    };

    const handleDelete = async (m) => {
        if (!confirm(`ลบเครื่อง ${m.Equipment || m.Machine_Id}?`)) return;
        try {
            await apiDelete(m.Machine_Id);
            setItems((s) => s.filter((it) => it.Machine_Id !== m.Machine_Id));
        } catch (e) {
            alert(e.message || 'Delete failed');
        }
    };

    const mapExcelKey = (rawKey) => {
        if (!rawKey) return null;
        const cleaned = rawKey.toString().trim();
        if (cleaned === 'Machine_Id') return 'Machine_Id';
        const slug = cleaned.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        return excelKeyMap[slug] || null;
    };

    const normalizeExcelRows = (rows) => {
        const updates = [];
        const inserts = [];
        rows.forEach((row) => {
            const normalized = {};
            Object.entries(row).forEach(([key, value]) => {
                const mapped = mapExcelKey(key);
                if (!mapped) return;
                if (mapped === 'Machine_Id') {
                    const id = Number(value);
                    if (!Number.isNaN(id) && id > 0) {
                        normalized.Machine_Id = id;
                    }
                    return;
                }
                if (value === null || typeof value === 'undefined') {
                    normalized[mapped] = '';
                    return;
                }
                normalized[mapped] = typeof value === 'number' && !Number.isNaN(value)
                    ? String(value)
                    : String(value).trim();
            });
            if (typeof normalized.Machine_Id === 'number' && normalized.Machine_Id > 0) {
                updates.push(normalized);
            } else if (normalized.Equipment && String(normalized.Equipment).trim() !== '') {
                normalized.Equipment = String(normalized.Equipment).trim();
                inserts.push(normalized);
            }
        });
        return { updates, inserts };
    };

    const handleExcelButton = () => {
        if (!isAdminView) return;
        fileInputRef.current?.click();
    };

    const handleExcelFile = async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        setBulkUploading(true);
        setBulkStatus('กำลังประมวลผลไฟล์...');
        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });
            if (!workbook.SheetNames.length) {
                throw new Error('ไม่พบชีตในไฟล์');
            }
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            const { updates, inserts } = normalizeExcelRows(rows);
            if (!updates.length && !inserts.length) {
                throw new Error('ไฟล์ต้องมี Machine_Id สำหรับการแก้ไข หรือ Equipment สำหรับเพิ่มใหม่อย่างน้อยหนึ่งรายการ');
            }
            const payload = {};
            if (updates.length) payload.items = updates;
            if (inserts.length) payload.newItems = inserts;
            const result = await apiPost('/api/admin/machines.php?action=bulk-update', payload);
            setItems((prev) => {
                const next = new Map(prev.map((item) => [item.Machine_Id, item]));
                (result.items || []).forEach((updated) => {
                    if (updated && updated.Machine_Id) {
                        next.set(updated.Machine_Id, updated);
                    }
                });
                return Array.from(next.values());
            });
            const updatedCnt = result.updated || 0;
            const insertedCnt = result.inserted || 0;
            const msgParts = [];
            if (updatedCnt) msgParts.push(`อัปเดต ${updatedCnt} รายการ`);
            if (insertedCnt) msgParts.push(`เพิ่มใหม่ ${insertedCnt} รายการ`);
            setBulkStatus(msgParts.length ? `สำเร็จ: ${msgParts.join(', ')}` : 'ไม่มีแถวใดถูกเปลี่ยนแปลง');
        } catch (err) {
            setBulkStatus(err.message || 'เกิดข้อผิดพลาดในการอัปโหลด');
        } finally {
            setBulkUploading(false);
            if (event.target) {
                event.target.value = '';
            }
        }
    };

    if (loading) {
        return (
            <div className="portal">
                <div className="loading-row">กำลังโหลดข้อมูล…</div>
            </div>
        );
    }

    if (!selectedCategory) {
        const counts = {};
        items.forEach((it) => {
            const t = String(it.Machine_Type || '').toLowerCase();
            if (!t) return;
            counts[t] = (counts[t] || 0) + 1;
        });

        return (
            <div className="portal">
                <div className="page-banner-wrapper">
                    <section className="page-banner page-banner--admin admin-machines-hero">
                        <div className="page-banner__content">
                            <p className="admin-eyebrow page-banner__eyebrow">ศูนย์ข้อมูลเครื่องจักร</p>
                            <h1 className="page-banner__title">หมวดหมู่เครื่องจักร (ADMIN)</h1>
                            <p className="page-banner__subtitle">แก้ไขข้อมูลและตรวจสอบเครื่องจักรทั้งหมด</p>
                        </div>
                        <div className="page-banner__actions admin-hero-actions">
                            <button className="button ghost" type="button" onClick={() => navigate('/admin')}>
                                ย้อนกลับ
                            </button>
                        </div>
                    </section>
                </div>
                <section className="categories-page">
                    {error && <div className="error-row">{error}</div>}
                    <div className="category-grid">
                        {categoryList.map((cat) => {
                            const cnt = counts[String(cat.id).toLowerCase()] || 0;
                            return (
                                <button
                                    key={cat.id}
                                    type="button"
                                    className="category-card"
                                    onClick={() => navigate(`/admin/machines?category=${encodeURIComponent(cat.id)}`)}
                                >
                                    {cat.image && <img src={cat.image} alt={cat.title} loading="lazy" />}
                                    <h3>{cat.title}</h3>
                                    <div className="muted">จำนวน: {cnt} คัน</div>
                                </button>
                            );
                        })}
                    </div>
                </section>
            </div>
        );
    }

    if (selectedCategory && !selectedClass) {
        const map = new Map();
        for (const r of items) {
            if (String(r.Machine_Type).toLowerCase() !== String(selectedCategory).toLowerCase()) continue;
            const cls = (r.Class || 'Unspecified') || 'Unspecified';
            const key = String(cls);
            const prev = map.get(key) || { cls: key, cnt: 0, keyword: '' };
            if (!prev.keyword && (r.Keyword || '').trim()) prev.keyword = String(r.Keyword).trim();
            prev.cnt += 1;
            map.set(key, prev);
        }
        const classesArr = Array.from(map.values()).sort((a, b) => a.cls.localeCompare(b.cls));
        const catTitle = (categoryList.find((c) => String(c.id) === String(selectedCategory))?.title) || selectedCategory;

        return (
            <div className="portal">
                <div className="page-banner-wrapper">
                    <section className="page-banner page-banner--admin admin-machines-hero">
                        <div className="page-banner__content">
                            <p className="admin-eyebrow page-banner__eyebrow">หมวดหมู่ {catTitle}</p>
                            <h1 className="page-banner__title">เลือกคลาสเครื่องจักร</h1>
                            <p className="page-banner__subtitle">ระบุคลาสเพื่อดูจำนวนเครื่องจักรและเข้าสู่หน้าจัดการเชิงลึก</p>
                        </div>
                        <div className="page-banner__actions admin-hero-actions">
                            <button className="button ghost" type="button" onClick={() => navigate('/admin/machines')}>
                                ย้อนกลับ
                            </button>
                        </div>
                    </section>
                </div>
                <section className="classes-page">
                    <div className="category-grid">
                        {classesArr.map((c) => (
                            <button
                                key={c.cls}
                                type="button"
                                className="category-card"
                                onClick={() => navigate(`/admin/machines?category=${encodeURIComponent(selectedCategory)}&class=${encodeURIComponent(c.cls)}`)}
                            >
                                <h3>{c.cls}</h3>
                                <p>({c.keyword})</p>
                                <div className="muted">จำนวน: {c.cnt} คัน</div>
                            </button>
                        ))}
                        {(!loading && classesArr.length === 0) && <div>ไม่พบคลาสสำหรับหมวดนี้</div>}
                    </div>
                </section>
            </div>
        );
    }

    const machinesForClass = items.filter((m) => {
        if (selectedCategory && String(m.Machine_Type).toLowerCase() !== String(selectedCategory).toLowerCase()) return false;
        if (selectedClass && String(m.Class) !== String(selectedClass)) return false;
        return true;
    }).sort((a, b) => {
        const aLabel = (a.Equipment || a.Description || String(a.Machine_Id)).toString();
        const bLabel = (b.Equipment || b.Description || String(b.Machine_Id)).toString();
        return sortOrder === 'az'
            ? aLabel.localeCompare(bLabel, undefined, { sensitivity: 'base' })
            : bLabel.localeCompare(aLabel, undefined, { sensitivity: 'base' });
    });

    return (
        <div className="portal">
            <div className="page-banner-wrapper">
                <section className="page-banner page-banner--admin admin-machines-hero">
                    <div className="page-banner__content">
                        <p className="admin-eyebrow page-banner__eyebrow">
                            หมวด {selectedCategory || '-'}{selectedClass ? ` · คลาส ${selectedClass}` : ''}
                        </p>
                        <h1 className="page-banner__title">จัดการเครื่องจักร</h1>
                        <p className="page-banner__subtitle">
                            {isAdminView
                                ? 'อัปเดตรายการเครื่องจักร แก้ไขข้อมูล และอัปโหลดไฟล์สรุปได้จากที่นี่'
                                : 'กำลังแสดงแบบอ่านอย่างเดียว เนื่องจากบัญชีนี้ไม่มีสิทธิ์ admin'}
                        </p>
                    </div>
                    <div className="page-banner__actions admin-hero-actions">
                        <button
                            className="button ghost"
                            type="button"
                            onClick={() => navigate(`/admin/machines?category=${encodeURIComponent(selectedCategory)}`)}
                        >
                            ย้อนกลับ
                        </button>
                        {isAdminView ? (
                            <>
                                <button className="button primary" type="button" onClick={handleExcelButton} disabled={bulkUploading}>
                                    {bulkUploading ? 'กำลังอัปโหลด…' : 'อัปโหลด Excel/CSV'}
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".xlsx,.xls,.csv"
                                    style={{ display: 'none' }}
                                    onChange={handleExcelFile}
                                />
                            </>
                        ) : (
                            <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>โหมดอ่านอย่างเดียว</span>
                        )}
                    </div>
                </section>
            </div>
            <section>
                {error && <div className="error-row">{error}</div>}
                {isAdminView && bulkStatus && (
                    <p className="text-muted" style={{ marginTop: 8 }}>{bulkStatus}</p>
                )}
                <ul className="machine-list">
                    {machinesForClass.map((machine) => (
                        <li key={machine.Machine_Id}>
                            <div
                                className="machine-link"
                                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                onClick={() => {
                                    const parts = [];
                                    if (selectedCategory) parts.push(`category=${encodeURIComponent(selectedCategory)}`);
                                    if (selectedClass) parts.push(`class=${encodeURIComponent(selectedClass)}`);
                                    parts.push('admin=1');
                                    const qs = parts.length ? `?${parts.join('&')}` : '';
                                    navigate(`/machines/${machine.Machine_Id}${qs}`);
                                }}
                            >
                                {editingId === machine.Machine_Id ? (
                                    <>
                                        <div style={{ flex: 1 }} onClick={(e) => e.stopPropagation()}>
                                            <input
                                                style={{ width: '100%', marginBottom: 6 }}
                                                value={editingData.Equipment || ''}
                                                onChange={(e) => setEditingData((s) => ({ ...s, Equipment: e.target.value }))}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                            <input
                                                style={{ width: '100%', marginBottom: 6 }}
                                                value={editingData.Description || ''}
                                                onChange={(e) => setEditingData((s) => ({ ...s, Description: e.target.value }))}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                            <input
                                                style={{ width: '48%', marginRight: '4%' }}
                                                value={editingData.Class || ''}
                                                onChange={(e) => setEditingData((s) => ({ ...s, Class: e.target.value }))}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                            <input
                                                style={{ width: '48%' }}
                                                value={editingData.License_plate_Number || ''}
                                                onChange={(e) => setEditingData((s) => ({ ...s, License_plate_Number: e.target.value }))}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                                            <button className="button primary" onClick={handleSave}>บันทึก</button>
                                            <button className="button" onClick={handleCancel}>ยกเลิก</button>
                                            <button className="button primary" onClick={() => handleDelete(machine)}>ลบ</button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div>
                                            <h3 style={{ margin: 0 }}>{(machine.Equipment || `#${machine.Machine_Id}`).toString()}</h3>
                                            <p style={{ margin: 0 }}>{machine.Description || '-'}</p>
                                            <small style={{ color: '#666' }}>
                                                {machine.Machine_Type
                                                    ? `ประเภท: ${categoryList.find((c) => c.id === String(machine.Machine_Type))?.title || machine.Machine_Type}`
                                                    : ''}
                                                {machine.Class ? ` · Class: ${machine.Class}` : ''}
                                            </small>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                                            {isAdminView && (
                                                <button className="button primary" onClick={() => handleDelete(machine)}>ลบ</button>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        </li>
                    ))}
                    {machinesForClass.length === 0 && <li className="empty-row">ไม่มีข้อมูล</li>}
                </ul>
            </section>
        </div>
    );
}
