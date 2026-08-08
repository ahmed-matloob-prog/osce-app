import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCandidateStore } from '../stores/candidateStore';
import type { Candidate } from '../types';

interface ManualRegistrationModalProps {
  /** The exam this student is being registered into. */
  examId: string;
  /** Where this is being used, recorded on the record for later checking. */
  registeredWhere: 'station' | 'check-in';
  /** Examiner name or device id, so a questionable entry can be traced back. */
  registeredBy: string;
  onCancel: () => void;
  /** Called with the new record, or with the existing student if the college
      ID turned out to be taken. */
  onRegistered: (candidate: Candidate) => void;
}

/**
 * Late registration: a student turns up who is not on the imported roster.
 *
 * Deliberately never refuses. A real student standing at a station has to be
 * scoreable, so this creates a provisional record and lets the exam continue;
 * an admin verifies the typed college ID afterwards.
 */
export default function ManualRegistrationModal({
  examId,
  registeredWhere,
  registeredBy,
  onCancel,
  onRegistered,
}: ManualRegistrationModalProps) {
  const { t } = useTranslation();
  const { registerProvisional } = useCandidateStore();

  const [candidateNumber, setCandidateNumber] = useState('');
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [group, setGroup] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [clash, setClash] = useState<Candidate | null>(null);

  const canSubmit = candidateNumber.trim() !== '' && name.trim() !== '' && !isSaving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSaving(true);
    setClash(null);
    try {
      const result = await registerProvisional({
        examId,
        candidateNumber,
        name,
        nameAr,
        group,
        registeredBy,
        registeredWhere,
      });

      if (result.status === 'already-exists') {
        // Not an error — most likely the student was on the roster all along
        // and the examiner searched for the wrong thing. Offer them.
        setClash(result.candidate);
        return;
      }

      onRegistered(result.candidate);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-gray-900">
          {t('manualEntry.title', 'Register a student')}
        </h2>
        <p className="text-sm text-gray-600 mt-1 mb-5">
          {t(
            'manualEntry.subtitle',
            'For a student who is not on the roster. They can be scored straight away; an admin checks the college ID afterwards.'
          )}
        </p>

        {clash ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
              <div className="text-amber-800 text-sm mb-3">
                {t('manualEntry.clash', 'That college ID already belongs to:')}
              </div>
              <div className="font-semibold text-gray-900" dir="auto">{clash.name}</div>
              {clash.nameAr && clash.nameAr !== clash.name && (
                <div className="text-gray-700" dir="rtl">{clash.nameAr}</div>
              )}
              <div className="font-mono text-sm text-gray-600 mt-1">{clash.candidateNumber}</div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setClash(null)}
                className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                {t('manualEntry.editDetails', 'Change the ID')}
              </button>
              <button
                onClick={() => onRegistered(clash)}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors"
              >
                {t('manualEntry.useExisting', 'Use this student')}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('manualEntry.collegeId', 'College ID')} *
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={candidateNumber}
                onChange={(e) => setCandidateNumber(e.target.value)}
                placeholder="2024001"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('manualEntry.collegeIdHint', 'Copy it exactly from the student’s college card.')}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('manualEntry.name', 'Name')} *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                dir="auto"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('manualEntry.nameAr', 'Name in Arabic')}
              </label>
              <input
                type="text"
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                dir="rtl"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('manualEntry.group', 'Group')}
              </label>
              <input
                type="text"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={onCancel}
                className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-colors"
              >
                {isSaving ? t('common.loading', 'Saving…') : t('manualEntry.register', 'Register')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
