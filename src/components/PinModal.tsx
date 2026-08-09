import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

interface PinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (pin: string) => Promise<boolean>;
  title?: string;
  subtitle?: string;
  maxLength?: number;
  minLength?: number;
  showForgotPin?: boolean;
  onForgotPin?: () => void;
  mode?: 'verify' | 'create' | 'confirm';
  confirmPin?: string; // For confirm mode - the PIN to match
}

export default function PinModal({
  isOpen,
  onClose,
  onSubmit,
  title,
  subtitle,
  maxLength = 6,
  minLength = 4,
  showForgotPin = false,
  onForgotPin,
  mode = 'verify',
  confirmPin,
}: PinModalProps) {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [shake, setShake] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError('');
      setIsLoading(false);
    }
  }, [isOpen]);

  const handleDigitPress = (digit: string) => {
    if (pin.length < maxLength) {
      setPin(prev => prev + digit);
      setError('');
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const handleClear = () => {
    setPin('');
    setError('');
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleSubmit = useCallback(async () => {
    if (pin.length < minLength) {
      setError(t('pin.tooShort', 'PIN must be at least {{min}} digits', { min: minLength }));
      triggerShake();
      return;
    }

    // For confirm mode, check if PINs match
    if (mode === 'confirm' && confirmPin && pin !== confirmPin) {
      setError(t('pin.mismatch', 'PINs do not match'));
      triggerShake();
      setPin('');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const success = await onSubmit(pin);
      if (!success) {
        setError(t('pin.incorrect', 'Incorrect PIN'));
        triggerShake();
        setPin('');
      }
    } catch {
      setError(t('pin.error', 'An error occurred'));
      triggerShake();
    } finally {
      setIsLoading(false);
    }
  }, [pin, minLength, mode, confirmPin, onSubmit, t]);

  // Keyboard input. Declared after handleSubmit so it can depend on it —
  // listing it earlier would read the binding before initialisation.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9' && pin.length < maxLength) {
        setPin(prev => prev + e.key);
        setError('');
      } else if (e.key === 'Backspace') {
        setPin(prev => prev.slice(0, -1));
        setError('');
      } else if (e.key === 'Enter' && pin.length >= minLength) {
        handleSubmit();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, pin, maxLength, minLength, onClose, handleSubmit]);

  // Auto-submit at full length in verify mode, so a six-digit PIN needs no
  // extra tap. Shorter PINs use the button above.
  useEffect(() => {
    if (mode === 'verify' && pin.length === maxLength) {
      handleSubmit();
    }
  }, [pin, maxLength, mode, handleSubmit]);

  if (!isOpen) return null;

  const getTitle = () => {
    if (title) return title;
    switch (mode) {
      case 'create':
        return t('pin.createTitle', 'Create Admin PIN');
      case 'confirm':
        return t('pin.confirmTitle', 'Confirm PIN');
      default:
        return t('pin.enterTitle', 'Enter Admin PIN');
    }
  };

  const getSubtitle = () => {
    if (subtitle) return subtitle;
    switch (mode) {
      case 'create':
        return t('pin.createSubtitle', 'Choose a {{min}}-{{max}} digit PIN', { min: minLength, max: maxLength });
      case 'confirm':
        return t('pin.confirmSubtitle', 'Re-enter your PIN to confirm');
      default:
        return t('pin.enterSubtitle', 'Enter your PIN to continue');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-xl">
        {/* Header */}
        <div className="p-6 text-center border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">{getTitle()}</h2>
          <p className="text-sm text-gray-500 mt-1">{getSubtitle()}</p>
        </div>

        {/* PIN Display */}
        <div className="p-6">
          <div
            className={`flex justify-center gap-3 mb-4 ${shake ? 'animate-shake' : ''}`}
          >
            {Array.from({ length: maxLength }).map((_, i) => (
              <div
                key={i}
                className={`w-12 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all ${
                  i < pin.length
                    ? 'border-blue-500 bg-blue-50 text-blue-600'
                    : i === pin.length
                    ? 'border-blue-300 bg-white'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                {i < pin.length ? '•' : ''}
              </div>
            ))}
          </div>

          {/* Error Message */}
          {error && (
            <p className="text-center text-red-500 text-sm mb-4">{error}</p>
          )}

          {/* Numeric Keypad */}
          <div className="grid grid-cols-3 gap-3">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
              <button
                key={digit}
                onClick={() => handleDigitPress(digit)}
                disabled={isLoading}
                className="h-14 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-xl font-semibold text-gray-800 transition-colors disabled:opacity-50"
              >
                {digit}
              </button>
            ))}
            <button
              onClick={handleClear}
              disabled={isLoading || pin.length === 0}
              className="h-14 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-sm font-medium text-gray-600 transition-colors disabled:opacity-50"
            >
              {t('pin.clear', 'Clear')}
            </button>
            <button
              onClick={() => handleDigitPress('0')}
              disabled={isLoading}
              className="h-14 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-xl font-semibold text-gray-800 transition-colors disabled:opacity-50"
            >
              0
            </button>
            <button
              onClick={handleBackspace}
              disabled={isLoading || pin.length === 0}
              className="h-14 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-xl font-semibold text-gray-600 transition-colors disabled:opacity-50"
            >
              ←
            </button>
          </div>

          {/* Submit.
              Shown in verify mode too. It used to be hidden there, on the
              assumption that the auto-submit below would carry it — but that
              only fires at the maximum length, and a PIN may be as short as
              four digits. Anyone who chose four or five could enter it and
              then have no way to send it: no button, and Enter is no help on a
              tablet with no keyboard. */}
          <button
            onClick={handleSubmit}
            disabled={isLoading || pin.length < minLength}
            className="w-full mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <span className="animate-spin">↻</span>
            ) : mode === 'create' ? (
              t('pin.setPin', 'Set PIN')
            ) : mode === 'confirm' ? (
              t('pin.confirm', 'Confirm')
            ) : (
              t('pin.unlock', 'Unlock')
            )}
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-gray-500 hover:text-gray-700 text-sm font-medium"
          >
            {t('common.cancel', 'Cancel')}
          </button>

          {showForgotPin && onForgotPin && (
            <button
              onClick={onForgotPin}
              disabled={isLoading}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              {t('pin.forgot', 'Forgot PIN?')}
            </button>
          )}
        </div>
      </div>

      {/* CSS for shake animation */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
}
