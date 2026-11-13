import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { forgetDeviceCleared, wipeLocalDatabases } from '../utils/stationCard';
import { buildLabel } from '../build-info';

/**
 * What a device shows after "Clear this device".
 *
 * Nothing syncs from here — that would download every exam and the whole roster
 * straight back onto an examiner's own phone. The wipe runs on every visit, so
 * a wipe that was interrupted finishes the next time the page is opened.
 */
export default function ClearedScreen() {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);

  useEffect(() => {
    wipeLocalDatabases().finally(() => setDone(true));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 p-6 text-center">
        <div className="text-4xl mb-3" aria-hidden>{done ? '✅' : '⏳'}</div>
        <h1 className="text-xl font-bold text-gray-900">
          {done ? t('clear.doneTitle') : t('clear.working')}
        </h1>
        {done && (
          <>
            <p className="text-gray-600 mt-2">{t('clear.doneBody')}</p>
            <p className="text-gray-900 font-medium mt-4">{t('clear.closeNow')}</p>
            <button
              onClick={() => {
                forgetDeviceCleared();
                window.location.replace('/');
              }}
              className="mt-6 text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2"
            >
              {t('clear.useAgain')}
            </button>
          </>
        )}
        <p className="text-xs text-gray-400 mt-6 font-mono">{buildLabel()}</p>
      </div>
    </div>
  );
}
