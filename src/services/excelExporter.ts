import * as XLSX from 'xlsx';
import type {
  Evaluation,
  ExamTemplate,
  Candidate,
  Station,
  Circuit,
} from '../types';

/**
 * Export cohort results to Excel
 * Creates a comprehensive workbook with multiple sheets
 */
export function exportCohortToExcel(
  exam: ExamTemplate,
  candidates: Candidate[],
  evaluations: Evaluation[],
  circuits?: Circuit[]
): void {
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Summary (all candidates, all stations)
  const summaryData = createSummarySheet(exam, candidates, evaluations, circuits);
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // Sheet 2: Detailed scores per station
  for (const station of exam.stations) {
    const stationData = createStationSheet(station, candidates, evaluations, circuits);
    const stationSheet = XLSX.utils.aoa_to_sheet(stationData);
    const sheetName = `S${station.stationNumber} - ${station.name.substring(0, 20)}`;
    XLSX.utils.book_append_sheet(workbook, stationSheet, sheetName);
  }

  // Sheet 3: Raw data (all evaluations)
  const rawData = createRawDataSheet(exam, candidates, evaluations, circuits);
  const rawSheet = XLSX.utils.aoa_to_sheet(rawData);
  XLSX.utils.book_append_sheet(workbook, rawSheet, 'Raw Data');

  // Sheet 4: Statistics
  const statsData = createStatisticsSheet(exam, candidates, evaluations);
  const statsSheet = XLSX.utils.aoa_to_sheet(statsData);
  XLSX.utils.book_append_sheet(workbook, statsSheet, 'Statistics');

  // Download
  const filename = `${exam.name.replace(/\s+/g, '_')}_Results.xlsx`;
  XLSX.writeFile(workbook, filename);
}

/**
 * Create summary sheet with all candidates and station scores
 */
function createSummarySheet(
  exam: ExamTemplate,
  candidates: Candidate[],
  evaluations: Evaluation[],
  circuits?: Circuit[]
): (string | number)[][] {
  const rows: (string | number)[][] = [];

  // Helper to find circuit by ID
  const getCircuit = (circuitId: string) => circuits?.find((c) => c.id === circuitId);

  // Helper to get candidate's circuit (from their first evaluation)
  const getCandidateCircuit = (candidateId: string): Circuit | undefined => {
    const eval_ = evaluations.find((e) => e.candidateId === candidateId);
    return eval_ ? getCircuit(eval_.circuitId) : undefined;
  };

  // Title row
  rows.push([exam.name]);
  rows.push([`Generated: ${new Date().toLocaleDateString()}`]);
  rows.push([]); // Empty row

  // Header row
  const header = ['#', 'Candidate Number', 'Name', 'Name (Arabic)', 'Group', 'Circuit'];
  for (const station of exam.stations) {
    header.push(`S${station.stationNumber} Score`);
    header.push(`S${station.stationNumber} %`);
    if (station.globalRatingEnabled) {
      header.push(`S${station.stationNumber} Global`);
    }
    header.push(`S${station.stationNumber} Examiner`);
  }
  header.push('Total Score', 'Total Max', 'Total %', 'Result');
  rows.push(header);

  // Data rows
  let rowNum = 1;
  for (const candidate of candidates) {
    const circuit = getCandidateCircuit(candidate.id);
    const row: (string | number)[] = [
      rowNum++,
      candidate.candidateNumber,
      candidate.name,
      candidate.nameAr || '',
      candidate.group || '',
      circuit ? circuit.circuitNumber : '-',
    ];

    let totalScore = 0;
    let totalMax = 0;

    for (const station of exam.stations) {
      const evaluation = evaluations.find(
        (e) => e.candidateId === candidate.id && e.stationId === station.id
      );

      if (evaluation) {
        const pct = ((evaluation.totalScore / evaluation.maxPossibleScore) * 100).toFixed(1);
        row.push(evaluation.totalScore);
        row.push(`${pct}%`);
        if (station.globalRatingEnabled) {
          row.push(evaluation.globalRating ?? '-');
        }
        row.push(evaluation.examinerName);
        totalScore += evaluation.totalScore;
        totalMax += evaluation.maxPossibleScore;
      } else {
        row.push('-');
        row.push('-');
        if (station.globalRatingEnabled) {
          row.push('-');
        }
        row.push('-');
      }
    }

    const totalPct = totalMax > 0 ? ((totalScore / totalMax) * 100).toFixed(1) : '0';
    const passed = parseFloat(totalPct) >= 50;

    row.push(totalScore);
    row.push(totalMax);
    row.push(`${totalPct}%`);
    row.push(passed ? 'PASS' : 'FAIL');

    rows.push(row);
  }

  return rows;
}

