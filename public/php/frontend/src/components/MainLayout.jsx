import { NavLink } from 'react-router-dom';

const navLinks = [
    { to: '/', label: 'หน้าหลัก' },
    { to: '/machines', label: 'เครื่องจักร' },
    { to: '/categories', label: 'หมวดหมู่' },
    { to: '/oil-log', label: 'บันทึกน้ำมัน' },
    { to: '/reports', label: 'รายงาน' },
    { to: '/scanner', label: 'สแกน' },
];

export default function MainLayout({ children }) {
    return (
        <>
            <nav className="main-nav">
                {navLinks.map((link) => (
                    <NavLink key={link.to} to={link.to} end={link.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
                        {link.label}
                    </NavLink>
                ))}
            </nav>
            <main>{children}</main>
        </>
    );
}
