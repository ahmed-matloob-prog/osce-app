import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useExamStore } from '../stores/examStore';
import { useDeviceStore, type DeviceRole } from '../stores/deviceStore';
import { isValidPinFormat } from '../utils/pinUtils';

/**
 * Hand a tablet a job for the day.
 *
 * Lives at the top of Settings because on exam morning it is the first thing
 * done to each device and the last thing undone.
 */
export default function DeviceModeCard() {
  const { t } = useTranslation();
  const { exams, circuits, loadExams, loadCircuits } = useExamStore();
  const assignment = useDeviceStore((s) => s.assignment);
  const assign = useDeviceStore((s) => s.assign);

  const [role, setRole] = useState<DeviceRole>('examiner');
  const [examId, setExamId] = useState('');
  const [circuitId, setCircuitId] = useState('');
  const [stationId, setStationId] = useState('');
  const [examinerName, setExaminerName] = useState(
    () => localStorage.getItem('examinerName') ?? ''
  );
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  useEffect(() => {
    if (examId) loadCircuits(examId);
  }, [examId, loadCircuits]);

  const exam = exams.find((e) => e.id === examId);
  const isPinned = assignment.role !== 'admin';

  // ── Already pinned ───────────────────────────────────────────────────────
  if (isPinned) {
    return (
      <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 mb-4">
        <h2 className="font-semibold text-blue-900 mb-1">{t('device.title')}</h2>
        <p className="text-sm text-blue-900">
          {assignment.role === 'checkin' ? t('device.checkInDesk') : t('device.station')}
          {' — '}
          {[
            assignment.examName,
            assignment.circuitNumber !== undefined
              ? t('device.circuitN', { number: assignment.circuitNumber })
              : null,
            assignment.stationName,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <p className="text-xs text-blue-700 mt-2">{t('device.releaseFromHeader')}</p>
      </div>
    );
  }

  const canAssign =
    Boolean(examId) &&
    (role === 'checkin' || (Boolean(circuitId) && Boolean(stationId))) &&
    (!pin || isValidPinFormat(pin));

  const handleAssign = async () => {
    setError('');
    if (pin && !isValidPinFormat(pin)) {
      setError(t('device.badPin'));
      return;
    }
    const circuit = circuits.find((c) => c.id === circuitId);
    const station = exam?.stations.find((s) => s.id === stationId);

    await assign({
      role,
      examId,
      examName: exam?.name ?? '',
      circuitId: role === 'examiner' ? circuitId : undefined,
      circuitNumber: role === 'examiner' ? circuit?.circuitNumber : undefined,
      stationId: role === 'examiner' ? stationId : undefined,
      stationName: role === 'examiner' ? station?.name : undefined,
      examinerName: role === 'examiner' ? examinerName : undefined,
      pin: pin || undefined,
    });
    if (role === 'examiner' && examinerName.trim()) {
      localStorage.setItem('examinerName', examinerName.trim());
    }
    // Nothing to navigate to: the guard moves this device to its own screen
    // as soon as the assignment lands.
  };

  const field = 'w-full border border-gray-300 rounded-lg px-4 py-3 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <h2 className="font-semibold text-gray-900 mb-1">{t('device.title')}</h2>
      <p className="text-sm text-gray-500 mb-4">{t('device.intro')}</p>

      <div className="space-y-4">
        <div className="flex gap-2">
          {(['examiner', 'checkin'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                role === r ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {r === 'examiner' ? t('device.station') : t('device.checkInDesk')}
            </button>
          ))}
        </div>

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

        {role === 'examiner' && exam && (
          <>
            {circuits.length === 0 ? (
              // Deliberately no "create one" here. Circuits are laid out once,
              // by whoever is running the exam, from the check-in screen.
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

        <div>
          <input
            type="text"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder={t('device.pinPlaceholder')}
            className={field}
            aria-label={t('device.pinLabel')}
          />
          <p className="text-xs text-gray-500 mt-1">{t('device.pinHint')}</p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={handleAssign}
          disabled={!canAssign}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-3 rounded-lg font-medium transition-colors"
        >
          {t('device.assign')}
        </button>

        <p className="text-xs text-gray-500">{t('device.notSecurity')}</p>
      </div>
    </div>
  );
}
