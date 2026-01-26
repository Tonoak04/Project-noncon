import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { apiGet } from '../api.js';
import { categories as localCategories } from '../data/machines.js';

export default function Categories() {
    const navigate = useNavigate();
    const [types, setTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        (async () => {
            try {
                const data = await apiGet('/api/categories.php');
                setTypes(data.types || []);
            } catch (e) {
                setError(e.message || 'ไม่สามารถโหลดหมวดหมู่ได้');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const handleSelect = (type) => {
        navigate(`/classes?category=${encodeURIComponent(type)}`);
    };

    return (
        <div className="portal">
            <section className="categories-page">
                <div className="page-banner">
                    <Link to="/worksite" className="back-link">
                        ย้อนกลับ
                    </Link>
                    <h2>หมวดหมู่เครื่องจักร</h2>
                </div>

                {loading && <div>กำลังโหลดหมวดหมู่...</div>}
                {error && <div className="error-row">{error}</div>}

                <div className="category-grid">
                    {localCategories.map((cat) => {
                        const matched = types.find((t) => (t.type || '').toLowerCase().includes((cat.id || '').toLowerCase()));
                        const cnt = matched ? matched.cnt : 0;
                        return (
                            <button
                                key={cat.id}
                                type="button"
                                className="category-card"
                                onClick={() => handleSelect(cat.id)}
                            >
                                {cat.image2 ? (
                                    <div className="image-pair">
                                        <img src={cat.image} alt={`${cat.title} 1`} loading="lazy" />
                                        <img src={cat.image2} alt={`${cat.title} 2`} loading="lazy" />
                                    </div>
                                ) : (
                                    <img src={cat.image} alt={cat.title} loading="lazy" />
                                )}
                                <h3 style={{ fontSize: "17px" }}>{cat.title}</h3>
                                <div className="muted" style={{ fontSize: "14px" }}>จำนวน: {cnt} คัน</div>
                            </button>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