/**
 * Create detailed station sheet with all checklist items
 */
function createStationSheet(
  station: Station,
  candidates: Candidate[],
  evaluations: Evaluation[],
  circuits?: Circuit[]
): (string | number)[][] {
  const rows: (string | number)[][] = [];

  // Helper to find circuit by ID
  const getCircuit = (circuitId: string) => circuits?.find((c) => c.id === circuitId);

  // Title
  rows.push([`Station ${station.stationNumber}: ${station.name}`]);
  rows.push([station.scenario]);
  rows.push([]); // Empty row

  // Header row
  const header = ['#', 'Candidate Number', 'Name', 'Circuit'];
  for (const item of station.checklistItems) {
    const label = item.text.length > 30 ? item.text.substring(0, 27) + '...' : item.text;
    header.push(label);
  }
  header.push('Total', 'Max', '%', 'Global Rating', 'Examiner');
  rows.push(header);

  // Max scores row
  const maxRow: (string | number)[] = ['', '', 'Max Scores:', ''];
  for (const item of station.checklistItems) {
    maxRow.push(item.maxScore);
  }
  maxRow.push('', '', '', '', '');
  rows.push(maxRow);

  // Data rows
  let rowNum = 1;
  const stationEvaluations = evaluations.filter((e) => e.stationId === station.id);

  for (const evaluation of stationEvaluations) {
    const candidate = candidates.find((c) => c.id === evaluation.candidateId);
    if (!candidate) continue;

    const circuit = getCircuit(evaluation.circuitId);
    const row: (string | number)[] = [
      rowNum++,
      candidate.candidateNumber,
      candidate.name,
      circuit ? circuit.circuitNumber : '-',
    ];

    for (const item of station.checklistItems) {
      const scoreEntry = evaluation.scores.find((s) => s.itemId === item.id);
      row.push(scoreEntry?.score ?? '-');
    }

    const pct = ((evaluation.totalScore / evaluation.maxPossibleScore) * 100).toFixed(1);
    row.push(evaluation.totalScore);
    row.push(evaluation.maxPossibleScore);
    row.push(`${pct}%`);
    row.push(evaluation.globalRating ?? '-');
    row.push(evaluation.examinerName);

    rows.push(row);
  }

  return rows;
}

/**
 * Create raw data sheet with all evaluation details
 */
