import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { Candidate, Circuit, ExamTemplate } from '../types';
import { exportCircuitListsToExcel } from '../services/excelExporter';

/**
 * A printable list of who belongs in each circuit.
 *
 * One sheet per circuit, to be handed to whoever runs that circuit's door. It
 * is also the paper fallback: if a tablet dies mid-exam, the circuit still
 * knows who it is expecting and there is a tick column to work down.
 *
 * ── Printed by the browser, not by jsPDF ────────────────────────────────────
 *
 * The names on these sheets are Arabic. jsPDF's built-in fonts cannot represent
 * Arabic at all — the cohort PDF renders every student as mojibake — and making
 * it work means embedding a font and shaping the text by hand. The browser
 * already does both perfectly, so the sheet is real HTML and printing it is
 * File → Print → Save as PDF. Same approach as the badges.
 */
interface CircuitListSheetProps {
  exam: ExamTemplate;
  circuits: Circuit[];
  /** Who is assigned where: circuitId -> the students in it, already ordered. */
  membersByCircuit: Map<string, Candidate[]>;
  onClose: () => void;
}

export default function CircuitListSheet({
  exam,
  circuits,
  membersByCircuit,
  onClose,
}: CircuitListSheetProps) {
  const { t } = useTranslation();
  const today = new Date().toLocaleDateString();

  const ordered = [...circuits].sort((a, b) => a.circuitNumber - b.circuitNumber);
  const total = ordered.reduce(
    (sum, c) => sum + (membersByCircuit.get(c.id)?.length ?? 0),
    0
  );

  return createPortal(
    <div className="circuit-sheet-root fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="circuit-sheet-panel bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="circuit-print-hide flex items-center gap-3 p-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{t('circuitList.title')}</h2>
            <p className="text-sm text-gray-500">
              {t('circuitList.summary', { circuits: ordered.length, students: total })}
            </p>
          </div>
          <button
            onClick={() => exportCircuitListsToExcel(exam, ordered, membersByCircuit)}
            className="ml-auto border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg font-medium"
          >
            {t('circuitList.excel')}
          </button>
          <button
            onClick={() => window.print()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
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

        <div className="circuit-sheet-scroll flex-1 overflow-auto p-4 space-y-6">
          {ordered.map((circuit) => {
            const members = membersByCircuit.get(circuit.id) ?? [];
            return (
              <section key={circuit.id} className="circuit-page">
                <header className="flex items-baseline justify-between border-b-2 border-gray-800 pb-2 mb-3">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">
                      {t('device.circuitN', { number: circuit.circuitNumber })}
                      {circuit.name ? ` — ${circuit.name}` : ''}
                    </h3>
                    <p className="text-sm text-gray-600">{exam.name}</p>
                  </div>
                  <div className="text-right text-sm text-gray-600">
                    <div>{today}</div>
                    <div className="font-semibold">
                      {t('circuitList.studentCount', { count: members.length })}
                    </div>
                  </div>
                </header>

                {members.length === 0 ? (
                  <p className="text-sm text-gray-500 py-3">{t('circuitList.empty')}</p>
                ) : (
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-gray-400 text-left">
                        <th className="py-1 w-10">#</th>
                        <th className="py-1 w-28">{t('circuitList.collegeId')}</th>
                        <th className="py-1">{t('circuitList.name')}</th>
                        {/* Blank, for working down on paper if a tablet fails. */}
                        <th className="py-1 w-20 text-center">{t('circuitList.present')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((candidate, i) => (
                        <tr key={candidate.id} className="border-b border-gray-200">
                          <td className="py-1 text-gray-500">{i + 1}</td>
                          <td className="py-1 font-mono">{candidate.candidateNumber}</td>
                          <td className="py-1">{candidate.name}</td>
                          <td className="py-1 text-center text-gray-300">☐</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
