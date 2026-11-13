import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import type { Candidate, Circuit, ExamTemplate } from '../types';
import { exportCircuitListsToExcel } from '../services/excelExporter';
import { useExamStore } from '../stores/examStore';
import { useDeviceStore } from '../stores/deviceStore';
import { cardCode, cardUrl, newCardSecret } from '../utils/stationCard';

interface PrintedCard {
  key: string;
  circuitNumber: number;
  stationLabel: string;
  code: string;
  qr: string;
}

/**
 * One station card per station per circuit, grouped a circuit to a page so
 * each circuit's set can be handed to whoever lays that circuit out.
 */
function useStationCards(exam: ExamTemplate, circuits: Circuit[], enabled: boolean) {
  const updateExam = useExamStore((s) => s.updateExam);
  const [cards, setCards] = useState<Map<string, PrintedCard[]> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      // An exam that has never had cards gets its secret now. It must reach
      // the cloud before a phone can check a card, which updateExam starts.
      let secret = exam.cardSecret;
      if (!secret) {
        secret = newCardSecret();
        await updateExam(exam.id, { cardSecret: secret });
      }
      const stations = [...exam.stations].sort((a, b) => a.stationNumber - b.stationNumber);
      const out = new Map<string, PrintedCard[]>();
      for (const circuit of circuits) {
        const list: PrintedCard[] = [];
        for (const station of stations) {
          const code = await cardCode(secret, exam.id, circuit.circuitNumber, station.id);
          const url = cardUrl(window.location.origin, {
            examId: exam.id,
            circuitNumber: circuit.circuitNumber,
            stationId: station.id,
            code,
          });
          list.push({
            key: `${circuit.id}:${station.id}`,
            circuitNumber: circuit.circuitNumber,
            stationLabel: station.name,
            code,
            qr: await QRCode.toDataURL(url, { margin: 1, width: 320, errorCorrectionLevel: 'M' }),
          });
        }
        out.set(circuit.id, list);
      }
      if (!cancelled) setCards(out);
    })();
    return () => {
      cancelled = true;
    };
    // The exam's secret is read once; regenerating mid-render would void
    // cards already on the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, exam.id, circuits]);

  return cards;
}

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

  const [ordered] = useState(() =>
    [...circuits].sort((a, b) => a.circuitNumber - b.circuitNumber)
  );
  const total = ordered.reduce(
    (sum, c) => sum + (membersByCircuit.get(c.id)?.length ?? 0),
    0
  );

  // Cards are for whoever runs the exam. A check-in desk sees the lists only.
  const isAdmin = useDeviceStore((s) => s.assignment.role === 'admin');
  const [mode, setMode] = useState<'lists' | 'cards'>('lists');
  const cards = useStationCards(exam, ordered, isAdmin && mode === 'cards');
  const liveExam = useExamStore((s) => s.exams.find((e) => e.id === exam.id)) ?? exam;

  return createPortal(
    <div className="circuit-sheet-root fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="circuit-sheet-panel bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="circuit-print-hide flex flex-wrap items-center gap-3 p-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {mode === 'cards' ? t('card.sheetTitle') : t('circuitList.title')}
            </h2>
            <p className="text-sm text-gray-500">
              {mode === 'cards'
                ? t('card.sheetSummary', {
                    circuits: ordered.length,
                    stations: exam.stations.length,
                  })
                : t('circuitList.summary', { circuits: ordered.length, students: total })}
            </p>
          </div>
          {isAdmin && (
            <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
              {(['lists', 'cards'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-2 font-medium ${
                    mode === m ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {m === 'lists' ? t('circuitList.title') : t('card.sheetTitle')}
                </button>
              ))}
            </div>
          )}
          {mode === 'lists' && (
            <button
              onClick={() => exportCircuitListsToExcel(exam, ordered, membersByCircuit)}
              className="ml-auto border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg font-medium"
            >
              {t('circuitList.excel')}
            </button>
          )}
          <button
            onClick={() => window.print()}
            disabled={mode === 'cards' && !cards}
            className={`${mode === 'cards' ? 'ml-auto ' : ''}bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg font-medium`}
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
          {mode === 'cards' && !liveExam.openForExamining && (
            <p className="circuit-print-hide text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
              {t('card.examClosedWarning')}
            </p>
          )}
          {mode === 'cards' && !cards && (
            <p className="circuit-print-hide text-sm text-gray-500">{t('card.preparing')}</p>
          )}
          {mode === 'cards' &&
            cards &&
            ordered.map((circuit) => (
              <section key={circuit.id} className="circuit-page">
                <div className="grid grid-cols-2 gap-4">
                  {(cards.get(circuit.id) ?? []).map((card) => (
                    <div
                      key={card.key}
                      className="station-card border-2 border-gray-800 rounded-xl p-4 text-center"
                    >
                      <p className="text-xs text-gray-600 truncate">{exam.name}</p>
                      <p className="text-lg font-bold text-blue-800 mt-1">
                        {t('device.circuitN', { number: card.circuitNumber })}
                      </p>
                      <p className="text-xl font-bold text-gray-900 leading-tight">
                        <bdi>{card.stationLabel}</bdi>
                      </p>
                      <img
                        src={card.qr}
                        alt={t('card.qrAlt', {
                          number: card.circuitNumber,
                          station: card.stationLabel,
                        })}
                        className="mx-auto mt-2 w-40 h-40"
                      />
                      <p className="text-[11px] text-gray-700 mt-1 leading-snug">
                        {t('card.printedHowTo')}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1 font-mono">{card.code}</p>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          {mode === 'lists' && ordered.map((circuit) => {
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
                          <td className="py-1"><bdi>{candidate.name}</bdi></td>
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
