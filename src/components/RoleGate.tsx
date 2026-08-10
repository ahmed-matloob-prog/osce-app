import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useExamStore } from '../stores/examStore';
import { useDeviceStore } from '../stores/deviceStore';
import { useAdminStore } from '../stores/adminStore';
import { isValidPinFormat } from '../utils/pinUtils';
import BackupCodesModal from './BackupCodesModal';

/**
 * The front door.
 *
 * A tablet does nothing until somebody says what it is for. Examiner and
 * check-in are one tap, because those are the safe answers and the ones needed
 * fourteen times over on exam morning. Admin costs a PIN, because that is the
 * branch that can delete an exam.
 *
 * The PIN is set once, on the first device, and travels to the others with
 * everything else — nobody types it into fifteen tablets.
 */
type Choice = null | 'examiner' | 'checkin' | 'admin';

export default function RoleGate() {
  const { t } = useTranslation();
  const { exams, circuits, loadExams, loadCircuits } = useExamStore();
  const assign = useDeviceStore((s) => s.assign);
  const becomeAdmin = useDeviceStore((s) => s.becomeAdmin);
  const { credential, loaded, load, setPin, checkPin, redeemBackupCode } = useAdminStore();

  const [choice, setChoice] = useState<Choice>(null);
  const [examId, setExamId] = useState('');
  const [circuitId, setCircuitId] = useState('');
  const [stationId, setStationId] = useState('');
  const [examinerName, setExaminerName] = useState(
    () => localStorage.getItem('examinerName') ?? ''
  );

  const [pin, setPinInput] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [showRecovery, setShowRecovery] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadExams();
    load();
  }, [loadExams, load]);

  useEffect(() => {
    if (examId) loadCircuits(examId);
  }, [examId, loadCircuits]);

  const exam = exams.find((e) => e.id === examId);
  const hasPin = Boolean(credential?.pinHash);

  const field =
    'w-full border border-gray-300 rounded-lg px-4 py-3 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

  // ── Choosing a role ──────────────────────────────────────────────────────
  if (choice === null) {
    const card = (
      key: Exclude<Choice, null>,
      icon: string,
      title: string,
      body: string,
      note?: string
    ) => (
      <button
        key={key}
        onClick={() => {
          setChoice(key);
          setError('');
        }}
        className="w-full text-left bg-white border border-gray-200 hover:border-blue-400 hover:shadow-md rounded-2xl p-5 transition-all active:scale-[0.99]"
      >
        <div className="flex items-start gap-4">
          <span className="text-3xl shrink-0" aria-hidden>
            {icon}
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500 mt-1">{body}</p>
            {note && <p className="text-xs text-gray-400 mt-2">{note}</p>}
          </div>
        </div>
      </button>
    );

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <h1 className="text-2xl font-bold text-gray-900 text-center">{t('gate.title')}</h1>
          <p className="text-gray-500 text-center mt-2 mb-6">{t('gate.subtitle')}</p>

          <div className="space-y-3">
            {card('examiner', '🩺', t('device.station'), t('gate.examinerBody'))}
            {card('checkin', '✅', t('device.checkInDesk'), t('gate.checkInBody'))}
            {card(
              'admin',
              '⚙️',
              t('gate.admin'),
              t('gate.adminBody'),
              hasPin ? t('gate.adminNeedsPin') : t('gate.adminNoPinYet')
            )}
          </div>

          <p className="text-xs text-gray-400 text-center mt-6">{t('device.notSecurity')}</p>
        </div>
      </div>
    );
  }

  // ── Admin ────────────────────────────────────────────────────────────────
  if (choice === 'admin') {
    // Nothing set anywhere yet: whoever is here is the first, so they set it.
    const creating = loaded && !hasPin;

    const handleCreate = async () => {
      setError('');
      if (!isValidPinFormat(pin)) return setError(t('device.badPin'));
      if (pin !== confirmPin) return setError(t('gate.pinMismatch'));
      setBusy(true);
      const result = await setPin(pin);
      setBusy(false);
      if (!result.ok) return setError(t('device.badPin'));
      setNewCodes(result.backupCodes ?? []);
    };

    const handleVerify = async () => {
      setError('');
      setBusy(true);
      const result = await checkPin(pin);
      setBusy(false);
      if (result.status === 'ok') return becomeAdmin();
      if (result.status === 'wrong') {
        setPinInput('');
        return setError(t('gate.wrongPin'));
      }
      // 'unknown' — this tablet has never synced, so there is no PIN on it to
      // check against. Let them through and say so: refusing would strand
      // whoever is holding it, and a tablet that has never synced has no exams
      // and no roster on it to reach anyway.
      becomeAdmin();
    };

    const handleRecover = async () => {
      setError('');
      setBusy(true);
      const ok = await redeemBackupCode(backupCode);
      setBusy(false);
      if (!ok) return setError(t('gate.badBackupCode'));
      becomeAdmin();
    };

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 p-6">
          <h1 className="text-xl font-bold text-gray-900">
            {creating ? t('gate.createPinTitle') : t('gate.enterPinTitle')}
          </h1>
          <p className="text-sm text-gray-500 mt-1 mb-5">
            {creating ? t('gate.createPinBody') : t('gate.enterPinBody')}
          </p>

          {showRecovery ? (
            <>
              <input
                type="text"
                value={backupCode}
                onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX"
                className={field}
                aria-label={t('gate.backupCode')}
              />
              <button
                onClick={handleRecover}
                disabled={busy || backupCode.length < 8}
                className="w-full mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white py-3 rounded-lg font-medium"
              >
                {t('gate.redeemBackupCode')}
              </button>
            </>
          ) : (
            <>
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder={t('gate.pinPlaceholder')}
                className={field}
                aria-label={t('gate.pinPlaceholder')}
                autoFocus
              />
              {creating && (
                <input
                  type="password"
                  inputMode="numeric"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder={t('gate.confirmPinPlaceholder')}
                  className={`${field} mt-3`}
                  aria-label={t('gate.confirmPinPlaceholder')}
                />
              )}
              <button
                onClick={creating ? handleCreate : handleVerify}
                disabled={busy || pin.length < 4}
                className="w-full mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white py-3 rounded-lg font-medium"
              >
                {creating ? t('gate.createPin') : t('pin.unlock')}
              </button>
            </>
          )}

          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

          <div className="flex items-center justify-between mt-5 text-sm">
            <button
              onClick={() => {
                setChoice(null);
                setPinInput('');
                setError('');
                setShowRecovery(false);
              }}
              className="text-gray-500 hover:text-gray-700"
            >
              {t('common.back', 'Back')}
            </button>
            {!creating && (
              <button
                onClick={() => {
                  setShowRecovery(!showRecovery);
                  setError('');
                }}
                className="text-blue-600 hover:text-blue-700"
              >
                {showRecovery ? t('gate.usePinInstead') : t('gate.forgotPin')}
              </button>
            )}
          </div>
        </div>

        {/* Shown once, and only once — the codes are stored hashed. */}
        <BackupCodesModal
          isOpen={newCodes !== null}
          codes={newCodes ?? []}
          examName={t('gate.admin')}
          onClose={() => {
            setNewCodes(null);
            becomeAdmin();
          }}
        />
      </div>
    );
  }

  // ── Examiner station / check-in desk ─────────────────────────────────────
  const needsCircuitAndStation = choice === 'examiner';
  const canConfirm =
    Boolean(examId) && (!needsCircuitAndStation || (Boolean(circuitId) && Boolean(stationId)));

  const handleConfirm = async () => {
    const circuit = circuits.find((c) => c.id === circuitId);
    const station = exam?.stations.find((s) => s.id === stationId);
    await assign({
      role: choice,
      examId,
      examName: exam?.name ?? '',
      circuitId: needsCircuitAndStation ? circuitId : undefined,
      circuitNumber: needsCircuitAndStation ? circuit?.circuitNumber : undefined,
      stationId: needsCircuitAndStation ? stationId : undefined,
      stationName: needsCircuitAndStation ? station?.name : undefined,
      examinerName: needsCircuitAndStation ? examinerName : undefined,
    });
    if (needsCircuitAndStation && examinerName.trim()) {
      localStorage.setItem('examinerName', examinerName.trim());
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 p-6">
        <h1 className="text-xl font-bold text-gray-900 mb-1">
          {choice === 'examiner' ? t('device.station') : t('device.checkInDesk')}
        </h1>
        <p className="text-sm text-gray-500 mb-5">{t('gate.pickWhere')}</p>

        {exams.length === 0 ? (
          // A tablet with no exams has not synced yet. Nothing here can be
          // chosen, so say why rather than showing three empty dropdowns.
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
            {t('gate.noExamsYet')}
          </p>
        ) : (
          <div className="space-y-4">
            <select
              value={examId}
              onChange={(e) => {
                setExamId(e.target.value);
                setCircuitId('');
                setStationId('');
              }}
              className={field}
              aria-label={t('session.selectExam')}
            >
              <option value="">-- {t('session.selectExam')} --</option>
              {exams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>

            {needsCircuitAndStation && exam && (
              <>
                {circuits.length === 0 ? (
                  // Deliberately no "create one" here. Circuits are laid out
                  // once, by whoever runs the exam, from the check-in screen —
                  // an examiner inventing one is how an exam ends up with two
                  // Circuit 1s.
                  <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    {t('device.noCircuits')}
                  </p>
                ) : (
                  <select
                    value={circuitId}
                    onChange={(e) => setCircuitId(e.target.value)}
                    className={field}
                    aria-label={t('session.selectCircuit')}
                  >
                    <option value="">-- {t('session.selectCircuit')} --</option>
                    {[...circuits]
                      .sort((a, b) => a.circuitNumber - b.circuitNumber)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {t('device.circuitN', { number: c.circuitNumber })}
                          {c.name ? ` — ${c.name}` : ''}
                        </option>
                      ))}
                  </select>
                )}

                <select
                  value={stationId}
                  onChange={(e) => setStationId(e.target.value)}
                  className={field}
                  aria-label={t('session.selectStation')}
                >
                  <option value="">-- {t('session.selectStation')} --</option>
                  {exam.stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  value={examinerName}
                  onChange={(e) => setExaminerName(e.target.value)}
                  placeholder={t('session.examinerName')}
                  className={field}
                  aria-label={t('session.examinerName')}
                />
              </>
            )}

            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-3 rounded-lg font-medium"
            >
              {t('gate.confirm')}
            </button>
          </div>
        )}

        <button
          onClick={() => setChoice(null)}
          className="mt-5 text-sm text-gray-500 hover:text-gray-700"
        >
          {t('common.back', 'Back')}
        </button>
      </div>
    </div>
  );
}
