import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useExamStore } from '../stores/examStore';
import { useCandidateStore } from '../stores/candidateStore';
import { db } from '../db/schema';
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
import type { Evaluation, Circuit } from '../types';

export default function Reports() {
  const { t } = useTranslation();
  const { exams, loadExams } = useExamStore();
  const { candidates, loadCandidates } = useCandidateStore();

  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [reportType, setReportType] = useState<'cohort' | 'candidate' | 'station'>('cohort');

  // Load exams and candidates on mount
  useEffect(() => {
    loadExams();
    loadCandidates();
  }, [loadExams, loadCandidates]);

  // Load evaluations and circuits when exam is selected
  useEffect(() => {
    if (!selectedExamId) {
      setEvaluations([]);
      setCircuits([]);
      return;
    }

    const loadData = async () => {
      setIsLoading(true);
      try {
        // Load evaluations
        const evals = await db.evaluations
          .where('examId')
          .equals(selectedExamId)
          .toArray();
        setEvaluations(evals);

        // Load circuits for this exam
        const examCircuits = await db.circuits
          .where('examId')
          .equals(selectedExamId)
          .toArray();
        setCircuits(examCircuits);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [selectedExamId]);

  const selectedExam = exams.find((e) => e.id === selectedExamId);
  const selectedCandidate = candidates.find((c) => c.id === selectedCandidateId);

  // Get candidates who have evaluations for this exam
  const evaluatedCandidateIds = [...new Set(evaluations.map((e) => e.candidateId))];
  const evaluatedCandidates = candidates.filter((c) => evaluatedCandidateIds.includes(c.id));

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
            </option>
          ))}
        </select>

        {selectedExamId && (
          <div className="mt-3 text-sm text-gray-600">
            {isLoading ? (
              <span>{t('common.loading')}...</span>
            ) : (
              <span>
                {t('reports.evaluationCount', '{{count}} evaluations found', {
                  count: evaluations.length,
                })}
                {' • '}
                {t('reports.candidateCount', '{{count}} candidates', {
                  count: evaluatedCandidates.length,
                })}
              </span>
            )}
          </div>
        )}
      </div>

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
