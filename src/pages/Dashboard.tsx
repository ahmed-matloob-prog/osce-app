import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSyncStore } from '../stores/syncStore';
import { db } from '../db/schema';

export default function Dashboard() {
  const { t } = useTranslation();
  const { isOnline, pendingCount } = useSyncStore();

  // These were hardcoded zeros. A live query keeps them honest while an exam
  // is running, rather than needing a reload to mean anything.
  //
  // "Stations completed" counts evaluations: one evaluation is one candidate
  // finishing one station. "Candidates evaluated" counts the distinct people
  // behind them, so it does not multiply by the number of stations.
  const stats = useLiveQuery(async () => {
    const evaluations = await db.evaluations.toArray();
    return {
      candidatesEvaluated: new Set(evaluations.map((e) => e.candidateId)).size,
      stationsCompleted: evaluations.length,
    };
  }, []);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
          {t('dashboard.title')}
        </h1>
        <p className="text-gray-600 mt-1">
          {t('common.appName')}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="text-3xl font-bold text-blue-600 tabular-nums">
            {stats?.candidatesEvaluated ?? '—'}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            {t('dashboard.candidatesEvaluated')}
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="text-3xl font-bold text-green-600 tabular-nums">
            {stats?.stationsCompleted ?? '—'}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            {t('dashboard.stationsCompleted')}
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className={`text-3xl font-bold ${pendingCount > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
            {pendingCount}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            {t('dashboard.pendingSync')}
          </div>
        </div>
      </div>

      {/* Main Action Button */}
      <Link
        to="/session/setup"
        className="block w-full bg-blue-600 hover:bg-blue-700 text-white text-center py-4 px-6 rounded-xl font-semibold text-lg shadow-lg shadow-blue-200 transition-all active:scale-[0.98]"
      >
        {t('dashboard.startExam')}
      </Link>

      {/* Check-In Button */}
      <Link
        to="/checkin"
        className="block w-full bg-green-600 hover:bg-green-700 text-white text-center py-3 px-6 rounded-xl font-semibold text-lg shadow-lg shadow-green-200 transition-all active:scale-[0.98] mt-4"
      >
        {t('checkIn.title', 'Student Check-In')}
      </Link>

      {/* Quick Links */}
      <div className="grid grid-cols-2 gap-4 mt-6">
        <Link
          to="/exams"
          className="bg-white hover:bg-gray-50 border border-gray-200 rounded-xl p-4 text-center transition-colors"
        >
          <div className="text-2xl mb-2">📋</div>
          <div className="font-medium text-gray-900">{t('nav.exams')}</div>
        </Link>
        <Link
          to="/candidates"
          className="bg-white hover:bg-gray-50 border border-gray-200 rounded-xl p-4 text-center transition-colors"
        >
          <div className="text-2xl mb-2">👥</div>
          <div className="font-medium text-gray-900">{t('nav.candidates')}</div>
        </Link>
        <Link
          to="/reports"
          className="bg-white hover:bg-gray-50 border border-gray-200 rounded-xl p-4 text-center transition-colors"
        >
          <div className="text-2xl mb-2">📊</div>
          <div className="font-medium text-gray-900">{t('nav.reports')}</div>
        </Link>
        <Link
          to="/settings"
          className="bg-white hover:bg-gray-50 border border-gray-200 rounded-xl p-4 text-center transition-colors"
        >
          <div className="text-2xl mb-2">⚙️</div>
          <div className="font-medium text-gray-900">{t('nav.settings')}</div>
        </Link>
      </div>

      {/* Online Status */}
      <div className="mt-8 text-center">
        <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
          isOnline
            ? 'bg-green-100 text-green-700'
            : 'bg-orange-100 text-orange-700'
        }`}>
          <span className={`w-2 h-2 rounded-full ${
            isOnline ? 'bg-green-500' : 'bg-orange-500'
          }`} />
          {isOnline ? t('sync.online') : t('sync.offline')}
        </span>
      </div>
    </div>
  );
}
