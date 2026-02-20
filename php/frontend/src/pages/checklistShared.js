export const DAY_COLUMNS = Array.from({ length: 31 }, (_, index) => index + 1);

export const STATUS_OPTIONS = [
    { value: '', label: '-' },
    { value: 'ปกติ', label: '✓ ปกติ' },
    { value: 'ผิดปกติ', label: '✗ ผิดปกติ' },
    { value: 'S', label: 'S (Stand by)' },
    { value: 'B', label: 'B (จอดซ่อม)' },
];

export const LEGEND = [
    { symbol: '✓', label: 'ปกติ' },
    { symbol: '✗', label: 'ผิดปกติ' },
    { symbol: 'S', label: 'กรณีเครื่องจักร จอด Stand by' },
    { symbol: 'B', label: 'กรณีเครื่องจักรเสีย จอดซ่อม' },
];

export const BASE_DEPARTMENT_OPTIONS = ['11', '22', '33', '44', '55', '66', '77', '88'];

export const COMPANY_TITLE = 'บริษัท ซีวิลอนดีนชิง จำกัด (มหาชน) และกลุ่มบริษัทในเครือ';
export const FORM_TITLE = 'การบำรุงรักษาประจำวัน (Daily Preventive Maintenance)';
export const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const STATUS_SYMBOL_MAP = {
    ปกติ: '✓',
    ผิดปกติ: '✗',
    S: 'S',
    B: 'B',
};

export const CHECKLIST_ITEMS = [
    { order: 1, topic: 'ระดับน้ำมันเครื่อง', method: 'อยู่ระดับที่กำหนด', frequency: 'รายวัน' },
    { order: 2, topic: 'เช็กระดับสารหล่อเย็นหม้อน้ำ', method: 'อยู่ระดับที่กำหนด', frequency: 'รายวัน' },
    { order: 3, topic: 'ตรวจดูรอยรั่วซึมระบบเครื่องยนต์', method: 'ไม่มีการรั่วซึมของน้ำมัน', frequency: 'รายวัน' },
    { order: 4, topic: 'เช็คระดับน้ำมันไฮดรอลิก', method: 'อยู่ระดับที่กำหนด', frequency: 'รายวัน' },
    { order: 5, topic: 'เช็คกรองดักน้ำและDrain น้ำทิ้ง', method: 'อยู่ระดับที่กำหนด', frequency: 'รายวัน' },
    { order: 6, topic: 'เช็ค/อัดจารบีตามจุดข้อต่อและจุดหมุนต่างๆ', method: 'อัดจารบีทุกจุด', frequency: 'รายวัน' },
    { order: 7, topic: 'เช็คสภาพยางและแรงลมยาง', method: 'สภาพพร้อมใช้งาน', frequency: 'รายวัน' },
    { order: 8, topic: 'เช็คความตึงโซ่แทร็คและโรลเลอร์ต่างๆ', method: 'ไม่สึกหรอ,ไม่ตึง-หย่อนเกินไป', frequency: 'รายวัน' },
    { order: 9, topic: 'เช็คการรั่วซึมกระบอกไฮดรอลิกต่างๆ', method: 'ไม่มีการรั่วซึมของน้ำมัน', frequency: 'รายวัน' },
    { order: 10, topic: 'เช็คการทำงานระบบไฟฟ้าและสัญญานไฟต่างๆ', method: 'ใช้งานได้ปกติ', frequency: 'รายวัน' },
    { order: 11, topic: 'เช็คสภาพอุปกรณ์ เช่น ปุ้งกี้,เล็บขุด,ใบมีดฯลฯ', method: 'ใช้งานได้ปกติ', frequency: 'รายวัน' },
    { order: 12, topic: 'เช็คสภาพตัวรถและอุปกรณ์เสริม เช่นกระบะตัวถังฯลฯ', method: 'ใช้งานได้ปกติ', frequency: 'รายวัน' },
    { order: 13, topic: 'เช็คระดับสารละลายในแบตเตอรี่', method: 'อยู่ระดับที่กำหนด', frequency: 'รายสัปดาห์' },
    { order: 14, topic: 'เช็คสภาพ/ความดึงสายพานต่างๆหน้าเครื่องยนต์', method: 'สภาพดี,ไม่ตึง-หย่อนเกินไป', frequency: 'รายสัปดาห์' },
    { order: 15, topic: 'ทำความสะอาด/เป่าไส้กรองอากาศ', method: 'ไม่เสียรูป', frequency: 'รายสัปดาห์' },
];

