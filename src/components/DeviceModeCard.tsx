import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDeviceStore } from '../stores/deviceStore';
import { useAdminStore } from '../stores/adminStore';
import { isValidPinFormat } from '../utils/pinUtils';
import BackupCodesModal from './BackupCodesModal';

/**
 * What this tablet is, and the admin PIN that gates becoming one.
 *
 * The choosing itself happens at the front door — see RoleGate. This card is
 * the way back out of admin, and the only place the PIN can be changed.
 */
export default function DeviceModeCard() {
  const { t } = useTranslation();
  const assignment = useDeviceStore((s) => s.assignment);
  const release = useDeviceStore((s) => s.release);
  const { credential, loaded, load, setPin } = useAdminStore();

  const [changing, setChanging] = useState(false);
  const [pin, setPinInput] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    load();
  }, [load]);

  const hasPin = Boolean(credential?.pinHash);

  const field =
    'w-full border border-gray-300 rounded-lg px-4 py-3 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

  const handleSetPin = async () => {
    setError('');
    if (!isValidPinFormat(pin)) return setError(t('device.badPin'));
    if (pin !== confirmPin) return setError(t('gate.pinMismatch'));
    setBusy(true);
    const result = await setPin(pin);
    setBusy(false);
    if (!result.ok) return setError(t('device.badPin'));
    setNewCodes(result.backupCodes ?? []);
    setChanging(false);
    setPinInput('');
    setConfirmPin('');
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <h2 className="font-semibold text-gray-900 mb-1">{t('device.title')}</h2>
      <p className="text-sm text-gray-500 mb-4">
        {assignment.role === 'admin' ? t('device.isAdmin') : t('device.isPinned')}
      </p>

      <button
        onClick={release}
        className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 py-3 rounded-lg font-medium transition-colors"
      >
        {t('device.changeRole')}
      </button>

      {/* The admin PIN. Only an admin device can see this, which is the point:
          the tablets at the stations never show it. */}
      {assignment.role === 'admin' && (
        <div className="mt-5 pt-4 border-t border-gray-100">
          <h3 className="font-medium text-gray-900">{t('device.adminPin')}</h3>
          <p className="text-sm text-gray-500 mt-1 mb-3">
            {loaded && !hasPin ? t('device.noPinYet') : t('device.pinSyncs')}
          </p>

          {changing ? (
            <div className="space-y-3">
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder={t('gate.pinPlaceholder')}
                className={field}
                aria-label={t('gate.pinPlaceholder')}
              />
              <input
                type="password"
                inputMode="numeric"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder={t('gate.confirmPinPlaceholder')}
                className={field}
                aria-label={t('gate.confirmPinPlaceholder')}
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleSetPin}
                  disabled={busy || pin.length < 4}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white py-3 rounded-lg font-medium"
                >
                  {t('gate.createPin')}
                </button>
                <button
                  onClick={() => {
                    setChanging(false);
                    setError('');
                    setPinInput('');
                    setConfirmPin('');
                  }}
                  className="px-4 text-gray-500 hover:text-gray-700"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
              </div>
              <p className="text-xs text-gray-500">{t('device.pinChangeWarning')}</p>
            </div>
          ) : (
            <button
              onClick={() => setChanging(true)}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 py-3 rounded-lg font-medium transition-colors"
            >
              {hasPin ? t('device.changePin') : t('device.setPin')}
            </button>
          )}
        </div>
      )}

      <p className="text-xs text-gray-500 mt-4">{t('device.notSecurity')}</p>

      {/* Shown once — the codes are stored hashed and cannot be read back. */}
      <BackupCodesModal
        isOpen={newCodes !== null}
        codes={newCodes ?? []}
        examName={t('gate.admin')}
        onClose={() => setNewCodes(null)}
      />
    </div>
  );
}
