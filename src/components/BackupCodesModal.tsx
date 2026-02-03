import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { copyBackupCodesToClipboard } from '../utils/pinUtils';

interface BackupCodesModalProps {
  isOpen: boolean;
  onClose: () => void;
  codes: string[];
  examName: string;
}

export default function BackupCodesModal({
  isOpen,
  onClose,
  codes,
  examName,
}: BackupCodesModalProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleCopy = async () => {
    try {
      await copyBackupCodesToClipboard(codes);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleConfirmAndClose = () => {
    if (confirmed) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
        {/* Header */}
        <div className="p-6 text-center bg-gradient-to-r from-green-500 to-emerald-600">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white">
            {t('backup.title', 'Exam Created Successfully!')}
          </h2>
          <p className="text-white/80 text-sm mt-1">{examName}</p>
        </div>

        {/* Warning Banner */}
        <div className="bg-amber-50 border-b border-amber-100 px-6 py-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <svg
                className="w-5 h-5 text-amber-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div>
              <p className="text-amber-800 font-medium text-sm">
                {t('backup.warning', 'Save these backup codes somewhere safe')}
              </p>
              <p className="text-amber-700 text-xs mt-1">
                {t(
                  'backup.warningDetail',
                  "You won't see them again. Each code can only be used once to reset your PIN."
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Backup Codes */}
        <div className="p-6">
          <div className="bg-gray-50 rounded-xl p-4 font-mono text-sm">
            {codes.map((code, index) => (
              <div
                key={index}
                className="flex items-center justify-between py-2 border-b border-gray-200 last:border-0"
              >
                <span className="text-gray-400 text-xs">{index + 1}.</span>
                <span className="text-gray-900 font-semibold tracking-wider">
                  {code}
                </span>
              </div>
            ))}
          </div>

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className={`w-full mt-4 py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
              copied
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            {copied ? (
              <>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                {t('backup.copied', 'Copied!')}
              </>
            ) : (
              <>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                  />
                </svg>
                {t('backup.copy', 'Copy to Clipboard')}
              </>
            )}
          </button>

          {/* Confirmation Checkbox */}
          <label className="flex items-start gap-3 mt-6 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              className="mt-1 w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600">
              {t(
                'backup.confirmSaved',
                "I have saved these backup codes in a safe place"
              )}
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          <button
            onClick={handleConfirmAndClose}
            disabled={!confirmed}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold transition-colors"
          >
            {t('backup.done', "I've Saved Them")}
          </button>
        </div>
      </div>
    </div>
  );
}
