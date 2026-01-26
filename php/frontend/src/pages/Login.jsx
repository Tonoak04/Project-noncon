import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import heroImage from '../images/cec-login-1.jpg';
import heroImageAlt from '../images/cec-login-2.jpg';

export default function Login() {
    const [employeeId, setEmployeeId] = useState('');
    const [pin, setPin] = useState('');
    const [heroIndex, setHeroIndex] = useState(0);
    const navigate = useNavigate();
    const location = useLocation();
    const { isAuthenticated, login, setUserFromResponse, user } = useAuth();
    const redirectPath = useMemo(() => location.state?.from ?? '/', [location.state]);
    const heroImages = useMemo(() => [heroImage, heroImageAlt], []);

    const userHasRole = (candidate, role) => {
        if (!candidate) {
            return false;
        }
        const roles = Array.isArray(candidate.roles) && candidate.roles.length
            ? candidate.roles
            : (candidate.role ? [candidate.role] : []);
        return roles.some((value) => typeof value === 'string' && value.toLowerCase() === role);
    };

    const resolveRedirectFor = (candidateUser) => {
        if (userHasRole(candidateUser, 'admin')) {
            return '/admin';
        }
        const normalized = typeof redirectPath === 'string' ? redirectPath : '/';
        const isLoginPath = normalized === '/login';
        const targetingAdmin = normalized.startsWith('/admin');
        if (!isLoginPath && !targetingAdmin) {
            return normalized;
        }
        return '/worksite';
    };

    useEffect(() => {
        if (isAuthenticated && user) {
            navigate(resolveRedirectFor(user), { replace: true });
        }
    }, [isAuthenticated, user, navigate, redirectPath]);

    useEffect(() => {
        if (heroImages.length <= 1) {
            return;
        }
        const intervalId = window.setInterval(() => {
            setHeroIndex((prev) => (prev + 1) % heroImages.length);
        }, 3000);
        return () => window.clearInterval(intervalId);
    }, [heroImages.length]);

    const [error, setError] = useState(null);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError(null);
        try {
            const apiBase = (typeof window !== 'undefined' && window.location.port === '5173')
                ? 'http://localhost:5173'
                : '';
            const res = await fetch(`/api/login.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ username: employeeId, password: pin }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || `${res.status} ${res.statusText}`);
            }
            if (data && data.user) {
                setUserFromResponse(data.user);
                navigate(resolveRedirectFor(data.user), { replace: true });
            } else {
                const u = await login(employeeId, pin);
                navigate(resolveRedirectFor(u), { replace: true });
            }
        } catch (e) {
            setError(e.message || 'Login failed');
        }
    };

    return (
        <div className="login-shell">
            <div className="login-hero-bg" aria-hidden="true">
                {heroImages.map((image, index) => (
                    <div
                        key={`login-bg-${index}`}
                        className={`login-hero-bg-slide${index === heroIndex ? ' is-active' : ''}`}
                        style={{
                            backgroundImage: `linear-gradient(120deg, rgba(6, 20, 35, 0.8), rgba(6, 20, 35, 0.45)), url(${image})`,
                        }}
                    />
                ))}
            </div>
            <div className="login-content">
                <div className="login-panel">
                    <div className="login-info">
                        <span className="login-badge">CIVIL</span>
                        <span className="login-badge">NONCON</span>
                        <span className="login-badge login-badge--alt">Machine</span>
                        <h1>เข้าสู่ระบบจัดการเครื่องจักร</h1>
                    </div>
                    <form className="login-form" onSubmit={handleSubmit}>
                        <div className="login-card-head">
                            <h1>CIVIL-NONCON</h1>
                            <h2>CIVIL ENGINEERING PUBLIC COMPANY LIMITED</h2>
                        </div>
                        <div className="input-row">
                            <span className="input-side-icon" aria-hidden="true">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path
                                        d="M12 12c2.485 0 4.5-2.015 4.5-4.5S14.485 3 12 3 7.5 5.015 7.5 7.5 9.515 12 12 12zm0 2.25c-3.03 0-6.75 1.518-6.75 4.5V21h13.5v-2.25c0-2.982-3.72-4.5-6.75-4.5z"
                                        fill="currentColor"
                                    />
                                </svg>
                            </span>
                            <div className="form-field">
                                <input
                                    id="employeeId"
                                    type="text"
                                    placeholder="Username"
                                    value={employeeId}
                                    onChange={(event) => setEmployeeId(event.target.value)}
                                />
                            </div>
                        </div>
                        <div className="input-row">
                            <span className="input-side-icon" aria-hidden="true">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path
                                        d="M17 9h-1V7a4 4 0 10-8 0v2H7a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002-2v-7a2 2 0 00-2-2zm-6 6.73V16a1 1 0 112 0v-.27a1.5 1.5 0 10-2 0zM10 7a2 2 0 014 0v2H6V7z"
                                        fill="currentColor"
                                    />
                                </svg>
                            </span>
                            <div className="form-field">
                                <input
                                    id="pin"
                                    type="password"
                                    inputMode="text"
                                    autoComplete="current-password"
                                    placeholder="Password"
                                    value={pin}
                                    onChange={(event) => setPin(event.target.value)}
                                />
                            </div>
                        </div>
                        {error && <div className="error-row">{error}</div>}
                        <button type="submit" className="button primary full-width">
                            เข้าสู่ระบบ
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}