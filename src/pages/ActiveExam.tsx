import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useExamStore } from '../stores/examStore';
import { useCandidateStore } from '../stores/candidateStore';
import { useCheckInStore } from '../stores/checkInStore';
import { useSyncStore } from '../stores/syncStore';
import type { ChecklistItem, Candidate, IdentificationMethod } from '../types';
import { GLOBAL_RATING_LABELS, IDENTIFICATION_METHOD_LABELS } from '../types';
import { validateQR, findCandidateByNumber, candidatesForExam } from '../utils/qrUtils';
import { downloadBackup } from '../services/backupExporter';
import { db } from '../db/schema';
import type { Evaluation } from '../types';

/** Where a student sits relative to the circuit this station belongs to. */
type CircuitStatus =
  | { kind: 'not-in-use' }       // this exam has no check-ins; nothing to check
  | { kind: 'this-circuit' }
  | { kind: 'other-circuit'; circuitNumber?: number }
  | { kind: 'not-checked-in' };

// Lazy load QR scanner to reduce initial bundle size
const QRScanner = lazy(() => import('../components/scanner/QRScanner'));
const ManualRegistrationModal = lazy(() => import('../components/ManualRegistrationModal'));

export default function ActiveExam() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    exams,
    circuits,
    loadCircuits,
    currentSession,
    currentEvaluation,
    loadExams,
    startEvaluation,
    updateScore,
    setGlobalRating,
    setNotes,
    submitEvaluation,
    endSession,
  } = useExamStore();
  const { candidates, loadCandidates } = useCandidateStore();
  const { checkIns, loadAllCheckInsForExam } = useCheckInStore();
  const { isOnline, pendingCount } = useSyncStore();

  const [timeRemaining, setTimeRemaining] = useState(0);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [showCandidateSelector, setShowCandidateSelector] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [sawLegacyBadge, setSawLegacyBadge] = useState(false);
  const [pendingCandidate, setPendingCandidate] = useState<{
    candidate: Candidate;
    method: IdentificationMethod;
  } | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  /** Marks already recorded at this station, so the same student is not scored twice by accident. */
  const [marksAtThisStation, setMarksAtThisStation] = useState<Evaluation[]>([]);

  // Load data on mount
  useEffect(() => {
    loadExams();
    loadCandidates();
  }, [loadExams, loadCandidates]);

  // Circuits are needed to show which circuit this station belongs to, and
  // check-ins to know which students belong to it.
  useEffect(() => {
    if (!currentSession?.examId) return;
    loadCircuits(currentSession.examId);
    loadAllCheckInsForExam(currentSession.examId);
  }, [currentSession?.examId, loadCircuits, loadAllCheckInsForExam]);

  // What has already been scored at this station.
  //
  // Reloaded whenever a mark is submitted, because the commonest duplicate of
  // all is the same examiner scanning the same student twice in a row.
  //
  // This device's own database only. A duplicate created on another tablet is
  // invisible here until the two have synced, and the hall has no internet — so
  // this catches the common case at the moment it happens, and the report
  // catches the rest before anything is published.
  useEffect(() => {
    if (!currentSession?.examId || !currentSession?.stationId) return;
    let cancelled = false;
    db.evaluations
      .where('examId')
      .equals(currentSession.examId)
      .toArray()
      .then((all) => {
        if (cancelled) return;
        setMarksAtThisStation(all.filter((e) => e.stationId === currentSession.stationId));
      });
    return () => {
      cancelled = true;
    };
  }, [currentSession?.examId, currentSession?.stationId, currentEvaluation]);

  /** The most recent mark this student already has at this station, if any. */
  const existingMarkFor = useCallback(
    (candidate: Candidate): Evaluation | undefined =>
      marksAtThisStation
        .filter((e) => e.candidateId === candidate.id)
        .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())[0],
    [marksAtThisStation]
  );

  // Get current exam and station
  const currentExam = exams.find((e) => e.id === currentSession?.examId);
  const currentStation = currentExam?.stations.find((s) => s.id === currentSession?.stationId);
  const currentCircuit = circuits.find((c) => c.id === currentSession?.circuitId);

  // Only students enrolled in this exam can be reached at all — by scanning,
  // by typing an ID, or off the list. "Show all" later widens from this
  // circuit to the whole exam, never to another cohort.
  const examCandidates = candidatesForExam(candidates, currentSession?.examId);

  // Circuit membership
  // ------------------
  // Check-in is optional, so this only constrains anything when the exam
  // actually uses it. An exam with no check-ins at all behaves exactly as it
  // did before — there is nothing to check against, and refusing to score
  // would break every exam that skips the morning check-in step.
  const examUsesCheckIn = checkIns.length > 0;

  const circuitStatusFor = useCallback(
    (candidate: Candidate): CircuitStatus => {
      if (checkIns.length === 0) return { kind: 'not-in-use' };

      const record = checkIns.find((c) => c.candidateId === candidate.id);
      if (!record) return { kind: 'not-checked-in' };
      if (record.circuitId === currentSession?.circuitId) return { kind: 'this-circuit' };

      const circuit = circuits.find((c) => c.id === record.circuitId);
      return { kind: 'other-circuit', circuitNumber: circuit?.circuitNumber };
    },
    [checkIns, circuits, currentSession?.circuitId]
  );

  // Timer effect
  //
  // Keyed on the evaluation's id rather than the evaluation object: scoring an
  // item replaces that object, so depending on it would restart the countdown
  // every time the examiner tapped a score. Both values are pulled out first
  // so the dependency list can say exactly what it means.
  const stationTimeLimit = currentStation?.timeLimit;
  const evaluationId = currentEvaluation?.id;

  useEffect(() => {
    if (stationTimeLimit === undefined || !evaluationId) return;

    setTimeRemaining(stationTimeLimit);

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          // Time's up - could play sound here
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [stationTimeLimit, evaluationId]);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Every route to a candidate — scanning, typing a college ID, picking off
  // the roster — ends here rather than starting an evaluation directly. The
  // examiner confirms against the person actually standing in front of them,
  // which is what stops a mistyped digit becoming a misattributed score.
  const proposeCandidate = useCallback((candidate: Candidate, method: IdentificationMethod) => {
    setPendingCandidate({ candidate, method });
    setScanError(null);
  }, []);

  const confirmCandidate = useCallback(() => {
    if (!pendingCandidate || !currentStation) return;
    const { candidate, method } = pendingCandidate;

    // Record when the examiner overrode a circuit warning, so these marks can
    // be reviewed later rather than disappearing into the results.
    const status = circuitStatusFor(candidate);
    const outsideCircuit = status.kind === 'other-circuit' || status.kind === 'not-checked-in';

    // If this student already has a mark here, the examiner has just been shown
    // it and chosen to score anyway. Record which mark they meant to replace —
    // the old one cannot be edited, so this is the only way the intention
    // survives to the results.
    const existing = existingMarkFor(candidate);

    setSelectedCandidateId(candidate.id);
    startEvaluation(candidate.id, currentStation, method, outsideCircuit, existing?.id);
    setPendingCandidate(null);
    setShowCandidateSelector(false);
    setSearchQuery('');
    setScanError(null);
  }, [pendingCandidate, currentStation, startEvaluation, circuitStatusFor, existingMarkFor]);

  // Typing a full college ID resolves straight to one student; anything else
  // falls through to filtering the roster by name.
  const handleSearchSubmit = useCallback(() => {
    const query = searchQuery.trim();
    if (!query) return;
    const match = findCandidateByNumber(examCandidates, query);
    if (match) proposeCandidate(match, 'typed-id');
  }, [searchQuery, examCandidates, proposeCandidate]);

  // Handle QR code scan result.
  //
  // Matching is exact. It used to be a two-way `includes()`, which meant
  // scanning badge 20240012 would resolve to candidate 2024001 and file the
  // score against the wrong person.
  const handleQRScan = useCallback((scannedText: string) => {
    setShowQRScanner(false);
    setScanError(null);

    const result = validateQR(scannedText, currentSession?.examId ?? '');

    if (result.status === 'unreadable') {
      setScanError(`Could not read that badge ("${scannedText}"). Select the candidate from the list instead.`);
      setSearchQuery(scannedText);
      return;
    }

    // A badge printed for another exam must not be scored against this one.
    if (result.status === 'wrong-exam') {
      const otherExam = exams.find((e) => e.id === result.data.examId);
      setScanError(
        `This badge is for ${otherExam ? `"${otherExam.name}"` : 'a different exam'}, not "${currentExam?.name ?? 'this exam'}". Check the candidate is at the right station.`
      );
      return;
    }

    const candidate = findCandidateByNumber(examCandidates, result.data.candidateNumber);

    if (!candidate) {
      setScanError(`No candidate with number ${result.data.candidateNumber}. Select from the list instead.`);
      setSearchQuery(result.data.candidateNumber);
      return;
    }

    // Old-format badges carry no exam, so they can't be checked against this
    // one. They still work — the examiner just gets told to reprint.
    if (result.status === 'legacy') {
      setSawLegacyBadge(true);
    }

    proposeCandidate(candidate, 'scanned');
  }, [examCandidates, exams, currentSession?.examId, currentExam?.name, proposeCandidate]);

  const circuitCandidates = examUsesCheckIn && !showAllCandidates
    ? examCandidates.filter((c) => circuitStatusFor(c).kind === 'this-circuit')
    : examCandidates;

  // Filter candidates based on search query
  const filteredCandidates = circuitCandidates.filter((c) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(query) ||
      c.nameAr?.toLowerCase().includes(query) ||
      c.candidateNumber.toLowerCase().includes(query)
    );
  });

  // Handle score update
  const handleScoreUpdate = (itemId: string, score: number) => {
    updateScore(itemId, score);
  };

  // Handle submit
  const handleSubmit = async () => {
    if (!currentEvaluation) return;

    // Check if all items are scored
    const unscoredItems = currentEvaluation.scores.filter((s) => s.score < 0);
    if (unscoredItems.length > 0) {
      if (!confirm(`${unscoredItems.length} items not scored. Submit anyway?`)) {
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await submitEvaluation();
      // Show candidate selector for next candidate
      setShowCandidateSelector(true);
      setSelectedCandidateId('');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle end session
  //
  // Offer the backup here rather than only in Settings: this is the moment the
  // examiner is finished, their marks are complete, and those marks exist in
  // exactly one place — this tablet.
  const handleEndSession = async () => {
    if (!confirm(t('session.endConfirm', 'End this exam session?'))) return;

    await endSession();

    if (
      confirm(
        t(
          'session.backupPrompt',
          'Session ended.\n\nThese marks are only on this tablet until it is synced. Download a backup file now?'
        )
      )
    ) {
      try {
        await downloadBackup();
      } catch (error) {
        console.error('Backup failed:', error);
      }
    }

    navigate('/');
  };

  // No active session
  if (!currentSession) {
    return (
      <div className="p-6 text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-4">No Active Session</h1>
        <p className="text-gray-600 mb-4">Please start an exam session first.</p>
        <button
          onClick={() => navigate('/session/setup')}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
        >
          Start Session
        </button>
      </div>
    );
  }

  // Loading
  if (!currentExam || !currentStation) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    );
  }

  const selectedCandidate = candidates.find((c) => c.id === selectedCandidateId);

  // Separate items by position (before/after findings)
  const itemsBeforeFindings = currentStation.checklistItems.filter(
    (item) => item.position !== 'after_findings'
  );
  const itemsAfterFindings = currentStation.checklistItems.filter(
    (item) => item.position === 'after_findings'
  );

  // Group items by category within each section
  const groupItemsByCategory = (items: ChecklistItem[]) => {
    return items.reduce((acc, item) => {
      const category = item.category || 'General';
      if (!acc[category]) acc[category] = [];
      acc[category].push(item);
      return acc;
    }, {} as Record<string, ChecklistItem[]>);
  };

  const groupedBeforeFindings = groupItemsByCategory(itemsBeforeFindings);
  const groupedAfterFindings = groupItemsByCategory(itemsAfterFindings);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-500">
                Circuit {currentCircuit?.circuitNumber ?? '—'} | Station {currentStation.stationNumber}
              </div>
              <div className="font-semibold text-gray-900">{currentStation.name}</div>
            </div>

            {/* Timer */}
            {currentEvaluation && (
              <div className={`text-2xl font-mono font-bold ${
                timeRemaining <= 60 ? 'text-red-600 timer-warning' :
                timeRemaining <= 120 ? 'text-orange-500' : 'text-gray-900'
              }`}>
                ⏱️ {formatTime(timeRemaining)}
              </div>
            )}

            <div className="flex items-center gap-3">
              {/* The main nav is hidden on this screen, so the only place an
                  invigilator can see whether marks have left this tablet is
                  here — where the marks are actually being made. */}
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
                  pendingCount > 0
                    ? 'bg-orange-100 text-orange-800'
                    : isOnline
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
                title={
                  pendingCount > 0
                    ? t('exam.pendingTitle', '{{count}} mark(s) not yet sent from this device', {
                        count: pendingCount,
                      })
                    : t('sync.synced', 'Synced')
                }
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    pendingCount > 0 ? 'bg-orange-500' : isOnline ? 'bg-green-500' : 'bg-gray-400'
                  }`}
                />
                {pendingCount > 0
                  ? t('exam.pendingCount', '{{count}} unsent', { count: pendingCount })
                  : isOnline
                  ? t('sync.online')
                  : t('sync.offline')}
              </span>

              <button
                onClick={handleEndSession}
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                {t('session.endSession')}
              </button>
            </div>
          </div>

          {/* Candidate Info */}
          {selectedCandidate && (
            <div className="mt-2 flex items-center gap-4 text-sm">
              <div className="flex-1">
                <span className="text-gray-500">الاسم:</span>{' '}
                <span className="font-medium">{selectedCandidate.nameAr || selectedCandidate.name}</span>
                <span className="text-gray-400 ml-2">#{selectedCandidate.candidateNumber}</span>
              </div>
              <div className="text-gray-500">
                Examiner: {currentSession.examinerName}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Candidate Selector Modal */}
      {showCandidateSelector && pendingCandidate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md flex flex-col">
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">
              {t('exam.confirmHeading', 'Confirm the student')}
            </div>
            <p className="text-gray-600 text-sm mb-5">
              {t('exam.confirmPrompt', 'Check this matches the person in front of you before scoring.')}
            </p>

            <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4 mb-4 text-center">
              <div className="text-2xl font-bold text-gray-900 leading-tight" dir="auto">
                {pendingCandidate.candidate.name}
              </div>
              {pendingCandidate.candidate.nameAr &&
                pendingCandidate.candidate.nameAr !== pendingCandidate.candidate.name && (
                  <div className="text-lg text-gray-700 mt-1" dir="rtl">
                    {pendingCandidate.candidate.nameAr}
                  </div>
                )}
              <div className="mt-3 font-mono text-xl font-bold text-blue-800">
                {pendingCandidate.candidate.candidateNumber}
              </div>
              <div className="mt-1 text-sm text-gray-600">
                {[pendingCandidate.candidate.group && `Group ${pendingCandidate.candidate.group}`,
                  pendingCandidate.candidate.stage].filter(Boolean).join(' · ')}
              </div>
            </div>

            <div className="text-xs text-gray-500 text-center mb-4">
              {IDENTIFICATION_METHOD_LABELS[pendingCandidate.method]}
            </div>

            {/* Circuit check. Only ever shown when the exam actually uses
                check-in, and never blocking — the examiner can override, and
                the override is recorded on the evaluation. */}
            {(() => {
              const status = circuitStatusFor(pendingCandidate.candidate);
              if (status.kind === 'not-in-use' || status.kind === 'this-circuit') return null;

              return (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border-2 border-red-300 text-red-800 text-sm">
                  <div className="font-semibold mb-1">
                    {status.kind === 'other-circuit'
                      ? t('exam.wrongCircuitTitle', 'Wrong circuit')
                      : t('exam.notCheckedInTitle', 'Not checked in')}
                  </div>
                  {status.kind === 'other-circuit'
                    ? t('exam.wrongCircuitBody', {
                        defaultValue:
                          'This student is checked into Circuit {{theirs}}, but this station is in Circuit {{ours}}.',
                        theirs: status.circuitNumber ?? '?',
                        ours: currentCircuit?.circuitNumber ?? '?',
                      })
                    : t('exam.notCheckedInBody', 'This student has not checked in for this exam.')}
                </div>
              );
            })()}

            {/* Already scored here.
                Shown before scoring starts, not after, so the examiner finds
                out before spending three minutes on it. Never blocking: a mark
                is write-once, so scoring again is the only way to correct one,
                and refusing would leave an examiner with a student in front of
                them and no remedy. */}
            {(() => {
              const existing = existingMarkFor(pendingCandidate.candidate);
              if (!existing) return null;
              return (
                <div className="mb-4 p-3 rounded-xl bg-amber-50 border-2 border-amber-300 text-amber-900 text-sm">
                  <div className="font-semibold mb-1">
                    {t('exam.alreadyScoredTitle')}
                  </div>
                  <div>
                    {t('exam.alreadyScoredBody', {
                      score: existing.totalScore,
                      max: existing.maxPossibleScore,
                      examiner: existing.examinerName,
                      time: existing.startTime.toLocaleTimeString(),
                    })}
                  </div>
                  <div className="mt-2 text-xs">{t('exam.alreadyScoredHint')}</div>
                </div>
              );
            })()}

            <div className="flex gap-3">
              <button
                onClick={() => setPendingCandidate(null)}
                className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                {t('exam.notThisStudent', 'Not this student')}
              </button>
              {(() => {
                const status = circuitStatusFor(pendingCandidate.candidate);
                const flagged = status.kind === 'other-circuit' || status.kind === 'not-checked-in';
                const alreadyScored = Boolean(existingMarkFor(pendingCandidate.candidate));
                return (
                  <button
                    onClick={confirmCandidate}
                    className={`flex-1 py-3 rounded-xl font-semibold text-white transition-colors ${
                      flagged
                        ? 'bg-red-600 hover:bg-red-700'
                        : alreadyScored
                          ? 'bg-amber-600 hover:bg-amber-700'
                          : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    {flagged
                      ? t('exam.scoreAnyway', 'Score anyway')
                      : alreadyScored
                        ? t('exam.scoreAgain')
                        : t('exam.startEvaluation', 'Start scoring')}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {showCandidateSelector && !pendingCandidate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            <h2 className="text-xl font-bold mb-4">{t('exam.selectCandidate')}</h2>

            {/* QR Scanner Button */}
            <button
              onClick={() => setShowQRScanner(true)}
              className="w-full mb-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <span className="text-xl">📷</span>
              Scan QR Badge
            </button>

            {/* Scan Error */}
            {scanError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {scanError}
              </div>
            )}

            {/* Old-format badges can't be checked against this exam */}
            {sawLegacyBadge && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                These badges were printed in the old format and carry no exam. They
                still scan, but a badge from another exam would not be caught.
                Reprint from Settings before the next exam.
              </div>
            )}

            {/* College ID or name. A full ID resolves to one student; anything
                else filters the roster below. */}
            <div className="mb-4 flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
                placeholder={t('exam.findPlaceholder', 'College ID, or search by name')}
                className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={handleSearchSubmit}
                disabled={!searchQuery.trim()}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-900 disabled:bg-gray-300 text-white rounded-lg font-medium transition-colors"
              >
                {t('common.find', 'Find')}
              </button>
            </div>

            {/* When the exam uses check-in, show this circuit's students by
                default — the ones who should actually be at this station. */}
            {examUsesCheckIn && (
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  {showAllCandidates
                    ? t('exam.showingAll', 'Showing all candidates')
                    : t('exam.showingCircuit', 'Circuit {{n}} only', {
                        n: currentCircuit?.circuitNumber ?? '?',
                      })}
                </span>
                <button
                  onClick={() => setShowAllCandidates((v) => !v)}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  {showAllCandidates
                    ? t('exam.showCircuitOnly', 'Show this circuit only')
                    : t('exam.showAll', 'Show all')}
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {candidates.length === 0 ? (
                <p className="text-gray-500 text-center py-4">
                  No candidates loaded. Import candidates first.
                </p>
              ) : filteredCandidates.length === 0 ? (
                <p className="text-gray-500 text-center py-4">
                  {searchQuery
                    ? `No candidates match "${searchQuery}"`
                    : t('exam.noneInCircuit', 'Nobody has checked in to this circuit yet.')}
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredCandidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      onClick={() => proposeCandidate(candidate, 'list')}
                      className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                    >
                      <div className="font-medium">{candidate.name}</div>
                      {candidate.nameAr && (
                        <div className="text-sm text-gray-600" dir="rtl">{candidate.nameAr}</div>
                      )}
                      <div className="text-xs text-gray-400">#{candidate.candidateNumber}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Late registration. A real student in front of an examiner has
                to be scoreable, roster or no roster. */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-500 mb-2">
                {t('exam.notOnRoster', 'Student not on the list?')}
              </p>
              <button
                onClick={() => setShowManualEntry(true)}
                className="w-full py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                {t('exam.registerHere', 'Register them at this station')}
              </button>
            </div>

            <button
              onClick={() => navigate('/session/setup')}
              className="mt-4 text-gray-500 hover:text-gray-700"
            >
              {t('common.back')}
            </button>
          </div>
        </div>
      )}

      {/* Late registration — lands on the same confirmation panel as every
          other route to a candidate. */}
      {showManualEntry && (
        <Suspense fallback={null}>
          <ManualRegistrationModal
            examId={currentSession.examId}
            registeredWhere="station"
            registeredBy={currentSession.examinerName}
            onCancel={() => setShowManualEntry(false)}
            onRegistered={(candidate) => {
              setShowManualEntry(false);
              proposeCandidate(
                candidate,
                candidate.provisional ? 'manual-entry' : 'list'
              );
            }}
          />
        </Suspense>
      )}

      {/* QR Scanner Modal */}
      {showQRScanner && (
        <Suspense fallback={
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-3 text-gray-600">Loading camera...</p>
            </div>
          </div>
        }>
          <QRScanner
            onScan={handleQRScan}
            onClose={() => setShowQRScanner(false)}
            onError={(err) => console.error('QR Scanner error:', err)}
          />
        </Suspense>
      )}

      {/* Main Content - Only show when evaluating */}
      {currentEvaluation && (
        <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
          {/* Scenario & Tasks */}
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="text-sm font-medium text-gray-500 mb-1">{t('exam.scenario')}</div>
            <div className="text-gray-900">{currentStation.scenario}</div>
            {currentStation.tasks.length > 0 && (
              <div className="mt-3">
                <div className="text-sm font-medium text-gray-500 mb-1">{t('exam.tasks')}</div>
                <ol className="list-decimal list-inside text-sm text-gray-700">
                  {currentStation.tasks.filter(t => t).map((task, i) => (
                    <li key={i}>{task}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {/* Checklist Items BEFORE Findings */}
          {Object.entries(groupedBeforeFindings).map(([category, items]) => (
            <div key={category} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <h3 className="font-medium text-gray-700">{category}</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {items.map((item) => {
                  const scoreEntry = currentEvaluation.scores.find((s) => s.itemId === item.id);
                  const currentScore = scoreEntry?.score ?? -1;

                  return (
                    <div key={item.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 text-sm text-gray-900">{item.text}</div>
                        <div className="flex gap-1">
                          {item.scoringOptions.map((option) => (
                            <button
                              key={option.value}
                              onClick={() => handleScoreUpdate(item.id, option.value)}
                              className={`score-btn flex items-center justify-center rounded-lg text-sm font-medium transition-all ${
                                currentScore === option.value
                                  ? 'bg-blue-600 text-white shadow-md'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              {option.value}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Examination Findings */}
          {currentStation.examinationFindings && (
            <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
              <div className="text-sm font-medium text-amber-700 mb-2">
                📋 {t('exam.examinationFindings')}
              </div>
              <div className="text-sm text-amber-900 whitespace-pre-wrap">
                {currentStation.examinationFindings}
              </div>
            </div>
          )}

          {/* Checklist Items AFTER Findings (DDX, Investigations, etc.) */}
          {Object.entries(groupedAfterFindings).map(([category, items]) => (
            <div key={`after-${category}`} className="bg-white rounded-xl border border-green-200 overflow-hidden">
              <div className="bg-green-50 px-4 py-2 border-b border-green-200">
                <h3 className="font-medium text-green-700">{category}</h3>
              </div>
              <div className="divide-y divide-green-100">
                {items.map((item) => {
                  const scoreEntry = currentEvaluation.scores.find((s) => s.itemId === item.id);
                  const currentScore = scoreEntry?.score ?? -1;

                  return (
                    <div key={item.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 text-sm text-gray-900">{item.text}</div>
                        <div className="flex gap-1">
                          {item.scoringOptions.map((option) => (
                            <button
                              key={option.value}
                              onClick={() => handleScoreUpdate(item.id, option.value)}
                              className={`score-btn flex items-center justify-center rounded-lg text-sm font-medium transition-all ${
                                currentScore === option.value
                                  ? 'bg-green-600 text-white shadow-md'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              {option.value}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Global Rating */}
          {currentStation.globalRatingEnabled && (
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="text-sm font-medium text-gray-700 mb-3">{t('exam.globalRating')}</div>
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2, 3, 4].map((rating) => (
                  <button
                    key={rating}
                    onClick={() => setGlobalRating(rating)}
                    className={`flex-1 min-w-[80px] py-3 px-2 rounded-lg text-sm font-medium transition-all ${
                      currentEvaluation.globalRating === rating
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <div className="text-lg">{rating}</div>
                    <div className="text-xs opacity-75">
                      {GLOBAL_RATING_LABELS[rating as keyof typeof GLOBAL_RATING_LABELS]}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="text-sm font-medium text-gray-700 mb-2">{t('exam.notes')}</div>
            <textarea
              value={currentEvaluation.notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Score Summary & Submit */}
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm text-gray-500">{t('exam.totalScore')}</div>
                <div className="text-2xl font-bold text-gray-900">
                  {currentEvaluation.totalScore} / {currentEvaluation.maxPossibleScore}
                  <span className="text-lg text-gray-500 ml-2">
                    ({Math.round((currentEvaluation.totalScore / currentEvaluation.maxPossibleScore) * 100)}%)
                  </span>
                </div>
              </div>
              <div className={`text-sm font-medium px-3 py-1 rounded-full ${
                currentEvaluation.totalScore / currentEvaluation.maxPossibleScore >= 0.6
                  ? 'bg-green-100 text-green-700'
                  : currentEvaluation.totalScore / currentEvaluation.maxPossibleScore >= 0.5
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-red-100 text-red-700'
              }`}>
                {currentEvaluation.totalScore / currentEvaluation.maxPossibleScore >= 0.6
                  ? 'PASS'
                  : currentEvaluation.totalScore / currentEvaluation.maxPossibleScore >= 0.5
                  ? 'BORDERLINE'
                  : 'FAIL'}
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white py-4 rounded-xl font-semibold text-lg shadow-lg transition-all active:scale-[0.98]"
            >
              {isSubmitting ? t('common.loading') : t('exam.submitEvaluation')} →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
