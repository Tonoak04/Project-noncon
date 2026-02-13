import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Worksite from './pages/Worksite.jsx';
import MachineList from './pages/MachineList.jsx';
import MachineDetail from './pages/MachineDetail.jsx';
import Categories from './pages/Categories.jsx';
import Classes from './pages/Classes.jsx';
import Scanner from './pages/Scanner.jsx';
import OilLog from './pages/OilLog.jsx';
import OilApproval from './pages/OilApproval.jsx';
import MachineWorkLog from './pages/MachineWorkLog.jsx';
// import MachineWorkLogAdmin from './pages/admin/MachineWorkLogAdmin.jsx';
import Reports from './pages/Reports.jsx';
import Checklist from './pages/Checklist.jsx';
import ChecklistAdmin from './pages/admin/ChecklistAdmin.jsx';
import Login from './pages/Login.jsx';
import MachinesAdmin from './pages/admin/MachinesAdmin.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import OilLogsAdmin from './pages/admin/OilLogsAdmin.jsx';
import ReportsAdmin from './pages/admin/ReportsAdmin.jsx';
import UsersAdmin from './pages/admin/UsersAdmin.jsx';
import UsersDirectory from './pages/admin/UsersDirectory.jsx';
import { useAuth } from './context/AuthContext.jsx';
import BrandBar from './components/BrandBar.jsx';

function ProtectedRoute({ children }) {
    const { isAuthenticated, shouldResetRedirect } = useAuth();
    const location = useLocation();
    if (!isAuthenticated) {
        const redirectState = shouldResetRedirect
            ? undefined
            : {
                from: `${location.pathname}${location.search}`,
            };
        return (
            <Navigate
                to="/login"
                replace
                state={redirectState}
            />
        );
    }
    return children;
}

function AppShell() {
    const location = useLocation();
    const isHome = location.pathname === '/';
    const fullWidthPaths = ['/worksite', '/categories', '/scanner', '/reports', '/login', '/checklist', '/oil-approval'];
    const edgePaths = ['/login'];
    const isFullWidth = fullWidthPaths.includes(location.pathname);
    const isEdge = edgePaths.includes(location.pathname);

    const shellClasses = ['site-shell'];
    const layoutClasses = ['layout'];

    if (isHome) {
        shellClasses.push('site-shell--home');
        layoutClasses.push('layout--home');
    }

    if (isFullWidth) {
        shellClasses.push('site-shell--full');
        layoutClasses.push('layout--full');
    }

    if (isEdge) {
        shellClasses.push('site-shell--edge');
    }

    return (
        <div className={shellClasses.join(' ')}>
            <div className={layoutClasses.join(' ')}>
                <BrandBar />
                <Routes>
                    <Route
                        path="/"
                        element={
                            <ProtectedRoute>
                                <Dashboard />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/worksite"
                        element={
                            <ProtectedRoute>
                                <Worksite />
                            </ProtectedRoute>
                        }
                    />
                    <Route path="/login" element={<Login />} />
                    <Route
                        path="/machines"
                        element={
                            <ProtectedRoute>
                                <MachineList />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/admin/machines"
                        element={
                            <ProtectedRoute>
                                <MachinesAdmin />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/admin/reports"
                        element={
                            <ProtectedRoute>
                                <ReportsAdmin />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/admin/oillogs"
                        element={
                            <ProtectedRoute>
                                <OilLogsAdmin />
                            </ProtectedRoute>
                        }
                    />
                    {/* <Route
                        path="/admin/MachineWorkLog"
                        element={
                            <ProtectedRoute>
                                <MachineWorkLogAdmin />
                            </ProtectedRoute>
                        }
                    /> */}
                    <Route
                        path="/admin/checklist"
                        element={
                            <ProtectedRoute>
                                <ChecklistAdmin />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/admin/users"
                        element={
                            <ProtectedRoute>
                                <UsersAdmin />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/admin/users/all"
                        element={
                            <ProtectedRoute>
                                <UsersDirectory />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/admin"
                        element={
                            <ProtectedRoute>
                                <AdminDashboard />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/machines/:code"
                        element={
                            <ProtectedRoute>
                                <MachineDetail />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/categories"
                        element={
                            <ProtectedRoute>
                                <Categories />
                            </ProtectedRoute>
                        }
                    />
                        <Route
                            path="/classes"
                            element={
                                <ProtectedRoute>
                                    <Classes />
                                </ProtectedRoute>
                            }
                        />
                    <Route
                        path="/scanner"
                        element={
                            <ProtectedRoute>
                                <Scanner />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/oil-log"
                        element={
                            <ProtectedRoute>
                                <OilLog />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/machine-work"
                        element={
                            <ProtectedRoute>
                                <MachineWorkLog />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/oil-approval"
                        element={
                            <ProtectedRoute>
                                <OilApproval />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/reports"
                        element={
                            <ProtectedRoute>
                                <Reports />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/checklist"
                        element={
                            <ProtectedRoute>
                                <Checklist />
                            </ProtectedRoute>
                        }
                    />
                </Routes>
            </div>
        </div>
    );
}

export default function App() {
    return (
        <Router>
            <AppShell />
        </Router>
    );
}
