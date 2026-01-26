import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function AdminDashboard() {
    const navigate = useNavigate();

    const actionCards = [
        { id: 'machines', title: 'เครื่องจักร (Machines)', cta: 'ดูเครื่องจักร', icon: 'https://cdn-icons-png.flaticon.com/512/11242/11242072.png', description: 'ดู/แก้ไขรายการเครื่องจักร', to: '/admin/machines' },
        { id: 'users', title: 'ผู้ใช้งาน (Users)', cta: 'เพิ่มผู้ใช้', icon: 'https://cdn-icons-png.flaticon.com/512/456/456212.png', description: 'เพิ่มและจัดการสิทธิ์ผู้ใช้งาน', to: '/admin/users' },
        { id: 'users-directory', title: 'ภาพรวมผู้ใช้งาน', cta: 'ดูทั้งหมด', icon: 'https://cdn-icons-png.flaticon.com/512/747/747376.png', description: 'ดูข้อมูลและสถานะของผู้ใช้ทั้งหมด', to: '/admin/users/all' },
        { id: 'reports', title: 'รายงาน (Reports)', cta: 'จัดการรายงาน', icon: 'https://cdn-icons-png.flaticon.com/512/1828/1828911.png', description: 'ดูและจัดการรายงานปัญหา', to: '/admin/reports' },
        { id: 'oil-log', title: 'บันทึกน้ำมัน (Oil Logs)', cta: 'บันทึกน้ำมัน', icon: 'https://cdn-icons-png.flaticon.com/512/2966/2966425.png', description: 'บันทึกการเติมน้ำมัน/เช็คสต็อก', to: '/admin/oillogs' },
        { id: 'checklist-viewer', title: 'ตรวจแบบฟอร์ม (Checklist)', cta: 'เปิดแบบฟอร์ม', icon: 'https://cdn-icons-png.flaticon.com/512/942/942748.png', description: 'เปิดดูแบบฟอร์มตรวจเช็ก (อ่านอย่างเดียว)', to: '/checklist' },
        // { id: 'print', title: 'พิมพ์แบบฟอร์ม (Print)', cta: 'พิมพ์แบบฟอร์ม', icon: 'https://cdn-icons-png.flaticon.com/512/942/942748.png', description: 'พรีวิวและพิมพ์แบบฟอร์มตรวจเช็ก', to: '/admin/print' },
    ];

    const { logout } = useAuth();

    const handleLogout = async (e) => {
        e?.preventDefault();
        // call shared logout so app state updates immediately
        try {
            await logout();
        } catch (err) {
            // ignore
        }
        navigate('/login', { replace: true });
    };

    return (
        <div className="portal admin-dashboard">
            <section>
                <div className="page-banner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2>Admin Dashboard</h2>
                        <p className="text-muteds" color='#ffffff'>แผงควบคุมสำหรับผู้ดูแลระบบ</p>
                    </div>
                    <div>
                        <button className="button" onClick={handleLogout} style={{ marginLeft: 12 }}>
                            ออกจากระบบ
                        </button>
                    </div>
                </div>
        
                <section className="action-card-grid">
                    {actionCards.map((card) => (
                        <button type="button" className="action-card" key={card.id} onClick={() => navigate(card.to)}>
                            <img src={card.icon} alt="icon" />
                            <div>
                                <h3>{card.title}</h3>
                                <p>{card.description}</p>
                                <span className="category-link">{card.cta}</span>
                            </div>
                        </button>
                    ))}
                </section>
            </section>
        </div>
    );
}
