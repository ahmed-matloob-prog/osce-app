import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCandidateStore } from '../stores/candidateStore';
import { useExamStore } from '../stores/examStore';
import { candidatesForExam } from '../utils/qrUtils';
import CandidateImportModal from '../components/import/CandidateImportModal';
import type { Candidate } from '../types';

export default function Candidates() {
  const { t } = useTranslation();
  const { candidates, isLoading, loadCandidates, importCandidates, addCandidate, deleteCandidate, clearAll, confirmProvisional, deletedCandidates, loadDeletedCandidates, restoreDeletedCandidates } = useCandidateStore();
  const { exams, loadExams } = useExamStore();
  const [examFilter, setExamFilter] = useState('');

  // The roster is institution-wide; an exam filter shows one cohort at a time.
  const visibleCandidates = examFilter
    ? candidatesForExam(candidates, examFilter)
    : candidates;

  // Filtered in JS rather than by index — IndexedDB has no boolean key type
  const provisionalCandidates = visibleCandidates.filter((c) => c.provisional);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCandidate, setNewCandidate] = useState({
    name: '',
    nameAr: '',
    candidateNumber: '',
    group: '',
    stage: '',
  });

  useEffect(() => {
    loadCandidates();
    loadExams();
    loadDeletedCandidates();
  }, [loadCandidates, loadExams, loadDeletedCandidates]);

  const handleRestoreDeleted = async () => {
    const { restored, blocked } = await restoreDeletedCandidates();
    const lines = [t('candidates.restored', '{{count}} students restored.', { count: restored })];
    if (blocked.length > 0) {
      lines.push(
        `${t('candidates.restoreBlocked', {
          count: blocked.length,
          defaultValue: '{{count}} could not be restored — their college ID is now used by someone else:',
        })}\n${blocked.slice(0, 10).join(', ')}`
      );
    }
    alert(lines.join('\n\n'));
  };

  const handleImport = async (examId: string, candidatesToImport: Omit<Candidate, 'id'>[]) => {
    const { added, enrolled, skipped } = await importCandidates(examId, candidatesToImport);

    // Say plainly what happened to every row. A silent "import successful"
    // after they were all skipped is how you find out on exam morning that
    // you loaded the wrong file.
    const lines = [t('candidates.importSuccess', { count: added })];

    if (enrolled > 0) {
      lines.push(
        t('candidates.importEnrolled', {
          count: enrolled,
          defaultValue: '{{count}} already on file, now added to this exam.',
        })
      );
    }

    if (skipped.length > 0) {
      const shown = skipped.slice(0, 10).join(', ');
      const more = skipped.length > 10 ? ` … +${skipped.length - 10}` : '';
      lines.push(
        `${t('candidates.importSkipped', {
          count: skipped.length,
          defaultValue: '{{count}} already in this exam and left unchanged:',
        })}\n${shown}${more}`
      );
    }

    alert(lines.join('\n\n'));
    setShowImportModal(false);
  };

  const handleAddCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCandidate.nameAr || !newCandidate.candidateNumber || !newCandidate.stage) return;

    await addCandidate(newCandidate);
    setNewCandidate({ name: '', nameAr: '', candidateNumber: '', group: '', stage: '' });
    setShowAddForm(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm(t('candidates.deleteConfirm'))) {
      await deleteCandidate(id);
    }
  };

  const handleClearAll = async () => {
    if (confirm(t('candidates.clearAllConfirm',
      'Delete all students?\n\nThey are hidden rather than destroyed, and can be restored from this page.'))) {
      await clearAll();
      await loadDeletedCandidates();
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('candidates.title')}</h1>
        <div className="flex gap-2">
          {candidates.length > 0 && (
            <button
              onClick={handleClearAll}
              className="bg-red-100 hover:bg-red-200 text-red-700 px-4 py-2 rounded-lg font-medium transition-colors"
            >
              {t('candidates.clearAll', 'حذف الكل')}
            </button>
          )}
          <button
            onClick={() => setShowImportModal(true)}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors"
          >
            {t('candidates.importCSV')}
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            {t('candidates.addCandidate')}
          </button>
        </div>
      </div>

      {/* Deleted students. "Delete all" is one tap, so it must not be a
          one-way door. */}
      {deletedCandidates.length > 0 && (
        <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium text-gray-800">
              {t('candidates.deletedTitle', '{{count}} deleted students', { count: deletedCandidates.length })}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {t('candidates.deletedHint', 'Hidden, not destroyed.')}
            </p>
          </div>
          <button
            onClick={handleRestoreDeleted}
            className="shrink-0 px-4 py-2 bg-gray-800 hover:bg-black text-white rounded-lg text-sm font-medium transition-colors"
          >
            {t('candidates.restoreAll', 'Restore all')}
          </button>
        </div>
      )}

      {/* Which cohort to look at. The roster is institution-wide, so without
          this you are staring at every exam's students at once — which is
          what made this confusing in the first place. */}
      {exams.length > 0 && (
        <div className="mb-4 flex items-center gap-3">
          <label className="text-sm text-gray-600 shrink-0">
            {t('candidates.showExam', 'Show')}
          </label>
          <select
            value={examFilter}
            onChange={(e) => setExamFilter(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">
              {t('candidates.allStudents', 'All students ({{count}})', { count: candidates.length })}
            </option>
            {exams.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.name} ({candidatesForExam(candidates, exam.id).length})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <CandidateImportModal
          onImport={handleImport}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {/* Add Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{t('candidates.addCandidate')}</h2>
            <form onSubmit={handleAddCandidate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('candidates.candidateNumber', 'رقم الطالب')} *
                </label>
                <input
                  type="text"
                  value={newCandidate.candidateNumber}
                  onChange={(e) => setNewCandidate({ ...newCandidate, candidateNumber: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('candidates.nameArabic', 'الاسم')} *
                </label>
                <input
                  type="text"
                  value={newCandidate.nameAr}
                  onChange={(e) => setNewCandidate({ ...newCandidate, nameAr: e.target.value, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  dir="rtl"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('candidates.stage', 'المرحلة')} *
                </label>
                <input
                  type="text"
                  value={newCandidate.stage}
                  onChange={(e) => setNewCandidate({ ...newCandidate, stage: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('candidates.group', 'المجموعة')}
                </label>
                <input
                  type="text"
                  value={newCandidate.group}
                  onChange={(e) => setNewCandidate({ ...newCandidate, group: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg font-medium transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium transition-colors"
                >
                  {t('common.add')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-12 text-gray-500">
          {t('common.loading')}
        </div>
      )}

      {/* Students registered on exam day. Their college IDs were typed by
          hand under time pressure, so they are held apart until an admin has
          checked them against the college's records. */}
      {!isLoading && provisionalCandidates.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-900">
            {t('candidates.provisionalTitle', 'Registered on exam day — needs checking')}
          </h2>
          <p className="text-sm text-amber-800 mt-1 mb-3">
            {t(
              'candidates.provisionalHint',
              'Check each college ID against college records before publishing results.'
            )}
          </p>
          <div className="space-y-2">
            {provisionalCandidates.map((candidate) => (
              <div
                key={candidate.id}
                className="flex items-center justify-between gap-3 bg-white rounded-lg border border-amber-200 p-3"
              >
                <div className="min-w-0">
                  <div className="font-mono font-bold text-sm">{candidate.candidateNumber}</div>
                  <div className="text-sm text-gray-800 truncate" dir="auto">{candidate.name}</div>
                  <div className="text-xs text-gray-500">
                    {candidate.registeredWhere === 'station'
                      ? t('candidates.atStation', 'at a station')
                      : t('candidates.atCheckIn', 'at check-in')}
                    {candidate.registeredBy ? ` · ${candidate.registeredBy}` : ''}
                  </div>
                </div>
                <button
                  onClick={() => confirmProvisional(candidate.id)}
                  className="shrink-0 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {t('candidates.confirmProvisional', 'ID verified')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && visibleCandidates.length === 0 && (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">👥</div>
          <p className="text-gray-500">{t('candidates.noCandidates')}</p>
        </div>
      )}

      {/* Candidate List */}
      {!isLoading && candidates.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">
                  {t('candidates.candidateNumber', 'الرقم')}
                </th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">
                  {t('candidates.nameArabic', 'الاسم')}
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">
                  {t('candidates.stage', 'المرحلة')}
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 hidden md:table-cell">
                  {t('candidates.group', 'المجموعة')}
                </th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {visibleCandidates.map((candidate) => (
                <tr key={candidate.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 font-mono text-sm">
                    {candidate.candidateNumber}
                    {candidate.provisional && (
                      <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-sans font-medium align-middle">
                        {t('candidates.unverified', 'unverified')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right" dir="rtl">
                    {candidate.nameAr || candidate.name}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {candidate.stage || '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                    {candidate.group || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(candidate.id)}
                      className="text-red-500 hover:text-red-700 p-1"
                      title={t('common.delete')}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
