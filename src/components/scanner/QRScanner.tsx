import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';

interface QRScannerProps {
  onScan: (result: string) => void;
  onError?: (error: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onScan, onError, onClose }: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isStarting, setIsStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');

  useEffect(() => {
    // Get available cameras
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length > 0) {
          setCameras(devices.map((d) => ({ id: d.id, label: d.label || `Camera ${d.id}` })));
          // Prefer back camera
          const backCamera = devices.find(
            (d) => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear')
          );
          setSelectedCamera(backCamera?.id || devices[0].id);
        } else {
          setError('No cameras found on this device');
          setIsStarting(false);
        }
      })
      .catch((err) => {
        setError(`Camera access error: ${err.message || err}`);
        setIsStarting(false);
      });

    return () => {
      // Cleanup scanner on unmount
      if (scannerRef.current) {
        const state = scannerRef.current.getState();
        if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
          scannerRef.current.stop().catch(console.error);
        }
      }
    };
  }, []);

  // Start scanner when camera is selected
  useEffect(() => {
    if (!selectedCamera) return;

    const scannerId = 'qr-scanner-container';

    // Create scanner instance
    scannerRef.current = new Html5Qrcode(scannerId);

    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0,
    };

    setIsStarting(true);
    setError(null);

    scannerRef.current
      .start(
        selectedCamera,
        config,
        (decodedText) => {
          // Success - stop scanner and call callback
          if (scannerRef.current) {
            scannerRef.current.stop().then(() => {
              onScan(decodedText);
            }).catch(console.error);
          }
        },
        () => {
          // QR code not found in frame - this is normal, don't show error
        }
      )
      .then(() => {
        setIsStarting(false);
      })
      .catch((err) => {
        setError(`Failed to start scanner: ${err.message || err}`);
        setIsStarting(false);
        onError?.(`Failed to start scanner: ${err.message || err}`);
      });

    return () => {
      if (scannerRef.current) {
        const state = scannerRef.current.getState();
        if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
          scannerRef.current.stop().catch(console.error);
        }
      }
    };
  }, [selectedCamera, onScan, onError]);

  const handleCameraChange = (cameraId: string) => {
    // Stop current scanner before switching
    if (scannerRef.current) {
      const state = scannerRef.current.getState();
      if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
        scannerRef.current.stop().then(() => {
          setSelectedCamera(cameraId);
        }).catch(console.error);
      } else {
        setSelectedCamera(cameraId);
      }
    } else {
      setSelectedCamera(cameraId);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Scan QR Code</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Camera selector */}
        {cameras.length > 1 && (
          <div className="px-4 pt-3">
            <select
              value={selectedCamera}
              onChange={(e) => handleCameraChange(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {cameras.map((camera) => (
                <option key={camera.id} value={camera.id}>
                  {camera.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Scanner container */}
        <div className="p-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm mb-4">
              {error}
            </div>
          )}

          {/* Scanner container - must always be visible for html5-qrcode to work */}
          <div className="relative">
            {isStarting && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg z-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-3 text-gray-600">Starting camera...</span>
              </div>
            )}
            <div
              id="qr-scanner-container"
              className="w-full"
              style={{ minHeight: '300px' }}
            />
          </div>
        </div>

        {/* Instructions */}
        <div className="px-4 pb-4 text-center text-sm text-gray-500">
          Point camera at the candidate's QR badge
        </div>

        {/* Manual entry fallback */}
        <div className="border-t border-gray-200 p-4">
          <button
            onClick={onClose}
            className="w-full py-2 text-gray-600 hover:text-gray-900 text-sm"
          >
            Enter candidate number manually instead
          </button>
        </div>
      </div>
    </div>
  );
}
