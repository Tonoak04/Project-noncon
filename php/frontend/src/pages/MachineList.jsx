import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiGet } from '../api.js';
import { categories as localCategories } from '../data/machines.js';

export default function MachineList() {
    const [keyword, setKeyword] = useState('');
    const [params] = useSearchParams();
    const selectedCategoryId = params.get('category');
    const selectedClassParam = params.get('class');

    const categoryTitle = useMemo(() => {
        if (!selectedCategoryId) return null;
        const id = String(selectedCategoryId).toLowerCase();
        const found = localCategories.find((c) => (c.id || '').toLowerCase() === id || id.includes((c.id || '').toLowerCase()) || (c.id || '').toLowerCase().includes(id));
        if (found) return found.title;
        return selectedCategoryId.charAt(0).toUpperCase() + selectedCategoryId.slice(1);
    }, [selectedCategoryId]);

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    

    useEffect(() => {
        (async () => {
            try {
                const data = await apiGet('/api/machines.php');
                const normalized = (data.items || []).map((row) => ({
                    id: row.Machine_Id,
                    code: row.Equipment || String(row.Machine_Id),
                    plate: row.License_plate_Number || '-',
                    com: row.Company_code  || '-',
                    machineType: (row.Machine_Type || '').toString(),
                    machineClass: (row.Class || '').toString(),
                }));
                normalized.sort((a, b) => (a.id || 0) - (b.id || 0));
                setItems(normalized);
                setLoading(false);
            } catch (e) {
                setError(e.message || 'Failed to load');
                setLoading(false);
            }
        })();
    }, []);

    const filtered = useMemo(() => {
        const term = keyword.trim().toLowerCase();
        let base = items;
        if (selectedCategoryId) {
            const needle = selectedCategoryId.toLowerCase();
            base = base.filter((it) => (it.machineType || '').toLowerCase().includes(needle));
        }
        if (selectedClassParam) {
            const clsNeedle = selectedClassParam.trim().toLowerCase();
            base = base.filter((it) => (it.machineClass || '').toLowerCase() === clsNeedle);
        }
        if (!term) return base;
        return base.filter((item) => (
            item.code.toLowerCase().includes(term) ||
            item.plate.toLowerCase().includes(term) ||
            item.com.toLowerCase().includes(term)
        ));
    }, [keyword, items, selectedCategoryId, selectedClassParam]);

    const backTarget = selectedCategoryId ? `/classes?category=${encodeURIComponent(selectedCategoryId)}` : '/';

    return (
        <div className="portal">
            <section>
                <div className="page-banner">
                    <Link to={backTarget} className="back-link">
                        ย้อนกลับ
                    </Link>
                    <h2>ข้อมูลเครื่องจักร</h2>
                    {categoryTitle && <div className="chip">หมวด: {categoryTitle}</div>}
                </div>
                <p className="text-muted">สามารถกรอกรหัสรถหรือป้ายทะเบียนเพื่อค้นหาข้อมูลได้</p>
                <div className="search-row">
                    <input
                        type="text"
                        placeholder="ค้นหา"
                        value={keyword}
                        onChange={(event) => setKeyword(event.target.value)}
                    />
                    <button className="icon-btn" aria-label="ค้นหา">
                        🔍
                    </button>
                </div>
                {loading && <div className="loading-row">กำลังโหลดข้อมูล…</div>}
                {error && <div className="error-row">{error}</div>}
                <ul className="machine-list">
                    {filtered.map((machine) => (
                        <li key={machine.id}>
                            <Link
                                to={{
                                    pathname: `/machines/${machine.id}`,
                                    search: selectedCategoryId ? `?category=${selectedCategoryId}${selectedClassParam ? `&class=${encodeURIComponent(selectedClassParam)}` : ''}` : undefined,
                                }}
                                className="machine-link"
                            >
                                <div>
                                    <h3>{machine.code}</h3>
                                    <p>{machine.plate}</p>
                                    <span>{machine.com}</span>
                                </div>
                                <span className="chevron">›</span>
                            </Link>
                        </li>
                    ))}
                    {filtered.length === 0 && <li className="empty-row">ไม่พบข้อมูล</li>}
                </ul>
            </section>
        </div>
    );
}