export const SIGNATURE_ROWS = [
    {
        order: '',
        topic: 'ผู้ตรวจสอบ/พขร.',
        method: 'ลงชื่อ',
        frequency: 'รายวัน',
        isSignature: true,
        signatureRole: 'driver',
    },
    {
        order: '',
        topic: 'โฟร์แมนผู้ตรวจสอบ',
        method: 'ลงชื่อ',
        frequency: 'รายวัน',
        isSignature: true,
        signatureRole: 'foreman',
    },
];

export const CHECKLIST_TABLE_STYLES = `
    .checklist-table-wrapper {
        overflow-x: auto;
        position: relative;
    }

    .checklist-table {
        border-collapse: separate;
        border-spacing: 0;
    }

    .checklist-table thead th {
        position: sticky;
        top: 0;
        z-index: 10000;
        background: var(--bg-panel, #fff);
    }

    .checklist-table th.col-order,
    .checklist-table td.col-order {
        position: sticky;
        left: 0;
        z-index: 10010;
        background: var(--bg-panel, #fff);
        width: 56px;
        min-width: 40px;
        max-width: 56px;
        text-align: center;
        box-shadow: 2px 0 8px rgba(12, 34, 56, 0.08);
        transform: translateZ(0);
        will-change: transform;
    }

    .checklist-table th.col-topic,
    .checklist-table td.col-topic {
        position: sticky;
        left: 47px;
        z-index: 10011;
        background: var(--bg-panel, #fff);
        width: 50px;
        min-width: 47px;
        text-align: left;
        padding-left: 0.5rem;
        box-shadow: 2px 0 8px rgba(12, 34, 56, 0.08);
        transform: translateZ(0);
        will-change: transform;
    }

    .checklist-table th.col-method,
    .checklist-table td.col-method {
        position: sticky;
        left: 115px;
        z-index: 10012;
        background: var(--bg-panel, #fff);
        width: 120px;
        min-width: 65px;
        text-align: left;
        padding-left: 0.5rem;
        box-shadow: 2px 0 8px rgba(12, 34, 56, 0.08);
        transform: translateZ(0);
        will-change: transform;
    }

    .checklist-table th.col-frequency,
    .checklist-table td.col-frequency {
        position: sticky;
        left: 182px;
        z-index: 10013;
        background: var(--bg-panel, #fff);
        width: 120px;
        min-width: 40px;
        text-align: center;
        box-shadow: 2px 0 8px rgba(12, 34, 56, 0.08);
        transform: translateZ(0);
        will-change: transform;
    }

    .checklist-table th,
    .checklist-table td {
        background-clip: padding-box;
        background: var(--bg-panel, #fff);
    }

    .checklist-page--admin {
        background: #f4f7fb;
        min-height: 100vh;
        padding-bottom: 2rem;
    }

    .admin-hero-banner {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1.5rem;
        padding: 1.5rem;
        border-radius: 18px;
        background: linear-gradient(135deg, #0f172a, #1e3a8a);
        color: #0f233a;
        margin-bottom: 1.25rem;
        box-shadow: 0 20px 45px rgba(15, 23, 42, 0.25);
    }

    .admin-eyebrow {
        font-size: 0.85rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        opacity: 0.8;
        margin-bottom: 0.35rem;
    }

    .admin-hero-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .admin-search-card {
        background: #fff;
        border-radius: 18px;
        padding: 1.25rem 1.5rem;
        margin-bottom: 1.25rem;
        box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08);
        border: 1px solid rgba(15, 23, 42, 0.08);
    }

    .admin-search-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 1rem;
        margin-bottom: 1.25rem;
    }

    .admin-search-field {
        min-height: 100%;
    }

    .admin-search-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
    }

    .admin-search-status {
        font-size: 0.9rem;
        color: #475467;
    }

    .admin-result-card {
        background: #fff;
        border-radius: 16px;
        padding: 1.25rem 1.5rem;
        margin-bottom: 1.5rem;
        border: 1px solid rgba(15, 23, 42, 0.08);
        box-shadow: 0 18px 35px rgba(15, 23, 42, 0.08);
        display: flex;
        flex-wrap: wrap;
        gap: 1.25rem;
        justify-content: space-between;
    }

    .admin-result-label {
        font-size: 0.8rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #475467;
        margin-bottom: 0.35rem;
    }

    .admin-result-summary {
        display: flex;
        flex-wrap: wrap;
        gap: 1.5rem;
    }

    .admin-result-summary strong {
        display: block;
        font-size: 1.35rem;
        color: #0f172a;
    }

    .admin-result-summary span {
        font-size: 0.85rem;
        color: #475467;
    }

    .admin-result-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: flex-start;
    }

    .admin-empty-state {
        padding: 1.5rem;
        border-radius: 18px;
        background: #fff;
        border: 1px dashed rgba(15, 23, 42, 0.2);
        color: #475467;
        text-align: center;
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.05);
    }

    @media (max-width: 768px) {
        .admin-hero-banner {
            flex-direction: column;
        }

        .admin-result-card {
            flex-direction: column;
        }

        .admin-result-summary {
            flex-direction: column;
        }
    }
`;

