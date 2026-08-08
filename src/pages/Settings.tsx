import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useSyncStore } from '../stores/syncStore';
import { useExamStore } from '../stores/examStore';
import { useCandidateStore } from '../stores/candidateStore';
import { generateTestExam, generateTestCandidates, generateQRCodeAsync } from '../services/testDataGenerator';
import { encodeQR, candidatesForExam } from '../utils/qrUtils';
import {
  downloadBackup,
  getBackupCounts,
  readBackupFile,
  restoreBackup,
  BackupParseError,
  type BackupCounts,
} from '../services/backupExporter';
import type { Candidate, ExamTemplate } from '../types';

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

// A single printable candidate badge, scoped to the exam it was printed for
function BadgeCard({ candidate, exam }: { candidate: Candidate; exam: ExamTemplate }) {
  const showArabicName = candidate.nameAr && candidate.nameAr !== candidate.name;

  return (
    <div className="badge-card border border-gray-300 rounded-lg p-3 text-center bg-white">
      <QRCodeImage text={encodeQR(exam.id, candidate.candidateNumber)} size={150} />
      <div className="font-mono text-sm font-bold">{candidate.candidateNumber}</div>
      <div className="text-sm text-gray-900 leading-snug" dir="auto">
        {candidate.name}
      </div>
      {showArabicName && (
        <div className="text-sm text-gray-700 leading-snug" dir="rtl">
          {candidate.nameAr}
        </div>
      )}
      <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-600" dir="auto">
        {exam.name}
      </div>
      {candidate.group && (
        <div className="text-xs text-gray-500">Group: {candidate.group}</div>
      )}
    </div>
  );
}

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { isOnline, pendingCount, lastSyncAt, isSyncing, syncNow, firebaseConfigured, syncError, lastSyncResult, autoSync, setAutoSync } = useSyncStore();
  const { addExam, exams, loadExams } = useExamStore();
  const { candidates, loadCandidates, importCandidates } = useCandidateStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [badgeExamId, setBadgeExamId] = useState('');
  const [backupCounts, setBackupCounts] = useState<BackupCounts | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<Date | null>(null);

  // Load candidates and exams on mount — badges need both
  useEffect(() => {
    loadCandidates();
    loadExams();
    getBackupCounts().then(setBackupCounts).catch(console.error);
  }, [loadCandidates, loadExams]);

  const handleRestoreBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset immediately so picking the same file twice still fires a change
    event.target.value = '';
    if (!file) return;

    setIsRestoring(true);
    try {
      const backup = await readBackupFile(file);

      // Show what is in the file before touching anything.
      const c = backup.counts;
      const proceed = confirm(
        t('deviceBackup.restoreConfirm', {
          defaultValue:
            'Restore from {{date}}?\n\n{{evaluations}} evaluations\n{{candidates}} candidates\n{{exams}} exams\n\nAnything already on this device is kept — nothing is overwritten.',
          date: new Date(backup.exportedAt).toLocaleString(i18n.language),
          evaluations: c.evaluations,
          candidates: c.candidates,
          exams: c.exams,
        })
      );
      if (!proceed) return;

      const summary = await restoreBackup(backup);
      await Promise.all([loadCandidates(), loadExams()]);
      setBackupCounts(await getBackupCounts());

      const line = (label: string, r: { restored: number; skipped: number }) =>
        `${label}: ${r.restored} restored, ${r.skipped} already here`;
      alert(
        [
          t('deviceBackup.restoreDone', 'Restore complete.'),
          '',
          line(t('deviceBackup.evaluations', 'evaluations'), summary.evaluations),
          line(t('deviceBackup.candidates', 'candidates'), summary.candidates),
          line(t('deviceBackup.exams', 'exams'), summary.exams),
          line(t('deviceBackup.checkIns', 'check-ins'), summary.checkIns),
        ].join('\n')
      );
    } catch (error) {
      console.error('Restore failed:', error);
      alert(
        error instanceof BackupParseError
          ? error.message
          : t('deviceBackup.restoreFailed', 'Could not restore from that file.')
      );
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDownloadBackup = async () => {
    setIsBackingUp(true);
    try {
      const counts = await downloadBackup();
      setBackupCounts(counts);
      setLastBackupAt(new Date());
    } catch (error) {
      console.error('Backup failed:', error);
      alert(t('deviceBackup.failed', 'Could not create the backup file.'));
    } finally {
      setIsBackingUp(false);
    }
  };

  // When there is only one exam it is the obvious answer, so default to it
  // rather than making the user pick from a list of one.
  const selectedBadgeExamId = badgeExamId || (exams.length === 1 ? exams[0].id : '');
  const badgeExam = exams.find((e) => e.id === selectedBadgeExamId);

  // Only the students enrolled in the chosen exam. Printing used to run over
  // every candidate in the database, so with two cohorts loaded you got
  // badges for both.
  //
  // Sorted by college ID, because the sheet gets cut into a pile and
  // IndexedDB's insertion order makes that pile useless.
  const badgeCandidates = candidatesForExam(candidates, badgeExam?.id).sort((a, b) =>
    a.candidateNumber.localeCompare(b.candidateNumber, undefined, { numeric: true })
  );

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
      const created = await addExam(testExam);

      // Enrol the test candidates in the exam they were made for
      const testCandidates = generateTestCandidates();
      await importCandidates(created.id, testCandidates);

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

  // Open the badge sheet. Badges carry the exam they belong to, so an exam
  // has to be picked before any can be generated.
  const handlePrintQRCodes = () => {
    if (badgeCandidates.length === 0) {
      alert(t('settings.noCandidatesForBadges', 'No students are enrolled in this exam yet. Import a roster for it first.'));
      return;
    }
    if (!badgeExam) {
      alert(t('settings.noExamForBadges', 'Choose which exam these badges are for. A badge is only valid for the exam printed on it.'));
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

          {/* Automatic sync. Off means the manual button below and the
              end-of-session backup are the only ways data leaves a device. */}
          <div className="flex items-start justify-between gap-3 pt-1 border-t border-gray-100">
            <div className="flex-1 pt-2">
              <div className="text-gray-900 font-medium">
                {t('settings.autoSync', 'Auto Sync')}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {autoSync
                  ? t('settings.autoSyncOn', 'Sends marks in the background whenever there is a connection. Does nothing while offline.')
                  : t('settings.autoSyncOff', 'Nothing is sent until you press Sync Now. Marks stay on this device.')}
              </p>
            </div>
            <button
              role="switch"
              aria-checked={autoSync}
              aria-label={t('settings.autoSync', 'Auto Sync')}
              onClick={() => setAutoSync(!autoSync)}
              className={`shrink-0 mt-2 relative w-12 h-7 rounded-full transition-colors ${
                autoSync ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  autoSync ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {!autoSync && pendingCount > 0 && (
            <div className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-lg p-2">
              {t('settings.autoSyncOffWarning', {
                defaultValue:
                  '{{count}} mark(s) are on this device only. Press Sync Now, or download a backup file below.',
                count: pendingCount,
              })}
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

      {/* Backup. The marks live only on this device until something syncs
          them, so this is the cheapest way to get a second copy. */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="font-semibold text-gray-900 mb-1">
          {t('deviceBackup.title', 'Backup to this device')}
        </h2>
        <p className="text-sm text-gray-600 mb-3">
          {t(
            'backup.subtitle',
            'Saves everything on this tablet to a file. Copy that file onto a laptop or USB stick — until you do, it is still only on this device.'
          )}
        </p>

        {backupCounts && (
          <div className="grid grid-cols-3 gap-2 mb-3 text-center">
            <div className="bg-gray-50 rounded-lg py-2">
              <div className="text-xl font-bold text-gray-900">{backupCounts.evaluations}</div>
              <div className="text-xs text-gray-600">{t('deviceBackup.evaluations', 'evaluations')}</div>
            </div>
            <div className="bg-gray-50 rounded-lg py-2">
              <div className="text-xl font-bold text-gray-900">{backupCounts.candidates}</div>
              <div className="text-xs text-gray-600">{t('deviceBackup.candidates', 'candidates')}</div>
            </div>
            <div className={`rounded-lg py-2 ${
              backupCounts.unsyncedEvaluations > 0 ? 'bg-orange-50' : 'bg-gray-50'
            }`}>
              <div className={`text-xl font-bold ${
                backupCounts.unsyncedEvaluations > 0 ? 'text-orange-600' : 'text-gray-900'
              }`}>
                {backupCounts.unsyncedEvaluations}
              </div>
              <div className="text-xs text-gray-600">{t('deviceBackup.notInCloud', 'not in cloud')}</div>
            </div>
          </div>
        )}

        <button
          onClick={handleDownloadBackup}
          disabled={isBackingUp}
          className="w-full bg-gray-900 hover:bg-black disabled:bg-gray-400 text-white py-3 rounded-lg font-medium transition-colors"
        >
          {isBackingUp
            ? t('common.loading', 'Saving…')
            : t('deviceBackup.download', 'Download backup file')}
        </button>

        {lastBackupAt && (
          <p className="text-xs text-green-700 mt-2 text-center">
            {t('deviceBackup.saved', 'Saved at {{time}} — now copy it off this device.', {
              time: new Intl.DateTimeFormat(i18n.language, { timeStyle: 'medium' }).format(lastBackupAt),
            })}
          </p>
        )}

        {/* Restore. Additive only, so it can be used on a replacement tablet
            without risking whatever is already on it. */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <label className="block">
            <span className="sr-only">{t('deviceBackup.restore', 'Restore from a backup file')}</span>
            <input
              type="file"
              accept="application/json,.json"
              onChange={handleRestoreBackup}
              disabled={isRestoring}
              className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-800 file:font-medium hover:file:bg-gray-200 file:cursor-pointer disabled:opacity-50"
            />
          </label>
          <p className="text-xs text-gray-500 mt-2">
            {t(
              'deviceBackup.restoreHint',
              'Restoring adds anything missing. Records already on this device are kept as they are.'
            )}
          </p>
        </div>
      </div>

      {/* Badges, and — only where it cannot do harm — test data */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="font-semibold text-gray-900 mb-3">{t('settings.testData', 'Candidate Badges')}</h2>
        <div className="space-y-3">
          {/* Hidden whenever this build can reach the real Firebase project.
              One tap creates an exam and eight candidates, and now that sync
              works those upload to the live database. On a production build
              there is no good reason to offer that next to the exam controls. */}
          {!firebaseConfigured && (
            <button
              onClick={handleGenerateTestData}
              disabled={isGenerating}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white py-2 rounded-lg font-medium transition-colors"
            >
              {isGenerating ? t('common.loading') : t('settings.generateTestData', 'Generate Test Data (Exam + Candidates)')}
            </button>
          )}
          <div className="pt-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('settings.badgeExam', 'Print badges for')}
            </label>
            {exams.length === 0 ? (
              <p className="text-sm text-gray-500 mb-2">
                {t('settings.badgeNoExams', 'No exams yet. Create an exam first — each badge is stamped with the exam it belongs to.')}
              </p>
            ) : (
              <select
                value={selectedBadgeExamId}
                onChange={(e) => setBadgeExamId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 mb-2 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">-- {t('settings.badgeSelectExam', 'Select exam')} --</option>
                {exams.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.name}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={handlePrintQRCodes}
              disabled={!badgeExam || badgeCandidates.length === 0}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-2 rounded-lg font-medium transition-colors"
            >
              {t('settings.printQRCodes', 'Print QR Codes for Candidates')} ({badgeCandidates.length})
            </button>
          </div>
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

      {/* Badge sheet. Portalled to <body> so the print stylesheet can hide the
          rest of the app and let every badge paginate. */}
      {showQRModal && badgeExam && createPortal(
        <div className="badge-sheet-root fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="badge-sheet-panel bg-white rounded-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="badge-print-hide flex items-center justify-between p-4 border-b border-gray-200">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{t('settings.qrCodes', 'Candidate QR Codes')}</h2>
                <p className="text-sm text-gray-500">
                  {t('settings.badgeSheetFor', '{{count}} badges for {{exam}}', {
                    count: badgeCandidates.length,
                    exam: badgeExam.name,
                  })}
                </p>
              </div>
              <button
                onClick={() => setShowQRModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
                aria-label={t('common.close', 'Close')}
              >
                &times;
              </button>
            </div>
            <div className="badge-sheet-scroll flex-1 overflow-y-auto p-4">
              <div className="badge-sheet grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {badgeCandidates.map((candidate) => (
                  <BadgeCard key={candidate.id} candidate={candidate} exam={badgeExam} />
                ))}
              </div>
            </div>
            <div className="badge-print-hide flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
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
        </div>,
        document.body
      )}
    </div>
  );
}
