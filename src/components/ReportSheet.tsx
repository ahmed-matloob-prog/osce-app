import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { Candidate, Circuit, Evaluation, ExamTemplate } from '../types';
import { GLOBAL_RATING_LABELS } from '../types';

/**
 * The results, printable.
 *
 * These reports were built with jsPDF, whose built-in fonts cannot represent
 * Arabic at all: every student's name came out as mojibake — `þæþ´þ£ þªþäþ¤þã`
 * where `إبراهيم محمد حسن` should be. College IDs and scores were fine, which
 * is what made it easy to miss. On a roster where every name is Arabic, that is
 * not a results document.
 *
 * Making jsPDF do it means embedding a font and reshaping the text by hand.
 * The browser already does both, correctly, including right-to-left — so the
 * report is real HTML and "save as PDF" is the browser's print dialog. The
 * badges and circuit lists take the same route for the same reason.
 */
export type ReportKind = 'cohort' | 'candidate' | 'station';

interface ReportSheetProps {
  kind: ReportKind;
  exam: ExamTemplate;
  candidates: Candidate[];
  evaluations: Evaluation[];
  circuits: Circuit[];
  /** Only for the candidate report. */
  candidate?: Candidate;
  /** Only for the station report — one mark, item by item. */
  evaluation?: Evaluation;
  onClose: () => void;
}

const pct = (score: number, max: number) => (max > 0 ? Math.round((score / max) * 100) : 0);

const ratingLabel = (rating?: number): string =>
  rating === undefined
    ? ''
    : (GLOBAL_RATING_LABELS as Record<number, string>)[rating] ?? '';

