import { v4 as uuidv4 } from 'uuid';
import type { Station, ChecklistItem, StationType, ScoringOption } from '../types';

interface ParsedStation {
  station: Partial<Station>;
  warnings: string[];
}

/**
 * Build scoring options from separate score columns
 */
function buildScoringOptions(score1: string, score2: string, score3: string): { options: ScoringOption[]; maxScore: number } {
  const values: number[] = [];

  // Parse each score column
  [score1, score2, score3].forEach(s => {
    const val = parseInt(s?.trim(), 10);
    if (!isNaN(val)) {
      values.push(val);
    }
  });

  // Default if no valid scores
  if (values.length === 0) {
    return {
      options: [
        { value: 2, label: 'Competent', labelAr: 'كفء' },
        { value: 1, label: 'Borderline', labelAr: 'حدّي' },
        { value: 0, label: 'Incompetent', labelAr: 'غير كفء' },
      ],
      maxScore: 2,
    };
  }

  // Sort descending
  values.sort((a, b) => b - a);
  const maxScore = values[0];

  const options: ScoringOption[] = values.map((value, index) => {
    let label: string;
    let labelAr: string;

    if (values.length === 2) {
      // Binary scoring
      label = value > 0 ? 'Done' : 'Not done';
      labelAr = value > 0 ? 'تم' : 'لم يتم';
    } else {
      // Multi-level
      if (index === 0) {
        label = 'Competent';
        labelAr = 'كفء';
      } else if (index === values.length - 1) {
        label = 'Incompetent';
        labelAr = 'غير كفء';
      } else {
        label = 'Borderline';
        labelAr = 'حدّي';
      }
    }

    return { value, label, labelAr };
  });

  return { options, maxScore };
}

/**
 * Parse CSV content to array of rows
 */
function parseCSV(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentCell += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentCell.trim());
        if (currentRow.some(cell => cell)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
        if (char === '\r') i++;
      } else if (char !== '\r') {
        currentCell += char;
      }
    }
  }

  currentRow.push(currentCell.trim());
  if (currentRow.some(cell => cell)) {
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Parse CSV file to stations
 */
export function parseCSVStations(content: string): ParsedStation[] {
  const rows = parseCSV(content);

  if (rows.length < 2) {
    return [{ station: {}, warnings: ['CSV file is empty or has no data rows'] }];
  }

  // Get headers (first row) - find all columns dynamically
  const headers = rows[0].map(h => h.toLowerCase().trim());

  const findCol = (keywords: string[]) => {
    return headers.findIndex(h => keywords.some(k => h.includes(k)));
  };

  // Find all columns from headers
  const itemCol = findCol(['item']);
  const sectionCol = findCol(['section']);
  const score1Col = findCol(['score1']);
  const score2Col = findCol(['score2']);
  const score3Col = findCol(['score3']);

  const colIndex = {
    station: findCol(['station']) >= 0 ? findCol(['station']) : 0,
    name: findCol(['name']) >= 0 ? findCol(['name']) : 1,
    type: findCol(['type']) >= 0 ? findCol(['type']) : 2,
    time: findCol(['time']) >= 0 ? findCol(['time']) : 3,
    scenario: findCol(['scenario']) >= 0 ? findCol(['scenario']) : 4,
    task1: findCol(['task1']) >= 0 ? findCol(['task1']) : 5,
    task2: findCol(['task2']) >= 0 ? findCol(['task2']) : 6,
    task3: findCol(['task3']) >= 0 ? findCol(['task3']) : 7,
    section: sectionCol >= 0 ? sectionCol : 8,
    item: itemCol >= 0 ? itemCol : 9,
    score1: score1Col >= 0 ? score1Col : 11,
    score2: score2Col >= 0 ? score2Col : 12,
    score3: score3Col >= 0 ? score3Col : 13,
  };

  // Group data by station number
  const stationMap = new Map<number, {
    name: string;
    type: StationType;
    time: number;
    scenario: string;
    tasks: string[];
    findings: string;
    items: ChecklistItem[];
  }>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row.some(cell => cell)) continue;

    // Get cell value safely
    const getCell = (idx: number) => (idx >= 0 && idx < row.length) ? row[idx] || '' : '';

    const stationNum = parseInt(getCell(colIndex.station), 10) || 1;
    const isNewStation = !stationMap.has(stationNum);

    // Initialize station if new
    if (isNewStation) {
      const name = getCell(colIndex.name);
      const typeStr = getCell(colIndex.type).toLowerCase();
      const type = ['history', 'examination', 'procedure', 'communication'].includes(typeStr)
        ? typeStr as StationType
        : 'history';
      const time = parseInt(getCell(colIndex.time), 10) || 10;
      const scenario = getCell(colIndex.scenario);

      // Collect tasks from task1, task2, task3 columns
      const tasks: string[] = [];
      [colIndex.task1, colIndex.task2, colIndex.task3].forEach(idx => {
        const task = getCell(idx);
        if (task) tasks.push(task);
      });

      stationMap.set(stationNum, {
        name,
        type,
        time,
        scenario,
        tasks,
        findings: '',  // Populated from "exam" section rows
        items: [],
      });

      // Skip item parsing on the first row of each station (metadata only)
      continue;
    }

    // Parse row content (items start from row 2 of each station)
    const itemText = getCell(colIndex.item);
    const section = getCell(colIndex.section).toLowerCase();
    const score1 = getCell(colIndex.score1);
    const score2 = getCell(colIndex.score2);
    const score3 = getCell(colIndex.score3);
    const hasScores = score1 || score2 || score3;

    // Check if this is an examination findings row (section = "exam" with NO scores)
    if (section.includes('exam') && !section.includes('ddx') && !hasScores) {
      // This row contains examination findings, not a checklist item
      if (itemText) {
        const stationData = stationMap.get(stationNum)!;
        // Append to existing findings or set new
        stationData.findings = stationData.findings
          ? stationData.findings + '\n' + itemText
          : itemText;
      }
      continue;
    }

    // Parse checklist item
    if (itemText) {
      const { options, maxScore } = buildScoringOptions(score1, score2, score3);

      // DDX section goes after findings, everything else before
      const position: 'before_findings' | 'after_findings' =
        section.includes('ddx') || section.includes('differential') || section.includes('diagnosis')
          ? 'after_findings'
          : 'before_findings';

      const item: ChecklistItem = {
        id: uuidv4(),
        text: itemText,
        category: getCell(colIndex.section),
        scoringOptions: options,
        maxScore,
        position,
      };

      stationMap.get(stationNum)!.items.push(item);
    }
  }

  // Convert to results
  const results: ParsedStation[] = [];

  for (const [stationNum, data] of stationMap) {
    const station: Partial<Station> = {
      id: uuidv4(),
      stationNumber: stationNum,
      stationType: data.type,
      name: data.name || `Station ${stationNum}`,
      scenario: data.scenario,
      tasks: data.tasks.length > 0 ? data.tasks : [''],
      timeLimit: data.time * 60,
      checklistItems: data.items,
      examinationFindings: data.findings,
      globalRatingEnabled: true,
    };

    const warnings: string[] = [];
    if (!data.name) warnings.push('No station name');
    if (!data.scenario) warnings.push('No scenario');
    if (data.items.length === 0) warnings.push('No checklist items');

    results.push({ station, warnings });
  }

  results.sort((a, b) => (a.station.stationNumber || 0) - (b.station.stationNumber || 0));

  return results;
}

/**
 * Parse CSV file from File object
 */
export async function parseCSVFileFromFile(file: File): Promise<ParsedStation[]> {
  const content = await file.text();
  return parseCSVStations(content);
}
