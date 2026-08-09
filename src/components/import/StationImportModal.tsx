import { useState, useRef } from 'react';
import { parseMultipleDocuments } from '../../services/wordParser';
import { parseTextFileFromFile } from '../../services/textParser';
import { parseCSVFileFromFile, parseExcelStationsFromFile } from '../../services/csvParser';
import type { Station } from '../../types';

interface StationImportModalProps {
  onImport: (stations: Partial<Station>[]) => void;
  onClose: () => void;
}

interface ImportResult {
  station: Partial<Station>;
  rawText: string;
  warnings: string[];
  selected: boolean;
}

export default function StationImportModal({ onImport, onClose }: StationImportModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showRawText, setShowRawText] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsLoading(true);
    setError(null);
    setResults([]);

    try {
      const allResults: ImportResult[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = file.name.toLowerCase();

        if (fileName.endsWith('.csv')) {
          // Parse CSV/Excel file
          const parsed = await parseCSVFileFromFile(file);
          allResults.push(...parsed.map(p => ({
            station: p.station,
            rawText: '',
            warnings: p.warnings,
            selected: true,
          })));
        } else if (fileName.endsWith('.txt')) {
          // Parse text file
          const parsed = await parseTextFileFromFile(file);
          allResults.push(...parsed.map(p => ({
            station: p.station,
            rawText: '',
            warnings: p.warnings,
            selected: true,
          })));
        } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
          // The picker has always offered Excel; nothing used to handle it,
          // so choosing a workbook produced no stations and no error.
          const parsed = await parseExcelStationsFromFile(file);
          allResults.push(...parsed.map(p => ({
            station: p.station,
            rawText: '',
            warnings: p.warnings,
            selected: true,
          })));
        } else if (fileName.endsWith('.docx')) {
          // Parse Word document
          const parsed = await parseMultipleDocuments(files);
          allResults.push(...parsed.map(p => ({ ...p, selected: true })));
          break; // parseMultipleDocuments handles all files at once
        }
      }

      if (allResults.length === 0) {
        setError(
          'No stations found in that file. Check it matches the expected format — ' +
          'a .txt needs STATION_NAME: markers, a spreadsheet needs Station and Item columns.'
        );
      }
      setResults(allResults);
    } catch (err) {
      setError(`Failed to parse documents: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelect = (index: number) => {
    setResults(results.map((r, i) =>
      i === index ? { ...r, selected: !r.selected } : r
    ));
  };

  const handleImport = () => {
    const selectedStations = results
      .filter(r => r.selected)
      .map(r => r.station);

    if (selectedStations.length > 0) {
      onImport(selectedStations);
    }
  };

  const selectedCount = results.filter(r => r.selected).length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Import Stations</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Template Download */}
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-green-800">Download Excel/CSV Template (Recommended)</div>
                <div className="text-sm text-green-600">Easy to fill in Excel, just add rows for each item</div>
              </div>
              <button
                onClick={() => window.open('/station-template.csv', '_blank')}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                Download CSV
              </button>
            </div>
          </div>

          {/* File Input */}
          <div className="mb-6">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.docx,.txt"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="w-full py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors"
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  <span className="text-gray-600">Processing documents...</span>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-4xl mb-2">📊</div>
                  <div className="text-gray-700 font-medium">Click to select files</div>
                  <div className="text-gray-500 text-sm mt-1">
                    Supports: <span className="font-medium text-green-600">.csv</span> (recommended), .txt, or .docx
                  </div>
                </div>
              )}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">
                  Parsed Stations ({results.length})
                </h3>
                <span className="text-sm text-gray-500">
                  {selectedCount} selected for import
                </span>
              </div>

              {results.map((result, index) => (
                <div
                  key={index}
                  className={`border rounded-lg overflow-hidden ${
                    result.selected ? 'border-blue-300 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  {/* Station Header */}
                  <div
                    className="flex items-center gap-3 p-3 cursor-pointer"
                    onClick={() => toggleSelect(index)}
                  >
                    <input
                      type="checkbox"
                      checked={result.selected}
                      onChange={() => toggleSelect(index)}
                      className="w-5 h-5 rounded border-gray-300 text-blue-600"
                    />
                    <div className="flex-1">
                      <div className="font-medium">
                        Station {result.station.stationNumber}: {result.station.name || 'Untitled'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {result.station.checklistItems?.length || 0} checklist items •{' '}
                        {result.station.stationType} •{' '}
                        {result.station.tasks?.filter(t => t).length || 0} tasks
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowRawText(showRawText === index ? null : index);
                      }}
                      className="text-sm text-blue-600 hover:text-blue-700 px-2 py-1"
                    >
                      {showRawText === index ? 'Hide' : 'Preview'}
                    </button>
                  </div>

                  {/* Warnings */}
                  {result.warnings.length > 0 && (
                    <div className="px-3 pb-2">
                      {result.warnings.map((w, i) => (
                        <div key={i} className="text-xs text-amber-600">
                          ⚠️ {w}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Preview */}
                  {showRawText === index && (
                    <div className="border-t border-gray-200 p-3 bg-gray-50">
                      <div className="text-sm">
                        <h4 className="font-medium text-gray-700 mb-2">Extracted Data:</h4>
                        <div className="space-y-2">
                          <div>
                            <span className="text-gray-500">Scenario:</span>
                            <p className="text-gray-900">{result.station.scenario || '-'}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Tasks:</span>
                            <ul className="list-disc list-inside text-gray-900">
                              {result.station.tasks?.filter(t => t).map((t, i) => (
                                <li key={i}>{t}</li>
                              ))}
                            </ul>
                          </div>
                          {result.station.examinationFindings && (
                            <div>
                              <span className="text-gray-500">Examination Findings:</span>
                              <p className="text-gray-900 text-xs whitespace-pre-wrap">{result.station.examinationFindings}</p>
                            </div>
                          )}
                          <div>
                            <span className="text-gray-500">Checklist Items ({result.station.checklistItems?.length || 0}):</span>
                            <ul className="text-gray-900 space-y-1 mt-1 max-h-40 overflow-auto">
                              {result.station.checklistItems?.map((item, i) => (
                                <li key={i} className="text-xs bg-white px-2 py-1 rounded border">
                                  <span className="font-mono text-blue-600">[{item.scoringOptions.map(o => o.value).join('/')}]</span>{' '}
                                  {item.text}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={selectedCount === 0}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            Import {selectedCount} Station{selectedCount !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