function createRawDataSheet(
  exam: ExamTemplate,
  candidates: Candidate[],
  evaluations: Evaluation[],
  circuits?: Circuit[]
): (string | number)[][] {
  const rows: (string | number)[][] = [];

  // Helper to find circuit by ID
  const getCircuit = (circuitId: string) => circuits?.find((c) => c.id === circuitId);

  // Header
  rows.push([
    'Evaluation ID',
    'Candidate Number',
    'Candidate Name',
    'Circuit',
    'Station Number',
    'Station Name',
    'Total Score',
    'Max Score',
    'Percentage',
    'Global Rating',
    'Examiner',
    'Start Time',
    'End Time',
    'Notes',
    'Synced',
  ]);

  // Data
  for (const evaluation of evaluations) {
    const candidate = candidates.find((c) => c.id === evaluation.candidateId);
    const station = exam.stations.find((s) => s.id === evaluation.stationId);
    const circuit = getCircuit(evaluation.circuitId);

    const pct = ((evaluation.totalScore / evaluation.maxPossibleScore) * 100).toFixed(1);

    rows.push([
      evaluation.id,
      candidate?.candidateNumber || 'Unknown',
      candidate?.name || 'Unknown',
      circuit ? circuit.circuitNumber : '-',
      station?.stationNumber || 0,
      station?.name || 'Unknown',
      evaluation.totalScore,
      evaluation.maxPossibleScore,
      `${pct}%`,
      evaluation.globalRating ?? '-',
      evaluation.examinerName,
      evaluation.startTime ? new Date(evaluation.startTime).toLocaleString() : '',
      evaluation.endTime ? new Date(evaluation.endTime).toLocaleString() : '',
      evaluation.notes || '',
      evaluation.synced ? 'Yes' : 'No',
    ]);
  }

  return rows;
}

/**
 * Create statistics sheet
 */
function createStatisticsSheet(
  exam: ExamTemplate,
  _candidates: Candidate[],
  evaluations: Evaluation[]
): (string | number)[][] {
  const rows: (string | number)[][] = [];

  rows.push(['OSCE Exam Statistics']);
  rows.push([exam.name]);
  rows.push([`Generated: ${new Date().toLocaleDateString()}`]);
  rows.push([]);

  // Overall statistics
  rows.push(['OVERALL STATISTICS']);
  rows.push([]);

  const candidateResults = new Map<string, { total: number; max: number }>();

  for (const evaluation of evaluations) {
    const current = candidateResults.get(evaluation.candidateId) || { total: 0, max: 0 };
    current.total += evaluation.totalScore;
    current.max += evaluation.maxPossibleScore;
    candidateResults.set(evaluation.candidateId, current);
  }

  const percentages: number[] = [];
  let passCount = 0;

  for (const result of candidateResults.values()) {
    if (result.max > 0) {
      const pct = (result.total / result.max) * 100;
      percentages.push(pct);
      if (pct >= 50) passCount++;
    }
  }

  const totalCandidates = percentages.length;
  const avgScore = totalCandidates > 0
    ? percentages.reduce((a, b) => a + b, 0) / totalCandidates
    : 0;
  const minScore = totalCandidates > 0 ? Math.min(...percentages) : 0;
  const maxScore = totalCandidates > 0 ? Math.max(...percentages) : 0;
  const passRate = totalCandidates > 0 ? (passCount / totalCandidates) * 100 : 0;

  rows.push(['Metric', 'Value']);
  rows.push(['Total Candidates', totalCandidates]);
  rows.push(['Total Evaluations', evaluations.length]);
  rows.push(['Pass Rate', `${passRate.toFixed(1)}%`]);
  rows.push(['Candidates Passed', passCount]);
  rows.push(['Candidates Failed', totalCandidates - passCount]);
  rows.push(['Average Score', `${avgScore.toFixed(1)}%`]);
  rows.push(['Highest Score', `${maxScore.toFixed(1)}%`]);
  rows.push(['Lowest Score', `${minScore.toFixed(1)}%`]);
  rows.push([]);

  // Station statistics
  rows.push(['STATION STATISTICS']);
  rows.push([]);
  rows.push(['Station', 'Name', 'Evaluations', 'Avg Score', 'Min', 'Max', 'Avg Global Rating']);

  for (const station of exam.stations) {
    const stationEvals = evaluations.filter((e) => e.stationId === station.id);
    const stationPcts = stationEvals.map(
      (e) => (e.totalScore / e.maxPossibleScore) * 100
    );
    const globalRatings = stationEvals
      .filter((e) => e.globalRating !== undefined)
      .map((e) => e.globalRating!);

    const stationAvg = stationPcts.length > 0
      ? stationPcts.reduce((a, b) => a + b, 0) / stationPcts.length
      : 0;
    const stationMin = stationPcts.length > 0 ? Math.min(...stationPcts) : 0;
    const stationMax = stationPcts.length > 0 ? Math.max(...stationPcts) : 0;
    const avgGlobal = globalRatings.length > 0
      ? globalRatings.reduce((a, b) => a + b, 0) / globalRatings.length
      : 0;

    rows.push([
      station.stationNumber,
      station.name,
      stationEvals.length,
      `${stationAvg.toFixed(1)}%`,
      `${stationMin.toFixed(1)}%`,
      `${stationMax.toFixed(1)}%`,
      avgGlobal.toFixed(2),
    ]);
  }

  return rows;
}

