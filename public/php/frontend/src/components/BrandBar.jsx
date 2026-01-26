import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import useScrollHide from '../hooks/useScrollHide.js';
import AccountBar from './AccountBar.jsx';

export default function BrandBar() {
    const location = useLocation();
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();
    const isHidden = useScrollHide();

    const visiblePaths = ['/worksite'];

    if (!isAuthenticated || !visiblePaths.includes(location.pathname)) {
        return null;
    }

    return (
        <div className={`app-brand-bar${isHidden ? ' is-hidden' : ''}`}>
            <button type="button" className="brand-back" onClick={() => navigate('/')}
                aria-label="ย้อนกลับไปหน้า main">
                ย้อนกลับ
            </button>
            <span className="brand-label" aria-hidden="false">
                ระบบเครื่องจักร
            </span>
            <AccountBar />
        </div>
    );
}
