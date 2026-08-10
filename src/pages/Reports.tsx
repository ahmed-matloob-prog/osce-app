import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useExamStore } from '../stores/examStore';
import { useCandidateStore } from '../stores/candidateStore';
import { db } from '../db/schema';
import { mergeCloudEvaluations } from '../db/sync';
import {
  generateStationReport,
  generateCandidateSummaryReport,
  generateCohortReport,
  downloadPDF,
  previewPDF,
} from '../services/pdfGenerator';
import {
  exportCohortToExcel,
  exportCandidateToExcel,
} from '../services/excelExporter';
import type { Evaluation, Circuit, Candidate } from '../types';

export default function Reports() {
  const { t } = useTranslation();
  const { exams, loadExams } = useExamStore();
  const { candidates, loadCandidates } = useCandidateStore();

  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  // Resolved from the database by id rather than from the roster — see below.
  const [examinedCandidates, setExaminedCandidates] = useState<Candidate[]>([]);
  const [orphanedMarks, setOrphanedMarks] = useState(0);
  /** Marks per exam, so the picker can say which exams actually have results. */
  const [marksByExam, setMarksByExam] = useState<Record<string, number>>({});
  const [pulling, setPulling] = useState(false);
  const [pulledOffline, setPulledOffline] = useState(false);
  /** Bumped to re-run the loader after a manual refresh. */
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [reportType, setReportType] = useState<'cohort' | 'candidate' | 'station'>('cohort');

  // Load exams and candidates on mount
  useEffect(() => {
    loadExams();
    loadCandidates();
    // Which exams have results at all. Without this the picker is a list of
    // names that give no clue which one to open.
    db.evaluations.toArray().then((all) => {
      const counts: Record<string, number> = {};
      for (const e of all) counts[e.examId] = (counts[e.examId] ?? 0) + 1;
      setMarksByExam(counts);
    });
  }, [loadExams, loadCandidates]);

  // Load evaluations and circuits when exam is selected
  useEffect(() => {
    if (!selectedExamId) {
      setEvaluations([]);
      setCircuits([]);
      setExaminedCandidates([]);
      setOrphanedMarks(0);
      return;
    }

    const loadData = async () => {
      setIsLoading(true);
      try {
        // Other devices' marks first. Without this the screen shows only what
        // was scored here, and says nothing about the rest.
        setPulling(true);
        const pulled = await mergeCloudEvaluations(selectedExamId);
        setPulledOffline(pulled.offline);
        setPulling(false);

        // Load evaluations
        const evals = await db.evaluations
          .where('examId')
          .equals(selectedExamId)
          .toArray();
        setEvaluations(evals);

        // Who was examined — looked up by id, including students who have since
        // been removed from the roster.
        //
        // This used to filter the live roster, which drops anyone soft-deleted.
        // A student taken off the roster after sitting the exam still has marks,
        // and those marks still belong to them: the cohort report simply counted
        // fewer people than sat, and said nothing about it. A results document
        // that silently loses a candidate is the worst kind of wrong.
        const ids = [...new Set(evals.map((e) => e.candidateId))];
        const rows = await db.candidates.bulkGet(ids);
        setExaminedCandidates(rows.filter((c): c is Candidate => Boolean(c)));
        // Marks whose student is not on this device at all. Usually means this
        // tablet has not pulled the roster yet, and the report would be
        // incomplete if published as it stands.
        setOrphanedMarks(rows.filter((c) => !c).length);

        // Load circuits for this exam
        const examCircuits = (await db.circuits
          .where('examId')
          .equals(selectedExamId)
          .toArray()).filter((c) => !c.deleted);
        setCircuits(examCircuits);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [selectedExamId, refreshKey]);

  const selectedExam = exams.find((e) => e.id === selectedExamId);
  const selectedCandidate =
    examinedCandidates.find((c) => c.id === selectedCandidateId) ??
    candidates.find((c) => c.id === selectedCandidateId);

  // Everyone with a mark in this exam, roster or not.
  const evaluatedCandidates = examinedCandidates;

  // The same student scored more than once at the same station.
  //
  // Nothing stops an examiner scoring a candidate twice — a mis-scan, a
  // re-scan after a correction, or simply picking the wrong name and fixing it
  // by doing it again. Both marks are stored, both go into the totals, and
  // until now nothing anywhere said so. Somebody has to decide which one
  // counts, and they can only do that if they know it happened.
  const duplicateMarks = (() => {
    const byStudentStation = new Map<string, Evaluation[]>();
    for (const e of evaluations) {
      const key = `${e.candidateId}|${e.stationId}`;
      byStudentStation.set(key, [...(byStudentStation.get(key) ?? []), e]);
    }
    return [...byStudentStation.values()]
      .filter((group) => group.length > 1)
      .map((group) => {
        const marks = group.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
        // Did the examiner know? A mark that names the one before it was
        // entered by someone who had just been shown that mark and chose to
        // score again — a correction. A pair where neither names the other is a
        // duplicate nobody saw, and only a person can decide which stands.
        const superseded = new Set(marks.map((m) => m.supersedes).filter(Boolean));
        const deliberate = marks.some((m) => m.supersedes);
        return {
          candidate: examinedCandidates.find((c) => c.id === marks[0].candidateId),
          marks,
          deliberate,
          replaced: superseded,
        };
      });
  })();

  const unnoticedDuplicates = duplicateMarks.filter((d) => !d.deliberate);
  const corrections = duplicateMarks.filter((d) => d.deliberate);

  // Get evaluations for selected candidate
  const candidateEvaluations = evaluations.filter(
    (e) => e.candidateId === selectedCandidateId
  );

  // Generate and download cohort report
  const handleCohortReport = () => {
    if (!selectedExam || evaluations.length === 0) {
      alert(t('reports.noData', 'No evaluation data available'));
      return;
    }

    const doc = generateCohortReport(selectedExam, evaluatedCandidates, evaluations, circuits);
    const filename = `${selectedExam.name.replace(/\s+/g, '_')}_Cohort_Report.pdf`;
    downloadPDF(doc, filename);
  };

  // Generate and download candidate summary report
  const handleCandidateReport = () => {
    if (!selectedExam || !selectedCandidate || candidateEvaluations.length === 0) {
      alert(t('reports.selectCandidate', 'Please select a candidate with evaluations'));
      return;
    }

    const doc = generateCandidateSummaryReport(
      selectedCandidate,
      candidateEvaluations,
      selectedExam,
      circuits
    );
    const filename = `${selectedCandidate.candidateNumber}_${selectedExam.name.replace(/\s+/g, '_')}_Report.pdf`;
    downloadPDF(doc, filename);
  };

  // Generate station report for a specific evaluation
  const handleStationReport = (evaluation: Evaluation) => {
    if (!selectedExam) return;

    const station = selectedExam.stations.find((s) => s.id === evaluation.stationId);
    const candidate = candidates.find((c) => c.id === evaluation.candidateId);
    const circuit = circuits.find((c) => c.id === evaluation.circuitId);

    if (!station || !candidate) {
      alert(t('reports.dataError', 'Could not find station or candidate data'));
      return;
    }

    const doc = generateStationReport(
      evaluation,
      candidate,
      station,
      selectedExam.name,
      circuit
    );
    const filename = `${candidate.candidateNumber}_Station${station.stationNumber}_Report.pdf`;
    downloadPDF(doc, filename);
  };

  // Preview report in new tab
  const handlePreviewCohortReport = () => {
    if (!selectedExam || evaluations.length === 0) {
      alert(t('reports.noData', 'No evaluation data available'));
      return;
    }

    const doc = generateCohortReport(selectedExam, evaluatedCandidates, evaluations, circuits);
    previewPDF(doc);
  };

  // Excel export - Cohort
  const handleCohortExcel = () => {
    if (!selectedExam || evaluations.length === 0) {
      alert(t('reports.noData', 'No evaluation data available'));
      return;
    }

    exportCohortToExcel(selectedExam, evaluatedCandidates, evaluations, circuits);
  };

  // Excel export - Candidate
  const handleCandidateExcel = () => {
    if (!selectedExam || !selectedCandidate || candidateEvaluations.length === 0) {
      alert(t('reports.selectCandidate', 'Please select a candidate with evaluations'));
      return;
    }

    exportCandidateToExcel(selectedCandidate, selectedExam, candidateEvaluations, circuits);
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('reports.title')}</h1>

      {/* Exam Selection */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="font-semibold text-gray-900 mb-3">{t('reports.selectExam', 'Select Exam')}</h2>
        <select
          value={selectedExamId}
          onChange={(e) => {
            setSelectedExamId(e.target.value);
            setSelectedCandidateId('');
          }}
          className="w-full border border-gray-300 rounded-lg px-3 py-2"
        >
          <option value="">{t('reports.chooseExam', '-- Choose an exam --')}</option>
          {exams.map((exam) => (
            <option key={exam.id} value={exam.id}>
              {exam.name}
              {marksByExam[exam.id]
                ? ` — ${t('reports.marksCount', { count: marksByExam[exam.id] })}`
                : ''}
            </option>
          ))}
        </select>

        {selectedExamId && (
          <div className="mt-3 text-sm text-gray-600">
            {isLoading ? (
              <span>{pulling ? t('reports.pulling') : `${t('common.loading')}...`}</span>
            ) : (
              <span>
                {t('reports.evaluationCount', '{{count}} evaluations found', {
                  count: evaluations.length,
                })}
                {' • '}
                {t('reports.candidateCount', '{{count}} candidates', {
                  count: evaluatedCandidates.length,
                })}
                {' · '}
                <button
                  onClick={() => setRefreshKey((n) => n + 1)}
                  className="text-blue-600 hover:text-blue-700 underline underline-offset-2"
                >
                  {t('reports.refresh')}
                </button>
              </span>
            )}
            {/* Marks from other tablets could not be fetched, so what is on
                screen is this device's own view and may be short. */}
            {pulledOffline && !isLoading && (
              <p className="mt-2 text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                {t('reports.offlineResults')}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Nothing chosen yet. The page below the picker was simply empty, which
          is indistinguishable from "this exam has no results". */}
      {!selectedExamId && (
        <p className="text-sm text-gray-500 text-center py-8">{t('reports.choosePrompt')}</p>
      )}

      {/* Nothing to report yet.
          The page used to render the exam picker and then simply stop, with no
          explanation — which reads as a broken report screen rather than an
          exam nobody has scored yet. */}
      {selectedExamId && !isLoading && evaluations.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center mb-4">
          <div className="text-4xl mb-3">📊</div>
          <h2 className="font-semibold text-gray-900">{t('reports.emptyTitle')}</h2>
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
            {t('reports.emptyBody')}
          </p>
        </div>
      )}

      {/* One student, one station, two marks. Which counts is not the app's
          decision to make, but hiding it is not an option either. */}
      {duplicateMarks.length > 0 &&
        (() => {
          const stationName = (id: string) =>
            selectedExam?.stations.find((st) => st.id === id)?.name ?? id;

          // Tailwind only keeps classes it can see written out, so the colour
          // is passed as a whole class name rather than built from a fragment.
          const list = (group: typeof duplicateMarks, toneClass: string) => (
            <ul className={`mt-3 space-y-2 text-sm ${toneClass}`}>
              {group.map(({ candidate, marks, replaced }) => (
                <li key={marks[0].id}>
                  <span className="font-medium">
                    {candidate?.candidateNumber ?? t('reports.unknownStudent')}
                  </span>
                  {candidate?.name ? ` — ${candidate.name}` : ''}
                  <span className="block">
                    {stationName(marks[0].stationId)}:{' '}
                    {marks.map((m, i) => (
                      <span
                        key={m.id}
                        className={replaced.has(m.id) ? 'line-through opacity-60' : 'font-medium'}
                      >
                        {i > 0 ? '  →  ' : ''}
                        {m.totalScore}/{m.maxPossibleScore} ({m.examinerName},{' '}
                        {new Date(m.startTime).toLocaleTimeString()})
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          );

          return (
            <>
              {/* Nobody saw these happen. Someone has to decide. */}
              {unnoticedDuplicates.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                  <p className="text-sm font-medium text-red-900">
                    {t('reports.duplicateTitle', { count: unnoticedDuplicates.length })}
                  </p>
                  <p className="text-sm text-red-900 mt-1">{t('reports.duplicateBody')}</p>
                  {list(unnoticedDuplicates, 'text-red-900')}
                </div>
              )}

              {/* The examiner was shown the earlier mark and scored again, so
                  the later one is what they meant. Still listed — a correction
                  is a thing a results committee should be able to see. */}
              {corrections.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                  <p className="text-sm font-medium text-amber-900">
                    {t('reports.correctionTitle', { count: corrections.length })}
                  </p>
                  <p className="text-sm text-amber-900 mt-1">{t('reports.correctionBody')}</p>
                  {list(corrections, 'text-amber-900')}
                </div>
              )}
            </>
          );
        })()}

      {/* Marks whose student is not on this device. The report would be
          incomplete, and that has to be said before anybody publishes it. */}
      {orphanedMarks > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <p className="text-sm text-amber-900 font-medium">
            {t('reports.orphanedTitle', { count: orphanedMarks })}
          </p>
          <p className="text-sm text-amber-900 mt-1">{t('reports.orphanedBody')}</p>
        </div>
      )}

      {/* Report Type Selection */}
      {selectedExamId && evaluations.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <h2 className="font-semibold text-gray-900 mb-3">{t('reports.reportType', 'Report Type')}</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setReportType('cohort')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                reportType === 'cohort'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t('reports.cohortReport', 'Cohort Summary')}
            </button>
            <button
              onClick={() => setReportType('candidate')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                reportType === 'candidate'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t('reports.candidateReport', 'Candidate Report')}
            </button>
            <button
              onClick={() => setReportType('station')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                reportType === 'station'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t('reports.stationReports', 'Station Reports')}
            </button>
          </div>
        </div>
      )}

      {/* Cohort Report Section */}
      {reportType === 'cohort' && selectedExamId && evaluations.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <h2 className="font-semibold text-gray-900 mb-3">{t('reports.cohortReport', 'Cohort Summary')}</h2>
          <p className="text-sm text-gray-600 mb-4">
            {t('reports.cohortDescription', 'Generate a summary report for all candidates in this exam.')}
          </p>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-gray-900">{evaluatedCandidates.length}</div>
              <div className="text-xs text-gray-500">{t('reports.candidates', 'Candidates')}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-gray-900">{selectedExam?.stations.length || 0}</div>
              <div className="text-xs text-gray-500">{t('reports.stations', 'Stations')}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-gray-900">{evaluations.length}</div>
              <div className="text-xs text-gray-500">{t('reports.evaluations', 'Evaluations')}</div>
            </div>
          </div>

          <div className="flex gap-2 mb-2">
            <button
              onClick={handleCohortExcel}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium transition-colors"
            >
              {t('reports.downloadExcel', 'Download Excel')}
            </button>
            <button
              onClick={handleCohortReport}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium transition-colors"
            >
              {t('reports.downloadPDF', 'Download PDF')}
            </button>
          </div>
          <button
            onClick={handlePreviewCohortReport}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg font-medium transition-colors"
          >
            {t('reports.previewPDF', 'Preview PDF')}
          </button>
        </div>
      )}

      {/* Candidate Report Section */}
      {reportType === 'candidate' && selectedExamId && evaluations.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <h2 className="font-semibold text-gray-900 mb-3">{t('reports.candidateReport', 'Candidate Report')}</h2>

          <select
            value={selectedCandidateId}
            onChange={(e) => setSelectedCandidateId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4"
          >
            <option value="">{t('reports.chooseCandidate', '-- Choose a candidate --')}</option>
            {evaluatedCandidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.candidateNumber} - {candidate.name}
              </option>
            ))}
          </select>

          {selectedCandidateId && candidateEvaluations.length > 0 && (
            <>
              <div className="bg-gray-50 rounded-lg p-3 mb-4">
                <div className="text-sm text-gray-600">
                  {t('reports.stationsCompleted', 'Stations completed: {{count}}/{{total}}', {
                    count: candidateEvaluations.length,
                    total: selectedExam?.stations.length || 0,
                  })}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCandidateExcel}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium transition-colors"
                >
                  {t('reports.downloadExcel', 'Download Excel')}
                </button>
                <button
                  onClick={handleCandidateReport}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium transition-colors"
                >
                  {t('reports.downloadPDF', 'Download PDF')}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Station Reports Section */}
      {reportType === 'station' && selectedExamId && evaluations.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <h2 className="font-semibold text-gray-900 mb-3">{t('reports.stationReports', 'Station Reports')}</h2>
          <p className="text-sm text-gray-600 mb-4">
            {t('reports.stationDescription', 'Download individual station evaluation reports.')}
          </p>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {evaluations.map((evaluation) => {
              const station = selectedExam?.stations.find((s) => s.id === evaluation.stationId);
              const candidate = candidates.find((c) => c.id === evaluation.candidateId);
              const percentage = ((evaluation.totalScore / evaluation.maxPossibleScore) * 100).toFixed(0);

              return (
                <div
                  key={evaluation.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <div className="font-medium text-gray-900">
                      {candidate?.candidateNumber || 'Unknown'} - {station?.name || 'Unknown Station'}
                    </div>
                    <div className="text-sm text-gray-500">
                      {evaluation.totalScore}/{evaluation.maxPossibleScore} ({percentage}%)
                      {' • '}
                      {evaluation.examinerName}
                    </div>
                  </div>
                  <button
                    onClick={() => handleStationReport(evaluation)}
                    className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                  >
                    {t('reports.download', 'Download')}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {(!selectedExamId || evaluations.length === 0) && (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <div className="text-4xl mb-4">📊</div>
          <p className="text-gray-500">
            {!selectedExamId
              ? t('reports.selectExamPrompt', 'Select an exam to view reports')
              : t('reports.noEvaluations', 'No evaluations found for this exam')}
          </p>
          <p className="text-gray-400 text-sm mt-2">
            {t('reports.hint', 'Complete some evaluations to generate reports')}
          </p>
        </div>
      )}
    </div>
  );
}
