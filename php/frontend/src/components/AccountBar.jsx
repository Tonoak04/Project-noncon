import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const HIDDEN_PATHS = ['/login'];
const VISIBLE_PATHS = ['/worksite', '/'];

export default function AccountBar() {
    const { isAuthenticated, logout, user, setUserFromResponse } = useAuth();
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

    useEffect(() => {
        if (!isAuthenticated || user) return undefined;
        let mounted = true;
        (async () => {
            try {
                const res = await fetch('/api/me.php', { credentials: 'include' });
                const data = await res.json().catch(() => null);
                if (!mounted) return;
                if (data && data.user) {
                    setUserFromResponse(data.user);
                }
            } catch (e) {
                // ignore
            }
        })();
        return () => { mounted = false; };
    }, [isAuthenticated, user, setUserFromResponse]);

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
                    {user && (
                        <div
                            className="overlay-user"
                            style={{
                                position: 'absolute',
                                top: 20,
                                left: 18,
                                padding: '10px 14px',
                                background: 'rgba(255,255,255,0.98)',
                                color: '#0f3e68',
                                borderRadius: 8,
                                boxShadow: '0 6px 18px rgba(15,62,104,0.12)',
                                zIndex: 80,
                                minWidth: 200,
                            }}
                        >
                            <div style={{ fontWeight: 800, fontSize: 15 }}>{user.fullName || user.username || 'ผู้ใช้งาน'}</div>
                            <div style={{ fontWeight:'bold' }}>{user.role || 'ไม่มีบทบาท'}</div>
                        </div>
                    )}
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
