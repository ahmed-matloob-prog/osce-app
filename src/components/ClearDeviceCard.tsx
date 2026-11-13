import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSyncStore } from '../stores/syncStore';
import { getActiveSession, getUnsyncedEvaluations } from '../db/schema';
import { downloadBackup } from '../services/backupExporter';
import { markDeviceForClearing } from '../utils/stationCard';

/**
 * The way off a station at the end of the day, for an examiner's own phone.
 *
 * Every device holds the exam and its roster so it can work offline. On a
 * college tablet that stays in the building; on a personal phone it goes home.
 * This removes all of it — and refuses while a single mark has not reached the
 * cloud, because on this device those marks exist nowhere else.
 */
export default function ClearDeviceCard() {
  const { t } = useTranslation();
  const { pendingCount, isOnline, isSyncing, syncNow, updatePendingCount } = useSyncStore();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    updatePendingCount();
  }, [updatePendingCount]);

  const clear = async () => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      // One last attempt, then count again from the database rather than
      // trusting the number on screen.
      if (isOnline) await syncNow();
      const unsent = (await getUnsyncedEvaluations()).length;
      if (unsent > 0) {
        await updatePendingCount();
        setMessage(t('clear.stillUnsent', { count: unsent }));
        return;
      }
      if (await getActiveSession()) {
        setMessage(t('clear.sessionActive'));
        return;
      }
      if (!window.confirm(t('clear.confirm'))) return;
      markDeviceForClearing();
      window.location.replace('/');
    } finally {
      setBusy(false);
    }
  };

  const blocked = pendingCount > 0;

  return (
    <div className="mt-6 bg-white rounded-2xl border border-gray-200 p-5 text-left">
      <h2 className="font-semibold text-gray-900">{t('clear.title')}</h2>
      <p className="text-sm text-gray-500 mt-1">{t('clear.body')}</p>

      {blocked ? (
        <p className="mt-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
          {t('clear.unsent', { count: pendingCount })}
        </p>
      ) : (
        <p className="mt-3 text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-3">
          {t('clear.allSent')}
        </p>
      )}

      {message && <p className="mt-3 text-sm text-red-700">{message}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {blocked && (
          <button
            onClick={() => syncNow()}
            disabled={!isOnline || isSyncing}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-medium"
          >
            {isSyncing ? t('clear.sending') : t('clear.sendNow')}
          </button>
        )}
        <button
          onClick={() => downloadBackup().catch((e) => console.error('Backup failed:', e))}
          className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium"
        >
          {t('clear.backup')}
        </button>
        <button
          onClick={clear}
          disabled={blocked || busy}
          className="px-4 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:text-gray-400 disabled:border-gray-200 disabled:hover:bg-transparent text-sm font-medium"
        >
          {t('clear.action')}
        </button>
      </div>
    </div>
  );
}
