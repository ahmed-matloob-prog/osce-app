import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useExamStore } from '../stores/examStore';
import type { ExamTemplate } from '../types';
import PinModal from '../components/PinModal';
import { verifyPin, getDeviceId } from '../utils/pinUtils';

export default function Exams() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { exams, isLoading, loadExams, updateExam, deletedExams, loadDeletedExams, restoreExam } = useExamStore();

  // PIN Modal state
  const [showPinModal, setShowPinModal] = useState(false);
  const [selectedExam, setSelectedExam] = useState<ExamTemplate | null>(null);
  const [pinAction, setPinAction] = useState<'edit' | 'lock' | 'unlock'>('edit');

  useEffect(() => {
    loadExams();
    loadDeletedExams();
  }, [loadExams, loadDeletedExams]);

  // Handle exam click - check if PIN protected and locked
  const handleExamClick = (exam: ExamTemplate, e: React.MouseEvent) => {
    // If exam is PIN protected and locked, require PIN to edit
    if (exam.pinEnabled && exam.isLocked) {
      e.preventDefault();
      setSelectedExam(exam);
      setPinAction('edit');
      setShowPinModal(true);
    }
    // Otherwise, navigate normally (Link handles it)
  };

  // Handle lock/unlock button click
  const handleLockToggle = (exam: ExamTemplate, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!exam.pinEnabled) return;

    setSelectedExam(exam);
    setPinAction(exam.isLocked ? 'unlock' : 'lock');
    setShowPinModal(true);
  };

  // Handle PIN verification
  const handlePinSubmit = async (pin: string): Promise<boolean> => {
    if (!selectedExam || !selectedExam.adminPin) return false;

    const isValid = await verifyPin(pin, selectedExam.adminPin);

    if (isValid) {
      if (pinAction === 'edit') {
        // Navigate to edit page
        setShowPinModal(false);
        navigate(`/exams/${selectedExam.id}`);
      } else if (pinAction === 'lock') {
        // Lock the exam
        await updateExam(selectedExam.id, {
          isLocked: true,
          lockedAt: new Date(),
          lockedBy: getDeviceId(),
        });
        setShowPinModal(false);
        loadExams(); // Refresh list
      } else if (pinAction === 'unlock') {
        // Unlock the exam
        await updateExam(selectedExam.id, {
          isLocked: false,
          lockedAt: undefined,
          lockedBy: undefined,
        });
        setShowPinModal(false);
        loadExams(); // Refresh list
      }
      return true;
    }

    return false;
  };

  const getPinModalTitle = () => {
    switch (pinAction) {
      case 'lock':
        return t('pin.lockExam', 'Lock Exam');
      case 'unlock':
        return t('pin.unlockExam', 'Unlock Exam');
      default:
        return t('pin.enterTitle', 'Enter Admin PIN');
    }
  };

  const getPinModalSubtitle = () => {
    switch (pinAction) {
      case 'lock':
        return t('pin.lockSubtitle', 'Enter PIN to lock this exam');
      case 'unlock':
        return t('pin.unlockSubtitle', 'Enter PIN to unlock and edit');
      default:
        return t('pin.enterSubtitle', 'This exam is locked. Enter PIN to edit.');
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('exams.title')}</h1>
        </div>
        <Link
          to="/exams/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          {t('exams.createExam')}
        </Link>
      </div>

      {/* Deleted exams. Nothing is destroyed — deleting marks the record and
          hides it — so this is where a mistake gets undone. An exam template
          is hours of work; nobody should have to be brave to remove one. */}
      {deletedExams.length > 0 && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <h2 className="font-semibold text-gray-800">
            {t('exams.deletedTitle', 'Deleted exams')}
          </h2>
          <p className="text-sm text-gray-500 mt-1 mb-3">
            {t('exams.deletedHint', 'Hidden, not destroyed. Restore any of these to put it back.')}
          </p>
          <div className="space-y-2">
            {deletedExams.map((exam) => (
              <div
                key={exam.id}
                className="flex items-center justify-between gap-3 bg-white rounded-lg border border-gray-200 p-3"
              >
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 truncate" dir="auto">{exam.name}</div>
                  <div className="text-xs text-gray-500">
                    {exam.stations.length} {t('exams.stations', 'stations')}
                    {exam.deletedAt && ` · ${new Date(exam.deletedAt).toLocaleDateString()}`}
                  </div>
                </div>
                <button
                  onClick={() => restoreExam(exam.id)}
                  className="shrink-0 px-4 py-2 bg-gray-800 hover:bg-black text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {t('exams.restore', 'Restore')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-12 text-gray-500">
          {t('common.loading')}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && exams.length === 0 && (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">📋</div>
          <p className="text-gray-500 mb-4">{t('exams.noExams')}</p>
          <Link
            to="/exams/new"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            {t('exams.createExam')}
          </Link>
        </div>
      )}

      {/* Exam List */}
      {!isLoading && exams.length > 0 && (
        <div className="space-y-4">
          {exams.map((exam) => (
            <div
              key={exam.id}
              className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between">
                <Link
                  to={exam.pinEnabled && exam.isLocked ? '#' : `/exams/${exam.id}`}
                  onClick={(e) => handleExamClick(exam, e)}
                  className="flex-1"
                >
                  <div className="flex items-start gap-3">
                    {/* Lock Icon */}
                    {exam.pinEnabled && (
                      <div
                        className={`mt-1 flex-shrink-0 ${
                          exam.isLocked ? 'text-amber-500' : 'text-gray-400'
                        }`}
                      >
                        {exam.isLocked ? (
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z" />
                          </svg>
                        )}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900">{exam.name}</h3>
                      {exam.nameAr && (
                        <p className="text-gray-600 text-sm mt-1" dir="rtl">
                          {exam.nameAr}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-gray-500 text-sm">
                          {exam.stations.length} {t('exams.stations')}
                        </span>
                        {exam.pinEnabled && exam.isLocked && (
                          <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                            {t('pin.locked', 'Locked')}
                          </span>
                        )}
                        {exam.pinEnabled && !exam.isLocked && (
                          <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                            {t('pin.draft', 'Draft')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>

                <div className="flex items-center gap-2 ml-4">
                  {/* Lock/Unlock Button - only for PIN protected exams */}
                  {exam.pinEnabled && (
                    <button
                      onClick={(e) => handleLockToggle(exam, e)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        exam.isLocked
                          ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      title={exam.isLocked ? t('pin.unlockExam', 'Unlock Exam') : t('pin.lockExam', 'Lock Exam')}
                    >
                      {exam.isLocked ? (
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                          </svg>
                          {t('pin.unlock', 'Unlock')}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          {t('pin.lock', 'Lock')}
                        </span>
                      )}
                    </button>
                  )}

                  {/* Arrow indicator */}
                  <div className="text-gray-400">→</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PIN Modal */}
      <PinModal
        isOpen={showPinModal}
        onClose={() => {
          setShowPinModal(false);
          setSelectedExam(null);
        }}
        onSubmit={handlePinSubmit}
        title={getPinModalTitle()}
        subtitle={getPinModalSubtitle()}
        showForgotPin={true}
        onForgotPin={() => {
          // TODO: Implement forgot PIN flow with backup codes
          alert(t('pin.forgotPinHelp', 'Use one of your backup codes to reset your PIN.'));
        }}
      />
    </div>
  );
}
