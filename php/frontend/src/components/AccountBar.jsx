import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const HIDDEN_PATHS = ['/login'];
const VISIBLE_PATHS = ['/worksite', '/'];

export default function AccountBar() {
    const { isAuthenticated, logout, user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);

    const hasRole = (roleName) => {
        const roles = Array.isArray(user?.roles) && user.roles.length
            ? user.roles
            : (user?.role ? [user.role] : []);
        return roles.some((role) => typeof role === 'string' && role.toLowerCase() === roleName);
    };

    useEffect(() => {
        setMenuOpen(false);
    }, [location.pathname]);

    const isHiddenPath = HIDDEN_PATHS.includes(location.pathname);
    const isVisible = VISIBLE_PATHS.includes(location.pathname);

    if (!isAuthenticated || isHiddenPath || !isVisible) {
        return null;
    }

    const handleLogout = () => {
        logout();
        navigate('/login', { replace: true });
    };

    return (
        <div className="account-bar">
            <button
                type="button"
                className="menu-toggle"
                onClick={() => setMenuOpen(true)}
                aria-haspopup="true"
                aria-expanded={menuOpen}
                aria-label="เปิดเมนู"
            >
                <span />
                <span />
                <span />
            </button>
            {menuOpen && (
                <div className="account-overlay" role="dialog" aria-modal="true">
                    <button type="button" className="overlay-close" onClick={() => setMenuOpen(false)} aria-label="ปิดเมนู">
                        ×
                    </button>
                    {user && hasRole('admin') && (
                        <button type="button" className="overlay-link" onClick={() => { setMenuOpen(false); navigate('/admin'); }}>
                            แผงควบคุม (Admin)
                        </button>
                    )}
                    <button type="button" className="overlay-link" onClick={handleLogout}>
                        ออกจากระบบ
                    </button>
                </div>
            )}
        </div>
    );
}
