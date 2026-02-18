import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function AdminDashboard() {
    const navigate = useNavigate();

    const actionCards = [
        { id: 'machines', title: 'เครื่องจักร (Machines)', cta: 'ดูเครื่องจักร', icon: 'https://cdn-icons-png.flaticon.com/512/11242/11242072.png', description: 'ดู/แก้ไขรายการเครื่องจักร', to: '/admin/machines' },
        { id: 'users', title: 'เพิ่มผู้ใช้งาน (Add Users)', cta: 'เพิ่มผู้ใช้', icon: 'https://cdn-icons-png.flaticon.com/512/456/456212.png', description: 'เพิ่มและจัดการสิทธิ์ผู้ใช้งาน', to: '/admin/users' },
        { id: 'users-directory', title: 'รายชื่อผู้ใช้งาน (Users)', cta: 'ดูทั้งหมด', icon: 'https://cdn-icons-png.flaticon.com/512/747/747376.png', description: 'ดูข้อมูลและสถานะของผู้ใช้ทั้งหมด', to: '/admin/users/all' },
        { id: 'reports', title: 'รายงาน (Reports)', cta: 'จัดการรายงาน', icon: 'https://cdn-icons-png.flaticon.com/512/9824/9824404.png', description: 'ดูและจัดการรายงานปัญหา', to: '/admin/reports' },
        { id: 'oil-log', title: 'บันทึกน้ำมัน / บันทึกรถ (Oil Logs / Vehicle Logs)', cta: 'ดูข้อมูล', icon: 'https://cdn-icons-png.flaticon.com/512/2051/2051289.png', description: 'ดูข้อมูลการบันทึกน้ำมันและบันทึกรถ', to: '/admin/oillogs' },
        { id: 'checklist', title: 'ตรวจแบบฟอร์มรถ (Checklist)', cta: 'เปิดแบบฟอร์ม', icon: 'https://cdn-icons-png.flaticon.com/512/942/942748.png', description: 'เปิดและบันทึกแบบฟอร์มตรวจเช็กรถ', to: '/admin/checklist' },
    ];

    const { logout } = useAuth();

    const handleLogout = async (e) => {
        e?.preventDefault();
        try {
            await logout();
        } catch (err) {
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
