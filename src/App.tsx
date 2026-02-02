import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { initSyncListeners } from './stores/syncStore';

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

// Layout
import Layout from './components/ui/Layout';

function App() {
  // Initialize sync listeners on mount
  useEffect(() => {
    initSyncListeners();
  }, []);

  return (
    <BrowserRouter>
      <Layout>
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

          {/* 404 */}
          <Route path="*" element={<div className="p-6 text-center">Page not found</div>} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
