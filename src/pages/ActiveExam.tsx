import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useExamStore } from '../stores/examStore';
import { useCandidateStore } from '../stores/candidateStore';
import type { ChecklistItem } from '../types';
import { GLOBAL_RATING_LABELS } from '../types';

// Lazy load QR scanner to reduce initial bundle size
const QRScanner = lazy(() => import('../components/scanner/QRScanner'));

export default function ActiveExam() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    exams,
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

  const [timeRemaining, setTimeRemaining] = useState(0);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [showCandidateSelector, setShowCandidateSelector] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);

  // Load data on mount
  useEffect(() => {
    loadExams();
    loadCandidates();
  }, [loadExams, loadCandidates]);

  // Get current exam and station
  const currentExam = exams.find((e) => e.id === currentSession?.examId);
  const currentStation = currentExam?.stations.find((s) => s.id === currentSession?.stationId);

  // Timer effect
  useEffect(() => {
    if (!currentStation || !currentEvaluation) return;

    setTimeRemaining(currentStation.timeLimit);

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
  }, [currentStation, currentEvaluation?.id]);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle candidate selection and start evaluation
  const handleSelectCandidate = useCallback((candidateId: string) => {
    if (!currentStation) return;
    setSelectedCandidateId(candidateId);
    startEvaluation(candidateId, currentStation);
    setShowCandidateSelector(false);
    setSearchQuery('');
    setScanError(null);
  }, [currentStation, startEvaluation]);

  // Handle QR code scan result
  const handleQRScan = useCallback((scannedText: string) => {
    setShowQRScanner(false);
    setScanError(null);

    // Try to find candidate by candidate number (exact match or contains)
    const candidate = candidates.find(
      (c) => c.candidateNumber === scannedText ||
             c.candidateNumber.includes(scannedText) ||
             scannedText.includes(c.candidateNumber)
    );

    if (candidate) {
      handleSelectCandidate(candidate.id);
    } else {
      // Show error and keep selector open
      setScanError(`Candidate not found for code: "${scannedText}". Please select manually.`);
      setSearchQuery(scannedText);
    }
  }, [candidates, handleSelectCandidate]);

  // Filter candidates based on search query
  const filteredCandidates = candidates.filter((c) => {
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
  const handleEndSession = async () => {
    if (confirm('End this exam session?')) {
      await endSession();
      navigate('/');
    }
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
                Circuit {currentSession.circuitId?.slice(-1) || '1'} | Station {currentStation.stationNumber}
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

            <button
              onClick={handleEndSession}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              {t('session.endSession')}
            </button>
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
      {showCandidateSelector && (
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
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                {scanError}
              </div>
            )}

            {/* Search Box */}
            <div className="mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or number..."
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto">
              {candidates.length === 0 ? (
                <p className="text-gray-500 text-center py-4">
                  No candidates loaded. Import candidates first.
                </p>
              ) : filteredCandidates.length === 0 ? (
                <p className="text-gray-500 text-center py-4">
                  No candidates match "{searchQuery}"
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredCandidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      onClick={() => handleSelectCandidate(candidate.id)}
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

            <button
              onClick={() => navigate('/session/setup')}
              className="mt-4 text-gray-500 hover:text-gray-700"
            >
              {t('common.back')}
            </button>
          </div>
        </div>
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