export default function ReportSheet({
  kind,
  exam,
  candidates,
  evaluations,
  circuits,
  candidate,
  evaluation,
  onClose,
}: ReportSheetProps) {
  const { t } = useTranslation();
  const today = new Date().toLocaleDateString();
  const stations = [...exam.stations].sort((a, b) => a.stationNumber - b.stationNumber);

  /**
   * The mark that counts for a student at a station.
   *
   * A student can have more than one — a mark is write-once, so correcting one
   * means adding another. The latest wins here, which is what a re-score means,
   * and the report flags every such case separately so a person can check.
   */
  const markFor = (candidateId: string, stationId: string): Evaluation | undefined =>
    evaluations
      .filter((e) => e.candidateId === candidateId && e.stationId === stationId)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())[0];

  const circuitOf = (candidateId: string) => {
    const anyMark = evaluations.find((e) => e.candidateId === candidateId);
    return circuits.find((c) => c.id === anyMark?.circuitId)?.circuitNumber;
  };

  const totalsFor = (candidateId: string) => {
    let score = 0;
    let max = 0;
    for (const station of stations) {
      const mark = markFor(candidateId, station.id);
      if (!mark) continue;
      score += mark.totalScore;
      max += mark.maxPossibleScore;
    }
    return { score, max, percent: pct(score, max) };
  };

  const header = (
    <header className="border-b-2 border-gray-800 pb-2 mb-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xl font-bold text-gray-900">
          {kind === 'cohort'
            ? t('reports.cohortReport')
            : kind === 'station'
              ? t('reports.stationReportTitle')
              : t('reports.candidateReport')}
        </h3>
        <span className="text-sm text-gray-600">{today}</span>
      </div>
      <p className="text-gray-700">{exam.name}</p>
    </header>
  );

  return createPortal(
    <div className="circuit-sheet-root fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="circuit-sheet-panel bg-white rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col">
        <div className="circuit-print-hide flex items-center gap-3 p-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{t('reports.printTitle')}</h2>
            <p className="text-sm text-gray-500">{t('reports.printHint')}</p>
          </div>
          <button
            onClick={() => window.print()}
            className="ml-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
          >
            {t('circuitList.print')}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
          >
            {t('common.close', 'Close')}
          </button>
        </div>

        <div className="circuit-sheet-scroll flex-1 overflow-auto p-6">
          <section className="circuit-page">
            {header}

            {kind === 'station' ? (
              // One mark, item by item. This is the document an appeal reads:
              // what was asked, what was given, and what the examiner wrote.
              (() => {
                if (!evaluation || !candidate) return null;
                const station = stations.find((st) => st.id === evaluation.stationId);
                const scoreOf = (itemId: string) =>
                  evaluation.scores.find((sc) => sc.itemId === itemId)?.score ?? -1;
                return (
                  <>
                    <div className="mb-4 text-sm">
                      <div className="text-lg font-semibold text-gray-900"><bdi>{candidate.name}</bdi></div>
                      <div className="font-mono text-gray-700">{candidate.candidateNumber}</div>
                      <div className="text-gray-700 mt-1">
                        {station ? `${station.stationNumber}. ${station.name}` : evaluation.stationId}
                      </div>
                      {/* An Arabic examiner name next to a Latin date drags
                          the date around it — the browser reorders the whole
                          run. Each is isolated, and they are on separate lines,
                          because this document can end up in an appeal. */}
                      <div className="text-gray-600">
                        {t('reports.examiner')}: <bdi>{evaluation.examinerName}</bdi>
                      </div>
                      <div className="text-gray-600" dir="ltr">
                        {new Date(evaluation.startTime).toLocaleString()}
                      </div>
                    </div>

                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-gray-400 text-left">
                          <th className="py-1">{t('reports.checklistItem')}</th>
                          <th className="py-1 w-24 text-center">{t('reports.score')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(station?.checklistItems ?? []).map((item) => {
                          const value = scoreOf(item.id);
                          return (
                            <tr key={item.id} className="border-b border-gray-200">
                              <td className="py-1">{item.text}</td>
                              <td className="py-1 text-center">
                                {value >= 0 ? `${value}/${item.maxScore}` : '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <div className="mt-4 pt-3 border-t-2 border-gray-800 flex items-baseline justify-between">
                      <span className="font-semibold">
                        {t('reports.total')}: {evaluation.totalScore}/{evaluation.maxPossibleScore} (
                        {pct(evaluation.totalScore, evaluation.maxPossibleScore)}%)
                      </span>
                      {evaluation.globalRating !== undefined && (
                        <span>
                          {t('reports.global')}: {evaluation.globalRating}/4{' '}
                          {ratingLabel(evaluation.globalRating)}
                        </span>
                      )}
                    </div>

                    {evaluation.notes?.trim() && (
                      <div className="mt-4 text-sm">
                        <div className="font-medium text-gray-900">{t('reports.notes')}</div>
                        <p className="text-gray-700 whitespace-pre-wrap">{evaluation.notes}</p>
                      </div>
                    )}
                  </>
                );
              })()
            ) : kind === 'cohort' ? (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-400 text-left">
                    <th className="py-1 w-8">#</th>
                    <th className="py-1 w-24">{t('circuitList.collegeId')}</th>
                    <th className="py-1">{t('circuitList.name')}</th>
                    <th className="py-1 w-14 text-center">{t('reports.circuitShort')}</th>
                    {stations.map((s) => (
                      <th key={s.id} className="py-1 w-16 text-center">
                        {`S${s.stationNumber}`}
                      </th>
                    ))}
                    <th className="py-1 w-20 text-center">{t('reports.total')}</th>
                    <th className="py-1 w-16 text-center">{t('reports.result')}</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c, i) => {
                    const totals = totalsFor(c.id);
                    return (
                      <tr key={c.id} className="border-b border-gray-200">
                        <td className="py-1 text-gray-500">{i + 1}</td>
                        <td className="py-1 font-mono">{c.candidateNumber}</td>
                        <td className="py-1"><bdi>{c.name}</bdi></td>
                        <td className="py-1 text-center">{circuitOf(c.id) ?? '-'}</td>
                        {stations.map((s) => {
                          const mark = markFor(c.id, s.id);
                          return (
                            <td key={s.id} className="py-1 text-center">
                              {mark
                                ? `${pct(mark.totalScore, mark.maxPossibleScore)}%`
                                : '-'}
                            </td>
                          );
                        })}
                        <td className="py-1 text-center font-medium">
                          {totals.max > 0 ? `${totals.score}/${totals.max}` : '-'}
                        </td>
                        <td className="py-1 text-center font-semibold">
                          {totals.max > 0 ? (totals.percent >= 50 ? 'PASS' : 'FAIL') : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              candidate && (
                <>
                  <div className="mb-4 text-sm">
                    <div className="text-lg font-semibold text-gray-900"><bdi>{candidate.name}</bdi></div>
                    <div className="font-mono text-gray-700">{candidate.candidateNumber}</div>
                    {candidate.stage && <div className="text-gray-600">{candidate.stage}</div>}
                  </div>

                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-gray-400 text-left">
                        <th className="py-1">{t('reports.station')}</th>
                        <th className="py-1 w-16 text-center">{t('reports.circuitShort')}</th>
                        <th className="py-1 w-20 text-center">{t('reports.score')}</th>
                        <th className="py-1 w-14 text-center">%</th>
                        <th className="py-1 w-24 text-center">{t('reports.global')}</th>
                        <th className="py-1 w-40">{t('reports.examiner')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stations.map((s) => {
                        const mark = markFor(candidate.id, s.id);
                        const circuitNumber = circuits.find(
                          (c) => c.id === mark?.circuitId
                        )?.circuitNumber;
                        return (
                          <tr key={s.id} className="border-b border-gray-200">
                            <td className="py-1">
                              {s.stationNumber}. {s.name}
                            </td>
                            <td className="py-1 text-center">{circuitNumber ?? '-'}</td>
                            <td className="py-1 text-center">
                              {mark ? `${mark.totalScore}/${mark.maxPossibleScore}` : '-'}
                            </td>
                            <td className="py-1 text-center">
                              {mark ? `${pct(mark.totalScore, mark.maxPossibleScore)}%` : '-'}
                            </td>
                            <td className="py-1 text-center">
                              {mark?.globalRating !== undefined
                                ? `${mark.globalRating}/4 ${ratingLabel(mark.globalRating)}`
                                : '-'}
                            </td>
                            <td className="py-1"><bdi>{mark?.examinerName ?? '-'}</bdi></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {(() => {
                    const totals = totalsFor(candidate.id);
                    return (
                      <div className="mt-4 pt-3 border-t-2 border-gray-800 flex items-baseline justify-between">
                        <span className="font-semibold">
                          {t('reports.total')}: {totals.score}/{totals.max} ({totals.percent}%)
                        </span>
                        <span className="text-lg font-bold">
                          {totals.max > 0 ? (totals.percent >= 50 ? 'PASS' : 'FAIL') : '-'}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Examiner notes belong on a candidate's own report — they
                      are the part a student or an appeal actually reads. */}
                  {stations.map((s) => {
                    const mark = markFor(candidate.id, s.id);
                    if (!mark?.notes?.trim()) return null;
                    return (
                      <div key={s.id} className="mt-4 text-sm">
                        <div className="font-medium text-gray-900">
                          {s.stationNumber}. {s.name} — {t('reports.notes')}
                        </div>
                        <p className="text-gray-700 whitespace-pre-wrap">{mark.notes}</p>
                      </div>
                    );
                  })}
                </>
              )
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
}
