import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useExamStore } from '../stores/examStore';
import { useDeviceStore } from '../stores/deviceStore';
import type { Station } from '../types';

export default function SessionSetup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { exams, circuits, loadExams, loadCircuits, startSession, addCircuit } = useExamStore();

  const [selectedExamId, setSelectedExamId] = useState('');
  const [selectedCircuitId, setSelectedCircuitId] = useState('');
  const [circuitNumber, setCircuitNumber] = useState('1');
  const [selectedStationId, setSelectedStationId] = useState('');
  // Read straight into the initial state rather than through an effect, so
  // there is no first render with an empty box before the name appears.
  const [examinerName, setExaminerName] = useState(
    () => localStorage.getItem('examinerName') ?? ''
  );
  const [starting, setStarting] = useState(false);

  const assignment = useDeviceStore((s) => s.assignment);
  const isStation = assignment.role === 'examiner';

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  // A pinned tablet already knows its exam, so load that circuit list too —
  // the picker below never runs, but starting the session needs the circuit.
  useEffect(() => {
    if (isStation && assignment.examId) loadCircuits(assignment.examId);
  }, [isStation, assignment.examId, loadCircuits]);

  // Load circuits when exam is selected
  useEffect(() => {
    if (selectedExamId) {
      loadCircuits(selectedExamId);
    }
  }, [selectedExamId, loadCircuits]);

  // Derived rather than pushed into state by an effect. With exactly one
  // circuit that circuit is the only sensible answer; with none, fall through
  // to creating one. An explicit choice always wins.
  const effectiveCircuitId =
    selectedCircuitId ||
    (circuits.length === 1 ? circuits[0].id : selectedExamId ? 'new' : '');

  const selectedExam = exams.find((e) => e.id === selectedExamId);

  const handleStartSession = async () => {
    if (!selectedExamId || !selectedStationId || !examinerName.trim()) {
      return;
    }

    // Save examiner name for next time
    localStorage.setItem('examinerName', examinerName);

    let circuitId = effectiveCircuitId;

    // Create a new circuit if none exists
    if (effectiveCircuitId === 'new' || !effectiveCircuitId) {
      const newCircuit = await addCircuit({
        examId: selectedExamId,
        circuitNumber: parseInt(circuitNumber) || 1,
        name: '',
        examiners: [],
        candidateIds: [],
      });
      circuitId = newCircuit.id;
    }

    await startSession({
      examId: selectedExamId,
      circuitId: circuitId,
      stationId: selectedStationId,
      examinerName: examinerName.trim(),
    });

    navigate('/exam/active');
  };

  const canStart = selectedExamId && selectedStationId && examinerName.trim() && (effectiveCircuitId || circuitNumber);

  // ── Pinned device ────────────────────────────────────────────────────────
  // No pickers. An examiner at station 3 choosing their own circuit is how a
  // tablet ends up scoring against the wrong one, and choosing "create new
  // circuit" — which the form below offers whenever this device has not synced
  // yet — is how an exam ends up with two Circuit 1s.
  if (isStation) {
    const pinnedExam = exams.find((e) => e.id === assignment.examId);
    const pinnedStation = pinnedExam?.stations.find((st) => st.id === assignment.stationId);
    const pinnedCircuit = circuits.find((c) => c.id === assignment.circuitId);
    const ready = Boolean(pinnedExam && pinnedStation && pinnedCircuit);

    const startPinned = async () => {
      if (!ready || starting) return;
      setStarting(true);
      await startSession({
        examId: assignment.examId!,
        circuitId: assignment.circuitId!,
        stationId: assignment.stationId!,
        examinerName: assignment.examinerName?.trim() || examinerName.trim() || 'Examiner',
      });
      navigate('/exam/active');
    };

    return (
      <div className="p-4 md:p-6 max-w-xl mx-auto">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
          <div className="text-4xl mb-3">🩺</div>
          <h1 className="text-2xl font-bold text-gray-900">
            {pinnedStation?.name ?? assignment.stationName ?? t('device.station')}
          </h1>
          <p className="text-gray-500 mt-1">
            {[
              pinnedExam?.name ?? assignment.examName,
              assignment.circuitNumber !== undefined
                ? t('device.circuitN', { number: assignment.circuitNumber })
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {assignment.examinerName && (
            <p className="text-gray-700 mt-3 font-medium">{assignment.examinerName}</p>
          )}

          {ready ? (
            <button
              onClick={startPinned}
              disabled={starting}
              className="w-full mt-6 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white py-4 rounded-xl font-semibold text-lg shadow-lg shadow-blue-200 transition-all active:scale-[0.98]"
            >
              {t('session.startSession')}
            </button>
          ) : (
            // Everything this device was pinned to can be deleted by an admin
            // from somewhere else. Say which part is missing rather than
            // showing a dead button.
            <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-left text-sm text-amber-900">
              <p className="font-medium">{t('device.notReady')}</p>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                {!pinnedExam && <li>{t('device.missingExam')}</li>}
                {pinnedExam && !pinnedCircuit && <li>{t('device.missingCircuit')}</li>}
                {pinnedExam && !pinnedStation && <li>{t('device.missingStation')}</li>}
              </ul>
              <p className="mt-3">{t('device.notReadyHint')}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('session.setupTitle')}</h1>

      {exams.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl">
          <div className="text-4xl mb-4">📋</div>
          <p className="text-gray-500">{t('session.noExams')}</p>
          <button
            onClick={() => navigate('/exams/new')}
            className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            {t('exams.createExam')}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Select Exam */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('session.selectExam')}
            </label>
            <select
              value={selectedExamId}
              onChange={(e) => {
                setSelectedExamId(e.target.value);
                setSelectedCircuitId('');
                setSelectedStationId('');
              }}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="">-- {t('session.selectExam')} --</option>
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.name}
                </option>
              ))}
            </select>
          </div>

          {/* Circuit Selection or Entry */}
          {selectedExam && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('session.selectCircuit')}
              </label>
              {circuits.length > 0 ? (
                <select
                  value={effectiveCircuitId}
                  onChange={(e) => setSelectedCircuitId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="">-- {t('session.selectCircuit')} --</option>
                  {circuits.map((circuit) => (
                    <option key={circuit.id} value={circuit.id}>
                      Circuit {circuit.circuitNumber} {circuit.name ? `- ${circuit.name}` : ''}
                    </option>
                  ))}
                  <option value="new">+ Create New Circuit</option>
                </select>
              ) : (
                <input
                  type="number"
                  value={circuitNumber}
                  onChange={(e) => setCircuitNumber(e.target.value)}
                  min={1}
                  max={20}
                  placeholder="Circuit 1"
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              )}
              {effectiveCircuitId === 'new' && (
                <input
                  type="number"
                  value={circuitNumber}
                  onChange={(e) => setCircuitNumber(e.target.value)}
                  min={1}
                  max={20}
                  placeholder="Enter circuit number"
                  className="w-full mt-2 border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              )}
            </div>
          )}

          {/* Select Station */}
          {selectedExam && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('session.selectStation')}
              </label>
              <select
                value={selectedStationId}
                onChange={(e) => setSelectedStationId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="">-- {t('session.selectStation')} --</option>
                {selectedExam.stations.map((station: Station) => (
                  <option key={station.id} value={station.id}>
                    Station {station.stationNumber}: {station.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Examiner Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('session.examinerName')}
            </label>
            <input
              type="text"
              value={examinerName}
              onChange={(e) => setExaminerName(e.target.value)}
              placeholder="Dr. Ahmed Hassan"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Start Button */}
          <button
            onClick={handleStartSession}
            disabled={!canStart}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-4 rounded-xl font-semibold text-lg shadow-lg shadow-blue-200 transition-all active:scale-[0.98]"
          >
            {t('session.startSession')}
          </button>
        </div>
      )}
    </div>
  );
}
