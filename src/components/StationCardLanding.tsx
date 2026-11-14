import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDeviceStore } from '../stores/deviceStore';
import { syncOnceAndWait } from '../stores/syncStore';
import { getActiveSession } from '../db/schema';
import { checkCard, forgetDeviceCleared, type CardCheck, type StationCard } from '../utils/stationCard';

/**
 * What a scanned station card opens.
 *
 * Rendered outside the router and ahead of the chooser, so it works the same on
 * a phone that has never opened the app, a tablet still at the chooser, and a
 * tablet already pinned to a different station.
 *
 * It shows the examiner where the card says they are and asks for nothing but
 * their name. They never see a list of exams.
 */
interface Props {
  card: StationCard;
  /** Leave the card screen, whether or not the device was set up. */
  onDone: () => void;
}

type Busy = { status: 'checking' } | { status: 'busy-elsewhere'; where: string };

export default function StationCardLanding({ card, onDone }: Props) {
  const { t } = useTranslation();
  const assignment = useDeviceStore((s) => s.assignment);
  const assign = useDeviceStore((s) => s.assign);

  const [result, setResult] = useState<CardCheck | Busy>({ status: 'checking' });
  const [examinerName, setExaminerName] = useState(
    () => localStorage.getItem('examinerName') ?? ''
  );
  const [saving, setSaving] = useState(false);

  const run = useCallback(async () => {
    setResult({ status: 'checking' });

    // A device mid-session keeps its session. Switching station under it would
    // file the rest of that circuit's marks against the wrong station.
    const active = await getActiveSession();
    if (active) {
      const label = [
        assignment.examName,
        assignment.circuitNumber !== undefined
          ? t('device.circuitN', { number: assignment.circuitNumber })
          : null,
        assignment.stationName,
      ]
        .filter(Boolean)
        .join(' · ');
      setResult({ status: 'busy-elsewhere', where: label });
      return;
    }

    // Online, the cloud decides: this device's copy may say "open" for an exam
    // the organiser has since closed. Offline, its own copy is all there is,
    // so a device that already has the exam still works in a hall with no
    // signal. If the sync fails or runs out of time, the local copy decides.
    if (navigator.onLine) await syncOnceAndWait(25_000);
    setResult(await checkCard(card));
  }, [card, assignment.examName, assignment.circuitNumber, assignment.stationName, t]);

  useEffect(() => {
    // Deferred a tick so the first render is the "checking" screen, not a
    // state update inside the effect body.
    const id = setTimeout(run, 0);
    return () => clearTimeout(id);
  }, [run]);

  const confirm = async () => {
    if (result.status !== 'ok' || saving) return;
    setSaving(true);
    const name = examinerName.trim();
    if (name) localStorage.setItem('examinerName', name);
    forgetDeviceCleared();
    await assign({
      role: 'examiner',
      examId: result.exam.id,
      examName: result.exam.name,
      circuitId: result.circuit.id,
      circuitNumber: result.circuit.circuitNumber,
      stationId: result.station.id,
      stationName: result.station.name,
      examinerName: name,
    });
    onDone();
  };

  const wasSetUp = assignment.role !== 'unset';
  const field =
    'w-full border border-gray-300 rounded-lg px-4 py-3 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

  const problem = (title: string, body: string, retry = true) => (
    <>
      <div className="text-4xl mb-3" aria-hidden>⚠️</div>
      <h1 className="text-xl font-bold text-gray-900">{title}</h1>
      <p className="text-gray-600 mt-2">{body}</p>
      <div className="mt-6 flex flex-col gap-2">
        {retry && (
          <button
            onClick={run}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium"
          >
            {t('card.tryAgain')}
          </button>
        )}
        <button onClick={onDone} className="w-full py-3 text-gray-600 hover:text-gray-800 font-medium">
          {wasSetUp ? t('card.backToDevice') : t('common.back', 'Back')}
        </button>
      </div>
    </>
  );

  let body: React.ReactNode;
  switch (result.status) {
    case 'checking':
      body = (
        <>
          <div className="text-4xl mb-3 animate-pulse" aria-hidden>🩺</div>
          <h1 className="text-xl font-bold text-gray-900">{t('card.checking')}</h1>
          <p className="text-gray-500 mt-2">{t('card.checkingBody')}</p>
        </>
      );
      break;
    case 'busy-elsewhere':
      body = problem(t('card.busyTitle'), t('card.busyBody', { where: result.where }), false);
      break;
    case 'unknown-exam':
      body = problem(t('card.unknownTitle'), t('card.unknownBody'));
      break;
    case 'closed':
      body = problem(t('card.closedTitle'), t('card.closedBody', { exam: result.exam.name }));
      break;
    case 'bad-code':
      body = problem(t('card.badCodeTitle'), t('card.badCodeBody'));
      break;
    case 'no-station':
      body = problem(t('card.noStationTitle'), t('card.noStationBody'));
      break;
    case 'no-circuit':
      body = problem(
        t('card.noCircuitTitle', { number: card.circuitNumber }),
        t('card.noCircuitBody')
      );
      break;
    case 'ok':
      body = (
        <>
          <p className="text-sm text-gray-500">{result.exam.name}</p>
          <p className="text-lg font-semibold text-blue-700 mt-3">
            {t('device.circuitN', { number: result.circuit.circuitNumber })}
          </p>
          <h1 className="text-3xl font-bold text-gray-900 mt-1">{result.station.name}</h1>

          <div className="mt-6 text-left">
            <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="card-examiner">
              {t('session.examinerName')}
            </label>
            <input
              id="card-examiner"
              type="text"
              value={examinerName}
              onChange={(e) => setExaminerName(e.target.value)}
              className={field}
            />
          </div>

          {assignment.role === 'admin' && (
            <p className="mt-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 text-left">
              {t('card.adminWarning')}
            </p>
          )}

          <button
            onClick={confirm}
            disabled={saving || !examinerName.trim()}
            className="w-full mt-6 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white py-4 rounded-xl font-semibold text-lg"
          >
            {t('card.useStation')}
          </button>
          <p className="text-xs text-gray-400 mt-3">{t('card.wrongCard')}</p>
          <button onClick={onDone} className="mt-2 text-sm text-gray-500 hover:text-gray-700">
            {wasSetUp ? t('card.backToDevice') : t('common.back', 'Back')}
          </button>
        </>
      );
      break;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 p-6 text-center">
        {body}
      </div>
    </div>
  );
}
