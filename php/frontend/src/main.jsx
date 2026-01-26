import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import '@css/reset.css';
import '@css/theme.css';
import { AuthProvider } from './context/AuthContext.jsx';

function createErrorOverlay() {
    const id = 'dev-error-overlay';
    let el = document.getElementById(id);
    if (!el) {
        el = document.createElement('div');
        el.id = id;
        Object.assign(el.style, {
            position: 'fixed',
            left: '12px',
            right: '12px',
            top: '12px',
            padding: '12px',
            background: 'rgba(255,245,235,0.98)',
            color: '#111',
            border: '1px solid #f1a',
            borderRadius: '6px',
            zIndex: 999999,
            maxHeight: '70vh',
            overflow: 'auto',
            fontFamily: 'monospace',
            fontSize: '13px'
        });
        const close = document.createElement('button');
        close.textContent = 'x';
        Object.assign(close.style, { float: 'right', marginLeft: '8px' });
        close.onclick = () => el.remove();
        el.appendChild(close);
        const title = document.createElement('div');
        title.style.fontWeight = '700';
        title.textContent = 'Runtime Error';
        el.appendChild(title);
        const content = document.createElement('pre');
        content.id = id + '-content';
        content.style.whiteSpace = 'pre-wrap';
        el.appendChild(content);
        document.body.appendChild(el);
    }
    return el;
}

function showDevError(msg) {
    try {
        const el = createErrorOverlay();
        const content = document.getElementById('dev-error-overlay-content');
        if (content) content.textContent = msg;
    } catch (e) {
        console.error('Failed to render dev error overlay', e);
    }
}

window.addEventListener('error', (ev) => {
    showDevError((ev && ev.error && ev.error.stack) ? ev.error.stack : String(ev.message || ev));
});
window.addEventListener('unhandledrejection', (ev) => {
    showDevError((ev && ev.reason && ev.reason.stack) ? ev.reason.stack : String(ev.reason || ev));
});

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <AuthProvider>
            <App />
        </AuthProvider>
    </React.StrictMode>,
);
