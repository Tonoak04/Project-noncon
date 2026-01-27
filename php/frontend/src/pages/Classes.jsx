import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { apiGet } from '../api.js';
import { categories as localCategories } from '../data/machines.js';

export default function Classes() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const category = params.get('category') || '';
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [classes, setClasses] = useState([]);

    useEffect(() => {
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await apiGet('/api/machines.php');
                const items = data.items || [];
                const needle = (category || '').toLowerCase();
                const map = new Map();
                for (const r of items) {
                    const type = (r.Machine_Type || '').toLowerCase();
                    if (needle && !type.includes(needle)) continue;
                    const cls = (r.Class || 'Unspecified') || 'Unspecified';
                    const key = String(cls);
                    const prev = map.get(key) || { cls: key, cnt: 0, keyword: '' };
                    if (!prev.keyword && (r.Keyword || '').trim()) {
                        prev.keyword = String(r.Keyword).trim();
                    }
                    prev.cnt += 1;
                    map.set(key, prev);
                }
                const arr = Array.from(map.values()).sort((a, b) => a.cls.localeCompare(b.cls));
                setClasses(arr);
            } catch (e) {
                setError(e.message || 'ไม่สามารถโหลดข้อมูลคลาสได้');
            } finally {
                setLoading(false);
            }
        })();
    }, [category]);

    const categoryTitle = useMemo(() => {
        if (!category) return null;
        const id = String(category).toLowerCase();
        const found = localCategories.find((c) => (c.id || '').toLowerCase() === id || id.includes((c.id || '').toLowerCase()) || (c.id || '').toLowerCase().includes(id));
        return found ? found.title : (category.charAt(0).toUpperCase() + category.slice(1));
    }, [category]);

    if (!category) {
        return (
            <div className="portal">
                <section>
                    <div className="panel-header">
                        <Link to="/categories" className="ghost-btn">ย้อนกลับ</Link>
                        <h2>คลาส</h2>
                    </div>
                    <p>ไม่มีหมวดหมู่ระบุ กรุณาเลือกหมวดหมู่ก่อน</p>
                </section>
            </div>
        );
    }

    return (
        <div className="portal">
            <section className="classes-page">
                <div className="page-banner">
                    <Link to="/categories" className="back-link">ย้อนกลับ</Link>
                    <h2>{categoryTitle}</h2>
                </div>

                {loading && <div className="loading-row">กำลังโหลดคลาส…</div>}
                {error && <div className="error-row">{error}</div>}

                <div className="category-grid">
                    {classes.map((c) => (
                        <button
                            key={c.cls}
                            type="button"
                            className="category-card"
                            onClick={() => navigate(`/machines?category=${encodeURIComponent(category)}&class=${encodeURIComponent(c.cls)}`)}
                        >
                            <h3 style={{ fontSize: '17px' }}>{c.cls}</h3>
                            <p style={{ fontSize: '15px' }}>( {c.keyword} )</p>
                            <div className="muted" style={{ fontSize: '15px' }}>จำนวน: {c.cnt} คัน</div>
                        </button>
                    ))}
                    {(!loading && classes.length === 0) && <div>ไม่พบคลาสสำหรับหมวดนี้</div>}
                </div>
            </section>
        </div>
    );
}
