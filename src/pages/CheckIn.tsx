import { useState, useEffect, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useExamStore } from '../stores/examStore';
import { useCheckInStore } from '../stores/checkInStore';
import { useCandidateStore } from '../stores/candidateStore';
import type { ExamTemplate, Circuit, Candidate } from '../types';
import { validateQR, findCandidateByNumber, candidatesForExam } from '../utils/qrUtils';
import { getDeviceId } from '../utils/pinUtils';
import { distributeIntoCircuits } from '../services/circuitAssignment';

// Lazy load QR scanner
const QRScanner = lazy(() => import('../components/scanner/QRScanner'));
const ManualRegistrationModal = lazy(() => import('../components/ManualRegistrationModal'));

export default function CheckIn() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { examId } = useParams<{ examId: string }>();

  // Stores
  const { exams, loadExams, circuits, loadCircuits, addCircuit } = useExamStore();
  const { checkIns, loadAllCheckInsForExam, checkInCandidate, undoCheckIn } = useCheckInStore();
  const { candidates, loadCandidates } = useCandidateStore();

  // State
  const [selectedCircuit, setSelectedCircuit] = useState<Circuit | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [newCircuitNumber, setNewCircuitNumber] = useState('1');
  const [isAddingCircuit, setIsAddingCircuit] = useState(false);
  const [distributeCount, setDistributeCount] = useState('');
  const [isDistributing, setIsDistributing] = useState(false);

  // Load initial data
  useEffect(() => {
    loadExams();
    loadCandidates();
  }, [loadExams, loadCandidates]);

  // The chosen exam is derived from the URL, not copied into state. Holding a
  // copy meant it silently went stale whenever the exam list reloaded — the
  // header would keep rendering a detached snapshot of the exam.
  const selectedExam = examId ? exams.find((e) => e.id === examId) ?? null : null;

  // Only students enrolled in this exam. Check-in used to search the whole
  // database, so a student from another cohort could be checked into a circuit.
  const examCandidates = candidatesForExam(candidates, selectedExam?.id);

  // Enrolled in the exam but not yet in any circuit
  const assignedIds = new Set(checkIns.map((c) => c.candidateId));
  const unassignedCount = examCandidates.filter((c) => !assignedIds.has(c.id)).length;

  const handleDistribute = async () => {
    if (!selectedExam || isDistributing) return;
    const count = parseInt(distributeCount, 10);
    if (!count || count < 1) return;

    setIsDistributing(true);
    try {
      const r = await distributeIntoCircuits(selectedExam.id, count, getDeviceId());
      await Promise.all([
        loadCircuits(selectedExam.id),
        loadAllCheckInsForExam(selectedExam.id),
      ]);
      const sizes = Object.entries(r.perCircuit)
        .map(([n, size]) => `${n}: ${size}`)
        .join(', ');
      alert(
        [
          t('checkIn.distributed', '{{count}} students split across {{n}} circuits.', {
            count: r.assigned,
            n: count,
          }),
          sizes,
          r.skipped > 0
            ? t('checkIn.distributeSkipped', '{{count}} were already placed and were left alone.', {
                count: r.skipped,
              })
            : '',
        ]
          .filter(Boolean)
          .join('\n\n')
      );
    } finally {
      setIsDistributing(false);
    }
  };

  // Load whatever belongs to the exam the URL points at
  useEffect(() => {
    if (!examId) return;
    loadCircuits(examId);
    loadAllCheckInsForExam(examId);
  }, [examId, loadCircuits, loadAllCheckInsForExam]);

  // Handle exam selection — navigating is enough, the derived value follows
  const handleExamSelect = (exam: ExamTemplate) => {
    setSelectedCircuit(null);
    navigate(`/checkin/${exam.id}`);
  };

  // Create a circuit without leaving check-in, and select it straight away so
  // the admin can carry on scanning.
  // Takes the number as an argument rather than reading state, so callers that
  // compute one on the spot are not caught by React's asynchronous setState.
  const handleAddCircuit = async (requestedNumber?: number) => {
    if (!selectedExam || isAddingCircuit) return;

    const circuitNumber = requestedNumber ?? parseInt(newCircuitNumber, 10);
    if (!circuitNumber || circuitNumber < 1) return;

    if (circuits.some((c) => c.circuitNumber === circuitNumber)) {
      setMessage({
        type: 'warning',
        text: t('checkIn.circuitExists', 'Circuit {{number}} already exists.', {
          number: circuitNumber,
        }),
      });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    setIsAddingCircuit(true);
    try {
      const circuit = await addCircuit({
        examId: selectedExam.id,
        circuitNumber,
        name: '',
        examiners: [],
        candidateIds: [],
      });
      setSelectedCircuit(circuit);
    } finally {
      setIsAddingCircuit(false);
    }
  };

  // Handle QR scan. The scanner hands us the raw badge payload, which for
  // current badges is OSCE:<examId>:<candidateNumber>.
  const handleScan = async (scannedText: string) => {
    if (!selectedExam || !selectedCircuit || isProcessing) return;

    setIsProcessing(true);
    setShowScanner(false);

    const result = validateQR(scannedText, selectedExam.id);

    if (result.status === 'unreadable') {
      setMessage({
        type: 'error',
        text: t('checkIn.badgeUnreadable', 'Could not read that badge. Search by name or number instead.'),
      });
      setIsProcessing(false);
      return;
    }

    if (result.status === 'wrong-exam') {
      const otherExam = exams.find((e) => e.id === result.data.examId);
      setMessage({
        type: 'error',
        text: t('checkIn.wrongExamBadge', 'This badge is for {{other}}, not {{current}}.', {
          other: otherExam ? `"${otherExam.name}"` : t('checkIn.anotherExam', 'another exam'),
          current: `"${selectedExam.name}"`,
        }),
      });
      setTimeout(() => setMessage(null), 5000);
      setIsProcessing(false);
      return;
    }

    const candidate = findCandidateByNumber(examCandidates, result.data.candidateNumber);
    if (!candidate) {
      setMessage({
        type: 'error',
        text: t('checkIn.candidateNotFound', 'Candidate not found: {{number}}', {
          number: result.data.candidateNumber,
        }),
      });
      setIsProcessing(false);
      return;
    }

    await performCheckIn(candidate);

    if (result.status === 'legacy') {
      setMessage({
        type: 'warning',
        text: t('checkIn.legacyBadge', 'Checked in, but this badge is an old one with no exam on it. Reprint badges from Settings.'),
      });
      setTimeout(() => setMessage(null), 5000);
    }

    setIsProcessing(false);
  };

  // Perform check-in
  const performCheckIn = async (candidate: Candidate) => {
    if (!selectedExam || !selectedCircuit) return;

    const result = await checkInCandidate({
      examId: selectedExam.id,
      circuitId: selectedCircuit.id,
      candidateId: candidate.id,
      candidateNumber: candidate.candidateNumber,
      candidateName: candidate.name,
    });

    if (result.success) {
      setMessage({
        type: 'success',
        text: t('checkIn.success', '{{name}} checked in to Circuit {{circuit}}', {
          name: candidate.name,
          circuit: selectedCircuit.circuitNumber,
        }),
      });
    } else {
      setMessage({
        type: 'warning',
        text: result.error || t('checkIn.alreadyCheckedIn', 'Already checked in'),
      });
    }

    // Clear message after 3 seconds
    setTimeout(() => setMessage(null), 3000);
  };

  // Search and check-in
  const handleSearch = async () => {
    if (!searchQuery.trim() || !selectedExam || !selectedCircuit) return;

    setIsProcessing(true);
    const query = searchQuery.trim().toLowerCase();

    // Find candidate by number or name
    const candidate = examCandidates.find(
      (c) =>
        c.candidateNumber.toLowerCase() === query ||
        c.name.toLowerCase().includes(query) ||
        c.nameAr?.includes(query)
    );

    if (!candidate) {
      setMessage({ type: 'error', text: t('checkIn.candidateNotFound', 'Candidate not found') });
      setIsProcessing(false);
      return;
    }

    await performCheckIn(candidate);
    setSearchQuery('');
    setIsProcessing(false);
  };

  // Get check-ins for selected circuit
  const circuitCheckIns = selectedCircuit
    ? checkIns.filter((c) => c.circuitId === selectedCircuit.id)
    : [];

  // Get total check-ins per circuit for display
  const getCircuitCount = (circuitId: string) => {
    return checkIns.filter((c) => c.circuitId === circuitId).length;
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('checkIn.title', 'Student Check-In')}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {t('checkIn.subtitle', 'Assign students to circuits before exam')}
          </p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="text-gray-500 hover:text-gray-700"
        >
          {t('common.back', 'Back')}
        </button>
      </div>

      {/* Step 1: Select Exam */}
      {!selectedExam && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">
            {t('checkIn.selectExam', 'Select Exam')}
          </h2>
          {exams.length === 0 ? (
            <p className="text-gray-500">{t('exams.noExams', 'No exams found')}</p>
          ) : (
            <div className="space-y-2">
              {exams.map((exam) => (
                <button
                  key={exam.id}
                  onClick={() => handleExamSelect(exam)}
                  className="w-full text-left p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                >
                  <div className="font-medium text-gray-900">{exam.name}</div>
                  {exam.nameAr && (
                    <div className="text-gray-500 text-sm" dir="rtl">{exam.nameAr}</div>
                  )}
                  <div className="text-gray-400 text-sm mt-1">
                    {exam.stations.length} {t('exams.stations', 'stations')}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Select Circuit & Check-In */}
      {selectedExam && (
        <div className="space-y-4">
          {/* Exam Info */}
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-blue-900">{selectedExam.name}</div>
                <div className="text-blue-700 text-sm">
                  {checkIns.length} {t('checkIn.totalCheckedIn', 'students checked in')}
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedCircuit(null);
                  navigate('/checkin');
                }}
                className="text-blue-600 hover:text-blue-700 text-sm"
              >
                {t('common.change', 'Change')}
              </button>
            </div>
          </div>

          {/* Split the roster into circuits, for when the file did not say.
              Only offered while somebody is still unassigned. */}
          {unassignedCount > 0 && (
            <div className="bg-white rounded-xl border border-blue-200 p-4">
              <h3 className="font-semibold text-gray-900">
                {t('checkIn.distributeTitle', 'Split students into circuits')}
              </h3>
              <p className="text-sm text-gray-600 mt-1 mb-3">
                {t('checkIn.distributeHint', {
                  defaultValue:
                    '{{count}} students in this exam have no circuit. They will be split evenly in college-ID order; anyone already placed stays where they are.',
                  count: unassignedCount,
                })}
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={distributeCount}
                  onChange={(e) => setDistributeCount(e.target.value)}
                  className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="text-sm text-gray-600">
                  {t('checkIn.circuitsWord', 'circuits')}
                </span>
                <button
                  onClick={handleDistribute}
                  disabled={isDistributing || !distributeCount.trim()}
                  className="ml-auto bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {isDistributing
                    ? t('common.loading', 'Working…')
                    : t('checkIn.distribute', 'Split them')}
                </button>
              </div>
            </div>
          )}

          {/* Circuit Selection */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3">
              {t('checkIn.selectCircuit', 'Select Circuit')}
            </h3>
            {circuits.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-gray-500 mb-3">{t('checkIn.noCircuits', 'No circuits created yet')}</p>
                {/* Created here rather than sending the admin elsewhere: this
                    is the screen where the missing circuit is discovered, and
                    there is no circuits page to send them to. */}
                <div className="flex items-center justify-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={newCircuitNumber}
                    onChange={(e) => setNewCircuitNumber(e.target.value)}
                    className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    onClick={() => handleAddCircuit()}
                    disabled={isAddingCircuit || !newCircuitNumber.trim()}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    {t('checkIn.createCircuits', 'Create circuit')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {circuits.map((circuit) => (
                  <button
                    key={circuit.id}
                    onClick={() => setSelectedCircuit(circuit)}
                    className={`p-3 rounded-lg border text-center transition-colors ${
                      selectedCircuit?.id === circuit.id
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-blue-300 text-gray-700'
                    }`}
                  >
                    <div className="font-medium">
                      {t('exam.circuit', 'Circuit')} {circuit.circuitNumber}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {getCircuitCount(circuit.id)} {t('checkIn.students', 'students')}
                    </div>
                  </button>
                ))}

                {/* An extra circuit gets added on the morning more often than
                    you would think. */}
                <button
                  onClick={() => {
                    const next = Math.max(...circuits.map((c) => c.circuitNumber)) + 1;
                    setNewCircuitNumber(String(next));
                    handleAddCircuit(next);
                  }}
                  disabled={isAddingCircuit}
                  className="p-3 rounded-lg border border-dashed border-gray-300 text-center text-gray-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
                >
                  <div className="font-medium">
                    + {t('checkIn.addCircuit', 'Add circuit')}
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Check-In Panel */}
          {selectedCircuit && (
            <>
              {/* Message */}
              {message && (
                <div
                  className={`p-4 rounded-xl ${
                    message.type === 'success'
                      ? 'bg-green-50 border border-green-200 text-green-700'
                      : message.type === 'warning'
                      ? 'bg-amber-50 border border-amber-200 text-amber-700'
                      : 'bg-red-50 border border-red-200 text-red-700'
                  }`}
                >
                  {message.text}
                </div>
              )}

              {/* Scan/Search Panel */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-900 mb-3">
                  {t('checkIn.checkInTo', 'Check In to Circuit {{number}}', {
                    number: selectedCircuit.circuitNumber,
                  })}
                </h3>

                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setShowScanner(true)}
                    disabled={isProcessing}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                    {t('checkIn.scanQR', 'Scan QR Badge')}
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder={t('checkIn.searchPlaceholder', 'Enter candidate number or name')}
                    className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    onClick={handleSearch}
                    disabled={isProcessing || !searchQuery.trim()}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    {t('checkIn.checkIn', 'Check In')}
                  </button>
                </div>

                {/* Late registration — the usual place a missing student is
                    noticed is here, at the door, not at a station. */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => setShowManualEntry(true)}
                    className="w-full py-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    {t('checkIn.registerNew', 'Student not on the roster? Register them')}
                  </button>
                </div>
              </div>

              {/* Checked-In List */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-900 mb-3">
                  {t('checkIn.checkedInList', 'Checked In ({{count}})', {
                    count: circuitCheckIns.length,
                  })}
                </h3>

                {circuitCheckIns.length === 0 ? (
                  <p className="text-gray-500 text-center py-6">
                    {t('checkIn.noCheckIns', 'No students checked in yet')}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {circuitCheckIns.map((checkIn, index) => (
                      <div
                        key={checkIn.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-gray-400 text-sm w-6">{index + 1}.</span>
                          <div>
                            <div className="font-medium text-gray-900">
                              {checkIn.candidateName}
                            </div>
                            <div className="text-gray-500 text-sm">
                              #{checkIn.candidateNumber}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => undoCheckIn(checkIn.id)}
                          className="text-red-500 hover:text-red-700 text-sm px-2 py-1"
                          title={t('checkIn.undo', 'Undo')}
                        >
                          {t('common.remove', 'Remove')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Late registration, then straight into the circuit they're standing in */}
      {showManualEntry && selectedExam && selectedCircuit && (
        <Suspense fallback={null}>
          <ManualRegistrationModal
            examId={selectedExam.id}
            registeredWhere="check-in"
            registeredBy={getDeviceId()}
            onCancel={() => setShowManualEntry(false)}
            onRegistered={async (candidate) => {
              setShowManualEntry(false);
              await performCheckIn(candidate);
            }}
          />
        </Suspense>
      )}

      {/* QR Scanner Modal */}
      {showScanner && (
        <Suspense
          fallback={
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-6 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-3 text-gray-600">{t('common.loading', 'Loading...')}</p>
              </div>
            </div>
          }
        >
          <QRScanner
            onScan={handleScan}
            onClose={() => setShowScanner(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
