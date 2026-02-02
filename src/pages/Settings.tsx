import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSyncStore } from '../stores/syncStore';
import { useExamStore } from '../stores/examStore';
import { useCandidateStore } from '../stores/candidateStore';
import { generateTestExam, generateTestCandidates, generateQRCodeAsync } from '../services/testDataGenerator';

// QR Code Image component that loads async
function QRCodeImage({ text, size = 150 }: { text: string; size?: number }) {
  const [src, setSrc] = useState<string>('');

  useEffect(() => {
    generateQRCodeAsync(text, size).then(setSrc).catch(console.error);
  }, [text, size]);

  if (!src) {
    return (
      <div
        className="mx-auto mb-2 bg-gray-100 flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return <img src={src} alt={`QR for ${text}`} className="mx-auto mb-2" />;
}

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { isOnline, pendingCount, lastSyncAt, isSyncing, syncNow, firebaseConfigured, syncError, lastSyncResult } = useSyncStore();
  const { addExam } = useExamStore();
  const { candidates, loadCandidates, importCandidates } = useCandidateStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);

  // Load candidates on mount for QR code generation
  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  const formatDate = (date: Date | undefined) => {
    if (!date) return t('sync.never');
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date);
  };

  // Generate test data
  const handleGenerateTestData = async () => {
    setIsGenerating(true);
    try {
      // Generate and add test exam
      const testExam = generateTestExam();
      await addExam(testExam);

      // Generate and add test candidates
      const testCandidates = generateTestCandidates();
      await importCandidates(testCandidates);

      // Reload candidates
      await loadCandidates();

      alert('Test data generated successfully!\n- 1 Exam with 3 stations\n- 8 Test candidates');
    } catch (error) {
      console.error('Failed to generate test data:', error);
      alert('Failed to generate test data');
    } finally {
      setIsGenerating(false);
    }
  };

  // Print QR codes
  const handlePrintQRCodes = () => {
    if (candidates.length === 0) {
      alert('No candidates found. Please add candidates first or generate test data.');
      return;
    }
    setShowQRModal(true);
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('settings.title')}</h1>

      {/* Language */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="font-semibold text-gray-900 mb-3">{t('settings.language')}</h2>
        <div className="flex gap-2">
          <button
            onClick={() => changeLanguage('en')}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
              i18n.language === 'en'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t('settings.english')}
          </button>
          <button
            onClick={() => changeLanguage('ar')}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
              i18n.language === 'ar'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t('settings.arabic')}
          </button>
        </div>
      </div>

      {/* Sync Status */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="font-semibold text-gray-900 mb-3">{t('settings.syncStatus')}</h2>

        <div className="space-y-3">
          {/* Firebase Status */}
          <div className="flex items-center justify-between">
            <span className="text-gray-600">{t('settings.cloudSync', 'Cloud Sync')}</span>
            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
              firebaseConfigured
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                firebaseConfigured ? 'bg-blue-500' : 'bg-gray-400'
              }`} />
              {firebaseConfigured ? t('settings.enabled', 'Enabled') : t('settings.disabled', 'Disabled')}
            </span>
          </div>

          {/* Online Status */}
          <div className="flex items-center justify-between">
            <span className="text-gray-600">{t('sync.online')}/{t('sync.offline')}</span>
            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
              isOnline
                ? 'bg-green-100 text-green-700'
                : 'bg-orange-100 text-orange-700'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-green-500' : 'bg-orange-500'
              }`} />
              {isOnline ? t('sync.online') : t('sync.offline')}
            </span>
          </div>

          {/* Pending Items */}
          <div className="flex items-center justify-between">
            <span className="text-gray-600">{t('settings.pendingItems')}</span>
            <span className={`font-medium ${pendingCount > 0 ? 'text-orange-600' : 'text-gray-900'}`}>
              {pendingCount}
            </span>
          </div>

          {/* Last Sync */}
          <div className="flex items-center justify-between">
            <span className="text-gray-600">{t('settings.lastSync')}</span>
            <span className="text-gray-900">{formatDate(lastSyncAt)}</span>
          </div>

          {/* Last Sync Result */}
          {lastSyncResult && (
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2">
              {t('settings.lastSyncDetails', 'Last sync: {{evals}} evaluations, {{added}} exams added, {{updated}} exams updated', {
                evals: lastSyncResult.evaluationsSynced,
                added: lastSyncResult.examsAdded,
                updated: lastSyncResult.examsUpdated,
              })}
            </div>
          )}

          {/* Sync Error */}
          {syncError && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2">
              {t('settings.syncError', 'Sync error: {{error}}', { error: syncError })}
            </div>
          )}

          {/* Sync Button */}
          <button
            onClick={() => syncNow()}
            disabled={!isOnline || isSyncing}
            className="w-full mt-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            {isSyncing && (
              <span className="sync-spinning">↻</span>
            )}
            {isSyncing ? t('sync.syncing') : t('settings.syncNow')}
          </button>

          {/* Firebase Setup Hint */}
          {!firebaseConfigured && (
            <p className="text-xs text-gray-500 text-center">
              {t('settings.firebaseHint', 'To enable cloud sync, add Firebase config to .env file')}
            </p>
          )}
        </div>
      </div>

      {/* Test Data & QR Codes */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="font-semibold text-gray-900 mb-3">{t('settings.testData', 'Test Data & QR Codes')}</h2>
        <div className="space-y-3">
          <button
            onClick={handleGenerateTestData}
            disabled={isGenerating}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white py-2 rounded-lg font-medium transition-colors"
          >
            {isGenerating ? t('common.loading') : t('settings.generateTestData', 'Generate Test Data (Exam + Candidates)')}
          </button>
          <button
            onClick={handlePrintQRCodes}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium transition-colors"
          >
            {t('settings.printQRCodes', 'Print QR Codes for Candidates')} ({candidates.length})
          </button>
        </div>
      </div>

      {/* App Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 mb-3">{t('common.appName')}</h2>
        <div className="text-sm text-gray-600">
          <p>Version: 1.0.0</p>
          <p className="mt-1">OSCE Examination App for Clinical Assessment</p>
        </div>
      </div>

      {/* QR Code Modal */}
      {showQRModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">{t('settings.qrCodes', 'Candidate QR Codes')}</h2>
              <button
                onClick={() => setShowQRModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 print:grid-cols-4">
                {candidates.map((candidate) => (
                  <div key={candidate.id} className="border border-gray-200 rounded-lg p-3 text-center">
                    <QRCodeImage text={candidate.candidateNumber} size={150} />
                    <div className="font-mono text-sm font-bold">{candidate.candidateNumber}</div>
                    <div className="text-xs text-gray-600 truncate" dir="rtl">{candidate.nameAr || candidate.name}</div>
                    <div className="text-xs text-gray-500">{candidate.group || ''}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowQRModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                {t('common.close', 'Close')}
              </button>
              <button
                onClick={() => window.print()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
              >
                {t('common.print', 'Print')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
