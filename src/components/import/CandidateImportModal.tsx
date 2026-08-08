import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import { parseCandidatesFromFile } from '../../services/candidateParser';
import { useExamStore } from '../../stores/examStore';
import type { Candidate } from '../../types';

interface CandidateImportModalProps {
  onImport: (examId: string, candidates: Omit<Candidate, 'id'>[]) => void;
  onClose: () => void;
}

interface ImportResult {
  candidate: Omit<Candidate, 'id'>;
  warnings: string[];
  selected: boolean;
}

export default function CandidateImportModal({ onImport, onClose }: CandidateImportModalProps) {
  const { t } = useTranslation();
  const { exams, loadExams } = useExamStore();
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [examId, setExamId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  // With one exam there is nothing to choose
  const selectedExamId = examId || (exams.length === 1 ? exams[0].id : '');
  const selectedExam = exams.find((e) => e.id === selectedExamId);

  // The template is offered as .xlsx rather than .csv on purpose. An xlsx
  // carries its own encoding, whereas a CSV saved from Excel on an Arabic
  // Windows machine lands in the Windows-1256 codepage — the importer copes
  // with that now, but not handing out a CSV avoids the problem entirely.
  //
  // Sample IDs look like real college IDs. The previous template used 001–005,
  // which taught the wrong shape and demonstrated the trap: typing 001 into a
  // General-formatted Excel cell silently makes it the number 1.
  const downloadExcelTemplate = () => {
    // Required columns first, then the optional ones, so the shape of the
    // requirement is obvious from the sheet itself.
    const data = [
      ['الرقم', 'الاسم', 'المرحلة', 'NameEn', 'المجموعة'],
      ['2024001', 'أحمد محمد حسن', 'المرحلة الثانية', 'Ahmed M. Hassan', 'A'],
      ['2024002', 'سارة علي عبدالله', 'المرحلة الثانية', 'Sara A. Abdullah', 'A'],
      ['2024003', 'محمد عمر خالد', 'المرحلة الثانية', 'Mohammed O. Khalid', 'B'],
      ['2024004', 'فاطمة خالد ابراهيم', 'المرحلة الثانية', 'Fatima K. Ibrahim', 'B'],
      ['2024005', 'يوسف ابراهيم محمود', 'المرحلة الثانية', 'Youssef I. Mahmoud', 'A'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);

    ws['!cols'] = [
      { wch: 12 }, // الرقم
      { wch: 26 }, // الاسم
      { wch: 20 }, // المرحلة
      { wch: 22 }, // NameEn
      { wch: 12 }, // المجموعة
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الطلاب');

    XLSX.writeFile(wb, 'candidate-template.xlsx');
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setErrors([]);
    setResults([]);

    try {
      const parsed = await parseCandidatesFromFile(file);

      if (parsed.errors.length > 0) {
        setErrors(parsed.errors);
      }

      setResults(parsed.candidates.map(p => ({
        candidate: p.candidate,
        warnings: p.warnings,
        selected: true,
      })));
    } catch (err) {
      setErrors([`Failed to parse file: ${err}`]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelect = (index: number) => {
    setResults(results.map((r, i) =>
      i === index ? { ...r, selected: !r.selected } : r
    ));
  };

  const toggleSelectAll = () => {
    const allSelected = results.every(r => r.selected);
    setResults(results.map(r => ({ ...r, selected: !allSelected })));
  };

  const handleImport = () => {
    const selectedCandidates = results
      .filter(r => r.selected)
      .map(r => r.candidate);

    if (selectedCandidates.length > 0 && selectedExamId) {
      onImport(selectedExamId, selectedCandidates);
    }
  };

  const selectedCount = results.filter(r => r.selected).length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">{t('candidates.importTitle', 'Import Candidates')}</h2>
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
                <div className="font-medium text-green-800">{t('candidates.downloadTemplate', 'تحميل قالب Excel')}</div>
                <div className="text-sm text-green-600">
                  {t('candidates.templateHint', 'مطلوب: الرقم، الاسم، المرحلة — اختياري: NameEn، المجموعة')}
                </div>
                <div className="text-xs text-green-600 mt-1">
                  {t('candidates.templateFormatHint', 'احفظ الملف بصيغة Excel‏ (.xlsx) وليس CSV، حتى تُحفظ الأسماء العربية بشكل صحيح.')}
                </div>
              </div>
              <button
                onClick={downloadExcelTemplate}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                {t('candidates.downloadExcel', 'تحميل القالب')}
              </button>
            </div>
          </div>

          {/* Which exam this roster belongs to. Asked before the file, because
              a roster without an exam is what made every cohort visible to
              every exam in the first place. */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('candidates.importIntoExam', 'Import these students into')}
            </label>
            {exams.length === 0 ? (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                {t('candidates.noExamsForImport', 'Create the exam first. Students are enrolled in an exam, so there has to be one to enrol them into.')}
              </p>
            ) : (
              <select
                value={selectedExamId}
                onChange={(e) => setExamId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">-- {t('candidates.selectExam', 'Select exam')} --</option>
                {exams.map((exam) => (
                  <option key={exam.id} value={exam.id}>{exam.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* File Input */}
          <div className="mb-6">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || !selectedExam}
              className="w-full py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50 disabled:hover:border-gray-300 disabled:hover:bg-transparent transition-colors"
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  <span className="text-gray-600">{t('common.processing', 'Processing...')}</span>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-4xl mb-2">📋</div>
                  <div className="text-gray-700 font-medium">{t('candidates.clickToSelect', 'اضغط لاختيار ملف Excel')}</div>
                  <div className="text-gray-500 text-sm mt-1">
                    {t('candidates.fileFormats', 'يدعم: Excel (.xlsx) أو CSV')}
                  </div>
                </div>
              )}
            </button>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="font-medium text-red-700 mb-2">{t('common.errors', 'Errors')}</div>
              {errors.map((err, i) => (
                <div key={i} className="text-sm text-red-600">{err}</div>
              ))}
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">
                  {t('candidates.parsedCandidates', 'Parsed Candidates')} ({results.length})
                </h3>
                <div className="flex items-center gap-4">
                  <button
                    onClick={toggleSelectAll}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    {results.every(r => r.selected)
                      ? t('common.deselectAll', 'Deselect All')
                      : t('common.selectAll', 'Select All')}
                  </button>
                  <span className="text-sm text-gray-500">
                    {selectedCount} {t('common.selected', 'selected')}
                  </span>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="w-10 px-3 py-2"></th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">{t('candidates.candidateNumber', 'الرقم')}</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">{t('candidates.nameArabic', 'الاسم')}</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">{t('candidates.stage', 'المرحلة')}</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600 hidden md:table-cell">{t('candidates.group', 'المجموعة')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result, index) => (
                      <tr
                        key={index}
                        className={`border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 ${
                          result.selected ? 'bg-blue-50' : ''
                        }`}
                        onClick={() => toggleSelect(index)}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={result.selected}
                            onChange={() => toggleSelect(index)}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600"
                          />
                        </td>
                        <td className="px-3 py-2 font-mono">{result.candidate.candidateNumber}</td>
                        <td className="px-3 py-2 text-right" dir="rtl">{result.candidate.nameAr}</td>
                        <td className="px-3 py-2 text-gray-600">{result.candidate.stage || '-'}</td>
                        <td className="px-3 py-2 text-gray-600 hidden md:table-cell">{result.candidate.group || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-900"
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            onClick={handleImport}
            disabled={selectedCount === 0 || !selectedExam}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            {t('candidates.importCount', `Import ${selectedCount} Candidate${selectedCount !== 1 ? 's' : ''}`, { count: selectedCount })}{selectedExam ? ` → ${selectedExam.name}` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
