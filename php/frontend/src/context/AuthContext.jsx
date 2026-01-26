import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '../api.js';

const AuthContext = createContext(null);
const readInitialAuth = () => false;

const normalizeUserRecord = (userObj) => {
    if (!userObj || typeof userObj !== 'object') {
        return null;
    }
    const roleEntries = Array.isArray(userObj.roles) && userObj.roles.length
        ? userObj.roles
        : (userObj.role ? [userObj.role] : []);
    const normalizedRoles = roleEntries
        .map((role) => (typeof role === 'string' ? role.trim().toLowerCase() : ''))
        .filter(Boolean);
    const roles = normalizedRoles.length ? normalizedRoles : ['operator'];
    const primaryRole = roles[0];
    return {
        ...userObj,
        role: userObj.role || primaryRole,
        roles,
    };
};

export function AuthProvider({ children }) {
    const [isAuthenticated, setAuthenticated] = useState(readInitialAuth);
    const [user, setUser] = useState(null);
    const [shouldResetRedirect, setShouldResetRedirect] = useState(false);
    const [lastLogoutReason, setLastLogoutReason] = useState(null);
    const INACTIVITY_MS = 10 * 60 * 1000; // 10 minutes
    const activityEvents = ['mousemove', 'keydown', 'mousedown', 'touchstart'];

    const markActiveSession = (userObj) => {
        const normalizedUser = normalizeUserRecord(userObj);
        setUser(normalizedUser);
        setAuthenticated(true);
        setShouldResetRedirect(false);
        setLastLogoutReason(null);
        return normalizedUser;
    };

    const markLoggedOut = (reason = 'manual') => {
        setUser(null);
        setAuthenticated(false);
        setShouldResetRedirect(true);
        setLastLogoutReason(reason);
    };

    useEffect(() => {
        (async () => {
            try {
                const data = await apiGet('/api/me.php');
                markActiveSession(data.user);
            } catch (_) {
                markLoggedOut('session-expired');
            }
        })();
    }, []);

    // client-side inactivity watcher: auto-logout after 10 minutes of no interaction
    useEffect(() => {
        if (!isAuthenticated) return undefined;
        let timer = null;
        const reset = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                // perform logout when inactivity timeout reached
                logout('timeout').catch(() => {});
            }, INACTIVITY_MS);
        };

        // attach listeners
        activityEvents.forEach((ev) => window.addEventListener(ev, reset));
        // start timer
        reset();

        return () => {
            if (timer) clearTimeout(timer);
            activityEvents.forEach((ev) => window.removeEventListener(ev, reset));
        };
    }, [isAuthenticated]);

    const login = async (username, password) => {
        const data = await apiPost('/api/login.php', { username, password });
        return markActiveSession(data.user);
    };

    const setUserFromResponse = (userObj) => {
        markActiveSession(userObj);
    };

    const logout = async (reason = 'manual') => {
        try { await apiGet('/api/logout.php'); } catch (_) {}
        markLoggedOut(reason);
    };

    const value = useMemo(
        () => ({
            isAuthenticated,
            user,
            login,
            logout,
            setUserFromResponse,
            shouldResetRedirect,
            lastLogoutReason,
        }),
        [isAuthenticated, user, shouldResetRedirect, lastLogoutReason],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return ctx;
}