/**
 * Export single candidate results to Excel
 */
/**
 * The circuit lists, as a spreadsheet.
 *
 * The printed sheets are for the doors; this is for everything else — sending
 * a circuit to the person running it, sorting, or merging with whatever the
 * registry keeps. Arabic names survive here, which is more than can be said
 * for the PDF path.
 *
 * Both shapes are produced, because both get used: one flat sheet of every
 * student with their circuit against their name, and then one sheet per
 * circuit matching the printed pages exactly.
 */
export function exportCircuitListsToExcel(
  exam: ExamTemplate,
  circuits: Circuit[],
  membersByCircuit: Map<string, Candidate[]>
): void {
  const workbook = XLSX.utils.book_new();
  const ordered = [...circuits].sort((a, b) => a.circuitNumber - b.circuitNumber);

  // One row per student, circuit against the name. The shape you can sort and
  // filter.
  const allRows: (string | number)[][] = [
    [exam.name],
    [`Generated: ${new Date().toLocaleDateString()}`],
    [],
    ['#', 'College ID', 'Name', 'Circuit', 'Group', 'Stage'],
  ];
  let index = 0;
  for (const circuit of ordered) {
    for (const candidate of membersByCircuit.get(circuit.id) ?? []) {
      index += 1;
      allRows.push([
        index,
        candidate.candidateNumber,
        candidate.name,
        circuit.circuitNumber,
        candidate.group ?? '',
        candidate.stage ?? '',
      ]);
    }
  }
  const allSheet = XLSX.utils.aoa_to_sheet(allRows);
  allSheet['!cols'] = [{ wch: 5 }, { wch: 14 }, { wch: 34 }, { wch: 9 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(workbook, allSheet, 'All students');

  // Then one sheet per circuit, the same content as the printed page.
  for (const circuit of ordered) {
    const members = membersByCircuit.get(circuit.id) ?? [];
    const rows: (string | number)[][] = [
      [`Circuit ${circuit.circuitNumber}${circuit.name ? ` — ${circuit.name}` : ''}`],
      [exam.name],
      [`${members.length} students`],
      [],
      ['#', 'College ID', 'Name', 'Present'],
      ...members.map((candidate, i) => [
        i + 1,
        candidate.candidateNumber,
        candidate.name,
        '',
      ]),
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = [{ wch: 5 }, { wch: 14 }, { wch: 34 }, { wch: 9 }];
    // Excel refuses sheet names over 31 characters and a handful of symbols.
    XLSX.utils.book_append_sheet(workbook, sheet, `Circuit ${circuit.circuitNumber}`);
  }

  const safeName = exam.name.replace(/[^a-zA-Z0-9؀-ۿ]+/g, '_');
  XLSX.writeFile(workbook, `${safeName}_Circuit_Lists.xlsx`);
}

export function exportCandidateToExcel(
  candidate: Candidate,
  exam: ExamTemplate,
  evaluations: Evaluation[],
  circuits?: Circuit[]
): void {
  const workbook = XLSX.utils.book_new();

  // Helper to find circuit by ID
  const getCircuit = (circuitId: string) => circuits?.find((c) => c.id === circuitId);

  const rows: (string | number)[][] = [];

  // Header
  rows.push(['Candidate Report']);
  rows.push([exam.name]);
  rows.push([]);
  rows.push(['Candidate Number', candidate.candidateNumber]);
  rows.push(['Name', candidate.name]);
  rows.push(['Name (Arabic)', candidate.nameAr || '']);
  rows.push(['Group', candidate.group || '']);
  rows.push([]);

  // Station results
  rows.push(['STATION RESULTS']);
  rows.push([]);
  rows.push(['Station', 'Name', 'Circuit', 'Score', 'Max', '%', 'Global Rating', 'Examiner']);

  let totalScore = 0;
  let totalMax = 0;

  for (const station of exam.stations) {
    const evaluation = evaluations.find((e) => e.stationId === station.id);

    if (evaluation) {
      const circuit = getCircuit(evaluation.circuitId);
      const pct = ((evaluation.totalScore / evaluation.maxPossibleScore) * 100).toFixed(1);
      rows.push([
        station.stationNumber,
        station.name,
        circuit ? circuit.circuitNumber : '-',
        evaluation.totalScore,
        evaluation.maxPossibleScore,
        `${pct}%`,
        evaluation.globalRating ?? '-',
        evaluation.examinerName,
      ]);
      totalScore += evaluation.totalScore;
      totalMax += evaluation.maxPossibleScore;
    } else {
      rows.push([station.stationNumber, station.name, '-', '-', '-', '-', '-', '-']);
    }
  }

  rows.push([]);
  const totalPct = totalMax > 0 ? ((totalScore / totalMax) * 100).toFixed(1) : '0';
  rows.push(['TOTAL', '', '', totalScore, totalMax, `${totalPct}%`, '', '']);
  rows.push(['RESULT', '', '', parseFloat(totalPct) >= 50 ? 'PASS' : 'FAIL', '', '', '', '']);

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Results');

  // Detailed scores sheet
  const detailRows: (string | number)[][] = [];
  detailRows.push(['Detailed Checklist Scores']);
  detailRows.push([]);

  for (const station of exam.stations) {
    const evaluation = evaluations.find((e) => e.stationId === station.id);
    const circuit = evaluation ? getCircuit(evaluation.circuitId) : undefined;

    const stationHeader = circuit
      ? `Station ${station.stationNumber}: ${station.name} (Circuit ${circuit.circuitNumber})`
      : `Station ${station.stationNumber}: ${station.name}`;
    detailRows.push([stationHeader]);
    detailRows.push(['Item', 'Category', 'Score', 'Max']);

    for (const item of station.checklistItems) {
      const scoreEntry = evaluation?.scores.find((s) => s.itemId === item.id);
      detailRows.push([
        item.text,
        item.category || '',
        scoreEntry?.score ?? '-',
        item.maxScore,
      ]);
    }

    if (evaluation?.notes) {
      detailRows.push(['Notes:', evaluation.notes]);
    }

    detailRows.push([]);
  }

  const detailSheet = XLSX.utils.aoa_to_sheet(detailRows);
  XLSX.utils.book_append_sheet(workbook, detailSheet, 'Detailed Scores');

  const filename = `${candidate.candidateNumber}_${exam.name.replace(/\s+/g, '_')}_Results.xlsx`;
  XLSX.writeFile(workbook, filename);
}

/**
 * Export candidates list to Excel template
 */
export function exportCandidatesTemplate(): void {
  const workbook = XLSX.utils.book_new();

  const rows = [
    ['OSCE Candidate Import Template'],
    ['Fill in the data below and import to add candidates'],
    [],
    ['candidateNumber', 'name', 'nameAr', 'group', 'stage', 'email'],
    ['2024001', 'John Smith', '', 'A', '2nd Stage', 'john@example.com'],
    ['2024002', 'Jane Doe', '', 'A', '2nd Stage', ''],
    ['2024003', 'Ahmed Hassan', 'أحمد حسن', 'B', '2nd Stage', ''],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Candidates');

  XLSX.writeFile(workbook, 'Candidate_Import_Template.xlsx');
}
