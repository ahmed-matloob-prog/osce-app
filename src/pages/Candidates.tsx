import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCandidateStore } from '../stores/candidateStore';
import CandidateImportModal from '../components/import/CandidateImportModal';
import type { Candidate } from '../types';

export default function Candidates() {
  const { t } = useTranslation();
  const { candidates, isLoading, loadCandidates, importCandidates, addCandidate, deleteCandidate, clearAll, confirmProvisional } = useCandidateStore();
  // Filtered in JS rather than by index — IndexedDB has no boolean key type
  const provisionalCandidates = candidates.filter((c) => c.provisional);
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
  }, [loadCandidates]);

  const handleImport = async (candidatesToImport: Omit<Candidate, 'id'>[]) => {
    const { added, skipped } = await importCandidates(candidatesToImport);

    // Always say what was skipped. A silent "import successful" after every
    // row was skipped is how you find out on exam morning that you loaded
    // the wrong file.
    let message = t('candidates.importSuccess', { count: added });
    if (skipped.length > 0) {
      const shown = skipped.slice(0, 10).join(', ');
      const more = skipped.length > 10 ? ` … +${skipped.length - 10}` : '';
      message += `\n\n${t('candidates.importSkipped', {
        count: skipped.length,
        defaultValue: '{{count}} already on the roster and left unchanged:',
      })}\n${shown}${more}`;
    }
    alert(message);
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
    if (confirm('هل تريد حذف جميع الطلاب؟ / Delete all candidates?')) {
      await clearAll();
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
      {!isLoading && candidates.length === 0 && (
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
              {candidates.map((candidate) => (
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
