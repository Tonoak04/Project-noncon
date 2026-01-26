import { useNavigate } from 'react-router-dom';
import AccountBar from '../components/AccountBar.jsx';

export default function Dashboard() {
    const navigate = useNavigate();

    return (
        <div className="home-hero">
            <div className="home-hero-menu" aria-hidden="false">
                <AccountBar />
            </div>
            <div className="hero-content">
                <button type="button" className="hero-cta" onClick={() => navigate('/worksite')}>
                    เข้าสู่ระบบเครื่องจักร
                </button>
            </div>
        </div>
    );
}
