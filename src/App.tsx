import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { initSyncListeners } from './stores/syncStore';
import { useDeviceStore, homeRouteFor, isRouteAllowed } from './stores/deviceStore';

// Import i18n (must be before components that use it)
import './i18n';

// Pages
import Dashboard from './pages/Dashboard';
import Exams from './pages/Exams';
import ExamBuilder from './pages/ExamBuilder';
import Candidates from './pages/Candidates';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import SessionSetup from './pages/SessionSetup';
import ActiveExam from './pages/ActiveExam';
import CheckIn from './pages/CheckIn';

// Layout
import Layout from './components/ui/Layout';

/**
 * Keep a pinned device on its own screens.
 *
 * A rail, not a lock — see the note in deviceStore. It stops an examiner
 * wandering into the roster while holding a tablet in one hand; it is not what
 * keeps one stage's marks away from another stage's admin.
 */
function DeviceRouteGuard({ children }: { children: React.ReactNode }) {
  const assignment = useDeviceStore((s) => s.assignment);
  const { pathname } = useLocation();

  if (isRouteAllowed(assignment, pathname)) return <>{children}</>;
  return <Navigate to={homeRouteFor(assignment)} replace />;
}

function App() {
  const reconcile = useDeviceStore((s) => s.reconcile);

  // Initialize sync listeners on mount
  useEffect(() => {
    initSyncListeners();
  }, []);

  // A pinned circuit can lose a merge while the tablet is closed, so check on
  // every start rather than only when the assignment is made.
  useEffect(() => {
    reconcile();
  }, [reconcile]);

  return (
    <BrowserRouter>
      <Layout>
        <DeviceRouteGuard>
        <Routes>
          {/* Main Routes */}
          <Route path="/" element={<Dashboard />} />
          <Route path="/exams" element={<Exams />} />
          <Route path="/exams/new" element={<ExamBuilder />} />
          <Route path="/exams/:id" element={<ExamBuilder />} />
          <Route path="/candidates" element={<Candidates />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />

          {/* Exam Session Routes */}
          <Route path="/session/setup" element={<SessionSetup />} />
          <Route path="/exam/active" element={<ActiveExam />} />

          {/* Check-In Routes */}
          <Route path="/checkin" element={<CheckIn />} />
          <Route path="/checkin/:examId" element={<CheckIn />} />

          {/* 404 */}
          <Route path="*" element={<div className="p-6 text-center">Page not found</div>} />
        </Routes>
        </DeviceRouteGuard>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
