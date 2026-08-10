import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSyncStore } from '../../stores/syncStore';
import { useDeviceStore, homeRouteFor } from '../../stores/deviceStore';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const { isOnline, pendingCount } = useSyncStore();
  const assignment = useDeviceStore((s) => s.assignment);
  const release = useDeviceStore((s) => s.release);

  const isPinned = assignment.role === 'examiner' || assignment.role === 'checkin';

  // Hide nav on active exam screen
  const hideNav = location.pathname.startsWith('/exam/active');

  const adminNav = [
    { path: '/', icon: '🏠', label: t('nav.dashboard') },
    { path: '/exams', icon: '📋', label: t('nav.exams') },
    { path: '/candidates', icon: '👥', label: t('nav.candidates') },
    { path: '/reports', icon: '📊', label: t('nav.reports') },
    { path: '/settings', icon: '⚙️', label: t('nav.settings') },
  ];

  // A pinned device gets one destination. Anything else on the bar is either a
  // wrong turn or a screen the guard will bounce them out of.
  const navItems = isPinned
    ? [
        {
          path: homeRouteFor(assignment),
          icon: assignment.role === 'checkin' ? '✅' : '🩺',
          label:
            assignment.role === 'checkin' ? t('device.checkInDesk') : t('device.station'),
        },
      ]
    : adminNav;

  const stationLabel = [
    assignment.examName,
    assignment.circuitNumber !== undefined
      ? t('device.circuitN', { number: assignment.circuitNumber })
      : null,
    assignment.stationName,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="offline-banner text-white text-center py-2 px-4 text-sm font-medium">
          {t('sync.offline')} - {t('sync.pendingSync', { count: pendingCount })}
        </div>
      )}

      {/* What this device is, and the way back out of it. Kept off the scoring
          screen, which has its own full-bleed layout and its own way back. */}
      {isPinned && !hideNav && (
        <div className="bg-blue-900 text-white px-4 py-2 flex items-center gap-3 text-sm md:ml-64">
          <span aria-hidden>🔒</span>
          <span className="font-medium truncate">
            {stationLabel || t('device.pinnedDevice')}
          </span>
          {assignment.examinerName && (
            <span className="text-blue-200 truncate hidden sm:inline">
              {assignment.examinerName}
            </span>
          )}
          {/* Free, because it only leads back to the chooser. Going *up* to
              admin from there is what costs the PIN. */}
          <button
            onClick={release}
            className="ml-auto shrink-0 text-blue-100 hover:text-white underline underline-offset-2"
          >
            {t('device.release')}
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 pb-20 md:pb-0 md:ml-64">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      {!hideNav && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 md:hidden z-40">
          <div className="flex justify-around">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path ||
                (item.path !== '/' && location.pathname.startsWith(item.path));
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex flex-col items-center py-2 px-3 min-w-0 ${
                    isActive ? 'text-blue-600' : 'text-gray-500'
                  }`}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span className="text-xs mt-1 truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      {/* Desktop Sidebar */}
      {!hideNav && (
        <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-gray-200 flex-col">
          {/* Logo */}
          <div className="p-6 border-b border-gray-100">
            <h1 className="text-xl font-bold text-blue-600">{t('common.appName')}</h1>
          </div>

          {/* Nav Items */}
          <nav className="flex-1 p-4">
            <ul className="space-y-1">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path ||
                  (item.path !== '/' && location.pathname.startsWith(item.path));
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-blue-50 text-blue-600'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span>{item.icon}</span>
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Sync Status */}
          <div className="p-4 border-t border-gray-100">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
              isOnline ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-green-500' : 'bg-orange-500'
              }`} />
              {isOnline ? t('sync.online') : t('sync.offline')}
              {pendingCount > 0 && (
                <span className="ml-auto bg-orange-200 text-orange-800 px-2 py-0.5 rounded-full text-xs">
                  {pendingCount}
                </span>
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