export const defaultMetaForm = () => {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return {
        machineCode: '',
        department: '',
        date,
        period,
    };
};

export const formatUserName = (user = {}) => {
    const primary = `${user.name ?? ''} ${user.lastname ?? ''}`.trim();
    if (primary) {
        return primary;
    }
    return user.displayName || user.Username || user.username || '';
};

export const normalizeMachineRow = (row = {}) => {
    const code = (row.Equipment || row.Machine_Id || '').toString().trim();
    if (!code) {
        return null;
    }
    const description = (row.Description || row.Name || '').trim();
    const label = description ? `${code} · ${description}` : code;
    return {
        value: code,
        label,
        id: row.Machine_Id ? Number(row.Machine_Id) : null,
        type: row.Machine_Type || row.Class || '-',
        department: row.CenterName || row.Department || '',
        description,
    };
};

export const mapSignatureValues = (values = {}) => {
    const entries = Object.entries(values || {});
    const dataset = { values: {}, labels: {} };
    if (entries.length === 0) {
        return dataset;
    }
    entries.forEach(([day, entry]) => {
        if (typeof entry === 'string') {
            dataset.values[day] = entry;
            dataset.labels[day] = entry;
        } else if (entry && typeof entry === 'object') {
            const value = entry.value ?? entry.signature ?? '';
            const label = entry.signature ?? entry.value ?? '';
            dataset.values[day] = value || '';
            dataset.labels[day] = label || '';
        } else {
            dataset.values[day] = '';
            dataset.labels[day] = '';
        }
    });
    return dataset;
};

export const resolveSignatureDisplay = (value, options, fallbackLabel = '') => {
    if (value) {
        const match = options.find((option) => option.value === value);
        if (match) {
            return match.label;
        }
    }
    if (fallbackLabel) {
        return fallbackLabel;
    }
    return value || '';
};

export const normalizeChecklistMatrix = (matrix = {}) => {
    const normalized = {};
    Object.entries(matrix || {}).forEach(([day, items]) => {
        const dayKey = String(day);
        normalized[dayKey] = {};
        Object.entries(items || {}).forEach(([order, value]) => {
            normalized[dayKey][Number(order)] = value || '';
        });
    });
    return normalized;
};

export const buildChecklistLocks = (matrix = {}) => {
    const locks = new Set();
    Object.entries(matrix || {}).forEach(([day, items]) => {
        Object.entries(items || {}).forEach(([order, value]) => {
            if (value) {
                locks.add(`${day}:${order}`);
            }
        });
    });
    return locks;
};

export const formatStatusForExport = (value) => STATUS_SYMBOL_MAP[value] || value || '';

export const formatSignatureForExport = (value) => {
    if (!value) {
        return '';
    }
    return value === 'signed' ? 'ลงชื่อ' : value;
};

export const formatPeriodLabel = (period) => {
    if (!period) {
        return '-';
    }
    const [year, month] = period.split('-');
    const monthIndex = Number(month) - 1;
    const thaiYear = Number(year) + 543;
    const monthLabel = THAI_MONTHS[monthIndex] || month;
    return `${monthLabel} ${Number.isNaN(thaiYear) ? year : thaiYear}`;
};

export const formatThaiDateValue = (value) => {
    if (!value) {
        return '-';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleDateString('th-TH', { dateStyle: 'medium' });
};

export const sanitizeFilename = (value) => {
    if (!value) {
        return 'checklist';
    }
    return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'checklist';
};
