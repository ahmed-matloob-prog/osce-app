import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useExamStore } from '../stores/examStore';

export default function Exams() {
  const { t } = useTranslation();
  const { exams, isLoading, loadExams } = useExamStore();

  useEffect(() => {
    loadExams();
  }, [loadExams]);

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
            <Link
              key={exam.id}
              to={`/exams/${exam.id}`}
              className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{exam.name}</h3>
                  {exam.nameAr && (
                    <p className="text-gray-600 text-sm mt-1" dir="rtl">
                      {exam.nameAr}
                    </p>
                  )}
                  <p className="text-gray-500 text-sm mt-2">
                    {exam.stations.length} {t('exams.stations')}
                  </p>
                </div>
                <div className="text-gray-400">→</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
